import { useEffect, useRef, useState } from "react";
import { api, getUser } from "../api";

export default function ChatPanel({ themeId, apiBase }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const bottomRef = useRef(null);
  const me = getUser();

  const load = async () => {
    try {
      const list = await api(`${apiBase}/themes/${themeId}/chat`);
      setMessages(list);
      setErr("");
    } catch (e) {
      console.error("ChatPanel error:", e);
      setErr(e.message || "Не удалось загрузить сообщения");
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [themeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await api(`${apiBase}/themes/${themeId}/chat`, {
        method: "POST", body: JSON.stringify({ text }),
      });
      setText("");
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="chat">
      <div className="chat-list">
        {messages.length === 0 && <div className="muted small">Пока нет сообщений</div>}
        {messages.map(m => (
          <div key={m.id} className={"chat-msg " + (m.is_mine ? "mine" : "")}>
            <div className="chat-meta">
              <b>{m.user_name}</b>
              <span className="muted small">
                {m.user_role === "teacher" ? " (преподаватель)" : ""}{" "}
                · {new Date(m.created_at).toLocaleString()}
              </span>
            </div>
            <div className="chat-text">{m.text}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="chat-form" onSubmit={send}>
        <input value={text} onChange={e => setText(e.target.value)}
               placeholder="Написать сообщение..." />
        <button className="btn primary" disabled={!text.trim()}>Отправить</button>
      </form>
      {err && <div className="error small">{err}</div>}
    </div>
  );
}
