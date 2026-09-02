import OpenAI from "openai";

/**
 * NVIDIA NIM API client — OpenAI-compatible endpoint.
 *
 * NVIDIA hosts 100+ open-weight models for free at build.nvidia.com.
 * The endpoint is OpenAI-compatible, so we use the official `openai` SDK
 * with a custom `baseURL`.
 *
 * Free tier: ~40 requests/minute, no credit cap.
 * Model options: meta/llama-3.1-8b-instruct, qwen/qwen2.5-7b-instruct, etc.
 */

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

/**
 * The model to use for chat completions.
 * Llama 3.1 8B is a solid, fast instruction-following model that handles
 * multilingual content well. Swap this string if you want a different model.
 */
export const CHAT_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";

/**
 * Create an OpenAI SDK client pointed at NVIDIA NIM.
 * Called per-request to avoid stale connections in serverless.
 */
export function createNvidiaClient() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY environment variable is not set");
  }
  return new OpenAI({
    apiKey,
    baseURL: NVIDIA_BASE_URL,
  });
}
