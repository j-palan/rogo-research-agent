import { expect, it } from "vitest";
import {
  createChat,
  loadChatState,
  saveChatState,
  titleFromMessage,
  type ChatState,
} from "./chat-store.ts";

class MemoryStorage {
  value: string | null = null;

  getItem() {
    return this.value;
  }

  setItem(_key: string, value: string) {
    this.value = value;
  }
}

it("creates a one-line chat title from the first request", () => {
  expect(titleFromMessage("  Compare Acme\nwith Globex  ")).toBe(
    "Compare Acme with Globex",
  );
  expect(titleFromMessage("A".repeat(60))).toBe(`${"A".repeat(51)}…`);
});

it("persists chat sessions and restores a valid active chat", () => {
  const storage = new MemoryStorage();
  const chat = createChat(123, "chat-1");
  const state: ChatState = {
    chats: [
      {
        ...chat,
        title: "Globex growth",
        messages: [{ id: "message-1", role: "user", text: "How fast is Globex growing?" }],
      },
    ],
    activeChatId: chat.id,
  };

  saveChatState(state, storage);
  expect(loadChatState(storage)).toEqual(state);
});
