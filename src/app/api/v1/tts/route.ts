import { NextResponse, NextRequest } from "next/server";
import { EdgeTTS } from "edge-tts-universal";
import { verifyPasscode } from "@/lib/passcode";

/**
 * POST /api/v1/tts — Text-to-speech using Microsoft Edge neural voices.
 *
 * Free, unlimited, no API key needed.
 * Voice: de-DE-KatjaNeural (female German, natural-sounding).
 *
 * Returns MP3 audio buffer on success, or structured JSON error on failure
 * so the client can visibly fall back to Web Speech API.
 */

const GERMAN_VOICE = "de-DE-KatjaNeural";

export async function POST(req: NextRequest) {
  const passcode = req.headers.get("x-passcode") ?? "";
  if (!verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required", ttsAvailable: false },
        { status: 400 },
      );
    }

    // Truncate very long text (edge-tts handles up to ~10 min of audio, but we cap for UX)
    const truncatedText = text.slice(0, 3000);

    const tts = new EdgeTTS(truncatedText, GERMAN_VOICE, {
      rate: "-5%", // Slightly slower for language learning
      pitch: "+0Hz",
    });

    const result = await tts.synthesize();
    const audioBuffer = Buffer.from(await result.audio.arrayBuffer());

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("TTS error:", error);
    // Return structured error so client can fall back to Web Speech API
    return NextResponse.json(
      {
        error: "tts_unavailable",
        message: error instanceof Error ? error.message : "TTS service unavailable",
        ttsAvailable: false,
      },
      { status: 503 },
    );
  }
}
