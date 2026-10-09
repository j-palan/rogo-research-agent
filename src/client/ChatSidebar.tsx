import type { ChatSession } from "./chat-store.ts";
import { CloseIcon, MessageIcon, PlusIcon, ResearchIcon } from "./icons.tsx";

interface ChatSidebarProps {
  chats: ChatSession[];
  activeChatId: string;
  open: boolean;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onClose: () => void;
}

const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function ChatSidebar({
  chats,
  activeChatId,
  open,
  onNewChat,
  onSelectChat,
  onClose,
}: ChatSidebarProps) {
  const sortedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside
      id="chat-sidebar"
      className={`sidebar${open ? " open" : ""}`}
      aria-label="Chat history"
      aria-hidden={!open}
      inert={!open}
    >
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">
            <ResearchIcon />
          </span>
          <span>
            <strong>Rogo</strong>
            <small>Research agent</small>
          </span>
        </div>
        <button
          className="icon-button sidebar-close"
          type="button"
          onClick={onClose}
          aria-label="Hide sidebar"
          title="Hide sidebar"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="sidebar-actions">
        <button className="new-chat" type="button" onClick={onNewChat}>
          <PlusIcon />
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
                  <MessageIcon className="chat-item-icon" />
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
