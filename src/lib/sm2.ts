/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Based on the SuperMemo 2 algorithm by Piotr Wozniak.
 * This is the same algorithm used by Anki.
 *
 * Rating scale (mapped from our UI buttons):
 *   0 = "Again" — complete blackout
 *   2 = "Hard"  — incorrect, but the answer was easy to recall
 *   3 = "Good"  — correct with serious difficulty
 *   5 = "Perfect" — perfect response
 *
 * We use 0/2/3/5 to match Anki's simplified scale.
 */

export interface CardState {
  easeFactor: number;
  interval: number; // days
  repetitions: number;
  nextReviewAt: Date;
}

export interface ReviewResult {
  card: CardState;
  log: {
    rating: number;
    easeFactor: number;
    interval: number;
    reviewedAt: Date;
  };
}

/**
 * Process a review and return the updated card state.
 *
 * @param card - current card state
 * @param rating - 0 (again), 2 (hard), 3 (good), 5 (perfect)
 */
export function reviewCard(card: CardState, rating: number): ReviewResult {
  const now = new Date();
  let { easeFactor, interval, repetitions } = card;

  if (rating < 0 || rating > 5) {
    throw new Error(`Invalid rating: ${rating}. Must be 0-5.`);
  }

  if (rating < 3) {
    // Failed review — reset repetitions
    repetitions = 0;
    interval = 0;
  } else {
    // Successful review
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  }

  // Update ease factor using the SM-2 formula
  // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  easeFactor =
    easeFactor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02));

  // Ease factor minimum is 1.3 (Anki convention)
  if (easeFactor < 1.3) {
    easeFactor = 1.3;
  }

  // Calculate next review date
  const nextReviewAt = new Date(now);
  nextReviewAt.setDate(nextReviewAt.getDate() + interval);

  return {
    card: {
      easeFactor: Math.round(easeFactor * 100) / 100,
      interval,
      repetitions,
      nextReviewAt,
    },
    log: {
      rating,
      easeFactor: Math.round(easeFactor * 100) / 100,
      interval,
      reviewedAt: now,
    },
  };
}

/**
 * Create a new card (fresh vocabulary item).
 * New cards are immediately due for review.
 */
export function createNewCard(): CardState {
  return {
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReviewAt: new Date(), // due immediately
  };
}

/**
 * Check if a card is due for review.
 */
export function isDue(card: CardState, now?: Date): boolean {
  const nowTime = now ?? new Date();
  return card.nextReviewAt <= nowTime;
}

/**
 * Map our UI button labels to SM-2 ratings.
 */
export const RATING_MAP = {
  again: 0,
  hard: 2,
  good: 3,
  perfect: 5,
} as const;

export type RatingLabel = keyof typeof RATING_MAP;
