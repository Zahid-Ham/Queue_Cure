import { Socket, Server } from 'socket.io';
import { z } from 'zod';
import {
  getQueue,
  addPatient,
  addPatients,
  callNext,
  skipToken,
  undoCall,
  setAvgTime,
  calcWaitTime,
  markDone,
  recallToken,
  setPauseState,
  resetQueue,
} from './queue';

import { db } from './db';

async function validatePin(clinicId: string, pin: string): Promise<boolean> {
  const hospital = await db.getHospital(clinicId);
  if (!hospital) return false;
  return pin === hospital.receptionistPin || pin === hospital.doctorPin;
}

// Keep track of active 5s undo window timeouts keyed by clinicId
const undoTimeouts = new Map<string, NodeJS.Timeout>();

// ─── Zod schemas for event payloads ────────────────────────────────────────

const JoinClinicSchema = z.object({
  clinicId: z.string().min(1)
});

const AddPatientSchema = z.object({
  clinicId: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().optional(),
  priority: z.boolean().optional(),
});

const AddPatientsSchema = z.object({
  clinicId: z.string().min(1),
  patients: z.array(z.object({
    name: z.string().min(1),
    phone: z.string().optional(),
    priority: z.boolean().optional(),
  }))
});

const CallNextSchema = z.object({
  clinicId: z.string().min(1),
  receptionistPin: z.string()
});

const SkipTokenSchema = z.object({
  clinicId: z.string().min(1),
  token: z.number().int().positive(),
  receptionistPin: z.string()
});

const UndoCallSchema = z.object({
  clinicId: z.string().min(1),
  receptionistPin: z.string()
});

const SetAvgTimeSchema = z.object({
  clinicId: z.string().min(1),
  minutes: z.number().positive(),
  receptionistPin: z.string()
});

const MarkDoneSchema = z.object({
  clinicId: z.string().min(1),
  token: z.number().int().positive(),
  receptionistPin: z.string(),
});

const RecallTokenSchema = z.object({
  clinicId: z.string().min(1),
  receptionistPin: z.string(),
});

const PauseQueueSchema = z.object({
  clinicId: z.string().min(1),
  pause: z.boolean(),
  receptionistPin: z.string(),
});

const ResetQueueSchema = z.object({
  clinicId: z.string().min(1),
  receptionistPin: z.string(),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Broadcasts full queue state to all sockets in the clinic room */
async function broadcastQueueUpdate(io: Server, clinicId: string): Promise<void> {
  const state = await getQueue(clinicId);
  const avgWait = calcWaitTime(1, state.consultHistory, state.avgConsultTime).label;

  io.to(clinicId).emit('queue-update', {
    currentToken: state.currentToken,
    queue: state.queue,
    avgWait,
    lastUpdated: Date.now(),
    isPaused: state.isPaused,
    consultHistory: state.consultHistory,
    avgConsultTime: state.avgConsultTime,
  });
}

// ─── Event Registrations ────────────────────────────────────────────────────

export function registerEvents(socket: Socket, io: Server): void {

  // ── Join Clinic ──────────────────────────────────────────────────────────
  socket.on('join-clinic', async (payload: unknown) => {
    try {
      const { clinicId } = JoinClinicSchema.parse(payload);
      socket.join(clinicId);

      // Emit full state sync to this socket only
      const state = await getQueue(clinicId);
      socket.emit('state-sync', state);
    } catch (error: any) {
      socket.emit('queue-error', { message: error.message || 'Failed to join clinic room' });
    }
  });

  // ── Add Patient ──────────────────────────────────────────────────────────
  socket.on('add-patient', async (payload: unknown) => {
    try {
      const { clinicId, name, phone, priority } = AddPatientSchema.parse(payload);
      const patient = await addPatient(clinicId, name, phone, priority);
      await broadcastQueueUpdate(io, clinicId);
      socket.emit('patient-added', patient);
    } catch (error: any) {
      socket.emit('queue-error', { message: error.message || 'Failed to add patient' });
    }
  });

  // ── Add Patients (Bulk) ──────────────────────────────────────────────────
  socket.on('add-patients', async (payload: unknown) => {
    try {
      const { clinicId, patients } = AddPatientsSchema.parse(payload);
      const addedPatients = await addPatients(clinicId, patients);
      await broadcastQueueUpdate(io, clinicId);
      socket.emit('patients-added', addedPatients);
    } catch (error: any) {
      socket.emit('queue-error', { message: error.message || 'Failed to import patients' });
    }
  });

  // ── Call Next ────────────────────────────────────────────────────────────
  socket.on('call-next', async (payload: unknown) => {
    try {
      const { clinicId, receptionistPin } = CallNextSchema.parse(payload);

      if (!(await validatePin(clinicId, receptionistPin))) {
        socket.emit('queue-error', { message: 'Invalid PIN' });
        return;
      }

      // If another call-next fires before 5s, clear the previous timeout
      const existingTimeout = undoTimeouts.get(clinicId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        undoTimeouts.delete(clinicId);
      }

      const result = await callNext(clinicId);
      if ('error' in result) {
        socket.emit('queue-error', { message: result.error });
        return;
      }

      // Broadcast update & call info
      await broadcastQueueUpdate(io, clinicId);

      const state = result.queue;
      const estimatedWait = calcWaitTime(1, state.consultHistory, state.avgConsultTime).label;

      io.to(clinicId).emit('token-called', {
        token: result.called.token,
        name: result.called.name,
        estimatedWait
      });

      // Start 5-second undo window
      const timeoutId = setTimeout(() => {
        undoTimeouts.delete(clinicId);
      }, 5000);
      undoTimeouts.set(clinicId, timeoutId);

    } catch (error: any) {
      socket.emit('queue-error', { message: error.message || 'Failed to call next token' });
    }
  });

  // ── Skip Token ───────────────────────────────────────────────────────────
  socket.on('skip-token', async (payload: unknown) => {
    try {
      const { clinicId, token, receptionistPin } = SkipTokenSchema.parse(payload);

      if (!(await validatePin(clinicId, receptionistPin))) {
        socket.emit('queue-error', { message: 'Invalid PIN' });
        return;
      }

      await skipToken(clinicId, token);
      await broadcastQueueUpdate(io, clinicId);
      io.to(clinicId).emit('patient-skipped', { token });
    } catch (error: any) {
      socket.emit('queue-error', { message: error.message || 'Failed to skip token' });
    }
  });

  // ── Undo Call ────────────────────────────────────────────────────────────
  socket.on('undo-call', async (payload: unknown) => {
    try {
      const { clinicId, receptionistPin } = UndoCallSchema.parse(payload);

      if (!(await validatePin(clinicId, receptionistPin))) {
        socket.emit('queue-error', { message: 'Invalid PIN' });
        return;
      }

      // Check if the undo window is still active
      const timeoutId = undoTimeouts.get(clinicId);
      if (!timeoutId) {
        socket.emit('queue-error', { message: 'Undo window (5s) has expired' });
        return;
      }

      // Clear the undo timeout
      clearTimeout(timeoutId);
      undoTimeouts.delete(clinicId);

      await undoCall(clinicId);
      await broadcastQueueUpdate(io, clinicId);
    } catch (error: any) {
      socket.emit('queue-error', { message: error.message || 'Failed to undo call' });
    }
  });

  // ── Set Average Time ─────────────────────────────────────────────────────
  socket.on('set-avg-time', async (payload: unknown) => {
    try {
      const { clinicId, minutes, receptionistPin } = SetAvgTimeSchema.parse(payload);

      if (!(await validatePin(clinicId, receptionistPin))) {
        socket.emit('queue-error', { message: 'Invalid PIN' });
        return;
      }

      await setAvgTime(clinicId, minutes);
      await broadcastQueueUpdate(io, clinicId);
    } catch (error: any) {
      socket.emit('queue-error', { message: error.message || 'Failed to set average consultation time' });
    }
  });

  // ── Mark Done ────────────────────────────────────────────────────────────
  // Explicitly marks the serving patient as done and records real duration
  // into consultHistory — feeds accurate data into the rolling average.
  socket.on('mark-done', async (payload: unknown) => {
    try {
      const { clinicId, token, receptionistPin } = MarkDoneSchema.parse(payload);

      if (!(await validatePin(clinicId, receptionistPin))) {
        socket.emit('queue-error', { message: 'Invalid PIN' });
        return;
      }

      const result = await markDone(clinicId, token);
      if ('error' in result) {
        socket.emit('queue-error', { message: result.error });
        return;
      }

      await broadcastQueueUpdate(io, clinicId);
      io.to(clinicId).emit('patient-done', { token });
      socket.emit('mark-done-success', { token });
    } catch (error: any) {
      socket.emit('queue-error', { message: error.message || 'Failed to mark patient as done' });
    }
  });

  // ── Recall Token ─────────────────────────────────────────────────────────
  // Re-announces the currently serving token (e.g. patient didn't respond)
  socket.on('recall-token', async (payload: unknown) => {
    try {
      const { clinicId, receptionistPin } = RecallTokenSchema.parse(payload);

      if (!(await validatePin(clinicId, receptionistPin))) {
        socket.emit('queue-error', { message: 'Invalid PIN' });
        return;
      }

      const result = await recallToken(clinicId);
      if ('error' in result) {
        socket.emit('queue-error', { message: result.error });
        return;
      }

      // Emit token-called again to all screens (re-triggers chime on display)
      io.to(clinicId).emit('token-called', {
        token: result.token,
        name: result.name,
        estimatedWait: '',
        isRecall: true,
      });

      socket.emit('recall-success', { token: result.token, name: result.name });
    } catch (error: any) {
      socket.emit('queue-error', { message: error.message || 'Failed to recall token' });
    }
  });

  // ── Pause Queue ──────────────────────────────────────────────────────────
  // Pauses or resumes the queue — call-next is blocked while paused.
  // Broadcasts the updated isPaused state to all screens.
  socket.on('pause-queue', async (payload: unknown) => {
    try {
      const { clinicId, pause, receptionistPin } = PauseQueueSchema.parse(payload);

      if (!(await validatePin(clinicId, receptionistPin))) {
        socket.emit('queue-error', { message: 'Invalid PIN' });
        return;
      }

      await setPauseState(clinicId, pause);
      await broadcastQueueUpdate(io, clinicId);
      // Separate event so display can show a prominent banner
      io.to(clinicId).emit('queue-paused', { isPaused: pause });
    } catch (error: any) {
      socket.emit('queue-error', { message: error.message || 'Failed to change queue pause state' });
    }
  });

  // ── Reset Queue ─────────────────────────────────────────────────────────
  socket.on('reset-queue', async (payload: unknown) => {
    try {
      const { clinicId, receptionistPin } = ResetQueueSchema.parse(payload);

      if (!(await validatePin(clinicId, receptionistPin))) {
        socket.emit('queue-error', { message: 'Invalid PIN' });
        return;
      }

      await resetQueue(clinicId);
      await broadcastQueueUpdate(io, clinicId);
      io.to(clinicId).emit('queue-reset', { clinicId });
    } catch (error: any) {
      socket.emit('queue-error', { message: error.message || 'Failed to reset queue' });
    }
  });

  // ── Change Display Settings ──────────────────────────────────────────────
  socket.on('change-display-settings', (payload: any) => {
    try {
      const { clinicId, lang, isSpeechEnabled, isPrivacyMode } = payload;
      io.to(clinicId).emit('display-settings-changed', {
        lang,
        isSpeechEnabled,
        isPrivacyMode,
      });
    } catch (error: any) {
      socket.emit('queue-error', { message: error.message || 'Failed to update display settings' });
    }
  });
}
