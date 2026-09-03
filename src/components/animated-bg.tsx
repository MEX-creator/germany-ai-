"use client";

import React from "react";

interface AnimatedBGProps {
  className?: string;
}

export function AnimatedBG({ className = "" }: AnimatedBGProps) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {/* Subtle gradient orbs */}
      <div
        className="absolute -left-32 -top-32 h-96 w-96 rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, hsl(25 85% 65% / 0.3), transparent 70%)",
          animation: "float-1 20s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full opacity-15"
        style={{
          background: "radial-gradient(circle, hsl(35 90% 60% / 0.25), transparent 70%)",
          animation: "float-2 25s ease-in-out infinite",
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-10"
        style={{
          background: "radial-gradient(circle, hsl(30 80% 70% / 0.3), transparent 70%)",
          animation: "float-3 30s ease-in-out infinite",
        }}
      />
      <style jsx>{`
        @keyframes float-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -20px) scale(1.05); }
          66% { transform: translate(-20px, 15px) scale(0.95); }
        }
        @keyframes float-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-25px, 20px) scale(1.08); }
          66% { transform: translate(15px, -25px) scale(0.92); }
        }
        @keyframes float-3 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.1); }
        }
      `}</style>
    </div>
  );
}
