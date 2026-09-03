import { NextResponse, NextRequest } from "next/server";
import { db } from "@/server/db";
import { createNvidiaClient, CHAT_MODEL } from "@/server/ai";
import { SYSTEM_PROMPT } from "@/lib/persona";
import { verifyPasscode } from "@/lib/passcode";

const prisma = db;

/**
 * Parse vocabulary extraction markers from AI responses.
 * The AI appends <!--VOCAB:{...}--> blocks that we extract and store.
 */
function parseVocabMarkers(text: string): {
  cleanText: string;
  vocab: Array<{ german: string; english: string; example?: string }>;
} {
  const vocab: Array<{ german: string; english: string; example?: string }> = [];

  // Pass 1: Extract well-formed markers (with s flag for multiline JSON)
  const wellFormedRegex = /<!--VOCAB:\s*(\{[^}]*\})\s*-->/gs;
  let cleanText = text.replace(wellFormedRegex, (_match, jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.german && parsed.english) {
        vocab.push(parsed);
      }
    } catch {
      // malformed JSON - strip anyway to prevent visible leak
    }
    return "";
  });

  // Pass 2: Strip any remaining malformed/partial VOCAB markers
  cleanText = cleanText.replace(/<!--VOCAB:[\s\S]*?-->/g, "");
  // Also catch open markers without closing -->
  cleanText = cleanText.replace(/<!--VOCAB:[\s\S]*$/gm, "");

  return { cleanText: cleanText.trim(), vocab };
}

/**
 * POST /api/v1/speech — Send a message to the AI tutor.
 */
export async function POST(req: NextRequest) {
  const passcode = req.headers.get("x-passcode") ?? "";
  if (!verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  const { prompt, conversationId } = await req.json();
  try {
    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    // Build conversation history for context
    let historyMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (conversationId) {
      const existingMessages = await prisma.message.findMany({
        where: { conversationId: parseInt(String(conversationId)) },
        orderBy: { createdAt: "asc" },
        take: 20, // last 20 messages for context window
      });

      for (const msg of existingMessages) {
        historyMessages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    }

    // Add the current user message
    historyMessages.push({ role: "user", content: prompt });

    // Call NVIDIA NIM
    const client = createNvidiaClient();
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: historyMessages,
      temperature: 0.7,
      max_tokens: 1024,
    });

    const rawMessage = completion.choices[0]?.message?.content ?? "I'm sorry, I couldn't generate a response.";

    // Parse vocabulary markers
    const { cleanText, vocab } = parseVocabMarkers(rawMessage);

    // Save conversation to database
    const result = await prisma.$transaction(async (tx: any) => {
      let conversation;

      if (!conversationId) {
        const conversationCount = await tx.conversation.count();
        conversation = await tx.conversation.create({
          data: {
            title: `Lektion${conversationCount + 1}`,
          },
        });
      }

      const convId = parseInt(String(conversationId)) || conversation!.id;

      // Save user's message
      await tx.message.create({
        data: {
          content: prompt,
          role: "user",
          conversationId: convId,
        },
      });

      // Save AI's response (with vocab markers stripped)
      await tx.message.create({
        data: {
          content: cleanText,
          role: "assistant",
          conversationId: convId,
        },
      });

      // Save extracted vocabulary items
      for (const v of vocab) {
        // Avoid duplicates — check if this german word already exists
        const existing = await tx.vocabularyItem.findFirst({
          where: { german: v.german },
        });
        if (!existing) {
          await tx.vocabularyItem.create({
            data: {
              german: v.german,
              english: v.english,
              example: v.example ?? null,
              sourceConversationId: convId,
            },
          });
        }
      }

      // Return full conversation if it's new
      if (!conversationId) {
        return {
          message: cleanText,
          conversation: await tx.conversation.findUnique({
            where: { id: conversation!.id },
            include: {
              messages: { orderBy: { createdAt: "asc" } },
            },
          }),
        };
      }

      return { message: cleanText };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      {
        error: "Failed to process message",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/v1/speech — List all conversations.
 */
export async function GET(req: NextRequest) {
  const passcode = req.headers.get("x-passcode") ?? "";
  if (!verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  try {
    // If conversationId is provided, return messages for that conversation
    const conversationId = req.nextUrl.searchParams.get("conversationId");
    if (conversationId) {
      const messages = await prisma.message.findMany({
        where: { conversationId: parseInt(conversationId) },
        orderBy: { createdAt: "asc" },
      });
      return NextResponse.json({ messages }, { status: 200 });
    }

    // Otherwise, return all conversations (without messages for speed)
    const conversations = await prisma.conversation.findMany({
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ conversations }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
  }
}

/**
 * PATCH /api/v1/speech — Rename a conversation.
 */
export async function PATCH(req: NextRequest) {
  const passcode = req.headers.get("x-passcode") ?? "";
  if (!verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  try {
    const { conversationId, title } = await req.json();

    if (!conversationId || !title) {
      return NextResponse.json({ error: "conversationId and title are required" }, { status: 400 });
    }

    const updatedConversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: { title },
    });

    return NextResponse.json({ conversation: updatedConversation }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update conversation" }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/speech — Delete a conversation.
 */
export async function DELETE(req: NextRequest) {
  const passcode = req.headers.get("x-passcode") ?? "";
  if (!verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  try {
    const conversationId = req.nextUrl.searchParams.get("conversationId");

    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }

    // Delete messages first (cascade would handle this, but being explicit)
    await prisma.message.deleteMany({
      where: { conversationId: parseInt(conversationId) },
    });

    await prisma.conversation.delete({
      where: { id: parseInt(conversationId) },
    });

    return NextResponse.json({ message: "Conversation deleted successfully" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete conversation" }, { status: 500 });
  }
}
