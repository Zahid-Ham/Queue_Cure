import Redis from 'ioredis';
import { z } from 'zod';

// Simple in-memory Redis fallback to allow running tests and development without a running Redis server
class InMemoryRedis {
  private store: Map<string, string> = new Map();
  private counters: Map<string, number> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: string, ...args: any[]): Promise<'OK' | null> {
    // Basic NX lock simulation
    const hasNX = args.map(x => String(x).toUpperCase()).includes('NX');
    if (hasNX && this.store.has(key)) {
      return null;
    }
    this.store.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const existed = this.store.has(key);
    this.store.delete(key);
    return existed ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const val = (this.counters.get(key) || 0) + 1;
    this.counters.set(key, val);
    return val;
  }

  on(event: string, callback: (...args: any[]) => void) {
    return this;
  }

  disconnect() {
    // No-op
  }
}

// Instantiate client (fallback automatically if configured or connection fails)
let redis: any;
const useInMemory = process.env.USE_IN_MEMORY_REDIS === 'true';

if (useInMemory) {
  console.log('Using in-memory Redis fallback database.');
  redis = new InMemoryRedis();
} else {
  try {
    redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: 1, // Fail fast to activate fallback in tests if needed
      connectTimeout: 2000,
    });

    redis.on('error', (err: any) => {
      // Swapping to in-memory fallback on first connection error
      if (!(redis instanceof InMemoryRedis)) {
        console.warn('Unable to connect to Redis. Switching to in-memory Redis fallback.');
        redis = new InMemoryRedis();
      }
    });
  } catch (e) {
    console.warn('Redis initialization failed. Switching to in-memory Redis fallback.');
    redis = new InMemoryRedis();
  }
}

// Types
export interface Patient {
  token: number;
  name: string;
  phone?: string;
  clinicId: string;
  priority?: boolean;
  status: 'waiting' | 'serving' | 'done' | 'skipped';
  addedAt: number;
  calledAt?: number;
  doneAt?: number;
}

export interface QueueState {
  clinicId: string;
  currentToken: number | null;
  queue: Patient[];
  consultHistory: number[];
  avgConsultTime: number;
  isPaused: boolean;
}

// Zod validation schemas
const ClinicIdSchema = z.string().min(1);
const NameSchema = z.string().min(1);
const PhoneSchema = z.string().optional();
const TokenSchema = z.number().int().positive();
const MinutesSchema = z.number().positive();
const PositionSchema = z.number().int().nonnegative();
const HistorySchema = z.array(z.number());

// Helpers
async function saveQueueState(clinicId: string, state: QueueState): Promise<void> {
  await redis.set(`queue:${clinicId}`, JSON.stringify(state));
}

/**
 * Re-sorts the waiting portion of the queue so priority patients
 * always come before non-priority patients, preserving relative order
 * within each group (stable sort).
 */
function applyPrioritySort(queue: Patient[]): Patient[] {
  const serving = queue.filter(p => p.status === 'serving');
  const done = queue.filter(p => p.status === 'done');
  const skipped = queue.filter(p => p.status === 'skipped');
  const priorityWaiting = queue.filter(p => p.status === 'waiting' && p.priority);
  const normalWaiting = queue.filter(p => p.status === 'waiting' && !p.priority);
  // Order: serving first, then priority waiting, then normal waiting, then done/skipped at end
  return [...serving, ...priorityWaiting, ...normalWaiting, ...done, ...skipped];
}

// Exported Functions
export async function getQueue(clinicId: string): Promise<QueueState> {
  ClinicIdSchema.parse(clinicId);

  const data = await redis.get(`queue:${clinicId}`);
  if (!data) {
    return {
      clinicId,
      currentToken: null,
      queue: [],
      consultHistory: [],
      avgConsultTime: 10, // Default fallback
      isPaused: false,
    };
  }

  const parsed = JSON.parse(data) as QueueState;
  // Ensure isPaused exists for older persisted states
  if (parsed.isPaused === undefined) parsed.isPaused = false;
  return parsed;
}

export async function addPatient(
  clinicId: string,
  name: string,
  phone?: string,
  priority?: boolean
): Promise<Patient> {
  ClinicIdSchema.parse(clinicId);
  NameSchema.parse(name);
  PhoneSchema.parse(phone);

  // Auto-increment token number for this clinic
  const token = await redis.incr(`queue:${clinicId}:token_counter`);

  const state = await getQueue(clinicId);

  const patient: Patient = {
    token,
    name,
    phone,
    clinicId,
    priority: priority ?? false,
    status: 'waiting',
    addedAt: Date.now(),
  };

  state.queue.push(patient);
  state.queue = applyPrioritySort(state.queue);
  await saveQueueState(clinicId, state);

  return patient;
}

export async function addPatients(
  clinicId: string,
  patientsData: Array<{ name: string; phone?: string; priority?: boolean }>
): Promise<Patient[]> {
  ClinicIdSchema.parse(clinicId);

  const lockKey = `lock:${clinicId}`;
  // Acquire a lock key with 10s TTL before mutating state
  const acquired = await redis.set(lockKey, 'locked', 'EX', 10, 'NX');
  if (!acquired) {
    throw new Error('busy');
  }

  try {
    const state = await getQueue(clinicId);
    const addedPatients: Patient[] = [];

    for (const data of patientsData) {
      NameSchema.parse(data.name);
      PhoneSchema.parse(data.phone);

      const token = await redis.incr(`queue:${clinicId}:token_counter`);
      const patient: Patient = {
        token,
        name: data.name,
        phone: data.phone,
        clinicId,
        priority: data.priority ?? false,
        status: 'waiting',
        addedAt: Date.now(),
      };
      state.queue.push(patient);
      addedPatients.push(patient);
    }

    state.queue = applyPrioritySort(state.queue);
    await saveQueueState(clinicId, state);

    return addedPatients;
  } finally {
    // Release the lock
    await redis.del(lockKey);
  }
}

export async function callNext(
  clinicId: string
): Promise<{ called: Patient; queue: QueueState } | { error: string }> {
  ClinicIdSchema.parse(clinicId);

  const lockKey = `lock:${clinicId}`;

  // Acquire a lock key with 3s TTL before mutating state
  const acquired = await redis.set(lockKey, 'locked', 'EX', 3, 'NX');
  if (!acquired) {
    return { error: 'busy' };
  }

  try {
    const state = await getQueue(clinicId);

    if (state.isPaused) {
      return { error: 'Queue is currently paused. Resume to call patients.' };
    }

    // If there is currently a patient being served, mark them as done
    const currentServingIdx = state.queue.findIndex((p) => p.status === 'serving');
    if (currentServingIdx !== -1) {
      const oldServing = state.queue[currentServingIdx];
      oldServing.status = 'done';
      oldServing.doneAt = Date.now();

      if (oldServing.calledAt) {
        const durationMinutes = (oldServing.doneAt - oldServing.calledAt) / 60000;
        state.consultHistory.push(durationMinutes);
        if (state.consultHistory.length > 10) {
          state.consultHistory.shift();
        }

        // Recalculate average consultation time
        const sum = state.consultHistory.reduce((a, b) => a + b, 0);
        state.avgConsultTime = sum / state.consultHistory.length;
      }
    }

    // Find the next patient who is waiting
    const nextWaitingIdx = state.queue.findIndex((p) => p.status === 'waiting');
    if (nextWaitingIdx === -1) {
      // Empty queue: save done status of old patient but return empty error
      await saveQueueState(clinicId, state);
      return { error: 'empty' };
    }

    const nextPatient = state.queue[nextWaitingIdx];
    nextPatient.status = 'serving';
    nextPatient.calledAt = Date.now();
    state.currentToken = nextPatient.token;

    await saveQueueState(clinicId, state);
    return { called: nextPatient, queue: state };
  } finally {
    // Release the lock
    await redis.del(lockKey);
  }
}

/**
 * Explicitly marks the currently serving patient as done without
 * advancing to the next patient. This records the real consultation
 * duration into consultHistory for accurate rolling average calculation.
 */
export async function markDone(
  clinicId: string,
  token: number
): Promise<QueueState | { error: string }> {
  ClinicIdSchema.parse(clinicId);
  TokenSchema.parse(token);

  const lockKey = `lock:${clinicId}`;
  const acquired = await redis.set(lockKey, 'locked', 'EX', 3, 'NX');
  if (!acquired) {
    return { error: 'busy' };
  }

  try {
    const state = await getQueue(clinicId);

    const patient = state.queue.find(p => p.token === token && p.status === 'serving');
    if (!patient) {
      return { error: 'Patient is not currently being served.' };
    }

    patient.status = 'done';
    patient.doneAt = Date.now();
    state.currentToken = null;

    if (patient.calledAt) {
      const durationMinutes = (patient.doneAt - patient.calledAt) / 60000;
      state.consultHistory.push(durationMinutes);
      if (state.consultHistory.length > 10) {
        state.consultHistory.shift();
      }
      const sum = state.consultHistory.reduce((a, b) => a + b, 0);
      state.avgConsultTime = sum / state.consultHistory.length;
    }

    await saveQueueState(clinicId, state);
    return state;
  } finally {
    await redis.del(lockKey);
  }
}

export async function skipToken(clinicId: string, token: number): Promise<QueueState> {
  ClinicIdSchema.parse(clinicId);
  TokenSchema.parse(token);

  const state = await getQueue(clinicId);

  const patient = state.queue.find((p) => p.token === token);
  if (patient) {
    patient.status = 'skipped';
    if (state.currentToken === token) {
      state.currentToken = null;
    }
    await saveQueueState(clinicId, state);
  }

  return state;
}

export async function undoCall(clinicId: string): Promise<QueueState> {
  ClinicIdSchema.parse(clinicId);

  const state = await getQueue(clinicId);

  // Find the patient currently being served
  const currentServingIdx = state.queue.findIndex((p) => p.status === 'serving');
  if (currentServingIdx === -1) {
    return state;
  }

  const currentServing = state.queue[currentServingIdx];
  currentServing.status = 'waiting';
  delete currentServing.calledAt;
  state.currentToken = null;

  // Find the most recently completed/skipped patient to restore as serving
  let prevPatient: Patient | null = null;
  for (const p of state.queue) {
    if (p.status === 'done' || p.status === 'skipped') {
      if (!prevPatient || (p.doneAt || 0) > (prevPatient.doneAt || 0)) {
        prevPatient = p;
      }
    }
  }

  if (prevPatient) {
    const originalStatus = prevPatient.status;
    prevPatient.status = 'serving';
    state.currentToken = prevPatient.token;

    if (originalStatus === 'done') {
      // Revert history addition
      state.consultHistory.pop();
      // Recalculate average
      if (state.consultHistory.length > 0) {
        const sum = state.consultHistory.reduce((a, b) => a + b, 0);
        state.avgConsultTime = sum / state.consultHistory.length;
      } else {
        state.avgConsultTime = 10; // Reset to default fallback
      }
      delete prevPatient.doneAt;
    }
  }

  // Re-apply priority sort after undo
  state.queue = applyPrioritySort(state.queue);

  await saveQueueState(clinicId, state);
  return state;
}

export async function setAvgTime(clinicId: string, minutes: number): Promise<void> {
  ClinicIdSchema.parse(clinicId);
  MinutesSchema.parse(minutes);

  const state = await getQueue(clinicId);
  state.avgConsultTime = minutes;
  state.consultHistory = []; // Clear history so the manual override takes effect and starts fresh
  await saveQueueState(clinicId, state);
}

/**
 * Recalls (re-announces) the current serving token without advancing the queue.
 * Useful when a patient doesn't respond and the receptionist needs to call again.
 */
export async function recallToken(
  clinicId: string
): Promise<{ token: number; name: string } | { error: string }> {
  ClinicIdSchema.parse(clinicId);

  const state = await getQueue(clinicId);
  const serving = state.queue.find(p => p.status === 'serving');
  if (!serving) {
    return { error: 'No patient is currently being served.' };
  }
  return { token: serving.token, name: serving.name };
}

/**
 * Toggles the paused state of the queue. When paused, call-next is blocked.
 */
export async function setPauseState(clinicId: string, pause: boolean): Promise<QueueState> {
  ClinicIdSchema.parse(clinicId);

  const state = await getQueue(clinicId);
  state.isPaused = pause;
  await saveQueueState(clinicId, state);
  return state;
}

export function calcWaitTime(
  position: number,
  history: number[],
  fallback: number
): { min: number; max: number; label: string } {
  PositionSchema.parse(position);
  HistorySchema.parse(history);
  MinutesSchema.parse(fallback);

  const avg = history.length >= 3
    ? history.reduce((a, b) => a + b, 0) / history.length
    : fallback;

  const est = position * avg;
  const margin = est * 0.4;
  const min = Math.round(est - margin);
  const max = Math.round(est + margin);

  return {
    min,
    max,
    label: `~${min}–${max} min`,
  };
}

// Local Test Suite
async function testQueue() {
  const clinicId = `test-clinic-${Date.now()}`;
  console.log(`Starting test for clinic ID: ${clinicId}`);

  try {
    // 1. Add 3 patients (one priority)
    console.log('Adding patients...');
    const p1 = await addPatient(clinicId, 'Alice', undefined, false);
    const p2 = await addPatient(clinicId, 'Bob', undefined, true); // priority
    const p3 = await addPatient(clinicId, 'Charlie', undefined, false);
    console.log(`Added: ${p1.name} (T:${p1.token}), ${p2.name} (T:${p2.token}, priority), ${p3.name} (T:${p3.token})`);

    // 2. Bob should be first in waiting queue due to priority
    const stateAfterAdd = await getQueue(clinicId);
    const waitingOrder = stateAfterAdd.queue.filter(p => p.status === 'waiting').map(p => p.name);
    console.log('Waiting order (Bob should be first):', waitingOrder);

    // 3. Call next (Bob should be serving due to priority)
    console.log('\nCalling next patient...');
    const call1 = await callNext(clinicId);
    if ('called' in call1) {
      console.log(`Now serving: ${call1.called.name} (Token: ${call1.called.token})`);
    } else {
      console.error('Call Next failed:', call1);
    }

    // Wait a brief moment to simulate some consult time
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 4. Mark done explicitly
    const serving = (await getQueue(clinicId)).queue.find(p => p.status === 'serving');
    if (serving) {
      const doneResult = await markDone(clinicId, serving.token);
      if ('error' in doneResult) {
        console.error('Mark done failed:', doneResult);
      } else {
        console.log(`\nMarked ${serving.name} as done. consultHistory:`, doneResult.consultHistory);
      }
    }

    // 5. Call next again (Alice should be serving)
    console.log('\nCalling next patient...');
    const call2 = await callNext(clinicId);
    if ('called' in call2) {
      console.log(`Now serving: ${call2.called.name} (Token: ${call2.called.token})`);
    } else {
      console.error('Call Next failed:', call2);
    }

    // 6. Check wait times for remaining patient (Charlie at position 1)
    const state = await getQueue(clinicId);
    const charliePosition = state.queue.filter(p => p.status === 'waiting').length;
    const waitTime = calcWaitTime(charliePosition, state.consultHistory, state.avgConsultTime);
    console.log(`\nRemaining queue length (waiting): ${charliePosition}`);
    console.log(`Estimated wait time for next patient:`, waitTime);

    console.log('\nQueue State:', JSON.stringify(state, null, 2));

  } catch (error) {
    console.error('Test execution failed:', error);
  } finally {
    // Clean up
    await redis.del(`queue:${clinicId}`);
    await redis.del(`queue:${clinicId}:token_counter`);
    redis.disconnect();
  }
}

if (require.main === module) {
  testQueue();
}
