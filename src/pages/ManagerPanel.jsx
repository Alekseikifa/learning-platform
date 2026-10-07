import InvitesTab from "../components/InvitesTab";
import DirectMessages from "../components/DirectMessages";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../api";
import AnnouncementsPanel from "../components/AnnouncementsPanel";
import StaffChatsPanel from "../components/StaffChatsPanel";
import ChatPanel from "../components/ChatPanel";
import ExtraMaterialsTabContent from "../components/ExtraMaterialsTabContent";
import UnifiedMaterialsRepository from "../components/UnifiedMaterialsRepository";
import CoursesTab from "../components/CoursesTab";
import TestsTab from "../components/TestsTab";
import UserEditModal from "../components/UserEditModal";
import GroupsTab from "../components/GroupsTab";
import UploadsTab from "../components/UploadsTab";
import ScheduleCalendar from "../components/ScheduleCalendar";
import MonitoringView from "../components/MonitoringView";
import { MONITORING_TABS, normalizeMonitoringTab, setMonitoringParams, useThemeGroupReady } from "../lib/monitoringTabs";

const ROLE_LABELS = {
  admin: "Администратор",
  manager: "Методист",
  teacher: "Декан",
  curator: "Куратор",
  student: "Ученик",
};
const roleLabel = (r) => ROLE_LABELS[String(r || "").trim()] || r;

const TABS = [
  { id: "invites",       label: "Приглашения" },
  { id: "users",         label: "Пользователи" },
  { id: "courses",       label: "Курсы и темы" },
  { id: "groups",        label: "Группы" },
  { id: "schedule",      label: "Учебный график" },
  { id: "tests",         label: "Тесты" },
  { id: "materials",     label: "Материалы" },
  { id: "messages",      label: "Сообщения" },
  { id: "announcements", label: "Объявления" },
  { id: "chats",         label: "Чаты" },
  { id: "uploads",       label: "Файлы" },
];

const MONITORING_ITEMS = MONITORING_TABS;

// при смене вкладки убираем параметры, относящиеся только к соседним вкладкам
const dropMonitoringParams = (next, tabId) => {
  if (tabId !== "review") {
    next.delete("student");
    next.delete("theme");
  }
  if (tabId !== "progress") {
    next.delete("view");
    next.delete("scope");
  }
  return next;
};

// старые ссылки ?tab=mon_students / ?tab=reports переписываем на новые id
const resolveTab = (t) => {
  if (!t) return null;
  const n = normalizeMonitoringTab(t);
  if (TABS.some(x => x.id === n) || MONITORING_ITEMS.some(x => x.id === n)) return n;
  return null;
};

export default function ManagerPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTabState] = useState(() => resolveTab(searchParams.get("tab")) || "invites");
  const [courses, setCourses] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState("");
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [dataErr, setDataErr] = useState(null);
  const [key, setKey] = useState(0);
  const reload = () => setKey(k => k + 1);

  const isMonitoring = MONITORING_ITEMS.some((m) => m.id === tab);

  // переключение таба пишем в URL — F5 и «назад» сохраняют место
  const changeTab = (id) => {
    setTabState(id);
    const next = dropMonitoringParams(new URLSearchParams(searchParams), id);
    next.set("tab", id);
    setSearchParams(next);
  };

  // переход из «Прогресса» в «Проверку» к конкретному отчёту
  const openReview = ({ studentId, themeId }) => {
    setTabState("review");
    const next = dropMonitoringParams(new URLSearchParams(searchParams), "review");
    next.set("tab", "review");
    next.set("student", String(studentId));
    next.set("theme", String(themeId));
    setSearchParams(next);
  };

  const openChatWithStudent = (studentId) => {
    setTabState("messages");
    setSearchParams({ tab: "messages", user: String(studentId) });
  };

  // реакция на внешнее изменение URL (клик по уведомлению, назад/вперёд)
  useEffect(() => {
    const raw = searchParams.get("tab");
    const t = resolveTab(raw);
    if (t) {
      setTabState(t);
      if (raw !== t) {
        const next = new URLSearchParams(searchParams);
        next.set("tab", t);
        setSearchParams(next, { replace: true });
      }
    }
  }, [searchParams.toString()]);

  useEffect(() => {
    setDataErr(null);
    setUsersLoading(true);
    api("/api/manager/courses").then(setCourses).catch((e) => setDataErr(`курсы: ${e.message}`));
    api("/api/manager/groups").then(setGroups).catch((e) => setDataErr(`группы: ${e.message}`));
    api("/api/manager/users")
      .then(setUsers)
      .catch((e) => setDataErr(`пользователи: ${e.message}`))
      .finally(() => setUsersLoading(false));
  }, [key]);

  // deep-link ?theme= — до готовности группы вкладку не монтируем (иначе фильтр сгорает)
  const themeGroupReady = useThemeGroupReady(searchParams, tab, groups, setGroupId);

  useEffect(() => {
    if (!groupId && groups[0]) setGroupId(groups[0].id);
  }, [groups, groupId]);

  return (
    <Layout
      title="Панель методиста"
      tabs={TABS}
      active={tab}
      onChange={changeTab}
      dropdown={{ label: "Мониторинг", items: MONITORING_ITEMS, onChange: changeTab }}
    >
      {dataErr && (
        <div className="card" style={{ color: "#dc2626" }}>
          Не удалось загрузить данные панели ({dataErr}) — попробуйте обновить страницу
        </div>
      )}

      {isMonitoring && (
        <div className="card row" style={{ alignItems: "center", gap: 10 }}>
          <label><b>Группа:</b></label>
          <select value={groupId} onChange={e => setGroupId(e.target.value)} style={{ minWidth: 200 }}>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.course_title || "Курс"} — {g.name}</option>
            ))}
          </select>
        </div>
      )}
      {isMonitoring && !groups.length && (
        <div className="card muted">Группы не найдены</div>
      )}
      {isMonitoring && groupId && themeGroupReady && (
        <MonitoringView
          tab={tab}
          groupId={groupId}
          searchParams={searchParams}
          setSearchParams={setSearchParams}
          onOpenReview={openReview}
          onDirectMessage={openChatWithStudent}
        />
      )}

      {tab === "users"          && <UsersTab groups={groups} users={users} usersLoading={usersLoading} reload={reload} />}
      {tab === "invites"        && <InvitesTab allowManagerRole={false} />}
      {tab === "courses"        && <CoursesTab courses={courses} groups={groups} reload={reload} apiPrefix="/api/manager" />}
      {tab === "groups"         && <GroupsTab courses={courses} users={users} reload={reload} apiPrefix="/api/manager" />}
      {tab === "schedule"       && <ScheduleCalendar courses={courses} readOnly={false} />}
      {tab === "tests"          && <TestsTab courses={courses} apiPrefix="/api/manager" />}
      {tab === "materials"      && <MaterialsTab courses={courses} groups={groups} />}
      {tab === "messages"       && <DirectMessages />}
      {tab === "announcements"  && <AnnouncementsPanel initialGroups={groups} />}
      {tab === "chats"          && <StaffChatsPanel />}
      {tab === "uploads"        && <UploadsTab apiPrefix="/api/manager" />}
    </Layout>
  );
}

function UsersTab({ groups, users, usersLoading, reload }) {
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "student", group_ids: [], is_active: true });
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (form.role === "student" && !form.group_ids.length) return alert("Выберите хотя бы одну группу");
    try {
      await api("/api/manager/users", { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", username: "", password: "", role: "student", group_ids: [], is_active: true });
      reload();
    } catch (e) { alert(e.message); }
  };

  const toggleGroup = (id) => {
    setForm(f => ({
      ...f,
      group_ids: f.group_ids.includes(id)
        ? f.group_ids.filter(x => x !== id)
        : [...f.group_ids, id],
    }));
  };

  const addToGroup = async (userId, groupId) => {
    if (!groupId) return;
    try {
      await api(`/api/manager/students/${userId}/groups/${groupId}`, { method: "POST" });
      reload();
    } catch (e) { alert(e.message); }
  };
  const removeFromGroup = async (userId, groupId) => {
    try {
      await api(`/api/manager/students/${userId}/groups/${groupId}`, { method: "DELETE" });
      reload();
    } catch (e) { alert(e.message); }
  };

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? users.filter(u =>
        `${u.name} ${u.username} ${u.email || ""} ${u.phone || ""} ${roleLabel(u.role)} ${u.extra_roles || ""} ${(u.extra_roles || "").split(",").map(roleLabel).join(" ")} ${(u.groups || []).map(g => `${g.course} ${g.name}`).join(" ")}`
          .toLowerCase().includes(needle))
    : users;

  return (
    <div>
      <form className="card row" onSubmit={submit} style={{ flexWrap: "wrap", rowGap: 8 }}>
        <input placeholder="ФИО" value={form.name}
               onChange={e => setForm({ ...form, name: e.target.value })} required />
        <input placeholder="Логин" value={form.username}
               onChange={e => setForm({ ...form, username: e.target.value })} required />
        <input type="password" placeholder="Пароль" value={form.password}
               onChange={e => setForm({ ...form, password: e.target.value })} required />
        <select value={form.role}
                 onChange={e => setForm({ ...form, role: e.target.value, group_ids: [] })}>
          <option value="student">Ученик</option>
          <option value="curator">Куратор</option>
          <option value="teacher">Декан</option>
        </select>
        <label className="chip" style={{ cursor: "pointer" }} title="Разрешить пользоваться курсами">
          <input type="checkbox" checked={form.is_active}
                 onChange={e => setForm({ ...form, is_active: e.target.checked })} />
          ✅ Активен
        </label>
        <button className="btn primary">Добавить</button>
        {form.role === "student" && (
          <div style={{ flexBasis: "100%" }}>
            <div className="section-title">Группы</div>
            <div className="chips">
              {groups.map(g => (
                <label key={g.id} className="chip" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={form.group_ids.includes(g.id)}
                         onChange={() => toggleGroup(g.id)} />
                  {g.course_title} · {g.name}
                  {g.curators.length > 0 && (
                    <span className="muted small">
                      {" "}({g.curators.map(c => c.name).join(", ")})
                    </span>
                  )}
                </label>
              ))}
              {!groups.length && <span className="muted small">Групп пока нет</span>}
            </div>
          </div>
        )}
      </form>

      <div className="card row" style={{ alignItems: "center", gap: 8 }}>
        <label>Поиск:</label>
        <input placeholder="ФИО, логин, email, телефон, роль или группа…" value={q}
               onChange={e => setQ(e.target.value)} style={{ flex: 1 }} />
        <span className="muted small">{filtered.length} / {users.length}</span>
      </div>

      <div className="table-wrap"><table className="table">
        <thead>
          <tr>
            <th>ID</th><th>ФИО</th><th>Логин / Контакты</th><th>Роль</th><th>Курсы</th><th>Группы</th><th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(u => (
            <tr key={u.id}>
              <td>{u.id}</td>
              <td>
                <div style={{ fontWeight: 600 }}>{u.name}</div>
                {u.phone && <div className="muted small">{u.phone}</div>}
              </td>
              <td>
                <div>{u.username}</div>
                {u.email && u.email.toLowerCase() !== u.username.toLowerCase() && (
                  <div className="muted small" style={{ color: "#2563eb" }}>{u.email}</div>
                )}
              </td>
              <td>
                {roleLabel(u.role)}
                {u.extra_roles && (
                  <span className="muted small"> + {u.extra_roles.split(",").map(roleLabel).join(", ")}</span>
                )}
              </td>
              <td>
                {u.is_active !== false ? (
                  <span className="tag ok" title="Доступ к курсам включён">✓ есть</span>
                ) : (
                  <span className="tag no" title="Доступ к курсам выключен">✖ нет</span>
                )}
              </td>
              <td>
                {u.groups ? (
                  <>
                    <div className="chips" style={{ margin: 0 }}>
                      {u.groups.map(g => (
                        <span key={g.id} className="chip">
                          {g.course} · {g.name}
                          <button onClick={() => removeFromGroup(u.id, g.id)} aria-label="Убрать из группы">✕</button>
                        </span>
                      ))}
                      {!u.groups.length && <span className="muted small">—</span>}
                    </div>
                    <div className="row" style={{ marginTop: 6 }}>
                      <select defaultValue=""
                              onChange={e => { addToGroup(u.id, e.target.value); e.target.value = ""; }}>
                        <option value="">+ в группу…</option>
                        {groups.map(g => (
                          <option key={g.id} value={g.id}>
                            {g.course_title} · {g.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <span className="muted small">—</span>
                )}
              </td>
              <td>
                {u.role === "manager" ? (
                  <span className="muted small" title="Методиста может изменять только администратор">—</span>
                ) : (
                  <button className="btn small" onClick={() => setEditing(u)}>Изм.</button>
                )}
              </td>
            </tr>
          ))}
          {!filtered.length && (
            <tr>
              <td colSpan={7} className="muted">
                {usersLoading
                  ? "Загрузка пользователей…"
                  : needle
                    ? "Никого не найдено по запросу «" + q + "»"
                    : "Пользователей пока нет"}
              </td>
            </tr>
          )}
        </tbody>
      </table></div>

      {editing && (
        <UserEditModal user={editing} variant="manager" onClose={() => setEditing(null)}
                       onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function MaterialsTab({ courses, groups = [] }) {
  const [mode, setMode] = useState("repository"); // "repository" | "extra"

  return (
    <div>
      <div className="card row" style={{ alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <b className="small">Раздел материалов:</b>
        <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            className={"btn " + (mode === "repository" ? "primary" : "ghost")}
            onClick={() => setMode("repository")}
            style={{ fontWeight: mode === "repository" ? 600 : 400 }}
          >
            📁 Накопитель материалов и плейлистов (Видео, Конспекты, Документы, Аудио, Рисунки)
          </button>
          <button
            type="button"
            className={"btn " + (mode === "extra" ? "primary" : "ghost")}
            onClick={() => setMode("extra")}
          >
            🌟 Дополнительные материалы (с чатом)
          </button>
        </div>
      </div>

      {mode === "repository" && (
        <UnifiedMaterialsRepository courses={courses} apiPrefix="/api/manager" />
      )}

      {mode === "extra" && (
        <ExtraMaterialsTabContent courses={courses} groups={groups} apiPrefix="/api/manager" />
      )}
    </div>
  );
}
