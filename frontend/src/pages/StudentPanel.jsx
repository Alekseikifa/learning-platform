import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api";

export default function StudentPanel() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [themes, setThemes] = useState([]);
  const [test, setTest] = useState(null);

  useEffect(() => {
    api("/api/student/courses").then(cs => {
      setCourses(cs);
      if (cs[0]) setCourseId(cs[0].id);
    });
  }, []);

  const loadThemes = () => {
    if (!courseId) return;
    api(`/api/student/course/${courseId}/themes`).then(setThemes);
  };
  useEffect(loadThemes, [courseId]);

  const openTest = async (id) => {
    setTest(await api("/api/student/test/" + id));
  };

  return (
    <Layout title="Кабинет ученика">
      <div className="card row">
        <label>Курс:</label>
        <select value={courseId} onChange={e => setCourseId(e.target.value)}>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      {!courses.length && <div className="card muted">Вам пока не назначено курсов</div>}

      <div className="list">
        {themes.map(th => (
          <div className={"card " + (th.unlocked ? "" : "locked")} key={th.id}>
            <div className="spread">
              <h3 style={{ margin: 0 }}>
                Тема {th.order_index}. {th.title}
              </h3>
              <div>
                {th.test
                  ? (th.test.passed
                     ? <span className="tag ok">Тест сдан</span>
                     : <span className="tag no">Тест не сдан</span>)
                  : <span className="tag">Без теста</span>}
              </div>
            </div>

            {th.unlocked ? (
              <>
                <div style={{ marginTop: 12 }}>
                  {th.materials.map(m => (
                    <div key={m.id} style={{ marginBottom: 12 }}>
                      <div><b>{m.type === "video" ? "🎬" : "🎧"} {m.title}</b></div>
                      {m.type === "video" ? (
                        <video controls src={m.url}
                               style={{ width: "100%", maxHeight: 360 }} />
                      ) : (
                        <audio controls src={m.url} style={{ width: "100%" }} />
                      )}
                    </div>
                  ))}
                  {!th.materials.length && (
                    <div className="muted small">В этой теме пока нет материалов</div>
                  )}
                </div>

                {th.test && !th.test.passed && (
                  <button className="btn primary" onClick={() => openTest(th.test.id)}>
                    Пройти тест «{th.test.title}»
                  </button>
                )}
                {th.test && th.test.passed && (
                  <div className="muted small">Тест сдан. Следующая тема разблокирована.</div>
                )}
              </>
            ) : (
              <div className="muted" style={{ marginTop: 8 }}>
                🔒 Заблокировано. Сдайте тест предыдущей темы.
              </div>
            )}
          </div>
        ))}
      </div>

      {test && (
        <TestModal data={test}
                   onClose={() => setTest(null)}
                   onDone={() => { setTest(null); loadThemes(); }} />
      )}
    </Layout>
  );
}

function TestModal({ data, onClose, onDone }) {
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    for (const q of data.questions) {
      if (!answers[q.id]) return alert("Ответьте на все вопросы");
    }
    setBusy(true);
    try {
      const r = await api(`/api/student/test/${data.test.id}/submit`, {
        method: "POST", body: JSON.stringify({ answers }),
      });
      setResult(r);
      if (r.passed) setTimeout(onDone, 1500);
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-back">
      <div className="card modal">
        <div className="spread">
          <h3>{data.test.title}</h3>
          <button className="btn ghost" onClick={onClose}>✕</button>
        </div>
        <div className="muted small">Проходной балл: {data.test.passing_score}%</div>

        {data.questions.map((q, i) => (
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
          <div className={"result " + (result.passed ? "ok" : "no")}>
            Результат: <b>{result.score}%</b> ({result.correct}/{result.total}).
            {" "}{result.passed ? "Тест сдан!" : `Нужно минимум ${result.passing_score}%`}
          </div>
        )}

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onClose}>Закрыть</button>
          <button className="btn primary" disabled={busy || result?.passed} onClick={submit}>
            {busy ? "..." : "Отправить"}
          </button>
        </div>
      </div>
    </div>
  );
}