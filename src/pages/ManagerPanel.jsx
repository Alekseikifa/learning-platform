import InvitesTab from "../components/InvitesTab";
import DirectMessages from "../components/DirectMessages";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import SearchSelect from "../components/SearchSelect";
import { api, uploadFile } from "../api";
import AnnouncementsPanel from "../components/AnnouncementsPanel";
import StaffChatsPanel from "../components/StaffChatsPanel";
import ChatPanel from "../components/ChatPanel";
import ExtraMaterialsTabContent from "../components/ExtraMaterialsTabContent";
import UnifiedMaterialsRepository from "../components/UnifiedMaterialsRepository";
import CoursesTab from "../components/CoursesTab";
import TestsTab from "../components/TestsTab";
import Modal from "../components/Modal";
import PasswordModal from "../components/PasswordModal";
import UploadsTab from "../components/UploadsTab";
import { MAT_TYPES } from "../lib/constants";

const TABS = [
  { id: "invites",       label: "Приглашения" },
  { id: "students",      label: "Ученики" },
  { id: "courses",       label: "Курсы и темы" },
  { id: "tests",         label: "Тесты" },
  { id: "materials",     label: "Материалы" },
  { id: "messages",      label: "Сообщения" },
  { id: "announcements", label: "Объявления" },
  { id: "chats",         label: "Чаты" },
  { id: "uploads",       label: "Файлы" },
];

export default function ManagerPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTabState] = useState(() => {
    const t = searchParams.get("tab");
    return TABS.some((x) => x.id === t) ? t : "invites";
  });
  const [courses, setCourses] = useState([]);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [dataErr, setDataErr] = useState(null);
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
    const t = searchParams.get("tab");
    if (t && TABS.some((x) => x.id === t)) setTabState(t);
  }, [searchParams.toString()]);

  useEffect(() => {
    setDataErr(null);
    api("/api/manager/courses").then(setCourses).catch((e) => setDataErr(`курсы: ${e.message}`));
    api("/api/manager/groups").then(setGroups).catch((e) => setDataErr(`группы: ${e.message}`));
    api("/api/manager/users").then(setUsers).catch((e) => setDataErr(`пользователи: ${e.message}`));
  }, [key]);

  return (
    <Layout title="Панель методиста" tabs={TABS} active={tab} onChange={changeTab}>
      {dataErr && (
        <div className="card" style={{ color: "#dc2626" }}>
          Не удалось загрузить данные панели ({dataErr}) — попробуйте обновить страницу
        </div>
      )}
      {tab === "students"      && <StudentsTab groups={groups} users={users} reload={reload} />}
        {tab === "invites"       && <InvitesTab />}
      {tab === "courses"       && <CoursesTab courses={courses} groups={groups} reload={reload} apiPrefix="/api/manager" />}
      {tab === "tests"         && <TestsTab courses={courses} apiPrefix="/api/manager" />}
      {tab === "materials"     && <MaterialsTab courses={courses} groups={groups} />}
      {tab === "messages"      && <DirectMessages />}
      {tab === "announcements" && <AnnouncementsPanel initialGroups={groups} />}
      {tab === "chats"         && <StaffChatsPanel />}
        {tab === "uploads"       && <UploadsTab apiPrefix="/api/manager" />}
    </Layout>
  );
}

function StudentsTab({ groups, users, reload }) {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ name: "", username: "", password: "", group_ids: [] });
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);

  const [loadErr, setLoadErr] = useState(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () =>
    api("/api/manager/students")
      .then(setList)
      .catch((e) => setLoadErr(e.message))
      .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    if (!form.group_ids.length) return alert("Выберите хотя бы одну группу");
    try {
      await api("/api/manager/students", {
        method: "POST", body: JSON.stringify(form),
      });
      setForm({ name: "", username: "", password: "", group_ids: [] });
      load();
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

  const addToGroup = async (userId, groupId) => {
    if (!groupId) return;
    try {
      await api(`/api/manager/students/${userId}/groups/${groupId}`, { method: "POST" });
      load();
    } catch (e) { alert(e.message); }
  };
  const removeFromGroup = async (userId, groupId) => {
    try {
      await api(`/api/manager/students/${userId}/groups/${groupId}`, { method: "DELETE" });
      load();
    } catch (e) { alert(e.message); }
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
        <h3>Ученики ({list.length})</h3>
        {loadErr && (
          <div style={{ color: "#dc2626" }}>Не удалось загрузить учеников: {loadErr}</div>
        )}
        <div className="row" style={{ alignItems: "center", gap: 8, marginBottom: 8 }}>
          <label>Поиск:</label>
          <input placeholder="ФИО, логин или группа…" value={q}
                 onChange={e => setQ(e.target.value)} style={{ flex: 1 }} />
        </div>
        <div className="table-wrap"><table className="table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Логин</th>
              <th>Группы</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const needle = q.trim().toLowerCase();
              const rows = needle
                ? list.filter(s =>
                    `${s.name} ${s.username} ${(s.groups || []).map(g => `${g.course} ${g.name}`).join(" ")}`
                      .toLowerCase().includes(needle))
                : list;
              if (!rows.length) {
                return (
                  <tr>
                    <td colSpan={4} className="muted">
                      {loading
                        ? "Загрузка учеников…"
                        : loadErr
                          ? "Список не загрузился — попробуйте обновить страницу"
                          : needle
                            ? "Никого не найдено по запросу «" + q + "»"
                            : "Учеников пока нет"}
                    </td>
                  </tr>
                );
              }
              return rows.map(s => (
              <tr key={s.id}>
                <td><b>{s.name}</b></td>
                <td>{s.username}</td>
                <td>
                  <div className="chips" style={{ margin: 0 }}>
                    {s.groups.map(g => (
                      <span key={g.id} className="chip">
                        {g.course} · {g.name}
                        <button onClick={() => removeFromGroup(s.id, g.id)} aria-label="Убрать из группы">✕</button>
                      </span>
                    ))}
                    {!s.groups.length && <span className="muted small">—</span>}
                  </div>
                  <div className="row" style={{ marginTop: 6 }}>
                    <select defaultValue=""
                            onChange={e => { addToGroup(s.id, e.target.value); e.target.value = ""; }}>
                      <option value="">+ в группу…</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>
                          {g.course_title} · {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
                <td>
                  <button className="btn small" onClick={() => setEditing(s)}>Изм.</button>{" "}
                  <button className="btn small"
                          onClick={() => setResetting({ id: s.id, name: s.name })}>
                    Пароль
                  </button>
                </td>
              </tr>
              ));
            })()}
          </tbody>
        </table></div>
      </div>

      {editing && (
        <UserEditModal user={editing} onClose={() => setEditing(null)}
                       onSaved={() => { setEditing(null); load(); }} />
      )}
      {resetting && (
        <PasswordModal name={resetting.name}
                       onClose={() => setResetting(null)}
                       onSubmit={async (pw) => {
                         try {
                           await api(`/api/manager/students/${resetting.id}/password`, {
                             method: "PUT",
                             body: JSON.stringify({ password: pw }),
                           });
                           alert("Пароль изменён");
                           setResetting(null);
                         } catch (e) { alert(e.message); }
                       }} />
      )}
    </div>
  );
}

function MaterialsTab({ courses, groups = [] }) {
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [mode, setMode] = useState("repository"); // "repository" | "extra" | "themes"
  const [themeId, setThemeId] = useState("");
  const [materials, setMaterials] = useState([]);
  const [materialsErr, setMaterialsErr] = useState(null);
  const [form, setForm] = useState({ title: "", type: "video", url: "", order_index: 0, description: "" });
  const [uploading, setUploading] = useState(false);
  const fetchSeq = useRef(0);

  const current = courses.find(c => c.id === +courseId);
  const themes = current?.themes || [];

  useEffect(() => { if (!courseId && courses[0]) setCourseId(courses[0].id); }, [courses, courseId]);
  useEffect(() => {
    if (!themes.length) { setThemeId(""); return; }
    if (!themes.find(t => t.id === +themeId)) setThemeId(themes[0].id);
  }, [courseId, courses]);

  const reloadThemeMaterials = async () => {
    const seq = ++fetchSeq.current; // защита от гонки при быстрой смене темы
    if (!themeId) { setMaterials([]); setMaterialsErr(null); return; }
    try {
      const res = await api(`/api/manager/themes/${themeId}/materials`);
      if (seq === fetchSeq.current) { setMaterials(res); setMaterialsErr(null); }
    } catch (e) {
      if (seq === fetchSeq.current) { setMaterials([]); setMaterialsErr(e.message); }
    }
  };
  useEffect(() => { reloadThemeMaterials(); }, [themeId]);

  const addThemeMaterial = async (e) => {
    e.preventDefault();
    try {
      await api("/api/manager/materials", {
        method: "POST",
        body: JSON.stringify({ ...form, theme_id: +themeId, order_index: +form.order_index }),
      });
      setForm({ title: "", type: "video", url: "", order_index: 0, description: "" });
      reloadThemeMaterials();
    } catch (err) { alert(err.message); }
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
          <button
            type="button"
            className={"btn " + (mode === "themes" ? "primary" : "ghost")}
            onClick={() => setMode("themes")}
          >
            📚 Материалы тем курса ({themes.length} тем)
          </button>
        </div>
      </div>

      {mode === "repository" && (
        <UnifiedMaterialsRepository courses={courses} apiPrefix="/api/manager" />
      )}

      {mode === "extra" && (
        <ExtraMaterialsTabContent courses={courses} groups={groups} apiPrefix="/api/manager" />
      )}

      {mode === "themes" && (
        <div>
          <div className="card row" style={{ alignItems: "center", gap: 12 }}>
            <div className="row" style={{ alignItems: "center", gap: 6 }}>
              <label>Курс:</label>
              <select value={courseId} onChange={e => setCourseId(e.target.value)}>
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div className="row" style={{ alignItems: "center", gap: 6 }}>
              <label>Тема:</label>
              <select value={themeId} onChange={e => setThemeId(e.target.value)}>
                {themes.map(t => <option key={t.id} value={t.id}>Тема {t.order_index}. {t.title}</option>)}
              </select>
            </div>
          </div>

          {!themes.length && (
            <div className="card muted">У этого курса пока нет тем</div>
          )}

          {themeId && (
            <>
              <form className="card" onSubmit={addThemeMaterial}>
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
                            rows={3} style={{ width: "100%" }} required />
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
                <button className="btn primary" style={{ marginTop: 6 }}>Добавить материал темы</button>
              </form>

              <div className="list">
                {materialsErr && (
                  <div style={{ color: "#dc2626" }}>
                    Не удалось загрузить материалы: {materialsErr}
                  </div>
                )}
                {materials.map(m => (
                  <ManagerMaterialRow key={m.id} material={m} reload={reloadThemeMaterials} />
                ))}
                {!materials.length && !materialsErr && <div className="muted">Материалов темы пока нет</div>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ManagerMaterialRow({ material, reload }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({
    title: material.title, type: material.type,
    url: material.url, order_index: material.order_index,
  });
  const [uploading, setUploading] = useState(false);

  const save = async () => {
    try {
      await api(`/api/manager/materials/${material.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...form, order_index: +form.order_index }),
      });
      setEdit(false);
      reload();
    } catch (e) { alert(e.message); }
  };
  const del = async () => {
    if (!confirm("Удалить материал?")) return;
    try {
      await api("/api/manager/materials/" + material.id, { method: "DELETE" });
      reload();
    } catch (e) { alert(e.message); }
  };
  const onUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try {
      const rec = await uploadFile(file, "/api/manager/uploads");
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

/* ---------- Модалка редактирования ученика ---------- */
function UserEditModal({ user, onClose, onSaved }) {
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);

  const save = async () => {
    try {
      await api(`/api/manager/students/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ name, username }),
      });
      onSaved();
    } catch (e) { alert(e.message); }
  };

  return (
    <Modal onClose={onClose} innerStyle={{ maxWidth: 420 }}>
      <h3>Редактирование ученика</h3>
      <label>ФИО</label>
      <input value={name} onChange={e => setName(e.target.value)} style={{ width: "100%" }} />
      <label style={{ marginTop: 8, display: "block" }}>Логин</label>
      <input value={username} onChange={e => setUsername(e.target.value)} style={{ width: "100%" }} />
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
        <button className="btn ghost" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={save}>Сохранить</button>
      </div>
    </Modal>
  );
}

/* ---------- Модалка смены пароля ---------- */