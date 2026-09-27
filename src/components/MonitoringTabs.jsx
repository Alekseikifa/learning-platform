import { useEffect, useState } from "react";
import ChatPanel from "./ChatPanel";
import AttemptDetailsModal from "./AttemptDetailsModal";
import UnlockThemeModal from "./UnlockThemeModal";
import { api, getUser } from "../api";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

export function StudentsTab({ groupId, initialTheme, onThemeConsumed }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [chatFor, setChatFor] = useState(null);
  const [unlocking, setUnlocking] = useState(null);
  const [themes, setThemes] = useState([]);
  const activeRole = getUser()?.role;
  const canUnlock = activeRole === "admin" || activeRole === "teacher";
  const unlockPrefix = activeRole === "admin" ? "/api/admin" : "/api/teacher";

  useEffect(() => {
    let cancelled = false;
    // при смене группы сбрасываем открытый чат/модалку прошлой группы
    setChatFor(null);
    setUnlocking(null);
    setLoading(true);
    setErr(null);
    Promise.all([
      api(`/api/teacher/groups/${groupId}/students`),
      api(`/api/teacher/groups/${groupId}/progress`),
    ])
      .then(([studentsRes, progress]) => {
        if (cancelled) return;
        setStudents(studentsRes);
        setThemes(progress.themes);
      })
      .catch((e) => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [groupId]);

  // реакция на initialTheme от уведомления
  useEffect(() => {
    if (initialTheme) {
      setChatFor(initialTheme);
      if (onThemeConsumed) onThemeConsumed();
    }
  }, [initialTheme]);

  useEffect(() => {
    // когда чат открыли «извне» — сообщаем наверх, чтобы почистить URL
    if (chatFor === initialTheme && initialTheme && onThemeConsumed) {
      onThemeConsumed();
    }
  }, [chatFor, initialTheme]);

  return (
    <div className="card">
      <h3>Ученики группы</h3>
      {loading && <div className="muted">Загрузка учеников…</div>}
      {err && <div style={{ color: "#dc2626" }}>Не удалось загрузить учеников: {err}</div>}
      {!loading && !err && !students.length && <div className="muted">В группе пока нет учеников</div>}
      <div className="table-wrap"><table className="table">
        <thead><tr><th>ФИО</th><th>Логин</th><th>Прогресс</th><th>Тестов сдано</th><th>Активность</th><th>Чат темы</th>{canUnlock && <th>Темы</th>}</tr></thead>
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
              {canUnlock && (
                <td>
                  <button className="btn small" title="Открыть следующую тему ученику"
                          onClick={() => setUnlocking(s)}>
                    🔓 Темы
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table></div>
      {chatFor && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="spread">
            <b>Чат темы: {themes.find(t => t.id === chatFor)?.title}</b>
            <button className="btn ghost" onClick={() => setChatFor(null)}>Закрыть</button>
          </div>
          <ChatPanel themeId={chatFor} apiBase="/api/teacher" />
        </div>
      )}
      {unlocking && (
        <UnlockThemeModal student={unlocking} apiPrefix={unlockPrefix}
                          onClose={() => setUnlocking(null)} />
      )}
    </div>
  );
}

export function ProgressTable({ groupId }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [chatFor, setChatFor] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setChatFor(null); // чат прошлой группы не должен остаться открытым
    setData(null);
    setErr(null);
    api(`/api/teacher/groups/${groupId}/progress`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(e.message); });
    return () => { cancelled = true; };
  }, [groupId]);

  if (err) return <div className="card" style={{ color: "#dc2626" }}>Не удалось загрузить прогресс: {err}</div>;
  if (!data) return <div className="card muted">Загрузка...</div>;

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <h3>Прогресс по темам</h3>
      <div className="table-wrap"><table className="table">
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
      </table></div>

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

export function AttemptsTab({ groupId }) {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [details, setDetails] = useState(null);
  const [themeFilter, setThemeFilter] = useState("");
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    let cancelled = false;
    setThemeFilter("");
    setDetails(null); // модалка ответов прошлой группы
    setLoading(true);
    setErr(null);
    api(`/api/teacher/groups/${groupId}/attempts`)
      .then((a) => { if (!cancelled) setAttempts(a); })
      .catch((e) => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [groupId]);

  const openDetails = async (id) => {
    try {
      setDetails(await api(`/api/teacher/attempts/${id}/details`));
    } catch (e) {
      alert(e.message);
    }
  };

  const themes = (() => {
    const seen = new Map();
    for (const a of attempts) {
      if (a.theme_id != null && !seen.has(a.theme_id)) {
        seen.set(a.theme_id, { id: a.theme_id, title: a.theme_title, order_index: a.theme_order_index });
      }
    }
    return [...seen.values()].sort((x, y) =>
      (x.order_index || 0) - (y.order_index || 0) || x.id - y.id);
  })();

  const filtered = themeFilter
    ? attempts.filter((a) => String(a.theme_id) === themeFilter)
    : attempts;

  const cmp = (a, b) => {
    switch (sortKey) {
      case "student": return a.student.localeCompare(b.student, "ru");
      case "test": return a.test.localeCompare(b.test, "ru");
      case "theme": {
        const ao = a.theme_order_index != null ? a.theme_order_index : Number.MAX_SAFE_INTEGER;
        const bo = b.theme_order_index != null ? b.theme_order_index : Number.MAX_SAFE_INTEGER;
        return ao - bo || a.id - b.id;
      }
      case "score": return a.score - b.score;
      case "result": return (a.passed ? 1 : 0) - (b.passed ? 1 : 0) || a.score - b.score;
      default: return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
  };
  const rows = [...filtered].sort((a, b) => (sortDir === "asc" ? cmp(a, b) : -cmp(a, b)));

  const th = (key, label) => (
    <th
      style={{ cursor: "pointer", userSelect: "none" }}
      onClick={() => {
        if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        else {
          setSortKey(key);
          setSortDir(key === "date" || key === "score" || key === "result" ? "desc" : "asc");
        }
      }}
    >
      {label}{sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 10 }}>
        <h3>Последние попытки</h3>
        <div className="row" style={{ gap: 8 }}>
          <label className="small muted">Тема:</label>
          <select value={themeFilter} onChange={(e) => setThemeFilter(e.target.value)}>
            <option value="">Все темы</option>
            {themes.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
      </div>
      {loading && <div className="muted">Загрузка попыток…</div>}
      {err && <div style={{ color: "#dc2626" }}>Не удалось загрузить попытки: {err}</div>}
      {!loading && !err && !rows.length && <div className="muted">Попыток пока нет</div>}
      <div className="table-wrap"><table className="table">
        <thead>
          <tr>
            {th("date", "Дата")}
            {th("student", "Ученик")}
            {th("test", "Тест")}
            {th("theme", "Тема")}
            {th("score", "%")}
            {th("result", "Результат")}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(a => (
            <tr key={a.id}>
              <td className="muted small">{new Date(a.created_at).toLocaleString()}</td>
              <td>{a.student}</td><td>{a.test}</td>
              <td className="muted small">{a.theme_title || "—"}</td>
              <td>{a.score}%</td>
              <td>{a.passed ? <span className="tag ok">сдан</span> : <span className="tag no">не сдан</span>}</td>
              <td><button className="btn small" onClick={() => openDetails(a.id)}>Ответы ученика</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {details && <AttemptDetailsModal data={details} onClose={() => setDetails(null)} />}
    </div>
  );
}

export function AnalyticsTab({ groupId }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setErr(null);
    api(`/api/teacher/groups/${groupId}/analytics`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(e.message); });
    return () => { cancelled = true; };
  }, [groupId]);
  if (err) return <div className="card" style={{ color: "#dc2626" }}>Не удалось загрузить аналитику: {err}</div>;
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
