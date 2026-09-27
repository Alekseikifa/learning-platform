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
      loadThread(selectedUserId);
    }
  }, [selectedUserId]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || !selectedUserId) return;
    setIsSending(true);
    try {
      await api(`/api/messages/with/${selectedUserId}`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setText("");
      await loadThread(selectedUserId);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSending(false);
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
    <div className="dm-wrap">
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

      <section className="dm-main">
        {!selectedUserId && (
          <div className="dm-placeholder">Выберите диалог слева или найдите человека в поиске</div>
        )}
        {selectedUserId && (
          <>
            <header className="dm-header">
              <b>{otherUser?.name || "..."}</b>
              <span className="muted small">{otherUser && (ROLE_NAMES[otherUser.role] || otherUser.role)}</span>
            </header>

            <div className="dm-messages">
              {messages.length === 0 && (
                <div className="muted small" style={{ padding: 16 }}>
                  Сообщений пока нет — начните первым.
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={"dm-msg " + (m.is_mine ? "mine" : "")}>
                  <div className="dm-msg-text">{m.text}</div>
                  <div className="dm-msg-time">{new Date(m.created_at).toLocaleString("ru-RU")}</div>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            <form className="dm-form" onSubmit={handleSend}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Написать сообщение..."
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
