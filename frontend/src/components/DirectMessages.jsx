import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SearchSelect from "./SearchSelect";
import { api, getUser } from "../api";

const ROLE_LABEL = {
  admin: "Администратор",
  manager: "Методист",
  teacher: "Куратор",
  student: "Ученик",
};

export default function DirectMessages() {
  const me = getUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [convos, setConvos] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeUser, setActiveUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  const loadUsers = () => api("/api/messages/users").then(setUsers);
  const loadConvos = () => api("/api/messages/conversations").then(setConvos);

  useEffect(() => {
    loadUsers();
    loadConvos();
  }, []);

  // читаем ?user=ID — переход из уведомления
  useEffect(() => {
    const userId = searchParams.get("user");
    if (userId) {
      setActiveId(+userId);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams.toString()]);

  const loadConversation = async (otherId) => {
    if (!otherId) return;
    const data = await api(`/api/messages/with/${otherId}`);
    setActiveUser(data.other);
    setMessages(data.messages);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    loadConvos();
  };

  useEffect(() => {
    if (activeId) loadConversation(activeId);
  }, [activeId]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !activeId) return;
    setBusy(true);
    try {
      await api(`/api/messages/with/${activeId}`, {
        method: "POST", body: JSON.stringify({ text }),
      });
      setText("");
      await loadConversation(activeId);
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  const startNew = (userId) => {
    if (!userId) return;
    setActiveId(+userId);
  };

  const userOptions = users.map(u => ({
    value: u.id,
    label: `${u.name} — ${ROLE_LABEL[u.role] || u.role}`,
  }));

  return (
    <div className="dm-wrap">
      <aside className="dm-sidebar">
        <div className="dm-new">
          <SearchSelect
            options={userOptions}
            value=""
            onChange={startNew}
            placeholder="Найти человека по ФИО..."
          />
        </div>
        <div className="dm-convos">
          {convos.length === 0 && (
            <div className="dm-empty">Диалогов пока нет</div>
          )}
          {convos.map(c => (
            <div key={c.user_id}
                 className={"dm-convo " + (activeId === c.user_id ? "active" : "")}
                 onClick={() => setActiveId(c.user_id)}>
              <div className="dm-convo-head">
                <b>{c.name}</b>
                {c.unread > 0 && <span className="dm-unread">{c.unread}</span>}
              </div>
              <div className="dm-convo-role">{ROLE_LABEL[c.role] || c.role}</div>
              <div className="dm-convo-last">{c.last_text?.slice(0, 60)}</div>
            </div>
          ))}
        </div>
      </aside>

      <section className="dm-main">
        {!activeId && (
          <div className="dm-placeholder">
            Выберите диалог слева или найдите человека в поиске
          </div>
        )}
        {activeId && (
          <>
            <header className="dm-header">
              <b>{activeUser?.name || "..."}</b>
              <span className="muted small">
                {activeUser && (ROLE_LABEL[activeUser.role] || activeUser.role)}
              </span>
            </header>
            <div className="dm-messages">
              {messages.length === 0 && (
                <div className="muted small" style={{ padding: 16 }}>
                  Сообщений пока нет — начните первым.
                </div>
              )}
              {messages.map(m => (
                <div key={m.id} className={"dm-msg " + (m.is_mine ? "mine" : "")}>
                  <div className="dm-msg-text">{m.text}</div>
                  <div className="dm-msg-time">
                    {new Date(m.created_at).toLocaleString("ru-RU")}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form className="dm-form" onSubmit={send}>
              <input value={text} onChange={e => setText(e.target.value)}
                     placeholder="Написать сообщение..." />
              <button className="btn primary" disabled={busy || !text.trim()}>
                {busy ? "..." : "Отправить"}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
