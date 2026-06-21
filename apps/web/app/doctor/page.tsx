"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { socket } from "@/lib/socket";
import ThemeToggle from "@/app/components/ThemeToggle";
import { translations } from "@/lib/translations";
import { useRouter } from "next/navigation";

interface Patient {
  token: number;
  name: string;
  phone?: string;
  clinicId: string;
  priority?: boolean;
  status: "waiting" | "serving" | "done" | "skipped";
  addedAt: number;
  calledAt?: number;
  doneAt?: number;
}

interface QueueState {
  clinicId: string;
  currentToken: number | null;
  queue: Patient[];
  consultHistory: number[];
  avgConsultTime: number;
  isPaused: boolean;
}

interface Toast {
  id: string;
  message: string;
  type: "error" | "success" | "info";
}

interface ConsultLog {
  token: number;
  name: string;
  notes: string;
  duration: string;
  timestamp: number;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function DoctorDashboard() {
  // ── PIN Auth ───────────────────────────────────────────────────────────
  const [pin, setPin] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [pinError, setPinError] = useState("");

  // ── Queue State ────────────────────────────────────────────────────────
  const [queueState, setQueueState] = useState<QueueState>({
    clinicId: "",
    currentToken: null,
    queue: [],
    consultHistory: [],
    avgConsultTime: 10,
    isPaused: false,
  });

  // ── Doctor Specific State ──────────────────────────────────────────────
  const [notes, setNotes] = useState("");
  const [consultHistoryLogs, setConsultHistoryLogs] = useState<ConsultLog[]>([]);
  const [lang, setLang] = useState<"en" | "hi">("en");

  // Load language preference
  useEffect(() => {
    const saved = localStorage.getItem("doctor_lang") as "en" | "hi" | null;
    if (saved) setLang(saved);
  }, []);

  const handleLangToggle = () => {
    const nextLang = lang === "en" ? "hi" : "en";
    setLang(nextLang);
    localStorage.setItem("doctor_lang", nextLang);
  };

  // ── UI / Toasts ────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ── Stopwatch Timer ────────────────────────────────────────────────────
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const sessionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ── Derived values ─────────────────────────────────────────────────────
  const servingPatient = queueState.queue.find((p) => p.status === "serving");
  const waitingPatients = queueState.queue.filter((p) => p.status === "waiting");
  const waitingCount = waitingPatients.length;

  const showToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Socket sync
  useEffect(() => {
    if (!isAuthorized) return;

    socket.connect();
    socket.emit("join-clinic", { clinicId: queueState.clinicId });

    const handleSync = (state: QueueState) => {
      setQueueState(state);
    };

    const handleUpdate = (update: {
      currentToken: number | null;
      queue: Patient[];
      avgWait: string;
      isPaused: boolean;
      consultHistory?: number[];
      avgConsultTime?: number;
    }) => {
      setQueueState((prev) => ({
        ...prev,
        currentToken: update.currentToken,
        queue: update.queue,
        isPaused: update.isPaused,
        consultHistory: update.consultHistory ?? prev.consultHistory,
        avgConsultTime: update.avgConsultTime ?? prev.avgConsultTime,
      }));
    };

    const handleError = (err: { message: string }) => {
      let displayMsg = err.message;
      if (err.message === "empty") {
        displayMsg = lang === "hi"
          ? "कतार में कोई मरीज प्रतीक्षा नहीं कर रहा है।"
          : "There are no patients waiting in the queue.";
      } else if (err.message === "busy") {
        displayMsg = lang === "hi"
          ? "सिस्टम व्यस्त है। कृपया पुनः प्रयास करें।"
          : "System is busy. Please try again.";
      }
      showToast(displayMsg, "error");
    };

    socket.on("state-sync", handleSync);
    socket.on("queue-update", handleUpdate);
    socket.on("queue-error", handleError);

    // Load prescription/consult history logs
    const savedLogs = localStorage.getItem("doctor_consult_logs");
    if (savedLogs) {
      try {
        setConsultHistoryLogs(JSON.parse(savedLogs));
      } catch (e) {
        console.error("Failed to parse logs:", e);
      }
    }

    return () => {
      socket.off("state-sync", handleSync);
      socket.off("queue-update", handleUpdate);
      socket.off("queue-error", handleError);
    };
  }, [isAuthorized, showToast]);

  // Session Stopwatch control
  useEffect(() => {
    if (servingPatient) {
      // Calculate elapsed seconds since patient was called (using calledAt if present)
      const elapsedOnStart = servingPatient.calledAt
        ? Math.floor((Date.now() - servingPatient.calledAt) / 1000)
        : 0;

      setSessionSeconds(Math.max(0, elapsedOnStart));

      if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
      sessionIntervalRef.current = setInterval(() => {
        setSessionSeconds((sec) => sec + 1);
      }, 1000);
    } else {
      setSessionSeconds(0);
      if (sessionIntervalRef.current) {
        clearInterval(sessionIntervalRef.current);
        sessionIntervalRef.current = null;
      }
      setNotes(""); // Clear notes when no patient is active
    }

    return () => {
      if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
    };
  }, [servingPatient]);

  const router = useRouter();

  // ── Auth: check sessionStorage on mount ───────────────────────────────
  useEffect(() => {
    const savedHospitalId = sessionStorage.getItem("hospitalId");
    const savedRole = sessionStorage.getItem("role");
    const savedPin = sessionStorage.getItem("pin");

    if (!savedHospitalId || !savedPin || savedRole !== "doctor") {
      router.push("/login?role=doctor");
    } else {
      setPin(savedPin);
      setQueueState((prev) => ({ ...prev, clinicId: savedHospitalId }));
      setIsAuthorized(true);
    }
  }, [router]);

  const handleCallNext = () => {
    if (queueState.isPaused) {
      showToast("Cannot call next while the queue is paused.", "error");
      return;
    }
    socket.emit("call-next", { clinicId: queueState.clinicId, receptionistPin: pin });
  };

  const handleMarkAsDone = () => {
    if (!servingPatient) return;

    // Log the consultation details locally
    const newLog: ConsultLog = {
      token: servingPatient.token,
      name: servingPatient.name,
      notes: notes.trim() || (lang === "hi" ? "कोई नोट दर्ज नहीं हुआ।" : "No notes captured."),
      duration: formatElapsed(sessionSeconds),
      timestamp: Date.now(),
    };

    const updatedLogs = [newLog, ...consultHistoryLogs];
    setConsultHistoryLogs(updatedLogs);
    localStorage.setItem("doctor_consult_logs", JSON.stringify(updatedLogs));

    // Send mark-done to server
    socket.emit("mark-done", {
      clinicId: queueState.clinicId,
      token: servingPatient.token,
      receptionistPin: pin,
    });

    showToast(
      lang === "hi"
        ? `परामर्श समाप्त हुआ और टोकन #${servingPatient.token} सहेजा गया।`
        : `Prescription saved and Token #${servingPatient.token} completed.`,
      "success"
    );
    setNotes("");
  };

  const handleRecall = () => {
    if (!servingPatient) return;
    socket.emit("recall-token", { clinicId: queueState.clinicId, receptionistPin: pin });
    showToast(
      lang === "hi" ? `टोकन #${servingPatient.token} को याद दिलाया जा रहा है...` : `Recalling Token #${servingPatient.token}...`,
      "info"
    );
  };

  const t = translations[lang];

  // Auth Screen
  if (!isAuthorized) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 px-4 text-slate-100">
        <h1 className="text-xl font-bold tracking-tight text-white animate-pulse">
          Loading dashboard...
        </h1>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-300">
      
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-900 bg-white/80 dark:bg-slate-950/80 px-6 py-4 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md transition-colors duration-300">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
            QC
          </div>
          <div>
            <h1 className="font-bold text-slate-900 dark:text-white text-lg tracking-tight transition-colors duration-300">
              {lang === "hi" ? "QueueCure डॉक्टर पोर्टल" : "QueueCure Doctor Portal"}
            </h1>
            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium transition-colors duration-300">
              Dr. {sessionStorage.getItem("hospitalName") || queueState.clinicId} Panel
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button
            onClick={handleLangToggle}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 transition-all duration-300 cursor-pointer"
          >
            🌐 {lang === "en" ? "हिन्दी" : "English"}
          </button>
          <ThemeToggle />
          <div className="h-10 w-[1px] bg-slate-200 dark:bg-slate-800 transition-colors duration-300" />
          <div className="text-right">
            <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider block font-semibold transition-colors duration-300">
              {lang === "hi" ? "प्रतीक्षा में मरीज" : "Patients Waiting"}
            </span>
            <span className="text-2xl font-black text-indigo-500 dark:text-indigo-400">
              {waitingCount}
            </span>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 md:grid-cols-10 gap-6">
        
        {/* Left Side: Patient Serving Panel & Prescription Forms (7 Columns) */}
        <div className="md:col-span-7 flex flex-col gap-6">
          
          {/* Currently serving card */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-900/20 p-6 shadow-sm dark:shadow-none transition-colors duration-300">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-xs uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-black px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 transition-colors">
                  🟢 {t.NOW_SERVING}
                </span>
                {servingPatient && servingPatient.priority && (
                  <span className="ml-2 text-xs uppercase tracking-widest text-amber-600 dark:text-amber-400 font-black px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 transition-colors">
                    ⚡ {lang === "hi" ? "प्राथमिकता" : "Priority"}
                  </span>
                )}
              </div>
              {servingPatient && (
                <div className="text-right">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold block transition-colors">{t.SESSION_STOPWATCH}</span>
                  <span className="text-2xl font-black text-amber-500 dark:text-amber-400 font-mono transition-colors">
                    {formatElapsed(sessionSeconds)}
                  </span>
                </div>
              )}
            </div>

            {servingPatient ? (
              <div className="py-2">
                <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight transition-colors">
                  {servingPatient.name}
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold transition-colors mt-1">
                  Token #{servingPatient.token} {servingPatient.phone && `• ${servingPatient.phone}`}
                </p>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 font-bold transition-colors">
                {lang === "hi"
                  ? "कोई सक्रिय परामर्श नहीं। शुरू करने के लिए \"अगले टोकन को बुलाएं\" पर क्लिक करें।"
                  : "No active consultation. Click \"Call Next Patient\" below to begin."}
              </div>
            )}

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-4 mt-6">
              {servingPatient ? (
                <>
                  <button
                    onClick={handleMarkAsDone}
                    className="flex-1 min-w-[150px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    ✓ {t.MARK_DONE}
                  </button>
                  <button
                    onClick={handleRecall}
                    className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    🔊 {t.RECALL}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleCallNext}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  ▶ {t.CALL_NEXT}
                </button>
              )}
            </div>
          </div>

          {/* Consultation Notes Section */}
          {servingPatient && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-900/20 p-6 shadow-sm dark:shadow-none transition-colors duration-300 flex-1 flex flex-col">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 transition-colors">
                {t.PRESC_NOTES}
              </h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={lang === "hi" ? "यहाँ लक्षण, निदान और दवा की जानकारी लिखें..." : "Write symptoms, diagnosis, and prescription information here..."}
                className="w-full flex-1 min-h-[250px] p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all duration-300 resize-none font-sans"
              />
            </div>
          )}

          {/* Local logs history of patients consulted */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-900/20 p-6 shadow-sm dark:shadow-none transition-colors duration-300">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 transition-colors">
              {t.SESSION_LOGS}
            </h3>
            {consultHistoryLogs.length > 0 ? (
              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                {consultHistoryLogs.map((log) => (
                  <div
                    key={log.timestamp}
                    className="p-4 rounded-xl bg-slate-100/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <strong className="text-slate-950 dark:text-slate-100 block">
                          Token #{log.token} • {log.name}
                        </strong>
                        <span className="text-[10px] text-slate-500 block">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <span className="text-xs bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold px-2.5 py-0.5 rounded-full">
                        ⏱ {log.duration} min
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-350 whitespace-pre-line leading-relaxed">
                      {log.notes}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-slate-400 py-8 text-sm font-semibold">
                {t.NO_LOGS}
              </div>
            )}
          </div>

        </div>

        {/* Right Side: Waiting queue list (3 Columns) */}
        <div className="md:col-span-3">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-900/20 p-6 shadow-sm dark:shadow-none transition-colors duration-300">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 transition-colors flex items-center justify-between">
              <span>📋 {t.CLINIC_QUEUE}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-black">
                {waitingCount} {t.WAITING_COUNT}
              </span>
            </h3>

            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              <AnimatePresence>
                {waitingPatients.map((patient, index) => (
                  <motion.div
                    key={patient.token}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="p-3.5 rounded-xl bg-slate-100/50 dark:bg-slate-900/40 border border-slate-250 dark:border-slate-800 flex justify-between items-center transition-all duration-300"
                  >
                    <div>
                      <strong className="text-sm text-slate-900 dark:text-slate-100 block truncate max-w-[130px]">
                        {patient.name}
                      </strong>
                      <span className="text-xs text-slate-500 mt-0.5 block">
                        {lang === "hi" ? "स्थान" : "Position"} #{index + 1}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {patient.priority && (
                        <span className="text-xs bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full font-black animate-pulse">
                          ⚡ {lang === "hi" ? "प्राथमिकता" : "Priority"}
                        </span>
                      )}
                      <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 h-8 w-8 rounded-lg flex items-center justify-center shadow-sm">
                        #{patient.token}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {waitingCount === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm font-semibold">
                  {lang === "hi" ? "कतार खाली है।" : "Queue is empty."}
                </div>
              )}
            </div>
          </div>
        </div>

      </main>

      {/* Toasts wrapper */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`px-4 py-3 rounded-xl shadow-lg text-sm font-bold flex items-center gap-3 ${
                toast.type === "error"
                  ? "bg-rose-500 text-white"
                  : toast.type === "success"
                  ? "bg-emerald-500 text-white"
                  : "bg-indigo-600 text-white"
              }`}
            >
              <span>
                {toast.type === "error" ? "❌" : toast.type === "success" ? "✅" : "ℹ️"}
              </span>
              <span>{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

    </div>
  );
}
