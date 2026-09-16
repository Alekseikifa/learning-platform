import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api";

export default function StudentPanel() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [materials, setMaterials] = useState([]);
  const [test, setTest] = useState(null); // {test, questions}
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api("/api/student/courses").then(cs => {
      setCourses(cs);
      if (cs[0]) setCourseId(cs[0].id);
    });
  }, []);

  const loadMaterials = () => {
    if (!courseId) return;
    api(`/api/student/course/${courseId}/materials`).then(setMaterials);
  };
  useEffect(loadMaterials, [courseId]);

  const openTest = async (id) => {
    const t = await api("/api/student/test/" + id);
    setTest(t);
    setMsg(null);
  };

  return (
    <Layout title="Кабинет ученика">
      <div className="card row">
        <label>Курс:</label>
        <select value={courseId} onChange={e => setCourseId(e.target.value)}>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      {!courses.length && <div className="card muted">Вам пока не назначено ни одного курса</div>}

      <div className="list">
        {materials.map(m => (
          <div className={"card " + (m.unlocked ? "" : "locked")} key={m.id}>
            <div className="spread">
              <b>
                {m.order_index}. {m.type === "video" ? "🎬" : "🎧"} {m.title}
              </b>
              <div>
                {m.test
                  ? (m.test.passed
                     ? <span className="tag ok">Тест сдан</span>
                     : <span className="tag no">Тест не сдан</span>)
                  : <span className="tag">Без теста</span>}
              </div>
            </div>
            {m.unlocked ? (
              <>
                {m.type === "video"
                  ? <video controls style={{ width: "100%", maxHeight: 360 }} src={m.url} />
                  : <audio controls style={{ width: "100%" }} src={m.url} />}
                <div className="row" style={{ marginTop: 8 }}>
                  <a className="btn ghost" href={m.url} target="_blank" rel="noreferrer">Открыть в новой вкладке</a>
                  {m.test && !m.test.passed && (
                    <button className="btn primary" onClick={() => openTest(m.test.id)}>
                      Пройти тест «{m.test.title}»
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="muted">🔒 Заблокировано. Сдайте предыдущий тест.</div>
            )}
          </div>
        ))}
      </div>

      {test && (
        <TestModal data={test} onClose={() => setTest(null)}
                   onDone={() => { setTest(null); loadMaterials(); }} />
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