import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, ChatStreamEvent } from "../shared/chat.ts";
import { ChatSidebar } from "./ChatSidebar.tsx";
import { SendIcon, SidebarIcon } from "./icons.tsx";
import {
  createChat,
  deleteChat,
  loadChatState,
  renameChat,
  saveChatState,
  titleFromMessage,
  type ChatSession,
  type TranscriptMessage,
} from "./chat-store.ts";

const EXAMPLES = [
  {
    label: "Compare companies",
    prompt: "Compare Acme and Globex and tell me which one appears to be growing faster.",
  },
  {
    label: "Review risk factors",
    prompt: "What are the biggest risks Umbrella Health flags in its filings?",
  },
  {
    label: "Analyze a transition",
    prompt: "How is Initech's subscription transition going?",
  },
  {
    label: "Screen the universe",
    prompt: "Which company in the universe is growing fastest?",
  },
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

function Composer({
  input,
  busy,
  home = false,
  onInputChange,
  onSend,
}: {
  input: string;
  busy: boolean;
  home?: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div className={`composer-dock${home ? " home" : ""}`}>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <label className="sr-only" htmlFor="research-question">
          Research question
        </label>
        <textarea
          id="research-question"
          rows={1}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask Rogo about a company, filing, or financial trend…"
          disabled={busy}
        />
        <button
          className="send-button"
          type="submit"
          disabled={busy || !input.trim()}
        >
          <SendIcon />
          <span className="sr-only">Send question</span>
        </button>
      </form>
      <p className="composer-hint">Enter to send · Shift + Enter for a new line</p>
    </div>
  );
}

export function App() {
  const [chatState, setChatState] = useState(() => loadChatState());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => !window.matchMedia("(max-width: 760px)").matches,
  );
  const activeChat = chatState.chats.find(
    (chat) => chat.id === chatState.activeChatId,
  );
  const messages = activeChat?.messages ?? [];

  useEffect(() => {
    saveChatState(chatState);
  }, [chatState]);

  function updateChat(id: string, update: (chat: ChatSession) => ChatSession) {
    setChatState((prev) => ({
      ...prev,
      chats: prev.chats.map((chat) => (chat.id === id ? update(chat) : chat)),
    }));
  }

  function startNewChat() {
    if (activeChat?.messages.length === 0) {
      closeSidebarOnMobile();
      return;
    }

    const chat = createChat();
    setChatState((prev) => ({
      chats: [chat, ...prev.chats],
      activeChatId: chat.id,
    }));
    setInput("");
    closeSidebarOnMobile();
  }

  function selectChat(id: string) {
    setChatState((prev) => ({ ...prev, activeChatId: id }));
    setInput("");
    closeSidebarOnMobile();
  }

  function handleRenameChat(id: string, title: string) {
    setChatState((prev) => renameChat(prev, id, title));
  }

  function handleDeleteChat(id: string) {
    setChatState((prev) => deleteChat(prev, id));
    if (id === chatState.activeChatId) setInput("");
  }

  function closeSidebarOnMobile() {
    if (window.matchMedia("(max-width: 760px)").matches) setSidebarOpen(false);
  }

  async function send(question: string) {
    const text = question.trim();
    if (!text || busy || !activeChat) return;

    const chatId = activeChat.id;
    const conversation: ChatMessage[] = [
      ...messages
        .filter((message) => message.text.trim())
        .map(({ role, text: messageText }) => ({ role, text: messageText })),
      { role: "user", text },
    ];
    const assistantId = crypto.randomUUID();
    updateChat(chatId, (chat) => ({
      ...chat,
      title: chat.messages.length === 0 ? titleFromMessage(text) : chat.title,
      updatedAt: Date.now(),
      messages: [
        ...chat.messages,
        { id: crypto.randomUUID(), role: "user", text },
        {
          id: assistantId,
          role: "assistant",
          text: "",
          pending: true,
          phase: "Planning research…",
          activity: [],
        },
      ],
    }));
    setInput("");
    setBusy(true);

    const updateAssistant = (
      update: (message: TranscriptMessage) => TranscriptMessage,
      touch = false,
    ) => {
      updateChat(chatId, (chat) => ({
        ...chat,
        updatedAt: touch ? Date.now() : chat.updatedAt,
        messages: chat.messages.map((message) =>
          message.id === assistantId ? update(message) : message,
        ),
      }));
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
            updateAssistant(
              (message) => ({
                ...message,
                text: event.answer,
                pending: false,
                phase: "Research complete",
              }),
              true,
            );
            break;
          case "error":
            receivedTerminalEvent = true;
            updateAssistant(
              (message) => ({
                ...message,
                text: `Something went wrong: ${event.message}`,
                pending: false,
                phase: "Research stopped",
              }),
              true,
            );
            break;
        }
      });

      if (!receivedTerminalEvent) throw new Error("The response ended before an answer arrived");
    } catch (err) {
      if (!receivedTerminalEvent) {
        const message = err instanceof Error ? err.message : String(err);
        updateAssistant(
          (assistant) => ({
            ...assistant,
            text: `Something went wrong: ${message}`,
            pending: false,
            phase: "Research stopped",
          }),
          true,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`app-shell${sidebarOpen ? "" : " sidebar-closed"}`}>
      <ChatSidebar
        chats={chatState.chats}
        activeChatId={chatState.activeChatId}
        open={sidebarOpen}
        onNewChat={startNewChat}
        onSelectChat={selectChat}
        onRenameChat={handleRenameChat}
        onDeleteChat={handleDeleteChat}
        onClose={() => setSidebarOpen(false)}
      />

      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close chat history"
        />
      )}

      <main className="app">
        <header className="topbar">
          <button
            className="icon-button"
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-controls="chat-sidebar"
            aria-expanded={sidebarOpen}
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            <SidebarIcon />
          </button>
          <div className="topbar-title">
            <h1>{activeChat?.title ?? "New research"}</h1>
            <p>Company intelligence workspace</p>
          </div>
        </header>

        <div className={`transcript${messages.length === 0 ? " empty" : ""}`}>
          {messages.length === 0 && (
            <section className="welcome" aria-labelledby="welcome-title">
              <h2 id="welcome-title">What would you like to investigate?</h2>
              <p className="welcome-copy">
                Ask about companies, compare financial performance, or search filings
                across the coverage universe.
              </p>
              <Composer
                input={input}
                busy={busy}
                home
                onInputChange={setInput}
                onSend={() => send(input)}
              />
              <details className="examples">
                <summary>
                  <span>Example prompts</span>
                  <small>{EXAMPLES.length} ideas</small>
                </summary>
                <div className="example-list" aria-label="Example research questions">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example.prompt}
                      onClick={() => send(example.prompt)}
                      title={example.prompt}
                    >
                      <strong>{example.label}</strong>
                      <span>{example.prompt}</span>
                    </button>
                  ))}
                </div>
              </details>
            </section>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`message-row ${message.role}`}
              aria-busy={message.pending || undefined}
            >
              <div className={`message-content ${message.role}`}>
                <span className="message-author">
                  {message.role === "assistant" ? "Rogo Research" : "You"}
                </span>
                <div className={`bubble ${message.role}`}>
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
              </div>
            </div>
          ))}
        </div>

        {messages.length > 0 && (
          <Composer
            input={input}
            busy={busy}
            onInputChange={setInput}
            onSend={() => send(input)}
          />
        )}
      </main>
    </div>
  );
}
