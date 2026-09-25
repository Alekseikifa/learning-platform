import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getUser, logout, setToken, setUser } from "../api";
import HeaderBanner from "./HeaderBanner";
import WelcomeModal from "./WelcomeModal";

const APP_NAME = "МКУ — Международные Курсы Ученичества";

const ROLE_NAMES = {
  admin: "Администратор",
  manager: "Методист",
  teacher: "Куратор",
  student: "Ученик",
};

function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState([]);
  const bellRef = useRef(null);
  const navigate = useNavigate();

  const fetchCount = async () => {
    try {
      const [n, m] = await Promise.all([
        api("/api/notifications/unread-count").catch(() => ({ count: 0 })),
        api("/api/messages/unread-count").catch(() => ({ count: 0 })),
      ]);
      setUnreadCount((n.count || 0) + (m.count || 0));
    } catch {}
  };

  const fetchList = async () => {
    try {
      const data = await api("/api/notifications");
      setItems(data);
    } catch {}
  };

  useEffect(() => {
    fetchCount();
    const timer = setInterval(fetchCount, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isOpen) fetchList();
  }, [isOpen]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const handleClickItem = async (item) => {
    try {
      await api(`/api/notifications/${item.id}/read`, { method: "POST" });
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, read: true } : x)));
      fetchCount();
    } catch {}
    setIsOpen(false);
    if (item.link && item.link.startsWith("/")) {
      navigate(item.link);
    }
  };

  const handleReadAll = async () => {
    try {
      await api("/api/notifications/read-all", { method: "POST" });
      setItems((prev) => prev.map((x) => ({ ...x, read: true })));
      setUnreadCount(0);
    } catch {}
  };

  return (
    <div style={{ position: "relative" }} ref={bellRef}>
      <button className="notif-bell" onClick={() => setIsOpen((v) => !v)} title="Уведомления">
        🔔{unreadCount > 0 && <span className="badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notif-panel">
          <div className="notif-panel-head">
            <b>Уведомления</b>
            {unreadCount > 0 && (
              <button className="btn small ghost" onClick={handleReadAll}>
                Прочитать все
              </button>
            )}
          </div>
          {items.length === 0 && <div className="notif-empty">Пока уведомлений нет</div>}
          {items.map((item) => (
            <div
              key={item.id}
              className={"notif-item " + (item.read ? "" : "unread")}
              onClick={() => handleClickItem(item)}
              style={{ cursor: item.link ? "pointer" : "default" }}
            >
              <div className="notif-title">{item.title}</div>
              {item.body && <div className="notif-body">{item.body}</div>}
              <div className="notif-time">{new Date(item.created_at).toLocaleString("ru-RU")}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RoleSwitcher() {
  const user = getUser();
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const navigate = useNavigate();

  if (!user || !user.roles || user.roles.length < 2) return null;

  const handleSwitch = async (targetRole) => {
    if (targetRole === user.role) {
      setIsOpen(false);
      return;
    }
    setIsSwitching(true);
    try {
      const res = await api("/api/auth/switch-role", {
        method: "POST",
        body: JSON.stringify({ role: targetRole }),
      });
      setToken(res.access_token);
      setUser({ role: res.role, roles: res.roles, name: res.name });
      setIsOpen(false);
      navigate(`/${res.role}`, { replace: true });
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button className="btn ghost" onClick={() => setIsOpen((v) => !v)} title="Сменить роль">
        🎭 {ROLE_NAMES[user.role] || user.role}
      </button>
      {isOpen && (
        <div className="notif-panel" style={{ width: 280 }}>
          <div className="notif-panel-head">
            <b>Сменить роль</b>
          </div>
          {user.roles.map((r) => (
            <div
              key={r}
              className={"notif-item " + (r === user.role ? "unread" : "")}
              onClick={() => !isSwitching && handleSwitch(r)}
            >
              <div className="notif-title">
                {ROLE_NAMES[r] || r}
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

export default function Layout({ title, tabs, active, onChange, children, dropdown }) {
  const [publicSettings, setPublicSettings] = useState({});
  const [dropdownOpen, setDropdownOpen] = useState(false);
  useEffect(() => {
    api("/api/settings/public").then(setPublicSettings).catch(() => {});
  }, []);
  const user = getUser();
  const isStudent = user?.role === "student";
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    // Show welcome modal ONLY for students if not dismissed yet
    if (isStudent && user) {
      const userId = user.id || user.email || user.name || "guest";
      const never = localStorage.getItem("mku_welcome_never_" + userId);
      const sessionClosed = sessionStorage.getItem("mku_welcome_session_closed_" + userId);
      if (!never && !sessionClosed) {
        setShowWelcome(true);
      }
    } else {
      setShowWelcome(false);
    }
  }, [isStudent, user]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-controls">
          <div className="topbar-left">
            <span className="topbar-badge">{title}</span>
          </div>
          <div className="topbar-actions">
            {isStudent && (
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setShowWelcome(true)}
                title="О курсах МКУ и правила"
                style={{ fontSize: 13 }}
              >
                ℹ️ О МКУ
              </button>
            )}
            <NotificationBell />
            <RoleSwitcher />
            <span className="user">
              <b>{user?.name}</b>
            </span>
            <button className="btn ghost small" onClick={logout}>
              Выйти
            </button>
          </div>
        </div>

        {/* Frame_28_1 Banner in the topbar across all profiles */}
        {publicSettings.show_header_banner !== "false" && (
        <div className="topbar-banner-wrap">
          <HeaderBanner
            onOpenWelcome={isStudent ? () => setShowWelcome(true) : undefined}
            isEmbedded={true}
          />
        </div>
        )}
      </header>

      {/* Welcome and Warning Modal (Frame_34_1) - ONLY for students */}
      {isStudent && (
        <WelcomeModal
          user={user}
          userId={user?.id || user?.email || user?.name || "guest"}
          isOpen={showWelcome}
          settings={publicSettings}
          onClose={() => {
            setShowWelcome(false);
            const userId = user?.id || user?.email || user?.name || "guest";
            sessionStorage.setItem("mku_welcome_session_closed_" + userId, "true");
          }}
        />
      )}

      {tabs && (
        <nav className="tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={"tab " + (active === tab.id ? "active" : "")}
              onClick={() => onChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          {dropdown && (
            <div style={{ position: "relative" }}>
              <button
                className={"tab " + (dropdown.items.some((i) => i.id === active) ? "active" : "")}
                onClick={() => setDropdownOpen((o) => !o)}
              >
                {dropdown.label} ▾
              </button>
              {dropdownOpen && (
                <>
                  <div
                    style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 40 }}
                    onClick={() => setDropdownOpen(false)}
                  />
                  <div
                    style={{
                      position: "absolute", top: "100%", left: 0, zIndex: 50,
                      background: "#fff", border: "1px solid var(--border)", borderRadius: 8,
                      minWidth: 210, padding: 4, boxShadow: "0 8px 24px rgba(15,23,42,.12)",
                    }}
                  >
                    {dropdown.items.map((item) => (
                      <button
                        key={item.id}
                        className={"tab " + (active === item.id ? "active" : "")}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          borderBottom: "none", borderRadius: 6,
                        }}
                        onClick={() => {
                          setDropdownOpen(false);
                          dropdown.onChange(item.id);
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </nav>
      )}

      <main className="content">{children}</main>
    </div>
  );
}
