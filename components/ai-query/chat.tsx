"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { Send, Loader2, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "Why did renewal rate drop this week?",
  "Which customer cohort is most at risk of lapsing?",
  "Predict premium income for the next 7 days.",
  "What's driving the funnel drop-off at quote acceptance?",
];

export function AiQueryChat({ userName }: { userName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages([...next, assistantMsg]);

    try {
      const res = await fetch("/api/ai-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;
          try {
            const { text, error } = JSON.parse(payload) as { text?: string; error?: string };
            if (error) throw new Error(error);
            if (text) {
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = {
                  ...copy[copy.length - 1],
                  content: copy[copy.length - 1].content + text,
                };
                return copy;
              });
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          content: "Sorry, something went wrong. Please try again.",
        };
        return copy;
      });
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex flex-col h-full px-8 py-6 gap-4">
      {/* Message area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-brand-purple/20 flex items-center justify-center">
              <Bot className="w-8 h-8 text-brand-purple" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">Ask me anything, {userName.split(" ")[0]}</p>
              <p className="text-sm text-txt-muted mt-1">
                I have access to all your current renewals data.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-xl">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm px-4 py-3 rounded-xl bg-bg-card border border-bg-line hover:border-brand-purple/50 hover:bg-bg-elev transition-colors text-txt-secondary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pb-2">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-3 max-w-3xl",
                  msg.role === "user" && "ml-auto flex-row-reverse"
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold mt-0.5",
                    msg.role === "user"
                      ? "bg-grad-blue"
                      : "bg-brand-purple/20 text-brand-purple"
                  )}
                >
                  {msg.role === "user" ? (
                    userName.slice(0, 1).toUpperCase()
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                    msg.role === "user"
                      ? "bg-brand-blue/20 text-txt-primary"
                      : "bg-bg-card border border-bg-line text-txt-primary"
                  )}
                >
                  {msg.content}
                  {streaming && i === messages.length - 1 && msg.role === "assistant" && msg.content === "" && (
                    <span className="inline-flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-purple animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-purple animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-purple animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex gap-3 items-end bg-bg-card border border-bg-line rounded-2xl px-4 py-3"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about renewals, cohorts, income, forecasts…"
          rows={1}
          className="flex-1 bg-transparent resize-none text-sm text-txt-primary placeholder:text-txt-muted outline-none leading-relaxed max-h-32"
          style={{ height: "auto" }}
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = "auto";
            t.style.height = `${t.scrollHeight}px`;
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          className="flex-shrink-0 w-9 h-9 rounded-xl bg-brand-purple flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-purple/80 transition-colors"
        >
          {streaming ? (
            <Loader2 className="w-4 h-4 text-white animate-spin" />
          ) : (
            <Send className="w-4 h-4 text-white" />
          )}
        </button>
      </form>
    </div>
  );
}
