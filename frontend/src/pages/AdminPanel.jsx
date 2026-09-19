import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import SearchSelect from "../components/SearchSelect";
import Collapsible from "../components/Collapsible";
import AnnouncementsPanel from "../components/AnnouncementsPanel";
import StaffChatsPanel from "../components/StaffChatsPanel";
import { api, uploadFile } from "../api";

const TABS = [
  { id: "users",         label: "Пользователи" },
  { id: "messages",      label: "Сообщения" },
  { id: "invites",       label: "Приглашения" },
  { id: "courses",       label: "Курсы и темы" },
  { id: "groups",        label: "Группы" },
  { id: "materials",     label: "Материалы" },
  { id: "tests",         label: "Тесты" },
  { id: "announcements", label: "Объявления" },
  { id: "chats",         label: "Чаты" },
  { id: "uploads",       label: "Файлы" },
  { id: "settings",      label: "Настройки" },
];

export default function AdminPanel() {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [key, setKey] = useState(0);
  const reload = () => setKey(k => k + 1);

  useEffect(() => {
    api("/api/admin/users").then(setUsers).catch(() => {});
    api("/api/admin/courses").then(setCourses).catch(() => {});
  }, [key]);

  return (
    <Layout title="Панель администратора" tabs={TABS} active={tab} onChange={setTab}>
      {tab === "users"     && <UsersTab users={users} reload={reload} />}
      {tab === "messages"      && <DirectMessages />}
      {tab === "invites"   && <InvitesTab />}
      {tab === "courses"   && <CoursesTab courses={courses} reload={reload} />}
      {tab === "groups"    && <GroupsTab courses={courses} users={users} reload={reload} />}
      {tab === "materials" && <MaterialsTab courses={courses} />}
      {tab === "tests"         && <TestsTab courses={courses} />}
      {tab === "announcements" && <AnnouncementsPanel />}
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
function CoursesTab({ courses, reload }) {
  const [form, setForm] = useState({ title: "", description: "" });

  const add = async (e) => {
    e.preventDefault();
    await api("/api/admin/courses", { method: "POST", body: JSON.stringify(form) });
    setForm({ title: "", description: "" });
    reload();
  };
  const del = async (id) => {
    if (!confirm("Удалить курс со всем содержимым?")) return;
    await api("/api/admin/courses/" + id, { method: "DELETE" });
    reload();
  };

  return (
    <div>
      <form className="card row" onSubmit={add}>
        <input placeholder="Название курса" value={form.title}
               onChange={e => setForm({ ...form, title: e.target.value })} required style={{ flex: 1 }} />
        <input placeholder="Описание" value={form.description}
               onChange={e => setForm({ ...form, description: e.target.value })} style={{ flex: 1 }} />
        <button className="btn primary">Создать</button>
      </form>
      {courses.map(c => <CourseCard key={c.id} course={c} reload={reload} onDelete={() => del(c.id)} />)}
    </div>
  );
}

function CourseCard({ course, reload, onDelete }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ title: course.title, description: course.description });

  const saveEdit = async () => {
    await api(`/api/admin/courses/${course.id}`, { method: "PUT", body: JSON.stringify(form) });
    setEdit(false); reload();
  };

  return (
    <div className="card">
      <div className="spread">
        {edit ? (
          <div className="row" style={{ flex: 1 }}>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                   style={{ flex: 1 }} />
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                   style={{ flex: 2 }} />
            <button className="btn primary" onClick={saveEdit}>ОК</button>
            <button className="btn ghost" onClick={() => { setEdit(false); setForm({ title: course.title, description: course.description }); }}>Отмена</button>
          </div>
        ) : (
          <>
            <div><b>#{course.id} {course.title}</b> <span className="muted small">{course.description}</span></div>
            <div>
              <button className="btn small" onClick={() => setEdit(true)}>Изм.</button>{" "}
              <button className="btn danger small" onClick={onDelete}>Уд.</button>
            </div>
          </>
        )}
      </div>
      <Collapsible title="Темы курса" subtitle={`${course.themes.length}`} defaultOpen={false}>
        <ThemesList course={course} reload={reload} />
      </Collapsible>
    </div>
  );
}

function ThemesList({ course, reload }) {
  const [form, setForm] = useState({ title: "", order_index: course.themes.length + 1 });

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
      {course.themes.map(t => <ThemeRow key={t.id} theme={t} onDelete={() => del(t.id)} onUpdate={upd} />)}
      <form className="row" onSubmit={add} style={{ marginTop: 8 }}>
        <input placeholder="Название темы" value={form.title}
               onChange={e => setForm({ ...form, title: e.target.value })} required style={{ flex: 1 }} />
        <input type="number" placeholder="Порядок" value={form.order_index}
               onChange={e => setForm({ ...form, order_index: e.target.value })} style={{ width: 90 }} />
        <button className="btn primary">Добавить тему</button>
      </form>
    </div>
  );
}

function ThemeRow({ theme, onDelete, onUpdate }) {
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(theme.title);
  const [order, setOrder] = useState(theme.order_index);

  return (
    <div className="card inner-card spread">
      {edit ? (
        <>
          <input value={title} onChange={e => setTitle(e.target.value)} style={{ flex: 1 }} />
          <input type="number" value={order} onChange={e => setOrder(e.target.value)} style={{ width: 80 }} />
          <button className="btn primary" onClick={() => { onUpdate(theme.id, { title, order_index: +order }); setEdit(false); }}>ОК</button>
          <button className="btn ghost" onClick={() => setEdit(false)}>Отмена</button>
        </>
      ) : (
        <>
          <b>Тема {theme.order_index}. {theme.title}</b>
          <div>
            <button className="btn small" onClick={() => setEdit(true)}>Изм.</button>{" "}
            <button className="btn danger small" onClick={onDelete}>✕</button>
          </div>
        </>
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

      <div className="section-title">Преподаватели</div>
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
          <option value="">— преподаватель —</option>
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

function MaterialsTab({ courses }) {
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
            {!materials.length && <div className="muted">Материалов пока нет</div>}
          </div>
        </>
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
    if (answers.filter(a => a.is_correct).length !== 1) return alert("Ровно один правильный");
    if (answers.some(a => !a.text.trim())) return alert("Заполните все ответы");
    await onUpdate(q.id, { text, answers });
    setEdit(false);
  };

  if (!edit) {
    return (
      <div className="q">
        <div className="spread">
          <b>{idx + 1}. {q.text}</b>
          <div>
            <button className="btn small" onClick={() => setEdit(true)}>Изм.</button>{" "}
            <button className="btn danger small" onClick={onDelete}>✕</button>
          </div>
        </div>
        <ul>
          {q.answers.map(a => <li key={a.id}>{a.is_correct ? "✅" : "▫️"} {a.text}</li>)}
        </ul>
      </div>
    );
  }
  return (
    <div className="q">
      <input value={text} onChange={e => setText(e.target.value)} style={{ width: "100%" }} />
      {answers.map((a, i) => (
        <div className="row" key={i} style={{ marginTop: 4 }}>
          <label className="radio">
            <input type="radio" name={"edit-ok-" + q.id} checked={a.is_correct}
                   onChange={() => setAnswers(answers.map((x, j) => ({ ...x, is_correct: i === j })))} />
          </label>
          <input style={{ flex: 1 }} value={a.text}
                 onChange={e => {
                   const copy = [...answers]; copy[i] = { ...copy[i], text: e.target.value }; setAnswers(copy);
                 }} />
        </div>
      ))}
      <div className="row" style={{ marginTop: 6, justifyContent: "flex-end" }}>
        <button className="btn ghost" onClick={() => setEdit(false)}>Отмена</button>
        <button className="btn primary" onClick={save}>Сохранить</button>
      </div>
    </div>
  );
}

function NewQuestionForm({ testId, onSubmit }) {
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);

  const submit = (e) => {
    e.preventDefault();
    if (!text || answers.some(a => !a.trim())) return alert("Заполните всё");
    onSubmit({ text, answers: answers.map((a, i) => ({ text: a, is_correct: i === correct })) });
    setText(""); setAnswers(["", "", "", ""]); setCorrect(0);
  };

  return (
    <form className="card qform" onSubmit={submit} style={{ marginTop: 10 }}>
      <b>Добавить вопрос</b>
      <input placeholder="Текст вопроса" value={text} onChange={e => setText(e.target.value)}
             style={{ width: "100%", marginTop: 6 }} />
      {answers.map((a, i) => (
        <div className="row" key={i} style={{ marginTop: 4 }}>
          <label className="radio">
            <input type="radio" name={"ok-" + testId} checked={correct === i} onChange={() => setCorrect(i)} />
          </label>
          <input style={{ flex: 1 }} placeholder={"Ответ " + (i + 1)} value={a}
                 onChange={e => { const c = [...answers]; c[i] = e.target.value; setAnswers(c); }} />
        </div>
      ))}
      <button className="btn primary" style={{ marginTop: 6 }}>Добавить вопрос</button>
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
  const [creds, setCreds] = useState({ username: "", password: "", old_password: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api("/api/admin/settings/roles").then(r => setNames({
      admin: r.role_admin_name || "",
      teacher: r.role_teacher_name || "",
      student: r.role_student_name || "",
      manager: r.role_manager_name || "",
    }));
    api("/api/auth/me").then(me => setCreds(c => ({ ...c, username: me.username })));
  }, []);

  const saveRoles = async () => {
    setSaving(true);
    try {
      await api("/api/admin/settings/roles", {
        method: "PUT",
        body: JSON.stringify({
          admin: names.admin,
          teacher: names.teacher,
          student: names.student,
          manager: names.manager,
        }),
      });
      alert("Названия ролей сохранены");
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
    <div>
      <div className="card">
        <h3>Названия ролей</h3>
        <div className="muted small">
          Внутренние значения (admin/teacher/student) не меняются — только отображение.
        </div>
        <div style={{ marginTop: 12 }}>
          <label>Администратор</label>
          <input value={names.admin} onChange={e => setNames({ ...names, admin: e.target.value })}
                 style={{ width: "100%" }} />
        </div>
        <div style={{ marginTop: 8 }}>
          <label>Методист</label>
          <input value={names.manager || ""}
         onChange={e => setNames({ ...names, manager: e.target.value })}
         style={{ width: "100%" }} />
        </div>
        <div style={{ marginTop: 8 }}>
          <label>Куратор</label>
          <input value={names.teacher} onChange={e => setNames({ ...names, teacher: e.target.value })}
                 style={{ width: "100%" }} />
        </div>
        <div style={{ marginTop: 8 }}>
          <label>Ученик</label>
          <input value={names.student} onChange={e => setNames({ ...names, student: e.target.value })}
                 style={{ width: "100%" }} />
        </div>
        <button className="btn primary" disabled={saving} onClick={saveRoles}
                style={{ marginTop: 12 }}>
          {saving ? "Сохранение..." : "Сохранить названия"}
        </button>
      </div>

      <div className="card">
        <h3>Учётные данные администратора</h3>
        <div style={{ marginTop: 8 }}>
          <label>Логин</label>
          <input value={creds.username} onChange={e => setCreds({ ...creds, username: e.target.value })}
                 style={{ width: "100%" }} />
        </div>
        <div style={{ marginTop: 8 }}>
          <label>Новый пароль (оставьте пустым, если не хотите менять)</label>
          <input type="password" value={creds.password}
                 onChange={e => setCreds({ ...creds, password: e.target.value })}
                 style={{ width: "100%" }} />
        </div>
        <div style={{ marginTop: 8 }}>
          <label>Текущий пароль (обязательно)</label>
          <input type="password" value={creds.old_password}
                 onChange={e => setCreds({ ...creds, old_password: e.target.value })}
                 style={{ width: "100%" }} />
        </div>
        <button className="btn primary" onClick={saveCreds} style={{ marginTop: 12 }}>
          Обновить данные администратора
        </button>
      </div>
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
