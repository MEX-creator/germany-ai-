"use client";

import React, { useState } from "react";
import { storePasscode } from "@/lib/passcode";

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

      // Any other response means the passcode worked
      storePasscode(passcode);
      onVerified();
    } catch {
      setError("Could not verify passcode. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">
            <span className="text-red-600">Sprache</span>{" "}
            <span className="text-zinc-900">AI</span>
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Enter the passcode to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Passcode"
            autoFocus
            className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-center text-lg tracking-widest text-zinc-900 placeholder-zinc-400 transition-colors focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
          />

          {error && (
            <p className="text-center text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !passcode.trim()}
            className="w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
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
