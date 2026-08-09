import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { genbiApi, type GenbiMessage, type GenbiChart } from "@/lib/api";

export type AiMsg = { role: "user" | "assistant"; content: string; chart?: GenbiChart | null };

type AiAssistantContextValue = {
  // conversation (shared by the popup and the /ai page)
  messages: AiMsg[];
  input: string;
  setInput: (v: string) => void;
  sending: boolean;
  recording: boolean;
  transcribing: boolean;
  suggestions: string[];
  showSuggestions: boolean;
  send: (text: string) => Promise<void>;
  toggleMic: () => void;
  // popup chrome — irrelevant on the full /ai page, only used by AIPanel/AiDock
  open: boolean;
  pinned: boolean;
  openAssistant: () => void;
  closeAssistant: () => void;
  togglePin: () => void;
};

const AiAssistantContext = createContext<AiAssistantContextValue | undefined>(undefined);

export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const firstName = profile?.displayName?.split(" ")[0];
  const greeting = firstName ? t("ai.greetingWithName", { name: firstName }) : t("ai.greeting");
  const intro = `${greeting} ${t("ai.intro")}`;
  const suggestions = [t("ai.s1"), t("ai.s2"), t("ai.s3"), t("ai.s4"), t("ai.s5")];

  const [messages, setMessages] = useState<AiMsg[]>([{ role: "assistant", content: intro }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // ── Mic / recording state ──────────────────────────────────────────────
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // ── Popup chrome: floating open state + pin (docked vs floating) ───────
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || sending) return;

    const history: GenbiMessage[] = messages
      .filter((m, i) => !(i === 0 && m.role === "assistant"))
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    setSending(true);

    try {
      const data = await genbiApi.ask(q, history);
      const reply = data.error ?? data.natural_response ?? t("ai.error");
      setMessages((prev) => [...prev, { role: "assistant", content: reply, chart: data.chart }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: t("ai.error") }]);
    } finally {
      setSending(false);
    }
  };

  // ── Recording controls ─────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setTranscribing(true);
        try {
          const { text } = await genbiApi.transcribe(blob, "recording.webm");
          if (text && text.trim()) {
            await send(text.trim());
          }
        } catch {
          setMessages((prev) => [...prev, { role: "assistant", content: t("ai.error") }]);
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: t("ai.micError") }]);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const toggleMic = () => (recording ? stopRecording() : startRecording());

  // ── Popup chrome behavior ───────────────────────────────────────────────
  const openAssistant = () => setOpen(true);

  /** Closing just closes it — pin state is remembered for next time, but
   *  doesn't change what closing does. */
  const closeAssistant = () => setOpen(false);

  /** Toggling pin changes HOW the panel renders while open (docked into the
   *  layout vs floating over it) — AppShell picks AiDock or AIPanel based on
   *  this flag. It doesn't open or close anything by itself. */
  const togglePin = () => setPinned((p) => !p);

  const value: AiAssistantContextValue = {
    messages,
    input,
    setInput,
    sending,
    recording,
    transcribing,
    suggestions,
    showSuggestions: messages.length === 1,
    send,
    toggleMic,
    open,
    pinned,
    openAssistant,
    closeAssistant,
    togglePin,
  };

  return <AiAssistantContext.Provider value={value}>{children}</AiAssistantContext.Provider>;
}

export function useAiAssistant() {
  const ctx = useContext(AiAssistantContext);
  if (!ctx) throw new Error("useAiAssistant must be used within AiAssistantProvider");
  return ctx;
}