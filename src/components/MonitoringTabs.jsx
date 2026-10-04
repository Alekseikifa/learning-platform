import { useEffect, useState } from "react";
import ChatPanel from "./ChatPanel";
import AttemptDetailsModal from "./AttemptDetailsModal";
import UnlockThemeModal from "./UnlockThemeModal";
import { api, getUser } from "../api";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

export function StudentsTab({ groupId, initialTheme, onThemeConsumed, onDirectMessage }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [chatFor, setChatFor] = useState(null);
  const [unlocking, setUnlocking] = useState(null);
  const [themes, setThemes] = useState([]);
  const [filterQuery, setFilterQuery] = useState("");
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

  const filteredStudents = students.filter((s) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (s.name || "").toLowerCase().includes(q) || (s.username || "").toLowerCase().includes(q);
  });

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Ученики группы ({students.length})</h3>
        {students.length > 3 && (
          <input
            type="search"
            placeholder="🔍 Поиск по ФИО или логину..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            style={{ maxWidth: 280, fontSize: 13 }}
          />
        )}
      </div>
      {loading && <div className="muted">Загрузка учеников…</div>}
      {err && <div style={{ color: "#dc2626" }}>Не удалось загрузить учеников: {err}</div>}
      {!loading && !err && !students.length && <div className="muted">В группе пока нет учеников</div>}
      <div className="table-wrap"><table className="table">
        <thead><tr><th>ФИО</th><th>Логин</th><th>Прогресс</th><th>Тестов сдано</th><th>Отчёты по урокам</th><th>Активность</th><th>Чат темы</th>{canUnlock && <th>Темы</th>}</tr></thead>
        <tbody>
          {filteredStudents.map(s => (
            <tr key={s.id}>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{s.name}</span>
                  {onDirectMessage && (
                    <button
                      type="button"
                      className="btn small ghost"
                      style={{ padding: "2px 6px", fontSize: 11 }}
                      onClick={() => onDirectMessage(s.id)}
                      title="Написать личное сообщение ученику"
                    >
                      💬
                    </button>
                  )}
                </div>
              </td>
              <td>{s.username}</td>
              <td style={{ minWidth: 160 }}>
                <div className="bar"><div style={{ width: s.progress + "%" }} /></div>
                <span className="muted small">{s.progress}%</span>
              </td>
              <td>{s.passed_tests}/{s.total_tests}</td>
              <td>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>
                    {s.reports_accepted || 0} / {s.total_lessons || s.total_themes || s.reports_count || 0} зачтено
                  </span>
                  {(s.reports_pending > 0 || (s.reports_count > (s.reports_accepted || 0))) && (
                    <span className="tag warn small" style={{ fontSize: 10, alignSelf: "flex-start", padding: "1px 5px" }}>
                      ⏳ {s.reports_pending ?? (s.reports_count - (s.reports_accepted || 0))} на проверке
                    </span>
                  )}
                </div>
              </td>
              <td className="muted small">{s.last_activity
                ? new Date(s.last_activity).toLocaleString("ru-RU") : "—"}</td>
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
          <ChatPanel themeId={chatFor} groupId={+groupId} apiBase="/api/teacher" />
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
  const [viewingReport, setViewingReport] = useState(null);
  const [viewingThemeReports, setViewingThemeReports] = useState(null);
  const [activeThemeReportMatId, setActiveThemeReportMatId] = useState(null);
  const [reviewComment, setReviewComment] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  const loadProgress = (cancelled = false) => {
    return api(`/api/teacher/groups/${groupId}/progress`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(e.message); });
  };

  useEffect(() => {
    let cancelled = false;
    setChatFor(null);
    setViewingReport(null);
    setViewingThemeReports(null);
    setData(null);
    setErr(null);
    loadProgress(cancelled);
    return () => { cancelled = true; };
  }, [groupId]);

  const handleReview = async (reportId, status, comment = "") => {
    try {
      await api(`/api/chat/messages/${reportId}/review-report`, {
        method: "POST",
        body: JSON.stringify({ status, comment }),
      });
      setViewingReport(null);
      setIsRejecting(false);
      setReviewComment("");
      loadProgress();
    } catch (e) {
      alert("Ошибка при проверке отчёта: " + e.message);
    }
  };

  const handleReviewThemeReport = async (reportId, status, comment = "") => {
    try {
      await api(`/api/chat/messages/${reportId}/review-report`, {
        method: "POST",
        body: JSON.stringify({ status, comment }),
      });
      if (viewingThemeReports) {
        setViewingThemeReports((prev) => {
          if (!prev) return null;
          const updatedMats = prev.materials_reports.map((mr) => {
            if (mr.report && mr.report.id === reportId) {
              return {
                ...mr,
                report: {
                  ...mr.report,
                  status,
                  comment: comment || null,
                  reviewed_at: new Date().toISOString(),
                },
              };
            }
            return mr;
          });
          const newAccepted = updatedMats.filter((mr) => mr.report?.status === "accepted").length;
          return {
            ...prev,
            materials_reports: updatedMats,
            accepted_lessons: newAccepted,
          };
        });
      }
      setIsRejecting(false);
      setReviewComment("");
      loadProgress();
    } catch (e) {
      alert("Ошибка при проверке отчёта: " + e.message);
    }
  };

  if (err) return <div className="card" style={{ color: "#dc2626" }}>Не удалось загрузить прогресс: {err}</div>;
  if (!data) return <div className="card muted">Загрузка...</div>;

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div className="spread" style={{ marginBottom: 10, alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Прогресс по темам и отчётам</h3>
        <span className="muted small">Нажмите на бейдж 📝 отчёта для быстрой проверки</span>
      </div>
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
              {s.cells.map(c => {
                const thObj = data.themes.find((t) => t.id === c.theme_id);
                return (
                  <td key={c.theme_id} style={{ textAlign: "center", minWidth: 105, padding: "8px 6px" }}>
                    {/* Статус проверочного теста */}
                    <div>
                      {c.status === "no_test" && <span className="muted small" style={{ fontSize: 11 }}>—</span>}
                      {c.status === "not_started" && <span className="muted small" style={{ fontSize: 11 }}>тест: не начат</span>}
                      {c.status === "failed" && (
                        <span title={`Попыток: ${c.attempts}, лучший: ${c.best_score}%`}>
                          <span className="tag no" style={{ fontSize: 11, padding: "2px 6px" }}>❌ {c.attempts} поп.</span>
                        </span>
                      )}
                      {c.status === "passed" && (
                        <span title={`Попыток: ${c.attempts}, лучший: ${c.best_score}%`}>
                          <span className="tag ok" style={{ fontSize: 11, padding: "2px 6px" }}>✅ {c.best_score}%</span>
                        </span>
                      )}
                    </div>

                    {/* Статус отчёта по уроку */}
                    <div style={{ marginTop: 4 }}>
                      {c.materials_reports && c.materials_reports.length > 0 ? (
                        c.materials_reports.length === 1 ? (
                          // Одиночный урок в теме
                          (() => {
                            const mr = c.materials_reports[0];
                            const rep = mr.report;
                            if (!rep) {
                              return (
                                <span className="muted small" style={{ fontSize: 10, opacity: 0.5 }} title="Отчёт по уроку не сдан">
                                  📝—
                                </span>
                              );
                            }
                            return (
                              <button
                                type="button"
                                className={"report-cell-badge " + (rep.status || "pending")}
                                onClick={() => {
                                  setViewingThemeReports({
                                    student_name: s.name,
                                    theme_title: thObj?.title || "Урок",
                                    theme_id: c.theme_id,
                                    materials_reports: c.materials_reports,
                                    total_lessons: c.total_lessons,
                                    accepted_lessons: c.accepted_lessons,
                                  });
                                  setActiveThemeReportMatId(mr.material_id);
                                  setIsRejecting(false);
                                  setReviewComment(rep.comment || "");
                                }}
                                title={`Урок №${mr.material_order_index}: «${mr.material_title}» — ${rep.status === "accepted" ? "Зачтён" : rep.status === "rejected" ? "На доработке" : "Ожидает проверки"}. Нажмите для проверки`}
                              >
                                {rep.status === "accepted"
                                  ? "📝✅ Зачтён"
                                  : rep.status === "rejected"
                                  ? "📝🔄 Доработка"
                                  : "📝⏳ Проверить"}
                              </button>
                            );
                          })()
                        ) : (
                          // Несколько уроков в теме: компактные кнопки для каждого урока (У1, У2, У3...)
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center", alignItems: "center" }}>
                            {c.materials_reports.map((mr) => {
                              const rep = mr.report;
                              const status = rep ? rep.status : "none";
                              const label = `У${mr.material_order_index}`;
                              const icon = status === "accepted" ? "✅" : status === "rejected" ? "🔄" : status === "pending" ? "⏳" : "—";
                              return (
                                <button
                                  key={mr.material_id}
                                  type="button"
                                  className={"report-cell-badge " + (status === "none" ? "empty" : status)}
                                  style={{
                                    fontSize: 10,
                                    padding: "2px 4px",
                                    lineHeight: "13px",
                                    cursor: "pointer",
                                    opacity: status === "none" ? 0.5 : 1,
                                    borderRadius: 4,
                                  }}
                                  onClick={() => {
                                    setViewingThemeReports({
                                      student_name: s.name,
                                      theme_title: thObj?.title || "Урок",
                                      theme_id: c.theme_id,
                                      materials_reports: c.materials_reports,
                                      total_lessons: c.total_lessons,
                                      accepted_lessons: c.accepted_lessons,
                                    });
                                    setActiveThemeReportMatId(mr.material_id);
                                    setIsRejecting(false);
                                    setReviewComment(rep?.comment || "");
                                  }}
                                  title={`Урок ${mr.material_order_index}: «${mr.material_title}» — ${status === "accepted" ? "Зачтён ✅" : status === "rejected" ? "На доработке 🔄" : status === "pending" ? "Ожидает проверки ⏳" : "Не сдан 📝"}. Нажмите для проверки`}
                                >
                                  {label}:{icon}
                                </button>
                              );
                            })}
                          </div>
                        )
                      ) : c.report ? (
                        <button
                          type="button"
                          className={"report-cell-badge " + (c.report.status || "pending")}
                          onClick={() => {
                            setViewingReport({
                              ...c.report,
                              student_name: s.name,
                              theme_title: thObj?.title || "Урок",
                              theme_id: c.theme_id,
                            });
                            setIsRejecting(false);
                            setReviewComment(c.report.comment || "");
                          }}
                          title={`Отчёт по уроку: ${c.report.status === "accepted" ? "Зачтён" : c.report.status === "rejected" ? "На доработке" : "Ожидает проверки"}. Нажмите для проверки`}
                        >
                          {c.report.status === "accepted"
                            ? "📝✅ Зачтён"
                            : c.report.status === "rejected"
                            ? "📝🔄 Доработка"
                            : "📝⏳ Проверить"}
                        </button>
                      ) : (
                        <span className="muted small" style={{ fontSize: 10, opacity: 0.5 }} title="Отчёт по уроку не сдан">
                          📝—
                        </span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table></div>

      {/* Модальное окно проверки отчётов по урокам темы */}
      {viewingThemeReports && (
        <div className="modal-back" onClick={() => setViewingThemeReports(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="spread" style={{ marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0 }}>📝 Отчёты по теме</h3>
                <div className="muted small" style={{ marginTop: 2 }}>
                  Ученик: <b>{viewingThemeReports.student_name}</b> · Тема: <b>{viewingThemeReports.theme_title}</b>
                </div>
                <div style={{ fontSize: 12, color: "var(--olive)", fontWeight: 600, marginTop: 2 }}>
                  Зачтено уроков: {viewingThemeReports.accepted_lessons || 0} из {viewingThemeReports.total_lessons || viewingThemeReports.materials_reports.length}
                </div>
              </div>
              <button type="button" className="btn ghost" onClick={() => setViewingThemeReports(null)}>✕</button>
            </div>

            {/* Вкладки переключения между уроками темы */}
            <div style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              paddingBottom: 10,
              marginBottom: 14,
              borderBottom: "1px solid var(--border)",
            }}>
              {viewingThemeReports.materials_reports.map((mr) => {
                const rep = mr.report;
                const status = rep ? rep.status : "none";
                const icon = status === "accepted" ? "✅" : status === "pending" ? "⏳" : status === "rejected" ? "🔄" : "";
                const isSelected = (activeThemeReportMatId || viewingThemeReports.materials_reports[0]?.material_id) === mr.material_id;
                return (
                  <button
                    key={mr.material_id}
                    type="button"
                    className={"btn small " + (isSelected ? "gold" : "ghost")}
                    style={{
                      padding: "5px 12px",
                      fontSize: 12,
                      fontWeight: isSelected ? 700 : 500,
                      borderColor: isSelected ? "#b45309" : "#cbd5e1",
                      background: isSelected ? "#fef3c7" : "#fff",
                      color: isSelected ? "#78350f" : "var(--navy)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                    onClick={() => {
                      setActiveThemeReportMatId(mr.material_id);
                      setIsRejecting(false);
                      setReviewComment(rep?.comment || "");
                    }}
                  >
                    <span>Урок {mr.material_order_index}</span>
                    {icon && <span>{icon}</span>}
                  </button>
                );
              })}
            </div>

            {/* Карточка выбранного урока */}
            {(() => {
              const activeMr = viewingThemeReports.materials_reports.find(
                (mr) => mr.material_id === (activeThemeReportMatId || viewingThemeReports.materials_reports[0]?.material_id)
              ) || viewingThemeReports.materials_reports[0];

              if (!activeMr) return null;

              return (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
                    <b style={{ fontSize: 14, color: "var(--navy)" }}>
                      🎯 Урок №{activeMr.material_order_index}: «{activeMr.material_title}»
                    </b>
                    {activeMr.report ? (
                      <span className={"tag " + (activeMr.report.status === "accepted" ? "ok" : activeMr.report.status === "rejected" ? "no" : "warn")}>
                        {activeMr.report.status === "accepted" ? "✅ Зачтено" : activeMr.report.status === "rejected" ? "🔄 На доработке" : "⏳ Ожидает проверки"}
                      </span>
                    ) : (
                      <span className="tag small" style={{ background: "#f3f4f6", color: "#6b7280" }}>
                        ⚪ Отчёт ещё не сдан
                      </span>
                    )}
                  </div>

                  {activeMr.report ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-soft)", marginBottom: 8 }}>
                        <span>Сдан: {new Date(activeMr.report.created_at).toLocaleString("ru-RU")}</span>
                        {activeMr.report.reviewed_by_name && (
                          <span>Проверил(а): {activeMr.report.reviewed_by_name}</span>
                        )}
                      </div>

                      <div style={{ background: "var(--bg-soft)", padding: 12, borderRadius: 8, border: "1px solid var(--border)", marginBottom: 12 }}>
                        <b style={{ fontSize: 12, color: "var(--text-soft)" }}>Текст отчёта ученика:</b>
                        <div style={{ whiteSpace: "pre-wrap", marginTop: 6, fontSize: 14, color: "var(--navy)", lineHeight: 1.5 }}>
                          {activeMr.report.text}
                        </div>
                      </div>

                      {activeMr.report.comment && !isRejecting && (
                        <div style={{ background: "#fffbeb", padding: 10, borderRadius: 6, borderLeft: "3px solid #f59e0b", marginBottom: 12, fontSize: 13 }}>
                          <b>Замечание куратора:</b> {activeMr.report.comment}
                        </div>
                      )}

                      {isRejecting ? (
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                            Укажите замечания для доработки по этому уроку:
                          </label>
                          <textarea
                            rows={3}
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            placeholder="Что именно требуется исправить или дополнить по этому уроку..."
                            style={{ width: "100%", boxSizing: "border-box", fontSize: 13 }}
                          />
                          <div className="row" style={{ marginTop: 8, justifyContent: "flex-end", gap: 8 }}>
                            <button type="button" className="btn ghost small" onClick={() => setIsRejecting(false)}>
                              Отмена
                            </button>
                            <button
                              type="button"
                              className="btn danger small"
                              onClick={() => handleReviewThemeReport(activeMr.report.id, "rejected", reviewComment)}
                            >
                              Вернуть на доработку с комментарием
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="spread" style={{ flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                          <button
                            type="button"
                            className="btn ghost small"
                            onClick={() => {
                              const tid = viewingThemeReports.theme_id;
                              setViewingThemeReports(null);
                              setChatFor(tid);
                            }}
                          >
                            💬 Открыть чат темы
                          </button>
                          <div className="row" style={{ gap: 8 }}>
                            {activeMr.report.status !== "rejected" && (
                              <button
                                type="button"
                                className="btn danger small"
                                onClick={() => {
                                  setIsRejecting(true);
                                  setReviewComment(activeMr.report.comment || "");
                                }}
                              >
                                🔄 Вернуть на доработку
                              </button>
                            )}
                            {activeMr.report.status !== "accepted" && (
                              <button
                                type="button"
                                className="btn primary small"
                                style={{ background: "var(--olive)", borderColor: "var(--olive)" }}
                                onClick={() => handleReviewThemeReport(activeMr.report.id, "accepted")}
                              >
                                ✅ Зачесть этот урок
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ padding: "20px 0", textAlign: "center" }}>
                      <div className="muted" style={{ marginBottom: 12 }}>
                        По уроку №{activeMr.material_order_index} «{activeMr.material_title}» ученик ещё не отправлял отчёт.
                      </div>
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => {
                          const tid = viewingThemeReports.theme_id;
                          setViewingThemeReports(null);
                          setChatFor(tid);
                        }}
                      >
                        💬 Перейти в обсуждение темы
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Модальное окно быстрой проверки одиночного отчёта */}
      {viewingReport && (
        <div className="modal-back" onClick={() => setViewingReport(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="spread" style={{ marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0 }}>📝 Отчёт по уроку</h3>
                <div className="muted small">
                  Ученик: <b>{viewingReport.student_name}</b> · Тема: <b>{viewingReport.theme_title}</b>
                  {viewingReport.material_title && (
                    <div style={{ color: "var(--olive)", fontWeight: 600, marginTop: 2 }}>
                      🎯 Урок {viewingReport.material_order_index ? `№${viewingReport.material_order_index} ` : ""}: «{viewingReport.material_title}»
                    </div>
                  )}
                </div>
              </div>
              <button type="button" className="btn ghost" onClick={() => setViewingReport(null)}>✕</button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span className="muted small">Статус:</span>
              <span className={"tag " + (viewingReport.status === "accepted" ? "ok" : viewingReport.status === "rejected" ? "no" : "warn")}>
                {viewingReport.status === "accepted" ? "✅ Зачтено" : viewingReport.status === "rejected" ? "🔄 На доработке" : "⏳ Ожидает проверки"}
              </span>
              <span className="muted small" style={{ marginLeft: "auto" }}>
                {new Date(viewingReport.created_at).toLocaleString("ru-RU")}
              </span>
            </div>

            <div style={{ background: "var(--bg-soft)", padding: 12, borderRadius: 8, border: "1px solid var(--border)", marginBottom: 14 }}>
              <b>Текст отчёта ученика:</b>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 6, fontSize: 14, color: "var(--navy)" }}>
                {viewingReport.text}
              </div>
            </div>

            {viewingReport.comment && !isRejecting && (
              <div style={{ background: "#fffbeb", padding: 10, borderRadius: 8, borderLeft: "3px solid #f59e0b", marginBottom: 14, fontSize: 13 }}>
                <b>Текущий комментарий:</b> {viewingReport.comment}
              </div>
            )}

            {isRejecting ? (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                  Укажите замечания для доработки отчёта:
                </label>
                <textarea
                  rows={3}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Опишите, что именно требуется исправить или дополнить..."
                  style={{ width: "100%", boxSizing: "border-box", fontSize: 13 }}
                />
                <div className="row" style={{ marginTop: 8, justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" className="btn ghost small" onClick={() => setIsRejecting(false)}>
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="btn danger small"
                    onClick={() => handleReview(viewingReport.id, "rejected", reviewComment)}
                  >
                    Вернуть на доработку с комментарием
                  </button>
                </div>
              </div>
            ) : (
              <div className="spread" style={{ flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => {
                    const tid = viewingReport.theme_id;
                    setViewingReport(null);
                    setChatFor(tid);
                  }}
                >
                  💬 Открыть обсуждение урока
                </button>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="btn danger small"
                    onClick={() => setIsRejecting(true)}
                  >
                    🔄 Вернуть на доработку
                  </button>
                  <button
                    type="button"
                    className="btn primary small"
                    style={{ background: "var(--olive)", borderColor: "var(--olive)" }}
                    onClick={() => handleReview(viewingReport.id, "accepted")}
                  >
                    ✅ Зачесть отчёт
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
          <ChatPanel themeId={chatFor} groupId={+groupId} apiBase="/api/teacher" />
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
      if (typeof window !== "undefined" && window.appToast) {
        window.appToast.error(e.message);
      }
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

export function ReportsTab({ groupId }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [themeFilter, setThemeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewingReport, setReviewingReport] = useState(null);
  const [reviewComment, setReviewComment] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [chatTheme, setChatTheme] = useState(null);

  const load = () => {
    setLoading(true);
    setErr(null);
    api(`/api/teacher/groups/${groupId}/reports`)
      .then((data) => setReports(data))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [groupId]);

  const handleReview = async (reportId, status, comment = "") => {
    try {
      await api(`/api/chat/messages/${reportId}/review-report`, {
        method: "POST",
        body: JSON.stringify({ status, comment }),
      });
      setReviewingReport(null);
      setIsRejecting(false);
      setReviewComment("");
      load();
    } catch (e) {
      alert("Ошибка при проверке отчёта: " + e.message);
    }
  };

  const countPending = reports.filter((r) => r.status === "pending").length;
  const countAccepted = reports.filter((r) => r.status === "accepted").length;
  const countRejected = reports.filter((r) => r.status === "rejected").length;
  const availableThemes = Array.from(new Set(reports.map((r) => r.theme_title).filter(Boolean)));

  const filtered = reports.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (themeFilter !== "all" && r.theme_title !== themeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (r.student_name || "").toLowerCase().includes(q);
      const matchLogin = (r.student_username || "").toLowerCase().includes(q);
      const matchTheme = (r.theme_title || "").toLowerCase().includes(q);
      const matchMaterial = (r.material_title || "").toLowerCase().includes(q);
      const matchLessonNum = r.material_order_index && `урок ${r.material_order_index}`.toLowerCase().includes(q);
      const matchText = (r.text || "").toLowerCase().includes(q);
      if (!matchName && !matchLogin && !matchTheme && !matchMaterial && !matchLessonNum && !matchText) return false;
    }
    return true;
  });

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 16, flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0 }}>📝 Отчёты учеников по урокам</h3>
          <div className="muted small">
            Контроль и проверка практических отчётов, присланных учениками в обсуждениях уроков
          </div>
        </div>
        <button type="button" className="btn ghost small" onClick={load} title="Обновить список отчётов">
          🔄 Обновить
        </button>
      </div>

      {/* Сводные показатели */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
        <div
          onClick={() => setStatusFilter("pending")}
          style={{
            padding: "10px 14px",
            background: statusFilter === "pending" ? "#fef3c7" : "#fffbeb",
            borderRadius: 8,
            border: "1px solid #f59e0b",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 11, color: "#92400e", fontWeight: 600 }}>⏳ На проверке</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#b45309" }}>{countPending}</div>
        </div>
        <div
          onClick={() => setStatusFilter("accepted")}
          style={{
            padding: "10px 14px",
            background: statusFilter === "accepted" ? "#dcfce7" : "#f0fdf4",
            borderRadius: 8,
            border: "1px solid #22c55e",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 11, color: "#166534", fontWeight: 600 }}>✅ Зачтено</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#15803d" }}>{countAccepted}</div>
        </div>
        <div
          onClick={() => setStatusFilter("rejected")}
          style={{
            padding: "10px 14px",
            background: statusFilter === "rejected" ? "#fee2e2" : "#fef2f2",
            borderRadius: 8,
            border: "1px solid #ef4444",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 11, color: "#991b1b", fontWeight: 600 }}>🔄 На доработке</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#b91c1c" }}>{countRejected}</div>
        </div>
        <div
          onClick={() => setStatusFilter("all")}
          style={{
            padding: "10px 14px",
            background: statusFilter === "all" ? "var(--bg-soft)" : "var(--surface)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--text-soft)", fontWeight: 600 }}>📝 Всего отчётов</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--navy)" }}>{reports.length}</div>
        </div>
      </div>

      {/* Фильтры и поиск */}
      <div className="spread" style={{ marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            className={"btn small " + (statusFilter === "all" ? "primary" : "ghost")}
            onClick={() => setStatusFilter("all")}
          >
            Все ({reports.length})
          </button>
          <button
            type="button"
            className={"btn small " + (statusFilter === "pending" ? "primary" : "ghost")}
            onClick={() => setStatusFilter("pending")}
          >
            ⏳ На проверке ({countPending})
          </button>
          <button
            type="button"
            className={"btn small " + (statusFilter === "accepted" ? "primary" : "ghost")}
            onClick={() => setStatusFilter("accepted")}
          >
            ✅ Зачтены ({countAccepted})
          </button>
          <button
            type="button"
            className={"btn small " + (statusFilter === "rejected" ? "primary" : "ghost")}
            onClick={() => setStatusFilter("rejected")}
          >
            🔄 На доработке ({countRejected})
          </button>
        </div>

        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {availableThemes.length > 1 && (
            <select
              value={themeFilter}
              onChange={(e) => setThemeFilter(e.target.value)}
              style={{ fontSize: 13, padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", maxWidth: 220 }}
            >
              <option value="all">Все темы ({reports.length})</option>
              {availableThemes.map((th) => (
                <option key={th} value={th}>
                  {th}
                </option>
              ))}
            </select>
          )}

          <input
            type="search"
            placeholder="🔍 Поиск по ученику или уроку..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ maxWidth: 280, fontSize: 13 }}
          />
        </div>
      </div>

      {loading && <div className="muted">Загрузка отчётов…</div>}
      {err && <div style={{ color: "#dc2626" }}>Не удалось загрузить отчёты: {err}</div>}
      {!loading && !err && reports.length === 0 && (
        <div className="muted" style={{ padding: "20px 0" }}>
          В этой группе пока нет присланных отчётов по урокам. Ученики могут отправлять отчёты в чате обсуждения урока, отметив галочку «Сдать как отчёт по уроку».
        </div>
      )}
      {!loading && !err && reports.length > 0 && filtered.length === 0 && (
        <div className="muted">По выбранному фильтру отчётов не найдено</div>
      )}

      {/* Список отчётов */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map((r) => (
          <div
            key={r.id}
            style={{
              padding: 14,
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: r.status === "pending" ? "#fffdf5" : "var(--surface)",
              borderLeft: r.status === "accepted" ? "4px solid var(--olive)" : r.status === "rejected" ? "4px solid var(--danger)" : "4px solid #f59e0b",
            }}
          >
            <div className="spread" style={{ marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 15, color: "var(--navy)" }}>
                  {r.student_name}
                </span>
                {r.student_username && (
                  <span className="muted small" style={{ marginLeft: 6 }}>
                    (@{r.student_username})
                  </span>
                )}
                <div style={{ fontSize: 13, color: "var(--navy)", marginTop: 2 }}>
                  Тема: <b>{r.theme_order_index ? `${r.theme_order_index}. ` : ""}{r.theme_title}</b>
                </div>
                {r.material_title && (
                  <div style={{ marginTop: 4 }}>
                    <span className="tag" style={{ background: "#fef3c7", color: "#92400e", fontWeight: 700, borderColor: "#fde68a", fontSize: 12 }}>
                      🎯 Урок {r.material_order_index ? `№${r.material_order_index}` : ""}: «{r.material_title}»
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={"tag " + (r.status === "accepted" ? "ok" : r.status === "rejected" ? "no" : "warn")}>
                  {r.status === "accepted" ? "✅ Зачтено" : r.status === "rejected" ? "🔄 Требует доработки" : "⏳ Ожидает проверки"}
                </span>
                <span className="muted small" style={{ fontSize: 11 }}>
                  {new Date(r.created_at).toLocaleString("ru-RU")}
                </span>
              </div>
            </div>

            {/* Текст отчёта */}
            <div
              style={{
                background: "var(--bg-soft)",
                padding: "10px 14px",
                borderRadius: 8,
                whiteSpace: "pre-wrap",
                fontSize: 13,
                color: "var(--navy)",
                margin: "8px 0",
              }}
            >
              {r.text}
            </div>

            {/* Замечания куратора */}
            {r.comment && (
              <div
                style={{
                  background: "#fffbeb",
                  padding: "8px 12px",
                  borderRadius: 6,
                  borderLeft: "3px solid #f59e0b",
                  fontSize: 12,
                  marginBottom: 8,
                }}
              >
                <b>Замечание куратора:</b> {r.comment}
                {r.reviewer_name && (
                  <span className="muted small" style={{ marginLeft: 8 }}>
                    (проверил: {r.reviewer_name})
                  </span>
                )}
              </div>
            )}

            {/* Действия */}
            <div className="spread" style={{ flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setChatTheme({ id: r.theme_id, title: r.theme_title })}
              >
                💬 Открыть обсуждение урока
              </button>

              <div className="row" style={{ gap: 6 }}>
                {r.status !== "accepted" && (
                  <button
                    type="button"
                    className="btn small"
                    style={{ background: "var(--olive-soft)", color: "var(--olive)", borderColor: "var(--olive)" }}
                    onClick={() => handleReview(r.id, "accepted")}
                  >
                    ✅ Зачесть отчёт
                  </button>
                )}
                {r.status !== "rejected" && (
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={() => {
                      setReviewingReport(r);
                      setIsRejecting(true);
                      setReviewComment(r.comment || "");
                    }}
                  >
                    🔄 На доработку
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Модальное окно комментария к доработке */}
      {reviewingReport && isRejecting && (
        <div className="modal-back" onClick={() => setReviewingReport(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="spread" style={{ marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Вернуть отчёт на доработку</h3>
              <button type="button" className="btn ghost" onClick={() => setReviewingReport(null)}>✕</button>
            </div>
            <p className="muted small" style={{ margin: "4px 0 10px" }}>
              Ученик: <b>{reviewingReport.student_name}</b> · Урок: <b>{reviewingReport.theme_title}</b>
            </p>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
              Укажите комментарий / что требуется исправить:
            </label>
            <textarea
              rows={4}
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Например: Пожалуйста, дополните выводы по практической части..."
              style={{ width: "100%", boxSizing: "border-box", fontSize: 13 }}
            />
            <div className="row" style={{ marginTop: 10, justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn ghost small" onClick={() => setReviewingReport(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="btn danger small"
                onClick={() => handleReview(reviewingReport.id, "rejected", reviewComment)}
              >
                Отправить на доработку
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка открытия чата темы */}
      {chatTheme && (
        <div className="modal-back" onClick={() => setChatTheme(null)}>
          <div className="modal" style={{ maxWidth: 650 }} onClick={(e) => e.stopPropagation()}>
            <div className="spread" style={{ marginBottom: 10 }}>
              <b>Обсуждение урока: {chatTheme.title}</b>
              <button type="button" className="btn ghost" onClick={() => setChatTheme(null)}>✕</button>
            </div>
            <ChatPanel themeId={chatTheme.id} groupId={+groupId} apiBase="/api/teacher" />
          </div>
        </div>
      )}
    </div>
  );
}
