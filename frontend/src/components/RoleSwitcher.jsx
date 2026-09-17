import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getUser, setToken, setUser, logout } from "../api";

const ROLE_LABELS = {
  admin: "Администратор",
  manager: "Методист",
  teacher: "Куратор",
  student: "Ученик",
};

export default function RoleSwitcher() {
  const user = getUser();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  if (!user || !user.roles || user.roles.length < 2) return null;

  const switchTo = async (role) => {
    if (role === user.role) { setOpen(false); return; }
    setBusy(true);
    try {
      const r = await api("/api/auth/switch-role", {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      setToken(r.access_token);
      setUser({ role: r.role, roles: r.roles, name: r.name });
      setOpen(false);
      // SPA-навигация без перезагрузки страницы
      nav(`/${r.role}`, { replace: true });
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: "relative" }}>
      <button className="btn ghost" onClick={() => setOpen(o => !o)} title="Сменить роль">
        🎭 {ROLE_LABELS[user.role] || user.role}
      </button>
      {open && (
        <div className="notif-panel" style={{ width: 280 }}>
          <div className="notif-panel-head">
            <b>Сменить роль</b>
          </div>
          {user.roles.map(r => (
            <div key={r}
                 className={"notif-item " + (r === user.role ? "unread" : "")}
                 onClick={() => !busy && switchTo(r)}>
              <div className="notif-title">
                {ROLE_LABELS[r] || r}
                {r === user.role && <span className="muted small"> · текущая</span>}
              </div>
            </div>
          ))}
          <div style={{ padding: 8, borderTop: "1px solid var(--border)" }}>
            <button className="btn ghost small" onClick={logout} style={{ width: "100%" }}>
              Выйти из аккаунта
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
