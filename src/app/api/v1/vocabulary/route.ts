import { NextResponse, NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { reviewCard, isDue } from "@/lib/sm2";
import { verifyPasscode } from "@/lib/passcode";

const prisma = new PrismaClient();

/**
 * GET /api/v1/vocabulary — List vocabulary items.
 *   ?due=true  → only items due for review
 *   ?all=true  → all items (default: all)
 */
export async function GET(req: NextRequest) {
  const passcode = req.headers.get("x-passcode") ?? "";
  if (!verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  try {
    const dueOnly = req.nextUrl.searchParams.get("due") === "true";

    const where = dueOnly
      ? { nextReviewAt: { lte: new Date() } }
      : {};

    const items = await prisma.vocabularyItem.findMany({
      where,
      orderBy: dueOnly
        ? { nextReviewAt: "asc" }
        : { createdAt: "desc" },
    });

    return NextResponse.json({ items }, { status: 200 });
  } catch (error) {
    console.error("Vocabulary fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch vocabulary" }, { status: 500 });
  }
}

/**
 * POST /api/v1/vocabulary — Add a vocabulary item manually.
 */
export async function POST(req: NextRequest) {
  const passcode = req.headers.get("x-passcode") ?? "";
  if (!verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  try {
    const { german, english, example } = await req.json();

    if (!german || !english) {
      return NextResponse.json(
        { error: "german and english are required" },
        { status: 400 },
      );
    }

    // Check for duplicate
    const existing = await prisma.vocabularyItem.findFirst({
      where: { german },
    });

    if (existing) {
      return NextResponse.json(
        { error: "This word is already in your vocabulary" },
        { status: 409 },
      );
    }

    const item = await prisma.vocabularyItem.create({
      data: { german, english, example: example ?? null },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("Vocabulary create error:", error);
    return NextResponse.json({ error: "Failed to add vocabulary" }, { status: 500 });
  }
}

/**
 * PATCH /api/v1/vocabulary — Submit a review (rating) for a vocabulary item.
 * Body: { id: number, rating: number }
 * Rating: 0 (again), 2 (hard), 3 (good), 5 (perfect)
 */
export async function PATCH(req: NextRequest) {
  const passcode = req.headers.get("x-passcode") ?? "";
  if (!verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  try {
    const { id, rating } = await req.json();

    if (!id || rating === undefined) {
      return NextResponse.json(
        { error: "id and rating are required" },
        { status: 400 },
      );
    }

    const item = await prisma.vocabularyItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json({ error: "Vocabulary item not found" }, { status: 404 });
    }

    // Run SM-2 algorithm
    const { card: newCard, log } = reviewCard(
      {
        easeFactor: item.easeFactor,
        interval: item.interval,
        repetitions: item.repetitions,
        nextReviewAt: item.nextReviewAt,
      },
      rating,
    );

    // Update the card and save review log in a transaction
    const [updatedItem] = await prisma.$transaction([
      prisma.vocabularyItem.update({
        where: { id },
        data: {
          easeFactor: newCard.easeFactor,
          interval: newCard.interval,
          repetitions: newCard.repetitions,
          nextReviewAt: newCard.nextReviewAt,
          lastReviewedAt: log.reviewedAt,
        },
      }),
      prisma.reviewLog.create({
        data: {
          vocabularyItemId: id,
          rating: log.rating,
          easeFactor: log.easeFactor,
          interval: log.interval,
        },
      }),
    ]);

    return NextResponse.json({ item: updatedItem }, { status: 200 });
  } catch (error) {
    console.error("Vocabulary review error:", error);
    return NextResponse.json({ error: "Failed to submit review" }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/vocabulary — Delete a vocabulary item.
 */
export async function DELETE(req: NextRequest) {
  const passcode = req.headers.get("x-passcode") ?? "";
  if (!verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  try {
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await prisma.vocabularyItem.delete({
      where: { id: parseInt(id) },
    });

    return NextResponse.json({ message: "Vocabulary item deleted" }, { status: 200 });
  } catch (error) {
    console.error("Vocabulary delete error:", error);
    return NextResponse.json({ error: "Failed to delete vocabulary" }, { status: 500 });
  }
}
