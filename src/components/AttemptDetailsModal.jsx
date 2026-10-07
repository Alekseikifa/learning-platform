import { useState } from "react";
import Modal from "./Modal";
import { api, getUser } from "../api";

export default function AttemptDetailsModal({ data, onClose, onUpdated }) {
  if (!data) return null;
  const [attemptData, setAttemptData] = useState(data);
  const [gradingQId, setGradingQId] = useState(null);
  const [resetting, setResetting] = useState(false);

  const user = getUser();
  const isStudentViewer = user?.role === "student";

  const handleGrade = async (questionId, isCorrect) => {
    if (!attemptData.attempt_id) return;
    setGradingQId(questionId);
    try {
      const res = await api(`/api/teacher/attempts/${attemptData.attempt_id}/grade-answer`, {
        method: "PUT",
        body: JSON.stringify({ question_id: questionId, is_correct: isCorrect }),
      });
      setAttemptData((prev) => ({
        ...prev,
        score: res.score,
        passed: res.passed,
        questions: prev.questions.map((q) => (q.id === questionId ? { ...q, is_correct: isCorrect } : q)),
      }));
      if (typeof window !== "undefined" && window.appToast) {
        window.appToast.success(`Оценка обновлена! Новый балл: ${res.score}% (${res.passed ? "зачёт" : "не зачёт"})`);
      }
      if (onUpdated) onUpdated();
    } catch (e) {
      if (typeof window !== "undefined" && window.appToast) {
        window.appToast.error(e.message || "Ошибка обновления оценки");
      }
    } finally {
      setGradingQId(null);
    }
  };

  const handleResetAttempts = async () => {
    if (!attemptData.user_id || !attemptData.test_id) return;
    if (!confirm(`Сбросить все попытки по этому тесту для ученика «${attemptData.student_name || ""}»? Ученик сможет пройти тест заново.`)) {
      return;
    }
    setResetting(true);
    try {
      await api(`/api/teacher/students/${attemptData.user_id}/tests/${attemptData.test_id}/reset-attempts`, {
        method: "POST",
      });
      if (typeof window !== "undefined" && window.appToast) {
        window.appToast.success("Попытки теста успешно сброшены!");
      }
      if (onUpdated) onUpdated();
      onClose();
    } catch (e) {
      if (typeof window !== "undefined" && window.appToast) {
        window.appToast.error(e.message || "Ошибка сброса попыток");
      }
      setResetting(false);
    }
  };

  return (
    <Modal onClose={onClose} innerStyle={{ maxWidth: 660 }}>
      <div className="spread" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, color: "var(--navy)" }}>Детали попытки</h3>
          <div className="muted small" style={{ marginTop: 4 }}>
            {attemptData.student_name && `Ученик: ${attemptData.student_name} · `}
            {attemptData.theme_title && `Тема: ${attemptData.theme_title} · `}
            Результат: <b>{attemptData.score}%</b> ({attemptData.passed ? "сдан" : "не сдан"})
          </div>
        </div>
        <button className="btn ghost" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
      </div>

      <div className="list" style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "65vh", overflowY: "auto", paddingRight: 4 }}>
        {attemptData.questions &&
          attemptData.questions.map((q, idx) => {
            const isTextQ = q.question_type === "text";

            return (
              <div
                key={idx}
                className={"q " + (q.is_correct ? "" : "q-wrong")}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: q.is_correct ? "1px solid #bbf7d0" : "1px solid #fecaca",
                  background: q.is_correct ? "#f0fdf4" : "#fef2f2",
                }}
              >
                <div className="spread" style={{ alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
                  <div style={{ fontWeight: 600, color: "var(--navy)" }}>
                    {idx + 1}. {q.question}
                  </div>
                  <span
                    className={"tag " + (q.is_correct ? "ok" : "no")}
                    style={{ fontSize: 11, padding: "2px 8px", flexShrink: 0 }}
                  >
                    {q.is_correct ? "✅ Верно" : "❌ Неверно"}
                  </span>
                </div>

                {isTextQ ? (
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    <div className="muted small" style={{ marginBottom: 2 }}>Письменный ответ ученика:</div>
                    <div
                      style={{
                        padding: "8px 10px",
                        background: "var(--surface)",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {q.text_answer ? q.text_answer : <span className="muted italic">(ответ не указан)</span>}
                    </div>
                    {!isStudentViewer && q.sample_answer && (
                      <div className="small muted" style={{ marginTop: 4 }}>
                        Ключевые фразы / образец: <b>«{q.sample_answer}»</b>
                      </div>
                    )}
                    {!isStudentViewer && q.id && (
                      <div
                        className="row"
                        style={{
                          marginTop: 10,
                          paddingTop: 8,
                          borderTop: "1px dashed rgba(0,0,0,0.1)",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span className="small muted" style={{ fontWeight: 600 }}>
                          Оценка декана/преподавателя:
                        </span>
                        <button
                          type="button"
                          className={"btn small " + (q.is_correct ? "primary" : "ghost")}
                          style={{
                            fontSize: 12,
                            padding: "3px 10px",
                            background: q.is_correct ? "var(--olive)" : "transparent",
                            borderColor: "var(--olive)",
                            color: q.is_correct ? "#fff" : "var(--olive)",
                          }}
                          disabled={gradingQId === q.id}
                          onClick={() => handleGrade(q.id, true)}
                        >
                          ✅ Зачесть ответ
                        </button>
                        <button
                          type="button"
                          className={"btn small " + (!q.is_correct ? "danger" : "ghost")}
                          style={{ fontSize: 12, padding: "3px 10px" }}
                          disabled={gradingQId === q.id}
                          onClick={() => handleGrade(q.id, false)}
                        >
                          ❌ Не засчитывать
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="list" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {(q.answers || []).map((ans) => {
                      let mark = "";
                      let cls = "ans-line";
                      let bg = "transparent";

                      // Если студент смотрит свой разбор:
                      // На неверно отвеченный вопрос скрываем, какой ответ верный!
                      const showRightAnswer = !isStudentViewer || q.is_correct;

                      if (ans.is_correct && showRightAnswer) {
                        cls += " ans-right";
                        mark = ans.chosen ? " ✓ (ваш верный выбор)" : " ✓ (правильный ответ)";
                        bg = "#dcfce7";
                      } else if (ans.chosen && !q.is_correct) {
                        cls += " ans-chosen-wrong";
                        mark = " ✗ (ваш выбор — неверно)";
                        bg = "#fee2e2";
                      } else if (ans.chosen && q.is_correct) {
                        mark = " ✓ (ваш выбор)";
                        bg = "#dcfce7";
                      }

                      return (
                        <div
                          key={ans.id}
                          className={cls}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 6,
                            background: bg,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span style={{ fontWeight: ans.chosen ? 600 : 400, color: "var(--navy)" }}>
                            {ans.text}
                          </span>
                          {mark && (
                            <span
                              className="small"
                              style={{
                                fontWeight: 600,
                                color: ans.chosen && !q.is_correct ? "#b91c1c" : "#15803d",
                              }}
                            >
                              {mark}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      <div className="spread" style={{ marginTop: 16, paddingTop: 10, borderTop: "1px solid var(--border)", alignItems: "center" }}>
        <div>
          {!isStudentViewer && attemptData.user_id && attemptData.test_id && (
            <button
              type="button"
              className="btn small ghost"
              style={{ color: "#d97706", borderColor: "#fde68a" }}
              disabled={resetting}
              onClick={handleResetAttempts}
              title="Дать ученику возможность пройти этот тест повторно"
            >
              🔄 Сбросить попытки по тесту для ученика
            </button>
          )}
        </div>
        <button className="btn primary" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </Modal>
  );
}
