import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import Collapsible from "../components/Collapsible";
import ChatPanel from "../components/ChatPanel";
import AttemptDetailsModal from "../components/AttemptDetailsModal";
import { api } from "../api";

const TABS = [
  { id: "themes",        label: "Темы" },
  { id: "announcements", label: "Объявления" },
  { id: "history",       label: "История" },
];

export default function StudentPanel() {
  const [tab, setTab] = useState("themes");
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingTheme, setPendingTheme] = useState(null);

  useEffect(() => {
    (async () => {
      const cs = await api("/api/student/courses");
      setCourses(cs);

      const urlCourse = searchParams.get("course");
      const urlTheme = searchParams.get("theme");

      if (urlCourse && cs.find(c => c.id === +urlCourse)) {
        setCourseId(+urlCourse);
      } else if (cs[0]) {
        setCourseId(cs[0].id);
      }

      if (urlTheme) setPendingTheme(+urlTheme);
    })();
  }, []);

  return (
    <Layout title="Кабинет ученика" tabs={TABS} active={tab} onChange={setTab}>
      {tab === "themes" && (
        <>
          <div className="card row">
            <label>Курс:</label>
            <select value={courseId} onChange={e => setCourseId(e.target.value)}>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          {!courses.length && <div className="card muted">Вам пока не назначено курсов</div>}
          {courseId && <ThemesList courseId={+courseId} />}
        </>
      )}
      {tab === "announcements" && <Announcements />}
      {tab === "history"       && <History />}
    </Layout>
  );
}

function ThemesList({ courseId }) {
  const [themes, setThemes] = useState([]);
  const [chatFor, setChatFor] = useState(null);

  const load = async () => {
    if (!courseId) return;
    const data = await api(`/api/student/course/${courseId}/themes`);
    setThemes(data);
  };

  useEffect(() => {
    load();
  }, [courseId]);

  return (
    <div className="list">
      {themes.map(th => (
        <Collapsible
          key={th.id}
          defaultOpen={false}
          title={
            <span>
              Тема {th.order_index}. {th.title}{" "}
              {th.test && (th.test.passed
                ? <span className="tag ok">Тест сдан</span>
                : <span className="tag no">Тест не сдан</span>)}
              {!th.unlocked && <span className="muted small"> 🔒 заблокировано</span>}
            </span>
          }
        >
          {th.unlocked ? (
            <>
              <MaterialsBlock materials={th.materials} />

              {th.test && (
                <div style={{ marginTop: 12 }}>
                  {th.test.passed ? (
                    <div className="muted small">
                      Тест сдан. Попыток: {th.test.attempts_used}
                      {th.test.max_attempts ? ` / ${th.test.max_attempts}` : ""}
                    </div>
                  ) : (
                    <>
                      <div className="muted small">
                        Попыток использовано: {th.test.attempts_used}
                        {th.test.max_attempts ? ` / ${th.test.max_attempts}` : " (без ограничений)"}
                        {th.test.attempts_left !== null && ` · осталось: ${th.test.attempts_left}`}
                      </div>
                      <button className="btn primary"
                              disabled={th.test.attempts_left === 0}
                              onClick={() => setChatFor({ test: th.test })}>
                        {th.test.attempts_left === 0 ? "Лимит попыток исчерпан" : `Пройти тест`}
                      </button>
                    </>
                  )}
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <button className="btn" onClick={() => setChatFor({ chatThemeId: th.id, chatTitle: th.title })}>
                  💬 Обсуждение темы
                </button>
              </div>
            </>
          ) : (
            <div className="muted">🔒 Заблокировано. Сдайте тест предыдущей темы.</div>
          )}
        </Collapsible>
      ))}

      {chatFor?.test && (
        <TestModal testId={chatFor.test.id} onClose={() => setChatFor(null)}
                   onDone={() => { setChatFor(null); load(); }} />
      )}
      {chatFor?.chatThemeId && (
        <div className="modal-back">
          <div className="card modal">
            <div className="spread">
              <b>Обсуждение темы: {chatFor.chatTitle}</b>
              <button className="btn ghost" onClick={() => setChatFor(null)}>✕</button>
            </div>
            <ChatPanel themeId={chatFor.chatThemeId} apiBase="/api/student" />
          </div>
        </div>
      )}
    </div>
  );
}

function MaterialsBlock({ materials }) {
  const [open, setOpen] = useState({});

  return (
    <div>
      {materials.map(m => {
        const isOpen = open[m.id];
        return (
          <div key={m.id} className="material-block">
            <div className="material-head spread" onClick={() => setOpen(o => ({ ...o, [m.id]: !o[m.id] }))}>
              <div>
                <span className="collapsible-arrow">{isOpen ? "▾" : "▸"}</span>{" "}
                <b>
                  {m.type === "video" ? "🎬"
                   : m.type === "audio" ? "🎧"
                   : m.type === "image" ? "🖼"
                   : m.type === "document" ? "📄"
                   : "📝"} {m.title}
                </b>
              </div>
            </div>
            {isOpen && (
              <div className="material-body">
                {m.type === "video" && <video controls src={m.url} style={{ width: "100%", maxHeight: 360 }} />}
                {m.type === "audio" && <audio controls src={m.url} style={{ width: "100%" }} />}
                {m.type === "image" && <img src={m.url} alt={m.title} style={{ maxWidth: "100%", maxHeight: 400 }} />}
                {m.type === "note" && <div style={{ whiteSpace: "pre-wrap" }}>{m.url}</div>}
                {m.type === "document" && <a href={m.url} target="_blank" rel="noreferrer">📄 Открыть документ</a>}
              </div>
            )}
          </div>
        );
      })}
      {!materials.length && <div className="muted small">В этой теме пока нет материалов</div>}
    </div>
  );
}

function TestModal({ testId, onClose, onDone }) {
  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState(null);

  useEffect(() => { api("/api/student/test/" + testId).then(setData); }, [testId]);

  if (!data) return null;

  const submit = async () => {
    for (const q of data.questions) {
      if (!answers[q.id]) return alert("Ответьте на все вопросы");
    }
    setBusy(true);
    try {
      const r = await api(`/api/student/test/${testId}/submit`, {
        method: "POST", body: JSON.stringify({ answers }),
      });
      setResult(r);
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  const viewDetails = async () => {
    const d = await api(`/api/student/attempts/${result.attempt_id}/details`);
    setDetails(d);
  };

  return (
    <div className="modal-back">
      <div className="card modal">
        <div className="spread">
          <h3>{data.test.title}</h3>
          <button className="btn ghost" onClick={onClose}>✕</button>
        </div>
        <div className="muted small">Проходной балл: {data.test.passing_score}%</div>

        {!result && data.questions.map((q, i) => (
          <div className="q" key={q.id}>
            <b>{i + 1}. {q.text}</b>
            {q.answers.map(a => (
              <label className="ans" key={a.id}>
                <input type="radio" name={"q" + q.id}
                       checked={answers[q.id] === a.id}
                       onChange={() => setAnswers({ ...answers, [q.id]: a.id })} />
                {a.text}
              </label>
            ))}
          </div>
        ))}

        {result && (
          <>
            <div className={"result " + (result.passed ? "ok" : "no")}>
              Результат: <b>{result.score}%</b> ({result.correct}/{result.total}).
              {" "}{result.passed ? "Тест сдан!" : `Нужно минимум ${result.passing_score}%`}
            </div>
            <div className="row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={viewDetails}>Посмотреть мои ответы</button>
            </div>
          </>
        )}

        <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
          <button className="btn ghost" onClick={onClose}>Закрыть</button>
          {!result && (
            <button className="btn primary" disabled={busy} onClick={submit}>
              {busy ? "..." : "Отправить"}
            </button>
          )}
          {result && result.passed && (
            <button className="btn primary" onClick={onDone}>Продолжить</button>
          )}
        </div>
      </div>
      {details && <AttemptDetailsModal data={details} onClose={() => setDetails(null)} />}
    </div>
  );
}

function Announcements() {
  const [list, setList] = useState([]);
  useEffect(() => { api("/api/student/announcements").then(setList); }, []);

  return (
    <div className="list">
      {list.map(a => (
        <div className="card" key={a.id}>
          <div className="spread">
            <b>{a.title}</b>
            <span className="muted small">{new Date(a.created_at).toLocaleString()}</span>
          </div>
          <div className="muted small">От: {a.author}</div>
          <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{a.body}</div>
          {a.groups.length > 0 && (
            <div className="chips" style={{ marginTop: 6 }}>
              {a.groups.map(g => <span key={g} className="tag">{g}</span>)}
            </div>
          )}
        </div>
      ))}
      {!list.length && <div className="card muted">Объявлений пока нет</div>}
    </div>
  );
}

function History() {
  const [list, setList] = useState([]);
  const [details, setDetails] = useState(null);

  useEffect(() => { api("/api/student/history").then(setList); }, []);

  const openDetails = async (id) => {
    setDetails(await api(`/api/student/attempts/${id}/details`));
  };

  return (
    <div className="card">
      <h3>История попыток</h3>
      <table className="table">
        <thead><tr><th>Дата</th><th>Тест</th><th>%</th><th>Результат</th><th></th></tr></thead>
        <tbody>
          {list.map(a => (
            <tr key={a.id}>
              <td className="muted small">{new Date(a.created_at).toLocaleString()}</td>
              <td>{a.test}</td><td>{a.score}%</td>
              <td>{a.passed ? <span className="tag ok">сдан</span> : <span className="tag no">не сдан</span>}</td>
              <td><button className="btn small" onClick={() => openDetails(a.id)}>Мои ответы</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {details && <AttemptDetailsModal data={details} onClose={() => setDetails(null)} />}
    </div>
  );
}
