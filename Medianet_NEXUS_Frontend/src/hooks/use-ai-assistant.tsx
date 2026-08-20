import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { genbiApi, type GenbiMessage, type GenbiChart } from "@/lib/api";

export type AiMsg = {
  role: "user" | "assistant";
  content: string;
  chart?: GenbiChart | null;
  timestamp: number;
};

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
  retry: (index: number) => Promise<void>;
  toggleMic: () => void;
  // popup chrome — irrelevant on the full /ai page, only used by AIPanel/AiDock
  open: boolean;
  pinned: boolean;
  openAssistant: () => void;
  closeAssistant: () => void;
  togglePin: () => void;
  // resizable width — remembered per variant (floating panel vs docked column)
  panelWidth: number;
  dockWidth: number;
  startPanelResize: (e: React.PointerEvent) => void;
  startDockResize: (e: React.PointerEvent) => void;
};

const AiAssistantContext = createContext<AiAssistantContextValue | undefined>(undefined);

/**
 * Drag-to-resize width for a right-anchored panel, persisted to localStorage
 * so it stays put across reloads. Both AIPanel (floating) and AiDock (docked)
 * use one of these each — same drag logic, independent stored widths, since
 * the two variants were sized differently on purpose.
 */
function useResizableWidth(storageKey: string, defaultWidth: number, min: number, max: number) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return defaultWidth;
    const stored = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored > 0 ? Math.min(max, Math.max(min, stored)) : defaultWidth;
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, String(width));
  }, [storageKey, width]);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const onMove = (ev: PointerEvent) => {
      // Panel/dock are pinned to the right edge of the viewport, so the
      // distance from the pointer to that edge IS the new width.
      const next = Math.min(max, Math.max(min, window.innerWidth - ev.clientX));
      setWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return [width, startResize] as const;
}

export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const firstName = profile?.displayName?.split(" ")[0];
  const greeting = firstName ? t("ai.greetingWithName", { name: firstName }) : t("ai.greeting");
  const intro = `${greeting} ${t("ai.intro")}`;
  const suggestions = [t("ai.s1"), t("ai.s2"), t("ai.s3"), t("ai.s4"), t("ai.s5")];

  const [messages, setMessages] = useState<AiMsg[]>([
    { role: "assistant", content: intro, timestamp: Date.now() },
  ]);
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

  // ── Resizable width — drag handle on each variant, remembered separately ─
  const [panelWidth, startPanelResize] = useResizableWidth("medianet-nexus:ai-panel-width", 448, 320, 640);
  const [dockWidth, startDockResize] = useResizableWidth("medianet-nexus:ai-dock-width", 416, 320, 640);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || sending) return;

    const history: GenbiMessage[] = messages
      .filter((m, i) => !(i === 0 && m.role === "assistant"))
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: "user", content: q, timestamp: Date.now() }]);
    setInput("");
    setSending(true);

    try {
      const data = await genbiApi.ask(q, history);
      const reply = data.error ?? data.natural_response ?? t("ai.error");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply, chart: data.chart, timestamp: Date.now() },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t("ai.error"), timestamp: Date.now() },
      ]);
    } finally {
      setSending(false);
    }
  };

  /** Regenerates one assistant reply in place, using the same question and
   *  the conversation as it stood right before that turn. Used by the tiny
   *  retry button under each assistant message — it replaces that message's
   *  content rather than appending a new turn, so the thread doesn't grow. */
  const retry = async (index: number) => {
    if (sending) return;
    const target = messages[index];
    const question = messages[index - 1];
    if (!target || target.role !== "assistant" || !question || question.role !== "user") return;

    const history: GenbiMessage[] = messages
      .slice(0, index - 1)
      .filter((m, i) => !(i === 0 && m.role === "assistant"))
      .map((m) => ({ role: m.role, content: m.content }));

    setSending(true);
    try {
      const data = await genbiApi.ask(question.content, history);
      const reply = data.error ?? data.natural_response ?? t("ai.error");
      setMessages((prev) => {
        const next = [...prev];
        next[index] = { role: "assistant", content: reply, chart: data.chart, timestamp: Date.now() };
        return next;
      });
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[index] = { role: "assistant", content: t("ai.error"), timestamp: Date.now() };
        return next;
      });
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
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: t("ai.error"), timestamp: Date.now() },
          ]);
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t("ai.micError"), timestamp: Date.now() },
      ]);
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
    retry,
    toggleMic,
    open,
    pinned,
    openAssistant,
    closeAssistant,
    togglePin,
    panelWidth,
    dockWidth,
    startPanelResize,
    startDockResize,
  };

  return <AiAssistantContext.Provider value={value}>{children}</AiAssistantContext.Provider>;
}

export function useAiAssistant() {
  const ctx = useContext(AiAssistantContext);
  if (!ctx) throw new Error("useAiAssistant must be used within AiAssistantProvider");
  return ctx;
}