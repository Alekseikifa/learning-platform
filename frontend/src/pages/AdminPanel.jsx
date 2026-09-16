import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api, uploadFile } from "../api";

const TABS = [
  { id: "users", label: "Пользователи" },
  { id: "courses", label: "Курсы" },
  { id: "materials", label: "Материалы" },
  { id: "tests", label: "Тесты" },
  { id: "enroll", label: "Зачисления" },
  { id: "uploads", label: "Файлы" },
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
      {tab === "users"    && <UsersTab users={users} reload={reload} />}
      {tab === "courses"  && <CoursesTab courses={courses} users={users} reload={reload} />}
      {tab === "materials"&& <MaterialsTab courses={courses} />}
      {tab === "tests"    && <TestsTab courses={courses} />}
      {tab === "enroll"   && <EnrollTab users={users} courses={courses} />}
      {tab === "uploads"  && <UploadsTab />}
    </Layout>
  );
}

/* ------------ USERS ------------ */
function UsersTab({ users, reload }) {
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "student" });
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
              <td><button className="btn danger small" onClick={() => del(u.id)}>Удалить</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------ COURSES ------------ */
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
        <input placeholder="Название курса" value={form.title}
               onChange={e => setForm({ ...form, title: e.target.value })} required />
        <input placeholder="Описание" value={form.description}
               onChange={e => setForm({ ...form, description: e.target.value })} />
        <button className="btn primary">Создать</button>
      </form>
      {courses.map(c => (
        <div className="card" key={c.id}>
          <div className="spread">
            <b>#{c.id} {c.title}</b>
            <button className="btn danger small" onClick={() => del(c.id)}>Удалить</button>
          </div>
          <div className="muted small">{c.description}</div>
          <div className="chips">
            {c.teachers.map(t => (
              <span key={t.id} className="chip">
                {t.name}
                <button onClick={() => unassign(c.id, t.id)}>✕</button>
              </span>
            ))}
            {!c.teachers.length && <span className="muted small">нет преподавателей</span>}
          </div>
          <div className="row">
            <select id={"sel-" + c.id} defaultValue="">
              <option value="">— назначить —</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button className="btn" onClick={() => {
              const v = document.getElementById("sel-" + c.id).value;
              assign(c.id, v);
            }}>Назначить</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------ MATERIALS ------------ */
function MaterialsTab({ courses }) {
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [materials, setMaterials] = useState([]);
  const [form, setForm] = useState({ title: "", type: "video", url: "", order_index: 0 });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!courseId) { setMaterials([]); return; }
    api(`/api/admin/materials/${courseId}`).then(setMaterials);
  }, [courseId]);

  useEffect(() => { if (!courseId && courses[0]) setCourseId(courses[0].id); }, [courses, courseId]);

  const add = async (e) => {
    e.preventDefault();
    await api("/api/admin/materials", {
      method: "POST",
      body: JSON.stringify({ ...form, course_id: +courseId, order_index: +form.order_index }),
    });
    setForm({ title: "", type: "video", url: "", order_index: 0 });
    const list = await api(`/api/admin/materials/${courseId}`);
    setMaterials(list);
  };

  const del = async (id) => {
    if (!confirm("Удалить материал (и связанный тест)?")) return;
    await api("/api/admin/materials/" + id, { method: "DELETE" });
    setMaterials(await api(`/api/admin/materials/${courseId}`));
  };

  const onUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
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
      <div className="row card">
        <label>Курс:</label>
        <select value={courseId} onChange={e => setCourseId(e.target.value)}>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      {courseId && (
        <form className="card" onSubmit={add}>
          <div className="row">
            <input placeholder="Название материала" value={form.title}
                   onChange={e => setForm({ ...form, title: e.target.value })} required style={{flex:1}} />
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="video">Видео</option>
              <option value="audio">Аудио</option>
            </select>
            <input type="number" placeholder="Порядок" value={form.order_index}
                   onChange={e => setForm({ ...form, order_index: e.target.value })} style={{width:100}} />
          </div>
          <div className="row">
            <input placeholder="URL (или загрузите файл →)" value={form.url}
                   onChange={e => setForm({ ...form, url: e.target.value })} required style={{flex:1}} />
            <label className="btn">
              {uploading ? "Загрузка..." : "Загрузить файл"}
              <input type="file" hidden accept="video/*,audio/*" onChange={onUpload} />
            </label>
            <button className="btn primary">Добавить материал</button>
          </div>
        </form>
      )}

      <div className="list">
        {materials.map(m => (
          <div className="card spread" key={m.id}>
            <div>
              <b>#{m.order_index} [{m.type}] {m.title}</b>
              <div className="muted small"><a href={m.url} target="_blank" rel="noreferrer">{m.url}</a></div>
            </div>
            <button className="btn danger small" onClick={() => del(m.id)}>✕</button>
          </div>
        ))}
        {!materials.length && <div className="muted">Материалов пока нет</div>}
      </div>
    </div>
  );
}

/* ------------ TESTS ------------ */
function TestsTab({ courses }) {
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [materials, setMaterials] = useState([]);
  const [tests, setTests] = useState([]);
  const [testForm, setTestForm] = useState({ material_id: "", title: "", passing_score: 70 });

  const load = async () => {
    if (!courseId) return;
    setMaterials(await api(`/api/admin/materials/${courseId}`));
    setTests(await api(`/api/admin/tests/${courseId}`));
  };

  useEffect(() => { load(); }, [courseId]);
  useEffect(() => { if (!courseId && courses[0]) setCourseId(courses[0].id); }, [courses, courseId]);

  const createTest = async (e) => {
    e.preventDefault();
    try {
      await api("/api/admin/tests", {
        method: "POST",
        body: JSON.stringify({ ...testForm, course_id: +courseId, material_id: +testForm.material_id,
                               passing_score: +testForm.passing_score }),
      });
      setTestForm({ material_id: "", title: "", passing_score: 70 });
      load();
    } catch (e) { alert(e.message); }
  };

  const delTest = async (id) => {
    if (!confirm("Удалить тест со всеми вопросами и попытками?")) return;
    await api("/api/admin/tests/" + id, { method: "DELETE" });
    load();
  };

  const delQuestion = async (id) => {
    await api("/api/admin/questions/" + id, { method: "DELETE" });
    load();
  };

  const addQuestion = async (testId, payload) => {
    try {
      await api("/api/admin/questions", {
        method: "POST",
        body: JSON.stringify({ test_id: testId, ...payload }),
      });
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div className="row card">
        <label>Курс:</label>
        <select value={courseId} onChange={e => setCourseId(e.target.value)}>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      {courseId && (
        <form className="card row" onSubmit={createTest}>
          <select value={testForm.material_id} required
                  onChange={e => setTestForm({ ...testForm, material_id: e.target.value })}>
            <option value="">— материал —</option>
            {materials.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
          <input placeholder="Название теста" value={testForm.title}
                 onChange={e => setTestForm({ ...testForm, title: e.target.value })} required />
          <input type="number" placeholder="Проходной %" value={testForm.passing_score}
                 onChange={e => setTestForm({ ...testForm, passing_score: e.target.value })}
                 style={{ width: 130 }} />
          <button className="btn primary">Создать тест</button>
        </form>
      )}

      {tests.map(t => (
        <div className="card" key={t.id}>
          <div className="spread">
            <b>#{t.id} {t.title}</b>
            <div>
              <span className="muted small">проходной {t.passing_score}% · материал #{t.material_id}</span>
              <button className="btn danger small" style={{ marginLeft: 8 }}
                      onClick={() => delTest(t.id)}>Удалить тест</button>
            </div>
          </div>

          <div className="list">
            {t.questions.map(q => (
              <div className="card q" key={q.id}>
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

          <NewQuestionForm testId={t.id} onSubmit={addQuestion} />
        </div>
      ))}
    </div>
  );
}

function NewQuestionForm({ testId, onSubmit }) {
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);

  const submit = (e) => {
    e.preventDefault();
    if (!text || answers.some(a => !a.trim())) return alert("Заполните вопрос и все 4 ответа");
    onSubmit(testId, {
      text,
      answers: answers.map((a, i) => ({ text: a, is_correct: i === correct })),
    });
    setText(""); setAnswers(["", "", "", ""]); setCorrect(0);
  };

  return (
    <form className="card qform" onSubmit={submit}>
      <b>Добавить вопрос</b>
      <input placeholder="Текст вопроса" value={text} onChange={e => setText(e.target.value)} />
      {answers.map((a, i) => (
        <div className="row" key={i}>
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
      <button className="btn primary">Добавить вопрос</button>
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

  return (
    <div>
      <div className="card row">
        <select value={userId} onChange={e => setUserId(e.target.value)}>
          {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={courseId} onChange={e => setCourseId(e.target.value)}>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
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
        <span className="muted small">файл появится в /uploads/ и станет доступен для использования в материалах</span>
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