"use client";

import React, { useState } from "react";
import { AudioPlayer } from "@/components/audio-player";

interface VocabularyItem {
  id: number;
  german: string;
  english: string;
  example: string | null;
  easeFactor: number;
  interval: number;
  repetitions: number;
}

interface ReviewCardProps {
  item: VocabularyItem;
  onRate: (id: number, rating: number) => void;
  isLast?: boolean;
}

/**
 * A flashcard for spaced repetition review.
 * Shows German word → reveals English translation + example.
 * Rating buttons: Again / Hard / Good / Easy.
 */
export function ReviewCard({ item, onRate, isLast }: ReviewCardProps) {
  const [revealed, setRevealed] = useState(false);

  if (!revealed) {
    return (
      <div className="mx-auto max-w-md">
        <div
          className="flex min-h-[200px] cursor-pointer items-center justify-center rounded-2xl border-2 border-zinc-200 bg-white p-8 shadow-sm transition-all hover:border-red-200 hover:shadow-md"
          onClick={() => setRevealed(true)}
        >
          <div className="text-center">
            <p className="text-3xl font-bold text-zinc-900">{item.german}</p>
            <p className="mt-4 text-sm text-zinc-400">Tap to reveal</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {/* German word */}
      <div className="rounded-2xl border-2 border-red-100 bg-red-50 p-8 text-center shadow-sm">
        <p className="text-3xl font-bold text-zinc-900">{item.german}</p>
      </div>

      {/* English translation */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <p className="text-xl text-zinc-700">{item.english}</p>
        {item.example && (
          <p className="mt-3 text-sm italic text-zinc-500">
            &ldquo;{item.example}&rdquo;
          </p>
        )}
        <div className="mt-3">
          <AudioPlayer text={item.german} />
        </div>
      </div>

      {/* Rating buttons */}
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={() => onRate(item.id, 0)}
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 active:bg-red-200"
        >
          Again
        </button>
        <button
          onClick={() => onRate(item.id, 2)}
          className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-3 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100 active:bg-orange-200"
        >
          Hard
        </button>
        <button
          onClick={() => onRate(item.id, 3)}
          className="rounded-xl border border-green-200 bg-green-50 px-3 py-3 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 active:bg-green-200"
        >
          Good
        </button>
        <button
          onClick={() => onRate(item.id, 5)}
          className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 active:bg-blue-200"
        >
          Easy
        </button>
      </div>
    </div>
  );
}
