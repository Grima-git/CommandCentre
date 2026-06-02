"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { SummaryResponse } from "@/app/api/renewals/summary/route";
import type { CallsSummaryResponse } from "@/app/api/calls/summary/route";
import type { HrSummaryResponse } from "@/app/api/hr/summary/route";

type OdinState = "idle" | "thinking" | "speaking";
type PendingSms = { toName?: string; to?: string; message: string };
type AddContactCommand = { name: string; phone: string };
type StatsSmsCommand = { toName: string; kind: "renewals" | "calls" | "combined"; period: "today" | "week" | "month" | "ytd" };
type QuickAnswerIntent = {
  kind: "hr_off_today" | "hr_pending_leave" | "hr_summary" | "renewals" | "calls";
  period: "today" | "week" | "month" | "ytd";
};
type OdinAction =
  | ({ type: "sms" } & PendingSms)
  | ({ type: "stats_sms" } & StatsSmsCommand)
  | { type: "followup_sms"; toName: string }
  | ({ type: "add_contact" } & AddContactCommand)
  | { type: "answer"; answer: string };

type SpeechRecognitionResultListLike = {
  length: number;
  item(index: number): {
    isFinal: boolean;
    item(index: number): { transcript: string };
  };
};
type SpeechRecognitionEventLike = { results: SpeechRecognitionResultListLike };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const STARTERS = [
  "How are renewals performing today?",
  "Which advisor is leading this week?",
  "What's our finance penetration rate?",
  "Flag any urgent renewals coming up",
];

export function OdinInterface({ userName }: { userName: string }) {
  const [odinState, setOdinState] = useState<OdinState>("idle");
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [stats, setStats] = useState<SummaryResponse | null>(null);
  const [showStarters, setShowStarters] = useState(true);
  const [pendingSms, setPendingSms] = useState<PendingSms | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceName, setVoiceName] = useState("");
  const [voiceEngine, setVoiceEngine] = useState("Piper ready");

  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const lastSpokenRef = useRef("");
  const spokenPrefixRef = useRef("");
  const speechQueueRef = useRef<string[]>([]);
  const speakingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);
  const openAiAudioCacheRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const openAiVoiceFailedRef = useRef(false);
  const openAiVoiceDisabledRef = useRef(false);
  const piperFailedRef = useRef(false);
  const piperDisabledRef = useRef(false);

  useEffect(() => {
    const win = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    setSpeechSupported(Boolean(Recognition && window.speechSynthesis));
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-GB";
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => {
      let interim = "";
      let finalTranscript = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results.item(i);
        const transcript = result.item(0).transcript.trim();
        if (result.isFinal) finalTranscript += `${transcript} `;
        else interim += transcript;
      }
      const spokenText = (finalTranscript || interim).trim();
      if (spokenText) setInput(spokenText);
      if (finalTranscript.trim()) {
        void send(finalTranscript.trim());
      }
    };
    recognitionRef.current = recognition;
    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!window.speechSynthesis) return;
    const loadVoices = () => {
      const selected = window.speechSynthesis.getVoices()
        .map((voice) => {
          const name = voice.name.toLowerCase();
          const lang = voice.lang.toLowerCase();
          let score = 0;
          if (lang === "en-gb") score += 40;
          if (lang.startsWith("en-")) score += 15;
          if (name.includes("natural")) score += 35;
          if (name.includes("neural")) score += 30;
          if (name.includes("online")) score += 20;
          if (/\b(ryan|george|thomas|david|mark|guy)\b/.test(name)) score += 30;
          if (/\b(libby|sonia|zira|hazel|susan)\b/.test(name)) score += 8;
          if (name.includes("microsoft")) score += 8;
          if (voice.localService) score += 3;
          return { voice, score };
        })
        .sort((a, b) => b.score - a.score)[0]?.voice ?? null;
      voiceRef.current = selected;
      setVoiceName(selected?.name ?? "");
    };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  useEffect(() => {
    fetch("/api/renewals/summary?period=today")
      .then((r) => r.json())
      .then((d) => d.ok && setStats(d as SummaryResponse))
      .catch(() => {});
  }, []);

  useEffect(() => {
    return;
    if (!voiceEnabled || streaming || !response || pendingSms || spokenPrefixRef.current) return;
    if (!window.speechSynthesis || lastSpokenRef.current === response) return;
    lastSpokenRef.current = response;
    let cancelled = false;
    window.speechSynthesis.cancel();
    const spoken = response
      .replace(/["]/g, "")
      .replace(/\u00A3\s?([\d,]+(?:\.\d{1,2})?)/g, "$1 pounds")
      .replace(/£\s?([\d,]+(?:\.\d{1,2})?)/g, "$1 pounds")
      .replace(/\b(\d+(?:\.\d+)?)%/g, "$1 percent")
      .replace(/\bGWP\b/g, "G W P")
      .replace(/\bYTD\b/g, "year to date")
      .replace(/\bavg\b/gi, "average")
      .replace(/\bSMS\b/g, "text message")
      .replace(/\bOD1N\b/g, "Odin")
      .replace(/\bNew-Renewals\b/g, "New Renewals")
      .replace(/:\s+/g, ". ")
      .replace(/;\s+/g, ". ")
      .replace(/\s+/g, " ")
      .trim();
    const chunks = spoken.split(/(?<=[.!?])\s+/).filter(Boolean);
    const speakChunk = (index: number) => {
      if (cancelled || index >= chunks.length) {
        if (!cancelled) setOdinState("idle");
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      const voice = voiceRef.current;
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || "en-GB";
      utterance.rate = chunks[index].length > 120 ? 1.0 : 1.04;
      utterance.pitch = 0.72;
      utterance.volume = 0.95;
      utterance.onend = () => window.setTimeout(() => speakChunk(index + 1), index === 0 ? 90 : 140);
      utterance.onerror = () => setOdinState("idle");
      setOdinState("speaking");
      window.speechSynthesis.speak(utterance);
    };
    speakChunk(0);
    return () => {
      cancelled = true;
      window.speechSynthesis.cancel();
    };
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(response.replace(/["£]/g, (match) => match === "£" ? "pounds " : ""));
    utterance.lang = "en-GB";
    utterance.rate = 0.96;
    utterance.pitch = 0.92;
    window.speechSynthesis.speak(utterance);
    setOdinState("speaking");
    utterance.onend = () => setOdinState("idle");
    utterance.onerror = () => setOdinState("idle");
  }, [pendingSms, response, streaming, voiceEnabled]);

  useEffect(() => {
    if (!window.speechSynthesis) return;
    if (!voiceEnabled || pendingSms || !response) {
      spokenPrefixRef.current = "";
      speechQueueRef.current = [];
      speakingRef.current = false;
      audioRef.current?.pause();
      window.speechSynthesis.cancel();
      return;
    }

    const spoken = toSpokenText(response);
    const speakable = streaming ? completeSentencePrefix(spoken) : spoken;
    if (speakable.length <= spokenPrefixRef.current.length) return;

    const nextText = speakable.slice(spokenPrefixRef.current.length).trim();
    spokenPrefixRef.current = speakable;
    speechQueueRef.current.push(...splitSpeechIntoChunks(nextText));
    speakQueuedSpeech();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSms, response, streaming, voiceEnabled]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    void unlockAudioPlayback();
    spokenPrefixRef.current = "";
    speechQueueRef.current = [];
    speakingRef.current = false;
    openAiAudioCacheRef.current.clear();
    audioRef.current?.pause();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    const addContact = parseAddContactCommand(text);
    if (addContact) {
      await saveContact(addContact);
      return;
    }

    const parsedAction = await parseServerAction(text);
    if (parsedAction?.type === "add_contact") {
      await saveContact({ name: parsedAction.name, phone: parsedAction.phone });
      return;
    }
    if (parsedAction?.type === "answer") {
      setInput("");
      setShowStarters(false);
      setPendingSms(null);
      setResponse(parsedAction.answer);
      setOdinState("idle");
      inputRef.current?.focus();
      return;
    }
    if (parsedAction?.type === "sms") {
      const smsDraft = { toName: parsedAction.toName, to: parsedAction.to, message: parsedAction.message };
      await sendSmsNow(smsDraft);
      return;
    }
    if (parsedAction?.type === "followup_sms") {
      const message = response.trim();
      if (!message || pendingSms) {
        setResponse("Give me the message to send, or ask for stats first.");
        return;
      }
      await sendSmsNow({ toName: parsedAction.toName, message });
      return;
    }

    const statsSms = parsedAction?.type === "stats_sms" ? parsedAction : parseStatsSmsCommand(text);
    if (statsSms) {
      await prepareStatsSms(statsSms);
      return;
    }

    const quickAnswer = parseQuickAnswerIntent(text);
    if (quickAnswer) {
      await answerQuickly(quickAnswer);
      return;
    }

    const sms = parseSmsCommand(text);
    if (sms) {
      await sendSmsNow(sms);
      return;
    }
    setInput(""); setShowStarters(false); setStreaming(true); setOdinState("thinking"); setResponse("");
    try {
      const res = await fetch("/api/ai-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: text.trim() }],
          mode: "lean",
          odinState,
        }),
      });
      if (!res.ok || !res.body) throw new Error("Request failed");
      setOdinState("speaking");
      const reader = res.body.getReader(), decoder = new TextDecoder();
      let buffer = "", full = "";
      let streamError = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6); if (payload === "[DONE]") break;
          try {
            const { text: t, error } = JSON.parse(payload) as { text?: string; error?: string };
            if (t) {
              full += t;
              setResponse(full);
            }
            if (error) streamError = error;
          } catch { /* skip */ }
        }
      }
      if (!full.trim()) {
        setResponse(streamError ? `${streamError}. I can still run direct commands while we fix that.` : "I'm here. Try asking for renewals, calls, HR, or a text.");
      }
    } catch { setResponse("I'm having trouble reaching the data source. Please try again."); }
    finally { setStreaming(false); setOdinState("idle"); inputRef.current?.focus(); }
  }

  async function parseServerAction(text: string): Promise<OdinAction | null> {
    try {
      const res = await fetch("/api/odin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = (await res.json()) as { ok?: boolean; action?: OdinAction | null };
      return json.ok ? json.action ?? null : null;
    } catch {
      return null;
    }
  }

  async function answerQuickly(intent: QuickAnswerIntent) {
    setInput("");
    setShowStarters(false);
    setPendingSms(null);
    setStreaming(true);
    setOdinState("thinking");
    setResponse("");
    try {
      const answer =
        intent.kind.startsWith("hr_")
          ? await getHrAnswer(intent.kind)
          : intent.kind === "renewals"
          ? await getRenewalsAnswer(intent.period)
          : await getCallsAnswer(intent.period);
      setResponse(answer);
    } catch {
      setResponse("I could not reach that data source just now.");
    } finally {
      setStreaming(false);
      setOdinState("idle");
      inputRef.current?.focus();
    }
  }

  async function saveContact(contact: AddContactCommand) {
    setInput("");
    setShowStarters(false);
    setStreaming(true);
    setOdinState("thinking");
    setResponse(`Adding ${contact.name}...`);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contact),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; contact?: { name: string; phone: string } };
      if (!res.ok || !json.ok || !json.contact) throw new Error(json.error ?? "Could not add contact");
      setResponse(`Saved ${json.contact.name} as ${json.contact.phone}.`);
    } catch (e) {
      setResponse((e as Error).message);
    } finally {
      setStreaming(false);
      setOdinState("idle");
      inputRef.current?.focus();
    }
  }

  async function prepareStatsSms(command: StatsSmsCommand) {
    setInput("");
    setShowStarters(false);
    setStreaming(true);
    setOdinState("thinking");
    setPendingSms(null);
    setResponse(`Preparing ${command.kind} stats for ${command.toName}...`);
    try {
      const res = await fetch("/api/odin/stats-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; toName?: string; message?: string };
      if (!res.ok || !json.ok || !json.message || !json.toName) {
        throw new Error(json.error ?? "Could not prepare stats text");
      }
      setResponse(`Sending ${command.kind} stats to ${json.toName}: "${json.message}"`);
      await postSms({ toName: json.toName, message: json.message });
      setResponse(`Text sent to ${json.toName}.`);
    } catch (e) {
      setResponse((e as Error).message);
    } finally {
      setStreaming(false);
      setOdinState("idle");
      inputRef.current?.focus();
    }
  }

  async function postSms(sms: PendingSms) {
    const res = await fetch("/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sms),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) throw new Error(json.error ?? "SMS failed");
  }

  async function sendSmsNow(sms: PendingSms) {
    setInput("");
    setShowStarters(false);
    setPendingSms(null);
    setStreaming(true);
    setOdinState("thinking");
    setResponse(`Sending text to ${sms.toName ?? sms.to}...`);
    try {
      await postSms(sms);
      setResponse(`Text sent to ${sms.toName ?? sms.to}.`);
    } catch (e) {
      setResponse((e as Error).message);
    } finally {
      setStreaming(false);
      setOdinState("idle");
      inputRef.current?.focus();
    }
  }

  async function confirmSms() {
    if (!pendingSms || streaming) return;
    setStreaming(true);
    setOdinState("thinking");
    setResponse(`Sending text to ${pendingSms.toName ?? pendingSms.to}...`);
    try {
      await postSms(pendingSms);
      setResponse(`Text sent to ${pendingSms.toName ?? pendingSms.to}.`);
      setPendingSms(null);
    } catch (e) {
      setResponse((e as Error).message);
    } finally {
      setStreaming(false);
      setOdinState("idle");
      inputRef.current?.focus();
    }
  }

  function cancelSms() {
    setPendingSms(null);
    setResponse("Text cancelled.");
    inputRef.current?.focus();
  }

  async function unlockAudioPlayback() {
    if (audioUnlockedRef.current) return;
    try {
      const audio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQQAAAAAAA==");
      audio.volume = 0;
      await audio.play();
      audio.pause();
      audioUnlockedRef.current = true;
    } catch {
      audioUnlockedRef.current = false;
    }
  }

  async function playPiperSpeech(text: string): Promise<boolean> {
    if (piperFailedRef.current) return false;
    try {
      setVoiceEngine("Piper");
      const res = await fetch("/api/tts/piper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        if (res.status === 503 || res.status === 404) piperDisabledRef.current = true;
        throw new Error("Piper unavailable");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      setOdinState("speaking");
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Audio playback failed"));
        void audio.play().catch(reject);
      });
      URL.revokeObjectURL(url);
      return true;
    } catch {
      piperFailedRef.current = true;
      setVoiceEngine("Browser fallback");
      return false;
    }
  }

  function prepareOpenAiSpeech(text: string): Promise<string | null> {
    if (openAiVoiceFailedRef.current || openAiVoiceDisabledRef.current) return Promise.resolve(null);
    const cached = openAiAudioCacheRef.current.get(text);
    if (cached) return cached;

    const audioPromise = (async () => {
      const res = await fetch("/api/tts/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403 || res.status === 503 || res.status === 404) {
          openAiVoiceDisabledRef.current = true;
        }
        throw new Error("OpenAI voice unavailable");
      }
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    })().catch(() => {
      openAiVoiceFailedRef.current = true;
      return null;
    });

    openAiAudioCacheRef.current.set(text, audioPromise);
    return audioPromise;
  }

  async function playOpenAiSpeech(text: string): Promise<boolean> {
    if (openAiVoiceFailedRef.current || openAiVoiceDisabledRef.current) return false;
    try {
      setVoiceEngine("OpenAI voice");
      const url = await prepareOpenAiSpeech(text);
      if (!url) throw new Error("OpenAI voice unavailable");
      const audio = new Audio(url);
      audioRef.current = audio;
      setOdinState("speaking");
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Audio playback failed"));
        void audio.play();
      });
      URL.revokeObjectURL(url);
      openAiAudioCacheRef.current.delete(text);
      return true;
    } catch {
      openAiVoiceFailedRef.current = true;
      setVoiceEngine("Piper fallback");
      return false;
    }
  }

  function speakWithBrowserVoice(text: string) {
    setVoiceEngine("Browser fallback");
    if (!window.speechSynthesis) {
      speakingRef.current = false;
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = voiceRef.current;
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || "en-GB";
    utterance.rate = text.length > 120 ? 1.0 : 1.05;
    utterance.pitch = 0.7;
    utterance.volume = 0.96;
    utterance.onstart = () => setOdinState("speaking");
    utterance.onend = () => {
      speakingRef.current = false;
      window.setTimeout(speakQueuedSpeech, humanPauseMs(text));
    };
    utterance.onerror = () => {
      speakingRef.current = false;
      setOdinState("idle");
    };
    window.speechSynthesis.speak(utterance);
  }

  function speakQueuedSpeech() {
    if (speakingRef.current) return;
    const next = speechQueueRef.current.shift();
    if (!next) {
      speakingRef.current = false;
      if (!streaming) setOdinState("idle");
      return;
    }

    speakingRef.current = true;
    const upcoming = speechQueueRef.current[0];
    if (upcoming && !openAiVoiceFailedRef.current && !openAiVoiceDisabledRef.current) {
      void prepareOpenAiSpeech(upcoming);
    }
    void playOpenAiSpeech(next).then((played) => {
      if (played) {
        speakingRef.current = false;
        window.setTimeout(speakQueuedSpeech, humanPauseMs(next));
        return;
      }

      if (piperDisabledRef.current) {
        speakWithBrowserVoice(next);
        return;
      }

      void playPiperSpeech(next).then((piperPlayed) => {
        if (piperPlayed) {
          speakingRef.current = false;
          window.setTimeout(speakQueuedSpeech, humanPauseMs(next));
          return;
        }
        speakWithBrowserVoice(next);
      });
    });
  }

  function toggleListening() {
    const recognition = recognitionRef.current;
    if (!recognition || streaming) return;
    if (listening) {
      recognition.stop();
      return;
    }
    setResponse("");
    setPendingSms(null);
    try {
      recognition.start();
    } catch {
      setListening(false);
    }
  }

  function toggleVoice() {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    if (next) void unlockAudioPlayback();
    if (!next && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setOdinState("idle");
    }
  }

  const isActive = odinState !== "idle";
  const stateLabel = odinState === "idle" ? "STANDBY" : odinState === "thinking" ? "PROCESSING" : "RESPONDING";
  const statusColor = odinState === "thinking" ? "#fbbf24" : odinState === "speaking" ? "#34d399" : "#73f7ff";

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#02030d" }}>
      {/* Lightweight OD1N status visual */}
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="relative flex h-[min(46vw,420px)] w-[min(46vw,420px)] items-center justify-center rounded-full"
            style={{
              border: `1px solid ${isActive ? "rgba(115,247,255,0.24)" : "rgba(115,247,255,0.12)"}`,
              background: "radial-gradient(circle, rgba(115,247,255,0.08) 0%, rgba(124,92,255,0.05) 38%, rgba(2,3,13,0) 70%)",
              boxShadow: isActive ? `0 0 44px ${statusColor}26` : "0 0 28px rgba(115,247,255,0.08)",
              transition: "border-color 0.6s ease, box-shadow 0.6s ease",
            }}
          >
            <div
              className="absolute inset-[18%] rounded-full"
              style={{ border: "1px solid rgba(226,244,255,0.08)" }}
            />
            <div
              className="absolute inset-[34%] rounded-full"
              style={{ border: `1px solid ${statusColor}55`, transition: "border-color 0.6s ease" }}
            />
            <div className="text-center">
              <p className="font-mono text-[11px] tracking-[0.65em]" style={{ color: "rgba(226,244,255,0.54)" }}>
                OD1N
              </p>
              <p className="mt-3 text-xs font-semibold tracking-[0.35em]" style={{ color: statusColor, transition: "color 0.6s ease" }}>
                {stateLabel}
              </p>
            </div>
          </div>
        </div>

        {/* Status — top */}
        <div className="absolute top-5 inset-x-0 z-10 flex justify-center pointer-events-none">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.35em] font-mono" style={{ color: "rgba(226,244,255,0.6)" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: statusColor, transition: "background-color 1.4s ease" }} />
            OD1N &nbsp;·&nbsp; {stateLabel} &nbsp;·&nbsp;{" "}
            {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>

        {/* Content — bottom overlay */}
        <div className="absolute bottom-0 inset-x-0 z-10 pb-6 flex flex-col items-center gap-4 px-8">
          {odinState === "thinking" && !response && (
            <p className="text-[11px] font-mono tracking-widest animate-pulse" style={{ color: "#fbbf24" }}>
              PROCESSING REQUEST…
            </p>
          )}

          {response && (
            <div className="max-w-2xl animate-fade-in flex flex-col items-center gap-3">
              <p className="text-sm leading-relaxed text-center" style={{ color: "rgba(200,240,255,0.88)" }}>
                {response}
                {streaming && (
                  <span className="inline-block w-[2px] h-[14px] ml-0.5 align-middle" style={{ backgroundColor: statusColor, animation: "cursor-blink 1s ease-in-out infinite" }} />
                )}
              </p>
              {pendingSms && !streaming && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={confirmSms}
                    className="px-4 py-2 rounded-full text-xs font-semibold transition-colors"
                    style={{ background: "rgba(52,211,153,0.16)", border: "1px solid rgba(52,211,153,0.35)", color: "rgba(210,255,235,0.95)" }}
                  >
                    Send text
                  </button>
                  <button
                    onClick={cancelSms}
                    className="px-4 py-2 rounded-full text-xs font-semibold transition-colors"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(115,247,255,0.16)", color: "rgba(226,244,255,0.62)" }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {!response && odinState === "idle" && stats && (
            <div className="flex gap-3 animate-fade-in flex-wrap justify-center">
              <StatChip label="Policies Today" value={String(stats.totalPolicies)} />
              <StatChip label="GWP" value={formatCurrency(stats.gwp)} />
              <StatChip label="Avg Premium" value={formatCurrency(stats.avgPremium)} />
              <StatChip label="Net Earn" value={formatCurrency(stats.netEarn)} />
            </div>
          )}

          {showStarters && !streaming && (
            <div className="flex flex-wrap gap-2 justify-center max-w-xl animate-fade-in">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-[11px] px-3 py-1.5 rounded-full transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(115,247,255,0.18)", color: "rgba(226,244,255,0.6)" }}
                  onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = "rgba(115,247,255,0.5)"; el.style.color = "rgba(226,244,255,0.95)"; }}
                  onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = "rgba(115,247,255,0.18)"; el.style.color = "rgba(226,244,255,0.6)"; }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Input bar */}
      <div className="relative z-10 px-8 pb-7 pt-4" style={{ background: "#02030d", borderTop: "1px solid rgba(115,247,255,0.07)" }}>
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="flex gap-3 items-center max-w-2xl mx-auto rounded-full px-5 py-3"
          style={{ background: "rgba(115,247,255,0.04)", border: `1px solid ${isActive ? "rgba(115,247,255,0.35)" : "rgba(115,247,255,0.14)"}`, transition: "border-color 0.5s ease" }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(input); } }}
            placeholder={`Ask OD1N anything, ${userName.split(" ")[0]}…`}
            disabled={streaming}
            className="flex-1 bg-transparent text-sm outline-none disabled:opacity-40"
            style={{ color: "rgba(226,244,255,0.9)", caretColor: "#73f7ff" }}
          />
          <button
            type="button"
            onClick={toggleVoice}
            title={voiceEnabled ? `Mute OD1N voice${voiceName ? ` (${voiceName})` : ""}` : "Enable OD1N voice"}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all"
            style={{
              background: voiceEnabled ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${voiceEnabled ? "rgba(52,211,153,0.28)" : "rgba(115,247,255,0.14)"}`,
            }}
          >
            {voiceEnabled
              ? <Volume2 className="w-3.5 h-3.5" style={{ color: "#34d399" }} />
              : <VolumeX className="w-3.5 h-3.5" style={{ color: "rgba(226,244,255,0.5)" }} />}
          </button>
          <button
            type="button"
            onClick={toggleListening}
            disabled={!speechSupported || streaming}
            title={speechSupported ? (listening ? "Stop listening" : "Speak to OD1N") : "Speech recognition is not available in this browser"}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-30"
            style={{
              background: listening ? "rgba(251,191,36,0.16)" : "rgba(115,247,255,0.08)",
              border: `1px solid ${listening ? "rgba(251,191,36,0.42)" : "rgba(115,247,255,0.22)"}`,
            }}
          >
            {listening
              ? <MicOff className="w-3.5 h-3.5" style={{ color: "#fbbf24" }} />
              : <Mic className="w-3.5 h-3.5" style={{ color: speechSupported ? "#73f7ff" : "rgba(226,244,255,0.35)" }} />}
          </button>
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-30"
            style={{ background: "rgba(115,247,255,0.12)", border: "1px solid rgba(115,247,255,0.25)", transition: "background 1.4s ease" }}
          >
            {streaming
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: statusColor }} />
              : <Send className="w-3.5 h-3.5" style={{ color: "#73f7ff" }} />}
          </button>
        </form>
        <p className="text-center text-[9px] mt-2 tracking-[0.4em] font-mono" style={{ color: "rgba(115,247,255,0.18)" }}>
          ODIN INTELLIGENCE NETWORK · COMMAND CENTRE v1 · {voiceEngine}
        </p>
      </div>
    </div>
  );
}

function speakOdinResponse(
  response: string,
  voice: SpeechSynthesisVoice | null,
  setOdinState: (state: OdinState) => void,
) {
  let cancelled = false;
  window.speechSynthesis.cancel();
  const chunks = splitSpeechIntoChunks(toSpokenText(response));

  const speakChunk = (index: number) => {
    if (cancelled || index >= chunks.length) {
      if (!cancelled) setOdinState("idle");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || "en-GB";
    utterance.rate = chunks[index].length > 120 ? 0.94 : 0.98;
    utterance.pitch = 0.88;
    utterance.volume = 0.95;
    utterance.onend = () => window.setTimeout(() => speakChunk(index + 1), index === 0 ? 90 : 140);
    utterance.onerror = () => setOdinState("idle");
    setOdinState("speaking");
    window.speechSynthesis.speak(utterance);
  };

  speakChunk(0);

  return () => {
    cancelled = true;
    window.speechSynthesis.cancel();
  };
}

function chooseOdinVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const scored = voices.map((voice) => {
    const name = voice.name.toLowerCase();
    const lang = voice.lang.toLowerCase();
    let score = 0;
    if (lang === "en-gb") score += 40;
    if (lang.startsWith("en-")) score += 15;
    if (name.includes("natural")) score += 35;
    if (name.includes("neural")) score += 30;
    if (name.includes("online")) score += 20;
    if (/\b(ryan|george|thomas|libby|sonia)\b/.test(name)) score += 18;
    if (name.includes("microsoft")) score += 8;
    if (voice.localService) score += 3;
    return { voice, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.voice ?? null;
}

function splitSpeechIntoChunks(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?,;:])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (`${current} ${sentence}`.trim().length > 220 && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = `${current} ${sentence}`.trim();
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}

function humanPauseMs(text: string): number {
  const trimmed = text.trim();
  if (/[!?]$/.test(trimmed)) return 70;
  if (/\.$/.test(trimmed)) return trimmed.length < 55 ? 35 : 60;
  if (/[,;:]$/.test(trimmed)) return 25;
  if (trimmed.length > 140) return 45;
  return 20;
}

function completeSentencePrefix(text: string): string {
  const match = text.match(/^([\s\S]*[.!?])(?:\s|$)/);
  if (match?.[1]) return match[1].trim();
  if (text.length > 120 && /[,;:]\s/.test(text)) {
    const index = Math.max(text.lastIndexOf(", "), text.lastIndexOf("; "), text.lastIndexOf(": "));
    if (index > 60) return text.slice(0, index + 1).trim();
  }
  return "";
}

function toSpokenText(text: string): string {
  return text
    .replace(/["]/g, "")
    .replace(/\u00A3\s?([\d,]+(?:\.\d{1,2})?)/g, "$1 pounds")
    .replace(/£\s?([\d,]+(?:\.\d{1,2})?)/g, "$1 pounds")
    .replace(/\b(\d+(?:\.\d+)?)%/g, "$1 percent")
    .replace(/\bGWP\b/g, "G W P")
    .replace(/\bYTD\b/g, "year to date")
    .replace(/\bavg\b/gi, "average")
    .replace(/\bSMS\b/g, "text message")
    .replace(/\bOD1N\b/g, "Odin")
    .replace(/\bNew-Renewals\b/g, "New Renewals")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSmsCommand(text: string): PendingSms | null {
  const simple = text.trim().match(/^(?:(?:hey\s+)?od(?:i|1)n[,\s]+)?(?:text|sms|message|send)(?:\s+(?:a\s+)?(?:text|sms|message))?(?:\s+to)?\s+(.+?)\s+(.+)$/i);
  if (simple?.[1] && simple[2]) {
    const recipient = simple[1].trim();
    const message = simple[2].trim();
    if (/^(?:07\d{9}|447\d{9})$/.test(recipient.replace(/\s+/g, ""))) {
      return { to: recipient, message };
    }
  }

  const match = text.trim().match(/^(?:(?:hey\s+)?od(?:i|1)n[,\s]+)?(?:please\s+)?send\s+(?:a\s+)?(?:text|sms)\s+to\s+(.+?)\s+(?:saying|that says|with(?: the)? message)\s+(.+)$/i);
  if (!match) return null;
  const recipient = match[1]?.trim();
  const message = match[2]?.trim();
  if (!recipient || !message) return null;
  if (/^(?:07\d{9}|447\d{9})$/.test(recipient.replace(/\s+/g, ""))) {
    return { to: recipient, message };
  }
  return { toName: recipient, message };
}

function parseAddContactCommand(text: string): AddContactCommand | null {
  const match = text.trim().match(/^(?:(?:hey\s+)?od(?:i|1)n[,\s]+)?(?:please\s+)?add\s+(?:a\s+)?contact\s+(.+?)\s+(?:as|with(?: the)? number|number)\s+(\+?\d[\d\s]+)$/i);
  if (!match) return null;
  const name = match[1]?.trim();
  const phone = match[2]?.trim();
  if (!name || !phone) return null;
  return { name, phone };
}

function parseStatsSmsCommand(text: string): StatsSmsCommand | null {
  const cleaned = text.trim().replace(/^(?:hey\s+)?od(?:i|1)n[,\s]+/i, "");
  const lower = cleaned.toLowerCase();
  const knownKind = getStatsKind(lower);
  const patterns = [
    /^(?:can\s+you\s+|please\s+)?(?:send|text|sms|message)\s+(.+?)\s+(?:the\s+)?(renewal|renewals|renewel|renewels|renwal|renwals|renewls|call|calls)\s+(?:stats|summary|figures|numbers|report|update)(?:\s+for\s+(today|this week|week|this month|month|ytd|year to date))?$/i,
    /^(?:can\s+you\s+|please\s+)?(?:send|text|sms|message)\s+(?:the\s+)?(renewal|renewals|renewel|renewels|renwal|renwals|renewls|call|calls)\s+(?:stats|summary|figures|numbers|report|update)(?:\s+for\s+(today|this week|week|this month|month|ytd|year to date))?\s+to\s+(.+?)$/i,
    /^(?:can\s+you\s+|please\s+)?(?:send|text|sms|message)\s+(.+?)\s+(?:this\s+week(?:'s)?|this\s+month(?:'s)?|today's|ytd)?\s*(renewal|renewals|renewel|renewels|renwal|renwals|renewls|call|calls)\s+(?:stats|summary|figures|numbers|report|update)$/i,
  ];

  let toName = "";
  let rawKind = "";
  let rawPeriod = getRawPeriod(lower);

  const directMatch = cleaned.match(patterns[0]);
  if (directMatch) {
    toName = directMatch[1]?.trim() ?? "";
    rawKind = directMatch[2]?.toLowerCase() ?? "";
    rawPeriod = (directMatch[3] ?? rawPeriod).toLowerCase();
  } else {
    const toMatch = cleaned.match(patterns[1]);
    if (toMatch) {
      rawKind = toMatch[1]?.toLowerCase() ?? "";
      rawPeriod = (toMatch[2] ?? rawPeriod).toLowerCase();
      toName = toMatch[3]?.trim() ?? "";
    } else {
      const textMatch = cleaned.match(patterns[2]);
      if (textMatch) {
        toName = textMatch[1]?.trim() ?? "";
        rawKind = textMatch[2]?.toLowerCase() ?? "";
      } else {
        const contactName = extractKnownContactName(cleaned);
        if (!contactName || !knownKind || !/\b(?:send|text|sms|message)\b/.test(lower)) return null;
        toName = contactName;
        rawKind = knownKind;
      }
    }
  }

  if (!toName || !rawKind) return null;

  const kind = rawKind === "combined" ? "combined" : rawKind.startsWith("call") ? "calls" : "renewals";
  const period =
    rawPeriod === "this week" || rawPeriod === "week" ? "week" :
    rawPeriod === "this month" || rawPeriod === "month" ? "month" :
    rawPeriod === "ytd" || rawPeriod === "year to date" ? "ytd" :
    "today";

  return { toName, kind, period };
}

function getStatsKind(text: string): "renewals" | "calls" | "combined" | "" {
  const hasCalls = /\b(?:call|calls|phone|phones|pbx)\b/.test(text);
  const hasRenewals = /\b(?:renewal|renewals|renewel|renewels|renwal|renwals|renewls)\b/.test(text);
  if (hasCalls && hasRenewals) return "combined";
  if (hasCalls) return "calls";
  if (hasRenewals) return "renewals";
  return "";
}

function getRawPeriod(text: string): string {
  if (/\b(?:ytd|year to date)\b/.test(text)) return "ytd";
  if (/\b(?:this month|month)\b/.test(text)) return "this month";
  if (/\b(?:this week|week|weekly)\b/.test(text)) return "this week";
  return "today";
}

function extractKnownContactName(text: string): string {
  const lower = text.toLowerCase();
  const commonContacts = ["Thomas", "George", "James Noble", "James"];
  return commonContacts
    .sort((a, b) => b.length - a.length)
    .find((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) ?? "";
}

function parseQuickAnswerIntent(text: string): QuickAnswerIntent | null {
  const cleaned = text.trim().replace(/^(?:hey\s+)?od(?:i|1)n[,\s]+/i, "").toLowerCase();
  const period = getPeriod(cleaned);

  const asksOff =
    /\b(?:who|who's|whos|anyone|people|staff|employees|team)\b/.test(cleaned) &&
    /\b(?:off|out|ooo|holiday|leave|absent|absence|annual leave)\b/.test(cleaned);
  if (asksOff) return { kind: "hr_off_today", period };

  const asksPendingLeave =
    /\b(?:pending|awaiting|requested|requests?)\b/.test(cleaned) &&
    /\b(?:leave|holiday|absence|annual leave)\b/.test(cleaned);
  if (asksPendingLeave) return { kind: "hr_pending_leave", period };

  const asksHr =
    /\b(?:hr|headcount|staff|employees|people|team cover|teams)\b/.test(cleaned) &&
    /\b(?:summary|stats|figures|numbers|headcount|cover|how many|show)\b/.test(cleaned);
  if (asksHr) return { kind: "hr_summary", period };

  const asksRenewals =
    /\b(?:renewal|renewals)\b/.test(cleaned) &&
    /\b(?:stat|stats|summary|figures|numbers|performance|doing|how are|today|week|month|ytd)\b/.test(cleaned);
  if (asksRenewals) return { kind: "renewals", period };

  const asksCalls =
    /\b(?:call|calls|phone|pbx)\b/.test(cleaned) &&
    /\b(?:stat|stats|summary|figures|numbers|performance|doing|how are|today|week|month|ytd)\b/.test(cleaned);
  if (asksCalls) return { kind: "calls", period };

  return null;
}

function getPeriod(text: string): "today" | "week" | "month" | "ytd" {
  if (/\b(?:ytd|year to date)\b/.test(text)) return "ytd";
  if (/\b(?:this month|month)\b/.test(text)) return "month";
  if (/\b(?:this week|week|weekly)\b/.test(text)) return "week";
  return "today";
}

function periodLabel(period: "today" | "week" | "month" | "ytd"): string {
  if (period === "week") return "this week";
  if (period === "month") return "this month";
  if (period === "ytd") return "YTD";
  return "today";
}

async function getHrAnswer(kind: QuickAnswerIntent["kind"]): Promise<string> {
  const res = await fetch("/api/hr/summary");
  if (!res.ok) throw new Error("HR unavailable");
  const data = (await res.json()) as HrSummaryResponse;

  if (kind === "hr_off_today") {
    if (data.outToday.length === 0) return "Nobody is showing as out of office today.";
    const names = data.outToday.slice(0, 8).map((row) => row.employeeName);
    const extra = data.outToday.length > names.length ? `, plus ${data.outToday.length - names.length} more` : "";
    return `Out of office today: ${names.join(", ")}${extra}.`;
  }

  if (kind === "hr_pending_leave") {
    if (data.pendingLeave === 0) return "There are no pending leave requests showing in Sage HR.";
    const names = data.recentRequests
      .filter((row) => /pending|awaiting|requested/i.test(row.status))
      .slice(0, 8)
      .map((row) => row.employeeName);
    const list = names.length ? `: ${names.join(", ")}` : "";
    return `${data.pendingLeave} pending leave request${data.pendingLeave === 1 ? "" : "s"}${list}.`;
  }

  const teams = data.teams
    .slice(0, 4)
    .map((team) => `${team.team} ${team.headcount}`)
    .join(", ");
  return `HR summary: ${data.headcount} employees, ${data.offToday} out today, ${data.pendingLeave} pending leave requests. Largest teams: ${teams}.`;
}

async function getRenewalsAnswer(period: "today" | "week" | "month" | "ytd"): Promise<string> {
  const res = await fetch(`/api/renewals/summary?period=${period}`);
  if (!res.ok) throw new Error("Renewals unavailable");
  const data = (await res.json()) as SummaryResponse;
  return `Renewals ${periodLabel(period)}: ${data.renewedPolicies} renewed, ${formatCurrency(data.gwp)} GWP, ${formatCurrency(data.netEarn)} net earn, avg premium ${formatCurrency(data.avgPremium)}, finance penetration ${Math.round(data.financePenPct)}%.`;
}

async function getCallsAnswer(period: "today" | "week" | "month" | "ytd"): Promise<string> {
  const mapped = period === "ytd" ? "month" : period;
  const res = await fetch(`/api/calls/summary?period=${mapped}`);
  if (!res.ok) throw new Error("Calls unavailable");
  const data = (await res.json()) as CallsSummaryResponse;
  return `Calls ${periodLabel(period)}: ${data.totalCalls} New-Renewals calls, avg wait ${formatSeconds(data.avgWaitSec)}, avg duration ${formatSeconds(data.avgDurationSec)}, longest wait ${formatSeconds(data.longestWaitSec)}.`;
}

function formatSeconds(seconds: number): string {
  if (seconds <= 0) return "0s";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return minutes ? `${minutes}m ${secs}s` : `${secs}s`;
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl" style={{ background: "rgba(115,247,255,0.05)", border: "1px solid rgba(115,247,255,0.12)" }}>
      <span className="text-[10px] tracking-wide" style={{ color: "rgba(115,247,255,0.55)" }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: "rgba(226,244,255,0.9)" }}>{value}</span>
    </div>
  );
}
