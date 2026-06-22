# QueueCure 🏥

> Real-time clinic queue management — eliminating paper tokens, reducing receptionist overhead, and giving patients live visibility into their wait.

**Queue Cure '26 Hackathon Submission** · Built with Next.js 14 · Socket.IO · PostgreSQL · Redis · Framer Motion

---

## What's Been Built (Beyond the Spec)

| Feature | Status | Notes |
|---------|--------|-------|
| Live queue sync across all 3 screens | ✅ | Socket.IO rooms, no polling |
| Rolling average wait time (not hardcoded) | ✅ | Last 10 real consultation durations |
| Receptionist dashboard | ✅ | Fast, keyboard-shortcut driven |
| Patient mobile QR tracker | ✅ | PWA, no app install needed |
| TV waiting room display | ✅ | Fullscreen, animated grid |
| **Mark as Done button** | ✅ | Records real duration → updates rolling avg |
| **Live session stopwatch** | ✅ | Amber timer on serving patient |
| **Analytics strip** | ✅ | Avg consult, served count, throughput, data points |
| **Browser Push Notifications** | ✅ | "You're Next" + "Now Serving" — works in background |
| **Priority queue flag** | ✅ | ⚡ badge, stable sort to front of waiting group |
| **Recall Token button** | ✅ | Re-announces current token (double chime) |
| **Pause / Resume queue** | ✅ | Blocks call-next; fullscreen overlay on TV |
| **Danger Zone: Reset Queue & Tokens** | ✅ | Resets token counter to 1 and wipes active queue (with double-confirm) |
| **Persistent Patient History** | ✅ | Saves checkouts/skips to PostgreSQL; receptionist date-picker & search logs |
| Redis atomic mutex (SET NX) | ✅ | Prevents race conditions on call-next & mark-done |
| 5-second undo window | ✅ | Server-side cancellable setTimeout |
| QR code slip + Print | ✅ | SVG QR, browser print dialog |
| Socket event diagram | ✅ | See SOCKET_DIAGRAM.md |
| Thought process document | ✅ | See THOUGHT_PROCESS.md |

---

## Architecture

```
┌──────────────────────┐        ┌─────────────────────────┐        ┌──────────────┐
│  Receptionist Panel  │        │  Socket.IO Server        │        │  Display TV  │
│  /receptionist       │◄──────►│  (Express + Redis + PG)  │◄──────►│  /display    │
│                      │        │                          │        │              │
│ • Call Next (Space)  │        │  Socket Rooms: clinicId  │        │ • Token grid │
│ • Mark as Done       │        │                          │        │ • Wait times │
│ • Priority flag      │        │  State Layer:            │        │ • Pause OSD  │
│ • Recall / Pause     │        │  • Redis (Active queues) │        └──────────────┘
│ • Danger Zone Reset  │        │  • Postgres (History)    │
│ • History Log Search │        │  • Lock: SET NX mutex    │        ┌──────────────┐
└──────────────────────┘        └─────────────────────────┘        │ Patient View │
                                                                   │ /patient     │
                                                                   │              │
                                                                   │ • Position   │
                                                                   │ • Wait range │
                                                                   │ • Push notif │
                                                                   │ • Progress   │
                                                                   └──────────────┘
```

---

## Socket Events (Summary)

See **[SOCKET_DIAGRAM.md](./SOCKET_DIAGRAM.md)** for full sequence diagrams, Mermaid flows, and Redis key documentation.

| Direction | Event | Purpose |
|-----------|-------|---------|
| Client→Server | `join-clinic` | Join room, receive state-sync |
| Client→Server | `add-patient` | Add patient (with optional priority flag) |
| Client→Server | `call-next` | Advance queue (atomic mutex) |
| Client→Server | `mark-done` | Explicitly complete serving patient |
| Client→Server | `skip-token` | Skip waiting patient |
| Client→Server | `undo-call` | Revert within 5s window |
| Client→Server | `recall-token` | Re-announce current token |
| Client→Server | `pause-queue` | Pause/resume queue |
| Client→Server | `reset-queue` | Wipe active queue & start token sequence at 1 |
| Client→Server | `set-avg-time` | Set fallback average consultation time |
| Server→Client | `state-sync` | Full state on join/reconnect |
| Server→Client | `queue-update` | Broadcast after every mutation |
| Server→Client | `token-called` | Triggers chimes + undo banner |
| Server→Client | `queue-paused` | Pause state change event |
| Server→Client | `queue-reset` | Broadcast queue cleared state |
| Server→Client | `queue-error` | Validation errors, empty queue |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS |
| Animations | Framer Motion |
| Real-time | Socket.IO (client + server) |
| Backend | Node.js, Express |
| State Persistence | Redis (ioredis) & PostgreSQL (patient_history table) |
| QR Code | qrcode npm package (SVG, client-side) |
| PWA | next-pwa (manifest + service worker) |
| Validation | Zod (all socket payloads) |
| Deploy | Vercel (web) + Railway (server + Redis) |

---

## Local Setup

### Prerequisites
- **Node.js** v18+
- **PostgreSQL** database (stores patient history log table)
- **Redis** (or use the in-memory fallback — no Redis install needed for dev)

### Environment Variables

**`apps/server/.env`**
```env
PORT=4000
DATABASE_URL=postgresql://user:pass@localhost:5432/queue_cure
REDIS_URL=redis://127.0.0.1:6379
FRONTEND_URL=http://localhost:3000
RECEPTIONIST_PIN=1234
USE_IN_MEMORY_REDIS=true    # Set this to skip Redis install in development
```

**`apps/web/.env.local`**
```env
NEXT_PUBLIC_SERVER_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Start (Development)

```bash
# Terminal 1 — Backend
cd apps/server
npm install
npm run dev

# Terminal 2 — Frontend
cd apps/web
npm install
npm run dev
```

---

## How to Test

1. Open **`http://localhost:3000/receptionist`** → PIN: `1234`
2. Open **`http://localhost:3000/display`** → Go fullscreen
3. Add patients on the receptionist screen. Scan or open the QR link on mobile.
4. Press **Space** or click **Call Next** — all screens update instantly.
5. Add a patient with **⚡ Priority** — they jump to the front on all screens.
6. Click **Mark as Done** on the serving patient — watch the rolling average update in the analytics strip.
7. Click **📋 History** (next to Settings button) on Receptionist console — use the calendar date-picker and search bar to view and search database records.
8. Go to **Settings** → **Danger Zone** → Click **Reset Queue & Tokens** twice. The active queue clears, and subsequent tokens start from 1.

---

## Key Engineering Decisions

### Persistent Historical Logs
Active queues are stored inside Redis for high-speed retrieval and synchronization. However, completed and skipped patients are archived asynchronously into a PostgreSQL relational table (`patient_history`), preserving long-term audit logs. The receptionist is able to search past patients by date, phone, name, or token number seamlessly via the `GET /api/history` REST endpoint.

### Wait Time Accuracy
Wait times are computed from a rolling average of the last 10 real `calledAt → doneAt` durations, stored in `consultHistory`. The receptionist-set average is only a fallback used before 3 data points exist. This is why the **"Mark as Done"** button is critical — it records the true consultation window, not just time between calls.

### Race Condition Prevention
`call-next` and `mark-done` both use `SET key NX EX 3` (atomic SET-if-not-exists with 3-second TTL) as a distributed mutex. If two calls arrive simultaneously, the second is immediately rejected with `{ error: 'busy' }`. The `try...finally` block guarantees lock release even on exception.

---

## Submission Checklist

- [x] Working prototype link / demo video
- [x] GitHub repository with README
- [x] Socket event diagram ([SOCKET_DIAGRAM.md](./SOCKET_DIAGRAM.md))
- [x] Thought process sheet ([THOUGHT_PROCESS.md](./THOUGHT_PROCESS.md))
