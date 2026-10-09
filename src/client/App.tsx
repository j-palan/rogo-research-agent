import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, ChatStreamEvent } from "../shared/chat.ts";

interface ToolActivity {
  id: string;
  label: string;
  status: "running" | "complete" | "failed";
  ms?: number;
  message?: string;
}

interface TranscriptMessage extends ChatMessage {
  id: string;
  pending?: boolean;
  phase?: string;
  activity?: ToolActivity[];
}

const EXAMPLES = [
  "Compare Acme and Globex and tell me which one appears to be growing faster.",
  "What are the biggest risks Umbrella Health flags in its filings?",
  "How is Initech's subscription transition going?",
  "Which company in the universe is growing fastest?",
];

function inputValue(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function toolLabel(name: string, input: unknown): string {
  const company = inputValue(input, "company");
  const query = inputValue(input, "query");

  switch (name) {
    case "searchCompanies":
      return query ? `Finding companies matching “${query}”` : "Finding companies";
    case "getCompanyProfile":
      return company ? `Loading ${company} profile` : "Loading company profile";
    case "getFinancials":
      return company ? `Loading ${company} financials` : "Loading financials";
    case "searchDocuments":
      if (company && query) return `Searching ${company} documents for “${query}”`;
      return query ? `Searching documents for “${query}”` : "Searching documents";
    default:
      return `Running ${name}`;
  }
}

async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as ChatStreamEvent);
    }

    if (done) break;
  }

  if (buffer.trim()) onEvent(JSON.parse(buffer) as ChatStreamEvent);
}

function ResearchActivity({ message }: { message: TranscriptMessage }) {
  const activity = message.activity ?? [];
  if (!message.pending && activity.length === 0) return null;

  const failed = activity.filter((item) => item.status === "failed").length;
  const summary = message.pending
    ? (message.phase ?? "Working…")
    : `Research complete · ${activity.length} tool call${activity.length === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}`;

  return (
    <details className="research-activity" open={message.pending}>
      <summary>
        <span
          role={message.pending ? "status" : undefined}
          aria-live={message.pending ? "polite" : undefined}
          aria-atomic={message.pending ? "true" : undefined}
        >
          {summary}
        </span>
      </summary>

      {activity.length > 0 && (
        <ul className="activity-list">
          {activity.map((item) => (
            <li className="activity-item" key={item.id}>
              <span className={`activity-indicator ${item.status}`} aria-hidden="true" />
              <span className="activity-label">
                {item.label}
                <span className="sr-only"> — {item.status}</span>
                {item.status === "failed" && item.message && (
                  <span className="activity-error">{item.message}</span>
                )}
              </span>
              {item.ms !== undefined && <span className="activity-duration">{item.ms}ms</span>}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export function App() {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;

    const conversation: ChatMessage[] = [
      ...messages
        .filter((message) => message.text.trim())
        .map(({ role, text: messageText }) => ({ role, text: messageText })),
      { role: "user", text },
    ];
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text },
      {
        id: assistantId,
        role: "assistant",
        text: "",
        pending: true,
        phase: "Planning research…",
        activity: [],
      },
    ]);
    setInput("");
    setBusy(true);

    const updateAssistant = (
      update: (message: TranscriptMessage) => TranscriptMessage,
    ) => {
      setMessages((prev) =>
        prev.map((message) => (message.id === assistantId ? update(message) : message)),
      );
    };

    let receivedTerminalEvent = false;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: unknown };
        throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
      }
      if (!res.body) throw new Error("The response stream was unavailable");

      await readEventStream(res.body, (event) => {
        switch (event.type) {
          case "iteration":
            updateAssistant((message) => ({
              ...message,
              phase: event.n === 1 ? "Planning research…" : "Reviewing research…",
            }));
            break;
          case "tool_start":
            updateAssistant((message) => ({
              ...message,
              phase: "Researching…",
              activity: [
                ...(message.activity ?? []).filter((item) => item.id !== event.id),
                {
                  id: event.id,
                  label: toolLabel(event.name, event.input),
                  status: "running",
                },
              ],
            }));
            break;
          case "tool_end":
            updateAssistant((message) => ({
              ...message,
              activity: (message.activity ?? []).map((item) =>
                item.id === event.id
                  ? { ...item, status: "complete", ms: event.ms }
                  : item,
              ),
            }));
            break;
          case "tool_failed":
            updateAssistant((message) => ({
              ...message,
              phase: "Continuing with available research…",
              activity: (message.activity ?? []).map((item) =>
                item.id === event.id
                  ? {
                      ...item,
                      status: "failed",
                      message: event.message,
                      ms: event.ms,
                    }
                  : item,
              ),
            }));
            break;
          case "answer":
            receivedTerminalEvent = true;
            updateAssistant((message) => ({
              ...message,
              text: event.answer,
              pending: false,
              phase: "Research complete",
            }));
            break;
          case "error":
            receivedTerminalEvent = true;
            updateAssistant((message) => ({
              ...message,
              text: `Something went wrong: ${event.message}`,
              pending: false,
              phase: "Research stopped",
            }));
            break;
        }
      });

      if (!receivedTerminalEvent) throw new Error("The response ended before an answer arrived");
    } catch (err) {
      if (!receivedTerminalEvent) {
        const message = err instanceof Error ? err.message : String(err);
        updateAssistant((assistant) => ({
          ...assistant,
          text: `Something went wrong: ${message}`,
          pending: false,
          phase: "Research stopped",
        }));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Rogo Research</h1>
        <p>Ask a question about a company in our coverage universe.</p>
      </header>

      <div className="transcript">
        {messages.length === 0 && (
          <div className="examples">
            {EXAMPLES.map((example) => (
              <button key={example} onClick={() => send(example)}>
                {example}
              </button>
            ))}
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`bubble ${message.role}`}
            aria-busy={message.pending || undefined}
          >
            {message.role === "assistant" ? (
              <>
                <ResearchActivity message={message} />
                {message.text && (
                  <div className="markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                  </div>
                )}
              </>
            ) : (
              message.text
            )}
          </div>
        ))}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a research question…"
          disabled={busy}
        />
        <button type="submit" disabled={busy}>
          Send
        </button>
      </form>
    </div>
  );
}
