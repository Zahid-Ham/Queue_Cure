"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { socket } from "@/lib/socket";
import ThemeToggle from "@/app/components/ThemeToggle";
import { translations } from "@/lib/translations";
import { useSearchParams, useRouter } from "next/navigation";

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

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function TVDisplayContent() {
  const searchParams = useSearchParams();
  const hospitalParam = searchParams.get("hospital");
  const router = useRouter();

  useEffect(() => {
    if (!hospitalParam) {
      router.push("/login?role=display");
    }
  }, [hospitalParam, router]);

  // Screen States
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [mounted, setMounted] = useState(false);

  // Session Timer
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const sessionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Speech States
  const [isSpeechEnabled, setIsSpeechEnabled] = useState(true);
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const isSpeechEnabledRef = useRef(true);
  const isPrivacyModeRef = useRef(false);
  const langRef = useRef<"en" | "hi">("en");

  // Sync refs
  useEffect(() => {
    isSpeechEnabledRef.current = isSpeechEnabled;
  }, [isSpeechEnabled]);

  useEffect(() => {
    isPrivacyModeRef.current = isPrivacyMode;
  }, [isPrivacyMode]);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  // Load saved language preference
  useEffect(() => {
    const savedLang = localStorage.getItem("display_lang") as "en" | "hi" | null;
    if (savedLang) setLang(savedLang);
  }, []);

  const handleLangToggle = () => {
    const nextLang = lang === "en" ? "hi" : "en";
    setLang(nextLang);
    localStorage.setItem("display_lang", nextLang);
  };

  // Queue State
  const [queueState, setQueueState] = useState<QueueState>({
    clinicId: hospitalParam || "",
    currentToken: null,
    queue: [],
    consultHistory: [],
    avgConsultTime: 10,
    isPaused: false,
  });

  const hasInteracted = useRef(false);

  // Live ticking clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Session stopwatch ticking
  useEffect(() => {
    if (sessionIntervalRef.current) {
      clearInterval(sessionIntervalRef.current);
      sessionIntervalRef.current = null;
    }

    const serving = queueState.queue.find((p) => p.status === "serving");

    if (serving?.calledAt) {
      setSessionSeconds(Math.floor((Date.now() - serving.calledAt) / 1000));
      sessionIntervalRef.current = setInterval(() => {
        setSessionSeconds((s) => s + 1);
      }, 1000);
    } else {
      setSessionSeconds(0);
    }

    return () => {
      if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
    };
  }, [queueState.queue]);

  // Warm up voices and handle async loading
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      const handleVoices = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener("voiceschanged", handleVoices);
      return () => {
        window.speechSynthesis.removeEventListener("voiceschanged", handleVoices);
      };
    }
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreenActive(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Web Audio API chime player
  const playChime = (freq = 880, duration = 0.4) => {
    if (!hasInteracted.current) return;
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
      gainNode.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + duration
      );
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (error) {
      console.warn("Audio chime failed:", error);
    }
  };

  // Text-To-Speech announcement
  const speakToken = (tokenNum: number, patientName: string, isRecall = false) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    try {
      window.speechSynthesis.cancel(); // cancel current

      const currentLang = langRef.current;
      const voices = window.speechSynthesis.getVoices();
      let voice;

      if (currentLang === "hi") {
        // Prioritize premium/natural Hindi female voices (e.g. Swara, Kalpana, Heera, Google Hindi)
        voice = voices.find(
          (v) =>
            v.lang.startsWith("hi") &&
            (v.name.toLowerCase().includes("swara") ||
              v.name.toLowerCase().includes("kalpana") ||
              v.name.toLowerCase().includes("heera") ||
              v.name.toLowerCase().includes("female") ||
              (v.name.toLowerCase().includes("google") && !v.name.toLowerCase().includes("male")))
        );
        // Fallback to any Hindi voice that is NOT explicitly male
        if (!voice) {
          voice = voices.find(
            (v) =>
              (v.lang.startsWith("hi") ||
                v.lang.toLowerCase().includes("hindi") ||
                v.lang.includes("hi_IN")) &&
              !v.name.toLowerCase().includes("hemant") &&
              !v.name.toLowerCase().includes("ravi") &&
              !v.name.toLowerCase().includes("male")
          );
        }
        // Last resort: any available Hindi voice
        if (!voice) {
          voice = voices.find(
            (v) =>
              v.lang.startsWith("hi") ||
              v.lang.toLowerCase().includes("hindi") ||
              v.lang.includes("hi_IN")
          );
        }
      } else {
        // Target Indian English voice
        voice = voices.find(
          (v) =>
            v.lang.startsWith("en-IN") ||
            v.lang.toLowerCase().includes("india") ||
            v.lang.includes("en_IN")
        );
      }

      // Fallback
      if (!voice) {
        voice = voices.find((v) => v.lang.startsWith("en-") || v.lang.startsWith("en_")) || voices[0];
      }

      const hasHindiVoice = voice && (voice.lang.startsWith("hi") || voice.name.toLowerCase().includes("hindi"));
      let text = "";
      const utterance = new SpeechSynthesisUtterance();

      if (currentLang === "hi") {
        if (hasHindiVoice) {
          if (isRecall) {
            text = isPrivacyModeRef.current
              ? `टोकन नंबर ${tokenNum} याद दिलाया जा रहा है।`
              : `टोकन नंबर ${tokenNum} याद दिलाया जा रहा है, मरीज ${patientName}।`;
          } else {
            text = isPrivacyModeRef.current
              ? `टोकन नंबर ${tokenNum}, कृपया डॉक्टर के कमरे में पधारें।`
              : `टोकन नंबर ${tokenNum}, मरीज ${patientName}, कृपया डॉक्टर के कमरे में पधारें।`;
          }
          utterance.lang = "hi-IN";
        } else {
          // Romanized Hindi when using English voice fallback
          if (isRecall) {
            text = isPrivacyModeRef.current
              ? `Token number ${tokenNum} yaad dilaayaa jaa rahaa hai.`
              : `Token number ${tokenNum} yaad dilaayaa jaa rahaa hai, patient ${patientName}.`;
          } else {
            text = isPrivacyModeRef.current
              ? `Token number ${tokenNum}, kripya doctor ke kamre mein padhaarein.`
              : `Token number ${tokenNum}, patient ${patientName}, kripya doctor ke kamre mein padhaarein.`;
          }
          utterance.lang = voice ? voice.lang : "en-IN";
        }
      } else {
        if (isRecall) {
          text = isPrivacyModeRef.current
            ? `Recalling token number ${tokenNum}.`
            : `Recalling token number ${tokenNum}, patient ${patientName}.`;
        } else {
          text = isPrivacyModeRef.current
            ? `Token number ${tokenNum}, please proceed to the consultation room.`
            : `Token number ${tokenNum}, patient ${patientName}, please proceed to the consultation room.`;
        }
        utterance.lang = voice ? voice.lang : "en-IN";
      }

      utterance.text = text;
      if (voice) {
        utterance.voice = voice;
      }
      
      utterance.rate = currentLang === "hi" ? 0.85 : 0.9;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("Speech synthesis failed:", err);
    }
  };

  // Socket IO setup
  useEffect(() => {
    if (!hospitalParam) return;
    socket.connect();
    socket.emit("join-clinic", { clinicId: hospitalParam });

    const handleSync = (state: QueueState) => {
      setQueueState(state);
      setLastUpdated(Date.now());
    };

    const handleUpdate = (update: {
      currentToken: number | null;
      queue: Patient[];
      avgWait: string;
      isPaused: boolean;
      consultHistory: number[];
      avgConsultTime: number;
    }) => {
      setQueueState((prev) => ({
        ...prev,
        currentToken: update.currentToken,
        queue: update.queue,
        isPaused: update.isPaused,
        consultHistory: update.consultHistory ?? prev.consultHistory,
        avgConsultTime: update.avgConsultTime ?? prev.avgConsultTime,
      }));
      setLastUpdated(Date.now());
    };

    const handleTokenCalled = (data: { token: number; name: string; isRecall?: boolean }) => {
      // Chime audio
      if (data.isRecall) {
        playChime(660, 0.25);
        setTimeout(() => playChime(660, 0.25), 300);
      } else {
        playChime(880, 0.4);
      }

      // Voice read-out (delayed slightly to follow chime)
      if (isSpeechEnabledRef.current) {
        setTimeout(() => {
          speakToken(data.token, data.name, !!data.isRecall);
        }, 600);
      }
    };

    const handleDisplaySettingsChanged = (settings: {
      lang: "en" | "hi";
      isSpeechEnabled: boolean;
      isPrivacyMode: boolean;
    }) => {
      setLang(settings.lang);
      setIsSpeechEnabled(settings.isSpeechEnabled);
      setIsPrivacyMode(settings.isPrivacyMode);
    };

    socket.on("state-sync", handleSync);
    socket.on("queue-update", handleUpdate);
    socket.on("token-called", handleTokenCalled);
    socket.on("display-settings-changed", handleDisplaySettingsChanged);

    return () => {
      socket.off("state-sync", handleSync);
      socket.off("queue-update", handleUpdate);
      socket.off("token-called", handleTokenCalled);
      socket.off("display-settings-changed", handleDisplaySettingsChanged);
    };
  }, []);

  // Toggle Fullscreen & Unlock Audio
  const enterFullscreen = () => {
    hasInteracted.current = true;
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
      playChime();
    } catch (err) {
      console.warn("Fullscreen toggle failed:", err);
    }
  };

  // Unlock audio on any click
  useEffect(() => {
    const unlock = () => {
      hasInteracted.current = true;
      window.removeEventListener("click", unlock);
    };
    window.addEventListener("click", unlock);
    return () => window.removeEventListener("click", unlock);
  }, []);

  // Derived
  const t = translations[lang];
  const waitingPatients = queueState.queue.filter((p) => p.status === "waiting");
  const servingPatient = queueState.queue.find((p) => p.status === "serving");
  const doneCount = queueState.queue.filter((p) => p.status === "done").length;

  // Dynamic wait time calculation
  const getEstWaitTime = (position: number) => {
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

  // Render Display list (max 8)
  const maxDisplayCount = 8;
  const displayedWaiting = waitingPatients.slice(0, maxDisplayCount);
  const overflowCount = Math.max(0, waitingPatients.length - maxDisplayCount);

  // Early loading return
  if (!hospitalParam) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "var(--bg)", color: "var(--text-1)" }}>
        Redirecting to display login...
      </div>
    );
  }

  return (
    <div style={{ background: "var(--bg)", color: "var(--text-1)", height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Plus Jakarta Sans', Inter, system-ui, sans-serif", overflow: "hidden" }}>

      {/* ── Queue Paused Overlay ──────────────────────────────────────── */}
      <AnimatePresence>
        {queueState.isPaused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="text-center"
            >
              <div className="text-8xl mb-6 animate-pulse">⏸</div>
              <h2
                className="font-black text-amber-500 tracking-tighter"
                style={{ fontSize: "clamp(3rem, 8vw, 6rem)" }}
              >
                {t.QUEUE_PAUSED}
              </h2>
              <p style={{ color: "var(--text-3)", fontWeight: 700, marginTop: 16, fontSize: 24 }}>
                {lang === "hi"
                  ? "कृपया प्रतीक्षा करें — क्लीनिक जल्द ही फिर से शुरू होगा।"
                  : "Please wait — the clinic will resume shortly."}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top Section: Now Serving Hero ─────────────────────────────── */}
      <section style={{ height: "40vh", minHeight: 280, display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid var(--border)", background: "var(--surface)", padding: "40px 32px 24px", position: "relative" }}>
        <div style={{ textAlign: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", background: "var(--emerald-light)", color: "var(--emerald)", padding: "6px 16px", borderRadius: 99, border: "1px solid rgba(5,150,105,0.15)" }}>
            🟢 {t.NOW_SERVING}
          </span>
          <div style={{ marginTop: 20, minHeight: "10rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <AnimatePresence mode="wait">
              {servingPatient ? (
                <motion.div
                  key={servingPatient.token}
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}
                >
                  <h2
                    style={{ fontSize: "clamp(4.5rem, 9vw, 8rem)", fontWeight: 900, color: "var(--text-1)", margin: 0, lineHeight: 0.95, letterSpacing: "-0.04em" }}
                  >
                    TOKEN {servingPatient.token}
                  </h2>
                  <p
                    style={{ fontSize: "clamp(2rem, 4vw, 3.8rem)", fontWeight: 800, color: "var(--brand)", margin: "16px 0 0", letterSpacing: "-0.02em" }}
                  >
                    {isPrivacyMode
                      ? servingPatient.name.split(" ").map(w => w ? w[0] + "•".repeat(Math.max(1, w.length - 1)) : "").join(" ")
                      : servingPatient.name}
                  </p>
                  <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
                    {servingPatient.priority && (
                      <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", background: "var(--amber-light)", color: "var(--amber)", padding: "4px 12px", borderRadius: 99, border: "1px solid rgba(217,119,6,0.2)" }}>
                        ⚡ {t.PRIORITY_PATIENT}
                      </span>
                    )}
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", background: "var(--brand-light)", color: "var(--brand)", padding: "4px 12px", borderRadius: 99, border: "1px solid var(--brand-mid)", display: "flex", alignItems: "center", gap: 6 }}>
                      ⏱ {lang === "hi" ? "समय:" : "Session:"}{" "}
                      <span style={{ fontWeight: 800, color: "var(--text-1)", fontFamily: "monospace", fontSize: 13 }}>
                        {formatElapsed(sessionSeconds)}
                      </span>
                    </span>
                  </div>
                </motion.div>
              ) : (
                <motion.h2
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ fontSize: "clamp(2.2rem, 4vw, 3.5rem)", fontWeight: 800, color: "var(--text-3)", margin: 0 }}
                >
                  {lang === "hi" ? "कोई टोकन नहीं बुलाया गया" : "NO ACTIVE TOKEN"}
                </motion.h2>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* ── Bottom Section: Queue Grid ────────────────────────────────── */}
      <section style={{ flex: 1, padding: 32, display: "flex", flexDirection: "column", justifyContent: "space-between", overflowY: "auto", minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 1280, width: "100%", margin: "0 auto" }}>
          {displayedWaiting.length > 0 ? (
            <div className="grid grid-cols-4 gap-6 w-full">
              <AnimatePresence initial={false}>
                {displayedWaiting.map((patient, index) => {
                  const isNextUp = index === 0;
                  return (
                    <motion.div
                      layout
                      key={patient.token}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ type: "spring", stiffness: 260, damping: 25 }}
                      style={{
                        padding: 24,
                        borderRadius: 16,
                        border: isNextUp ? "1.5px solid var(--brand)" : "1px solid var(--border)",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        height: 180,
                        boxShadow: "var(--shadow-md)",
                        background: isNextUp
                          ? "linear-gradient(135deg, var(--brand) 0%, #3B82F6 100%)"
                          : patient.priority
                          ? "var(--amber-light)"
                          : "var(--surface)",
                        borderColor: isNextUp
                          ? "var(--brand)"
                          : patient.priority
                          ? "var(--amber)"
                          : "var(--border)",
                        color: isNextUp ? "#fff" : "var(--text-1)",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <span
                            style={{
                              fontSize: 12, fontWeight: 900, padding: "4px 10px", borderRadius: 6,
                              background: isNextUp ? "#fff" : "var(--brand-light)",
                              color: isNextUp ? "var(--brand)" : "var(--brand)",
                            }}
                          >
                            #{patient.token}
                          </span>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "end", gap: 4 }}>
                            {isNextUp && (
                              <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", background: "var(--emerald)", color: "#fff", padding: "2px 8px", borderRadius: 99, letterSpacing: "0.06em", animation: "pulse 2s infinite" }}>
                                {lang === "hi" ? "अगला मरीज" : "Next Up"}
                              </span>
                            )}
                            {patient.priority && (
                              <span style={{ fontSize: 11, fontWeight: 900, color: "var(--amber)" }}>
                                ⚡ {lang === "hi" ? "प्राथमिकता" : "Priority"}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Patient Name */}
                        <div style={{ marginTop: 14 }}>
                          <h4 style={{
                            fontSize: 16,
                            fontWeight: 800,
                            margin: 0,
                            color: isNextUp ? "#fff" : "var(--text-1)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            textAlign: "left"
                          }}>
                            {isPrivacyMode
                              ? patient.name.split(" ").map(w => w ? w[0] + "•".repeat(Math.max(1, w.length - 1)) : "").join(" ")
                              : patient.name}
                          </h4>
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <span
                          style={{
                            fontSize: 11, display: "block", fontWeight: 700,
                            color: isNextUp ? "rgba(255,255,255,0.7)" : "var(--text-3)",
                          }}
                        >
                          {t.EST_WAIT_TIME}
                        </span>
                        <span
                          style={{
                            fontSize: 24, fontWeight: 900,
                            color: isNextUp ? "#fff" : "var(--brand)",
                          }}
                        >
                          {getEstWaitTime(index + 1)}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-3)", fontSize: 24, fontWeight: 800 }}>
              {t.NO_PATIENTS}
            </div>
          )}
        </div>

        {/* Overflow Indicator */}
        {overflowCount > 0 && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 20px", borderRadius: 99, background: "var(--brand-light)", border: "1px solid var(--brand-mid)", color: "var(--brand)", fontWeight: 700, fontSize: 13, boxShadow: "var(--shadow-sm)" }}>
              <span>➕</span> {overflowCount} {t.MORE_PATIENTS}
            </span>
          </div>
        )}
      </section>

      {/* ── Bottom Info Strip ─────────────────────────────────────────── */}
      <footer style={{
        height: 64, borderTop: "1px solid var(--border)",
        background: "var(--surface)", padding: "0 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        fontSize: 12, fontWeight: 600, color: "var(--text-3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ color: "var(--text-1)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 800 }}>
            {lang === "hi" ? "QueueCure प्रतीक्षा कक्ष" : "QueueCure Waiting Room"}
          </span>
          <div style={{ height: 16, width: 1, background: "var(--border)" }} />
          <span>{lang === "hi" ? "क्लीनिक: clinic-001" : "Clinic: clinic-001"}</span>
          <div style={{ height: 16, width: 1, background: "var(--border)" }} />
          <span style={{ color: "var(--emerald)", fontWeight: 700 }}>
            ✓ {doneCount} {t.SERVED_TODAY}
          </span>
          <div style={{ height: 16, width: 1, background: "var(--border)" }} />
          <span style={{ color: "var(--amber)", fontWeight: 700 }}>
            ⏳ {waitingPatients.length} {t.WAITING_COUNT}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ color: "var(--brand)", fontWeight: 900, fontSize: 14, letterSpacing: "0.02em" }}>
            {mounted
              ? currentTime.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : ""}
          </div>
          <ThemeToggle />
          <button
            onClick={enterFullscreen}
            style={{
              background: "var(--surface-2)", border: "1px solid var(--border)",
              color: "var(--text-2)", fontWeight: 700, padding: "6px 12px", borderRadius: 8,
              fontSize: 11, cursor: "pointer", transition: "all 140ms",
            }}
          >
            {isFullscreenActive ? "Exit Fullscreen" : "🖥️ Fullscreen"}
          </button>
          {/* Settings trigger */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            style={{
              background: "var(--brand-light)", border: "1px solid var(--brand-mid)",
              color: "var(--brand)", fontWeight: 750, padding: "6px 12px", borderRadius: 8,
              fontSize: 11, cursor: "pointer", transition: "all 140ms",
            }}
          >
            ⚙️ Settings
          </button>
        </div>
      </footer>

      {/* ── Slide-over Settings Drawer ─────────────────────────────────────────── */}
      <AnimatePresence>
        {isSettingsOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="display-settings-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                zIndex: 100,
              }}
              onClick={() => setIsSettingsOpen(false)}
            />
            {/* Drawer Panel */}
            <motion.div
              key="display-settings-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              style={{
                position: "fixed",
                top: 0,
                right: 0,
                bottom: 0,
                width: "100%",
                maxWidth: 380,
                background: "var(--surface)",
                borderLeft: "1px solid var(--border)",
                boxShadow: "var(--shadow-xl)",
                zIndex: 101,
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
              }}
            >
              {/* Header */}
              <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--text-1)" }}>
                    ⚙️ Display Settings
                  </h3>
                  <p style={{ fontSize: 11, color: "var(--text-3)", margin: "4px 0 0" }}>
                    Configure waiting room TV voice and details
                  </p>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  style={{
                    height: 32, width: 32, borderRadius: 8,
                    border: "1px solid var(--border)", background: "var(--surface-2)",
                    color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: 13,
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Drawer Content */}
              <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Speech Language */}
                <div style={{ display: "flex", alignItems: "center", background: "var(--surface-2)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                    🌐 Announcement Language
                  </span>
                  <button
                    onClick={handleLangToggle}
                    style={{
                      padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                      background: "var(--surface)", border: "1px solid var(--border)",
                      color: "var(--text-2)", cursor: "pointer",
                    }}
                  >
                    {lang === "en" ? "English" : "हिन्दी"}
                  </button>
                </div>

                {/* Speech Assistant Toggle */}
                <div style={{ display: "flex", alignItems: "center", background: "var(--surface-2)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                    🔊 Voice Announcement
                  </span>
                  <button
                    onClick={() => setIsSpeechEnabled((prev) => !prev)}
                    style={{
                      padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                      cursor: "pointer", border: "none",
                      background: isSpeechEnabled ? "var(--emerald-light)" : "var(--rose-light)",
                      color: isSpeechEnabled ? "var(--emerald)" : "var(--rose)",
                    }}
                  >
                    {isSpeechEnabled ? "ON" : "OFF"}
                  </button>
                </div>

                {/* Privacy Mode Toggle */}
                <div style={{ display: "flex", alignItems: "center", background: "var(--surface-2)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                    👤 Privacy Mode
                  </span>
                  <button
                    onClick={() => setIsPrivacyMode((prev) => !prev)}
                    style={{
                      padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                      cursor: "pointer", border: "none",
                      background: !isPrivacyMode ? "var(--brand-light)" : "var(--amber-light)",
                      color: !isPrivacyMode ? "var(--brand)" : "var(--amber)",
                    }}
                  >
                    {!isPrivacyMode ? "Announce Name" : "Token Only"}
                  </button>
                </div>

                {/* Test Audio announcement */}
                {servingPatient && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() => speakToken(servingPatient.token, servingPatient.name, false)}
                      style={{
                        width: "100%", padding: "12px 0", borderRadius: 10,
                        background: "linear-gradient(135deg, var(--brand) 0%, #3B82F6 100%)",
                        color: "#fff", fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer",
                      }}
                    >
                      📢 Test Sound Announcement
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}

export default function TVDisplay() {
  return (
    <Suspense fallback={<div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "var(--bg)", color: "var(--text-1)" }}>Loading...</div>}>
      <TVDisplayContent />
    </Suspense>
  );
}
