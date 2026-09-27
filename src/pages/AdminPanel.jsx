import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import SearchSelect from "../components/SearchSelect";
import Collapsible from "../components/Collapsible";
import AnnouncementsPanel from "../components/AnnouncementsPanel";
import StaffChatsPanel from "../components/StaffChatsPanel";
import DirectMessages from "../components/DirectMessages";
import ChatPanel from "../components/ChatPanel";
import ExtraMaterialsTabContent from "../components/ExtraMaterialsTabContent";
import UnifiedMaterialsRepository from "../components/UnifiedMaterialsRepository";
import CoursesTab from "../components/CoursesTab";
import TestsTab from "../components/TestsTab";
import RepositoryPickerModal from "../components/RepositoryPickerModal";
import WarningCard from "../components/WarningCard";
import InvitesTab from "../components/InvitesTab";
import WelcomeModal from "../components/WelcomeModal";
import { StudentsTab, ProgressTable, AttemptsTab, AnalyticsTab } from "../components/MonitoringTabsLazy";
import Modal from "../components/Modal";
import PasswordModal from "../components/PasswordModal";
import UploadsTab from "../components/UploadsTab";
import { MAT_TYPES } from "../lib/constants";
import { api, uploadFile, getToken } from "../api";

const TABS = [
  { id: "invites",       label: "Приглашения" },
  { id: "users",         label: "Пользователи" },
  { id: "courses",       label: "Курсы и темы" },  
  { id: "groups",        label: "Группы" },  
  { id: "chats",         label: "Чаты" },  
  { id: "materials",     label: "Материалы" },  
  { id: "tests",         label: "Тесты" },  
  { id: "messages",      label: "Сообщения" },
  { id: "announcements", label: "Объявления" },
  { id: "uploads",       label: "Файлы" },
  { id: "settings",      label: "Настройки" },
];

const MONITORING_ITEMS = [
  { id: "students",  label: "Ученики" },
  { id: "progress",  label: "Таблица прогресса" },
  { id: "attempts",  label: "Попытки" },
  { id: "analytics", label: "Аналитика" },
];

// старые ссылки вида ?tab=mon_students из прошлых сборок
const LEGACY_TABS = {
  mon_students: "students",
  mon_progress: "progress",
  mon_attempts: "attempts",
  mon_analytics: "analytics",
};
const normalizeTab = (t) => LEGACY_TABS[t] || t;

export default function AdminPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTabState] = useState(() => {
    const t = normalizeTab(searchParams.get("tab"));
    const valid = TABS.some((x) => x.id === t) || MONITORING_ITEMS.some((x) => x.id === t);
    return valid ? t : "users";
  });
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [dataErr, setDataErr] = useState(null);
  const [groupId, setGroupId] = useState("");
  const [key, setKey] = useState(0);
  const reload = () => setKey(k => k + 1);

  // переключение таба пишем в URL — F5 и «назад» сохраняют место
  const changeTab = (id) => {
    setTabState(id);
    const next = new URLSearchParams(searchParams);
    next.set("tab", id);
    setSearchParams(next);
  };

  // реакция на внешнее изменение URL (клик по уведомлению, назад/вперёд)
  useEffect(() => {
    const raw = searchParams.get("tab");
    if (!raw) return;
    const t = normalizeTab(raw);
    const valid = TABS.some((x) => x.id === t) || MONITORING_ITEMS.some((x) => x.id === t);
    if (!valid) return;
    if (t !== raw) {
      // старую ссылку переписываем на новый id
      const next = new URLSearchParams(searchParams);
      next.set("tab", t);
      setSearchParams(next, { replace: true });
    }
    setTabState(t);
  }, [searchParams.toString()]);

  useEffect(() => {
    setDataErr(null);
    api("/api/admin/users").then(setUsers).catch((e) => setDataErr(`пользователи: ${e.message}`)).finally(() => setUsersLoading(false));
    api("/api/admin/courses").then(setCourses).catch((e) => setDataErr(`курсы: ${e.message}`));
    api("/api/staff/groups")
      .then(setGroups)
      .catch((e) => setDataErr(`группы: ${e.message}`))
      .finally(() => setGroupsLoading(false));
  }, [key]);

  useEffect(() => {
    if (!groupId && groups[0]) setGroupId(String(groups[0].id));
  }, [groups, groupId]);

  const isMonitoring = MONITORING_ITEMS.some((i) => i.id === tab);

  return (
    <Layout
      title="Панель администратора"
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
        <div className="card row">
          <label>Группа:</label>
          <select value={groupId} onChange={e => setGroupId(e.target.value)}>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.course_title} — {g.name}</option>
            ))}
          </select>
        </div>
      )}
      {isMonitoring && !groupsLoading && !groups.length && (
        <div className="card muted">Группы не найдены</div>
      )}
      {isMonitoring && groupId && tab === "students" && <StudentsTab groupId={+groupId} />}
      {isMonitoring && groupId && tab === "progress" && <ProgressTable groupId={+groupId} />}
      {isMonitoring && groupId && tab === "attempts" && <AttemptsTab groupId={+groupId} />}
      {isMonitoring && groupId && tab === "analytics" && <AnalyticsTab groupId={+groupId} />}

      {tab === "invites"       && <InvitesTab />}      
      {tab === "users"         && <UsersTab users={users} loading={usersLoading} reload={reload} />}   
      {tab === "courses"       && <CoursesTab courses={courses} groups={groups} reload={reload} apiPrefix="/api/admin" />}
      {tab === "groups"        && <GroupsTab courses={courses} users={users} reload={reload} />}      
      {tab === "messages"      && <DirectMessages />}
      {tab === "materials"     && <MaterialsTab courses={courses} groups={groups} />}
      {tab === "tests"         && <TestsTab courses={courses} apiPrefix="/api/admin" />}
      {tab === "announcements" && <AnnouncementsPanel initialGroups={groups} />}
      {tab === "chats"         && <StaffChatsPanel />}
      {tab === "uploads"       && <UploadsTab apiPrefix="/api/admin" showMimetype />}
      {tab === "settings"      && <SettingsTab />}
    </Layout>
  );
}

/* ---------- USERS ---------- */
function UsersTab({ users, loading, reload }) {
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "student" });
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [q, setQ] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api("/api/admin/users", { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", username: "", password: "", role: "student" });
      reload();
    } catch (e) { alert(e.message); }
  };
  const del = async (id) => {
    if (!confirm("Удалить пользователя?")) return;
    try {
      await api("/api/admin/users/" + id, { method: "DELETE" });
      reload();
    } catch (e) { alert(e.message); }
  };

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? users.filter(u =>
        `${u.name} ${u.username} ${u.role} ${u.extra_roles || ""}`.toLowerCase().includes(needle))
    : users;

  return (
    <div>
      <form className="card row" onSubmit={submit}>
        <input placeholder="ФИО" value={form.name}
               onChange={e => setForm({ ...form, name: e.target.value })} required />
        <input placeholder="Логин" value={form.username}
               onChange={e => setForm({ ...form, username: e.target.value })} required />
        <input type="password" placeholder="Пароль" value={form.password}
               onChange={e => setForm({ ...form, password: e.target.value })} required />
        <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
          <option value="student">Ученик</option>
          <option value="teacher">Куратор</option>
          <option value="manager">Методист</option>
        </select>
        <button className="btn primary">Добавить</button>
      </form>
      <div className="card row" style={{ alignItems: "center", gap: 8 }}>
        <label>Поиск:</label>
        <input placeholder="ФИО, логин или роль…" value={q}
               onChange={e => setQ(e.target.value)} style={{ flex: 1 }} />
        <span className="muted small">{filtered.length} / {users.length}</span>
      </div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>ID</th><th>ФИО</th><th>Логин</th><th>Роль</th><th></th></tr></thead>
        <tbody>
          {filtered.map(u => (
            <tr key={u.id}>
               <td>{u.id}</td><td>{u.name}</td><td>{u.username}</td>
              <td>
                {u.role}
                {u.extra_roles && (
                  <span className="muted small"> + {u.extra_roles}</span>
                )}
              </td>
              <td>
                <button className="btn small" onClick={() => setEditing(u)}>Изм.</button>{" "}
                <button className="btn small" onClick={() => setResetting({ id: u.id, name: u.name })}>
                  Пароль
                </button>{" "}
                <button className="btn danger small" onClick={() => del(u.id)}>Уд.</button>
              </td>
            </tr>
          ))}
          {!filtered.length && (
            <tr>
              <td colSpan={5} className="muted">
                {loading
                  ? "Загрузка пользователей…"
                  : needle
                    ? "Никого не найдено по запросу «" + q + "»"
                    : "Пользователей пока нет"}
              </td>
            </tr>
          )}
        </tbody>
      </table></div>
      {editing && <UserEditModal user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {resetting && <PasswordModal name={resetting.name} onClose={() => setResetting(null)}
                                    onSubmit={async (pw) => {
                                      try {
                                        await api(`/api/admin/users/${resetting.id}/password`,
                                                   { method: "PUT", body: JSON.stringify({ password: pw }) });
                                        alert("Пароль изменён");
                                        setResetting(null);
                                      } catch (e) { alert(e.message); }
                                    }} />}
    </div>
  );
}

function UserEditModal({ user, onClose, onSaved }) {
  const isAdminUser = user.role === "admin";
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [role, setRole] = useState(user.role);
  const [extra, setExtra] = useState(
    (user.extra_roles || "").split(",").map(s => s.trim()).filter(Boolean)
  );

  const toggleExtra = (r) => {
    setExtra(extra.includes(r) ? extra.filter(x => x !== r) : [...extra, r]);
  };

  const save = async () => {
    try {
      const payload = {
        name,
        username,
        extra_roles: extra.join(","),
      };
      if (!isAdminUser) payload.role = role;
      await api(`/api/admin/users/${user.id}`, {
        method: "PUT", body: JSON.stringify(payload),
      });
      onSaved();
    } catch (e) { alert(e.message); }
  };

  return (
    <Modal onClose={onClose} innerStyle={{ maxWidth: 480 }}>
      <h3>Редактирование пользователя</h3>
      <label>ФИО</label>
      <input value={name} onChange={e => setName(e.target.value)} style={{ width: "100%" }} />
      <label style={{ marginTop: 8, display: "block" }}>Логин</label>
      <input value={username} onChange={e => setUsername(e.target.value)} style={{ width: "100%" }} />

      {!isAdminUser && (
        <>
          <label style={{ marginTop: 8, display: "block" }}>Основная роль</label>
          <select value={role} onChange={e => setRole(e.target.value)} style={{ width: "100%" }}>
            <option value="student">Ученик</option>
            <option value="teacher">Куратор</option>
            <option value="manager">Методист</option>
          </select>
        </>
      )}

      <label style={{ marginTop: 12, display: "block" }}>Дополнительные роли</label>
      <div className="muted small" style={{ marginBottom: 6 }}>
        Пользователь сможет переключаться между ролями при входе и в шапке сайта.
      </div>
      <div className="chips">
        {["student", "teacher", "manager"].map(r => (
          <label key={r} className="chip" style={{ cursor: "pointer" }}>
            <input type="checkbox"
                   checked={extra.includes(r)}
                   onChange={() => toggleExtra(r)} />
            {r === "student" ? "Ученик" : r === "teacher" ? "Куратор" : "Методист"}
          </label>
        ))}
      </div>

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn ghost" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={save}>Сохранить</button>
      </div>
    </Modal>
  );
}

/* ---------- GROUPS ---------- */
const userHasRole = (u, r) =>
  u.role === r || (u.extra_roles || "").split(",").map(s => s.trim()).includes(r);

function GroupsTab({ courses, users, reload }) {
  const teachers = users.filter(u => userHasRole(u, "teacher"));
  const students = users.filter(u => userHasRole(u, "student"));
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [groups, setGroups] = useState([]);
  const [loadErr, setLoadErr] = useState(null);
  const [newName, setNewName] = useState("");

  const load = () =>
    courseId &&
    api(`/api/admin/groups/${courseId}`)
      .then(setGroups)
      .catch((e) => setLoadErr(e.message));
  useEffect(() => { load(); }, [courseId]);
  useEffect(() => { if (!courseId && courses[0]) setCourseId(courses[0].id); }, [courses, courseId]);

  const addGroup = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await api("/api/admin/groups", {
        method: "POST", body: JSON.stringify({ course_id: +courseId, name: newName.trim() }),
      });
      setNewName(""); load(); reload();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div className="card row">
        <label>Курс:</label>
        <select value={courseId} onChange={e => setCourseId(e.target.value)}>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>
      <form className="card row" onSubmit={addGroup}>
        <input placeholder="Название группы (например, ИС-21)" value={newName}
               onChange={e => setNewName(e.target.value)} style={{ flex: 1 }} />
        <button className="btn primary">Создать группу</button>
      </form>

      {loadErr && (
        <div className="card" style={{ color: "#dc2626" }}>
          Не удалось загрузить группы: {loadErr}
        </div>
      )}
      {groups.map(g => (
        <GroupCard key={g.id} group={g} teachers={teachers} students={students}
                   reload={() => { load(); reload(); }} />
      ))}
      {!groups.length && !loadErr && <div className="card muted">В этом курсе пока нет групп</div>}
    </div>
  );
}

function GroupCard({ group, teachers, students, reload }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(group.name);
  const [teacherId, setTeacherId] = useState("");
  const [studentId, setStudentId] = useState("");

  const saveName = async () => {
    try {
      await api(`/api/admin/groups/${group.id}`, { method: "PUT", body: JSON.stringify({ name }) });
      setEdit(false); reload();
    } catch (e) { alert(e.message); }
  };
  const del = async () => {
    if (!confirm("Удалить группу?")) return;
    try {
      await api(`/api/admin/groups/${group.id}`, { method: "DELETE" });
      reload();
    } catch (e) { alert(e.message); }
  };
  const addTeacher = async () => {
    if (!teacherId) return;
    try {
      await api(`/api/admin/groups/${group.id}/teachers`, {
        method: "POST", body: JSON.stringify({ teacher_id: +teacherId }),
      });
      setTeacherId(""); reload();
    } catch (e) { alert(e.message); }
  };
  const removeTeacher = async (tid) => {
    try {
      await api(`/api/admin/groups/${group.id}/teachers/${tid}`, { method: "DELETE" });
      reload();
    } catch (e) { alert(e.message); }
  };
  const addStudent = async () => {
    if (!studentId) return;
    try {
      await api(`/api/admin/groups/${group.id}/students`, {
        method: "POST", body: JSON.stringify({ user_id: +studentId }),
      });
      setStudentId(""); reload();
    } catch (e) { alert(e.message); }
  };
  const removeStudent = async (uid) => {
    try {
      await api(`/api/admin/groups/${group.id}/students/${uid}`, { method: "DELETE" });
      reload();
    } catch (e) { alert(e.message); }
  };

  const studentOptions = students.map(s => ({ value: s.id, label: `${s.name} (${s.username})` }));

  return (
    <div className="card">
      <div className="spread">
        {edit ? (
          <>
            <input value={name} onChange={e => setName(e.target.value)} style={{ flex: 1 }} />
            <button className="btn primary" onClick={saveName}>ОК</button>
            <button className="btn ghost" onClick={() => setEdit(false)}>Отмена</button>
          </>
        ) : (
          <>
            <b>{group.name}</b>
            <div>
              <button className="btn small" onClick={() => setEdit(true)}>Переименовать</button>{" "}
              <button className="btn danger small" onClick={del}>Удалить</button>
            </div>
          </>
        )}
      </div>

      <div className="section-title">Кураторы</div>
      <div className="chips">
        {group.teachers.map(t => (
          <span key={t.id} className="chip">
            {t.name}<button onClick={() => removeTeacher(t.id)} aria-label="Убрать куратора">✕</button>
          </span>
        ))}
        {!group.teachers.length && <span className="muted small">нет</span>}
      </div>
      <div className="row">
        <select value={teacherId} onChange={e => setTeacherId(e.target.value)}>
          <option value="">— куратор —</option>
          {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="btn" onClick={addTeacher}>Добавить</button>
      </div>

      <div className="section-title">Ученики ({group.students.length})</div>
      <div className="chips">
        {group.students.map(s => (
          <span key={s.id} className="chip">
            {s.name}<button onClick={() => removeStudent(s.id)} aria-label="Убрать ученика">✕</button>
          </span>
        ))}
        {!group.students.length && <span className="muted small">нет</span>}
      </div>
      <div className="row">
        <div style={{ minWidth: 260 }}>
          <SearchSelect options={studentOptions} value={studentId}
                        onChange={v => setStudentId(v)}
                        placeholder="Поиск ученика по ФИО..." />
        </div>
        <button className="btn" onClick={addStudent}>Добавить ученика</button>
      </div>
    </div>
  );
}

/* ---------- MATERIALS ---------- */
function MaterialsTab({ courses, groups = [] }) {
  const [subMode, setSubMode] = useState("repository"); // "repository" | "extra" | "themes"
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [themeId, setThemeId] = useState("");
  const [materials, setMaterials] = useState([]);
  const [materialsErr, setMaterialsErr] = useState(null);
  const [form, setForm] = useState({ title: "", type: "video", url: "", order_index: 0 });
  const [uploading, setUploading] = useState(false);
  const fetchSeq = useRef(0);

  const currentCourse = courses.find(c => c.id === +courseId);
  const themes = currentCourse?.themes || [];

  useEffect(() => { if (!courseId && courses[0]) setCourseId(courses[0].id); }, [courses, courseId]);
  useEffect(() => {
    if (!themes.length) { setThemeId(""); return; }
    if (!themes.find(t => t.id === +themeId)) setThemeId(themes[0].id);
  }, [courseId, courses]);

  const reload = async () => {
    const seq = ++fetchSeq.current; // защита от гонки при быстрой смене темы
    if (!themeId) {
      setMaterials([]);
      setMaterialsErr(null);
      return;
    }
    try {
      const data = await api(`/api/admin/themes/${themeId}/materials`);
      if (seq === fetchSeq.current) { setMaterials(data); setMaterialsErr(null); }
    } catch (e) {
      if (seq === fetchSeq.current) { setMaterials([]); setMaterialsErr(e.message); }
    }
  };

  useEffect(() => {
    reload();
  }, [themeId]);

  const add = async (e) => {
    e.preventDefault();
    if (!form.url.trim()) return alert("Пожалуйста, введите URL или загрузите файл.");
    try {
      await api("/api/admin/materials", {
        method: "POST",
        body: JSON.stringify({ ...form, theme_id: +themeId, order_index: +form.order_index }),
      });
      setForm({ title: "", type: "video", url: "", order_index: 0 });
      reload();
    } catch (err) { alert(err.message); }
  };
  const onUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try {
      const rec = await uploadFile(file);
      const t = file.type.startsWith("audio") ? "audio"
              : file.type.startsWith("image") ? "image"
              : (file.type.includes("pdf") || file.name.endsWith(".doc") || file.name.endsWith(".docx")) ? "document"
              : file.type.startsWith("video") ? "video"
              : "document";
      setForm(f => ({ ...f, url: "/uploads/" + rec.filename, type: t }));
    } catch (e) { alert(e.message); }
    finally { setUploading(false); e.target.value = ""; }
  };

  return (
    <div>
      <div className="card row" style={{ alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <b className="small">Раздел материалов:</b>
        <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            className={"btn " + (subMode === "repository" ? "primary" : "ghost")}
            onClick={() => setSubMode("repository")}
            style={{ fontWeight: subMode === "repository" ? 600 : 400 }}
          >
            📁 Накопитель материалов и плейлистов (Видео, Конспекты, Тексты, Документы, Аудио, Рисунки)
          </button>
          <button
            type="button"
            className={"btn " + (subMode === "extra" ? "primary" : "ghost")}
            onClick={() => setSubMode("extra")}
          >
            🌟 Дополнительные материалы курса (с чатом)
          </button>
          <button
            type="button"
            className={"btn " + (subMode === "themes" ? "primary" : "ghost")}
            onClick={() => setSubMode("themes")}
          >
            📚 Материалы по темам курса ({themes.length} тем)
          </button>
        </div>
      </div>

      {subMode === "repository" ? (
        <UnifiedMaterialsRepository courses={courses} apiPrefix="/api/admin" />
      ) : subMode === "extra" ? (
        <ExtraMaterialsTabContent courses={courses} groups={groups} apiPrefix="/api/admin" />
      ) : (
        <div>
          <div className="card row">
            <label>Курс:</label>
            <select value={courseId} onChange={e => setCourseId(e.target.value)}>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <label>Тема:</label>
            <select value={themeId} onChange={e => setThemeId(e.target.value)}>
              {themes.map(t => <option key={t.id} value={t.id}>Тема {t.order_index}. {t.title}</option>)}
            </select>
          </div>

          {!themes.length && <div className="card muted">Сначала добавьте темы в этот курс</div>}

          {themeId && (
            <>
              <form className="card" onSubmit={add}>
                <div className="row">
                  <input placeholder="Название" value={form.title}
                         onChange={e => setForm({ ...form, title: e.target.value })} required style={{ flex: 1 }} />
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    {MAT_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                  </select>
                  <input type="number" placeholder="Порядок" value={form.order_index}
                         onChange={e => setForm({ ...form, order_index: e.target.value })} style={{ width: 100 }} />
                </div>
                {form.type === "note" ? (
                  <textarea placeholder="Текст заметки" value={form.url}
                            onChange={e => setForm({ ...form, url: e.target.value })}
                            rows={4} style={{ width: "100%" }} required />
                ) : (
                  <div className="row">
                    <input placeholder="URL или загрузите файл →" value={form.url}
                           onChange={e => setForm({ ...form, url: e.target.value })} style={{ flex: 1 }} />
                    <label className="btn">
                      {uploading ? "Загрузка..." : "Загрузить файл"}
                      <input type="file" hidden onChange={onUpload} />
                    </label>
                  </div>
                )}
                <button className="btn primary" style={{ marginTop: 6 }}>Добавить материал</button>
              </form>

              <div className="list">
                {materialsErr && (
                  <div style={{ color: "#dc2626" }}>
                    Не удалось загрузить материалы: {materialsErr}
                  </div>
                )}
                {materials.map(m => (
                  <MaterialRow key={m.id} material={m} reload={reload} />
                ))}
                {!materials.length && !materialsErr && <div className="muted">Материалов в этой теме пока нет</div>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MaterialRow({ material, reload }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({
    title: material.title, type: material.type,
    url: material.url, order_index: material.order_index,
  });
  const [uploading, setUploading] = useState(false);

  const save = async () => {
    try {
      await api(`/api/admin/materials/${material.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...form, order_index: +form.order_index }),
      });
      setEdit(false); reload();
    } catch (e) { alert(e.message); }
  };
  const del = async () => {
    if (!confirm("Удалить материал?")) return;
    try {
      await api("/api/admin/materials/" + material.id, { method: "DELETE" });
      reload();
    } catch (e) { alert(e.message); }
  };
  const onUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try {
      const rec = await uploadFile(file);
      setForm(f => ({ ...f, url: "/uploads/" + rec.filename }));
    } catch (e) { alert(e.message); }
    finally { setUploading(false); e.target.value = ""; }
  };

  if (!edit) {
    return (
      <div className="card spread">
        <div>
          <b>#{material.order_index} [{material.type}] {material.title}</b>
          <div className="muted small">
            {material.type === "note"
              ? material.url.slice(0, 100) + (material.url.length > 100 ? "…" : "")
              : <a href={material.url} target="_blank" rel="noreferrer">{material.url}</a>}
          </div>
        </div>
        <div>
          <button className="btn small" onClick={() => setEdit(true)}>Изм.</button>{" "}
          <button className="btn danger small" onClick={del} aria-label="Удалить">✕</button>
        </div>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="row">
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={{ flex: 1 }} />
        <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
          {MAT_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
        <input type="number" value={form.order_index}
               onChange={e => setForm({ ...form, order_index: e.target.value })} style={{ width: 90 }} />
      </div>
      {form.type === "note" ? (
        <textarea value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
                  rows={4} style={{ width: "100%", marginTop: 6 }} />
      ) : (
        <div className="row" style={{ marginTop: 6 }}>
          <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} style={{ flex: 1 }} />
          <label className="btn">
            {uploading ? "Загрузка..." : "Заменить файл"}
            <input type="file" hidden onChange={onUpload} />
          </label>
        </div>
      )}
      <div className="row" style={{ marginTop: 6, justifyContent: "flex-end" }}>
        <button className="btn ghost" onClick={() => setEdit(false)}>Отмена</button>
        <button className="btn primary" onClick={save}>Сохранить</button>
      </div>
    </div>
  );
}


/* ---------- UPLOADS ---------- */
/* ---------- SETTINGS ---------- */
function SettingsTab() {
  const [names, setNames] = useState({ admin: "", teacher: "", student: "", manager: "" });
  const [platform, setPlatform] = useState({
    college_name: "МКУ — Международные Курсы Ученичества",
    welcome_title: "Добро пожаловать в МКУ!",
    welcome_text: "Мы верим, что время обучения станет для вас поистине особенным временем.\nПусть Дух Святой работает с вашим сердцем на этом пути, а жизнь изменяется!",
    welcome_enabled: "true",
    warning_title: "Уважаемые студенты!",
    warning_text: "Обращаем ваше внимание, что копирование и распространение материалов обучения (конспекты, видео и аудио-уроки) запрещено.\nВы можете использовать материалы в целях собственного обучения, а также сохранять на личные устройства, без передачи третьим лицам. Надеемся на ваше понимание и благословляем на плодотворную учебу!",
    warning_enabled: "true",
    show_header_banner: "true",
    default_passing_score: "70",
    allow_review_answers: "true",
    notify_curators_on_test: "true",
  });
  const [stats, setStats] = useState(null);
  const [creds, setCreds] = useState({ username: "", password: "", old_password: "" });
  const [saving, setSaving] = useState(false);
  const [previewWelcome, setPreviewWelcome] = useState(false);
  const [previewWarning, setPreviewWarning] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreBusy, setRestoreBusy] = useState(false);

  const loadSettings = async () => {
    try {
      const data = await api("/api/admin/settings");
      if (data.settings) {
        setPlatform(p => ({ ...p, ...data.settings }));
        setNames({
          admin: data.settings.role_admin_name || "Администратор",
          teacher: data.settings.role_teacher_name || "Куратор",
          student: data.settings.role_student_name || "Ученик",
          manager: data.settings.role_manager_name || "Методист",
        });
      }
      if (data.stats) setStats(data.stats);
    } catch (e) { console.error("Error loading settings:", e); }
    api("/api/auth/me")
      .then(me => setCreds(c => ({ ...c, username: me.username })))
      .catch(() => {});
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const downloadBackup = async () => {
    setBackupBusy(true);
    try {
      const res = await fetch("/api/admin/backup", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        let detail = "Ошибка запроса";
        try { detail = (await res.json()).detail || detail; } catch {}
        throw new Error(detail);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mku-backup-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Не удалось скачать резервную копию: ${e.message}`);
    } finally {
      setBackupBusy(false);
    }
  };

  const restoreBackup = async () => {
    if (!restoreFile || restoreBusy) return;
    let text;
    try {
      text = await restoreFile.text();
    } catch {
      return alert("Не удалось прочитать файл");
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return alert("Это не JSON-файл");
    }
    const exported = parsed && parsed.exported_at
      ? new Date(parsed.exported_at).toLocaleString()
      : "дата неизвестна";
    const usersCount = parsed && Array.isArray(parsed.users) ? parsed.users.length : "?";
    const ok = confirm(
      `Заменить текущую базу данных содержимым файла «${restoreFile.name}»?\n` +
      `Выгружен: ${exported}; пользователей в файле: ${usersCount}.\n` +
      `Все изменения после выгрузки будут потеряны. Перед восстановлением сервер сохранит текущую базу в data/database.before-restore.json.\n\nПродолжить?`
    );
    if (!ok) return;
    setRestoreBusy(true);
    try {
      const result = await uploadFile(restoreFile, "/api/admin/restore");
      const lines = [];
      if (result.restored) {
        lines.push("Восстановлено: " + Object.entries(result.restored).map(([k, v]) => `${k}=${v}`).join(", "));
      }
      if (result.skipped && result.skipped.length) {
        lines.push("Не было в файле (текущие данные не тронуты): " + result.skipped.join(", "));
      }
      if (result.warnings && result.warnings.length) {
        lines.push("Предупреждения:\n• " + result.warnings.join("\n• "));
      }
      alert(lines.join("\n\n") || "База данных восстановлена");
      location.reload();
    } catch (e) {
      alert(`Ошибка восстановления: ${e.message}`);
    } finally {
      setRestoreBusy(false);
    }
  };

  const saveAllSettings = async () => {
    setSaving(true);
    try {
      await api("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...platform,
          role_admin_name: names.admin,
          role_teacher_name: names.teacher,
          role_student_name: names.student,
          role_manager_name: names.manager,
        }),
      });
      alert("Все настройки платформы успешно сохранены!");
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const saveCreds = async () => {
    if (!creds.old_password) return alert("Введите текущий пароль");
    try {
      await api("/api/admin/admin/credentials", {
        method: "PUT",
        body: JSON.stringify({
          username: creds.username,
          password: creds.password || "",
          old_password: creds.old_password,
        }),
      });
      alert("Данные администратора обновлены. Возможно, потребуется повторный вход.");
      setCreds(c => ({ ...c, password: "", old_password: "" }));
    } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. Брендинг и общее оформление */}
      <div className="card">
        <div className="spread" style={{ alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>🏛️ Брендинг и информация о курсах МКУ</h3>
            <div className="muted small">Название учебной организации и отображение шапки в профилях</div>
          </div>
          <button className="btn primary" disabled={saving} onClick={saveAllSettings}>
            {saving ? "Сохранение..." : "Сохранить всё"}
          </button>
        </div>

        <div style={{ marginTop: 14 }}>
          <label>Название курсов / организации:</label>
          <input
            value={platform.college_name}
            onChange={e => setPlatform({ ...platform, college_name: e.target.value })}
            style={{ width: "100%", marginTop: 4 }}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={platform.show_header_banner === "true"}
              onChange={e => setPlatform({ ...platform, show_header_banner: e.target.checked ? "true" : "false" })}
            />
            <b>Отображать графический баннер МКУ (Frame_28_1) в шапке всех профилей</b>
          </label>
        </div>
      </div>

      {/* 2. Приветственное окно и духовное напутствие */}
      <div className="card">
        <div className="spread" style={{ alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>🕊️ Приветственное окно для студентов (Welcome Modal)</h3>
            <div className="muted small">Духовное благословение и напутствие при первом входе</div>
          </div>
          <button
            type="button"
            className="btn small"
            onClick={() => setPreviewWelcome(true)}
            style={{ background: "#eff6ff", borderColor: "#93c5fd", color: "#1e40af" }}
          >
            👁️ Предпросмотр окна
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={platform.welcome_enabled === "true"}
              onChange={e => setPlatform({ ...platform, welcome_enabled: e.target.checked ? "true" : "false" })}
            />
            <b>Автоматически показывать приветственное окно новым студентам</b>
          </label>
        </div>

        <div style={{ marginTop: 10 }}>
          <label>Заголовок приветствия:</label>
          <input
            value={platform.welcome_title}
            onChange={e => setPlatform({ ...platform, welcome_title: e.target.value })}
            style={{ width: "100%", marginTop: 4 }}
          />
        </div>

        <div style={{ marginTop: 10 }}>
          <label>Текст приветствия и напутствия:</label>
          <textarea
            rows={4}
            value={platform.welcome_text}
            onChange={e => setPlatform({ ...platform, welcome_text: e.target.value })}
            style={{ width: "100%", marginTop: 4, fontFamily: "inherit", padding: 8 }}
          />
        </div>
      </div>

      {/* 3. Предупреждение о защите учебных материалов (Frame_34_1) */}
      <div className="card">
        <div className="spread" style={{ alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>⚠️ Предупреждение о защите материалов (Frame_34_1)</h3>
            <div className="muted small">Уведомление студентов о запрете копирования и распространения курсов</div>
          </div>
          <button
            type="button"
            className="btn small"
            onClick={() => setPreviewWarning(!previewWarning)}
            style={{ background: "#fef2f2", borderColor: "#fca5a5", color: "#991b1b" }}
          >
            {previewWarning ? "Скрыть предпросмотр" : "👁️ Предпросмотр Frame_34_1"}
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={platform.warning_enabled === "true"}
              onChange={e => setPlatform({ ...platform, warning_enabled: e.target.checked ? "true" : "false" })}
            />
            <b>Показывать карточку-предупреждение в учебных разделах и материалах</b>
          </label>
        </div>

        <div style={{ marginTop: 10 }}>
          <label>Текст предупреждения:</label>
          <textarea
            rows={3}
            value={platform.warning_text}
            onChange={e => setPlatform({ ...platform, warning_text: e.target.value })}
            style={{ width: "100%", marginTop: 4, fontFamily: "inherit", padding: 8 }}
          />
        </div>

        {previewWarning && (
          <div style={{ marginTop: 16, borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
            <div className="small muted" style={{ marginBottom: 8 }}>Предпросмотр карточки Frame_34_1:</div>
            <WarningCard />
          </div>
        )}
      </div>

      {/* 4. Параметры тестирования и обучения */}
      <div className="card">
        <h3 style={{ margin: "0 0 4px" }}>📝 Параметры тестирования и курсов</h3>
        <div className="muted small">Базовые параметры для тестов и обратной связи</div>

        <div className="row" style={{ marginTop: 12, alignItems: "center", gap: 16 }}>
          <div style={{ width: 220 }}>
            <label>Проходной балл по умолчанию (%):</label>
            <input
              type="number"
              min={1}
              max={100}
              value={platform.default_passing_score}
              onChange={e => setPlatform({ ...platform, default_passing_score: e.target.value })}
              style={{ width: "100%", marginTop: 4 }}
            />
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={platform.allow_review_answers === "true"}
                onChange={e => setPlatform({ ...platform, allow_review_answers: e.target.checked ? "true" : "false" })}
              />
              Разрешать студентам просмотр подробного разбора ответов после сдачи теста
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={platform.notify_curators_on_test === "true"}
                onChange={e => setPlatform({ ...platform, notify_curators_on_test: e.target.checked ? "true" : "false" })}
              />
              Отправлять кураторам уведомление о завершении теста учеником
            </label>
          </div>
        </div>
      </div>

      {/* 5. Названия ролей */}
      <div className="card">
        <h3 style={{ margin: "0 0 4px" }}>👥 Названия ролей в интерфейсе</h3>
        <div className="muted small">Отображаемые названия ролей в системе</div>

        <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 12 }}>
          <div>
            <label>Администратор</label>
            <input
              value={names.admin}
              onChange={e => setNames({ ...names, admin: e.target.value })}
              style={{ width: "100%", marginTop: 4 }}
            />
          </div>
          <div>
            <label>Методист</label>
            <input
              value={names.manager}
              onChange={e => setNames({ ...names, manager: e.target.value })}
              style={{ width: "100%", marginTop: 4 }}
            />
          </div>
          <div>
            <label>Куратор</label>
            <input
              value={names.teacher}
              onChange={e => setNames({ ...names, teacher: e.target.value })}
              style={{ width: "100%", marginTop: 4 }}
            />
          </div>
          <div>
            <label>Ученик</label>
            <input
              value={names.student}
              onChange={e => setNames({ ...names, student: e.target.value })}
              style={{ width: "100%", marginTop: 4 }}
            />
          </div>
        </div>
      </div>

      {/* 6. Учётные данные администратора */}
      <div className="card">
        <h3 style={{ margin: "0 0 4px" }}>🔑 Учётные данные администратора</h3>
        <div className="muted small">Изменение логина и пароля входа в систему</div>

        <div style={{ marginTop: 10 }}>
          <label>Логин</label>
          <input
            value={creds.username}
            onChange={e => setCreds({ ...creds, username: e.target.value })}
            style={{ width: "100%", marginTop: 4 }}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <label>Новый пароль (оставьте пустым, если не меняете)</label>
          <input
            type="password"
            value={creds.password}
            onChange={e => setCreds({ ...creds, password: e.target.value })}
            style={{ width: "100%", marginTop: 4 }}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <label>Текущий пароль (обязательно для подтверждения)</label>
          <input
            type="password"
            value={creds.old_password}
            onChange={e => setCreds({ ...creds, old_password: e.target.value })}
            style={{ width: "100%", marginTop: 4 }}
          />
        </div>
        <button className="btn primary" onClick={saveCreds} style={{ marginTop: 12 }}>
          Обновить данные администратора
        </button>
      </div>

      {/* 7. Резервное копирование и статистика */}
      <div className="card" style={{ background: "#f8fafc", border: "1px solid #cbd5e1" }}>
        <div className="spread" style={{ alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>💾 Резервное копирование и сводка данных</h3>
            <div className="muted small">Экспорт полной базы данных платформы в формате JSON</div>
          </div>
          <button
            onClick={downloadBackup}
            disabled={backupBusy}
            className="btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#1e3a8a",
              color: "#ffffff",
              fontWeight: 600,
              textDecoration: "none",
              padding: "9px 18px",
              borderRadius: 8,
              opacity: backupBusy ? 0.6 : 1,
              cursor: backupBusy ? "wait" : "pointer",
            }}
          >
            {backupBusy ? "⏳ Формируем…" : "📥 Скачать резервную копию (JSON)"}
          </button>
        </div>

        <div style={{ marginTop: 14, borderTop: "1px solid #cbd5e1", paddingTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>♻️ Восстановить из резервной копии</div>
          <div className="muted small" style={{ marginBottom: 8 }}>
            Выберите ранее выгруженный JSON-файл. Текущая база будет заменена его содержимым;
            перед восстановлением сервер сохранит копию текущей базы в data/database.before-restore.json.
          </div>
          <div className="row">
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
            />
            <button
              className="btn"
              disabled={!restoreFile || restoreBusy}
              onClick={restoreBackup}
              style={{
                background: restoreFile && !restoreBusy ? "#b91c1c" : "#94a3b8",
                color: "#fff",
                fontWeight: 600,
                cursor: restoreFile && !restoreBusy ? "pointer" : "not-allowed",
              }}
            >
              {restoreBusy ? "⏳ Восстановление…" : "♻️ Восстановить"}
            </button>
          </div>
        </div>

        {stats && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: 10,
              marginTop: 14,
            }}
          >
            <div className="card" style={{ padding: 10, textAlign: "center", margin: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#1e3a8a" }}>{stats.total_students}</div>
              <div className="small muted">Студентов</div>
            </div>
            <div className="card" style={{ padding: 10, textAlign: "center", margin: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#0d9488" }}>{stats.total_curators}</div>
              <div className="small muted">Кураторов</div>
            </div>
            <div className="card" style={{ padding: 10, textAlign: "center", margin: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#2563eb" }}>{stats.total_courses}</div>
              <div className="small muted">Курсов</div>
            </div>
            <div className="card" style={{ padding: 10, textAlign: "center", margin: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#7c3aed" }}>{stats.total_themes}</div>
              <div className="small muted">Темы / Уроков</div>
            </div>
            <div className="card" style={{ padding: 10, textAlign: "center", margin: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#ea580c" }}>{stats.total_tests}</div>
              <div className="small muted">Тестов</div>
            </div>
            <div className="card" style={{ padding: 10, textAlign: "center", margin: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#16a34a" }}>{stats.total_attempts}</div>
              <div className="small muted">Сдач тестов</div>
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal for Welcome Window */}
      <WelcomeModal
        isOpen={previewWelcome}
        onClose={() => setPreviewWelcome(false)}
      />
    </div>
  );
}
