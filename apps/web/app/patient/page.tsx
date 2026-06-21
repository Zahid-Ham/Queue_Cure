"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { socket } from "@/lib/socket";
import ThemeToggle from "@/app/components/ThemeToggle";
import { translations } from "@/lib/translations";

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

// ─── Browser Push Notification helper ─────────────────────────────────────
async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}

function sendPushNotification(title: string, body: string, tag: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body,
      tag, // prevents duplicate stacking
      icon: "/favicon.ico",
      requireInteraction: false,
    });
  } catch (e) {
    console.warn("Push notification failed:", e);
  }
}

// ─── Main component ────────────────────────────────────────────────────────
function PatientViewContent() {
  const searchParams = useSearchParams();
  const tokenNum = parseInt(searchParams.get("token") || "", 10);
  const clinicId = searchParams.get("clinic") || "clinic-001";

  // State
  const [queueState, setQueueState] = useState<QueueState | null>(null);
  const [originalPosition, setOriginalPosition] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);
  const [lang, setLang] = useState<"en" | "hi">("en");

  useEffect(() => {
    const saved = localStorage.getItem("patient_lang") as "en" | "hi" | null;
    if (saved) setLang(saved);
  }, []);

  const handleLangToggle = () => {
    const nextLang = lang === "en" ? "hi" : "en";
    setLang(nextLang);
    localStorage.setItem("patient_lang", nextLang);
  };

  const lastStatus = useRef<string | null>(null);
  const lastPosition = useRef<number | null>(null);
  const audioUnlocked = useRef(false);

  // ── Sound chime ──────────────────────────────────────────────────────
  const playChime = (freq = 880, duration = 0.4) => {
    if (!audioUnlocked.current) return;
    try {
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn("Chime failed:", e);
    }
  };

  // Unlock audio + request notifications on first interaction
  const unlockAndRequestPermission = async () => {
    audioUnlocked.current = true;
    window.removeEventListener("click", handleFirstInteraction);
    window.removeEventListener("touchstart", handleFirstInteraction);
    const granted = await requestNotificationPermission();
    setNotifGranted(granted);
  };

  const handleFirstInteraction = () => {
    unlockAndRequestPermission();
  };

  useEffect(() => {
    // Check if already granted
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifGranted(Notification.permission === "granted");
    }
    window.addEventListener("click", handleFirstInteraction);
    window.addEventListener("touchstart", handleFirstInteraction);
    return () => {
      window.removeEventListener("click", handleFirstInteraction);
      window.removeEventListener("touchstart", handleFirstInteraction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Socket connection ────────────────────────────────────────────────
  useEffect(() => {
    if (isNaN(tokenNum)) return;

    socket.connect();
    setIsConnected(true);
    socket.emit("join-clinic", { clinicId });

    const handleSync = (state: QueueState) => {
      setQueueState(state);
    };

    const handleUpdate = (update: {
      currentToken: number | null;
      queue: Patient[];
      avgWait: string;
      isPaused: boolean;
    }) => {
      setQueueState((prev) =>
        prev
          ? {
              ...prev,
              currentToken: update.currentToken,
              queue: update.queue,
              isPaused: update.isPaused,
            }
          : null
      );
    };

    socket.on("state-sync", handleSync);
    socket.on("queue-update", handleUpdate);

    return () => {
      socket.off("state-sync", handleSync);
      socket.off("queue-update", handleUpdate);
    };
  }, [clinicId, tokenNum]);

  // ── Derived patient data ─────────────────────────────────────────────
  const patient = queueState?.queue.find((p) => p.token === tokenNum);
  const waitingPatients =
    queueState?.queue.filter((p) => p.status === "waiting") || [];
  const currentPosition =
    waitingPatients.findIndex((p) => p.token === tokenNum) + 1;

  // ── Status-change effects: chime + notifications ─────────────────────
  useEffect(() => {
    if (!patient) return;

    // Track original position
    if (
      patient.status === "waiting" &&
      currentPosition > 0 &&
      originalPosition === null
    ) {
      setOriginalPosition(currentPosition);
    }

    // Detect transition: waiting → serving (now called)
    if (patient.status === "serving" && lastStatus.current === "waiting") {
      playChime(880, 0.5);
      sendPushNotification(
        "🏥 It's Your Turn!",
        `Token #${patient.token} — Please proceed to the doctor's room now.`,
        "token-serving"
      );
    }

    // Detect transition: position > 1 → position 1 (next up)
    if (
      patient.status === "waiting" &&
      currentPosition === 1 &&
      lastPosition.current !== null &&
      lastPosition.current > 1
    ) {
      playChime(660, 0.3);
      sendPushNotification(
        "⚠️ You're Next!",
        `Token #${patient.token} — Get ready! You are next in line.`,
        "token-next"
      );
    }

    lastStatus.current = patient.status;
    lastPosition.current = currentPosition > 0 ? currentPosition : null;
  }, [patient, currentPosition, originalPosition]);

  // ── Wait time computation (mirrors server logic) ─────────────────────
  const getWaitTime = (position: number) => {
    if (!queueState) return "Calculating...";
    const history = queueState.consultHistory;
    const fallback = queueState.avgConsultTime;
    const avg =
      history.length >= 3
        ? history.reduce((a, b) => a + b, 0) / history.length
        : fallback;
    const est = position * avg;
    const margin = est * 0.4;
    const min = Math.max(1, Math.round(est - margin));
    const max = Math.round(est + margin);
    return `~${min}–${max} min`;
  };

  // ── URL validation ───────────────────────────────────────────────────
  if (isNaN(tokenNum)) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full rounded-2xl border border-slate-900 bg-slate-900/40 p-8">
          <span className="text-3xl">⚠️</span>
          <h1 className="mt-4 text-xl font-bold text-white">Invalid Request Link</h1>
          <p className="mt-2 text-sm text-slate-400">
            The queue link does not contain a valid token number. Please scan the
            QR code again.
          </p>
        </div>
      </div>
    );
  }

  // ── Loading state ────────────────────────────────────────────────────
  if (!queueState) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="h-10 w-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-sm text-slate-400 font-semibold">
          Connecting to queue...
        </p>
      </div>
    );
  }

  // ── Patient is complete / not found ──────────────────────────────────
  if (!patient || patient.status === "done" || patient.status === "skipped") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full rounded-2xl border border-slate-900 bg-slate-900/40 p-8 shadow-2xl">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 text-2xl">
            ✓
          </span>
          <h1 className="mt-6 text-xl font-bold text-white">
            Consultation Complete
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Thank you for using QueueCure. We hope you feel better soon! 🏥
          </p>
        </div>
      </div>
    );
  }

  // ── Progress bar calculation ─────────────────────────────────────────
  let progressPercentage = 0;
  if (patient.status === "serving") {
    progressPercentage = 100;
  } else if (patient.status === "waiting" && currentPosition > 0) {
    if (originalPosition !== null && originalPosition > 0) {
      const progress =
        ((originalPosition - (currentPosition - 1)) / originalPosition) * 100;
      progressPercentage = Math.min(95, Math.max(5, progress));
    } else {
      progressPercentage = Math.max(5, 100 - currentPosition * 15);
    }
  }

  const isServing = patient.status === "serving";
  const isNextUp = patient.status === "waiting" && currentPosition === 1;

  const t = translations[lang];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans px-4 py-8 transition-colors duration-300">
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col justify-between">

        {/* Header */}
        <header className="flex items-center justify-between gap-4 mb-6">
          <button
            onClick={handleLangToggle}
            className="px-2 py-1 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-[10px] font-bold cursor-pointer transition-all duration-300"
          >
            {lang === "en" ? "हिन्दी" : "EN"}
          </button>
          <div className="text-center">
            <span className="text-[10px] uppercase font-black tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20 transition-colors duration-300">
              {lang === "hi" ? "🏥 QueueCure लाइव ट्रैकर" : "🏥 QueueCure Live Tracker"}
            </span>
            {patient.priority && (
              <div className="mt-2">
                <span className="text-[10px] uppercase font-black tracking-widest text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20 transition-colors duration-300">
                  ⚡ {t.PRIORITY_PATIENT}
                </span>
              </div>
            )}
          </div>
          <ThemeToggle />
        </header>

        {/* Notification Permission Banner */}
        {!notifGranted && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 flex items-center gap-3"
          >
            <span className="text-lg">🔔</span>
            <div className="flex-1 text-xs text-indigo-650 dark:text-indigo-300 font-medium">
              <strong className="text-indigo-900 dark:text-indigo-200">
                {lang === "hi" ? "पुश नोटिफिकेशन सक्षम करें" : "Enable notifications"}
              </strong>{" "}
              {lang === "hi"
                ? "जब आपकी बारी अगली हो तो अलर्ट होने के लिए — भले ही यह टैब बंद हो।"
                : "to be alerted when you're next — even if you leave this tab."}
            </div>
            <button
              onClick={unlockAndRequestPermission}
              className="text-xs font-bold bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500 transition-colors shrink-0 cursor-pointer"
            >
              {t.ALLOW}
            </button>
          </motion.div>
        )}

        {/* Queue Paused Banner */}
        <AnimatePresence>
          {queueState.isPaused && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center"
            >
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                {lang === "hi"
                  ? "⏸ क्लीनिक द्वारा कतार को अस्थायी रूप से रोक दिया गया है।"
                  : "⏸ Queue is temporarily paused by the clinic."}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hero Card */}
        <main className="flex-1 flex flex-col justify-center">
          <AnimatePresence mode="wait">
            {isServing ? (
              <motion.div
                key="serving"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="rounded-3xl border border-emerald-500/40 bg-emerald-500/10 p-8 text-center shadow-xl relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
                <span className="text-xs font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider animate-pulse">
                  🟢 {t.NOW_SERVING}
                </span>
                <h2 className="mt-4 text-5xl font-black text-slate-900 dark:text-white">
                  TOKEN {patient.token}
                </h2>
                <p className="mt-4 text-emerald-600 dark:text-emerald-400 font-bold text-lg animate-bounce">
                  {lang === "hi" ? "कृपया डॉक्टर के कमरे में पधारें" : "Please proceed to the doctor"}
                </p>
              </motion.div>
            ) : isNextUp ? (
              <motion.div
                key="next-up"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="rounded-3xl border border-indigo-500/40 bg-indigo-500/10 p-8 text-center shadow-xl relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />
                <span className="text-xs font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider animate-pulse">
                  ⚠️ {lang === "hi" ? "आपकी बारी अगली है!" : "You're Next!"}
                </span>
                <h2 className="mt-4 text-5xl font-black text-slate-900 dark:text-white">
                  TOKEN {patient.token}
                </h2>
                <p className="mt-4 text-indigo-600 dark:text-indigo-400 font-bold text-lg">
                  {lang === "hi" ? "परामर्श के लिए तैयार हो जाएं" : "Prepare for your consultation"}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="waiting"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="rounded-3xl border border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-900/20 p-8 text-center shadow-sm dark:shadow-none transition-colors"
              >
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {lang === "hi" ? "आपका टोकन" : "YOUR TOKEN"}
                </span>
                <h2 className="mt-2 text-6xl font-black text-slate-900 dark:text-white">
                  #{patient.token}
                </h2>
                <div className="mt-6 border-t border-slate-200 dark:border-slate-900 pt-6 space-y-4">
                  <div>
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block">
                      {lang === "hi" ? "कतार में स्थान" : "Queue Position"}
                    </span>
                    <span className="text-xl font-bold text-slate-900 dark:text-white">
                      {currentPosition === 1
                        ? lang === "hi" ? "पहला (1st)" : "1st"
                        : currentPosition === 2
                        ? lang === "hi" ? "दूसरा (2nd)" : "2nd"
                        : currentPosition === 3
                        ? lang === "hi" ? "तीसरा (3rd)" : "3rd"
                        : `${currentPosition}${lang === "hi" ? "वां" : "th"}`}{" "}
                      {lang === "hi" ? "नंबर पर" : "in line"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block">
                      {t.EST_WAIT_TIME}
                    </span>
                    <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                      {getWaitTime(currentPosition)}
                    </span>
                    {queueState.consultHistory.length < 3 && (
                      <p className="text-[10px] text-slate-550 dark:text-slate-600 mt-1">
                        {lang === "hi" ? "रिसेप्शनिस्ट के अनुमान पर आधारित" : "Based on receptionist estimate"}
                      </p>
                    )}
                    {queueState.consultHistory.length >= 3 && (
                      <p className="text-[10px] text-emerald-650 dark:text-emerald-500 mt-1">
                        {lang === "hi"
                          ? `पिछले ${queueState.consultHistory.length} वास्तविक परामर्शों पर आधारित`
                          : `Based on ${queueState.consultHistory.length} real consultations`}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Progress Bar */}
          <div className="mt-8 px-2">
            <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              <span>{lang === "hi" ? "प्रतीक्षा कक्ष" : "Waiting Room"}</span>
              <span>{lang === "hi" ? "परामर्श" : "Consultation"}</span>
            </div>
            <div className="h-3 w-full bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-full overflow-hidden p-0.5 transition-colors">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 shadow-lg shadow-indigo-500/20"
                initial={{ width: "5%" }}
                animate={{ width: `${progressPercentage}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 p-3 text-center shadow-sm dark:shadow-none transition-colors">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                {lang === "hi" ? "आगे खड़े लोग" : "People Ahead"}
              </p>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                {Math.max(0, currentPosition - 1)}
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 p-3 text-center shadow-sm dark:shadow-none transition-colors">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                {lang === "hi" ? "कुल प्रतीक्षा सूची" : "Total Waiting"}
              </p>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                {waitingPatients.length}
              </p>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="text-center mt-6 text-[10px] font-semibold text-slate-500 space-y-1">
          <p>{lang === "hi" ? "ध्वनि चालू करने के लिए कहीं भी टैप करें" : "Tap anywhere to enable sound chimes"}</p>
          {notifGranted && (
            <p className="text-emerald-600 dark:text-emerald-500">
              {lang === "hi" ? "🔔 पुश नोटिफिकेशन चालू हैं" : "🔔 Notifications enabled"}
            </p>
          )}
          <div className="mt-2 flex items-center justify-center gap-1.5 text-slate-450 dark:text-slate-555">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isConnected ? "bg-emerald-500" : "bg-rose-500 animate-ping"
              }`}
            />
            <span>
              {lang === "hi"
                ? isConnected
                  ? "लाइव कतार से जुड़े हैं"
                  : "पुनः कनेक्ट किया जा रहा है..."
                : isConnected
                ? "Connected to live updates"
                : "Reconnecting..."}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function PatientView() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
          <div className="h-10 w-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-sm text-slate-400 font-semibold font-sans">
            Loading page parameters...
          </p>
        </div>
      }
    >
      <PatientViewContent />
    </Suspense>
  );
}
