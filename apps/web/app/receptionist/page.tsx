"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { socket } from "@/lib/socket";
import QRCode from "qrcode";
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

// ─── Utility: format seconds to mm:ss ─────────────────────────────────────
function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function ReceptionistDashboard() {
  // ── Auth / PIN ─────────────────────────────────────────────────────────
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

  // ── Form ───────────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isPriority, setIsPriority] = useState(false);

  // ── UI State ───────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [avgTimeInput, setAvgTimeInput] = useState<string>("");
  const [isEditingAvgTime, setIsEditingAvgTime] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [searchQuery, setSearchQuery] = useState("");

  // ── TV Remote Control States ───────────────────────────────────────────
  const [tvLang, setTvLang] = useState<"en" | "hi">("en");
  const [tvVoice, setTvVoice] = useState(true);
  const [tvPrivacy, setTvPrivacy] = useState(false);

  const handleTvSettingChange = (langVal: "en" | "hi", voiceVal: boolean, privacyVal: boolean) => {
    socket.emit("change-display-settings", {
      clinicId: queueState.clinicId,
      lang: langVal,
      isSpeechEnabled: voiceVal,
      isPrivacyMode: privacyVal,
    });
  };

  useEffect(() => {
    const saved = localStorage.getItem("receptionist_lang") as "en" | "hi" | null;
    if (saved) setLang(saved);
  }, []);

  const handleLangToggle = () => {
    const nextLang = lang === "en" ? "hi" : "en";
    setLang(nextLang);
    localStorage.setItem("receptionist_lang", nextLang);
  };

  const t = translations[lang];

  // ── QR Modal ───────────────────────────────────────────────────────────
  const [qrModal, setQrModal] = useState<{
    name: string;
    token: number;
    svg: string;
    priority: boolean;
  } | null>(null);

  // ── Undo Banner ────────────────────────────────────────────────────────
  const [undoState, setUndoState] = useState<{
    token: number;
    name: string;
    timeLeft: number;
  } | null>(null);

  // ── Session Timer (serving patient stopwatch) ──────────────────────────
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const sessionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────
  const nameInputRef = useRef<HTMLInputElement>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Derived values ─────────────────────────────────────────────────────
  const activePatients = queueState.queue.filter(
    (p) => p.status === "waiting" || p.status === "serving"
  );
  const skippedPatients = queueState.queue.filter((p) => p.status === "skipped");
  const donePatients = queueState.queue.filter((p) => p.status === "done");
  const servingPatient = queueState.queue.find((p) => p.status === "serving");
  const waitingCount = queueState.queue.filter((p) => p.status === "waiting").length;

  const filteredActivePatients = activePatients.filter(
    (p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
           (p.phone && p.phone.includes(searchQuery)) ||
           String(p.token).includes(searchQuery)
  );

  const filteredSkippedPatients = skippedPatients.filter(
    (p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
           (p.phone && p.phone.includes(searchQuery)) ||
           String(p.token).includes(searchQuery)
  );

  // Dynamic wait time calculation for receptionist
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

  // ── Analytics ──────────────────────────────────────────────────────────
  const avgConsultDisplay =
    queueState.consultHistory.length > 0
      ? (
          queueState.consultHistory.reduce((a, b) => a + b, 0) /
          queueState.consultHistory.length
        ).toFixed(1)
      : queueState.avgConsultTime.toFixed(1);

  const patientsServedCount = donePatients.length;

  // Throughput: patients served per hour, based on time window
  const throughput = (() => {
    if (donePatients.length < 2) return null;
    const firstAdded = Math.min(...donePatients.map((p) => p.addedAt));
    const lastDone = Math.max(
      ...donePatients.filter((p) => p.doneAt).map((p) => p.doneAt!)
    );
    const hoursElapsed = (lastDone - firstAdded) / 3_600_000;
    if (hoursElapsed <= 0) return null;
    return (donePatients.length / hoursElapsed).toFixed(1);
  })();

  // ── Toast ──────────────────────────────────────────────────────────────
  const addToast = useCallback(
    (message: string, type: "error" | "success" | "info" = "error") => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const router = useRouter();

  // ── Auth: check sessionStorage on mount ───────────────────────────────
  useEffect(() => {
    const savedHospitalId = sessionStorage.getItem("hospitalId");
    const savedRole = sessionStorage.getItem("role");
    const savedPin = sessionStorage.getItem("pin");

    if (!savedHospitalId || !savedPin || savedRole !== "receptionist") {
      router.push("/login?role=receptionist");
    } else {
      setPin(savedPin);
      setQueueState((prev) => ({ ...prev, clinicId: savedHospitalId }));
      setIsAuthorized(true);
    }
  }, [router]);

  // ── Session Timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (sessionIntervalRef.current) {
      clearInterval(sessionIntervalRef.current);
      sessionIntervalRef.current = null;
    }

    if (servingPatient?.calledAt) {
      // Initialise from real calledAt so it's correct after reconnects
      setSessionSeconds(Math.floor((Date.now() - servingPatient.calledAt) / 1000));
      sessionIntervalRef.current = setInterval(() => {
        setSessionSeconds((s) => s + 1);
      }, 1000);
    } else {
      setSessionSeconds(0);
    }

    return () => {
      if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
    };
  }, [servingPatient?.token, servingPatient?.calledAt]);

  // ── Socket setup ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthorized) return;

    socket.connect();
    socket.emit("join-clinic", { clinicId: queueState.clinicId });

    // ── Re-join clinic room on every reconnect (e.g. after server restart) ─
    // Without this, the socket won't be in the room and won't receive broadcasts.
    const handleReconnect = () => {
      socket.emit("join-clinic", { clinicId: queueState.clinicId });
    };

    const handleSync = (state: QueueState) => {
      setQueueState(state);
      setAvgTimeInput(state.avgConsultTime.toString());
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
    };

    const handleTokenCalled = (data: { token: number; name: string; isRecall?: boolean }) => {
      if (data.isRecall) {
        addToast(`📢 Recalled Token #${data.token} (${data.name})`, "info");
        return;
      }
      setUndoState({ token: data.token, name: data.name, timeLeft: 5 });
    };

    const handlePatientAdded = (patient: Patient) => {
      addToast(
        lang === "hi"
          ? `✅ मरीज कतार में जोड़ा गया: ${patient.name} (टोकन #${patient.token})`
          : `✅ Added patient: ${patient.name} (Token #${patient.token})`,
        "success"
      );
    };

    // ── Bulk patients-added: server confirmed all CSV imports processed ──
    const handlePatientsAdded = (patients: Patient[]) => {
      addToast(
        lang === "hi"
          ? `📥 ${patients.length} मरीज कतार में जोड़े गए।`
          : `📥 ${patients.length} patient${patients.length !== 1 ? "s" : ""} added to queue.`,
        "success"
      );
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
      } else if (err.message === "Failed to import patients") {
        displayMsg = lang === "hi"
          ? "मरीज आयात करने में विफल। पुनः प्रयास करें।"
          : "Failed to import patients. Please try again.";
      }
      addToast(displayMsg, "error");
      if (err.message.includes("PIN")) {
        sessionStorage.clear();
        setIsAuthorized(false);
        router.push("/login?role=receptionist");
      }
    };

    const handleMarkDoneSuccess = () => {
      addToast("✅ Patient marked as done. Wait time updated.", "success");
    };

    const handleRecallSuccess = (data: { token: number; name: string }) => {
      addToast(`📢 Re-announced Token #${data.token} (${data.name})`, "info");
    };

    socket.on("connect", handleReconnect);
    socket.on("state-sync", handleSync);
    socket.on("queue-update", handleUpdate);
    socket.on("token-called", handleTokenCalled);
    socket.on("patient-added", handlePatientAdded);
    socket.on("patients-added", handlePatientsAdded);
    socket.on("queue-error", handleError);
    socket.on("mark-done-success", handleMarkDoneSuccess);
    socket.on("recall-success", handleRecallSuccess);

    return () => {
      socket.off("connect", handleReconnect);
      socket.off("state-sync", handleSync);
      socket.off("queue-update", handleUpdate);
      socket.off("token-called", handleTokenCalled);
      socket.off("patient-added", handlePatientAdded);
      socket.off("patients-added", handlePatientsAdded);
      socket.off("queue-error", handleError);
      socket.off("mark-done-success", handleMarkDoneSuccess);
      socket.off("recall-success", handleRecallSuccess);
    };
  }, [isAuthorized, addToast]);

  // ── Undo Countdown ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!undoState) return;
    if (undoState.timeLeft <= 0) {
      setUndoState(null);
      return;
    }
    undoTimerRef.current = setTimeout(() => {
      setUndoState((prev) =>
        prev ? { ...prev, timeLeft: prev.timeLeft - 1 } : null
      );
    }, 1000);
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, [undoState]);

  // ── QR Auto-dismiss ────────────────────────────────────────────────────
  useEffect(() => {
    if (!qrModal) return;
    const timer = setTimeout(() => setQrModal(null), 10000);
    return () => clearTimeout(timer);
  }, [qrModal]);

  // ── Keyboard Shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isAuthorized) return;
      const isInput =
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA";

      if (e.code === "Space" && !isInput) {
        e.preventDefault();
        handleCallNext();
      }
      if (e.code === "Escape") {
        if (undoState) {
          e.preventDefault();
          setUndoState(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized, pin, undoState]);

  const handleShowPatientQr = async (patient: Patient) => {
    try {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (typeof window !== "undefined"
          ? window.location.origin
          : "http://localhost:3000");
      const url = `${appUrl}/patient?token=${patient.token}&clinic=${patient.clinicId}`;
      const svgString = await QRCode.toString(url, {
        type: "svg",
        margin: 2,
        width: 220,
      });
      setQrModal({
        name: patient.name,
        token: patient.token,
        svg: svgString,
        priority: patient.priority ?? false,
      });
    } catch (err) {
      console.error("QR Code generation failed:", err);
    }
  };

  const downloadCsvTemplate = () => {
    const csvContent = "Name,Phone,Priority\nJohn Doe,9876543210,false\nJane Smith,9988776655,true\nRahul Kumar,,false";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "patient_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split("\n");
      const patientsToImport: Array<{ name: string; phone?: string; priority?: boolean }> = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(",").map(part => part.trim().replace(/^["']|["']$/g, ""));
        const nameVal = parts[0];
        const phoneVal = parts[1] || "";
        const priorityVal = parts[2]?.toLowerCase() === "true" || parts[2] === "1" || parts[2]?.toLowerCase() === "yes";

        if (nameVal) {
          patientsToImport.push({
            name: nameVal,
            phone: phoneVal || undefined,
            priority: priorityVal,
          });
        }
      }

      if (patientsToImport.length === 0) {
        addToast(
          lang === "hi"
            ? "आयात करने के लिए कोई मान्य मरीज नहीं मिला।"
            : "No valid patients found to import.",
          "error"
        );
        return;
      }

      // Ensure we're in the clinic room before sending so the broadcast
      // is guaranteed to reach us, even after a server restart.
      socket.emit("join-clinic", { clinicId: queueState.clinicId });

      // Small delay to allow the join-clinic to be processed first,
      // so the socket is in the room when the broadcast fires.
      setTimeout(() => {
        socket.emit("add-patients", {
          clinicId: queueState.clinicId,
          patients: patientsToImport,
        });
      }, 150);

      addToast(
        lang === "hi"
          ? `⏳ ${patientsToImport.length} मरीज जोड़े जा रहे हैं…`
          : `⏳ Adding ${patientsToImport.length} patients…`,
        "info"
      );
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleCsvExport = () => {
    if (queueState.queue.length === 0) {
      addToast(lang === "hi" ? "निर्यात करने के लिए कोई डेटा नहीं है।" : "No data available to export.", "error");
      return;
    }

    const headers = ["Token", "Name", "Phone", "Priority", "Status", "Joined At", "Called At", "Done At", "Duration (mins)"];
    const rows = queueState.queue.map((p) => {
      const joined = new Date(p.addedAt).toLocaleTimeString();
      const called = p.calledAt ? new Date(p.calledAt).toLocaleTimeString() : "—";
      const done = p.doneAt ? new Date(p.doneAt).toLocaleTimeString() : "—";
      
      let duration = "—";
      if (p.calledAt && p.doneAt) {
        duration = ((p.doneAt - p.calledAt) / 60000).toFixed(1);
      } else if (p.status === "serving" && sessionSeconds) {
        duration = (sessionSeconds / 60).toFixed(1);
      }

      return [
        p.token,
        `"${p.name.replace(/"/g, '""')}"`,
        p.phone || "—",
        p.priority ? "Yes" : "No",
        p.status.toUpperCase(),
        joined,
        called,
        done,
        duration
      ];
    });

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([`\ufeff${csvContent}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `clinic_queue_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    addToast(lang === "hi" ? "✅ रिपोर्ट सफलतापूर्वक डाउनलोड हो गई।" : "✅ Report downloaded successfully.", "success");
  };

  // ── Actions ────────────────────────────────────────────────────────────
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length === 4 && /^\d+$/.test(pin)) {
      sessionStorage.setItem("receptionist_pin", pin);
      setIsAuthorized(true);
      setPinError("");
    } else {
      setPinError("PIN must be exactly 4 digits.");
    }
  };

  const handleAddPatient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    socket.emit("add-patient", {
      clinicId: queueState.clinicId,
      name: name.trim(),
      phone: phone.trim() || undefined,
      priority: isPriority,
    });
    setName("");
    setPhone("");
    setIsPriority(false);
    nameInputRef.current?.focus();
  };

  const handleCallNext = () => {
    socket.emit("call-next", {
      clinicId: queueState.clinicId,
      receptionistPin: pin,
    });
  };

  const handleSkip = (token: number) => {
    socket.emit("skip-token", {
      clinicId: queueState.clinicId,
      token,
      receptionistPin: pin,
    });
  };

  const handleUndo = () => {
    socket.emit("undo-call", {
      clinicId: queueState.clinicId,
      receptionistPin: pin,
    });
    setUndoState(null);
  };

  const handleMarkDone = (token: number) => {
    socket.emit("mark-done", {
      clinicId: queueState.clinicId,
      token,
      receptionistPin: pin,
    });
  };

  const handleRecall = () => {
    socket.emit("recall-token", {
      clinicId: queueState.clinicId,
      receptionistPin: pin,
    });
  };

  const handlePauseToggle = () => {
    socket.emit("pause-queue", {
      clinicId: queueState.clinicId,
      pause: !queueState.isPaused,
      receptionistPin: pin,
    });
  };

  const handleSetAvgTimeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const minutes = parseFloat(avgTimeInput);
    if (!isNaN(minutes) && minutes > 0) {
      socket.emit("set-avg-time", {
        clinicId: queueState.clinicId,
        minutes,
        receptionistPin: pin,
      });
      setIsEditingAvgTime(false);
    } else {
      addToast("Invalid consultation duration value.", "error");
    }
  };

  // ── Authorization Loading Screen ──────────────────────────────────────────
  if (!isAuthorized) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 px-4 text-slate-100">
        <h1 className="text-xl font-bold tracking-tight text-white animate-pulse">
          Loading dashboard...
        </h1>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Main Dashboard
  // ──────────────────────────────────────────────────────────────────────
  return (
    <div className="h-auto md:h-screen md:overflow-hidden flex flex-col" style={{ background: "var(--bg)", color: "var(--text-1)", fontFamily: "'Plus Jakarta Sans', Inter, system-ui, sans-serif" }}>

      {/* ── Top Header ─────────────────────────────────────────────────── */}
      <header style={{
        borderBottom: "1px solid var(--border)",
        padding: "0 24px",
        height: 64,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 40,
        gap: 16,
        background: "var(--surface)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}>
        {/* Left: Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 800, fontSize: 13,
            boxShadow: "0 4px 12px rgba(79,70,229,0.30)",
            flexShrink: 0,
          }}>Q</div>
          <div>
            <h1 style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.03em", margin: 0, color: "var(--text-1)" }}>
              QueueCure
            </h1>
            <p style={{ fontSize: 11, color: "var(--brand)", fontWeight: 600, margin: 0 }}>
              {sessionStorage.getItem("hospitalName") || queueState.clinicId} · {lang === "en" ? "Reception" : "रिसेप्शन"}
            </p>
          </div>
        </div>

        {/* Center: Live Stats */}
        <div className="hidden md:flex" style={{ alignItems: "center", gap: 0 }}>
          <div style={{ padding: "0 20px", borderRight: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Avg Consult</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--brand)", letterSpacing: "-0.02em" }}>{avgConsultDisplay} min</div>
          </div>
          <div style={{ padding: "0 20px", borderRight: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{lang === "en" ? "Served Today" : "इलाज हुआ"}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--emerald)", letterSpacing: "-0.02em" }}>{patientsServedCount}</div>
          </div>
          <div style={{ padding: "0 20px", borderRight: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{t.THROUGHPUT}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-2)", letterSpacing: "-0.02em" }}>{throughput ? `${throughput}/hr` : "—"}</div>
          </div>
        </div>

        {/* Right: Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={handleLangToggle}
            style={{
              padding: "6px 12px", borderRadius: 9,
              border: "1px solid var(--border)", background: "var(--bg)",
              fontSize: 13, fontWeight: 600, color: "var(--text-2)",
              cursor: "pointer", transition: "all 140ms",
            }}
          >
            🌐 {lang === "en" ? "हिन्दी" : "English"}
          </button>
          <ThemeToggle />
          <div style={{ width: 1, height: 32, background: "var(--border)" }} />
          {servingPatient && (
            <>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Session</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--amber)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{formatElapsed(sessionSeconds)}</div>
              </div>
              <div style={{ width: 1, height: 32, background: "var(--border)" }} />
            </>
          )}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t.NOW_SERVING}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--emerald)", letterSpacing: "-0.02em" }}>
              {servingPatient ? `#${servingPatient.token}` : "—"}
            </div>
          </div>
          <div style={{ width: 1, height: 32, background: "var(--border)" }} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t.TOTAL_WAITING}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "var(--brand)", letterSpacing: "-0.02em" }}>{waitingCount}</div>
          </div>
        </div>
      </header>


      {/* ── Pause Banner ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {queueState.isPaused && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ background: "var(--amber-light)", borderBottom: "1px solid var(--amber)", padding: "10px 24px", display: "flex", alignItems: "center", gap: 12 }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--amber)" }}>⏸ {t.QUEUE_PAUSED}</span>
            <span style={{ fontSize: 12, color: "var(--text-2)" }}>
              — {lang === "en" ? "Call Next is disabled. The display screen is showing a paused state to patients." : "अगला टोकन बुलाना बंद है। मरीजों की स्क्रीन पर कतार रुकी हुई दिख रही है।"}
            </span>
            <button
              onClick={handlePauseToggle}
              style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, background: "var(--amber)", color: "#fff", padding: "4px 14px", borderRadius: 8, border: "none", cursor: "pointer" }}
            >
              {t.RESUME_QUEUE}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Panel ──────────────────────────────────────────────────── */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto p-6 grid grid-cols-1 md:grid-cols-10 gap-5 min-h-0 md:overflow-hidden">

        {/* Left Panel: Add Patient (40%) */}
        <section className="md:col-span-4 md:overflow-y-auto pr-1 min-h-0" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{
            borderRadius: 16, border: "1px solid var(--border)",
            background: "var(--surface)", padding: 24,
            boxShadow: "var(--shadow-sm)",
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
              <span>➕</span> {t.ADD_NEW_PATIENT}
            </h2>


            <form onSubmit={handleAddPatient} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                  {t.FULL_NAME} <span style={{ color: "var(--rose)" }}>*</span>
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={lang === "en" ? "e.g., Jane Doe" : "उदा. राहुल कुमार"}
                  style={{
                    width: "100%", borderRadius: 10,
                    border: "1.5px solid var(--border)", background: "var(--bg)",
                    padding: "10px 14px", fontSize: 14, color: "var(--text-1)",
                    outline: "none", transition: "border-color 140ms",
                    fontFamily: "inherit",
                  }}
                  onFocus={e => (e.target.style.borderColor = "var(--brand)")}
                  onBlur={e => (e.target.style.borderColor = "var(--border)")}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                  {t.PHONE_NUMBER} <span style={{ color: "var(--text-3)", fontWeight: 500 }}>({lang === "en" ? "Optional" : "वैकल्पिक"})</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={lang === "en" ? "e.g., 9876543210" : "उदा. 9876543210"}
                  style={{
                    width: "100%", borderRadius: 10,
                    border: "1.5px solid var(--border)", background: "var(--bg)",
                    padding: "10px 14px", fontSize: 14, color: "var(--text-1)",
                    outline: "none", transition: "border-color 140ms",
                    fontFamily: "inherit",
                  }}
                  onFocus={e => (e.target.style.borderColor = "var(--brand)")}
                  onBlur={e => (e.target.style.borderColor = "var(--border)")}
                />
              </div>

              {/* Priority Toggle */}
              <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none" }}>
                <div
                  style={{
                    position: "relative", width: 44, height: 24, borderRadius: 12,
                    background: isPriority ? "var(--amber)" : "var(--border-2)",
                    transition: "background 200ms", flexShrink: 0,
                  }}
                  onClick={() => setIsPriority((v) => !v)}
                >
                  <div style={{
                    position: "absolute", top: 3, left: isPriority ? 23 : 3,
                    width: 18, height: 18, borderRadius: "50%",
                    background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.20)",
                    transition: "left 180ms",
                  }} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>⚡ {t.PRIORITY_PATIENT}</span>
                {isPriority && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: "var(--amber-light)", color: "var(--amber)", border: "1px solid var(--amber)", padding: "2px 8px", borderRadius: 99 }}>
                    {t.JUMPS_QUEUE}
                  </span>
                )}
              </label>

              <button
                type="submit"
                style={{
                  width: "100%", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 15, color: "#fff",
                  background: isPriority
                    ? "linear-gradient(135deg, #D97706 0%, #F59E0B 100%)"
                    : "linear-gradient(135deg, #4F46E5 0%, #6D28D9 100%)",
                  border: "none", cursor: "pointer",
                  boxShadow: isPriority ? "0 4px 14px rgba(217,119,6,0.30)" : "0 4px 14px rgba(79,70,229,0.30)",
                  transition: "all 140ms",
                  fontFamily: "inherit",
                }}
              >
                {isPriority ? `⚡ ${lang === "en" ? "Add Priority Patient" : "प्राथमिकता मरीज जोड़ें"}` : t.ADD_TO_QUEUE}
              </button>
            </form>
          </div>

          {/* Currently Serving Card (with Mark Done + Recall) */}
          {servingPatient && (
            <motion.div
              key={servingPatient.token}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                borderRadius: 16, border: "1.5px solid var(--emerald)",
                background: "var(--emerald-light)", padding: 20,
              }}
            >
              <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--emerald)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                <span className="animate-pulse">🟢</span> {t.NOW_SERVING}
              </h2>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, marginTop: 12 }}>
                <div>
                  <p style={{ fontWeight: 800, color: "var(--text-1)", fontSize: 18, margin: 0 }}>
                    {servingPatient.name}
                  </p>
                  <p style={{ fontSize: 13, color: "var(--text-2)", margin: "4px 0 0" }}>
                    {lang === "en" ? "Token" : "टोकन"} #{servingPatient.token}
                    {servingPatient.priority && (
                      <span style={{ marginLeft: 8, color: "var(--amber)", fontWeight: 800 }}>⚡ {lang === "en" ? "Priority" : "प्राथमिकता"}</span>
                    )}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
                    {lang === "en" ? "Session" : "सत्र"}
                  </p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: "var(--amber)", margin: "4px 0 0", fontVariantNumeric: "tabular-nums" }}>
                    {formatElapsed(sessionSeconds)}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => handleMarkDone(servingPatient.token)}
                  style={{
                    flex: 1, borderRadius: 10, background: "var(--emerald)", color: "#fff",
                    fontWeight: 700, padding: "10px 16px", fontSize: 13, border: "none", cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(5,150,105,0.2)",
                  }}
                >
                  ✓ {t.MARK_DONE}
                </button>
                <button
                  onClick={() => handleShowPatientQr(servingPatient)}
                  title="Show QR Code"
                  style={{
                    borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)",
                    color: "var(--text-2)", fontWeight: 700, padding: "10px 14px", fontSize: 13, cursor: "pointer",
                  }}
                >
                  📱 QR
                </button>
                <button
                  onClick={handleRecall}
                  title="Re-announce this token"
                  style={{
                    borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)",
                    color: "var(--text-2)", fontWeight: 700, padding: "10px 14px", fontSize: 13, cursor: "pointer",
                  }}
                >
                  📢 {t.RECALL}
                </button>
              </div>
            </motion.div>
          )}
        </section>

        {/* Right Panel: Queue list (60%) */}
        <section className="md:col-span-6 flex flex-col gap-6 min-h-0">
          <div style={{
            borderRadius: 16, border: "1px solid var(--border)",
            background: "var(--surface)", padding: 24,
            boxShadow: "var(--shadow-sm)",
            display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden"
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>📋 {t.CLINIC_QUEUE}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={downloadCsvTemplate}
                  title="Download Import CSV Template"
                  style={{
                    fontSize: 11, fontWeight: 700, padding: "6px 10px", borderRadius: 8,
                    border: "1px solid var(--border)", background: "var(--surface-2)",
                    color: "var(--brand)", cursor: "pointer", transition: "all 140ms",
                  }}
                >
                  📄 {lang === "hi" ? "टेम्पलेट" : "Template"}
                </button>
                <label style={{
                  fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 8,
                  border: "1px solid var(--border)", background: "var(--brand-light)",
                  color: "var(--brand)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
                }}>
                  📥 {lang === "hi" ? "आयात" : "Import CSV"}
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCsvImport}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={handleCsvExport}
                  title="Export today's logs to CSV/Excel"
                  style={{
                    fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 8,
                    border: "1px solid var(--border)", background: "var(--surface-2)",
                    color: "var(--text-2)", cursor: "pointer", transition: "all 140ms",
                  }}
                >
                  📤 {lang === "hi" ? "निर्यात" : "Export CSV"}
                </button>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 99, background: "var(--brand-light)", color: "var(--brand)" }}>
                  {activePatients.length} {t.ACTIVE}
                </span>
              </div>
            </h2>

            {/* Search Input */}
            <div style={{ marginBottom: 16, position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", fontSize: 14 }}>🔍</span>
              <input
                type="text"
                placeholder={lang === "en" ? "Search patient by name, phone, or token..." : "मरीज का नाम, फोन या टोकन से खोजें..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  borderRadius: 12,
                  border: "1.5px solid var(--border)",
                  background: "var(--surface-2)",
                  padding: "10px 16px 10px 40px",
                  fontSize: 13,
                  color: "var(--text-1)",
                  outline: "none",
                  transition: "all 140ms",
                  fontFamily: "inherit"
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--brand)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--border)";
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 12, fontWeight: 700
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              <AnimatePresence initial={false}>
                {filteredActivePatients.map((patient) => {
                  const isServing = patient.status === "serving";
                  return (
                    <motion.div
                      key={patient.token}
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      transition={{ duration: 0.3 }}
                      style={{
                        padding: 16, borderRadius: 12, border: "1px solid var(--border)",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        background: isServing
                          ? "var(--emerald-light)"
                          : patient.priority
                          ? "var(--amber-light)"
                          : "var(--surface)",
                        borderColor: isServing
                          ? "var(--emerald)"
                          : patient.priority
                          ? "var(--amber)"
                          : "var(--border)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div
                          style={{
                            height: 40, width: 40, borderRadius: 8, fontWeight: 800, fontSize: 13,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: isServing
                              ? "rgba(5,150,105,0.15)"
                              : patient.priority
                              ? "rgba(217,119,6,0.15)"
                              : "var(--brand-light)",
                            color: isServing
                              ? "var(--emerald)"
                              : patient.priority
                              ? "var(--amber)"
                              : "var(--brand)",
                          }}
                        >
                          #{patient.token}
                        </div>
                        <div>
                          <h3 style={{ fontWeight: 800, color: "var(--text-1)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                            {patient.name}
                            {patient.priority && !isServing && (
                              <span style={{ fontSize: 9, fontWeight: 900, background: "var(--amber-light)", color: "var(--amber)", padding: "2px 6px", borderRadius: 99 }}>
                                ⚡ {lang === "en" ? "Priority" : "प्राथमिकता"}
                              </span>
                            )}
                          </h3>
                          <p style={{ fontSize: 11, color: "var(--text-3)", margin: "2px 0 0" }}>
                            {isServing ? `⏱ ${lang === "en" ? "Serving" : "इलाज जारी"}` : `${lang === "en" ? "Joined" : "शामिल"} ${new Date(patient.addedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                          </p>
                        </div>
                      </div>

                      {/* Wait Time display */}
                      {!isServing && (
                        <div style={{ marginLeft: "auto", marginRight: 16, textAlign: "right" }}>
                          <span style={{ fontSize: 10, display: "block", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            {lang === "en" ? "Est. Wait" : "अनुमानित प्रतीक्षा"}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--brand)" }}>
                            {(() => {
                              const waitingPatients = queueState.queue.filter((p) => p.status === "waiting");
                              const idx = waitingPatients.findIndex((p) => p.token === patient.token);
                              return idx !== -1 ? getEstWaitTime(idx + 1) : "—";
                            })()}
                          </span>
                        </div>
                      )}

                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isServing ? (
                          <button onClick={() => handleMarkDone(patient.token)} style={{ fontSize: 11, fontWeight: 700, background: "var(--emerald)", color: "#fff", padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer" }}>✓ {t.DONE}</button>
                        ) : (
                          <button onClick={() => handleSkip(patient.token)} style={{ fontSize: 11, fontWeight: 700, background: "var(--surface)", border: "1px solid var(--border)", padding: "6px 12px", borderRadius: 8, cursor: "pointer", color: "var(--text-2)" }}>{t.SKIP}</button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {activePatients.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-3)", fontWeight: 600 }}>
                  {lang === "en" ? "Queue is empty. Use the form to add patients." : "कतार खाली है। मरीज जोड़ने के लिए फॉर्म का उपयोग करें।"}
                </div>
              ) : filteredActivePatients.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-3)", fontWeight: 600 }}>
                  {lang === "en" ? "No patients match your search." : "आपकी खोज से कोई मरीज मेल नहीं खाता।"}
                </div>
              ) : null}

              {/* Skipped Patients */}
              {filteredSkippedPatients.length > 0 && (
                <div style={{ marginTop: 32, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                  <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)", marginBottom: 12 }}>
                    {lang === "en" ? "Skipped Patients" : "छोड़े गए मरीज"}
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: 0.6 }}>
                    {filteredSkippedPatients.map((patient) => (
                      <div
                        key={patient.token}
                        style={{
                          borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)",
                          padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between",
                          textDecoration: "line-through"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 700 }}>
                            #{patient.token}
                          </span>
                          <span style={{ fontSize: 13, color: "var(--text-2)", fontWeight: 600 }}>
                            {patient.name}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ── Bottom Action Bar ────────────────────────────────────────────── */}
      <footer style={{
        borderTop: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        bottom: 0,
        zIndex: 40,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        gap: 16,
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Call Next */}
          <button
            onClick={handleCallNext}
            disabled={queueState.isPaused}
            style={{
              padding: "12px 24px",
              background: "linear-gradient(135deg, var(--brand) 0%, #3B82F6 100%)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(79,70,229,0.25)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 140ms",
              opacity: queueState.isPaused ? 0.5 : 1,
            }}
          >
            🔊 {t.CALL_NEXT}
          </button>

          {/* Pause / Resume */}
          <button
            onClick={handlePauseToggle}
            style={{
              padding: "12px 20px",
              fontWeight: 700,
              borderRadius: 10,
              fontSize: 13,
              cursor: "pointer",
              border: queueState.isPaused ? "1px solid var(--amber)" : "1px solid var(--border)",
              background: queueState.isPaused ? "var(--amber-light)" : "var(--surface-2)",
              color: queueState.isPaused ? "var(--amber)" : "var(--text-2)",
              transition: "all 140ms",
            }}
          >
            {queueState.isPaused ? (lang === "en" ? "▶ Resume" : "▶ चालू करें") : (lang === "en" ? "⏸ Pause Queue" : "⏸ कतार रोकें")}
          </button>
        </div>

        {/* Settings toggle */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setIsSettingsOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-2)",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              padding: "10px 16px",
              borderRadius: 10,
              cursor: "pointer",
              transition: "all 140ms",
            }}
          >
            <span>⚙️</span>
            <span>{lang === "en" ? "Settings" : "सेटिंग्स"}</span>
          </button>
          
          <button
            onClick={() => {
              sessionStorage.clear();
              router.push("/login?role=receptionist");
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 650,
              color: "var(--rose)",
              background: "var(--rose-light)",
              border: "1px solid rgba(220,38,38,0.15)",
              padding: "10px 16px",
              borderRadius: 10,
              cursor: "pointer",
              transition: "all 140ms",
            }}
          >
            <span>🚪</span>
            <span>{lang === "en" ? "Logout" : "लॉगआउट"}</span>
          </button>
        </div>
      </footer>

      {/* ── Slide-over Settings Drawer ─────────────────────────────────────────── */}
      <AnimatePresence>
        {isSettingsOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="settings-backdrop"
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
              key="settings-drawer"
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
                maxWidth: 400,
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
                    ⚙️ {lang === "en" ? "Clinic Controls" : "क्लिनिक नियंत्रण"}
                  </h3>
                  <p style={{ fontSize: 11, color: "var(--text-3)", margin: "4px 0 0" }}>
                    {lang === "en" ? "Queue configuration and TV Display settings" : "कतार कॉन्फ़िगरेशन और टीवी डिस्प्ले सेटिंग्स"}
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
              <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 28, flex: 1 }}>
                {/* 1. Avg consultation time setting */}
                <div>
                  <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)", marginBottom: 12 }}>
                    ⏱ {lang === "en" ? "Average Consultation Duration" : "औसत परामर्श समय"}
                  </h4>
                  <div style={{ background: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--border)", padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "end", gap: 4 }}>
                        <input
                          type="number"
                          min="1"
                          max="120"
                          step="0.5"
                          value={avgTimeInput}
                          onChange={(e) => setAvgTimeInput(e.target.value)}
                          style={{
                            width: 80, fontSize: 28, fontWeight: 800,
                            background: "transparent", border: "none", borderBottom: "2px solid var(--border-2)",
                            color: "var(--text-1)", outline: "none", paddingBottom: 2, textAlign: "center"
                          }}
                        />
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-3)", marginBottom: 4 }}>min</span>
                      </div>
                    </div>

                    <div style={{ padding: "0 4px", marginBottom: 16 }}>
                      <input
                        type="range"
                        min="1"
                        max="60"
                        step="0.5"
                        value={Math.min(parseFloat(avgTimeInput) || 10, 60)}
                        onChange={(e) => setAvgTimeInput(e.target.value)}
                        style={{ width: "100%", height: 4, borderRadius: 2, background: "var(--border-2)", accentColor: "var(--brand)" }}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-3)", fontWeight: 600, marginTop: 6 }}>
                        <span>1m</span>
                        <span>30m</span>
                        <span>60m</span>
                      </div>
                    </div>

                    {/* Presets */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                      {[5, 10, 15, 20, 30].map((preset) => {
                        const isActive = parseFloat(avgTimeInput) === preset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setAvgTimeInput(String(preset))}
                            style={{
                              padding: "6px 0", borderRadius: 8, fontSize: 11, fontWeight: 700,
                              cursor: "pointer", border: "none", transition: "all 140ms",
                              background: isActive ? "var(--brand)" : "var(--surface)",
                              color: isActive ? "#fff" : "var(--text-2)",
                              boxShadow: isActive ? "0 2px 6px rgba(79,70,229,0.2)" : "none",
                            }}
                          >
                            {preset}m
                          </button>
                        );
                      })}
                    </div>

                    {/* Submit button for avg consultation */}
                    <button
                      onClick={(e) => handleSetAvgTimeSubmit(e)}
                      style={{
                        width: "100%", padding: "10px 0", marginTop: 16, borderRadius: 8,
                        background: "linear-gradient(135deg, var(--brand) 0%, #3B82F6 100%)",
                        color: "#fff", fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer",
                        boxShadow: "0 2px 8px rgba(79,70,229,0.2)",
                      }}
                    >
                      {lang === "en" ? "Save Duration" : "समय सहेजें"}
                    </button>
                  </div>
                </div>

                <div style={{ height: 1, background: "var(--border)" }} />

                {/* 2. TV Screen Remote Controls */}
                <div>
                  <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)", marginBottom: 12 }}>
                    📺 {lang === "en" ? "TV Screen Display Controls" : "टीवी स्क्रीन नियंत्रण"}
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* TV Language Toggle */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-2)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                        🌐 {lang === "en" ? "Display Language" : "भाषा प्रदर्शित करें"}
                      </span>
                      <button
                        onClick={() => {
                          const nextVal = tvLang === "en" ? "hi" : "en";
                          setTvLang(nextVal);
                          handleTvSettingChange(nextVal, tvVoice, tvPrivacy);
                        }}
                        style={{
                          padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                          background: "var(--surface)", border: "1px solid var(--border)",
                          color: "var(--text-2)", cursor: "pointer",
                        }}
                      >
                        {tvLang === "en" ? "English" : "हिन्दी"}
                      </button>
                    </div>

                    {/* TV Voice Assistant Toggle */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-2)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                        🔊 {lang === "en" ? "Voice Announcement" : "आवाज उद्घोषणा"}
                      </span>
                      <button
                        onClick={() => {
                          const nextVal = !tvVoice;
                          setTvVoice(nextVal);
                          handleTvSettingChange(tvLang, nextVal, tvPrivacy);
                        }}
                        style={{
                          padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                          cursor: "pointer", border: "none",
                          background: tvVoice ? "var(--emerald-light)" : "var(--rose-light)",
                          color: tvVoice ? "var(--emerald)" : "var(--rose)",
                        }}
                      >
                        {tvVoice ? (lang === "en" ? "ON" : "चालू") : (lang === "en" ? "OFF" : "बंद")}
                      </button>
                    </div>

                    {/* TV Privacy Mode Toggle */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-2)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                        👤 {lang === "en" ? "Privacy Protection" : "गोपनीयता सुरक्षा"}
                      </span>
                      <button
                        onClick={() => {
                          const nextVal = !tvPrivacy;
                          setTvPrivacy(nextVal);
                          handleTvSettingChange(tvLang, tvVoice, nextVal);
                        }}
                        style={{
                          padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                          cursor: "pointer", border: "none",
                          background: tvPrivacy ? "var(--amber-light)" : "var(--brand-light)",
                          color: tvPrivacy ? "var(--amber)" : "var(--brand)",
                        }}
                      >
                        {tvPrivacy ? (lang === "en" ? "Mask Name" : "नाम छिपाएं") : (lang === "en" ? "Show Name" : "नाम दिखाएं")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Undo Banner ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {undoState && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            style={{
              position: "fixed", bottom: 84, left: "50%", transform: "translateX(-50%)",
              zIndex: 50, width: "100%", maxWidth: 500, padding: "0 16px"
            }}
          >
            <div style={{
              background: "var(--rose)", color: "#fff", borderRadius: 16, padding: 16,
              boxShadow: "var(--shadow-lg)", display: "flex", alignItems: "center", justifyContent: "space-between",
              border: "1px solid rgba(220,38,38,0.2)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 20 }}>📢</span>
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
                    {lang === "en" ? "Called Token" : "टोकन बुलाया गया"} #{undoState.token} ({undoState.name})
                  </h4>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", margin: "2px 0 0" }}>
                    {lang === "en" ? "Undo will restore them to the front of the queue." : "पूर्ववत करने से वे कतार में सबसे आगे आ जाएंगे।"}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={handleUndo}
                  style={{
                    background: "#fff", color: "var(--rose)", fontWeight: 800, fontSize: 12,
                    padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                  }}
                >
                  {t.UNDO} ({undoState.timeLeft}s)
                </button>
                <button
                  onClick={() => setUndoState(null)}
                  style={{ color: "#fff", background: "transparent", border: "none", cursor: "pointer", padding: 6, fontSize: 12 }}
                >
                  ✕
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast Overlay ────────────────────────────────────────────────── */}
      <div style={{
        position: "fixed", top: 80, right: 24, zIndex: 50,
        display: "flex", flexDirection: "column", gap: 8, maxWidth: 360, width: "100%"
      }}>
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              style={{
                padding: 16, borderRadius: 12, boxShadow: "var(--shadow-md)",
                border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12,
                background: toast.type === "error"
                  ? "var(--rose-light)"
                  : toast.type === "info"
                  ? "var(--brand-light)"
                  : "var(--emerald-light)",
                color: toast.type === "error"
                  ? "var(--rose)"
                  : toast.type === "info"
                  ? "var(--brand)"
                  : "var(--emerald)",
              }}
            >
              <span style={{ fontSize: 16 }}>
                {toast.type === "error" ? "⚠️" : toast.type === "info" ? "ℹ️" : "✅"}
              </span>
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{toast.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── QR Code Modal ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {qrModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:p-0">
            <motion.div
              initial={{ opacity: 0, y: 150 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 150 }}
              className="bg-white border border-slate-200 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative flex flex-col items-center text-center print:border-none print:shadow-none print:bg-white print:text-black"
              id="print-area"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <button
                onClick={() => setQrModal(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 rounded-lg text-sm print:hidden"
                style={{ cursor: "pointer", background: "none", border: "none" }}
              >
                ✕
              </button>

              <div className="flex items-center gap-2 print:hidden">
                <span className="text-xs font-black uppercase text-indigo-400 tracking-wider bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                  {lang === "en" ? "Patient Token Registered" : "मरीज का टोकन पंजीकृत"}
                </span>
                {qrModal.priority && (
                  <span className="text-xs font-black uppercase text-amber-400 tracking-wider bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                    ⚡ {lang === "en" ? "Priority" : "प्राथमिकता"}
                  </span>
                )}
              </div>

              <h3 className="mt-4 text-2xl font-black text-white print:text-black">
                {qrModal.name}
              </h3>
              <p className="text-4xl font-black text-indigo-400 mt-2 print:text-black">
                {lang === "en" ? "Token" : "टोकन"} #{qrModal.token}
              </p>

              <div
                className="my-6 p-4 bg-white rounded-2xl shadow-inner inline-flex border border-slate-200"
                dangerouslySetInnerHTML={{ __html: qrModal.svg }}
              />

              <p className="text-xs text-slate-400 mb-6 print:hidden">
                {t.SCAN_QR}
              </p>

              <div className="flex gap-3 w-full print:hidden">
                <button
                  onClick={() => window.print()}
                  className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 shadow transition-all active:scale-95"
                >
                  🖨️ {t.PRINT_SLIP}
                </button>
                <button
                  onClick={() => setQrModal(null)}
                  className="flex-1 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 font-bold py-3 px-4 transition-all active:scale-95"
                >
                  {t.CLOSE}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          @page { size: auto; margin: 0; }
          html, body {
            height: 100% !important;
            overflow: hidden !important;
          }
          body * { visibility: hidden !important; }
          #print-area, #print-area * { visibility: visible !important; }
          #print-area {
            position: fixed !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            display: flex !important; flex-direction: column !important;
            align-items: center !important; justify-content: center !important;
            background: white !important; color: black !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
        }

        /* Premium range slider thumb */
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #6366f1;
          border: 3px solid #c7d2fe;
          cursor: pointer;
          box-shadow: 0 0 0 0 rgba(99,102,241,0.4);
          transition: box-shadow 0.15s ease, transform 0.15s ease;
        }
        input[type="range"]::-webkit-slider-thumb:hover {
          box-shadow: 0 0 0 6px rgba(99,102,241,0.25);
          transform: scale(1.1);
        }
        input[type="range"]::-webkit-slider-thumb:active {
          box-shadow: 0 0 0 8px rgba(99,102,241,0.2);
        }
        input[type="range"]::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #6366f1;
          border: 3px solid #c7d2fe;
          cursor: pointer;
          box-shadow: 0 0 0 0 rgba(99,102,241,0.4);
          transition: box-shadow 0.15s ease;
        }
        input[type="range"]::-moz-range-thumb:hover {
          box-shadow: 0 0 0 6px rgba(99,102,241,0.25);
        }

        /* Hide number input arrows */
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
}
