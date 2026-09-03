"use client";

import React, { useState } from "react";
import { storePasscode } from "@/lib/passcode";
import { BlurText } from "@/components/blur-text";
import { AnimatedBG } from "@/components/animated-bg";

interface PasscodeGateProps {
  onVerified: () => void;
}

export function PasscodeGate({ onVerified }: PasscodeGateProps) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/speech", {
        method: "GET",
        headers: { "x-passcode": passcode },
      });

      if (res.status === 401) {
        setError("Incorrect passcode. Try again.");
        return;
      }

      storePasscode(passcode);
      onVerified();
    } catch {
      setError("Could not verify passcode. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50">
      <AnimatedBG />
      <div className="glass relative z-10 w-full max-w-sm rounded-3xl border border-white/60 p-10 shadow-apple-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-600 shadow-apple-md">
            <span className="text-2xl">🇩🇪</span>
          </div>
          <BlurText
            text="Sprache AI"
            className="text-2xl font-bold tracking-tight text-zinc-900"
            delay={100}
          />
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            Enter the passcode to continue learning
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Passcode"
            autoFocus
            className="w-full rounded-2xl border border-orange-100 bg-white/80 px-5 py-3.5 text-center text-lg tracking-widest text-zinc-900 placeholder-zinc-400 shadow-apple-sm transition-all focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:shadow-apple-md"
          />

          {error && (
            <p className="text-center text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !passcode.trim()}
            className="w-full rounded-2xl bg-orange-600 px-4 py-3.5 text-sm font-medium text-white shadow-apple-sm transition-all hover:bg-orange-700 hover:shadow-apple-md active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Verifying...</span>
              </div>
            ) : (
              "Continue"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
