import type { ChatMessage } from "../shared/chat.ts";

interface ToolActivity {
  id: string;
  label: string;
  status: "running" | "complete" | "failed";
  ms?: number;
  message?: string;
}

export interface TranscriptMessage extends ChatMessage {
  id: string;
  pending?: boolean;
  phase?: string;
  activity?: ToolActivity[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: TranscriptMessage[];
  updatedAt: number;
}

export interface ChatState {
  chats: ChatSession[];
  activeChatId: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = "rogo-research-chats-v1";

export function createChat(
  now = Date.now(),
  id: string = crypto.randomUUID(),
): ChatSession {
  return { id, title: "New chat", messages: [], updatedAt: now };
}

function createInitialChatState(): ChatState {
  const chat = createChat();
  return { chats: [chat], activeChatId: chat.id };
}

export function titleFromMessage(text: string, maxLength = 52): string {
  const title = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[`*_#>\[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!title) return "New chat";
  if (title.length <= maxLength) return title;
  return `${title.slice(0, maxLength - 1).trimEnd()}…`;
}

export function renameChat(
  state: ChatState,
  chatId: string,
  title: string,
): ChatState {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return state;

  return {
    ...state,
    chats: state.chats.map((chat) =>
      chat.id === chatId ? { ...chat, title: trimmedTitle } : chat,
    ),
  };
}

export function deleteChat(state: ChatState, chatId: string): ChatState {
  if (!state.chats.some((chat) => chat.id === chatId)) return state;

  const chats = state.chats.filter((chat) => chat.id !== chatId);
  if (chats.length === 0) return createInitialChatState();
  if (state.activeChatId !== chatId) return { ...state, chats };

  const newestChat = chats.reduce((newest, chat) =>
    chat.updatedAt > newest.updatedAt ? chat : newest,
  );
  return { chats, activeChatId: newestChat.id };
}

function isTranscriptMessage(value: unknown): value is TranscriptMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Partial<TranscriptMessage>;
  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.text === "string"
  );
}

function isChatSession(value: unknown): value is ChatSession {
  if (typeof value !== "object" || value === null) return false;
  const chat = value as Partial<ChatSession>;
  return (
    typeof chat.id === "string" &&
    typeof chat.title === "string" &&
    typeof chat.updatedAt === "number" &&
    Array.isArray(chat.messages) &&
    chat.messages.every(isTranscriptMessage)
  );
}

export function loadChatState(storage: StorageLike = localStorage): ChatState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return createInitialChatState();

    const parsed = JSON.parse(raw) as Partial<ChatState>;
    const chats = Array.isArray(parsed.chats)
      ? parsed.chats.filter(isChatSession).map((chat) => ({
          ...chat,
          messages: chat.messages
            .filter((message) => message.text.trim())
            .map((message) =>
              message.pending ? { ...message, pending: false } : message,
            ),
        }))
      : [];

    if (chats.length === 0) return createInitialChatState();
    const activeChatId = chats.some((chat) => chat.id === parsed.activeChatId)
      ? (parsed.activeChatId as string)
      : chats[0].id;
    return { chats, activeChatId };
  } catch {
    return createInitialChatState();
  }
}

export function saveChatState(
  state: ChatState,
  storage: StorageLike = localStorage,
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Chatting should continue if storage is unavailable or full.
  }
}
