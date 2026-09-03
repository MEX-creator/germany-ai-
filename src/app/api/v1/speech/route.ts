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
        take: 20,
      });
      for (const msg of existingMessages) {
        historyMessages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    }

    historyMessages.push({ role: "user", content: prompt });

    // Stream the response from NVIDIA NIM
    const client = createNvidiaClient();
    const stream = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: historyMessages,
      temperature: 0.7,
      max_tokens: 1024,
      stream: true,
    });

    let fullContent = "";
    let convId = parseInt(String(conversationId)) || 0;
    let newConversation: any = null;
    let isNewConversation = !conversationId;

    // If new conversation, create it now and send the ID immediately
    if (isNewConversation) {
      const conversationCount = await prisma.conversation.count();
      newConversation = await prisma.conversation.create({
        data: { title: `Lektion${conversationCount + 1}` },
      });
      convId = newConversation.id;
    }

    // Save user message immediately
    await prisma.message.create({
      data: { content: prompt, role: "user", conversationId: convId },
    });

    // Create a streaming response
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

          // Stream tokens
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

          // Parse vocab markers from complete response
          const { cleanText, vocab } = parseVocabMarkers(fullContent);

          // Save assistant message and vocab to database
          await prisma.message.create({
            data: { content: cleanText, role: "assistant", conversationId: convId },
          });
          for (const v of vocab) {
            const existing = await prisma.vocabularyItem.findFirst({
              where: { german: v.german },
            });
            if (!existing) {
              await prisma.vocabularyItem.create({
                data: {
                  german: v.german,
                  english: v.english,
                  example: v.example ?? null,
                  sourceConversationId: convId,
                },
              });
            }
          }

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
