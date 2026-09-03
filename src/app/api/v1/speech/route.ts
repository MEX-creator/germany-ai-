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
  cleanText = cleanText.replace(/<!--VOCAB:[\s\S]*$/gm, "");

  // Pass 3: Fallback — extract vocab from common patterns if no markers found
  if (vocab.length === 0) {
    // Pattern: **"GermanWord"** — English translation
    const boldPattern = /\*\*\\?"?([A-ZÄÖÜa-zäöüß]+)\\?"?\*\*\s*[—\-–:]\s*(.+)/g;
    let match;
    while ((match = boldPattern.exec(cleanText)) !== null && vocab.length < 2) {
      const german = match[1]?.trim() ?? "";
      const english = (match[2] ?? "").replace(/["\"]+/g, "").trim().split(".")[0] ?? "";
      if (german.length >= 2 && german.length <= 30 && (/[äöüÄÖÜ]/.test(german) || /^[A-Z]/.test(german))) {
        vocab.push({ german, english, example: undefined });
      }
    }
  }

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

    // === PHASE 1: All DB writes in one transaction (fast, single connection) ===
    let convId = parseInt(String(conversationId)) || 0;
    let newConversation: any = null;
    let historyMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    const setupResult = await prisma.$transaction(async (tx: any) => {
      // Get existing messages for context
      if (conversationId) {
        const existingMessages = await tx.message.findMany({
          where: { conversationId: parseInt(String(conversationId)) },
          orderBy: { createdAt: "asc" },
          take: 10,
        });
        for (const msg of existingMessages) {
          historyMessages.push({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          });
        }
      }

      historyMessages.push({ role: "user", content: prompt });

      // Create conversation if new
      let conversation = null;
      if (!conversationId) {
        const count = await tx.conversation.count();
        conversation = await tx.conversation.create({
          data: { title: `Lektion${count + 1}` },
        });
        convId = conversation.id;
      } else {
        convId = parseInt(String(conversationId));
      }

      // Save user message
      await tx.message.create({
        data: { content: prompt, role: "user", conversationId: convId },
      });

      return { convId, conversation };
    });

    newConversation = setupResult.conversation;
    convId = setupResult.convId;

    // === PHASE 2: Stream AI response (no DB connections held) ===
    const client = createNvidiaClient();
    const stream = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: historyMessages,
      temperature: 0.7,
      max_tokens: 1024,
      stream: true,
    });

    let fullContent = "";

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Send header with conversation info
          controller.enqueue(encoder.encode(JSON.stringify({
            type: "header",
            conversationId: convId,
            conversation: newConversation,
          }) + "\n"));

          // Stream tokens (no DB connections here)
          for await (const chunk of stream) {
            const token = chunk.choices[0]?.delta?.content;
            if (token) {
              fullContent += token;
              controller.enqueue(encoder.encode(JSON.stringify({
                type: "token",
                content: token,
              }) + "\n"));
            }
          }

          // === PHASE 3: Save results in one transaction ===
          const { cleanText, vocab } = parseVocabMarkers(fullContent);

          await prisma.$transaction(async (tx: any) => {
            await tx.message.create({
              data: { content: cleanText, role: "assistant", conversationId: convId },
            });
            for (const v of vocab) {
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
          });

          // Send done signal
          controller.enqueue(encoder.encode(JSON.stringify({
            type: "done",
            message: cleanText,
            conversationId: convId,
            conversation: newConversation,
          }) + "\n"));

          controller.close();
        } catch (err) {
          console.error("Streaming error:", err);
          controller.enqueue(encoder.encode(JSON.stringify({
            type: "error",
            error: err instanceof Error ? err.message : "Streaming failed",
          }) + "\n"));
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
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
