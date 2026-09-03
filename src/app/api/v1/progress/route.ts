import { NextResponse, NextRequest } from "next/server";
import { db } from "@/server/db";
import { verifyPasscode } from "@/lib/passcode";

const prisma = db;

export async function GET(req: NextRequest) {
  const passcode = req.headers.get("x-passcode") ?? "";
  if (!verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  try {
    const allItems = await prisma.vocabularyItem.findMany({
      select: { repetitions: true, interval: true, easeFactor: true },
    });

    const totalVocab = allItems.length;
    const masteredVocab = allItems.filter(
      (i: any) => i.repetitions >= 3 && i.interval >= 7
    ).length;
    const reviewedVocab = allItems.filter((i: any) => i.repetitions > 0).length;

    const thresholds = [
      { label: "A1", min: 0, max: 50 },
      { label: "A2", min: 50, max: 150 },
      { label: "B1", min: 150, max: 300 },
      { label: "B2", min: 300, max: 500 },
      { label: "C1", min: 500, max: 1000 },
    ];

    let level = "A1";
    let percent = 0;
    for (const t of thresholds) {
      if (masteredVocab >= t.min) {
        level = t.label;
        const rangeSize = t.max - t.min;
        percent = rangeSize > 0 ? ((masteredVocab - t.min) / rangeSize) * 100 : 100;
      }
    }

    const reviewBonus = totalVocab > 0 ? (reviewedVocab / totalVocab) * 5 : 0;
    percent = Math.min(percent + reviewBonus, 100);

    const conversationCount = await prisma.conversation.count();
    const examAttempts = await prisma.examAttempt.findMany({
      select: { correct: true, category: true },
    });
    const examCorrect = examAttempts.filter((a: any) => a.correct === true).length;
    const examTotal = examAttempts.length;

    return NextResponse.json({
      totalVocab, masteredVocab, reviewedVocab,
      level, percent: Math.round(percent), conversationCount,
      examStats: {
        total: examTotal, correct: examCorrect,
        accuracy: examTotal > 0 ? Math.round((examCorrect / examTotal) * 100) : 0,
      },
    }, { status: 200 });
  } catch (error) {
    console.error("Progress error:", error);
    return NextResponse.json({ error: "Failed to fetch progress" }, { status: 500 });
  }
}
