import type { ChatSession } from "./chat-store.ts";

interface ChatSidebarProps {
  chats: ChatSession[];
  activeChatId: string;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
}

const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function ChatSidebar({
  chats,
  activeChatId,
  onNewChat,
  onSelectChat,
}: ChatSidebarProps) {
  const sortedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside className="sidebar" aria-label="Chat history">
      <div className="sidebar-header">
        <span className="sidebar-brand">Rogo Research</span>
        <button className="new-chat" type="button" onClick={onNewChat}>
          <span aria-hidden="true">+</span>
          New chat
        </button>
      </div>

      <nav className="chat-history" aria-label="Previous chats">
        <p className="chat-history-label">Previous chats</p>
        <ul className="chat-list">
          {sortedChats.map((chat) => {
            const lastUsed = timestampFormatter.format(chat.updatedAt);
            return (
              <li key={chat.id}>
                <button
                  className={`chat-list-item${chat.id === activeChatId ? " active" : ""}`}
                  type="button"
                  onClick={() => onSelectChat(chat.id)}
                  aria-current={chat.id === activeChatId ? "page" : undefined}
                  aria-label={`${chat.title}. Last used ${lastUsed}`}
                  title={`Last used ${lastUsed}`}
                >
                  <span className="chat-title">{chat.title}</span>
                  <span className="chat-last-used" aria-hidden="true">
                    Last used {lastUsed}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
