"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerEvents = registerEvents;
const zod_1 = require("zod");
const queue_1 = require("./queue");
const db_1 = require("./db");
async function validatePin(clinicId, pin) {
    const hospital = await db_1.db.getHospital(clinicId);
    if (!hospital)
        return false;
    return pin === hospital.receptionistPin || pin === hospital.doctorPin;
}
// Keep track of active 5s undo window timeouts keyed by clinicId
const undoTimeouts = new Map();
// ─── Zod schemas for event payloads ────────────────────────────────────────
const JoinClinicSchema = zod_1.z.object({
    clinicId: zod_1.z.string().min(1)
});
const AddPatientSchema = zod_1.z.object({
    clinicId: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    phone: zod_1.z.string().optional(),
    priority: zod_1.z.boolean().optional(),
});
const AddPatientsSchema = zod_1.z.object({
    clinicId: zod_1.z.string().min(1),
    patients: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string().min(1),
        phone: zod_1.z.string().optional(),
        priority: zod_1.z.boolean().optional(),
    }))
});
const CallNextSchema = zod_1.z.object({
    clinicId: zod_1.z.string().min(1),
    receptionistPin: zod_1.z.string()
});
const SkipTokenSchema = zod_1.z.object({
    clinicId: zod_1.z.string().min(1),
    token: zod_1.z.number().int().positive(),
    receptionistPin: zod_1.z.string()
});
const UndoCallSchema = zod_1.z.object({
    clinicId: zod_1.z.string().min(1),
    receptionistPin: zod_1.z.string()
});
const SetAvgTimeSchema = zod_1.z.object({
    clinicId: zod_1.z.string().min(1),
    minutes: zod_1.z.number().positive(),
    receptionistPin: zod_1.z.string()
});
const MarkDoneSchema = zod_1.z.object({
    clinicId: zod_1.z.string().min(1),
    token: zod_1.z.number().int().positive(),
    receptionistPin: zod_1.z.string(),
});
const RecallTokenSchema = zod_1.z.object({
    clinicId: zod_1.z.string().min(1),
    receptionistPin: zod_1.z.string(),
});
const PauseQueueSchema = zod_1.z.object({
    clinicId: zod_1.z.string().min(1),
    pause: zod_1.z.boolean(),
    receptionistPin: zod_1.z.string(),
});
const ResetQueueSchema = zod_1.z.object({
    clinicId: zod_1.z.string().min(1),
    receptionistPin: zod_1.z.string(),
});
// ─── Helpers ────────────────────────────────────────────────────────────────
/** Broadcasts full queue state to all sockets in the clinic room */
async function broadcastQueueUpdate(io, clinicId) {
    const state = await (0, queue_1.getQueue)(clinicId);
    const avgWait = (0, queue_1.calcWaitTime)(1, state.consultHistory, state.avgConsultTime).label;
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
function registerEvents(socket, io) {
    // ── Join Clinic ──────────────────────────────────────────────────────────
    socket.on('join-clinic', async (payload) => {
        try {
            const { clinicId } = JoinClinicSchema.parse(payload);
            socket.join(clinicId);
            // Emit full state sync to this socket only
            const state = await (0, queue_1.getQueue)(clinicId);
            socket.emit('state-sync', state);
        }
        catch (error) {
            socket.emit('queue-error', { message: error.message || 'Failed to join clinic room' });
        }
    });
    // ── Add Patient ──────────────────────────────────────────────────────────
    socket.on('add-patient', async (payload) => {
        try {
            const { clinicId, name, phone, priority } = AddPatientSchema.parse(payload);
            const patient = await (0, queue_1.addPatient)(clinicId, name, phone, priority);
            await broadcastQueueUpdate(io, clinicId);
            socket.emit('patient-added', patient);
        }
        catch (error) {
            socket.emit('queue-error', { message: error.message || 'Failed to add patient' });
        }
    });
    // ── Add Patients (Bulk) ──────────────────────────────────────────────────
    socket.on('add-patients', async (payload) => {
        try {
            const { clinicId, patients } = AddPatientsSchema.parse(payload);
            const addedPatients = await (0, queue_1.addPatients)(clinicId, patients);
            await broadcastQueueUpdate(io, clinicId);
            socket.emit('patients-added', addedPatients);
        }
        catch (error) {
            socket.emit('queue-error', { message: error.message || 'Failed to import patients' });
        }
    });
    // ── Call Next ────────────────────────────────────────────────────────────
    socket.on('call-next', async (payload) => {
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
            const result = await (0, queue_1.callNext)(clinicId);
            if ('error' in result) {
                socket.emit('queue-error', { message: result.error });
                return;
            }
            // Broadcast update & call info
            await broadcastQueueUpdate(io, clinicId);
            const state = result.queue;
            const estimatedWait = (0, queue_1.calcWaitTime)(1, state.consultHistory, state.avgConsultTime).label;
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
        }
        catch (error) {
            socket.emit('queue-error', { message: error.message || 'Failed to call next token' });
        }
    });
    // ── Skip Token ───────────────────────────────────────────────────────────
    socket.on('skip-token', async (payload) => {
        try {
            const { clinicId, token, receptionistPin } = SkipTokenSchema.parse(payload);
            if (!(await validatePin(clinicId, receptionistPin))) {
                socket.emit('queue-error', { message: 'Invalid PIN' });
                return;
            }
            await (0, queue_1.skipToken)(clinicId, token);
            await broadcastQueueUpdate(io, clinicId);
            io.to(clinicId).emit('patient-skipped', { token });
        }
        catch (error) {
            socket.emit('queue-error', { message: error.message || 'Failed to skip token' });
        }
    });
    // ── Undo Call ────────────────────────────────────────────────────────────
    socket.on('undo-call', async (payload) => {
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
            await (0, queue_1.undoCall)(clinicId);
            await broadcastQueueUpdate(io, clinicId);
        }
        catch (error) {
            socket.emit('queue-error', { message: error.message || 'Failed to undo call' });
        }
    });
    // ── Set Average Time ─────────────────────────────────────────────────────
    socket.on('set-avg-time', async (payload) => {
        try {
            const { clinicId, minutes, receptionistPin } = SetAvgTimeSchema.parse(payload);
            if (!(await validatePin(clinicId, receptionistPin))) {
                socket.emit('queue-error', { message: 'Invalid PIN' });
                return;
            }
            await (0, queue_1.setAvgTime)(clinicId, minutes);
            await broadcastQueueUpdate(io, clinicId);
        }
        catch (error) {
            socket.emit('queue-error', { message: error.message || 'Failed to set average consultation time' });
        }
    });
    // ── Mark Done ────────────────────────────────────────────────────────────
    // Explicitly marks the serving patient as done and records real duration
    // into consultHistory — feeds accurate data into the rolling average.
    socket.on('mark-done', async (payload) => {
        try {
            const { clinicId, token, receptionistPin } = MarkDoneSchema.parse(payload);
            if (!(await validatePin(clinicId, receptionistPin))) {
                socket.emit('queue-error', { message: 'Invalid PIN' });
                return;
            }
            const result = await (0, queue_1.markDone)(clinicId, token);
            if ('error' in result) {
                socket.emit('queue-error', { message: result.error });
                return;
            }
            await broadcastQueueUpdate(io, clinicId);
            io.to(clinicId).emit('patient-done', { token });
            socket.emit('mark-done-success', { token });
        }
        catch (error) {
            socket.emit('queue-error', { message: error.message || 'Failed to mark patient as done' });
        }
    });
    // ── Recall Token ─────────────────────────────────────────────────────────
    // Re-announces the currently serving token (e.g. patient didn't respond)
    socket.on('recall-token', async (payload) => {
        try {
            const { clinicId, receptionistPin } = RecallTokenSchema.parse(payload);
            if (!(await validatePin(clinicId, receptionistPin))) {
                socket.emit('queue-error', { message: 'Invalid PIN' });
                return;
            }
            const result = await (0, queue_1.recallToken)(clinicId);
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
        }
        catch (error) {
            socket.emit('queue-error', { message: error.message || 'Failed to recall token' });
        }
    });
    // ── Pause Queue ──────────────────────────────────────────────────────────
    // Pauses or resumes the queue — call-next is blocked while paused.
    // Broadcasts the updated isPaused state to all screens.
    socket.on('pause-queue', async (payload) => {
        try {
            const { clinicId, pause, receptionistPin } = PauseQueueSchema.parse(payload);
            if (!(await validatePin(clinicId, receptionistPin))) {
                socket.emit('queue-error', { message: 'Invalid PIN' });
                return;
            }
            await (0, queue_1.setPauseState)(clinicId, pause);
            await broadcastQueueUpdate(io, clinicId);
            // Separate event so display can show a prominent banner
            io.to(clinicId).emit('queue-paused', { isPaused: pause });
        }
        catch (error) {
            socket.emit('queue-error', { message: error.message || 'Failed to change queue pause state' });
        }
    });
    // ── Reset Queue ─────────────────────────────────────────────────────────
    socket.on('reset-queue', async (payload) => {
        try {
            const { clinicId, receptionistPin } = ResetQueueSchema.parse(payload);
            if (!(await validatePin(clinicId, receptionistPin))) {
                socket.emit('queue-error', { message: 'Invalid PIN' });
                return;
            }
            await (0, queue_1.resetQueue)(clinicId);
            await broadcastQueueUpdate(io, clinicId);
            io.to(clinicId).emit('queue-reset', { clinicId });
        }
        catch (error) {
            socket.emit('queue-error', { message: error.message || 'Failed to reset queue' });
        }
    });
    // ── Change Display Settings ──────────────────────────────────────────────
    socket.on('change-display-settings', (payload) => {
        try {
            const { clinicId, lang, isSpeechEnabled, isPrivacyMode } = payload;
            io.to(clinicId).emit('display-settings-changed', {
                lang,
                isSpeechEnabled,
                isPrivacyMode,
            });
        }
        catch (error) {
            socket.emit('queue-error', { message: error.message || 'Failed to update display settings' });
        }
    });
}
