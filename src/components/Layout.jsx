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

const TAB_ICONS = {
  // Общие
  messages: "💬",
  announcements: "📢",
  chats: "💭",
  schedule: "📅",
  materials: "📎",
  uploads: "📁",
  // Администратор и методист
  invites: "🎟️",
  users: "👥",
  courses: "📚",
  groups: "👥",
  tests: "📝",
  settings: "⚙️",
  // Куратор и мониторинг
  students: "🎓",
  progress: "📊",
  attempts: "⏱️",
  analytics: "📈",
  // Ученик
  themes: "📖",
  extra_materials: "📎",
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
        <>
          <div className="notif-backdrop-mobile" onClick={() => setIsOpen(false)} />
          <div className="notif-panel">
            <div className="notif-panel-head">
              <b>Уведомления</b>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {unreadCount > 0 && (
                  <button className="btn small ghost" onClick={handleReadAll}>
                    Прочитать все
                  </button>
                )}
                <button
                  type="button"
                  className="notif-close-mobile"
                  onClick={() => setIsOpen(false)}
                  title="Закрыть"
                  aria-label="Закрыть"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="notif-panel-body">
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
          </div>
        </>
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
      setUser({ role: res.role, roles: res.roles, name: res.name, is_root_admin: res.is_root_admin });
      setIsOpen(false);
      navigate(`/${res.role}`, { replace: true });
    } catch (err) {
      if (typeof window !== "undefined" && window.appToast) {
        window.appToast.error(err.message);
      }
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button className="btn ghost small" onClick={() => setIsOpen((v) => !v)} title="Сменить роль">
        🎭 {ROLE_NAMES[user.role] || user.role}
      </button>
      {isOpen && (
        <>
          <div className="notif-backdrop-mobile" onClick={() => setIsOpen(false)} />
          <div className="notif-panel role-switcher-panel">
            <div className="notif-panel-head">
              <b>Сменить роль</b>
              <button
                type="button"
                className="notif-close-mobile"
                onClick={() => setIsOpen(false)}
                title="Закрыть"
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>
            <div className="notif-panel-body">
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
            </div>
            <div style={{ padding: 8, borderTop: "1px solid var(--border)" }}>
              <button className="btn ghost small" onClick={logout} style={{ width: "100%" }}>
                Выйти из аккаунта
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Layout({ title, tabs, active, onChange, children, dropdown }) {
  const [publicSettings, setPublicSettings] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("mku_sidebar_collapsed") === "true";
    }
    return false;
  });

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("mku_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  const user = getUser();
  const isStudent = user?.role === "student";
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    api("/api/settings/public").then(setPublicSettings).catch(() => {});
  }, []);

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

  // Current active label for staff header
  const currentTab = tabs?.find((t) => t.id === active) || dropdown?.items?.find((i) => i.id === active);
  const currentTitle = currentTab ? currentTab.label : title;
  const currentIcon = currentTab ? TAB_ICONS[currentTab.id] || "📌" : "📌";

  // ==========================================
  // ЕДИНЫЙ МАКЕТ С MINI-SIDEBAR ДЛЯ ВСЕХ РОЛЕЙ (Ученик, Куратор, Администратор, Методист)
  // ==========================================
  return (
    <div className={"app app-staff-layout " + (sidebarCollapsed ? "sidebar-is-collapsed" : "")}>
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={"app-sidebar " + (sidebarOpen ? "open " : "") + (sidebarCollapsed ? "collapsed" : "")}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <span className="sidebar-brand-icon" style={{ fontSize: 24 }}>🏛️</span>
            {!sidebarCollapsed && (
              <div className="sidebar-brand-text">
                <div className="sidebar-title">МКУ</div>
                <div className="sidebar-badge">{ROLE_NAMES[user?.role] || title}</div>
              </div>
            )}
          </div>
          <div className="sidebar-header-actions">
            {/* Desktop collapse toggle */}
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={toggleSidebarCollapsed}
              title={sidebarCollapsed ? "Развернуть меню" : "Свернуть меню"}
              aria-label={sidebarCollapsed ? "Развернуть меню" : "Свернуть меню"}
            >
              {sidebarCollapsed ? "»" : "«"}
            </button>
            {/* Mobile close button */}
            <button
              type="button"
              className="sidebar-close-btn"
              onClick={() => setSidebarOpen(false)}
              aria-label="Закрыть меню"
            >
              ×
            </button>
          </div>
        </div>

        <nav className="sidebar-nav" role="navigation" aria-label="Панель навигации">
          {!sidebarCollapsed && (
            <div className="sidebar-section-title">
              {isStudent ? "Навигация по курсу" : "Разделы управления"}
            </div>
          )}
          {sidebarCollapsed && <div className="sidebar-collapsed-divider" />}
          {tabs &&
            tabs.map((tab) => {
              const isActive = active === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={"sidebar-nav-item " + (isActive ? "active" : "")}
                  onClick={() => {
                    onChange(tab.id);
                    setSidebarOpen(false);
                  }}
                  title={tab.label}
                >
                  <span className="sidebar-nav-icon">{TAB_ICONS[tab.id] || "📌"}</span>
                  {!sidebarCollapsed && <span className="sidebar-nav-label">{tab.label}</span>}
                </button>
              );
            })}

          {isStudent && (
            <button
              type="button"
              className="sidebar-nav-item sidebar-info-item"
              onClick={() => {
                setShowWelcome(true);
                setSidebarOpen(false);
              }}
              title="О курсах МКУ и правила"
              style={{ marginTop: 8 }}
            >
              <span className="sidebar-nav-icon">ℹ️</span>
              {!sidebarCollapsed && <span className="sidebar-nav-label">О МКУ и правила</span>}
            </button>
          )}

          {dropdown && (
            <div className="sidebar-subgroup">
              {!sidebarCollapsed ? (
                <div className="sidebar-section-title" style={{ marginTop: 14 }}>
                  {dropdown.label}
                </div>
              ) : (
                <div className="sidebar-collapsed-divider" />
              )}
              {dropdown.items.map((item) => {
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={"sidebar-nav-item " + (isActive ? "active" : "")}
                    onClick={() => {
                      dropdown.onChange(item.id);
                      setSidebarOpen(false);
                    }}
                    title={item.label}
                  >
                    <span className="sidebar-nav-icon">{TAB_ICONS[item.id] || "📊"}</span>
                    {!sidebarCollapsed && <span className="sidebar-nav-label">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-info">
            <div className="sidebar-avatar" title={user?.name}>
              {(user?.name || "П")[0].toUpperCase()}
            </div>
            {!sidebarCollapsed && (
              <div className="sidebar-user-details">
                <b title={user?.name}>{user?.name}</b>
                <span className="sidebar-role-label">{ROLE_NAMES[user?.role] || user?.role}</span>
              </div>
            )}
          </div>
          {!sidebarCollapsed ? (
            <div className="sidebar-actions-row">
              <RoleSwitcher />
              <button className="btn ghost small" onClick={logout} title="Выйти из системы">
                Выйти
              </button>
            </div>
          ) : (
            <div className="sidebar-collapsed-actions">
              <button
                type="button"
                className="sidebar-collapsed-btn"
                onClick={logout}
                title="Выйти из системы"
              >
                🚪
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="staff-main-area">
        <header className="staff-topbar">
          <div className="staff-topbar-left">
            <button
              type="button"
              className="sidebar-toggle-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Открыть меню"
            >
              ☰
            </button>
            <button
              type="button"
              className="staff-sidebar-toggle-desktop"
              onClick={toggleSidebarCollapsed}
              title={sidebarCollapsed ? "Развернуть боковое меню" : "Свернуть боковое меню"}
            >
              {sidebarCollapsed ? "⮞ Меню" : "⮜ Свернуть"}
            </button>
            <div className="staff-current-section">
              <span className="staff-section-icon">{currentIcon}</span>
              <span className="staff-section-title">{currentTitle}</span>
            </div>
          </div>

          <div className="staff-topbar-right">
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
            <span className="staff-user-name">
              <b>{user?.name}</b>
            </span>
            <button className="btn ghost small" onClick={logout}>
              Выйти
            </button>
          </div>
        </header>

        {/* Optional Header Banner */}
        {publicSettings.show_header_banner !== "false" && (
          <div className="staff-banner-wrap">
            <HeaderBanner
              onOpenWelcome={isStudent ? () => setShowWelcome(true) : undefined}
              isEmbedded={true}
            />
          </div>
        )}

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

        <main className="content staff-content">{children}</main>
      </div>
    </div>
  );
}
