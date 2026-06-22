# Thought Process — QueueCure Architecture & Engineering Decisions

This document details the engineering, architectural, and design choices made during the development of the QueueCure real-time clinic queue management system, built for Queue Cure '26 by Wooble Software.

---

## 1. Concurrency & Locking

Clinic queue updates are subject to race conditions, particularly when multiple receptionists handle checkout/advance actions, or when network retry mechanisms trigger duplicate requests.

To solve this, both `callNext` and `markDone` implement a **Redis-based atomic Mutex lock** using `SET NX`:
- Prior to any state mutation, the server attempts to write to key `lock:{clinicId}` with a 3-second Time-To-Live (TTL).
- If the write succeeds (returns `OK`), the lock is acquired. The server performs the queue mutations, saves the updated state atomically, and releases the lock.
- If the write returns `null` (lock already held), the server immediately rejects the request with `{ error: 'busy' }`.
- The mutation is wrapped in `try...finally` to guarantee lock release even if an exception is thrown, preventing a 3-second lockout.

---

## 2. PostgreSQL Persistent Auditing

As clinics scale, keeping hundreds of checked-out or skipped patients in Redis would bloat memory usage and make queries for past history logs inefficient. 
We partitioned patient data storage:
- **Redis (Fast / Volatile State)**: Handles the active waiting and serving queue. It supports high-frequency reads and writes for real-time screens.
- **PostgreSQL (Structured / Persistent State)**: Completed and skipped patients are logged to the `patient_history` table. This keeps Redis small and guarantees long-term durability of historical logs.
- **Rest API (`GET /api/history`)**: The receptionist retrieves this history on demand. Converting epoch timestamps correctly on the client-side prevents "Invalid Date" parsing issues while preserving numeric epoch sorting speed.

---

## 3. Dynamic Wait Time Estimation

Rather than hardcoding wait times or relying on a static setting, QueueCure computes an estimated wait range from **real consultation duration data**:

- **Rolling Average**: The last 10 completed consultations are stored in `consultHistory`. The mean of this history is used as the per-patient time estimate.
- **Bootstrapping**: If fewer than 3 real data points exist (new clinic, fresh day), the system defaults to the receptionist-defined `avgConsultTime` fallback.
- **Range Display**: Showing a range (`~12–20 min`) sets realistic expectations rather than a false single-point estimate that will always be wrong.
- **Formula**: `estimated = position × avg`, where `margin = estimated × 0.40`. The displayed range is `[round(estimated - margin), round(estimated + margin)]`.
- **Data Source Label**: The patient view shows whether the estimate is based on real data ("Based on N real consultations") or the fallback ("Based on receptionist estimate"), building trust through transparency.

---

## 4. Double-Confirmation Danger Zone Resets

Reinitializing a queue or resetting token sequences back to 1 is a destructive operation. If a receptionist clicks it accidentally during active clinic hours, it would wipe the current session.
- **Double Confirmation state hook**: Clicking "Reset Queue & Tokens" toggles a `showResetConfirm` flag in UI. The button changes styling to an alert red danger banner displaying "⚠️ Click again to confirm reset!" with a "Cancel" button.
- **Socket event authentication**: The server requires the receptionist's security PIN validation on the `reset-queue` socket event before clearing Redis keys, preventing unauthorized queue manipulation.

---

## 5. Priority Queue

Real clinics must handle emergencies, elderly patients, and pre-booked appointments differently:

- A `priority: boolean` field is added to the `Patient` type.
- After every `addPatient` call, the queue is re-sorted with `applyPrioritySort()`:
  - Serving patients remain at position 0 (unchanged).
  - Priority waiting patients are sorted to the front of the waiting group.
  - Normal waiting patients follow.
  - Done and skipped patients are appended at the end.
- This is a stable sort — patients within each group retain their relative arrival order.
- All screens (receptionist, display, patient) show a `⚡` badge on priority tokens.

---

## 6. Edge Cases Handled

- **Empty queue on call-next**: Returns `{ error: 'empty' }` which fires a `queue-error` event, doing nothing to state.
- **All patients skipped**: Active queue shows empty state gracefully; skipped patient log renders at the bottom of the receptionist console.
- **Network drop**: Socket.IO automatically reconnects. On reconnect, the client re-emits `join-clinic`, which triggers a `state-sync` with the full current state from Redis.
- **Server restart**: Queue state is persisted in Redis, preventing any data loss upon restarts.
- **0 consultation history**: Uses the `avgConsultTime` fallback (default 10 minutes) set by the receptionist.
- **Cancellable 5s undo window**: `undoTimeouts` map stores the `setTimeout` reference per clinic. A new `call-next` before expiry cancels the previous timeout and starts a fresh 5s window. `undo-call` checks the map and rejects if the window has expired.
- **Queue paused**: `isPaused` flag in state blocks `callNext` at the server level. The display screen shows a fullscreen overlay. The patient view shows a banner. The receptionist's "Call Next" button is disabled.
- **Recall without advancing**: `recallToken` re-emits `token-called` with `isRecall: true`. The display plays a different chime pattern (double beep vs single). The patient view does not re-trigger position-change logic.

---

## 7. Architectural Decisions

### Socket.IO over Raw WebSockets
Socket.IO provides automatic reconnection with exponential backoff, room-based broadcasting (so `clinic-001` events never leak to `clinic-002`), event-based messaging with named payloads, and middleware support. Raw WebSockets would require building all of this manually.

### Redis over In-Memory State
In-memory stores are lost on server restart and cannot be shared across horizontal replicas. Redis provides:
- **Persistence**: Queue survives server crashes.
- **Atomic operations**: `SET NX` enables correct mutex semantics.
- **Horizontal scalability**: Multiple server instances can share a single Redis store (with Socket.IO Redis adapter for room broadcasts).

The codebase includes a `InMemoryRedis` fallback class for development without a Redis server, maintaining the same interface.

### PWA over React Native / Native App
Patients are handed a QR code. A PWA means:
- Zero friction: scan → open browser → track. No App Store, no APK.
- Installable on home screen if desired.
- Service worker enables an offline shell with cached UI.
- Works on any OS (iOS, Android, feature phones with modern browsers).

### Mark Done vs. Auto-Done on Call-Next
The original implementation marked the previous patient as done implicitly when `call-next` fired. This had a flaw: if the doctor finished with a patient but wasn't ready to call the next one immediately (writing notes, sanitising, etc.), the wait time estimation would accumulate idle time into `consultHistory`, inflating estimates.

The explicit **"Mark as Done"** button lets the receptionist record the true consultation end time, keeping `consultHistory` accurate.

---

## 8. Privacy Design Decisions

- **No patient names on /display**: The TV screen shows only token numbers and wait times. Any bystander or visitor in the waiting room should not be able to identify who is being called or their position. This is a deliberate HIPAA-aligned design choice.
- **Names only on /receptionist and /patient**: The receptionist needs names for coordination. The patient's own mobile view shows their name (they scanned their own QR code).
- **No phone numbers on any display**: Phone numbers are stored server-side for potential future SMS/WhatsApp notifications but never emitted to the display or patient view of other patients.

---

## 9. Future Scope

- **Multi-Doctor / Room Routing**: Support multiple active doctors and consult rooms under a single clinic dashboard. Each doctor would have their own "Call Next" button and serving slot.
- **SMS / WhatsApp Alerts**: Notify patients when they are next in line if they close the browser. Integrate Twilio or the WhatsApp Business API.
- **Analytics Dashboard**: Provide clinics with reports on peak hours, patient load per day, busiest days of week, and average consult times per doctor.
- **Appointment Booking Integration**: Allow patients to pre-book a slot; the booking creates a priority token with a pre-assigned time window.
- **Multi-Clinic SaaS**: Each clinic gets a unique `clinicId`. The receptionist login becomes clinic-specific, and the display URL includes the `clinicId` parameter.
