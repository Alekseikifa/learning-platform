import { logout, getUser } from "../api";
import NotificationsBell from "./NotificationsBell";

export const SCHOOL_NAME = "МКУ — Международные Курсы Ученичества";

export default function Layout({ title, tabs, active, onChange, children }) {
  const user = getUser();
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div>
            <div className="brand-name">{SCHOOL_NAME}</div>
            <div className="brand-sub">{title}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <NotificationsBell />
          <span className="user">
            <b>{user?.name}</b>
          </span>
          <button className="btn ghost" onClick={logout}>Выйти</button>
        </div>
      </header>
      {tabs && (
        <nav className="tabs">
          {tabs.map(t => (
            <button key={t.id}
                    className={"tab " + (active === t.id ? "active" : "")}
                    onClick={() => onChange(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      )}
      <main className="content">{children}</main>
    </div>
  );
}
