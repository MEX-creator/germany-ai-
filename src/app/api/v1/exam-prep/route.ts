import { NextResponse, NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { createNvidiaClient, CHAT_MODEL } from "@/server/ai";
import { verifyPasscode } from "@/lib/passcode";

const prisma = new PrismaClient();

const EXAM_SYSTEM_PROMPT = `Du bist ein Experte fuer die Goethe-Zertifikat B2 Pruefung.
Erstelle Pruefungsfragen auf B2-Niveau.
Antworte NUR mit einem gueltigen JSON-Objekt, ohne Markdown-Code-Block.
Erstelle 3 Fragen pro Anfrage.

Fuer reading:
{"type":"reading","passage":"[deutscher Text]","questions":[{"q":"[Frage]","options":["A) ...","B) ...","C) ...","D) ..."],"correct":0,"explanation":"[Erklaerung]"}]}

Fuer listening:
{"type":"listening","transcript":"[Dialog auf Deutsch]","questions":[{"q":"[Frage]","options":["A) ...","B) ...","C) ..."],"correct":0,"explanation":"[Erklaerung]"}]}

Fuer writing:
{"type":"writing","prompt":"[Schreibaufgabe]","requirements":["[Anforderung]"],"sampleAnswer":"[Beispielantwort]","tips":["[Tipp]"]}

Fuer grammar:
{"type":"grammar","questions":[{"q":"[Lueckentext]","options":["A) ...","B) ...","C) ...","D) ..."],"correct":0,"explanation":"[Grammatikerklaerung]"}]}`;

export async function POST(req: NextRequest) {
  const passcode = req.headers.get("x-passcode") ?? "";
  if (!verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  try {
    const { category } = await req.json();
    if (!category || !["reading", "listening", "writing", "grammar"].includes(category)) {
      return NextResponse.json({ error: "Valid category required" }, { status: 400 });
    }

    const client = createNvidiaClient();
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: EXAM_SYSTEM_PROMPT },
        { role: "user", content: "Erstelle B2-Uebungsfragen fuer die Kategorie: " + category },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    // Strip markdown code fences if present
    const fenceStart = "```json";
    const fenceEnd = "```";
    let jsonStr = raw;
    if (jsonStr.startsWith(fenceStart)) {
      jsonStr = jsonStr.slice(fenceStart.length);
    }
    if (jsonStr.endsWith(fenceEnd)) {
      jsonStr = jsonStr.slice(0, -fenceEnd.length);
    }
    jsonStr = jsonStr.trim();

    let questions;
    try {
      questions = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response", raw }, { status: 500 });
    }

    return NextResponse.json({ questions }, { status: 200 });
  } catch (error) {
    console.error("Exam prep error:", error);
    return NextResponse.json({ error: "Failed to generate questions" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const passcode = req.headers.get("x-passcode") ?? "";
  if (!verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  try {
    const { category, question, userAnswer, correct, score } = await req.json();
    const attempt = await prisma.examAttempt.create({
      data: { category, question, userAnswer, correct, score },
    });
    return NextResponse.json({ attempt }, { status: 200 });
  } catch (error) {
    console.error("Exam attempt save error:", error);
    return NextResponse.json({ error: "Failed to save attempt" }, { status: 500 });
  }
}
