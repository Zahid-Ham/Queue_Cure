# QueueCure — AI Context File

## Project
Real-time clinic queue management system. Full-stack hackathon submission for Queue Cure '26 by Wooble Software.

## Problem
Indian clinics run on paper tokens. Patients have zero visibility into wait times. Receptionists manage queues from memory.

## What we're building
Three screens that sync live via Socket.IO when a token is called:
1. /receptionist — add patients, call next token, manage queue
2. /display — waiting room TV screen, full queue grid with wait times
3. /patient?token=N&clinic=ID — personal mobile view via QR code scan

## Tech stack
- Frontend: Next.js 14 App Router, Tailwind CSS, Framer Motion, Socket.IO client
- Backend: Node.js, Express, Socket.IO server
- State: Redis (queue persistence, atomic mutex)
- QR: qrcode npm package (SVG, client-side)
- PWA: next-pwa (manifest + service worker for /patient route)
- Deploy: Vercel (web), Railway (server + Redis)

## Data shapes
Patient: { token, name, phone?, clinicId, status: waiting|serving|done|skipped, addedAt, calledAt?, doneAt? }
QueueState: { clinicId, currentToken, queue: Patient[], consultHistory: number[], avgConsultTime }

## Socket events
Client→Server: join-clinic, call-next, skip-token, add-patient, set-avg-time, undo-call
Server→Client: queue-update, token-called, queue-error, state-sync

## Wait time formula
Rolling average of last 10 consultation durations. Show as range: est ± 40%. Min 3 data points before using rolling avg, else use receptionist-set fallback.

## Critical constraints
- call-next MUST use a Redis atomic operation (SET NX or Lua script) to prevent race condition
- On socket reconnect, server MUST emit state-sync with full current QueueState
- Display screen shows max 8 tokens in grid, "+N more" for overflow
- No patient names on /display (privacy). Names only on /receptionist and /patient.
- 5-second undo window after call-next. Use server-side setTimeout, cancellable.

## Edge cases to handle
- Empty queue on call-next: emit queue-error, do nothing
- All patients skipped: queue shows empty state gracefully  
- Network drop: socket auto-reconnect triggers state-sync
- Server restart: Redis restores queue, no data loss
- 0 consultation history: fall back to receptionist-set avgConsultTime

## Code style
- TypeScript throughout
- Named exports only
- No any types
- Zod for all socket payload validation
- Error boundaries on all three pages