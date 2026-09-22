import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import SearchSelect from "../components/SearchSelect";
import Collapsible from "../components/Collapsible";
import AnnouncementsPanel from "../components/AnnouncementsPanel";
import StaffChatsPanel from "../components/StaffChatsPanel";
import DirectMessages from "../components/DirectMessages";
import ChatPanel from "../components/ChatPanel";
import ExtraMaterialsTabContent from "../components/ExtraMaterialsTabContent";
import UnifiedMaterialsRepository from "../components/UnifiedMaterialsRepository";
import RepositoryPickerModal from "../components/RepositoryPickerModal";
import WarningCard from "../components/WarningCard";
import WelcomeModal from "../components/WelcomeModal";
import { api, uploadFile } from "../api";

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

export default function AdminPanel() {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [groups, setGroups] = useState([]);
  const [key, setKey] = useState(0);
  const reload = () => setKey(k => k + 1);

  useEffect(() => {
    api("/api/admin/users").then(setUsers).catch(() => {});
    api("/api/admin/courses").then(setCourses).catch(() => {});
    api("/api/staff/groups").then(setGroups).catch(() => {});
  }, [key]);

  return (
    <Layout title="Панель администратора" tabs={TABS} active={tab} onChange={setTab}>
      {tab === "invites"       && <InvitesTab />}      
      {tab === "users"         && <UsersTab users={users} reload={reload} />}   
      {tab === "courses"       && <CoursesTab courses={courses} groups={groups} reload={reload} />}
      {tab === "groups"        && <GroupsTab courses={courses} users={users} reload={reload} />}      
      {tab === "messages"      && <DirectMessages />}
      {tab === "materials"     && <MaterialsTab courses={courses} groups={groups} />}
      {tab === "tests"         && <TestsTab courses={courses} />}
      {tab === "announcements" && <AnnouncementsPanel initialGroups={groups} />}
      {tab === "chats"         && <StaffChatsPanel />}
      {tab === "uploads"       && <UploadsTab />}
      {tab === "settings"      && <SettingsTab />}
    </Layout>
  );
}

/* ---------- USERS ---------- */
function UsersTab({ users, reload }) {
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "student" });
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);

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
    await api("/api/admin/users/" + id, { method: "DELETE" });
    reload();
  };

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
      <table className="table">
        <thead><tr><th>ID</th><th>ФИО</th><th>Логин</th><th>Роль</th><th></th></tr></thead>
        <tbody>
          {users.map(u => (
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
        </tbody>
      </table>
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
    <div className="modal-back">
      <div className="card modal" style={{ maxWidth: 480 }}>
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
      </div>
    </div>
  );
}

function PasswordModal({ name, onClose, onSubmit }) {
  const [pw, setPw] = useState("");
  return (
    <div className="modal-back">
      <div className="card modal" style={{ maxWidth: 420 }}>
        <h3>Смена пароля</h3>
        <div className="muted small">Пользователь: <b>{name}</b></div>
        <input type="text" placeholder="Новый пароль" value={pw}
               onChange={e => setPw(e.target.value)} autoFocus style={{ width: "100%", marginTop: 10 }} />
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn ghost" onClick={onClose}>Отмена</button>
          <button className="btn primary" disabled={!pw} onClick={() => onSubmit(pw)}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- COURSES + THEMES ---------- */
function CoursesTab({ courses, groups = [], reload }) {
  const [form, setForm] = useState({ title: "", description: "", order_index: courses.length + 1 });

  const add = async (e) => {
    e.preventDefault();
    await api("/api/admin/courses", {
      method: "POST",
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        order_index: Number(form.order_index) || (courses.length + 1),
      }),
    });
    setForm({ title: "", description: "", order_index: courses.length + 2 });
    reload();
  };
  const del = async (id) => {
    if (!confirm("Удалить курс со всем содержимым?")) return;
    await api("/api/admin/courses/" + id, { method: "DELETE" });
    reload();
  };

  const handleSetCourseOrder = async (courseId, newOrder) => {
    if (newOrder < 1) return;
    await api(`/api/admin/courses/${courseId}`, {
      method: "PUT",
      body: JSON.stringify({ order_index: Number(newOrder) }),
    });
    reload();
  };

  return (
    <div>
      <form className="card row" onSubmit={add} style={{ alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span className="small muted">№:</span>
          <input
            type="number"
            min="1"
            placeholder="№"
            value={form.order_index}
            onChange={e => setForm({ ...form, order_index: e.target.value })}
            style={{ width: 60 }}
            title="Порядковый номер курса"
          />
        </div>
        <input placeholder="Название курса" value={form.title}
               onChange={e => setForm({ ...form, title: e.target.value })} required style={{ flex: 1 }} />
        <input placeholder="Описание курса" value={form.description}
               onChange={e => setForm({ ...form, description: e.target.value })} style={{ flex: 2 }} />
        <button className="btn primary">Создать курс</button>
      </form>
      {courses.map(c => (
        <CourseCard
          key={c.id}
          course={c}
          courses={courses}
          groups={groups}
          reload={reload}
          onDelete={() => del(c.id)}
          onSetOrder={handleSetCourseOrder}
        />
      ))}
    </div>
  );
}

function CourseCard({ course, courses = [], groups = [], reload, onDelete, onSetOrder }) {
  const [edit, setEdit] = useState(false);
  const curOrder = course.order_index ?? course.id;
  const [form, setForm] = useState({
    title: course.title,
    description: course.description,
    order_index: curOrder,
  });

  const saveEdit = async () => {
    await api(`/api/admin/courses/${course.id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        order_index: Number(form.order_index),
      }),
    });
    setEdit(false);
    reload();
  };

  return (
    <div className="card">
      <div className="spread" style={{ alignItems: "center" }}>
        {edit ? (
          <div className="row" style={{ flex: 1, gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span className="small muted">№:</span>
              <input
                type="number"
                min="1"
                value={form.order_index}
                onChange={e => setForm({ ...form, order_index: e.target.value })}
                style={{ width: 65 }}
              />
            </div>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                   placeholder="Название курса" style={{ flex: 1 }} />
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                   placeholder="Описание" style={{ flex: 2 }} />
            <button className="btn primary" onClick={saveEdit}>ОК</button>
            <button className="btn ghost" onClick={() => { setEdit(false); setForm({ title: course.title, description: course.description, order_index: curOrder }); }}>Отмена</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Order number badge with quick up/down arrows */}
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: "var(--navy)",
                    color: "#FFFFFF",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                  title="Порядковый номер курса"
                >
                  #{curOrder}
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => onSetOrder(course.id, curOrder - 1)}
                    style={{ padding: "0 4px", fontSize: 9, lineHeight: 1 }}
                    title="Поднять курс выше (уменьшить порядковый номер)"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => onSetOrder(course.id, curOrder + 1)}
                    style={{ padding: "0 4px", fontSize: 9, lineHeight: 1 }}
                    title="Опустить курс ниже (увеличить порядковый номер)"
                  >
                    ▼
                  </button>
                </div>
              </div>

              <div>
                <b style={{ fontSize: 16 }}>{course.title}</b>{" "}
                <span className="muted small">{course.description}</span>
              </div>
            </div>
            <div>
              <button className="btn small" onClick={() => setEdit(true)}>Изм.</button>{" "}
              <button className="btn danger small" onClick={onDelete}>Уд.</button>
            </div>
          </>
        )}
      </div>
      <Collapsible title="Темы курса" subtitle={`${course.themes?.length || 0}`} defaultOpen={false}>
        <ThemesList course={course} reload={reload} />
      </Collapsible>
      <Collapsible
        title="Дополнительные материалы курса"
        subtitle={`${course.extra_materials?.length || 0} (без тестов, с чатом)`}
        defaultOpen={false}
      >
        <ExtraMaterialsList course={course} courses={courses} groups={groups} reload={reload} />
      </Collapsible>
    </div>
  );
}

function ExtraMaterialsList({ course, courses = [], groups = [], reload }) {
  const [libraryMaterials, setLibraryMaterials] = useState([]);
  const [selectedLibId, setSelectedLibId] = useState("");
  const [isLinking, setIsLinking] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "video",
    url: "",
    order_index: (course.extra_materials?.length || 0) + 1,
    course_ids: [course.id],
    group_ids: [],
  });
  const [uploading, setUploading] = useState(false);
  const [chatMaterial, setChatMaterial] = useState(null);

  const loadLibrary = async () => {
    try {
      const all = await api("/api/admin/extra-materials");
      setLibraryMaterials(all);
    } catch {}
  };

  useEffect(() => {
    loadLibrary();
  }, [course]);

  // Materials in the library not yet linked to this course
  const availableToLink = libraryMaterials.filter((m) => {
    const cids = m.course_ids || (m.course_id ? [m.course_id] : []);
    return !cids.includes(course.id);
  });

  const handleLinkExisting = async () => {
    if (!selectedLibId) return;
    setIsLinking(true);
    try {
      await api(`/api/admin/courses/${course.id}/link-extra-material`, {
        method: "POST",
        body: JSON.stringify({ material_id: Number(selectedLibId) }),
      });
      setSelectedLibId("");
      reload();
      loadLibrary();
    } catch (err) {
      alert(err.message || "Ошибка привязки");
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async (id) => {
    if (!confirm("Отвязать этот материал от текущего курса? (Сам материал и привязки к другим курсам сохранятся)")) return;
    try {
      await api(`/api/admin/courses/${course.id}/unlink-extra-material`, {
        method: "POST",
        body: JSON.stringify({ material_id: id }),
      });
      reload();
      loadLibrary();
    } catch (err) {
      alert(err.message || "Ошибка отвязки");
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadFile(file);
      setForm((f) => ({ ...f, url: res.url }));
    } catch (err) {
      alert(err.message || "Ошибка загрузки файла");
    } finally {
      setUploading(false);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return alert("Введите название дополнительного материала");
    try {
      await api(`/api/admin/courses/${course.id}/extra-materials`, {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          type: form.type,
          url: form.url.trim(),
          order_index: +form.order_index,
          course_ids: form.course_ids.length ? form.course_ids : [course.id],
          group_ids: form.group_ids,
        }),
      });
      setForm({
        title: "",
        description: "",
        type: "video",
        url: "",
        order_index: (course.extra_materials?.length || 0) + 2,
        course_ids: [course.id],
        group_ids: [],
      });
      reload();
      loadLibrary();
    } catch (err) {
      alert(err.message || "Ошибка добавления");
    }
  };

  const del = async (id) => {
    if (!confirm("Удалить дополнительный материал полностью (из всех курсов) и историю его чата?")) return;
    try {
      await api(`/api/admin/extra-materials/${id}`, { method: "DELETE" });
      reload();
      loadLibrary();
    } catch (err) {
      alert(err.message);
    }
  };

  const upd = async (id, patch) => {
    try {
      await api(`/api/admin/extra-materials/${id}`, { method: "PUT", body: JSON.stringify(patch) });
      reload();
      loadLibrary();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div className="muted small" style={{ marginBottom: 8 }}>
        Список дополнительных материалов курса. В них <b>нет тестов</b>, и к каждому материалу прикреплён <b>отдельный чат обсуждения</b>, где участвуют ученики группы, кураторы и администраторы.
      </div>

      {/* Select Box to attach existing extra material to this course */}
      <div
        className="card"
        style={{
          marginBottom: 12,
          padding: "10px 12px",
          background: "var(--bg-card-alt, #f0f4f8)",
          border: "1px solid var(--border)",
        }}
      >
        <b className="small" style={{ display: "block", marginBottom: 6 }}>
          📎 Привязать материал из библиотеки к этому курсу:
        </b>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <select
            value={selectedLibId}
            onChange={(e) => setSelectedLibId(e.target.value)}
            style={{ flex: 1 }}
          >
            <option value="">-- Выберите дополнительный материал из списка для привязки --</option>
            {availableToLink.map((m) => (
              <option key={m.id} value={m.id}>
                #{m.id} [{m.type}] {m.title}
                {m.courses && m.courses.length > 0 ? ` (привязан к: ${m.courses.map((c) => c.title).join(", ")})` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn primary small"
            disabled={!selectedLibId || isLinking}
            onClick={handleLinkExisting}
          >
            {isLinking ? "Привязка..." : "Привязать к курсу"}
          </button>
        </div>
        {!availableToLink.length && (
          <div className="muted small" style={{ marginTop: 4 }}>
            {libraryMaterials.length === 0
              ? "В библиотеке пока нет материалов. Вы можете создать новый материал ниже или во вкладке «Материалы»."
              : "Все созданные материалы уже привязаны к этому курсу."}
          </div>
        )}
      </div>

      {(course.extra_materials || []).map((em) => (
        <ExtraMaterialRow
          key={em.id}
          material={em}
          currentCourseId={course.id}
          onDelete={() => del(em.id)}
          onUnlink={() => handleUnlink(em.id)}
          onUpdate={upd}
          onOpenChat={() => setChatMaterial(em)}
        />
      ))}

      {(!course.extra_materials || course.extra_materials.length === 0) && (
        <div className="muted small" style={{ padding: "8px 0" }}>
          К этому курсу пока не привязаны дополнительные материалы.
        </div>
      )}

      <form className="card" onSubmit={add} style={{ marginTop: 12, background: "var(--bg-card-alt, #f9fafb)" }}>
        <b className="small">Создать и сразу привязать новый материал:</b>
        <div className="row" style={{ marginTop: 8, gap: 8 }}>
          <input
            placeholder="Название материала *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            style={{ flex: 2 }}
          />
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            style={{ width: 140 }}
          >
            <option value="video">🎬 Видео</option>
            <option value="document">📄 Документ</option>
            <option value="note">📝 Заметка / текст</option>
            <option value="audio">🎧 Аудио</option>
            <option value="image">🖼 Рисунок</option>
          </select>
          <input
            type="number"
            placeholder="Порядок"
            value={form.order_index}
            onChange={(e) => setForm({ ...form, order_index: e.target.value })}
            style={{ width: 80 }}
          />
        </div>

        <div className="row" style={{ marginTop: 8, gap: 8 }}>
          <input
            placeholder="Ссылка на материал (URL) или текст конспекта"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            style={{ flex: 1 }}
          />
          <label className="btn small ghost" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
            {uploading ? "Загрузка..." : "📎 Загрузить файл"}
            <input type="file" onChange={onFile} style={{ display: "none" }} disabled={uploading} />
          </label>
        </div>

        <div style={{ marginTop: 8 }}>
          <input
            placeholder="Краткое описание / пояснение к материалу (опционально)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={{ width: "100%" }}
          />
        </div>

        {/* Optional cross-course assignment */}
        {courses.length > 1 && (
          <div style={{ marginTop: 10 }}>
            <div className="small muted" style={{ marginBottom: 4 }}>
              Также прикрепить к другим курсам:
            </div>
            <div className="chips" style={{ margin: 0 }}>
              {courses.map((c) => (
                <label key={c.id} className="chip" style={{ cursor: "pointer", fontSize: 11 }}>
                  <input
                    type="checkbox"
                    checked={form.course_ids.includes(c.id)}
                    onChange={() =>
                      setForm((prev) => ({
                        ...prev,
                        course_ids: prev.course_ids.includes(c.id)
                          ? prev.course_ids.filter((id) => id !== c.id)
                          : [...prev.course_ids, c.id],
                      }))
                    }
                  />
                  {c.title}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="spread" style={{ marginTop: 10, alignItems: "center" }}>
          <span className="tag ok">Без тестов · С чатом обсуждения</span>
          <button className="btn primary">Создать и привязать</button>
        </div>
      </form>

      {chatMaterial && (
        <div className="modal-back" onClick={() => setChatMaterial(null)}>
          <div className="card modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="spread" style={{ alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <h3 style={{ margin: 0 }}>💬 Чат обсуждения материала</h3>
                <div className="muted small">
                  «{chatMaterial.title}» · Участвуют ученики группы, кураторы и администраторы
                </div>
              </div>
              <button className="btn ghost" onClick={() => setChatMaterial(null)}>✕</button>
            </div>
            <ChatPanel extraMaterialId={chatMaterial.id} apiBase="/api/staff" />
          </div>
        </div>
      )}
    </div>
  );
}

function ExtraMaterialRow({ material, currentCourseId, onDelete, onUnlink, onUpdate, onOpenChat }) {
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(material.title);
  const [description, setDescription] = useState(material.description || "");
  const [type, setType] = useState(material.type || "note");
  const [url, setUrl] = useState(material.url || "");
  const [order, setOrder] = useState(material.order_index);

  const save = () => {
    onUpdate(material.id, {
      title,
      description,
      type,
      url,
      order_index: +order,
    });
    setEdit(false);
  };

  const getIcon = (t) => {
    if (t === "video") return "🎬";
    if (t === "document") return "📄";
    if (t === "audio") return "🎧";
    if (t === "image") return "🖼";
    return "📝";
  };

  const otherCourses = (material.courses || []).filter((c) => c.id !== currentCourseId);

  return (
    <div className="card inner-card" style={{ marginBottom: 8 }}>
      {edit ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название" style={{ flex: 2 }} />
            <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 140 }}>
              <option value="video">🎬 Видео</option>
              <option value="document">📄 Документ</option>
              <option value="note">📝 Заметка / текст</option>
              <option value="audio">🎧 Аудио</option>
              <option value="image">🖼 Рисунок</option>
            </select>
            <input type="number" value={order} onChange={(e) => setOrder(e.target.value)} style={{ width: 70 }} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL / файл / текст" style={{ flex: 1 }} />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Описание" style={{ flex: 1 }} />
          </div>
          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button className="btn primary small" onClick={save}>Сохранить</button>
            <button className="btn ghost small" onClick={() => setEdit(false)}>Отмена</button>
          </div>
        </div>
      ) : (
        <div className="spread" style={{ alignItems: "center" }}>
          <div>
            <b>{order}. {getIcon(material.type)} {material.title}</b>{" "}
            <span className="tag ok" style={{ marginLeft: 6, fontSize: "0.75rem" }}>Без тестов</span>
            {otherCourses.length > 0 && (
              <span className="tag" style={{ marginLeft: 6, fontSize: "0.75rem" }}>
                Также в: {otherCourses.map((c) => c.title).join(", ")}
              </span>
            )}
            {material.description && (
              <div className="muted small" style={{ marginTop: 2 }}>{material.description}</div>
            )}
            {material.url && (
              <div className="small" style={{ marginTop: 2 }}>
                {material.url.startsWith("http") || material.url.startsWith("/uploads") ? (
                  <a href={material.url} target="_blank" rel="noreferrer" className="muted">
                    🔗 {material.url}
                  </a>
                ) : (
                  <span className="muted">📝 {material.url.slice(0, 70)}{material.url.length > 70 ? "..." : ""}</span>
                )}
              </div>
            )}
          </div>
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <button className="btn small primary" onClick={onOpenChat}>
              💬 Чат
            </button>
            <button className="btn small" onClick={() => setEdit(true)}>Изм.</button>
            {onUnlink && (
              <button className="btn small ghost" onClick={onUnlink} title="Отвязать от этого курса">
                Отвязать
              </button>
            )}
            <button className="btn danger small" onClick={onDelete} title="Удалить полностью">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThemesList({ course, reload }) {
  const [form, setForm] = useState({ title: "", order_index: course.themes.length + 1 });
  const [showImportThemeModal, setShowImportThemeModal] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    await api("/api/admin/themes", {
      method: "POST",
      body: JSON.stringify({ course_id: course.id, title: form.title, order_index: +form.order_index }),
    });
    setForm({ title: "", order_index: course.themes.length + 2 });
    reload();
  };
  const del = async (id) => {
    if (!confirm("Удалить тему с материалами и тестом?")) return;
    await api("/api/admin/themes/" + id, { method: "DELETE" });
    reload();
  };
  const upd = async (id, patch) => {
    await api("/api/admin/themes/" + id, { method: "PUT", body: JSON.stringify(patch) });
    reload();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, padding: "8px 12px", background: "var(--bg-soft)", borderRadius: 8, flexWrap: "wrap", gap: 8 }}>
        <span className="small muted">
          Темы и уроки курса «<b>{course.title}</b>» ({course.themes?.length || 0}):
        </span>
        <button
          type="button"
          className="btn primary small"
          onClick={() => setShowImportThemeModal(true)}
          style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <span>📥</span> Выбрать готовую тему из накопителя материалов
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {course.themes.map(t => (
          <ThemeRow
            key={t.id}
            theme={t}
            course={course}
            onDelete={() => del(t.id)}
            onUpdate={upd}
            reload={reload}
          />
        ))}
      </div>

      <form className="row" onSubmit={add} style={{ marginTop: 10, gap: 8 }}>
        <input placeholder="Либо создать новую тему вручную..." value={form.title}
               onChange={e => setForm({ ...form, title: e.target.value })} required style={{ flex: 1 }} />
        <input type="number" placeholder="Порядок" value={form.order_index}
               onChange={e => setForm({ ...form, order_index: e.target.value })} style={{ width: 85 }} />
        <button className="btn ghost">➕ Создать тему</button>
      </form>

      <RepositoryPickerModal
        open={showImportThemeModal}
        onClose={() => setShowImportThemeModal(false)}
        mode="theme"
        courseId={course.id}
        courseTitle={course.title}
        apiPrefix="/api/admin"
        onSuccess={reload}
      />
    </div>
  );
}

function ThemeRow({ theme, course, onDelete, onUpdate, reload }) {
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(theme.title);
  const [order, setOrder] = useState(theme.order_index);
  const [expanded, setExpanded] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [loadingMats, setLoadingMats] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const loadMats = async () => {
    setLoadingMats(true);
    try {
      const data = await api(`/api/admin/themes/${theme.id}/materials`);
      setMaterials(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMats(false);
    }
  };

  useEffect(() => {
    if (expanded) loadMats();
  }, [expanded, theme.id]);

  const delMat = async (matId) => {
    if (!confirm("Удалить этот урок из темы курса?")) return;
    await api(`/api/admin/materials/${matId}`, { method: "DELETE" });
    loadMats();
    reload();
  };

  return (
    <div className="card inner-card" style={{ padding: "10px 14px", margin: 0, border: "1px solid var(--border)" }}>
      <div className="spread" style={{ alignItems: "center" }}>
        {edit ? (
          <div className="row" style={{ flex: 1, gap: 8 }}>
            <input value={title} onChange={e => setTitle(e.target.value)} style={{ flex: 1 }} />
            <input type="number" value={order} onChange={e => setOrder(e.target.value)} style={{ width: 80 }} />
            <button className="btn primary small" onClick={() => { onUpdate(theme.id, { title, order_index: +order }); setEdit(false); }}>ОК</button>
            <button className="btn ghost small" onClick={() => setEdit(false)}>Отмена</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setExpanded(!expanded)}
                style={{ padding: "2px 8px", fontSize: 12 }}
                title={expanded ? "Свернуть уроки" : "Развернуть уроки"}
              >
                {expanded ? "▼" : "▶"}
              </button>
              <b style={{ fontSize: 15, color: "var(--navy)" }}>
                Тема {theme.order_index}. {theme.title}
              </b>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setShowPicker(true)}
                style={{ fontSize: 12, color: "var(--navy)", fontWeight: 600 }}
              >
                📎 Прикрепить урок из накопителя
              </button>
              <button className="btn small" onClick={() => setEdit(true)}>Изм.</button>{" "}
              <button className="btn danger small" onClick={onDelete}>✕</button>
            </div>
          </>
        )}
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          {loadingMats ? (
            <div className="small muted">Загрузка уроков темы...</div>
          ) : materials.length === 0 ? (
            <div className="small muted spread" style={{ alignItems: "center" }}>
              <span>В этой теме пока нет прикрепленных уроков.</span>
              <button
                type="button"
                className="btn primary small"
                onClick={() => setShowPicker(true)}
                style={{ fontSize: 12 }}
              >
                📎 Прикрепить урок из накопителя
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="spread" style={{ alignItems: "center", marginBottom: 4 }}>
                <span className="small muted">Уроки темы ({materials.length}):</span>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => setShowPicker(true)}
                  style={{ fontSize: 12, color: "var(--navy)", fontWeight: 600 }}
                >
                  ➕ Прикрепить ещё урок
                </button>
              </div>

              {materials.map((m, idx) => (
                <div
                  key={m.id}
                  className="spread"
                  style={{
                    padding: "6px 10px",
                    background: "var(--bg)",
                    borderRadius: 6,
                    alignItems: "center",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: "var(--navy)" }}>
                      #{m.order_index || idx + 1}
                    </span>
                    <span className="tag" style={{ fontSize: 11, padding: "2px 6px" }}>
                      {m.type === "video" ? "🎬 Видео" : m.type === "note" ? "📝 Конспект" : m.type === "document" ? "📄 Документ" : m.type === "audio" ? "🎧 Аудио" : m.type === "image" ? "🖼 Рисунок" : "📎 Файл"}
                    </span>
                    <b style={{ fontSize: 13 }}>{m.title}</b>
                    {m.description && <span className="small muted">· {m.description}</span>}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {m.url && (
                      <a href={m.url} target="_blank" rel="noreferrer" className="btn ghost small" style={{ fontSize: 11, textDecoration: "none", padding: "2px 6px" }}>
                        ↗ Открыть
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn danger small"
                      onClick={() => delMat(m.id)}
                      style={{ padding: "2px 6px", fontSize: 11 }}
                      title="Удалить из темы курса"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {course && (
        <RepositoryPickerModal
          open={showPicker}
          onClose={() => setShowPicker(false)}
          mode="material"
          courseId={course.id}
          courseTitle={course.title}
          themeId={theme.id}
          themeTitle={theme.title}
          apiPrefix="/api/admin"
          onSuccess={() => {
            loadMats();
            reload();
          }}
        />
      )}
    </div>
  );
}

/* ---------- GROUPS ---------- */
function GroupsTab({ courses, users, reload }) {
  const teachers = users.filter(u => u.role === "teacher");
  const students = users.filter(u => u.role === "student");
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [groups, setGroups] = useState([]);
  const [newName, setNewName] = useState("");

  const load = () => courseId && api(`/api/admin/groups/${courseId}`).then(setGroups);
  useEffect(() => { load(); }, [courseId]);
  useEffect(() => { if (!courseId && courses[0]) setCourseId(courses[0].id); }, [courses, courseId]);

  const addGroup = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await api("/api/admin/groups", {
      method: "POST", body: JSON.stringify({ course_id: +courseId, name: newName.trim() }),
    });
    setNewName(""); load(); reload();
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

      {groups.map(g => (
        <GroupCard key={g.id} group={g} teachers={teachers} students={students}
                   reload={() => { load(); reload(); }} />
      ))}
      {!groups.length && <div className="card muted">В этом курсе пока нет групп</div>}
    </div>
  );
}

function GroupCard({ group, teachers, students, reload }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(group.name);
  const [teacherId, setTeacherId] = useState("");
  const [studentId, setStudentId] = useState("");

  const saveName = async () => {
    await api(`/api/admin/groups/${group.id}`, { method: "PUT", body: JSON.stringify({ name }) });
    setEdit(false); reload();
  };
  const del = async () => {
    if (!confirm("Удалить группу?")) return;
    await api(`/api/admin/groups/${group.id}`, { method: "DELETE" });
    reload();
  };
  const addTeacher = async () => {
    if (!teacherId) return;
    await api(`/api/admin/groups/${group.id}/teachers`, {
      method: "POST", body: JSON.stringify({ teacher_id: +teacherId }),
    });
    setTeacherId(""); reload();
  };
  const removeTeacher = async (tid) => {
    await api(`/api/admin/groups/${group.id}/teachers/${tid}`, { method: "DELETE" });
    reload();
  };
  const addStudent = async () => {
    if (!studentId) return;
    await api(`/api/admin/groups/${group.id}/students`, {
      method: "POST", body: JSON.stringify({ user_id: +studentId }),
    });
    setStudentId(""); reload();
  };
  const removeStudent = async (uid) => {
    await api(`/api/admin/groups/${group.id}/students/${uid}`, { method: "DELETE" });
    reload();
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
            {t.name}<button onClick={() => removeTeacher(t.id)}>✕</button>
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
            {s.name}<button onClick={() => removeStudent(s.id)}>✕</button>
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
const MAT_TYPES = [
  { v: "video", l: "Видео" },
  { v: "audio", l: "Аудио" },
  { v: "image", l: "Рисунок" },
  { v: "document", l: "Документ / конспект" },
  { v: "note", l: "Текстовая заметка" },
];

function MaterialsTab({ courses, groups = [] }) {
  const [subMode, setSubMode] = useState("repository"); // "repository" | "extra" | "themes"
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [themeId, setThemeId] = useState("");
  const [materials, setMaterials] = useState([]);
  const [form, setForm] = useState({ title: "", type: "video", url: "", order_index: 0 });
  const [uploading, setUploading] = useState(false);

  const currentCourse = courses.find(c => c.id === +courseId);
  const themes = currentCourse?.themes || [];

  useEffect(() => { if (!courseId && courses[0]) setCourseId(courses[0].id); }, [courses, courseId]);
  useEffect(() => {
    if (!themes.length) { setThemeId(""); return; }
    if (!themes.find(t => t.id === +themeId)) setThemeId(themes[0].id);
  }, [courseId, courses]);

  const reload = async () => {
    if (!themeId) {
      setMaterials([]);
      return;
    }
    const data = await api(`/api/admin/themes/${themeId}/materials`);
    setMaterials(data);
  };

  useEffect(() => {
    reload();
  }, [themeId]);

  const add = async (e) => {
    e.preventDefault();
    await api("/api/admin/materials", {
      method: "POST",
      body: JSON.stringify({ ...form, theme_id: +themeId, order_index: +form.order_index }),
    });
    setForm({ title: "", type: "video", url: "", order_index: 0 });
    reload();
  };
  const onUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try {
      const rec = await uploadFile(file);
      const t = file.type.startsWith("audio") ? "audio"
              : file.type.startsWith("image") ? "image" : "video";
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
            📁 Накопитель материалов и тем (Видео, Конспекты, Тексты, Документы, Аудио, Рисунки)
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
                           onChange={e => setForm({ ...form, url: e.target.value })} required style={{ flex: 1 }} />
                    <label className="btn">
                      {uploading ? "Загрузка..." : "Загрузить файл"}
                      <input type="file" hidden onChange={onUpload} />
                    </label>
                  </div>
                )}
                <button className="btn primary" style={{ marginTop: 6 }}>Добавить материал</button>
              </form>

              <div className="list">
                {materials.map(m => (
                  <MaterialRow key={m.id} material={m} reload={reload} />
                ))}
                {!materials.length && <div className="muted">Материалов в этой теме пока нет</div>}
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
    await api(`/api/admin/materials/${material.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...form, order_index: +form.order_index }),
    });
    setEdit(false); reload();
  };
  const del = async () => {
    if (!confirm("Удалить материал?")) return;
    await api("/api/admin/materials/" + material.id, { method: "DELETE" });
    reload();
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
          <button className="btn danger small" onClick={del}>✕</button>
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

/* ---------- TESTS ---------- */
function TestsTab({ courses }) {
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [themeId, setThemeId] = useState("");
  const [test, setTest] = useState(null);

  const currentCourse = courses.find(c => c.id === +courseId);
  const themes = currentCourse?.themes || [];

  useEffect(() => { if (!courseId && courses[0]) setCourseId(courses[0].id); }, [courses, courseId]);
  useEffect(() => {
    if (!themes.length) { setThemeId(""); return; }
    if (!themes.find(t => t.id === +themeId)) setThemeId(themes[0].id);
  }, [courseId, courses]);

  const load = async () => {
    if (!themeId) { setTest(null); return; }
    setTest(await api(`/api/admin/themes/${themeId}/test`));
  };
  useEffect(() => { load(); }, [themeId]);

  return (
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

      {!themes.length && <div className="card muted">Сначала добавьте темы</div>}

      {themeId && !test && (
        <CreateTestForm themeId={+themeId}
                        onCreate={async (payload) => {
                          try { await api("/api/admin/tests", { method: "POST", body: JSON.stringify(payload) }); load(); }
                          catch (e) { alert(e.message); }
                        }} />
      )}

      {test && <TestCard test={test} reload={load} />}
    </div>
  );
}

function CreateTestForm({ themeId, onCreate }) {
  const [title, setTitle] = useState("");
  const [pass, setPass] = useState(70);
  const [maxA, setMaxA] = useState(0);
  return (
    <form className="card row"
          onSubmit={(e) => {
            e.preventDefault();
            onCreate({ theme_id: themeId, title, passing_score: +pass, max_attempts: +maxA });
          }}>
      <input placeholder="Название теста" value={title}
             onChange={e => setTitle(e.target.value)} required style={{ flex: 1 }} />
      <input type="number" title="Проходной %" value={pass}
             onChange={e => setPass(e.target.value)} style={{ width: 110 }} />
      <input type="number" title="Макс. попыток (0 = ∞)" value={maxA}
             onChange={e => setMaxA(e.target.value)} style={{ width: 130 }} />
      <button className="btn primary">Создать тест</button>
    </form>
  );
}

function TestCard({ test, reload }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({
    title: test.title, passing_score: test.passing_score, max_attempts: test.max_attempts,
  });

  const saveEdit = async () => {
    await api(`/api/admin/tests/${test.id}`, { method: "PUT", body: JSON.stringify(form) });
    setEdit(false); reload();
  };
  const del = async () => {
    if (!confirm("Удалить тест со всеми вопросами?")) return;
    await api("/api/admin/tests/" + test.id, { method: "DELETE" });
    reload();
  };
  const delQ = async (id) => {
    await api("/api/admin/questions/" + id, { method: "DELETE" });
    reload();
  };
  const updQ = async (id, patch) => {
    await api(`/api/admin/questions/${id}`, { method: "PUT", body: JSON.stringify(patch) });
    reload();
  };
  const addQ = async (payload) => {
    try {
      await api("/api/admin/questions", { method: "POST", body: JSON.stringify({ test_id: test.id, ...payload }) });
      reload();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="card">
      <div className="spread">
        {edit ? (
          <div className="row" style={{ flex: 1 }}>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                   style={{ flex: 1 }} />
            <input type="number" value={form.passing_score}
                   onChange={e => setForm({ ...form, passing_score: +e.target.value })}
                   style={{ width: 100 }} />
            <input type="number" value={form.max_attempts}
                   onChange={e => setForm({ ...form, max_attempts: +e.target.value })}
                   style={{ width: 130 }} title="Макс. попыток (0 = ∞)" />
            <button className="btn primary" onClick={saveEdit}>ОК</button>
            <button className="btn ghost" onClick={() => setEdit(false)}>Отмена</button>
          </div>
        ) : (
          <>
            <b>Тест: {test.title}</b>
            <div className="muted small">
              проходной {test.passing_score}% · попыток: {test.max_attempts || "∞"}
            </div>
            <div>
              <button className="btn small" onClick={() => setEdit(true)}>Изм.</button>{" "}
              <button className="btn danger small" onClick={del}>Удалить</button>
            </div>
          </>
        )}
      </div>

      <div className="list" style={{ marginTop: 10 }}>
        {test.questions.map((q, i) => <QuestionRow key={q.id} idx={i} q={q}
                                                    onDelete={() => delQ(q.id)} onUpdate={updQ} />)}
      </div>
      <NewQuestionForm testId={test.id} onSubmit={addQ} />
    </div>
  );
}

function QuestionRow({ idx, q, onDelete, onUpdate }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(q.text);
  const [answers, setAnswers] = useState(q.answers.map(a => ({ text: a.text, is_correct: a.is_correct })));

  const save = async () => {
    if (answers.length < 2) return alert("Минимум 2 варианта ответа");
    if (answers.filter(a => a.is_correct).length < 1) return alert("Выберите хотя бы один правильный ответ");
    if (answers.some(a => !a.text.trim())) return alert("Заполните текст всех вариантов ответа");
    await onUpdate(q.id, { text, answers });
    setEdit(false);
  };

  const addAnswerOption = () => {
    if (answers.length >= 8) return alert("Максимум 8 вариантов ответа");
    setAnswers([...answers, { text: "", is_correct: false }]);
  };

  const removeAnswerOption = (indexToRemove) => {
    if (answers.length <= 2) return alert("Минимум 2 варианта ответа");
    const filtered = answers.filter((_, i) => i !== indexToRemove);
    if (!filtered.some(a => a.is_correct) && filtered.length > 0) {
      filtered[0].is_correct = true;
    }
    setAnswers(filtered);
  };

  if (!edit) {
    return (
      <div className="q">
        <div className="spread">
          <b>{idx + 1}. {q.text}</b>
          <div>
            <span className="badge" style={{ marginRight: 8, background: "#f1f5f9", color: "#475569" }}>
              {q.answers.length} вар.
            </span>
            <button className="btn small" onClick={() => setEdit(true)}>Изм.</button>{" "}
            <button className="btn danger small" onClick={onDelete}>✕</button>
          </div>
        </div>
        <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
          {q.answers.map(a => (
            <li key={a.id} style={{ color: a.is_correct ? "#15803d" : "inherit", fontWeight: a.is_correct ? 600 : 400 }}>
              {a.is_correct ? "✅" : "▫️"} {a.text}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="q" style={{ background: "#f8fafc", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1" }}>
      <label className="small muted">Текст вопроса:</label>
      <input value={text} onChange={e => setText(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span className="small muted">Варианты ответа (отметьте правильный):</span>
        <button type="button" className="btn small" onClick={addAnswerOption} disabled={answers.length >= 8}>
          + Добавить вариант
        </button>
      </div>

      {answers.map((a, i) => (
        <div className="row" key={i} style={{ marginTop: 4, alignItems: "center" }}>
          <label className="radio" title="Отметить как правильный">
            <input
              type="radio"
              name={"edit-ok-" + q.id}
              checked={a.is_correct}
              onChange={() => setAnswers(answers.map((x, j) => ({ ...x, is_correct: i === j })))}
            />
          </label>
          <input
            style={{ flex: 1 }}
            value={a.text}
            placeholder={`Вариант ${i + 1}`}
            onChange={e => {
              const copy = [...answers];
              copy[i] = { ...copy[i], text: e.target.value };
              setAnswers(copy);
            }}
          />
          {answers.length > 2 && (
            <button
              type="button"
              className="btn danger small"
              onClick={() => removeAnswerOption(i)}
              title="Удалить этот вариант"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <div className="row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
        <button className="btn ghost" onClick={() => setEdit(false)}>Отмена</button>
        <button className="btn primary" onClick={save}>Сохранить</button>
      </div>
    </div>
  );
}

function NewQuestionForm({ testId, onSubmit }) {
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState(["", ""]);
  const [correct, setCorrect] = useState(0);

  const applyPreset = (presetType) => {
    if (presetType === "yes_no") {
      setAnswers(["Да", "Нет"]);
      setCorrect(0);
    } else if (presetType === "true_false") {
      setAnswers(["Верно", "Неверно"]);
      setCorrect(0);
    } else if (presetType === "two_custom") {
      setAnswers(["", ""]);
      setCorrect(0);
    } else if (presetType === "four_standard") {
      setAnswers(["", "", "", ""]);
      setCorrect(0);
    }
  };

  const addOption = () => {
    if (answers.length >= 8) return;
    setAnswers([...answers, ""]);
  };

  const removeOption = (idxToRemove) => {
    if (answers.length <= 2) return;
    const next = answers.filter((_, i) => i !== idxToRemove);
    if (correct >= next.length) setCorrect(0);
    setAnswers(next);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return alert("Введите текст вопроса");
    if (answers.length < 2) return alert("Минимум 2 варианта ответа");
    if (answers.some(a => !a.trim())) return alert("Заполните текст всех вариантов ответа");
    onSubmit({
      text: text.trim(),
      answers: answers.map((a, i) => ({ text: a.trim(), is_correct: i === correct })),
    });
    setText("");
    setAnswers(["", ""]);
    setCorrect(0);
  };

  return (
    <form className="card qform" onSubmit={submit} style={{ marginTop: 14 }}>
      <div className="spread" style={{ alignItems: "center" }}>
        <b>Добавить вопрос к тесту</b>
        <span className="small muted">Вариантов ответа: {answers.length}</span>
      </div>

      {/* Preset Quick Buttons for 2 options and 4 options */}
      <div className="row" style={{ gap: 6, margin: "8px 0 10px", flexWrap: "wrap" }}>
        <span className="small muted" style={{ alignSelf: "center", marginRight: 4 }}>Быстрый выбор:</span>
        <button
          type="button"
          className="btn small"
          onClick={() => applyPreset("yes_no")}
          title="Вопрос с 2 вариантами: Да / Нет"
          style={{ background: "#f0fdf4", borderColor: "#86efac", color: "#166534" }}
        >
          ⚡ 2 варианта: Да / Нет
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => applyPreset("true_false")}
          title="Вопрос с 2 вариантами: Верно / Неверно"
          style={{ background: "#f0fdf4", borderColor: "#86efac", color: "#166534" }}
        >
          ⚡ 2 варианта: Верно / Неверно
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => applyPreset("two_custom")}
          title="2 произвольных варианта"
          style={{ background: "#eff6ff", borderColor: "#93c5fd", color: "#1e40af" }}
        >
          2 варианта (пустые)
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => applyPreset("four_standard")}
          title="4 стандартных варианта"
        >
          4 варианта (стандарт)
        </button>
      </div>

      <input
        placeholder="Текст вопроса *"
        value={text}
        onChange={e => setText(e.target.value)}
        style={{ width: "100%", marginTop: 2, fontSize: 15 }}
        required
      />

      <div style={{ marginTop: 10 }}>
        <div className="small muted" style={{ marginBottom: 4 }}>
          Отметьте радиокнопку слева от правильного ответа:
        </div>
        {answers.map((a, i) => (
          <div className="row" key={i} style={{ marginTop: 4, alignItems: "center" }}>
            <label className="radio" title="Отметить этот вариант как правильный">
              <input
                type="radio"
                name={"new-ok-" + testId}
                checked={correct === i}
                onChange={() => setCorrect(i)}
              />
            </label>
            <input
              style={{ flex: 1 }}
              placeholder={"Вариант " + (i + 1) + (correct === i ? " (Правильный ✅)" : "")}
              value={a}
              onChange={e => {
                const c = [...answers];
                c[i] = e.target.value;
                setAnswers(c);
              }}
              required
            />
            {answers.length > 2 && (
              <button
                type="button"
                className="btn danger small"
                onClick={() => removeOption(i)}
                title="Удалить вариант"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="spread" style={{ marginTop: 12, alignItems: "center" }}>
        <button
          type="button"
          className="btn small"
          onClick={addOption}
          disabled={answers.length >= 8}
        >
          + Добавить вариант ответа
        </button>
        <button className="btn primary">Сохранить вопрос</button>
      </div>
    </form>
  );
}

/* ---------- UPLOADS ---------- */
function UploadsTab() {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = () => api("/api/admin/uploads").then(setFiles);
  useEffect(() => { load(); }, []);

  const onUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setBusy(true);
    try { await uploadFile(file); await load(); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); e.target.value = ""; }
  };
  const del = async (id) => {
    if (!confirm("Удалить файл?")) return;
    await api("/api/admin/uploads/" + id, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <div className="card row">
        <label className="btn">
          {busy ? "Загрузка..." : "Загрузить файл"}
          <input type="file" hidden onChange={onUpload} />
        </label>
      </div>
      <table className="table">
        <thead><tr><th>Файл</th><th>Тип</th><th>Размер</th><th>URL</th><th></th></tr></thead>
        <tbody>
          {files.map(f => (
            <tr key={f.id}>
              <td>{f.original_name}</td>
              <td>{f.mimetype}</td>
              <td>{Math.round((f.size || 0) / 1024)} КБ</td>
              <td><a href={"/uploads/" + f.filename} target="_blank" rel="noreferrer">открыть</a></td>
              <td><button className="btn danger small" onClick={() => del(f.id)}>Удалить</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
    api("/api/auth/me").then(me => setCreds(c => ({ ...c, username: me.username })));
  };

  useEffect(() => {
    loadSettings();
  }, []);

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
          <a
            href="/api/admin/backup"
            download
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
            }}
          >
            📥 Скачать резервную копию (JSON)
          </a>
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

/* ---------- PHONE INVITES ---------- */
function InvitesTab() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ phone: "", role: "student", note: "" });
  const [busy, setBusy] = useState(false);

  const load = () => api("/api/admin/invites").then(setList);
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!form.phone.trim()) return alert("Введите номер телефона");
    setBusy(true);
    try {
      await api("/api/admin/invites", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ phone: "", role: "student", note: "" });
      load();
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  const del = async (id) => {
    if (!confirm("Удалить приглашение?")) return;
    await api("/api/admin/invites/" + id, { method: "DELETE" });
    load();
  };

  const roleLabel = (r) =>
    r === "manager" ? "Методист"
    : r === "teacher" ? "Куратор"
    : "Ученик";

  return (
    <div>
      <div className="card">
        <h3>Приглашения по номеру телефона</h3>
        <div className="muted small">
          Внесите номер телефона и предполагаемую роль. После этого человек сможет
          зарегистрироваться сам на странице «Регистрация», указав ФИО, телефон и пароль.
        </div>
        <form className="row" onSubmit={add} style={{ marginTop: 12 }}>
          <input placeholder="Номер телефона (например, +79261234567)"
                 value={form.phone}
                 onChange={e => setForm({ ...form, phone: e.target.value })}
                 style={{ flex: 1 }} />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="student">Ученик</option>
            <option value="teacher">Куратор</option>
            <option value="manager">Методист</option>
          </select>
          <input placeholder="Комментарий (кто это)"
                 value={form.note}
                 onChange={e => setForm({ ...form, note: e.target.value })}
                 style={{ flex: 1 }} />
          <button className="btn primary" disabled={busy}>
            {busy ? "..." : "Добавить приглашение"}
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Ожидают регистрации ({list.length})</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Телефон</th>
              <th>Роль</th>
              <th>Комментарий</th>
              <th>Добавлено</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map(inv => (
              <tr key={inv.id}>
                <td><b>{inv.phone}</b></td>
                <td>{roleLabel(inv.role)}</td>
                <td className="muted small">{inv.note || "—"}</td>
                <td className="muted small">
                  {new Date(inv.created_at).toLocaleString("ru-RU")}
                </td>
                <td>
                  <button className="btn danger small" onClick={() => del(inv.id)}>
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={5} className="muted">
                  Приглашений пока нет. Добавьте первое выше.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
