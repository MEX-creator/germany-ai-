import { NextResponse, NextRequest } from "next/server";
import { db } from "@/server/db";
import { createNvidiaClient, CHAT_MODEL } from "@/server/ai";
import { verifyPasscode } from "@/lib/passcode";

const prisma = db;

type Level = "A1" | "A2" | "B1" | "B2";
type Category = "reading" | "listening" | "writing" | "grammar";

const LEVEL_DESCRIPTIONS: Record<Level, string> = {
  A1: "Beginner. Very simple sentences, basic vocabulary (greetings, numbers, family, food). Present tense only. Short questions with obvious answers.",
  A2: "Elementary. Simple connected text on familiar topics. Past tense introduced. Routine everyday expressions. Questions require basic comprehension.",
  B1: "Intermediate. Main points of clear standard input on familiar matters. Can deal with most travel situations. Longer texts with some complex structures.",
  B2: "Upper intermediate. Complex text on abstract and concrete topics. Can interact with fluency and spontaneity. Nuanced grammar, subjunctive, passive voice.",
};

function getExamSystemPrompt(level: Level): string {
  return `Du bist ein Experte fuer Deutschpruefungen (Goethe-Zertifikat, telc, OSD).
Erstelle Pruefungsfragen auf ${level}-Niveau.
Level-Beschreibung: ${LEVEL_DESCRIPTIONS[level]}

Antworte NUR mit einem gueltigen JSON-Objekt, ohne Markdown-Code-Block.
Erstelle maximal 2 Fragen pro Anfrage ( fuer listening/reading ) oder 3 Fragen ( fuer grammar/writing ). Halte das JSON kurz.
Das JSON darf KEINE Zeilenumbrueche innerhalb der JSON-Struktur haben. Alles in einer Zeile.

Fuer reading:
{"type":"reading","passage":"[deutscher Text]","questions":[{"q":"[Frage]","options":["A) ...","B) ...","C) ...","D) ..."],"correct":0,"explanation":"[Erklaerung]"}]}

Fuer listening:
{"type":"listening","transcript":"[Dialog auf Deutsch]","questions":[{"q":"[Frage]","options":["A) ...","B) ...","C) ..."],"correct":0,"explanation":"[Erklaerung]"}]}

Fuer writing:
{"type":"writing","prompt":"[Schreibaufgabe]","requirements":["[Anforderung]"],"sampleAnswer":"[Beispielantwort]","tips":["[Tipp]"]}

Fuer grammar:
{"type":"grammar","questions":[{"q":"[Lueckentext oder Grammatikfrage]","options":["A) ...","B) ...","C) ...","D) ..."],"correct":0,"explanation":"[Grammatikerklaerung]"}]}`;
}

function stripNewlines(s: string): string {
  return s.replace(/[\r\n]+/g, " ");
}

export async function POST(req: NextRequest) {
  const passcode = req.headers.get("x-passcode") ?? "";
  if (!verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  try {
    const { category, level } = await req.json();
    if (!category || !["reading", "listening", "writing", "grammar"].includes(category)) {
      return NextResponse.json({ error: "Valid category required" }, { status: 400 });
    }
    const examLevel: Level = ["A1", "A2", "B1", "B2"].includes(level) ? level : "B2";

    const client = createNvidiaClient();
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: getExamSystemPrompt(examLevel) },
        { role: "user", content: `Erstelle ${level}-Uebungsfragen fuer die Kategorie: ${category}` },
      ],
      temperature: 0.7,
      max_tokens: 8192,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    // Strip markdown code fences
    let jsonStr = raw;
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
    if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
    jsonStr = stripNewlines(jsonStr.trim());

    let questions;
    try {
      questions = JSON.parse(jsonStr);
    } catch {
      // Fallback: try to fix truncated JSON by closing open brackets
      let attempt = jsonStr;
      // Count open/close brackets and add missing ones
      const openBrackets = (attempt.match(/\{/g) || []).length;
      const closeBrackets = (attempt.match(/\}/g) || []).length;
      const openBracketsArr = (attempt.match(/\[/g) || []).length;
      const closeBracketsArr = (attempt.match(/\]/g) || []).length;
      attempt += "]".repeat(Math.max(0, openBracketsArr - closeBracketsArr));
      attempt += "}".repeat(Math.max(0, openBrackets - closeBrackets));
      // Remove trailing incomplete string
      attempt = attempt.replace(/,\s*"[^"]*$/, "");
      try {
        questions = JSON.parse(attempt);
      } catch {
        // Last resort: extract what we can
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            questions = JSON.parse(stripNewlines(jsonMatch[0]));
          } catch {
            return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
          }
        } else {
          return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
        }
      }
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
