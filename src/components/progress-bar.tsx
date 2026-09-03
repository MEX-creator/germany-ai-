"use client";

import React, { useEffect, useState } from "react";
import { getPasscodeHeaders } from "@/lib/passcode";

interface ProgressData {
  totalVocab: number;
  masteredVocab: number;
  reviewedVocab: number;
  level: string;
  percent: number;
}

/**
 * CEFR progress bar toward B2.
 * Derives progress from vocabulary mastery + review data.
 * A1: 0-50 vocab mastered, A2: 50-150, B1: 150-300, B2: 300+
 */
export function ProgressBar() {
  const [data, setData] = useState<ProgressData | null>(null);

  useEffect(() => {
    fetchProgress();
  }, []);

  async function fetchProgress() {
    try {
      const res = await fetch("/api/v1/progress", {
        headers: getPasscodeHeaders(),
      });
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch {
      // Silently fail — progress bar is non-critical
    }
  }

  if (!data) return null;

  const levels = [
    { label: "A1", threshold: 0 },
    { label: "A2", threshold: 25 },
    { label: "B1", threshold: 50 },
    { label: "B2", threshold: 75 },
    { label: "C1", threshold: 100 },
  ];

  return (
    <div className="flex items-center space-x-3">
      <div className="hidden flex-col items-end sm:flex">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-600">
          {data.level}
        </span>
        <span className="text-[10px] text-zinc-400">{data.masteredVocab} words</span>
      </div>
      <div className="relative h-2 w-24 overflow-hidden rounded-full bg-orange-100 sm:w-32">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-orange-400 to-amber-500 transition-all duration-500"
          style={{ width: `${Math.min(data.percent, 100)}%` }}
        />
        {/* Level markers */}
        {levels.slice(1, 4).map((lvl) => (
          <div
            key={lvl.label}
            className="absolute top-0 h-full w-px bg-white/60"
            style={{ left: `${lvl.threshold}%` }}
          />
        ))}
      </div>
    </div>
  );
}
