import { NextResponse, NextRequest } from "next/server";
import { db } from "@/server/db";
import { verifyPasscode } from "@/lib/passcode";

const prisma = db;

/**
 * GET /api/v1/session-flashcards?conversationId=123
 * Returns vocabulary items extracted during a specific conversation.
 */
export async function GET(req: NextRequest) {
  const passcode = req.headers.get("x-passcode") ?? "";
  if (!verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  const conversationId = req.nextUrl.searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  try {
    const items = await prisma.vocabularyItem.findMany({
      where: { sourceConversationId: parseInt(conversationId) },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ items }, { status: 200 });
  } catch (error) {
    console.error("Session flashcards error:", error);
    return NextResponse.json({ error: "Failed to fetch session flashcards" }, { status: 500 });
  }
}
