import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import SearchSelect from "../components/SearchSelect";
import { api, uploadFile } from "../api";

const TABS = [
  { id: "users",     label: "Пользователи" },
  { id: "courses",   label: "Курсы и темы" },
  { id: "materials", label: "Материалы" },
  { id: "tests",     label: "Тесты" },
  { id: "enroll",    label: "Зачисления" },
  { id: "uploads",   label: "Файлы" },
  { id: "settings",  label: "Настройки" },
];

export default function AdminPanel() {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    api("/api/admin/users").then(setUsers).catch(() => {});
    api("/api/admin/courses").then(setCourses).catch(() => {});
  }, [refreshKey]);

  return (
    <Layout title="Панель администратора" tabs={TABS} active={tab} onChange={setTab}>
      {tab === "users"     && <UsersTab users={users} reload={reload} />}
      {tab === "courses"   && <CoursesTab courses={courses} users={users} reload={reload} />}
      {tab === "materials" && <MaterialsTab courses={courses} />}
      {tab === "tests"     && <TestsTab courses={courses} />}
      {tab === "enroll"    && <EnrollTab users={users} courses={courses} />}
      {tab === "uploads"   && <UploadsTab />}
      {tab === "settings"  && <SettingsTab />}
    </Layout>
  );
}

/* ------------ USERS ------------ */
function UsersTab({ users, reload }) {
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "student" });
  const [reset, setReset] = useState(null); // { id, name }

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
  const doReset = async (pw) => {
    try {
      await api(`/api/admin/users/${reset.id}/password`, {
        method: "PUT", body: JSON.stringify({ password: pw }),
      });
      alert("Пароль изменён");
      setReset(null);
    } catch (e) { alert(e.message); }
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
          <option value="teacher">Учитель</option>
        </select>
        <button className="btn primary">Добавить</button>
      </form>
      <table className="table">
        <thead><tr><th>ID</th><th>ФИО</th><th>Логин</th><th>Роль</th><th></th></tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.id}</td><td>{u.name}</td><td>{u.username}</td><td>{u.role}</td>
              <td>
                <button className="btn small"
                        onClick={() => setReset({ id: u.id, name: u.name })}>
                  Сменить пароль
                </button>{" "}
                <button className="btn danger small" onClick={() => del(u.id)}>Удалить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {reset && (
        <PasswordModal name={reset.name}
                       onClose={() => setReset(null)}
                       onSubmit={doReset} />
      )}
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
               onChange={e => setPw(e.target.value)} autoFocus
               style={{ width: "100%", marginTop: 10 }} />
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn ghost" onClick={onClose}>Отмена</button>
          <button className="btn primary" disabled={!pw}
                  onClick={() => onSubmit(pw)}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}

/* ------------ COURSES + THEMES ------------ */
function CoursesTab({ courses, users, reload }) {
  const [form, setForm] = useState({ title: "", description: "" });
  const teachers = users.filter(u => u.role === "teacher");

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
  const assign = async (courseId, teacherId) => {
    if (!teacherId) return;
    await api(`/api/admin/courses/${courseId}/teachers`, {
      method: "POST", body: JSON.stringify({ teacher_id: +teacherId }),
    });
    reload();
  };
  const unassign = async (courseId, teacherId) => {
    await api(`/api/admin/courses/${courseId}/teachers/${teacherId}`, { method: "DELETE" });
    reload();
  };

  return (
    <div>
      <form className="card row" onSubmit={add}>
        <input placeholder="Название курса (например, «Python: 1 год»)" value={form.title}
               onChange={e => setForm({ ...form, title: e.target.value })} required style={{ flex: 1 }} />
        <input placeholder="Описание" value={form.description}
               onChange={e => setForm({ ...form, description: e.target.value })} style={{ flex: 1 }} />
        <button className="btn primary">Создать курс</button>
      </form>

      {courses.map(c => (
        <div className="card" key={c.id}>
          <div className="spread">
            <b>#{c.id} {c.title}</b>
            <button className="btn danger small" onClick={() => del(c.id)}>Удалить курс</button>
          </div>
          <div className="muted small">{c.description}</div>

          {/* Преподаватели */}
          <div className="section-title">Преподаватели</div>
          <div className="chips">
            {c.teachers.map(t => (
              <span key={t.id} className="chip">
                {t.name}
                <button onClick={() => unassign(c.id, t.id)}>✕</button>
              </span>
            ))}
            {!c.teachers.length && <span className="muted small">нет</span>}
          </div>
          <div className="row">
            <select id={"sel-" + c.id} defaultValue="">
              <option value="">— назначить преподавателя —</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button className="btn" onClick={() => {
              const v = document.getElementById("sel-" + c.id).value;
              assign(c.id, v);
            }}>Назначить</button>
          </div>

          {/* Темы */}
          <div className="section-title">Темы курса</div>
          <ThemesList course={c} reload={reload} />
        </div>
      ))}
    </div>
  );
}

function ThemesList({ course, reload }) {
  const [form, setForm] = useState({ title: "", order_index: (course.themes.length + 1) });

  const add = async (e) => {
    e.preventDefault();
    await api("/api/admin/themes", {
      method: "POST",
      body: JSON.stringify({ course_id: course.id, title: form.title,
                             order_index: +form.order_index }),
    });
    setForm({ title: "", order_index: course.themes.length + 2 });
    reload();
  };
  const del = async (id) => {
    if (!confirm("Удалить тему вместе с материалами и тестом?")) return;
    await api("/api/admin/themes/" + id, { method: "DELETE" });
    reload();
  };

  return (
    <div>
      {course.themes.map(t => (
        <div className="card" key={t.id} style={{ background: "#f9fafb", marginBottom: 8 }}>
          <div className="spread">
            <div><b>Тема {t.order_index}. {t.title}</b></div>
            <button className="btn danger small" onClick={() => del(t.id)}>✕</button>
          </div>
        </div>
      ))}
      <form className="row" onSubmit={add}>
        <input placeholder="Название темы" value={form.title}
               onChange={e => setForm({ ...form, title: e.target.value })} required
               style={{ flex: 1 }} />
        <input type="number" placeholder="Порядок" value={form.order_index}
               onChange={e => setForm({ ...form, order_index: e.target.value })}
               style={{ width: 90 }} />
        <button className="btn primary">Добавить тему</button>
      </form>
    </div>
  );
}

/* ------------ MATERIALS (по темам) ------------ */
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

  useEffect(() => {
    if (!themeId) { setMaterials([]); return; }
    api(`/api/admin/themes/${themeId}/materials`).then(setMaterials);
  }, [themeId]);

  const reload = async () => setMaterials(await api(`/api/admin/themes/${themeId}/materials`));

  const add = async (e) => {
    e.preventDefault();
    await api("/api/admin/materials", {
      method: "POST",
      body: JSON.stringify({ ...form, theme_id: +themeId, order_index: +form.order_index }),
    });
    setForm({ title: "", type: "video", url: "", order_index: 0 });
    reload();
  };

  const del = async (id) => {
    if (!confirm("Удалить материал?")) return;
    await api("/api/admin/materials/" + id, { method: "DELETE" });
    reload();
  };

  const onUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try {
      const rec = await uploadFile(file);
      setForm(f => ({ ...f, url: "/uploads/" + rec.filename,
                      type: file.type.startsWith("audio") ? "audio" : "video" }));
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
          {themes.map(t => <option key={t.id} value={t.id}>
            Тема {t.order_index}. {t.title}
          </option>)}
        </select>
      </div>

      {!themes.length && <div className="card muted">Сначала добавьте темы на вкладке «Курсы и темы»</div>}

      {themeId && (
        <>
          <form className="card" onSubmit={add}>
            <div className="row">
              <input placeholder="Название материала" value={form.title}
                     onChange={e => setForm({ ...form, title: e.target.value })} required
                     style={{ flex: 1 }} />
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="video">Видео</option>
                <option value="audio">Аудио</option>
              </select>
              <input type="number" placeholder="Порядок" value={form.order_index}
                     onChange={e => setForm({ ...form, order_index: e.target.value })}
                     style={{ width: 100 }} />
            </div>
            <div className="row">
              <input placeholder="URL или загрузите файл →" value={form.url}
                     onChange={e => setForm({ ...form, url: e.target.value })} required
                     style={{ flex: 1 }} />
              <label className="btn">
                {uploading ? "Загрузка..." : "Загрузить файл"}
                <input type="file" hidden accept="video/*,audio/*" onChange={onUpload} />
              </label>
              <button className="btn primary">Добавить</button>
            </div>
          </form>

          <div className="list">
            {materials.map(m => (
              <div className="card spread" key={m.id}>
                <div>
                  <b>#{m.order_index} [{m.type}] {m.title}</b>
                  <div className="muted small">
                    <a href={m.url} target="_blank" rel="noreferrer">{m.url}</a>
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

/* ------------ TESTS (по темам) ------------ */
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

  const createTest = async (payload) => {
    try {
      await api("/api/admin/tests", { method: "POST", body: JSON.stringify(payload) });
      load();
    } catch (e) { alert(e.message); }
  };
  const delTest = async () => {
    if (!confirm("Удалить тест?")) return;
    await api("/api/admin/tests/" + test.id, { method: "DELETE" });
    load();
  };
  const addQuestion = async (payload) => {
    try {
      await api("/api/admin/questions", {
        method: "POST", body: JSON.stringify({ test_id: test.id, ...payload }),
      });
      load();
    } catch (e) { alert(e.message); }
  };
  const delQuestion = async (id) => {
    await api("/api/admin/questions/" + id, { method: "DELETE" });
    load();
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
          {themes.map(t => <option key={t.id} value={t.id}>
            Тема {t.order_index}. {t.title}
          </option>)}
        </select>
      </div>

      {!themes.length && <div className="card muted">Сначала добавьте темы</div>}

      {themeId && !test && (
        <CreateTestForm themeId={+themeId} onCreate={createTest} />
      )}

      {test && (
        <div className="card">
          <div className="spread">
            <b>Тест: {test.title}</b>
            <div>
              <span className="muted small">проходной {test.passing_score}%</span>
              <button className="btn danger small" style={{ marginLeft: 8 }}
                      onClick={delTest}>Удалить тест</button>
            </div>
          </div>

          <div className="list" style={{ marginTop: 10 }}>
            {test.questions.map(q => (
              <div className="q" key={q.id}>
                <div className="spread">
                  <b>{q.text}</b>
                  <button className="btn danger small" onClick={() => delQuestion(q.id)}>✕</button>
                </div>
                <ul>
                  {q.answers.map(a => (
                    <li key={a.id}>{a.is_correct ? "✅" : "▫️"} {a.text}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <NewQuestionForm testId={test.id} onSubmit={addQuestion} />
        </div>
      )}
    </div>
  );
}

function CreateTestForm({ themeId, onCreate }) {
  const [title, setTitle] = useState("");
  const [pass, setPass] = useState(70);
  return (
    <form className="card row"
          onSubmit={(e) => {
            e.preventDefault();
            onCreate({ theme_id: themeId, title, passing_score: +pass });
          }}>
      <input placeholder="Название теста" value={title}
             onChange={e => setTitle(e.target.value)} required style={{ flex: 1 }} />
      <input type="number" value={pass}
             onChange={e => setPass(e.target.value)} style={{ width: 120 }} />
      <button className="btn primary">Создать тест</button>
    </form>
  );
}

function NewQuestionForm({ testId, onSubmit }) {
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);

  const submit = (e) => {
    e.preventDefault();
    if (!text || answers.some(a => !a.trim())) return alert("Заполните вопрос и все 4 ответа");
    onSubmit({
      text,
      answers: answers.map((a, i) => ({ text: a, is_correct: i === correct })),
    });
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
            <input type="radio" name={"ok-" + testId} checked={correct === i}
                   onChange={() => setCorrect(i)} />
          </label>
          <input style={{ flex: 1 }} placeholder={"Ответ " + (i + 1)} value={a}
                 onChange={e => {
                   const copy = [...answers]; copy[i] = e.target.value; setAnswers(copy);
                 }} />
        </div>
      ))}
      <button className="btn primary" style={{ marginTop: 6 }}>Добавить вопрос</button>
    </form>
  );
}

/* ------------ ENROLL ------------ */
function EnrollTab({ users, courses }) {
  const students = users.filter(u => u.role === "student");
  const [userId, setUserId] = useState(students[0]?.id || "");
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [list, setList] = useState([]);

  const load = () => api("/api/admin/enrollments").then(setList);
  useEffect(() => { load(); }, []);

  const add = async () => {
    await api("/api/admin/enrollments", {
      method: "POST", body: JSON.stringify({ user_id: +userId, course_id: +courseId }),
    });
    load();
  };
  const del = async (u, c) => {
    await api("/api/admin/enrollments", {
      method: "DELETE", body: JSON.stringify({ user_id: u, course_id: c }),
    });
    load();
  };

  const studentOptions = students.map(s => ({
    value: s.id, label: `${s.name} (${s.username})`,
  }));
  const courseOptions = courses.map(c => ({ value: c.id, label: c.title }));

  return (
    <div>
      <div className="card row">
        <div style={{ minWidth: 240 }}>
          <SearchSelect
            options={studentOptions}
            value={userId}
            onChange={v => setUserId(v)}
            placeholder="Поиск ученика по ФИО..."
          />
        </div>
        <div style={{ minWidth: 240 }}>
          <SearchSelect
            options={courseOptions}
            value={courseId}
            onChange={v => setCourseId(v)}
            placeholder="Поиск курса..."
          />
        </div>
        <button className="btn primary" onClick={add}>Зачислить</button>
      </div>

      <table className="table">
        <thead><tr><th>Ученик</th><th>Курс</th><th></th></tr></thead>
        <tbody>
          {list.map((e, i) => (
            <tr key={i}>
              <td>{e.student}</td><td>{e.course}</td>
              <td><button className="btn danger small"
                          onClick={() => del(e.user_id, e.course_id)}>Отчислить</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------ UPLOADS ------------ */
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

/* ------------ SETTINGS ------------ */
function SettingsTab() {
  const [names, setNames] = useState({ admin: "", teacher: "", student: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api("/api/admin/settings/roles").then(r => setNames({
      admin: r.role_admin_name || "",
      teacher: r.role_teacher_name || "",
      student: r.role_student_name || "",
    }));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/admin/settings/roles", {
        method: "PUT",
        body: JSON.stringify({
          admin: names.admin, teacher: names.teacher, student: names.student,
        }),
      });
      alert("Сохранено");
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="card">
      <h3>Названия ролей</h3>
      <div className="muted small">
        Внутренние значения (<code>admin / teacher / student</code>) не меняются —
        меняется только отображаемое название в интерфейсе.
      </div>
      <div style={{ marginTop: 12 }}>
        <label>Администратор</label>
        <input value={names.admin}
               onChange={e => setNames({ ...names, admin: e.target.value })}
               style={{ width: "100%" }} />
      </div>
      <div style={{ marginTop: 8 }}>
        <label>Преподаватель</label>
        <input value={names.teacher}
               onChange={e => setNames({ ...names, teacher: e.target.value })}
               style={{ width: "100%" }} />
      </div>
      <div style={{ marginTop: 8 }}>
        <label>Ученик</label>
        <input value={names.student}
               onChange={e => setNames({ ...names, student: e.target.value })}
               style={{ width: "100%" }} />
      </div>
      <button className="btn primary" disabled={saving} onClick={save}
              style={{ marginTop: 12 }}>
        {saving ? "Сохранение..." : "Сохранить"}
      </button>
    </div>
  );
}