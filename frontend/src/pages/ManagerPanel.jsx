import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import SearchSelect from "../components/SearchSelect";
import { api, uploadFile } from "../api";
import AnnouncementsPanel from "../components/AnnouncementsPanel";
import StaffChatsPanel from "../components/StaffChatsPanel";

const TABS = [
  { id: "students",      label: "Ученики" },
  { id: "materials",     label: "Материалы" },
  { id: "announcements", label: "Объявления" },
  { id: "chats",         label: "Чаты" },
  { id: "uploads",       label: "Файлы" },
];

const MAT_TYPES = [
  { v: "video", l: "Видео" },
  { v: "audio", l: "Аудио" },
  { v: "image", l: "Рисунок" },
  { v: "document", l: "Документ / конспект" },
  { v: "note", l: "Текстовая заметка" },
];

export default function ManagerPanel() {
  const [tab, setTab] = useState("students");
  const [courses, setCourses] = useState([]);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [key, setKey] = useState(0);
  const reload = () => setKey(k => k + 1);

  useEffect(() => {
    api("/api/manager/courses").then(setCourses).catch(() => {});
    api("/api/manager/groups").then(setGroups).catch(() => {});
    api("/api/manager/users").then(setUsers).catch(() => {});
  }, [key]);

  return (
    <Layout title="Панель методиста" tabs={TABS} active={tab} onChange={setTab}>
      {tab === "students"      && <StudentsTab groups={groups} users={users} reload={reload} />}
      {tab === "materials"     && <MaterialsTab courses={courses} />}
      {tab === "announcements" && <AnnouncementsPanel />}
      {tab === "chats"         && <StaffChatsPanel />}
      {tab === "uploads"       && <UploadsTab />}
    </Layout>
  );
}

function StudentsTab({ groups, users, reload }) {
  const students = users.filter(u => u.role === "student");
  const [form, setForm] = useState({ name: "", username: "", password: "", group_ids: [] });

  const save = async (e) => {
    e.preventDefault();
    if (!form.group_ids.length) return alert("Выберите хотя бы одну группу");
    try {
      await api("/api/manager/students", {
        method: "POST", body: JSON.stringify(form),
      });
      setForm({ name: "", username: "", password: "", group_ids: [] });
      reload();
      alert("Ученик создан");
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

  return (
    <div>
      <div className="card">
        <h3>Создать ученика</h3>
        <div className="row">
          <input placeholder="ФИО" value={form.name}
                 onChange={e => setForm({ ...form, name: e.target.value })} style={{ flex: 1 }} />
          <input placeholder="Логин" value={form.username}
                 onChange={e => setForm({ ...form, username: e.target.value })} style={{ flex: 1 }} />
          <input placeholder="Пароль" value={form.password}
                 onChange={e => setForm({ ...form, password: e.target.value })} style={{ flex: 1 }} />
        </div>
        <div className="section-title">Группы и кураторы</div>
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
        <button className="btn primary" onClick={save} style={{ marginTop: 10 }}>
          Создать ученика
        </button>
      </div>

      <div className="card">
        <h3>Ученики</h3>
        <table className="table">
          <thead><tr><th>ФИО</th><th>Логин</th></tr></thead>
          <tbody>
            {students.map(s => (
              <tr key={s.id}><td>{s.name}</td><td>{s.username}</td></tr>
            ))}
            {!students.length && <tr><td colSpan={2} className="muted">Учеников пока нет</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MaterialsTab({ courses }) {
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [themeId, setThemeId] = useState("");
  const [materials, setMaterials] = useState([]);
  const [form, setForm] = useState({ title: "", type: "video", url: "", order_index: 0 });
  const [uploading, setUploading] = useState(false);

  const current = courses.find(c => c.id === +courseId);
  const themes = current?.themes || [];

  useEffect(() => { if (!courseId && courses[0]) setCourseId(courses[0].id); }, [courses, courseId]);
  useEffect(() => {
    if (!themes.length) { setThemeId(""); return; }
    if (!themes.find(t => t.id === +themeId)) setThemeId(themes[0].id);
  }, [courseId, courses]);

  const reload = async () => {
    if (!themeId) { setMaterials([]); return; }
    setMaterials(await api(`/api/manager/themes/${themeId}/materials`));
  };
  useEffect(() => { reload(); }, [themeId]);

  const add = async (e) => {
    e.preventDefault();
    await api("/api/manager/materials", {
      method: "POST",
      body: JSON.stringify({ ...form, theme_id: +themeId, order_index: +form.order_index }),
    });
    setForm({ title: "", type: "video", url: "", order_index: 0 });
    reload();
  };
  const del = async (id) => {
    if (!confirm("Удалить материал?")) return;
    await api("/api/manager/materials/" + id, { method: "DELETE" });
    reload();
  };
  const onUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try {
      const rec = await uploadFile(file, "/api/manager/uploads");
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

      {!themes.length && <div className="card muted">У этого курса пока нет тем</div>}

      {themeId && (
        <>
          <form className="card" onSubmit={add}>
            <div className="row">
              <input placeholder="Название" value={form.title}
                     onChange={e => setForm({ ...form, title: e.target.value })} required style={{ flex: 1 }} />
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {MAT_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
              <input type="number" value={form.order_index}
                     onChange={e => setForm({ ...form, order_index: e.target.value })} style={{ width: 90 }} />
            </div>
            {form.type === "note" ? (
              <textarea value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
                        rows={3} style={{ width: "100%" }} placeholder="Текст заметки" />
            ) : (
              <div className="row">
                <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
                       placeholder="URL или загрузите файл →" required style={{ flex: 1 }} />
                <label className="btn">
                  {uploading ? "Загрузка..." : "Загрузить файл"}
                  <input type="file" hidden onChange={onUpload} />
                </label>
              </div>
            )}
            <button className="btn primary" style={{ marginTop: 8 }}>Добавить</button>
          </form>

          <div className="list">
            {materials.map(m => (
              <div className="card spread" key={m.id}>
                <div>
                  <b>#{m.order_index} [{m.type}] {m.title}</b>
                  <div className="muted small">
                    {m.type === "note" ? m.url.slice(0, 100) + "…" :
                      <a href={m.url} target="_blank" rel="noreferrer">{m.url}</a>}
                  </div>
                </div>
                <button className="btn danger small" onClick={() => del(m.id)}>✕</button>
              </div>
            ))}
            {!materials.length && <div className="muted">Материалов пока нет</div>}
          </div>
        </>
      )}
    </div>
  );
}

function UploadsTab() {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = () => api("/api/manager/uploads").then(setFiles);
  useEffect(() => { load(); }, []);

  const onUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setBusy(true);
    try { await uploadFile(file, "/api/manager/uploads"); await load(); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); e.target.value = ""; }
  };
  const del = async (id) => {
    if (!confirm("Удалить файл?")) return;
    await api("/api/manager/uploads/" + id, { method: "DELETE" });
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
        <thead><tr><th>Файл</th><th>Размер</th><th>URL</th><th></th></tr></thead>
        <tbody>
          {files.map(f => (
            <tr key={f.id}>
              <td>{f.original_name}</td>
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
