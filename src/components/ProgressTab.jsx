import { useEffect, useMemo, useState } from "react";
import ChatPanel from "./ChatPanel";
import UnlockThemeModal from "./UnlockThemeModal";
import { api, getUser } from "../api";

const STAFF_ROLES = ["admin", "teacher", "curator", "manager"];

const cellTone = (status) =>
  status === "passed" ? "ok" : status === "failed" ? "no" : "";

const reportTag = (status) =>
  status === "accepted" ? "ok" : status === "rejected" ? "no" : "warn";

const lessonIcon = (status) =>
  status === "accepted" ? "✅" : status === "rejected" ? "🔄" : status === "pending" ? "⏳" : "—";

const lessonLabel = (status) =>
  status === "accepted" ? "зачтён" : status === "rejected" ? "на доработке" : status === "pending" ? "на проверке" : "не сдан";

export default function ProgressTab({
  groupId,
  initialTheme,
  onThemeConsumed,
  onDirectMessage,
  view = "list",
  onViewChange,
  onOpenReview,
}) {
  const activeRole = getUser()?.role;
  const isCurator = activeRole === "curator";
  const canUnlock = STAFF_ROLES.includes(activeRole);
  const apiPrefix =
    activeRole === "admin" ? "/api/admin"
    : activeRole === "curator" ? "/api/curator"
    : activeRole === "manager" ? "/api/manager"
    : "/api/teacher";

  // куратор всегда видит только свои темы (переключателя «все темы группы» больше нет)
  const effScope = isCurator ? "mine" : "all";

  const [students, setStudents] = useState([]);
  const [progress, setProgress] = useState(null);
  const [attention, setAttention] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [search, setSearch] = useState("");
  const [quick, setQuick] = useState("all");
  const [sort, setSort] = useState({ key: "name", dir: 1 });
  const [chatFor, setChatFor] = useState(null);
  const [unlocking, setUnlocking] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedThemeId, setSelectedThemeId] = useState(null);
  const [attentionOpen, setAttentionOpen] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = (cancelledRef) => {
    const q = `?scope=${effScope}`;
    return Promise.all([
      api(`/api/teacher/groups/${groupId}/students${q}`),
      api(`/api/teacher/groups/${groupId}/progress${q}`),
      api(`/api/teacher/groups/${groupId}/attention${q}`).catch(() => null),
    ])
      .then(([st, pr, at]) => {
        if (cancelledRef && cancelledRef.cancelled) return;
        setStudents(st);
        setProgress(pr);
        setAttention(at);
      })
      .catch((e) => {
        if (cancelledRef && cancelledRef.cancelled) return;
        setErr(e.message);
      })
      .finally(() => {
        if (cancelledRef && cancelledRef.cancelled) return;
        setLoading(false);
      });
  };

  useEffect(() => {
    const ref = { cancelled: false };
    setChatFor(null);
    setUnlocking(null);
    setSelectedId(null);
    setSelectedThemeId(null);
    setLoading(true);
    setErr(null);
    load(ref);
    return () => { ref.cancelled = true; };
  }, [groupId, effScope]);

  useEffect(() => {
    if (initialTheme) {
      setChatFor(initialTheme);
      if (onThemeConsumed) onThemeConsumed();
    }
  }, [initialTheme]);

  const themes = progress?.themes || [];
  const totalThemes = progress?.total_themes ?? themes.length;
  const myThemesCount = progress?.my_themes ?? themes.length;
  const cellsByStudent = useMemo(() => {
    const m = new Map();
    (progress?.students || []).forEach((s) => m.set(s.id, s));
    return m;
  }, [progress]);
  const inactiveIds = useMemo(
    () => new Set((attention?.inactive_students || []).map((x) => x.student_id)),
    [attention]
  );

  const kpi = {
    avg: students.length
      ? Math.round(students.reduce((a, s) => a + (s.progress || 0), 0) / students.length)
      : 0,
    pending: students.reduce((a, s) => a + (s.reports_pending || 0), 0),
    lagging: students.filter((s) => (s.progress || 0) < 50).length,
    inactive: (attention?.inactive_students || []).length,
    exhausted: (attention?.exhausted_attempts || []).length,
  };

  const filtered = students.filter((s) => {
    if (quick === "pending" && !(s.reports_pending > 0)) return false;
    if (quick === "lagging" && !((s.progress || 0) < 50)) return false;
    if (quick === "inactive" && !inactiveIds.has(s.id)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (s.name || "").toLowerCase().includes(q) || (s.username || "").toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sort.dir;
    if (sort.key === "name" || sort.key === "username")
      return dir * String(a[sort.key] || "").localeCompare(String(b[sort.key] || ""), "ru");
    if (sort.key === "activity")
      return dir * (new Date(a.last_activity || 0).getTime() - new Date(b.last_activity || 0).getTime());
    return dir * ((a[sort.key] || 0) - (b[sort.key] || 0));
  });

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }));

  const setView = (v) => {
    if (onViewChange) onViewChange(v);
  };

  const openReview = (studentId, themeId) => {
    if (onOpenReview) onOpenReview({ studentId, themeId });
  };

  const cellOf = (studentId, themeId) => {
    const row = cellsByStudent.get(studentId);
    return row ? row.cells.find((c) => c.theme_id === themeId) : null;
  };

  const resetAttempts = async (studentId, testId) => {
    if (!confirm("Сбросить попытки ученика в этом тесте?")) return;
    setBusy(true);
    try {
      await api(`${apiPrefix}/students/${studentId}/tests/${testId}/reset-attempts`, { method: "POST" });
      await load({ cancelled: false });
    } catch (e) {
      alert("Не удалось сбросить попытки: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const revokeUnlock = async (studentId, themeId) => {
    if (!confirm("Отозвать ручное открытие темы?")) return;
    setBusy(true);
    try {
      await api(`${apiPrefix}/students/${studentId}/unlock-theme?theme_id=${themeId}`, { method: "DELETE" });
      await load({ cancelled: false });
    } catch (e) {
      alert("Не удалось отозвать доступ: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const selectedStudent =
    (selectedId != null && students.find((s) => s.id === selectedId)) || null;
  const selectedDetail = selectedId != null ? cellsByStudent.get(selectedId) : null;

  const sortMark = (key) => (sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "");

  const renderKpi = () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
      <button
        type="button"
        className="kpi-tile"
        data-active={quick === "all"}
        onClick={() => setQuick("all")}
        title="Средний прогресс группы"
      >
        <div className="kpi-label">📈 Средний прогресс</div>
        <div className="kpi-value">{kpi.avg}%</div>
      </button>
      <button
        type="button"
        className="kpi-tile"
        data-active={quick === "pending"}
        onClick={() => setQuick(quick === "pending" ? "all" : "pending")}
        title="Ученики, у которых есть отчёты на проверке"
      >
        <div className="kpi-label">⏳ Отчёты на проверке</div>
        <div className="kpi-value" style={{ color: "#b45309" }}>{kpi.pending}</div>
      </button>
      <button
        type="button"
        className="kpi-tile"
        data-active={quick === "lagging"}
        onClick={() => setQuick(quick === "lagging" ? "all" : "lagging")}
        title="Ученики с прогрессом ниже 50%"
      >
        <div className="kpi-label">⚠️ Отстающие</div>
        <div className="kpi-value" style={{ color: "#dc2626" }}>{kpi.lagging}</div>
      </button>
      <button
        type="button"
        className="kpi-tile"
        data-active={quick === "inactive"}
        onClick={() => setQuick(quick === "inactive" ? "all" : "inactive")}
        title="Не заходили в платформу 7 и более дней"
      >
        <div className="kpi-label">🕐 Не заходили ≥ 7 дней</div>
        <div className="kpi-value" style={{ color: "#64748b" }}>{kpi.inactive}</div>
      </button>
    </div>
  );

  const renderAttention = () => {
    const exhausted = attention?.exhausted_attempts || [];
    const inactive = attention?.inactive_students || [];
    const unlocks = attention?.unlocked_themes || [];
    if (!attention || (!exhausted.length && !inactive.length && !unlocks.length)) return null;
    return (
      <div className="card" style={{ marginBottom: 14, padding: 12 }}>
        <div className="spread" style={{ marginBottom: attentionOpen ? 10 : 0 }}>
          <b>🚨 Требует внимания</b>
          <div className="row" style={{ gap: 6 }}>
            {!!exhausted.length && <span className="tag no">Исчерпаны попытки: {exhausted.length}</span>}
            {!!inactive.length && <span className="tag warn">Неактивны: {inactive.length}</span>}
            {!!unlocks.length && <span className="tag">Открыто вручную: {unlocks.length}</span>}
            <button type="button" className="btn ghost small" onClick={() => setAttentionOpen((v) => !v)}>
              {attentionOpen ? "Свернуть" : "Показать"}
            </button>
          </div>
        </div>
        {attentionOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            {exhausted.map((x, i) => (
              <div key={"e" + i} className="attention-row" style={{ borderLeft: "3px solid #ef4444" }}>
                <div>
                  <b>{x.student_name}</b> — {x.test_title}
                  <span className="muted small"> · попыток {x.attempts_used}/{x.max_attempts}, лучший {x.best_score}%</span>
                  <div className="muted small">Тема: {x.theme_title}</div>
                </div>
                <button
                  type="button"
                  className="btn small danger"
                  disabled={busy}
                  onClick={() => resetAttempts(x.student_id, x.test_id)}
                >
                  🔄 Сбросить попытки
                </button>
              </div>
            ))}
            {inactive.map((x, i) => (
              <div key={"i" + i} className="attention-row" style={{ borderLeft: "3px solid #f59e0b" }}>
                <div>
                  <b>{x.student_name}</b>
                  <span className="muted small">
                    {" "}· {x.last_login_at ? `последний вход: ${new Date(x.last_login_at).toLocaleDateString("ru-RU")} (${x.days_inactive} дн. назад)` : "в платформу ещё не заходил"}
                  </span>
                </div>
                {onDirectMessage && (
                  <button type="button" className="btn small ghost" onClick={() => onDirectMessage(x.student_id)}>
                    💬 Написать
                  </button>
                )}
              </div>
            ))}
            {unlocks.map((x, i) => (
              <div key={"u" + i} className="attention-row" style={{ borderLeft: "3px solid #22c55e" }}>
                <div>
                  <b>{x.student_name}</b> — тема «{x.theme_title}» открыта вручную
                  <span className="muted small"> · {new Date(x.created_at).toLocaleDateString("ru-RU")}</span>
                </div>
                {canUnlock && (
                  <button
                    type="button"
                    className="btn small ghost"
                    disabled={busy}
                    onClick={() => revokeUnlock(x.student_id, x.theme_id)}
                  >
                    ✕ Отозвать
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderToolbar = () => (
    <div className="spread" style={{ flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
      <div className="row" style={{ gap: 6 }}>
        <button
          type="button"
          className={"btn small " + (view !== "matrix" ? "primary" : "ghost")}
          onClick={() => setView("list")}
        >
          📋 Список
        </button>
        <button
          type="button"
          className={"btn small " + (view === "matrix" ? "primary" : "ghost")}
          onClick={() => setView("matrix")}
        >
          📊 Матрица
        </button>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="search"
          placeholder="🔍 Поиск по ФИО или логину…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 260, fontSize: 13 }}
        />
        {quick !== "all" && (
          <button type="button" className="btn ghost small" onClick={() => setQuick("all")}>
            Сбросить фильтр ✕
          </button>
        )}
      </div>
    </div>
  );

  const renderList = () => (
    <div>
      {!loading && !err && !students.length && <div className="muted">В группе пока нет учеников</div>}
      {!loading && !err && !!students.length && !sorted.length && (
        <div className="muted">По выбранному фильтру учеников не найдено</div>
      )}
      {!!sorted.length && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th onClick={() => toggleSort("name")} style={{ cursor: "pointer" }}>ФИО{sortMark("name")}</th>
                <th onClick={() => toggleSort("username")} style={{ cursor: "pointer" }}>Логин{sortMark("username")}</th>
                <th onClick={() => toggleSort("progress")} style={{ cursor: "pointer" }}>Прогресс{sortMark("progress")}</th>
                <th onClick={() => toggleSort("passed_tests")} style={{ cursor: "pointer" }}>Тестов сдано{sortMark("passed_tests")}</th>
                <th onClick={() => toggleSort("reports_pending")} style={{ cursor: "pointer" }}>Отчёты по урокам{sortMark("reports_pending")}</th>
                <th onClick={() => toggleSort("last_activity")} style={{ cursor: "pointer" }}>Активность{sortMark("last_activity")}</th>
                <th>Чат темы</th>
                {canUnlock && <th>Темы</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        type="button"
                        className="linklike"
                        onClick={() => { setSelectedId(s.id); setSelectedThemeId(null); }}
                        title="Открыть карточку ученика"
                      >
                        {s.name}
                      </button>
                      {inactiveIds.has(s.id) && <span title="Не заходил 7 и более дней">🕐</span>}
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
                    <div className="bar"><div style={{ width: (s.progress || 0) + "%" }} /></div>
                    <span className="muted small">{s.progress || 0}%</span>
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
                  <td className="muted small">
                    {s.last_activity ? new Date(s.last_activity).toLocaleString("ru-RU") : "—"}
                  </td>
                  <td>
                    <select onChange={(e) => e.target.value && setChatFor(+e.target.value)} defaultValue="">
                      <option value="">— выбрать тему —</option>
                      {themes.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                  </td>
                  {canUnlock && (
                    <td>
                      <button className="btn small" title="Открыть следующую тему ученику" onClick={() => setUnlocking(s)}>
                        🔓 Темы
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderMatrix = () => {
    if (!progress) return <div className="muted">Загрузка…</div>;
    return (
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, background: "#f9fafb" }}>Ученик</th>
              {themes.map((t) => (
                <th key={t.id} title={t.test_title ? `Тест: ${t.test_title}` : "Тест не назначен"}>
                  <div style={{ maxWidth: 130, fontSize: 12 }}>
                    {t.order_index}. {t.title}
                    <div className="muted" style={{ fontSize: 10, fontWeight: 400 }}>
                      {t.curator_name ? t.curator_name : "куратор не назначен"}
                    </div>
                    {isCurator && !t.is_mine && (
                      <span className="tag" style={{ fontSize: 9, padding: "0 4px" }}>чужая</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(progress.students || []).map((s) => (
              <tr key={s.id}>
                <td style={{ position: "sticky", left: 0, background: "#fff", fontWeight: 600 }}>
                  <button
                    type="button"
                    className="linklike"
                    onClick={() => { setSelectedId(s.id); setSelectedThemeId(null); }}
                    title="Открыть карточку ученика"
                  >
                    {s.name}
                  </button>
                </td>
                {themes.map((th) => {
                  const c = s.cells.find((x) => x.theme_id === th.id);
                  if (!c) return <td key={th.id} />;
                  const reports = c.materials_reports || [];
                  const single = reports.length === 1 ? reports[0] : null;
                  return (
                    <td
                      key={th.id}
                      style={{ textAlign: "center", minWidth: 105, padding: "8px 6px", cursor: "pointer" }}
                      onClick={() => { setSelectedId(s.id); setSelectedThemeId(th.id); }}
                      title={`${th.order_index}. ${th.title} — открыть детали`}
                    >
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
                      <div style={{ marginTop: 4 }}>
                        {reports.length === 0 && c.report && (
                          <span className={"tag small " + reportTag(c.report.status)} style={{ fontSize: 10 }}>
                            📝 {lessonIcon(c.report.status)}
                          </span>
                        )}
                        {!reports.length && !c.report && (
                          <span className="muted small" style={{ fontSize: 10, opacity: 0.5 }} title="Отчёт по уроку не сдан">📝—</span>
                        )}
                        {reports.length > 1 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center" }}>
                            {reports.map((mr) => (
                              <span
                                key={mr.material_id}
                                className={"report-cell-badge " + (mr.report ? mr.report.status : "empty")}
                                style={{ fontSize: 10, padding: "2px 4px", lineHeight: "13px" }}
                                title={`Урок ${mr.material_order_index}: «${mr.material_title}» — ${lessonLabel(mr.report ? mr.report.status : "none")}`}
                              >
                                У{mr.material_order_index}:{lessonIcon(mr.report ? mr.report.status : "none")}
                              </span>
                            ))}
                          </div>
                        )}
                        {single && (
                          <span
                            className={"report-cell-badge " + (single.report ? single.report.status : "empty")}
                            style={{ fontSize: 10, padding: "2px 4px", lineHeight: "13px" }}
                            title={`«${single.material_title}» — ${lessonLabel(single.report ? single.report.status : "none")}`}
                          >
                            {single.report
                              ? (single.report.status === "accepted" ? "📝✅" : single.report.status === "rejected" ? "📝🔄" : "📝⏳")
                              : "📝—"}
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="muted small" style={{ marginTop: 8 }}>
          ✅ зачтено · ⏳ на проверке · 🔄 доработка · — не сдано · клик по ячейке — детали ученика и переход к проверке
        </div>
      </div>
    );
  };

  const renderDrawer = () => {
    if (!selectedStudent) return null;
    const detail = selectedDetail;
    return (
      <div className="modal-back" onClick={() => { setSelectedId(null); setSelectedThemeId(null); }}>
        <div className="modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
          <div className="spread" style={{ marginBottom: 10 }}>
            <div>
              <h3 style={{ margin: 0 }}>{selectedStudent.name}</h3>
              <div className="muted small">@{selectedStudent.username}</div>
            </div>
            <button type="button" className="btn ghost" onClick={() => { setSelectedId(null); setSelectedThemeId(null); }}>✕</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 12 }}>
            <div className="kpi-tile" data-static="1">
              <div className="kpi-label">📈 Прогресс</div>
              <div className="kpi-value">{selectedStudent.progress || 0}%</div>
            </div>
            <div className="kpi-tile" data-static="1">
              <div className="kpi-label">📝 Тесты</div>
              <div className="kpi-value">{selectedStudent.passed_tests || 0}/{selectedStudent.total_tests || 0}</div>
            </div>
            <div className="kpi-tile" data-static="1">
              <div className="kpi-label">✅ Отчёты</div>
              <div className="kpi-value">{selectedStudent.reports_accepted || 0}</div>
            </div>
            <div className="kpi-tile" data-static="1">
              <div className="kpi-label">⏳ На проверке</div>
              <div className="kpi-value" style={{ color: "#b45309" }}>{selectedStudent.reports_pending || 0}</div>
            </div>
          </div>

          <div className="spread" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <span className="muted small">
              Активность: {selectedStudent.last_activity ? new Date(selectedStudent.last_activity).toLocaleString("ru-RU") : "—"}
            </span>
            <div className="row" style={{ gap: 6 }}>
              {onDirectMessage && (
                <button type="button" className="btn small ghost" onClick={() => onDirectMessage(selectedStudent.id)}>
                  💬 Сообщение
                </button>
              )}
              {canUnlock && (
                <button type="button" className="btn small" onClick={() => setUnlocking(selectedStudent)}>
                  🔓 Темы
                </button>
              )}
              <select
                onChange={(e) => e.target.value && setChatFor(+e.target.value)}
                defaultValue=""
                style={{ fontSize: 13 }}
              >
                <option value="">💬 Чат темы…</option>
                {themes.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          </div>

          <div className="section-title">Учебный план: {themes.length} тем</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
            {themes.map((th) => {
              const c = cellOf(selectedStudent.id, th.id);
              const pending = (c?.materials_reports || []).filter((mr) => mr.report && mr.report.status === "pending");
              const isSel = selectedThemeId === th.id;
              return (
                <div
                  key={th.id}
                  className="attention-row"
                  style={{
                    borderLeft: isSel ? "3px solid var(--navy)" : "1px solid var(--border)",
                    background: isSel ? "var(--bg-soft)" : "transparent",
                  }}
                >
                  <div>
                    <b>{th.order_index}. {th.title}</b>
                    <div className="muted small">
                      {th.curator_name ? `куратор: ${th.curator_name}` : "куратор не назначен"}
                      {th.test_title ? ` · тест: ${th.test_title}` : ""}
                    </div>
                    <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      {c && (
                        <>
                          <span className={"tag small " + cellTone(c.status === "passed" ? "ok" : c.status === "failed" ? "no" : "")}>
                            {c.status === "no_test" ? "без теста"
                              : c.status === "not_started" ? "тест не начат"
                              : c.status === "passed" ? `тест ✅ ${c.best_score}%`
                              : `тест ❌ ${c.attempts} поп.`}
                          </span>
                          <span className="tag small">
                            уроки: {c.accepted_lessons}/{c.total_lessons} зачтено
                          </span>
                          {c.pending_lessons > 0 && <span className="tag warn small">⏳ {c.pending_lessons}</span>}
                          {c.rejected_lessons > 0 && <span className="tag no small">🔄 {c.rejected_lessons}</span>}
                        </>
                      )}
                    </div>
                  </div>
                  {!!pending.length && onOpenReview && (
                    <button
                      type="button"
                      className="btn primary small"
                      onClick={() => openReview(selectedStudent.id, th.id)}
                    >
                      📝 К проверке ({pending.length})
                    </button>
                  )}
                </div>
              );
            })}
            {!themes.length && <div className="muted small">В выбранной области темы не найдены</div>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="spread" style={{ marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>
            📈 Прогресс группы
            {isCurator && (
              <span className="tag" style={{ marginLeft: 10, verticalAlign: "middle" }}>
                Мои темы: {myThemesCount} из {totalThemes}
              </span>
            )}
          </h3>
          <button type="button" className="btn ghost small" onClick={() => load({ cancelled: false })}>
            🔄 Обновить
          </button>
        </div>

        {loading && <div className="muted">Загрузка…</div>}
        {err && <div style={{ color: "#dc2626" }}>Не удалось загрузить прогресс: {err}</div>}

        {!loading && !err && (
          <>
            {renderKpi()}
            {renderAttention()}
            {renderToolbar()}
            {view === "matrix" ? renderMatrix() : renderList()}
          </>
        )}
      </div>

      {chatFor && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="spread">
            <b>Чат темы: {themes.find((t) => t.id === chatFor)?.title}</b>
            <button className="btn ghost" onClick={() => setChatFor(null)}>Закрыть</button>
          </div>
          <ChatPanel themeId={chatFor} groupId={+groupId} apiBase="/api/teacher" />
        </div>
      )}

      {unlocking && (
        <UnlockThemeModal student={unlocking} apiPrefix={apiPrefix} onClose={() => setUnlocking(null)} />
      )}

      {renderDrawer()}
    </div>
  );
}
