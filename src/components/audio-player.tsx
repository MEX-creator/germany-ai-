"use client";

import React, { useState, useRef, useCallback } from "react";
import { getPasscodeHeaders } from "@/lib/passcode";

interface AudioPlayerProps {
  text: string;
  className?: string;
}

/**
 * Audio player for TTS responses.
 *
 * Primary: fetches MP3 from /api/v1/tts (edge-tts neural voice).
 * Fallback: uses browser's SpeechSynthesisUtterance (Web Speech API)
 *   with a visible indicator so the user knows they're hearing a device voice.
 * Last resort: shows error message if neither works.
 */
export function AudioPlayer({ text, className }: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stopAll = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setPlaying(false);
  }, []);

  const playViaBrowser = useCallback(() => {
    if (!window.speechSynthesis) {
      setError(true);
      return;
    }

    setFallback(true);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "de-DE";
    utterance.rate = 0.85; // Slightly slower for language learning
    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => {
      setPlaying(false);
      setError(true);
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setPlaying(true);
  }, [text]);

  const handlePlay = useCallback(async () => {
    if (playing) {
      stopAll();
      return;
    }

    setError(false);
    setFallback(false);

    try {
      const res = await fetch("/api/v1/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getPasscodeHeaders(),
        },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        // Server TTS failed — fall back visibly to browser TTS
        console.warn("Server TTS unavailable, falling back to Web Speech API");
        playViaBrowser();
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setPlaying(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setPlaying(false);
        URL.revokeObjectURL(url);
        playViaBrowser();
      };

      await audio.play();
      setPlaying(true);
    } catch {
      // Network error — fall back to browser TTS
      playViaBrowser();
    }
  }, [text, playing, stopAll, playViaBrowser]);

  return (
    <div className={className}>
      <button
        onClick={handlePlay}
        className="inline-flex items-center space-x-1 rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
        title={playing ? "Stop" : "Listen"}
      >
        {playing ? (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
        )}
        <span>{playing ? "Stop" : "Listen"}</span>
      </button>

      {fallback && (
        <span className="ml-1 inline-flex items-center text-[10px] text-amber-600">
          ⚠️ Device voice
        </span>
      )}
      {error && (
        <span className="ml-1 inline-flex items-center text-[10px] text-red-500">
          TTS unavailable
        </span>
      )}
    </div>
  );
}
