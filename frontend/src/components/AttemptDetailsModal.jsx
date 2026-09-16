export default function AttemptDetailsModal({ data, onClose }) {
  return (
    <div className="modal-back">
      <div className="card modal">
        <div className="spread">
          <h3>Ответы: {data.test_title}</h3>
          <button className="btn ghost" onClick={onClose}>✕</button>
        </div>
        <div className="muted small">
          {data.student_name && <span>Ученик: <b>{data.student_name}</b> · </span>}
          Результат: <b>{data.score}%</b> ·{" "}
          {data.passed ? "сдан" : "не сдан"} ·{" "}
          {new Date(data.created_at).toLocaleString()}
        </div>
        <div style={{ marginTop: 10 }}>
          {data.questions.map((q, i) => (
            <div className={"q " + (q.is_correct ? "" : "q-wrong")} key={i}>
              <div className="spread">
                <b>{i + 1}. {q.question}</b>
                <span className={"tag " + (q.is_correct ? "ok" : "no")}>
                  {q.is_correct ? "верно" : "неверно"}
                </span>
              </div>
              <ul style={{ listStyle: "none", padding: 0 }}>
                {q.answers.map(a => {
                  const cls = a.is_correct ? "ans-right"
                            : a.chosen ? "ans-chosen-wrong" : "";
                  return (
                    <li key={a.id} className={"ans-line " + cls}>
                      {a.is_correct ? "✅ " : a.chosen ? "❌ " : "▫️ "}
                      {a.text}
                      {a.chosen && !a.is_correct && <i> — ваш выбор</i>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}