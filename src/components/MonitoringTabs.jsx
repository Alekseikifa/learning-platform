import { useEffect, useMemo, useState } from "react";
import ChatPanel from "./ChatPanel";
import AttemptDetailsModal from "./AttemptDetailsModal";
import { api } from "../api";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

export function AttemptsTab({ groupId }) {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [details, setDetails] = useState(null);
  const [themeFilter, setThemeFilter] = useState("");
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  const loadAttempts = () => {
    setLoading(true);
    setErr(null);
    api(`/api/teacher/groups/${groupId}/attempts`)
      .then((a) => setAttempts(a))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setThemeFilter("");
    setDetails(null);
    loadAttempts();
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
              <td>
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn small" onClick={() => openDetails(a.id)}>
                    Ответы ученика
                  </button>
                  {a.user_id && a.test_id && (
                    <button
                      type="button"
                      className="btn small ghost"
                      style={{ color: "#d97706", borderColor: "#fde68a" }}
                      title="Сбросить попытки по этому тесту для ученика"
                      onClick={async () => {
                        if (!confirm(`Сбросить все попытки теста «${a.test}» для ученика «${a.student}»?`)) return;
                        try {
                          await api(`/api/teacher/students/${a.user_id}/tests/${a.test_id}/reset-attempts`, { method: "POST" });
                          if (typeof window !== "undefined" && window.appToast) {
                            window.appToast.success("Попытки сброшены!");
                          }
                          loadAttempts();
                        } catch (e) {
                          if (typeof window !== "undefined" && window.appToast) {
                            window.appToast.error(e.message || "Ошибка сброса");
                          }
                        }
                      }}
                    >
                      🔄 Сбросить
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {details && <AttemptDetailsModal data={details} onClose={() => setDetails(null)} onUpdated={loadAttempts} />}
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


export function ReviewTab({ groupId, initialStudentId, initialThemeId, onFilterConsumed }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [themeFilter, setThemeFilter] = useState("all");
  const [studentFilter, setStudentFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [idx, setIdx] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [chatTheme, setChatTheme] = useState(null);
  const [busy, setBusy] = useState(false);

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

  // глубокие ссылки из «Прогресса» (?student=&theme=)
  useEffect(() => {
    if (!initialStudentId && !initialThemeId) return;
    if (initialStudentId) setStudentFilter(Number(initialStudentId));
    if (initialThemeId) setThemeFilter(String(initialThemeId));
    if (onFilterConsumed) onFilterConsumed();
  }, [initialStudentId, initialThemeId]);

  const handleReview = async (reportId, status, comment = "") => {
    setBusy(true);
    try {
      await api(`/api/chat/messages/${reportId}/review-report`, {
        method: "POST",
        body: JSON.stringify({ status, comment }),
      });
      setIsRejecting(false);
      setReviewComment("");
      load();
    } catch (e) {
      alert("Ошибка при проверке отчёта: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const countPending = reports.filter((r) => r.status === "pending").length;
  const countAccepted = reports.filter((r) => r.status === "accepted").length;
  const countRejected = reports.filter((r) => r.status === "rejected").length;

  const themeOptions = useMemo(() => {
    const m = new Map();
    reports.forEach((r) => {
      if (r.theme_id && !m.has(r.theme_id)) m.set(r.theme_id, r.theme_title);
    });
    return [...m.entries()].map(([id, title]) => ({ id, title }));
  }, [reports]);

  const filtered = reports.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (themeFilter !== "all" && String(r.theme_id) !== String(themeFilter)) return false;
    if (studentFilter && Number(r.user_id) !== Number(studentFilter)) return false;
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

  const safeIdx = filtered.length ? Math.min(idx, filtered.length - 1) : 0;
  const current = filtered[safeIdx] || null;
  const studentFilterName = studentFilter
    ? (reports.find((r) => r.user_id === studentFilter) || {}).student_name
    : null;

  useEffect(() => {
    if (idx !== safeIdx) setIdx(safeIdx);
  }, [idx, safeIdx]);

  useEffect(() => {
    setIsRejecting(false);
    setReviewComment(current ? current.comment || "" : "");
  }, [safeIdx, current && current.id]);

  const go = (delta) => {
    const next = Math.min(Math.max(safeIdx + delta, 0), Math.max(filtered.length - 1, 0));
    setIdx(next);
    const el = document.getElementById("review-workspace");
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const clearFilters = () => {
    setStatusFilter("pending");
    setThemeFilter("all");
    setStudentFilter(null);
    setSearchQuery("");
  };

  const kpiCard = (label, value, tone, active, onClick) => (
    <button
      type="button"
      className="kpi-tile"
      data-active={active}
      onClick={onClick}
      style={tone === "pending"
        ? { background: active ? "#fef3c7" : "#fffbeb", borderColor: "#f59e0b" }
        : tone === "accepted"
        ? { background: active ? "#dcfce7" : "#f0fdf4", borderColor: "#22c55e" }
        : tone === "rejected"
        ? { background: active ? "#fee2e2" : "#fef2f2", borderColor: "#ef4444" }
        : {}}
    >
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </button>
  );

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 16, flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0 }}>✅ Проверка отчётов</h3>
          <div className="muted small">
            Очередь практических отчётов: смотрите отчёт, зачитывайте или возвращайте на доработку, переходите к следующему
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {studentFilter && (
            <button
              type="button"
              className="chip"
              onClick={() => setStudentFilter(null)}
              title="Снять фильтр по ученику"
            >
              Ученик: {studentFilterName || studentFilter} ✕
            </button>
          )}
          <button type="button" className="btn ghost small" onClick={load} title="Обновить список отчётов">
            🔄 Обновить
          </button>
        </div>
      </div>

      {/* Сводные показатели = фильтры очереди */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
        {kpiCard("⏳ На проверке", countPending, "pending", statusFilter === "pending", () => setStatusFilter("pending"))}
        {kpiCard("✅ Зачтено", countAccepted, "accepted", statusFilter === "accepted", () => setStatusFilter("accepted"))}
        {kpiCard("🔄 На доработке", countRejected, "rejected", statusFilter === "rejected", () => setStatusFilter("rejected"))}
        {kpiCard("📝 Всего отчётов", reports.length, "", statusFilter === "all", () => setStatusFilter("all"))}
      </div>

      {/* Фильтры и поиск */}
      <div className="spread" style={{ marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <span className="muted small">Очередь:</span>
          <button type="button" className={"btn small " + (statusFilter === "all" ? "primary" : "ghost")} onClick={() => setStatusFilter("all")}>
            Все ({reports.length})
          </button>
          <button type="button" className={"btn small " + (statusFilter === "pending" ? "primary" : "ghost")} onClick={() => setStatusFilter("pending")}>
            ⏳ На проверке ({countPending})
          </button>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {themeOptions.length > 1 && (
            <select
              value={themeFilter}
              onChange={(e) => setThemeFilter(e.target.value)}
              style={{ fontSize: 13, padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", maxWidth: 220 }}
            >
              <option value="all">Все темы ({reports.length})</option>
              {themeOptions.map((th) => (
                <option key={th.id} value={th.id}>{th.title}</option>
              ))}
            </select>
          )}
          <input
            type="search"
            placeholder="🔍 Поиск по ученику или уроку…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ maxWidth: 280, fontSize: 13 }}
          />
          {(statusFilter !== "all" && statusFilter !== "pending" || themeFilter !== "all" || studentFilter || searchQuery) && (
            <button type="button" className="btn ghost small" onClick={clearFilters}>Сбросить фильтры ✕</button>
          )}
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
        <div className="muted" style={{ padding: "16px 0" }}>
          По выбранному фильтру отчётов нет.{" "}
          {statusFilter === "pending" && <button type="button" className="btn ghost small" onClick={() => setStatusFilter("all")}>Показать все отчёты</button>}
        </div>
      )}

      {/* Рабочее место проверки */}
      {!loading && !err && current && (
        <div className="review-workspace" id="review-workspace">
          <div className="spread" style={{ flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <span className="tag">{safeIdx + 1} из {filtered.length}</span>
              <button type="button" className="btn small ghost" onClick={() => go(-1)} disabled={safeIdx === 0} title="Предыдущий отчёт">← Пред.</button>
              <button type="button" className="btn small ghost" onClick={() => go(1)} disabled={safeIdx >= filtered.length - 1} title="Следующий отчёт">След. →</button>
            </div>
            <span className={"tag " + (current.status === "accepted" ? "ok" : current.status === "rejected" ? "no" : "warn")}>
              {current.status === "accepted" ? "✅ Зачтено" : current.status === "rejected" ? "🔄 Требует доработки" : "⏳ Ожидает проверки"}
            </span>
          </div>

          <div style={{ fontWeight: 600, fontSize: 15, color: "var(--navy)" }}>
            {current.student_name}
            {current.student_username && <span className="muted small" style={{ marginLeft: 6 }}>@{current.student_username}</span>}
          </div>
          <div style={{ fontSize: 13, color: "var(--navy)", marginTop: 2 }}>
            Тема: <b>{current.theme_order_index ? `${current.theme_order_index}. ` : ""}{current.theme_title}</b>
          </div>
          {current.material_title && (
            <div style={{ marginTop: 4 }}>
              <span className="tag" style={{ background: "#fef3c7", color: "#92400e", fontWeight: 700, borderColor: "#fde68a", fontSize: 12 }}>
                🎯 Урок {current.material_order_index ? `№${current.material_order_index}` : ""}: «{current.material_title}»
              </span>
            </div>
          )}
          <div className="muted small" style={{ marginTop: 4 }}>
            Сдан: {new Date(current.created_at).toLocaleString("ru-RU")}
            {current.reviewed_at && ` · проверен: ${new Date(current.reviewed_at).toLocaleString("ru-RU")}`}
            {current.reviewer_name && ` (${current.reviewer_name})`}
          </div>

          <div style={{ background: "var(--bg-soft)", padding: "10px 14px", borderRadius: 8, whiteSpace: "pre-wrap", fontSize: 13, color: "var(--navy)", margin: "10px 0" }}>
            {current.text}
          </div>

          {current.comment && !isRejecting && (
            <div style={{ background: "#fffbeb", padding: "8px 12px", borderRadius: 6, borderLeft: "3px solid #f59e0b", fontSize: 13, marginBottom: 10 }}>
              <b>Замечание декана:</b> {current.comment}
            </div>
          )}

          {isRejecting ? (
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                Укажите комментарий / что требуется исправить:
              </label>
              <textarea
                rows={4}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Например: Пожалуйста, дополните выводы по практической части…"
                style={{ width: "100%", boxSizing: "border-box", fontSize: 13 }}
              />
              <div className="row" style={{ marginTop: 10, justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="btn ghost small" onClick={() => setIsRejecting(false)}>Отмена</button>
                <button
                  type="button"
                  className="btn danger small"
                  disabled={busy}
                  onClick={() => handleReview(current.id, "rejected", reviewComment)}
                >
                  Отправить на доработку
                </button>
              </div>
            </div>
          ) : (
            <div className="spread" style={{ flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setChatTheme({ id: current.theme_id, title: current.theme_title })}
              >
                💬 Открыть обсуждение урока
              </button>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn small danger"
                  disabled={busy}
                  onClick={() => { setIsRejecting(true); setReviewComment(current.comment || ""); }}
                >
                  🔄 На доработку
                </button>
                <button
                  type="button"
                  className="btn primary small"
                  disabled={busy}
                  onClick={() => handleReview(current.id, "accepted")}
                >
                  ✅ Зачесть{filtered.length > 1 ? " и далее" : ""}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Очередь */}
      {!loading && !err && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="section-title">Очередь ({filtered.length})</div>
          {filtered.map((r, i) => (
            <button
              key={r.id}
              type="button"
              className="review-queue-row"
              data-current={i === safeIdx}
              onClick={() => setIdx(i)}
            >
              <span className={"tag small " + (r.status === "accepted" ? "ok" : r.status === "rejected" ? "no" : "warn")}>
                {r.status === "accepted" ? "✅" : r.status === "rejected" ? "🔄" : "⏳"}
              </span>
              <span style={{ fontWeight: 600, minWidth: 140, textAlign: "left" }}>{r.student_name}</span>
              <span className="muted small" style={{ flex: 1, textAlign: "left" }}>
                {r.theme_order_index ? `${r.theme_order_index}. ` : ""}{r.theme_title}
                {r.material_title ? ` · Урок ${r.material_order_index ? `№${r.material_order_index}` : ""}: «${r.material_title}»` : ""}
              </span>
              <span className="muted small">{new Date(r.created_at).toLocaleDateString("ru-RU")}</span>
            </button>
          ))}
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
