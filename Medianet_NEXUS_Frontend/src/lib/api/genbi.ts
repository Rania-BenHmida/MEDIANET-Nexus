import { post } from "./client";

/** One turn in the chatbot conversation, as sent to / stored by the UI. */
export type GenbiMessage = { role: "user" | "assistant"; content: string };

/** Chart spec emitted by the backend when a chart aids the answer. */
export type GenbiChart = {
  type: "bar" | "line" | "pie";
  x: string;
  y: string;
  data: Record<string, unknown>[];
  title: string;
};

/** Response shape from POST /api/genbi/ask/ (mirrors the Django view). */
export type GenbiAnswer = {
  question: string;
  intent: "greeting" | "chitchat" | "data_question" | "direct" | null;
  language: "fr" | "en" | null;
  domain: string;
  tables_used: string[];
  sql: string | null;
  explanation: string;
  natural_response: string | null;
  data: Record<string, unknown>[] | null;
  row_count: number | null;
  chart: GenbiChart | null;
  error: string | null;
};

/** Response shape from POST /api/genbi/transcribe/. */
export type GenbiTranscription = {
  text: string;
  detected_language: string | null;
};

// transcribe is a multipart upload, which the shared post() helper (JSON-only)
// can't express — so it uses a raw fetch against the same BASE.
const BASE = import.meta.env.VITE_DJANGO_API_URL ?? "http://localhost:8000/api";

async function transcribe(audio: Blob, filename = "recording.webm"): Promise<GenbiTranscription> {
  const form = new FormData();
  form.append("file", audio, filename);

  const res = await fetch(`${BASE}/genbi/transcribe/`, { method: "POST", body: form });
  if (!res.ok) {
    let message = `API error ${res.status}: /genbi/transcribe/`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON body — keep default */
    }
    throw new Error(message);
  }
  return res.json() as Promise<GenbiTranscription>;
}

export const genbiApi = {
  // Chatbot — stateless; pass recent history for context
  ask: (question: string, history: GenbiMessage[] = []) =>
    post<GenbiAnswer>("/genbi/ask/", { question, history }),

  // Speech-to-text — Groq Whisper (multipart)
  transcribe,

  // Debug helper — validate SQL without executing
  validate: (sql: string) => post<{ valid: boolean; error: string }>("/genbi/debug/validate/", { sql }),
};