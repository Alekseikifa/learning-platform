export default function AttemptDetailsModal({ data, onClose }) {
  if (!data) return null;

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <div>
            <h3>Детали попытки</h3>
            <div className="muted small">
              {data.student_name && `Ученик: ${data.student_name} · `}
              Результат: <b>{data.score}%</b> ({data.passed ? "сдан" : "не сдан"})
            </div>
          </div>
          <button className="btn ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="list">
          {data.details &&
            data.details.map((q, idx) => (
              <div key={idx} className={"q " + (q.is_correct ? "" : "q-wrong")}>
                <div style={{ fontWeight: 500, marginBottom: 8 }}>
                  {idx + 1}. {q.question}
                </div>
                <div className="list">
                  {q.answers.map((ans) => {
                    let mark = "";
                    let cls = "ans-line";
                    if (ans.is_correct) {
                      cls += " ans-right";
                      mark = " ✓ (правильный ответ)";
                    }
                    if (ans.chosen && !ans.is_correct) {
                      cls += " ans-chosen-wrong";
                      mark = " ✗ (ответ ученика)";
                    } else if (ans.chosen && ans.is_correct) {
                      mark = " ✓ (выбран учеником)";
                    }
                    return (
                      <div key={ans.id} className={cls}>
                        <span style={{ fontWeight: ans.chosen ? "bold" : "normal" }}>
                          {ans.text}
                        </span>
                        {mark && <span className="small">{mark}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>

        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn primary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
