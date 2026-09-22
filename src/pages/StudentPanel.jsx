import SmartMediaViewer from "../components/SmartMediaViewer.jsx";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import Collapsible from "../components/Collapsible";
import ChatPanel from "../components/ChatPanel";
import AttemptDetailsModal from "../components/AttemptDetailsModal";
import { api } from "../api";
import DirectMessages from "../components/DirectMessages";

const TABS = [
  { id: "themes",        label: "Курс и материалы" },
  { id: "announcements", label: "Объявления" },
  { id: "messages",      label: "Сообщения" },
  { id: "history",       label: "История" },
];

export default function StudentPanel() {
  const [tab, setTab] = useState("themes");
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [courseSection, setCourseSection] = useState("themes"); // "themes" | "extra"
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingTheme, setPendingTheme] = useState(null);
  const [pendingExtra, setPendingExtra] = useState(null);

  // 1. Загружаем курсы один раз
  useEffect(() => {
    api("/api/student/courses").then(cs => {
      setCourses(cs);
    });
  }, []);

  // 2. Ставим дефолтный курс, если ещё не выбран
  useEffect(() => {
    if (!courseId && courses[0]) setCourseId(courses[0].id);
  }, [courses, courseId]);

  // 3. Реакция на URL — срабатывает и при монтировании, и при клике по уведомлению
  useEffect(() => {
    const urlCourse = searchParams.get("course");
    const urlTheme = searchParams.get("theme");
    const urlExtra = searchParams.get("extra_material");
    const urlTab = searchParams.get("tab");
    if (urlCourse) setCourseId(+urlCourse);
    if (urlTheme) {
      setPendingTheme(+urlTheme);
      setCourseSection("themes");
    }
    if (urlExtra) {
      setPendingExtra(+urlExtra);
      setCourseSection("extra");
    }
    if (urlTab) setTab(urlTab);
  }, [searchParams.toString()]);

  return (
    <Layout title="Кабинет ученика" tabs={TABS} active={tab} onChange={setTab}>
      {tab === "themes" && (
        <div>
          <label>Курс:</label>
          <select value={courseId} onChange={e => setCourseId(e.target.value)}>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>

          {courseId && (
            <div className="row" style={{ gap: 8, margin: "12px 0" }}>
              <button
                type="button"
                className={"btn " + (courseSection === "themes" ? "primary" : "ghost")}
                onClick={() => setCourseSection("themes")}
              >
                📚 Темы курса (с тестами)
              </button>
              <button
                type="button"
                className={"btn " + (courseSection === "extra" ? "primary" : "ghost")}
                onClick={() => setCourseSection("extra")}
              >
                📎 Дополнительные материалы (без тестов, с чатом)
              </button>
            </div>
          )}

          {!courses.length && <div className="card muted">Вам пока не назначено курсов</div>}

          {courseId && courseSection === "themes" && (
            <ThemesList
              courseId={+courseId}
              initialTheme={pendingTheme}
              onThemeConsumed={() => {
                setPendingTheme(null);
                setSearchParams({}, { replace: true });
              }}
            />
          )}

          {courseId && courseSection === "extra" && (
            <ExtraMaterialsStudentList
              courseId={+courseId}
              initialExtra={pendingExtra}
              onExtraConsumed={() => {
                setPendingExtra(null);
                setSearchParams({}, { replace: true });
              }}
            />
          )}
        </div>
      )}
      {tab === "announcements" && <Announcements />}
      {tab === "messages" && <DirectMessages />}
      {tab === "history" && <History />}
    </Layout>
  );
}

function ThemesList({ courseId, initialTheme, onThemeConsumed }) {
  const [themes, setThemes] = useState([]);
  const [chatFor, setChatFor] = useState(null);

  // загрузка тем
  useEffect(() => {
    if (!courseId) return;
    api(`/api/student/course/${courseId}/themes`).then(setThemes);
  }, [courseId]);

  // открываем чат при получении initialTheme
  useEffect(() => {
    if (initialTheme && themes.length) {
      const found = themes.find(t => t.id === initialTheme);
      setChatFor({
        chatThemeId: initialTheme,
        chatTitle: found?.title || "",
      });
      if (onThemeConsumed) onThemeConsumed();
    }
  }, [initialTheme, themes]);

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
                <button className="btn"
                        onClick={() => setChatFor({ chatThemeId: th.id, chatTitle: th.title })}>
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
                   onDone={() => { setChatFor(null); }} />
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
                   : m.type === "link" ? "🔗"
                   : "📝"} {m.title}
                </b>
              </div>
            </div>
            {isOpen && (
              <div className="material-body">
                {(m.type === "video" || m.type === "link") && <SmartMediaViewer url={m.url} title={m.title} />}
                {m.type === "audio" && <audio controls src={m.url} style={{ width: "100%" }} />}
                {m.type === "image" && (
                  <img
                    src={m.url}
                    alt={m.title}
                    referrerPolicy="no-referrer"
                    style={{ maxWidth: "100%", maxHeight: 400, borderRadius: 8, display: "block" }}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.style.display = "none";
                      const p = e.currentTarget.parentElement;
                      if (p && !p.querySelector(".img-fallback")) {
                        const fb = document.createElement("div");
                        fb.className = "img-fallback muted small";
                        fb.style.padding = "10px";
                        fb.style.background = "#f1f5f9";
                        fb.style.borderRadius = "8px";
                        fb.innerHTML = `🖼️ <a href="${m.url}" target="_blank" rel="noreferrer" style="color: #2563eb; text-decoration: underline;">Открыть изображение в новой вкладке: ${m.title}</a>`;
                        p.appendChild(fb);
                      }
                    }}
                  />
                )}
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

function ExtraMaterialsStudentList({ courseId, initialExtra, onExtraConsumed }) {
  const [materials, setMaterials] = useState([]);
  const [chatFor, setChatFor] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    api(`/api/student/course/${courseId}/extra-materials`)
      .then((res) => {
        setMaterials(res);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [courseId]);

  useEffect(() => {
    if (initialExtra && materials.length) {
      const found = materials.find((m) => m.id === initialExtra);
      if (found) {
        setChatFor({ id: found.id, title: found.title });
      }
      if (onExtraConsumed) onExtraConsumed();
    }
  }, [initialExtra, materials]);

  const getIcon = (t) => {
    if (t === "video") return "🎬";
    if (t === "document") return "📄";
    if (t === "audio") return "🎧";
    if (t === "image") return "🖼";
    return "📝";
  };

  return (
    <div className="list">
      <div className="card" style={{ marginBottom: 12, background: "var(--bg-card-alt, #f9fafb)" }}>
        <div className="spread" style={{ alignItems: "center" }}>
          <div>
            <b>Дополнительные материалы курса</b>
            <div className="muted small">
              Материалы для углубленного изучения курса. <b>Без тестов.</b> В каждом материале доступен отдельный чат обсуждения для учеников группы, куратора и администратора.
            </div>
          </div>
          <span className="tag ok">Без тестов</span>
        </div>
      </div>

      {loading && <div className="card muted">Загрузка материалов...</div>}

      {!loading && !materials.length && (
        <div className="card muted">В этом курсе пока нет дополнительных материалов.</div>
      )}

      {materials.map((em) => (
        <Collapsible
          key={em.id}
          defaultOpen={false}
          title={
            <div className="spread" style={{ width: "100%", alignItems: "center" }}>
              <span>
                {em.order_index}. {getIcon(em.type)} {em.title}
              </span>
              <span className="tag ok" style={{ fontSize: "0.75rem" }}>Без тестов</span>
            </div>
          }
        >
          {em.description && (
            <div className="muted small" style={{ marginBottom: 10 }}>
              {em.description}
            </div>
          )}

          <div style={{ marginTop: 8, marginBottom: 12 }}>
            {(em.type === "video" || em.type === "link") && <SmartMediaViewer url={em.url} title={em.title} description={em.description} />}
            {em.type === "audio" && <audio controls src={em.url} style={{ width: "100%" }} />}
            {em.type === "image" && (
              <img
                src={em.url}
                alt={em.title}
                referrerPolicy="no-referrer"
                style={{ maxWidth: "100%", maxHeight: 420, borderRadius: 8, display: "block" }}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.style.display = "none";
                  const p = e.currentTarget.parentElement;
                  if (p && !p.querySelector(".img-fallback-em")) {
                    const fb = document.createElement("div");
                    fb.className = "img-fallback-em muted small";
                    fb.style.padding = "10px";
                    fb.style.background = "#f1f5f9";
                    fb.style.borderRadius = "8px";
                    fb.innerHTML = `🖼️ <a href="${em.url}" target="_blank" rel="noreferrer" style="color: #2563eb; text-decoration: underline;">Открыть изображение в новой вкладке: ${em.title}</a>`;
                    p.appendChild(fb);
                  }
                }}
              />
            )}
            {em.type === "note" && (
              <div style={{ whiteSpace: "pre-wrap", padding: 12, background: "var(--bg-card-alt, #f9fafb)", borderRadius: 6, border: "1px solid #e5e7eb" }}>
                {em.url}
              </div>
            )}
            {em.type === "document" && (
              <a href={em.url} target="_blank" rel="noreferrer" className="btn small">
                📄 Открыть документ ({em.url})
              </a>
            )}
          </div>

          <div className="spread" style={{ marginTop: 12, alignItems: "center", borderTop: "1px solid #f0f0f0", paddingTop: 10 }}>
            <span className="muted small">
              💬 Чат: ученики группы, куратор, администратор
            </span>
            <button
              className="btn primary"
              onClick={() => setChatFor({ id: em.id, title: em.title })}
            >
              💬 Обсуждение материала
            </button>
          </div>
        </Collapsible>
      ))}

      {chatFor && (
        <div className="modal-back">
          <div className="card modal" style={{ maxWidth: 640 }}>
            <div className="spread" style={{ alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <b>Обсуждение: {chatFor.title}</b>
                <div className="muted small">
                  Сообщения видят ученики вашей группы, куратор и администрация
                </div>
              </div>
              <button className="btn ghost" onClick={() => setChatFor(null)}>✕</button>
            </div>
            <ChatPanel extraMaterialId={chatFor.id} apiBase="/api/student" />
          </div>
        </div>
      )}
    </div>
  );
}
