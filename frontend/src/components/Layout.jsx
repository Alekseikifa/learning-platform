import { logout, getUser } from "../api";

export default function Layout({ title, tabs, active, onChange, children }) {
  const user = getUser();
  return (
    <div className="app">
      <header className="topbar">
        <div><b>{title}</b> <span className="muted">— {user?.name}</span></div>
        <button className="btn ghost" onClick={logout}>Выйти</button>
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