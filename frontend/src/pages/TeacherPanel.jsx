import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import Collapsible from "../components/Collapsible";
import ChatPanel from "../components/ChatPanel";
import AttemptDetailsModal from "../components/AttemptDetailsModal";
import { api } from "../api";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

const TABS = [
  { id: "students",      label: "Ученики" },
  { id: "progress",      label: "Таблица прогресса" },
  { id: "attempts",      label: "Попытки" },
  { id: "analytics",     label: "Аналитика" },
  { id: "announcements", label: "Объявления" },
];

export default function TeacherPanel() {
  const [tab, setTab] = useState("students");
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState("");

  useEffect(() => {
    api("/api/teacher/groups").then(gs => {
      setGroups(gs);
      if (gs[0]) setGroupId(gs[0].id);
    });
  }, []);

  return (
    <Layout title="Панель преподавателя" tabs={TABS} active={tab} onChange={setTab}>
      <div className="card row">
        <label>Группа:</label>
        <select value={groupId} onChange={e => setGroupId(e.target.value)}>
          {groups.map(g => (
            <option key={g.id} value={g.id}>
              {g.course_title} — {g.name}
            </option>
          ))}
        </select>
      </div>

      {!groups.length && <div className="card muted">Вам ещё не назначены группы</div>}

      {groupId && tab === "students"      && <StudentsTab groupId={+groupId} />}
      {groupId && tab === "progress"      && <ProgressTable groupId={+groupId} />}
      {groupId && tab === "attempts"      && <AttemptsTab groupId={+groupId} />}
      {groupId && tab === "analytics"     && <AnalyticsTab groupId={+groupId} />}
      {groupId && tab === "announcements" && <AnnouncementsTab groups={groups} />}
    </Layout>
  );
}

function StudentsTab({ groupId }) {
  const [students, setStudents] = useState([]);
  const [chatFor, setChatFor] = useState(null);
  const [themes, setThemes] = useState([]);

  useEffect(() => {
    api(`/api/teacher/groups/${groupId}/students`).then(setStudents);
    api(`/api/teacher/groups/${groupId}/progress`).then(p => setThemes(p.themes));
  }, [groupId]);

  return (
    <div className="card">
      <h3>Ученики группы</h3>
      <table className="table">
        <thead><tr><th>ФИО</th><th>Логин</th><th>Прогресс</th><th>Тестов сдано</th><th>Активность</th><th>Чат темы</th></tr></thead>
        <tbody>
          {students.map(s => (
            <tr key={s.id}>
              <td>{s.name}</td><td>{s.username}</td>
              <td style={{ minWidth: 160 }}>
                <div className="bar"><div style={{ width: s.progress + "%" }} /></div>
                <span className="muted small">{s.progress}%</span>
              </td>
              <td>{s.passed_tests}/{s.total_tests}</td>
              <td className="muted small">{s.last_activity
                ? new Date(s.last_activity).toLocaleString() : "—"}</td>
              <td>
                <select onChange={e => e.target.value && setChatFor(+e.target.value)}
                        defaultValue="">
                  <option value="">— выбрать тему —</option>
                  {themes.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {chatFor && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="spread">
            <b>Чат темы: {themes.find(t => t.id === chatFor)?.title}</b>
            <button className="btn ghost" onClick={() => setChatFor(null)}>Закрыть</button>
          </div>
          <ChatPanel themeId={chatFor} apiBase="/api/teacher" />
        </div>
      )}
    </div>
  );
}

function ProgressTable({ groupId }) {
  const [data, setData] = useState(null);
  const [chatFor, setChatFor] = useState(null);

  useEffect(() => {
    api(`/api/teacher/groups/${groupId}/progress`).then(setData);
  }, [groupId]);

  if (!data) return <div className="card muted">Загрузка...</div>;

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <h3>Прогресс по темам</h3>
      <table className="table">
        <thead>
          <tr>
            <th style={{ position: "sticky", left: 0, background: "#f9fafb" }}>Ученик</th>
            {data.themes.map(t => (
              <th key={t.id} title={t.test_title || "—"}>
                <div style={{ maxWidth: 120, fontSize: 12 }}>
                  {t.order_index}. {t.title}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.students.map(s => (
            <tr key={s.id}>
              <td style={{ position: "sticky", left: 0, background: "#fff", fontWeight: 600 }}>
                {s.name}
              </td>
              {s.cells.map(c => (
                <td key={c.theme_id} style={{ textAlign: "center", minWidth: 90 }}>
                  {c.status === "no_test" && <span className="muted small">—</span>}
                  {c.status === "not_started" && <span className="muted small">не начат</span>}
                  {c.status === "failed" && (
                    <span title={`Попыток: ${c.attempts}, лучший: ${c.best_score}%`}>
                      <span className="tag no">❌ {c.attempts} поп.</span>
                    </span>
                  )}
                  {c.status === "passed" && (
                    <span title={`Попыток: ${c.attempts}, лучший: ${c.best_score}%`}>
                      <span className="tag ok">✅ {c.best_score}%</span>
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: 20 }}>Обсуждение тем</h3>
      <div className="row">
        <select onChange={e => e.target.value && setChatFor(+e.target.value)} defaultValue="">
          <option value="">— открыть чат темы —</option>
          {data.themes.filter(t => t.test_id).map(t => (
            <option key={t.id} value={t.id}>{t.order_index}. {t.title}</option>
          ))}
        </select>
      </div>
      {chatFor && (
        <div style={{ marginTop: 12 }}>
          <ChatPanel themeId={chatFor} apiBase="/api/teacher" />
        </div>
      )}
    </div>
  );
}

function AttemptsTab({ groupId }) {
  const [attempts, setAttempts] = useState([]);
  const [details, setDetails] = useState(null);

  useEffect(() => { api(`/api/teacher/groups/${groupId}/attempts`).then(setAttempts); }, [groupId]);

  const openDetails = async (id) => {
    setDetails(await api(`/api/teacher/attempts/${id}/details`));
  };

  return (
    <div className="card">
      <h3>Последние попытки</h3>
      <table className="table">
        <thead><tr><th>Дата</th><th>Ученик</th><th>Тест</th><th>%</th><th>Результат</th><th></th></tr></thead>
        <tbody>
          {attempts.map(a => (
            <tr key={a.id}>
              <td className="muted small">{new Date(a.created_at).toLocaleString()}</td>
              <td>{a.student}</td><td>{a.test}</td><td>{a.score}%</td>
              <td>{a.passed ? <span className="tag ok">сдан</span> : <span className="tag no">не сдан</span>}</td>
              <td><button className="btn small" onClick={() => openDetails(a.id)}>Ответы ученика</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {details && <AttemptDetailsModal data={details} onClose={() => setDetails(null)} />}
    </div>
  );
}

function AnalyticsTab({ groupId }) {
  const [data, setData] = useState(null);
  useEffect(() => { api(`/api/teacher/groups/${groupId}/analytics`).then(setData); }, [groupId]);
  if (!data) return <div className="card muted">Загрузка...</div>;

  return (
    <>
      <div className="grid-2">
        <div className="card">
          <h3>Динамика (30 дней)</h3>
          {data.timeline.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.timeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis yAxisId="l" />
                <YAxis yAxisId="r" orientation="right" domain={[0, 100]} />
                <Tooltip /><Legend />
                <Line yAxisId="l" type="monotone" dataKey="attempts" name="Попыток" stroke="#2563eb" />
                <Line yAxisId="r" type="monotone" dataKey="avg_score" name="Средний %" stroke="#10b981" />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="muted">Пока нет данных</div>}
        </div>
        <div className="card">
          <h3>Результаты по тестам</h3>
          {data.per_test.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.per_test}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="test" fontSize={11} />
                <YAxis domain={[0, 100]} /><Tooltip /><Legend />
                <Bar dataKey="avg_score" name="Средний %" fill="#3b82f6" />
                <Bar dataKey="pass_rate" name="% сдавших" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="muted">Нет тестов</div>}
        </div>
      </div>
    </>
  );
}

function AnnouncementsTab({ groups }) {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: "", body: "", group_ids: [] });

  const load = () => api("/api/teacher/announcements").then(setList);
  useEffect(() => { load(); }, []);

  const startNew = () => {
    setEditing(null);
    setForm({ title: "", body: "", group_ids: groups.map(g => g.id) });
  };
  const startEdit = (a) => {
    setEditing(a.id);
    setForm({ title: a.title, body: a.body, group_ids: a.group_ids });
  };
  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) return alert("Заполните заголовок и текст");
    if (!form.group_ids.length) return alert("Выберите хотя бы одну группу");
    try {
      if (editing) {
        await api(`/api/teacher/announcements/${editing}`, { method: "PUT", body: JSON.stringify(form) });
      } else {
        await api("/api/teacher/announcements", { method: "POST", body: JSON.stringify(form) });
      }
      setEditing(null); setForm({ title: "", body: "", group_ids: [] });
      load();
    } catch (e) { alert(e.message); }
  };
  const del = async (id) => {
    if (!confirm("Удалить объявление?")) return;
    await api("/api/teacher/announcements/" + id, { method: "DELETE" });
    load();
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
        <h3>{editing ? "Редактирование объявления" : "Новое объявление"}</h3>
        <input placeholder="Заголовок" value={form.title}
               onChange={e => setForm({ ...form, title: e.target.value })}
               style={{ width: "100%" }} />
        <textarea placeholder="Текст объявления" rows={4} value={form.body}
                  onChange={e => setForm({ ...form, body: e.target.value })}
                  style={{ width: "100%", marginTop: 6 }} />
        <div className="section-title">Кому отправить</div>
        <div className="chips">
          {groups.map(g => (
            <label key={g.id} className="chip" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={form.group_ids.includes(g.id)}
                     onChange={() => toggleGroup(g.id)} />
              {g.course_title} — {g.name}
            </label>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={save}>
            {editing ? "Сохранить" : "Опубликовать"}
          </button>
          {editing && <button className="btn ghost" onClick={() => { setEditing(null); setForm({ title: "", body: "", group_ids: [] }); }}>Отмена</button>}
          {!editing && <button className="btn ghost" onClick={startNew}>Очистить</button>}
        </div>
      </div>

      <div className="list">
        {list.map(a => (
          <div className="card" key={a.id}>
            <div className="spread">
              <b>{a.title}</b>
              <div>
                <button className="btn small" onClick={() => startEdit(a)}>Изм.</button>{" "}
                <button className="btn danger small" onClick={() => del(a.id)}>Уд.</button>
              </div>
            </div>
            <div className="muted small">
              {new Date(a.created_at).toLocaleString()}
              {a.updated_at !== a.created_at && " · изменено " + new Date(a.updated_at).toLocaleString()}
            </div>
            <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{a.body}</div>
            <div className="chips" style={{ marginTop: 6 }}>
              {a.group_ids.map(gid => {
                const g = groups.find(x => x.id === gid);
                return g ? <span key={gid} className="tag">{g.course_title} — {g.name}</span> : null;
              })}
            </div>
          </div>
        ))}
        {!list.length && <div className="card muted">Объявлений пока нет</div>}
      </div>
    </div>
  );
}