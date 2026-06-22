"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";

// ── Theme Toggle ──────────────────────────────────────────────────────────────
function ThemeToggle({ theme, onToggle }: { theme: "light" | "dark"; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label="Toggle theme"
      style={{
        width: 36, height: 36,
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--text-2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
        transition: "all 140ms",
        flexShrink: 0,
      }}
    >
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      )}
    </button>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────
const stats = [
  { value: "76%", label: "of Indian clinics still rely on paper tokens" },
  { value: "~45 min", label: "average patient wait time in OPDs" },
  { value: "0", label: "patient apps or code installs required" },
  { value: "Real-time", label: "queue synchronization across screens" },
];

const steps = [
  {
    number: "01",
    title: "Receptionist registers patient",
    desc: "Simply add a patient name on the fast desktop dashboard. Priority flags automatically push emergencies forward.",
  },
  {
    number: "02",
    title: "Patient scans QR code slip",
    desc: "A custom printed slip generates a unique live tracking link. No mobile app download or credentials required.",
  },
  {
    number: "03",
    title: "Doctor calls — screens sync",
    desc: "One click announcement broadcast. Waiting room display, patient phones, and receptionist view update instantly.",
  },
];

const features = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
    ),
    title: "Instant State Syncing",
    desc: "Powered by Socket.io room broadcasts. When a doctor marks a patient done or calls next, every single dashboard updates under 100 milliseconds.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    ),
    title: "Smart Consultation Averages",
    desc: "Estimates waiting duration dynamically based on a rolling average of actual consultation completion times instead of static guesswork.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
    ),
    title: "Priority Flagging",
    desc: "Tag critical, elderly, or emergency cases so they safely skip ahead in line with immediate display broadcast.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
    ),
    title: "Background Push Alert",
    desc: "Updates patients via instant web notifications so they never miss their turn even if they step out for fresh air.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
    ),
    title: "Single-Page Token Slips",
    desc: "Optimized printing layout limits the token and QR code to a single sheet, eliminating paper waste and duplicate print triggers.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    ),
    title: "Import / Export CSV",
    desc: "Quickly migrate list logs. Import pre-registered patient spreadsheets or export complete logs for compliance storage.",
  },
];

const portals = [
  {
    href: "/receptionist",
    label: "Receptionist Portal",
    desc: "Register patients, manage state queue, customize wait limits",
    badge: undefined,
    accent: "var(--brand)",
    accentLight: "var(--brand-mid)",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
    ),
  },
  {
    href: "/doctor",
    label: "Doctor Panel",
    desc: "Check waiting queue, call next in turn, log consultations",
    badge: undefined,
    accent: "#0284C7",
    accentLight: "rgba(2,132,199,0.08)",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
    ),
  },
  {
    href: "/display",
    label: "Waiting TV Screen",
    desc: "Announcement TV interface featuring voice assistants and live token alerts",
    badge: undefined,
    accent: "var(--emerald)",
    accentLight: "var(--emerald-light)",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
    ),
  },
  {
    href: "/patient?token=1&clinic=clinic-001",
    label: "Patient Tracker",
    desc: "Real-time token wait monitoring directly from mobile browser",
    badge: undefined,
    accent: "#7C3AED",
    accentLight: "rgba(124,58,237,0.08)",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="17" r="1"/></svg>
    ),
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease: "easeOut" as any },
};

export default function LandingPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme") as "light" | "dark" | null;
    const prefersDark = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = saved || (prefersDark ? "dark" : "light");
    setTheme(initial);
    if (initial === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    if (next === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  };

  return (
    <div style={{ background: "var(--bg)", color: "var(--text-1)", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', Inter, system-ui, sans-serif", transition: "background 0.3s, color 0.3s" }}>
      {/* ── NAV ─────────────────────────────────────────────────────── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        height: 64,
        background: "var(--surface)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center",
        padding: "0 32px", gap: 24,
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flexShrink: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: "linear-gradient(135deg, var(--brand) 0%, #3B82F6 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 800, fontSize: 13, letterSpacing: "-0.02em",
            boxShadow: "0 4px 12px rgba(79,70,229,0.30)",
          }}>Q</div>
          <span style={{ fontWeight: 800, fontSize: 17, color: "var(--text-1)", letterSpacing: "-0.03em" }}>
            Queue<span style={{ color: "var(--brand)" }}>Cure</span>
          </span>
        </Link>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Desktop Nav Links */}
        <div className="hidden md:flex" style={{ alignItems: "center", gap: 8 }}>
          {[["How it works", "#how-it-works"], ["Features", "#features"], ["Demo Portals", "#portals"]].map(([label, href]) => (
            <a key={label} href={href} style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 14, fontWeight: 650,
              color: "var(--text-2)", textDecoration: "none",
              transition: "all 140ms",
            }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = "var(--text-1)"; (e.target as HTMLElement).style.background = "var(--surface-2)"; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = "var(--text-2)"; (e.target as HTMLElement).style.background = "transparent"; }}
            >{label}</a>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <Link href="/receptionist"
            className="hidden md:inline-flex"
            style={{
              height: 38, padding: "0 18px", borderRadius: 10,
              background: "var(--brand)",
              color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none",
              alignItems: "center", gap: 6,
              boxShadow: "0 4px 14px rgba(79,70,229,0.30)",
              transition: "all 140ms",
            }}
          >
            Launch Dashboard →
          </Link>
          {/* Mobile hamburger */}
          <button
            className="md:hidden"
            onClick={() => setMenuOpen(v => !v)}
            style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            {menuOpen
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            }
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{ position: "fixed", top: 64, left: 0, right: 0, bottom: 0, zIndex: 99, background: "var(--surface)", padding: "24px 32px", display: "flex", flexDirection: "column", gap: 8 }}>
          {[["How it works", "#how-it-works"], ["Features", "#features"], ["Demo Portals", "#portals"]].map(([label, href]) => (
            <a key={label} href={href} onClick={() => setMenuOpen(false)} style={{ padding: "14px 0", fontSize: 18, fontWeight: 600, color: "var(--text-1)", textDecoration: "none", borderBottom: "1px solid var(--border)" }}>{label}</a>
          ))}
          <Link href="/receptionist" style={{ marginTop: 16, padding: "14px 0", fontSize: 16, fontWeight: 700, color: "var(--brand)", textDecoration: "none" }}>Launch Dashboard →</Link>
        </div>
      )}

      {/* ── HERO ────────────────────────────────────────────────────── */}
      <section style={{ padding: "100px 32px 80px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ maxWidth: 900 }}>
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 28 }}
          >
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "6px 16px",
              borderRadius: 99,
              border: "1.5px solid var(--border)",
              background: "var(--surface)",
              fontSize: 12, fontWeight: 700,
              color: "var(--text-2)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              boxShadow: "var(--shadow-sm)",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", display: "inline-block", animation: "pulse 2s infinite" }} />
              Wooble Premium Design System
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            style={{ fontSize: "clamp(46px, 7vw, 84px)", fontWeight: 800, lineHeight: 1.02, letterSpacing: "-0.04em", margin: 0, marginBottom: 28 }}
          >
            Ditch paper tokens.<br />
            Upgrade to a{" "}
            <span style={{
              color: "var(--brand)",
              background: "linear-gradient(135deg, var(--brand) 0%, #3B82F6 100%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>live clinical</span> queue.
          </motion.h1>

          {/* Subhead */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            style={{ fontSize: "clamp(17px, 2.2vw, 21px)", color: "var(--text-2)", lineHeight: 1.6, maxWidth: 660, marginBottom: 44 }}
          >
            QueueCure replaces waiting room chaos with dynamic wait estimates, smart priority queueing, and live socket syncs. Real-world ready, optimized for receptionist speed.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: "flex", flexWrap: "wrap", gap: 14 }}
          >
            <Link href="/receptionist" style={{
              height: 52, padding: "0 32px", borderRadius: 12,
              background: "linear-gradient(135deg, var(--brand) 0%, #3B82F6 100%)",
              color: "#fff", fontWeight: 700, fontSize: 15, textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: 8,
              boxShadow: "0 8px 24px rgba(79,70,229,0.25)",
              transition: "all 140ms",
            }}>
              Launch Receptionist Panel
            </Link>
            <a href="#portals" style={{
              height: 52, padding: "0 28px", borderRadius: 12,
              background: "var(--surface)", color: "var(--text-1)", fontWeight: 700, fontSize: 15, textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: 8,
              border: "1.5px solid var(--border)",
              boxShadow: "var(--shadow-sm)",
              transition: "all 140ms",
            }}>
              Explore portals ↓
            </a>
          </motion.div>
        </div>
      </section>

      {/* ── STATS STRIP ─────────────────────────────────────────────── */}
      <motion.section {...fadeUp} style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--surface)", padding: "0 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {stats.map((stat, i) => (
            <div key={i} style={{ padding: "32px 24px", borderRight: i < stats.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div style={{ fontSize: "clamp(26px, 3vw, 36px)", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text-1)" }}>{stat.value}</div>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4, lineHeight: 1.5, fontWeight: 550 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ padding: "100px 32px", maxWidth: 1200, margin: "0 auto" }}>
        <motion.div {...fadeUp}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--brand)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
            HOW IT WORKS
          </p>
          <h2 style={{ fontSize: "clamp(30px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 64, maxWidth: 560 }}>
            Simple deployment. Seamless flow.
          </h2>
        </motion.div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          {steps.map((step, i) => (
            <motion.div
              key={i}
              {...fadeUp}
              transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              style={{
                padding: "44px 36px",
                border: "1px solid var(--border)",
                borderRadius: 16,
                background: "var(--surface)",
                position: "relative",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--brand)", letterSpacing: "0.06em", marginBottom: 16 }}>{step.number}</div>
              <h3 style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 12, lineHeight: 1.3, color: "var(--text-1)" }}>{step.title}</h3>
              <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.65 }}>{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: "0 32px 100px", maxWidth: 1200, margin: "0 auto" }}>
        <motion.div {...fadeUp}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--brand)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
            CLINICAL EXCELLENCE
          </p>
          <h2 style={{ fontSize: "clamp(30px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 48 }}>
            Engineered for modern clinic workflows.
          </h2>
        </motion.div>

        {/* Bento grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          {features.map((f, i) => (
            <motion.div
              key={i}
              {...fadeUp}
              transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              style={{
                padding: "32px",
                border: "1px solid var(--border)",
                borderRadius: 16,
                background: "var(--surface)",
                display: "flex", flexDirection: "column", gap: 16,
                transition: "all 140ms",
              }}
              whileHover={{ y: -2, boxShadow: "var(--shadow-md)", borderColor: "var(--brand)" }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: "var(--brand-mid)",
                color: "var(--brand)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                {f.icon}
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.01em", color: "var(--text-1)" }}>{f.title}</h3>
                <p style={{ fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── PORTALS ─────────────────────────────────────────────────── */}
      <section id="portals" style={{ padding: "90px 32px", background: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <motion.div {...fadeUp} style={{ marginBottom: 48 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--brand)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
              INTERACTIVE DEMO
            </p>
            <h2 style={{ fontSize: "clamp(30px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.03em" }}>
              Explore the system live.
            </h2>
            <p style={{ fontSize: 16, color: "var(--text-2)", marginTop: 12, maxWidth: 500, lineHeight: 1.6 }}>
              Open these panels side by side to experience the real-time websocket updates across different roles.
            </p>
          </motion.div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            {portals.map((p, i) => (
              <motion.div key={i} {...fadeUp} transition={{ duration: 0.5, delay: i * 0.07 }}>
                <Link href={p.href} style={{
                  display: "block",
                  padding: "28px",
                  border: "1.5px solid var(--border)",
                  borderRadius: 16,
                  background: "var(--bg)",
                  textDecoration: "none",
                  color: "var(--text-1)",
                  transition: "all 180ms",
                  position: "relative",
                  overflow: "hidden",
                }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = p.accent;
                    el.style.boxShadow = `0 8px 24px ${p.accent}15`;
                    el.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = "var(--border)";
                    el.style.boxShadow = "none";
                    el.style.transform = "translateY(0)";
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: p.accentLight,
                    color: p.accent,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 16,
                  }}>
                    {p.icon}
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.01em", color: "var(--text-1)" }}>{p.label}</h3>
                  <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.55 }}>{p.desc}</p>
                  {p.badge && (
                    <span style={{
                      display: "inline-block", marginTop: 14,
                      padding: "3px 10px", borderRadius: 99,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      fontSize: 11, fontWeight: 700, color: "var(--brand)",
                      letterSpacing: "0.04em",
                    }}>{p.badge}</span>
                  )}
                  <div style={{ position: "absolute", top: 24, right: 24, color: p.accent, opacity: 0.4 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ──────────────────────────────────────────────── */}
      <section style={{ padding: "100px 32px" }}>
        <motion.div
          {...fadeUp}
          style={{
            maxWidth: 780, margin: "0 auto", textAlign: "center",
            padding: "64px 48px",
            border: "1px solid var(--border)",
            borderRadius: 24,
            background: "var(--surface)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: "0 auto 24px",
            background: "linear-gradient(135deg, var(--brand) 0%, #3B82F6 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 8px 24px rgba(79,70,229,0.30)",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <h2 style={{ fontSize: "clamp(26px, 3.5vw, 38px)", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 16, color: "var(--text-1)" }}>
            Ready to eliminate waiting room chaos?
          </h2>
          <p style={{ fontSize: 16, color: "var(--text-2)", marginBottom: 36, lineHeight: 1.65 }}>
            Open the receptionist dashboard and register your first patient in 10 seconds.
          </p>
          <Link href="/receptionist" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            height: 52, padding: "0 32px", borderRadius: 12,
            background: "linear-gradient(135deg, var(--brand) 0%, #3B82F6 100%)",
            color: "#fff", fontWeight: 700, fontSize: 15, textDecoration: "none",
            boxShadow: "0 8px 24px rgba(79,70,229,0.25)",
          }}>
            Open Receptionist Dashboard
          </Link>
        </motion.div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "40px 32px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7,
            background: "linear-gradient(135deg, var(--brand) 0%, #3B82F6 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 800, fontSize: 11,
          }}>Q</div>
          <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "-0.02em", color: "var(--text-1)" }}>QueueCure</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>
          QueueCure &apos;26 · Wooble Hackathon ·{" "}
          <span style={{ color: "var(--brand)", fontWeight: 600 }}>Next.js + Socket.IO + Redis</span>
        </p>
        <div style={{ display: "flex", gap: 4 }}>
          {[["Receptionist", "/receptionist"], ["Doctor", "/doctor"], ["Display", "/display"]].map(([label, href]) => (
            <Link key={label} href={href} style={{
              padding: "5px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              color: "var(--text-2)", textDecoration: "none",
              transition: "all 140ms",
            }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = "var(--text-1)"; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = "var(--text-2)"; }}
            >{label}</Link>
          ))}
        </div>
      </footer>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
