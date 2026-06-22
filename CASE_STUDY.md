# CASE STUDY: QueueCure 🏥
### Real-Time Clinic Queue Management & Live Wait Tracking

**Queue Cure '26 Hackathon Project**
*Author: Zahid Hamdule*
*Live Prototype: https://queue-cure-two.vercel.app*
*Code Repository: https://github.com/Zahid-Ham/Queue_Cure*

---

## 1. Executive Summary
QueueCure is a full-stack real-time digital queue management system designed for neighbourhood clinics. It replaces manual paper token systems and shouting with a synchronized three-screen dashboard (Receptionist console, Doctor panel, TV display) and a patient-facing mobile PWA. 

By utilizing **Redis atomic locks** for concurrency control and **PostgreSQL** for historical audit logging, the prototype achieves sub-3-second receptionist patient registrations, single-tap doctor advancement controls, and 100% live wait visibility on patient phones.

---

## 2. Problem Statement
In India, 76% of neighborhood clinics manage patient queues using verbal shouting and manual paper token slips. This workflow has significant pain points:
* **Zero Patient Visibility**: Patients wait in cramped rooms for 2-3 hours with no estimation of when their turn will come. 
* **Front-Desk Overwhelm**: Receptionists must continuously answer status inquiries ("When is my turn?") from memory.
* **Clinic Inefficiency**: Doctors have no dashboard visibility to track incoming patient volume or average consultation timelines.

---

## 3. The Digital Solution
QueueCure orchestrates a live-synced, three-screen architecture powered by **Socket.IO**:

```
┌──────────────────────┐        ┌─────────────────────────┐        ┌──────────────┐
│  Receptionist Panel  │        │  Socket.IO Server        │        │  Display TV  │
│  (Registration)      │◄──────►│  (Express + Redis + PG)  │◄──────►│  (Room View) │
└──────────────────────┘        └─────────────────────────┘        └──────────────┘
                                             ▲
                                             │
                                ┌────────────┴────────────┐
                                │   Patient Mobile PWA    │
                                │   (Live Wait Tracker)   │
                                └─────────────────────────┘
```

1. **Receptionist Console**: Register patients, toggle priorities, print slips, pause the queue, and browse search logs.
2. **Doctor Panel**: A distraction-free panel showing current consultation timers, previous patient histories, and notes.
3. **Waiting Room TV Screen**: A large-screen layout announcing tokens using custom voice chimes and mask privacy modes.
4. **Patient PWA (Mobile)**: Scanned via QR code, showing real-time positions, custom wait estimations, and browser push alerts.

---

## 4. Key Performance Outcomes

* **⚡ < 3 Sec Registration**: Receptionists input patient details and generate active tokens in under 3 seconds.
* **⚡ 1-Tap Control**: Simple, mistake-proof actions allow doctors to call the next patient or mark consultations done in 1 click.
* **⚡ 100% Mobile Visibility**: Live socket synchronization updates patient screens in real-time without requiring manual browser page refreshes.

---

## 5. Engineering Architecture & Concurrency Control

### Concurrency Protection (Redis Mutex)
When multiple receptionists or doctors click call-actions simultaneously, race conditions can occur. To solve this, QueueCure uses a Redis-based distributed lock:
1. Prior to mutating queue state, the server executes `SET lock:{clinicId} NX EX 3`.
2. If the lock is held, requests are immediately rejected with a `{ error: 'busy' }` code.
3. All operations are wrapped in `try...finally` blocks to guarantee lock release and avoid system blocks.

### Hybrid Data Storage Architecture
* **Redis**: Active waiting queues are stored in volatile memory for high-frequency synchronization.
* **PostgreSQL**: To prevent Redis memory bloat, checked-out or skipped patients are archived asynchronously into a relational `patient_history` table.

---

## 6. Dynamic Wait Estimator (Not Hardcoded)
Rather than displaying a static, hardcoded wait guess, QueueCure calculates a dynamic wait range:
* **Formula**: `estimated = position * average`, with a `40%` margin of error showing a realistic range (e.g., `~12–20 min`).
* **Rolling Average**: Average duration is calculated from the mean of the last 10 completed consultations (`calledAt` to `doneAt`). 
* **Fallback Bootstrapping**: If fewer than 3 completed logs exist, the estimator falls back to the receptionist's custom clinic duration config.

---

## 7. UX & Safety Design Details

### 5-Second Undo Window
If a receptionist calls next by mistake, a 5-second countdown banner appears. Clicking "Undo" immediately cancels the action on the server, restoring the patient queue to its original state and reverting the patient's mobile tracker without disruptions.

### Double-Confirmation Danger Zone
Resetting active queues or starting token sequences back to 1 is a destructive action. The settings drawer includes a red alert button requiring double confirmation and receptionist PIN validation before reinitializing the queue keys in Redis.

---

## 8. Future Roadmap
* **SMS & WhatsApp Alerts**: Notify patients automatically when they are "two turns away" so they can wait in nearby cafes.
* **Multi-Doctor Rooms**: Scale the database structure to route incoming tokens to specific rooms or doctors dynamically.
