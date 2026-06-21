"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [receptionistPin, setReceptionistPin] = useState("");
  const [doctorPin, setDoctorPin] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Basic Validation
    if (receptionistPin.length !== 4 || doctorPin.length !== 4) {
      setError("PINs must be exactly 4 digits.");
      setLoading(false);
      return;
    }

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${backendUrl}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name, receptionistPin, doctorPin }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to register");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/login?role=receptionist`);
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Registration failed. Try a different Hospital ID.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6 transition-colors duration-300 font-sans">
      <div className="max-w-md w-full rounded-2xl border border-stone-200 dark:border-slate-900 bg-white dark:bg-slate-900/40 p-8 shadow-xl backdrop-blur-md">
        <div className="text-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white font-black text-lg shadow-md mx-auto mb-4">
            Q
          </div>
          <h1 className="text-2xl font-black mb-2 tracking-tight">
            Register Hospital
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Create a secure space for your clinic queue
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold text-center">
            ⚠️ {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold text-center">
            🎉 Hospital registered successfully! Redirecting to login...
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          {/* Hospital Name */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Hospital / Clinic Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., City Care Clinic"
              className="w-full rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950/60 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all duration-300"
            />
          </div>

          {/* Hospital ID */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Hospital ID (Unique Slug)
            </label>
            <input
              type="text"
              required
              value={id}
              onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="e.g., citycare"
              className="w-full rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950/60 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all duration-300"
            />
            <p className="text-[10px] text-slate-400 mt-1.5">
              Only letters, numbers, and hyphens allowed. This will be your login ID.
            </p>
          </div>

          {/* PINs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Receptionist PIN
              </label>
              <input
                type="password"
                maxLength={4}
                required
                value={receptionistPin}
                onChange={(e) => setReceptionistPin(e.target.value.replace(/\D/g, ""))}
                placeholder="4 digits"
                className="w-full text-center tracking-widest font-mono rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950/60 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all duration-300"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Doctor PIN
              </label>
              <input
                type="password"
                maxLength={4}
                required
                value={doctorPin}
                onChange={(e) => setDoctorPin(e.target.value.replace(/\D/g, ""))}
                placeholder="4 digits"
                className="w-full text-center tracking-widest font-mono rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950/60 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all duration-300"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || success}
            className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-500 active:scale-[0.99] transition-all cursor-pointer shadow-md disabled:opacity-50 mt-2"
          >
            {loading ? "Registering..." : "Register Hospital"}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-stone-150 dark:border-slate-900 text-xs text-slate-500 dark:text-slate-400 text-center">
          Already registered?{" "}
          <Link href="/login" className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
