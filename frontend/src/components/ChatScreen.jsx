// src/components/ChatScreen.jsx
// The main chat UI.
//
// Left sidebar: people you can talk to (with online dots) and your
// existing conversations. Right pane: the open conversation.
//
// Data flow:
//  - REST  -> initial load of users, conversations, message history
//  - Socket -> new messages arrive here in real time
//  - Socket also handles `conversation:new` (someone started a chat with
//    me) and `presence:update` (online/offline).

import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api.js';
import { connectSocket } from '../socket.js';

function otherParticipant(conversation, myId) {
  return conversation.participants.find((p) => String(p._id) !== String(myId));
}

// The auth API returns the user with `id` (not `_id`); documents from
// MongoDB use `_id`. Accept either so comparisons never silently fail.
const idOf = (u) => String((u && (u._id || u.id)) || '');

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatScreen({ user, onLogout }) {
  const myId = idOf(user);
  const [users, setUsers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [draft, setDraft] = useState('');
  const [loadError, setLoadError] = useState('');
  const [sending, setSending] = useState(false);

  const socketRef = useRef(null);
  const activeRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Keep the latest open conversation visible inside socket callbacks
  // without forcing the socket to be re-created on every click.
  useEffect(() => {
    activeRef.current = activeConversation;
  }, [activeConversation]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // --- initial REST load -------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [usersData, convData] = await Promise.all([
          api('/users'),
          api('/conversations'),
        ]);
        if (cancelled) return;
        setUsers(usersData.users || []);
        setConversations(convData.conversations || []);
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'Failed to load data');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- socket lifecycle ---------------------------------------------
  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      // ask the server who else is online right now
      socket.emit('presence:list');
    });

    socket.on('presence:list', (userIds) => {
      setOnlineUserIds(new Set(userIds.map(String)));
    });

    socket.on('presence:update', ({ userId, online }) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (online) next.add(String(userId));
        else next.delete(String(userId));
        return next;
      });
    });

    socket.on('message:new', ({ message, conversationId }) => {
      const isActive =
        activeRef.current && String(activeRef.current._id) === String(conversationId);

      if (isActive) {
        setMessages((prev) =>
          prev.some((m) => String(m._id) === String(message._id))
            ? prev // already have it (sender's own echo)
            : [...prev, message]
        );
      }

      // refresh last-message preview + ordering in the sidebar
      setConversations((prev) => {
        const idx = prev.findIndex((c) => String(c._id) === String(conversationId));
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], lastMessage: message, updatedAt: message.createdAt };
        const [moved] = updated.splice(idx, 1);
        return [moved, ...updated];
      });
    });

    socket.on('conversation:new', ({ conversation }) => {
      setConversations((prev) =>
        prev.some((c) => String(c._id) === String(conversation._id))
          ? prev
          : [conversation, ...prev]
      );
      // if the new conversation isn't in our user list yet (edge case), refresh
      setUsers((prev) => {
        const other = otherParticipant(conversation, myId);
        if (!other || prev.some((u) => String(u._id) === String(other._id))) return prev;
        return [...prev, other];
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- open a conversation ------------------------------------------
  async function openConversation(otherUser) {
    setLoadError('');
    try {
      // find-or-create on the backend (idempotent)
      const data = await api('/conversations', {
        method: 'POST',
        body: { receiverId: otherUser._id },
      });
      const conversation = data.conversation;
      setActiveConversation(conversation);
      setDraft('');

      const msgData = await api(`/conversations/${conversation._id}/messages`);
      setMessages(msgData.messages || []);
      scrollToBottom();
    } catch (err) {
      setLoadError(err.message || 'Failed to open conversation');
    }
  }

  // --- send a message (via WebSocket) --------------------------------
  function sendMessage(e) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !activeConversation || sending) return;

    setSending(true);
    socketRef.current.emit(
      'message:send',
      { conversationId: activeConversation._id, content },
      (response) => {
        setSending(false);
        if (!response || !response.success) {
          setLoadError(response?.message || 'Failed to send message');
          return;
        }
        const message = response.message;
        setMessages((prev) =>
          prev.some((m) => String(m._id) === String(message._id)) ? prev : [...prev, message]
        );
        setConversations((prev) => {
          const idx = prev.findIndex((c) => String(c._id) === String(activeConversation._id));
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = { ...updated[idx], lastMessage: message, updatedAt: message.createdAt };
          const [moved] = updated.splice(idx, 1);
          return [moved, ...updated];
        });
        setDraft('');
      }
    );
  }

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  const activeOther = activeConversation
    ? otherParticipant(activeConversation, myId)
    : null;

  return (
    <div className="chat-layout">
      {/* ---------------- sidebar ---------------- */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="me">
            <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
            <div>
              <div className="me-name">{user.name}</div>
              <div className="me-email">{user.email}</div>
            </div>
          </div>
          <button className="btn-ghost" onClick={onLogout}>
            Logout
          </button>
        </div>

        <div className="sidebar-section">
          <h3>People</h3>
          {users.length === 0 && <p className="muted">No other users yet — register a second account in another tab to chat.</p>}
          <ul className="user-list">
            {users.map((u) => (
              <li key={u._id}>
                <button className="user-row" onClick={() => openConversation(u)}>
                  <span className={`avatar small ${onlineUserIds.has(String(u._id)) ? 'online' : ''}`}>
                    {u.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="user-row-text">
                    <span className="user-row-name">{u.name}</span>
                    <span className="user-row-email">{u.email}</span>
                  </span>
                  <span className={`dot ${onlineUserIds.has(String(u._id)) ? 'on' : ''}`} />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="sidebar-section grow">
          <h3>Conversations</h3>
          <ul className="conv-list">
            {conversations.map((c) => {
              const other = otherParticipant(c, myId);
              if (!other) return null;
              const isActive = activeConversation && String(c._id) === String(activeConversation._id);
              return (
                <li key={c._id}>
                  <button
                    className={`conv-row ${isActive ? 'active' : ''}`}
                    onClick={async () => openConversation(other)}
                  >
                    <span className={`avatar small ${onlineUserIds.has(String(other._id)) ? 'online' : ''}`}>
                      {other.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="user-row-text">
                      <span className="user-row-name">{other.name}</span>
                      <span className="conv-preview">
                        {c.lastMessage ? c.lastMessage.content : 'No messages yet'}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* ---------------- main pane ---------------- */}
      <main className="main-pane">
        {!activeConversation && (
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            <h2>Select a person to start chatting</h2>
            <p className="muted">
              Tip: open a second browser tab, log in as someone else, and you can demo
              real-time messaging between two users on this device.
            </p>
          </div>
        )}

        {activeConversation && (
          <>
            <header className="chat-header">
              <span className={`avatar small ${activeOther && onlineUserIds.has(String(activeOther._id)) ? 'online' : ''}`}>
                {activeOther ? activeOther.name.charAt(0).toUpperCase() : '?'}
              </span>
              <div>
                <div className="chat-header-name">{activeOther ? activeOther.name : 'Chat'}</div>
                <div className="chat-header-status">
                  {activeOther && onlineUserIds.has(String(activeOther._id)) ? 'Online' : 'Offline'}
                </div>
              </div>
            </header>

            <div className="messages">
              {messages.length === 0 && (
                <p className="muted center">No messages yet — say hi 👋</p>
              )}
              {messages.map((m) => {
                const mine = idOf(m.sender) === myId;
                return (
                  <div key={m._id} className={`bubble-row ${mine ? 'mine' : ''}`}>
                    <div className="bubble">
                      <div className="bubble-text">{m.content}</div>
                      <div className="bubble-time">{formatTime(m.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {loadError && <div className="chat-error">{loadError}</div>}

            <form className="composer" onSubmit={sendMessage}>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                maxLength={2000}
                autoFocus
              />
              <button type="submit" className="btn-primary" disabled={sending || !draft.trim()}>
                Send
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
