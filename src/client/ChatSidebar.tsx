import { useEffect, useRef, useState } from "react";
import type { ChatSession } from "./chat-store.ts";
import {
  CloseIcon,
  MessageIcon,
  MoreIcon,
  PencilIcon,
  PlusIcon,
  ResearchIcon,
  TrashIcon,
} from "./icons.tsx";

interface ChatSidebarProps {
  chats: ChatSession[];
  activeChatId: string;
  open: boolean;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onDeleteChat: (id: string) => void;
  onClose: () => void;
}

interface DialogRequest {
  action: "rename" | "delete";
  chat: ChatSession;
}

const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function ChatActionDialog({
  request,
  onRename,
  onDelete,
  onClose,
}: {
  request: DialogRequest;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(request.chat.title);
  const isRename = request.action === "rename";

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="chat-dialog"
      aria-labelledby="chat-dialog-title"
      aria-describedby="chat-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (isRename) {
            const nextTitle = title.trim();
            if (!nextTitle) return;
            onRename(request.chat.id, nextTitle);
          } else {
            onDelete(request.chat.id);
          }
          onClose();
        }}
      >
        <div className="dialog-heading">
          <span className={`dialog-icon${isRename ? "" : " danger"}`} aria-hidden="true">
            {isRename ? <PencilIcon /> : <TrashIcon />}
          </span>
          <div>
            <h2 id="chat-dialog-title">
              {isRename ? "Rename chat" : "Delete chat?"}
            </h2>
            <p id="chat-dialog-description">
              {isRename
                ? "Choose a short name that makes this conversation easy to find."
                : `“${request.chat.title}” will be permanently removed from this browser.`}
            </p>
          </div>
        </div>

        {isRename && (
          <div className="dialog-field">
            <label htmlFor="chat-name">Chat name</label>
            <input
              id="chat-name"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={64}
              autoFocus
            />
          </div>
        )}

        <div className="dialog-actions">
          <button className="dialog-button secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`dialog-button${isRename ? " primary" : " danger"}`}
            type="submit"
            disabled={isRename && !title.trim()}
            autoFocus={!isRename}
          >
            {isRename ? "Save name" : "Delete chat"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function ChatSidebar({
  chats,
  activeChatId,
  open,
  onNewChat,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onClose,
}: ChatSidebarProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [dialogRequest, setDialogRequest] = useState<DialogRequest | null>(null);
  const sortedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);

  useEffect(() => {
    if (!open) setOpenMenuId(null);
  }, [open]);

  function openDialog(action: DialogRequest["action"], chat: ChatSession) {
    setOpenMenuId(null);
    setDialogRequest({ action, chat });
  }

  return (
    <>
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
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Hide sidebar"
            title="Hide sidebar"
          >
            <CloseIcon />
          </button>
        </div>

        <button className="new-chat" type="button" onClick={onNewChat}>
          <PlusIcon />
          New chat
        </button>

        <nav className="chat-history" aria-label="Previous chats">
          <p className="chat-history-label">Previous chats</p>
          <ul className="chat-list">
            {sortedChats.map((chat) => {
              const lastUsed = timestampFormatter.format(chat.updatedAt);
              const menuOpen = openMenuId === chat.id;
              const menuId = `chat-actions-${chat.id}`;

              return (
                <li
                  className={`chat-list-entry${chat.id === activeChatId ? " active" : ""}${
                    menuOpen ? " menu-open" : ""
                  }`}
                  key={chat.id}
                >
                  <div className="chat-list-row">
                    <button
                      className={`chat-list-item${chat.id === activeChatId ? " active" : ""}`}
                      type="button"
                      onClick={() => {
                        setOpenMenuId(null);
                        onSelectChat(chat.id);
                      }}
                      aria-current={chat.id === activeChatId ? "page" : undefined}
                      title={chat.title}
                    >
                      <MessageIcon className="chat-item-icon" />
                      <span className="chat-title">{chat.title}</span>
                    </button>
                    <button
                      className="chat-options-button"
                      type="button"
                      onClick={() => setOpenMenuId(menuOpen ? null : chat.id)}
                      aria-label={`Actions for ${chat.title}`}
                      aria-expanded={menuOpen}
                      aria-controls={menuOpen ? menuId : undefined}
                      title="Chat details and actions"
                    >
                      <MoreIcon />
                    </button>
                  </div>

                  {menuOpen && (
                    <div
                      className="chat-action-card"
                      id={menuId}
                      role="group"
                      aria-label={`Details and actions for ${chat.title}`}
                    >
                      <p>Last used {lastUsed}</p>
                      <div className="chat-action-buttons">
                        <button type="button" onClick={() => openDialog("rename", chat)}>
                          <PencilIcon />
                          Rename
                        </button>
                        <button
                          className="danger"
                          type="button"
                          onClick={() => openDialog("delete", chat)}
                        >
                          <TrashIcon />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {dialogRequest && (
        <ChatActionDialog
          request={dialogRequest}
          onRename={onRenameChat}
          onDelete={onDeleteChat}
          onClose={() => setDialogRequest(null)}
        />
      )}
    </>
  );
}
