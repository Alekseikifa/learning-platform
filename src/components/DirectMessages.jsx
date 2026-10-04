import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, getUser } from "../api";
import SearchSelect from "./SearchSelect";

const ROLE_NAMES = {
  admin: "Администратор",
  manager: "Методист",
  teacher: "Куратор",
  student: "Ученик",
};

const STANDARD_EMOJIS = ["👍", "❤️", "🙏", "🔥", "👏", "😂", "🤔", "✅"];

export default function DirectMessages() {
  getUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [activeEmojiPicker, setActiveEmojiPicker] = useState(null);
  const endRef = useRef(null);

  const loadUsers = () => api("/api/messages/users").then(setUsers).catch(() => {});
  const loadConversations = () => api("/api/messages/conversations").then(setConversations).catch(() => {});

  useEffect(() => {
    loadUsers();
    loadConversations();
  }, []);

  useEffect(() => {
    const u = searchParams.get("user");
    if (u) {
      setSelectedUserId(Number(u));
      // убираем только user, чтобы не потерять ?tab= кабинета
      const next = new URLSearchParams(searchParams);
      next.delete("user");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams.toString()]);

  const loadThread = async (uid) => {
    if (!uid) return;
    try {
      const data = await api(`/api/messages/with/${uid}`);
      setOtherUser(data.other);
      setMessages(data.messages);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      loadConversations();
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (selectedUserId) {
      setReplyingTo(null);
      setActiveEmojiPicker(null);
      loadThread(selectedUserId);
      const interval = setInterval(() => loadThread(selectedUserId), 5000);
      return () => clearInterval(interval);
    }
  }, [selectedUserId]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || !selectedUserId) return;
    setIsSending(true);
    try {
      await api(`/api/messages/with/${selectedUserId}`, {
        method: "POST",
        body: JSON.stringify({
          text,
          reply_to_id: replyingTo ? replyingTo.id : null,
        }),
      });
      setText("");
      setReplyingTo(null);
      await loadThread(selectedUserId);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleReact = async (msgId, emoji) => {
    setActiveEmojiPicker(null);
    try {
      await api(`/api/messages/${msgId}/react`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      });
      await loadThread(selectedUserId);
    } catch (err) {
      alert(err.message);
    }
  };

  const scrollToMessage = (id) => {
    const el = document.getElementById(`dm-msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("msg-highlight");
      setTimeout(() => el.classList.remove("msg-highlight"), 1800);
    }
  };

  const handleSelectUser = (uid) => {
    if (uid) setSelectedUserId(Number(uid));
  };

  const userOptions = users.map((u) => ({
    value: u.id,
    label: `${u.name} — ${ROLE_NAMES[u.role] || u.role}`,
  }));

  return (
    <div className={"dm-wrap " + (selectedUserId ? "has-active-chat" : "")}>
      <aside className="dm-sidebar">
        <div className="dm-new">
          <SearchSelect
            options={userOptions}
            value=""
            onChange={handleSelectUser}
            placeholder="Найти человека по ФИО..."
          />
        </div>

        <div className="dm-convos">
          {conversations.length === 0 && <div className="dm-empty">Диалогов пока нет</div>}
          {conversations.map((c) => (
            <div
              key={c.user_id}
              className={"dm-convo " + (selectedUserId === c.user_id ? "active" : "")}
              onClick={() => setSelectedUserId(c.user_id)}
            >
              <div className="dm-convo-head">
                <b>{c.name}</b>
                {c.unread > 0 && <span className="dm-unread">{c.unread}</span>}
              </div>
              <div className="dm-convo-role">{ROLE_NAMES[c.role] || c.role}</div>
              <div className="dm-convo-last">{c.last_text?.slice(0, 60)}</div>
            </div>
          ))}
        </div>
      </aside>

      <section className="dm-main" onClick={() => setActiveEmojiPicker(null)}>
        {!selectedUserId && (
          <div className="dm-placeholder">Выберите диалог слева или найдите человека в поиске</div>
        )}
        {selectedUserId && (
          <>
            <header className="dm-header">
              <button
                type="button"
                className="dm-back-btn"
                onClick={() => setSelectedUserId(null)}
                title="Назад к списку диалогов"
              >
                ← Назад
              </button>
              <div style={{ minWidth: 0, flex: 1 }}>
                <b>{otherUser?.name || "..."}</b>
                <span className="muted small" style={{ marginLeft: 8 }}>
                  {otherUser && (ROLE_NAMES[otherUser.role] || otherUser.role)}
                </span>
              </div>
            </header>

            <div className="dm-messages">
              {messages.length === 0 && (
                <div className="muted small" style={{ padding: 16 }}>
                  Сообщений пока нет — начните первым.
                </div>
              )}
              {messages.map((m) => {
                const reactions = m.reactions || {};
                const hasReactions = Object.keys(reactions).length > 0;

                return (
                  <div
                    key={m.id}
                    id={`dm-msg-${m.id}`}
                    className={"dm-msg " + (m.is_mine ? "mine" : "")}
                  >
                    {/* Цитата / Ответ на сообщение */}
                    {m.reply_to && (
                      <div
                        className="dm-quote-box"
                        onClick={() => scrollToMessage(m.reply_to.id)}
                        title="Нажмите, чтобы перейти к сообщению"
                      >
                        <div className="chat-quote-line" />
                        <div className="dm-quote-content">
                          <b>{m.reply_to.user_name}</b>
                          <span>{m.reply_to.text}</span>
                        </div>
                      </div>
                    )}

                    <div className="dm-msg-text">{m.text}</div>

                    {/* Реакции под сообщением */}
                    {hasReactions && (
                      <div className="dm-reactions-row">
                        {Object.entries(reactions).map(([emoji, r]) => (
                          <button
                            key={emoji}
                            type="button"
                            className={"dm-reaction-chip " + (r.reacted ? "active" : "")}
                            onClick={() => handleReact(m.id, emoji)}
                            title={r.users.map((u) => u.name).join(", ")}
                          >
                            <span>{emoji}</span>
                            <span className="count">{r.count}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="dm-msg-footer">
                      <div className="dm-msg-time">
                        {new Date(m.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </div>

                      {/* Кнопки действий: Ответить и Реакция */}
                      <div className="dm-msg-actions">
                        <button
                          type="button"
                          className="dm-action-btn"
                          onClick={() => setReplyingTo({
                            id: m.id,
                            user_name: m.is_mine ? "Вы" : otherUser?.name || "Собеседник",
                            text: m.text,
                          })}
                          title="Ответить"
                        >
                          ↩
                        </button>
                        <div style={{ position: "relative" }}>
                          <button
                            type="button"
                            className="dm-action-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveEmojiPicker(activeEmojiPicker === m.id ? null : m.id);
                            }}
                            title="Поставить реакцию"
                          >
                            😀+
                          </button>
                          {activeEmojiPicker === m.id && (
                            <div className="dm-emoji-picker" onClick={(e) => e.stopPropagation()}>
                              {STANDARD_EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  className="dm-emoji-btn"
                                  onClick={() => handleReact(m.id, emoji)}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            {/* Плашка ответа перед отправкой */}
            {replyingTo && (
              <div className="dm-reply-bar">
                <span className="dm-reply-icon">↩</span>
                <div className="dm-reply-preview">
                  <b>{replyingTo.user_name}</b>
                  <span>{replyingTo.text.slice(0, 90)}</span>
                </div>
                <button
                  type="button"
                  className="dm-reply-cancel"
                  onClick={() => setReplyingTo(null)}
                  title="Отменить ответ"
                >
                  ✕
                </button>
              </div>
            )}

            <form className="dm-form" onSubmit={handleSend}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={replyingTo ? `Ответ для ${replyingTo.user_name}...` : "Написать сообщение..."}
              />
              <button className="btn primary" disabled={isSending || !text.trim()}>
                {isSending ? "..." : "Отправить"}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
