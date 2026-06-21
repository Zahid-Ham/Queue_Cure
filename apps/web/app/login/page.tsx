"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = searchParams.get("role") || "receptionist";

  const [hospitalId, setHospitalId] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState(initialRole);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${backendUrl}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospitalId, pin, role }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      // Save credentials in sessionStorage
      sessionStorage.setItem("hospitalId", data.hospitalId);
      sessionStorage.setItem("hospitalName", data.name);
      sessionStorage.setItem("role", role);
      sessionStorage.setItem("pin", pin);

      // Redirect based on role
      if (role === "doctor") {
        router.push("/doctor");
      } else {
        router.push("/receptionist");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6 transition-colors duration-300 font-sans">
      <div className="max-w-md w-full rounded-2xl border border-stone-200 dark:border-slate-900 bg-white dark:bg-slate-900/40 p-8 shadow-xl backdrop-blur-md text-center">
        
        {/* Brand */}
        <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white font-black text-lg shadow-md mx-auto mb-4">
          Q
        </div>
        <h1 className="text-2xl font-black mb-2 tracking-tight">
          Welcome to QueueCure
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Access your clinic's queue dashboard
        </p>

        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-left">
          {/* Hospital ID */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Hospital ID
            </label>
            <input
              type="text"
              required
              value={hospitalId}
              onChange={(e) => setHospitalId(e.target.value)}
              placeholder="e.g., citycare"
              className="w-full rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950/60 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all duration-300"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Your Role
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole("receptionist")}
                className={`py-2.5 rounded-xl text-xs font-bold border transition-all duration-300 ${
                  role === "receptionist"
                    ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600"
                    : "border-stone-200 dark:border-slate-850 hover:bg-stone-100 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400"
                }`}
              >
                📋 Receptionist
              </button>
              <button
                type="button"
                onClick={() => setRole("doctor")}
                className={`py-2.5 rounded-xl text-xs font-bold border transition-all duration-300 ${
                  role === "doctor"
                    ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600"
                    : "border-stone-200 dark:border-slate-850 hover:bg-stone-100 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400"
                }`}
              >
                🩺 Doctor
              </button>
            </div>
          </div>

          {/* PIN */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              4-Digit Access PIN
            </label>
            <input
              type="password"
              maxLength={4}
              required
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              className="w-full text-center tracking-widest font-mono text-xl rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950/60 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all duration-300"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-500 active:scale-[0.99] transition-all cursor-pointer shadow-md disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-stone-150 dark:border-slate-900 text-xs text-slate-500 dark:text-slate-400">
          Want to register a new hospital?{" "}
          <Link href="/register" className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">
            Register Hospital
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
