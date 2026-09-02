"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ReviewCard } from "@/components/review-card";
import { getPasscodeHeaders } from "@/lib/passcode";
import { toast } from "sonner";

interface VocabularyItem {
  id: number;
  german: string;
  english: string;
  example: string | null;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewAt: string;
}

export default function ReviewPage() {
  const [dueItems, setDueItems] = useState<VocabularyItem[]>([]);
  const [allItems, setAllItems] = useState<VocabularyItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reviewed, setReviewed] = useState(0);

  useEffect(() => {
    fetchVocabulary();
  }, []);

  async function fetchVocabulary() {
    try {
      const [dueRes, allRes] = await Promise.all([
        fetch("/api/v1/vocabulary?due=true", {
          headers: getPasscodeHeaders(),
        }),
        fetch("/api/v1/vocabulary", {
          headers: getPasscodeHeaders(),
        }),
      ]);

      if (dueRes.ok) {
        const { items } = await dueRes.json();
        setDueItems(items);
      }
      if (allRes.ok) {
        const { items } = await allRes.json();
        setAllItems(items);
      }
    } catch {
      toast.error("Failed to load vocabulary");
    } finally {
      setLoading(false);
    }
  }

  async function handleRate(id: number, rating: number) {
    try {
      const res = await fetch("/api/v1/vocabulary", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getPasscodeHeaders(),
        },
        body: JSON.stringify({ id, rating }),
      });

      if (!res.ok) throw new Error("Failed to submit review");

      // Move to next card
      setCurrentIndex((prev) => prev + 1);
      setReviewed((prev) => prev + 1);

      // Refresh due items
      fetchVocabulary();
    } catch {
      toast.error("Failed to submit review");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-red-600" />
      </div>
    );
  }

  const currentItem = dueItems[currentIndex];
  const isDone = currentIndex >= dueItems.length;

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <Link
            href="/"
            className="flex items-center space-x-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            <span>Back to Chat</span>
          </Link>
          <h1 className="text-lg font-semibold">
            <span className="text-red-600">Review</span>
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 py-8">
        {dueItems.length === 0 ? (
          <div className="space-y-6 text-center">
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
              <p className="text-4xl">🎉</p>
              <p className="mt-4 text-lg font-medium text-zinc-900">
                All caught up!
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                No vocabulary items due for review right now.
                {allItems.length > 0 && (
                  <span>
                    {" "}You have {allItems.length} item{allItems.length !== 1 ? "s" : ""} in your collection.
                  </span>
                )}
              </p>
            </div>
          </div>
        ) : isDone ? (
          <div className="space-y-6 text-center">
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
              <p className="text-4xl">💪</p>
              <p className="mt-4 text-lg font-medium text-zinc-900">
                Session complete!
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                You reviewed {reviewed} item{reviewed !== 1 ? "s" : ""}. Keep it up!
              </p>
              <Link
                href="/"
                className="mt-6 inline-block rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Back to Chat
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Progress bar */}
            <div className="text-center text-sm text-zinc-500">
              {currentIndex + 1} of {dueItems.length} due
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full rounded-full bg-red-500 transition-all duration-300"
                style={{
                  width: `${((currentIndex) / dueItems.length) * 100}%`,
                }}
              />
            </div>

            {/* Card */}
            {currentItem && (
              <ReviewCard
                key={currentItem.id}
                item={currentItem}
                onRate={handleRate}
                isLast={currentIndex === dueItems.length - 1}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
