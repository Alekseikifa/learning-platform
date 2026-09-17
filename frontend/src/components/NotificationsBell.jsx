import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export default function NotificationsBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const ref = useRef(null);
  const nav = useNavigate();

  const loadCount = async () => {
    try {
      const { count } = await api("/api/notifications/unread-count");
      setCount(count);
    } catch {}
  };
  const loadList = async () => {
    try {
      setItems(await api("/api/notifications"));
    } catch {}
  };

  useEffect(() => {
    loadCount();
    const t = setInterval(loadCount, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (open) loadList();
  }, [open]);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const openNotification = async (n) => {
    try {
      await api(`/api/notifications/${n.id}/read`, { method: "POST" });
      setItems(items => items.map(x => x.id === n.id ? { ...x, read: true } : x));
      loadCount();
    } catch {}
    setOpen(false);
    if (n.link) {
      nav(n.link);
    }
  };

  const markAll = async () => {
    try {
      await api("/api/notifications/read-all", { method: "POST" });
      setItems(items => items.map(n => ({ ...n, read: true })));
      setCount(0);
    } catch {}
  };

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button className="notif-bell" onClick={() => setOpen(o => !o)} title="Уведомления">
        🔔
        {count > 0 && <span className="badge">{count > 99 ? "99+" : count}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-panel-head">
            <b>Уведомления</b>
            {count > 0 && (
              <button className="btn small ghost" onClick={markAll}>Прочитать все</button>
            )}
          </div>
          {items.length === 0 && <div className="notif-empty">Пока уведомлений нет</div>}
          {items.map(n => (
            <div key={n.id}
                 className={"notif-item " + (n.read ? "" : "unread")}
                 onClick={() => openNotification(n)}
                 style={{ cursor: n.link ? "pointer" : "default" }}>
              <div className="notif-title">{n.title}</div>
              {n.body && <div className="notif-body">{n.body}</div>}
              <div className="notif-time">
                {new Date(n.created_at).toLocaleString("ru-RU")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const SCHOOL_NAME = "МКУ — Международные Курсы Ученичества";
