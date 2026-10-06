import SmartMediaViewer, { parseVideoUrl } from "../components/SmartMediaViewer.jsx";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import Collapsible from "../components/Collapsible";
import ChatPanel from "../components/ChatPanel";
import AttemptDetailsModal from "../components/AttemptDetailsModal";
import Modal from "../components/Modal";
import { api, getUser } from "../api";
import DirectMessages from "../components/DirectMessages";
import ScheduleCalendar from "../components/ScheduleCalendar";
import { getIcon } from "../lib/materialIcons";

const TABS = [
  { id: "themes",        label: "Курс и материалы" },
  { id: "schedule",      label: "Учебный график" },
  { id: "announcements", label: "Объявления" },
  { id: "messages",      label: "Сообщения" },
  { id: "history",       label: "История" },
];

export default function StudentPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTabState] = useState(() => {
    const t = searchParams.get("tab");
    return TABS.some((x) => x.id === t) ? t : "themes";
  });
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesErr, setCoursesErr] = useState(null);
  const [courseId, setCourseId] = useState("");
  const [courseSection, setCourseSection] = useState("themes"); // "themes" | "extra"
  const [pendingTheme, setPendingTheme] = useState(null);
  const [pendingExtra, setPendingExtra] = useState(null);

  // переключение таба пишем в URL — F5 и кнопка «назад» браузера сохраняют место
  const changeTab = (id) => {
    setTabState(id);
    const next = new URLSearchParams(searchParams);
    next.set("tab", id);
    if (id !== "themes") {
      next.delete("theme");
      next.delete("extra_material");
    }
    setSearchParams(next);
  };

  // точечная очистка: убираем только использованные параметры, tab оставляем
  const clearParams = (keys) => {
    const next = new URLSearchParams(searchParams);
    keys.forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
  };

  // 1. Загружаем курсы один раз
  useEffect(() => {
    api("/api/student/courses")
      .then(setCourses)
      .catch((e) => setCoursesErr(e.message))
      .finally(() => setCoursesLoading(false));
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
    if (urlTab && TABS.some((x) => x.id === urlTab)) {
      setTabState(urlTab);
      if (urlTab === "themes") {
        if (urlTheme) {
          setPendingTheme(+urlTheme);
          setCourseSection("themes");
        } else if (urlExtra) {
          setPendingExtra(+urlExtra);
          setCourseSection("extra");
        }
      }
    } else if (urlTheme) {
      setPendingTheme(+urlTheme);
      setCourseSection("themes");
      setTabState("themes");
    } else if (urlExtra) {
      setPendingExtra(+urlExtra);
      setCourseSection("extra");
      setTabState("themes");
    }
  }, [searchParams.toString()]);

  // группы ученика в выбранном курсе (первая в списке = группа, через которую работает чат темы)
  const selectedCourse = courses.find((c) => String(c.id) === String(courseId));
  const myGroups = selectedCourse && Array.isArray(selectedCourse.groups) ? selectedCourse.groups : [];
  const groupList = myGroups.length ? myGroups.map((g) => g.name).join(", ") : "—";

  return (
    <Layout title="Кабинет ученика" tabs={TABS} active={tab} onChange={changeTab}>
      {tab === "themes" && (
        <div>
          <div className="card row">
            <label>Курс:</label>
            <select value={courseId} onChange={e => setCourseId(e.target.value)}>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            {courseId && (
              <span className="muted small">Группа: {groupList}</span>
            )}
          </div>

          {courseId && (
            <div className="row student-section-toggle" style={{ gap: 8, margin: "12px 0" }}>
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

          {coursesLoading && <div className="card muted">Загрузка курсов…</div>}
          {!coursesLoading && coursesErr && coursesErr.includes("не активирован") && (
            <div className="card" style={{ border: "1px solid #f59e0b", background: "#fffbeb" }}>
              <h3 style={{ margin: "0 0 6px" }}>🚧 Доступ к курсам не активирован</h3>
              <div className="muted">
                Учтите: курсы появятся после того, как методист или администратор
                включит галочку «Активен» в вашей карточке. Если вы считаете, что это
                ошибка — обратитесь к методисту.
              </div>
            </div>
          )}
          {!coursesLoading && coursesErr && !coursesErr.includes("не активирован") && (
            <div className="card" style={{ color: "#dc2626" }}>
              Не удалось загрузить курсы: {coursesErr}
            </div>
          )}
          {!coursesLoading && !coursesErr && !courses.length && (
            <div className="card muted">Вам пока не назначено курсов</div>
          )}

          {courseId && courseSection === "themes" && (
            <ThemesList
              courseId={+courseId}
              groups={myGroups}
              initialTheme={pendingTheme}
              onThemeConsumed={() => {
                setPendingTheme(null);
                clearParams(["course", "theme"]);
              }}
            />
          )}

          {courseId && courseSection === "extra" && (
            <ExtraMaterialsStudentList
              courseId={+courseId}
              groups={myGroups}
              initialExtra={pendingExtra}
              onExtraConsumed={() => {
                setPendingExtra(null);
                clearParams(["course", "extra_material"]);
              }}
            />
          )}
        </div>
      )}
      {tab === "schedule" && (
        <ScheduleCalendar
          courseId={courseId}
          groupId={myGroups[0]?.id}
          studentCourses={courses}
          courses={courses}
          onNavigateToTheme={(tId) => {
            setPendingTheme(tId);
            setCourseSection("themes");
            changeTab("themes");
          }}
        />
      )}
      {tab === "announcements" && <Announcements />}
      {tab === "messages" && <DirectMessages />}
      {tab === "history" && <History />}
    </Layout>
  );
}

function ThemesList({ courseId, groups, initialTheme, onThemeConsumed }) {
  const [themes, setThemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [chatFor, setChatFor] = useState(null);
  const [completedIds, setCompletedIds] = useState([]);
  const [splitModes, setSplitModes] = useState({});
  const [expandedThemes, setExpandedThemes] = useState({});

  // загрузка тем
  const load = () => {
    api(`/api/student/course/${courseId}/themes`)
      .then((data) => {
        setThemes(data);
        // открываем первую незавершённую тему
        const activeTheme = data.find((th) => th.unlocked && (!th.test || !th.test.passed)) || data[0];
        if (activeTheme) {
          setExpandedThemes((prev) => (Object.keys(prev).length === 0 ? { [activeTheme.id]: true } : prev));
        }
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!courseId) return;
    load();
    api("/api/student/materials/completed")
      .then((res) => setCompletedIds(res.material_ids || []))
      .catch(() => {});
  }, [courseId]);

  // обновляем список при возврате на вкладку
  useEffect(() => {
    if (!courseId) return;
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [courseId]);

  // открываем чат при получении initialTheme
  useEffect(() => {
    if (initialTheme && themes.length) {
      const found = themes.find(t => t.id === initialTheme);
      setChatFor({
        chatThemeId: initialTheme,
        chatTitle: found?.title || "",
      });
      setExpandedThemes(prev => ({ ...prev, [initialTheme]: true }));
      if (onThemeConsumed) onThemeConsumed();
    }
  }, [initialTheme, themes]);

  const handleToggleCompleted = async (materialId) => {
    try {
      const res = await api(`/api/student/materials/${materialId}/toggle-completed`, { method: "POST" });
      setCompletedIds((prev) => (res.completed ? [...prev, materialId] : prev.filter((id) => id !== materialId)));
    } catch (e) {
      alert("Не удалось обновить статус: " + e.message);
    }
  };

  const switchTheme = (targetId) => {
    setExpandedThemes({ [targetId]: true });
    setTimeout(() => {
      const el = document.getElementById("theme-card-" + targetId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const [themeTabs, setThemeTabs] = useState({});

  const totalThemes = themes.length;
  const completedThemes = themes.filter(t => t.test ? t.test.passed : false).length;
  const progressPercent = totalThemes > 0 ? Math.round((completedThemes / totalThemes) * 100) : 0;

  return (
    <div className="list">
      {loading && <div className="card muted">Загрузка тем…</div>}
      {err && (
        <div className="card" style={{ color: "#dc2626" }}>
          Не удалось загрузить темы: {err}
        </div>
      )}

      {!loading && totalThemes > 0 && (
        <div className="card" style={{ marginBottom: 14, background: "linear-gradient(135deg, #ffffff 0%, var(--bg-soft) 100%)", border: "1px solid var(--border)" }}>
          <div className="spread" style={{ marginBottom: 8 }}>
            <span style={{ fontWeight: 600, color: "var(--navy)", fontSize: 14 }}>
              📊 Прогресс прохождения курса
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: progressPercent === 100 ? "var(--olive)" : "var(--navy)" }}>
              {completedThemes} из {totalThemes} тем завершено ({progressPercent}%)
            </span>
          </div>
          <div className="bar" style={{ height: 10, background: "#e2e8f0", borderRadius: 999 }}>
            <div style={{ width: `${progressPercent}%`, transition: "width 0.4s ease", background: "var(--olive)", borderRadius: 999 }} />
          </div>
        </div>
      )}

      {themes.map((th, index) => {
        const isOpen = !!expandedThemes[th.id];
        const prevTheme = index > 0 ? themes[index - 1] : null;
        const nextTheme = index < themes.length - 1 ? themes[index + 1] : null;

        const hasVideo = th.materials.some(m => m.type === "video" || (m.type === "link" && parseVideoUrl(m.url)));
        const hasTextDoc = th.materials.some(m => ["note", "document", "text"].includes(m.type) || (m.type === "link" && !parseVideoUrl(m.url)));
        const canSplit = hasVideo && hasTextDoc;
        const isSplit = !!splitModes[th.id];

        const studiedCount = th.materials.filter(m => completedIds.includes(m.id)).length;

        return (
          <Collapsible
            key={th.id}
            id={"theme-card-" + th.id}
            isOpen={isOpen}
            onToggle={(openState) => setExpandedThemes(prev => ({ ...prev, [th.id]: openState }))}
            title={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span>Тема {th.order_index}. {th.title}</span>
                {th.test && (th.test.passed
                  ? <span className="tag ok">✓ Тест сдан</span>
                  : <span className="tag no">Тест не сдан</span>)}
                {th.reports_stats ? (
                  th.reports_stats.total_materials > 0 ? (
                    <span className={"tag " + (th.reports_stats.accepted === th.reports_stats.total_materials ? "ok" : th.reports_stats.submitted > 0 ? "warn" : "")} style={{ fontSize: 12 }}>
                      📝 Отчёты: {th.reports_stats.accepted}/{th.reports_stats.total_materials} зачтено
                    </span>
                  ) : (
                    <span className="tag" style={{ fontSize: 12, background: "#f3f4f6", color: "#6b7280" }}>
                      📝 Без обязательных отчётов
                    </span>
                  )
                ) : th.report ? (
                  <span className={"tag " + (th.report.status === "accepted" ? "ok" : th.report.status === "rejected" ? "no" : "warn")}>
                    {th.report.status === "accepted" ? "📝 Отчёт зачтён" : th.report.status === "rejected" ? "📝 Отчёт: доработка" : "📝 Отчёт: на проверке"}
                  </span>
                ) : (
                  <span className="muted small" style={{ fontSize: 12 }}>📝 Отчёт не сдан</span>
                )}
                {th.materials.length > 0 && (
                  <span className="muted small" style={{ fontSize: 12 }}>
                    · {studiedCount}/{th.materials.length} изучено
                  </span>
                )}
                {!th.unlocked && <span className="muted small"> 🔒 заблокировано</span>}
                {th.unlock_granted && (
                  <span className="tag ok" title="Тема открыта куратором/администратором">
                    🔓 открыто вручную
                  </span>
                )}
              </span>
            }
          >
            {th.unlocked ? (
              (() => {
                const activeTab = themeTabs[th.id] || "lessons";
                const setTab = (tab) => setThemeTabs((prev) => ({ ...prev, [th.id]: tab }));

                return (
                  <>
                    {/* Вкладки темы: Уроки / Чат по урокам / Пройти проверочный тест / Сделать отчёт по уроку */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        margin: "4px 0 14px",
                        padding: "6px 8px",
                        background: "var(--bg-soft)",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        type="button"
                        className={"btn small " + (activeTab === "lessons" ? "primary" : "ghost")}
                        style={{
                          fontSize: 13,
                          padding: "6px 14px",
                          fontWeight: activeTab === "lessons" ? 600 : 500,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                        onClick={() => setTab("lessons")}
                      >
                        <span>📚 Уроки темы</span>
                        <span
                          style={{
                            fontSize: 11,
                            padding: "1px 6px",
                            borderRadius: 8,
                            background: activeTab === "lessons" ? "rgba(255,255,255,0.25)" : "var(--surface)",
                            border: activeTab === "lessons" ? "none" : "1px solid var(--border)",
                          }}
                        >
                          {th.materials.length}
                        </span>
                      </button>

                      {/* ЧАТ И ВОПРОСЫ ПО ТЕМЕ — ОСОБО ВЫДЕЛЕННАЯ ВКЛАДКА */}
                      <button
                        type="button"
                        className={"btn small " + (activeTab === "chat" ? "primary" : "ghost")}
                        style={{
                          fontSize: 13,
                          padding: "6px 14px",
                          fontWeight: 600,
                          background: activeTab === "chat" ? "#2563eb" : "rgba(37, 99, 235, 0.08)",
                          color: activeTab === "chat" ? "#ffffff" : "#1d4ed8",
                          borderColor: activeTab === "chat" ? "#2563eb" : "#93c5fd",
                          boxShadow: activeTab === "chat" ? "0 2px 6px rgba(37, 99, 235, 0.25)" : "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                        onClick={() => setTab("chat")}
                      >
                        <span>💬 Чат по урокам</span>
                        <span
                          style={{
                            fontSize: 10,
                            padding: "1px 6px",
                            borderRadius: 8,
                            background: activeTab === "chat" ? "rgba(255,255,255,0.25)" : "#dbeafe",
                            color: activeTab === "chat" ? "#ffffff" : "#1e40af",
                          }}
                        >
                          Вопросы куратору
                        </span>
                      </button>

                      <button
                        type="button"
                        className={"btn small " + (activeTab === "test" ? "primary" : "ghost")}
                        style={{
                          fontSize: 13,
                          padding: "6px 14px",
                          fontWeight: activeTab === "test" ? 600 : 500,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                        onClick={() => setTab("test")}
                      >
                        <span>✍️ Пройти проверочный тест</span>
                        {th.test ? (
                          <span
                            className={"tag small " + (th.test.passed ? "ok" : "warn")}
                            style={{ fontSize: 10, padding: "1px 6px" }}
                          >
                            {th.test.passed ? "✓ Сдан" : "Тест"}
                          </span>
                        ) : (
                          <span className="muted small" style={{ fontSize: 10 }}>—</span>
                        )}
                      </button>
                    </div>

                    {/* СОДЕРЖИМОЕ ВКЛАДКИ 1: УРОКИ ТЕМЫ */}
                    {activeTab === "lessons" && (
                      <div>
                        {canSplit && (
                          <div
                            className="spread"
                            style={{
                              margin: "4px 0 10px",
                              padding: "6px 10px",
                              background: "var(--bg-soft)",
                              borderRadius: 8,
                            }}
                          >
                            <span style={{ fontSize: 13, color: "var(--navy)", fontWeight: 500 }}>
                              {isSplit
                                ? "Режим одновременного просмотра (видео + конспект)"
                                : "Доступен двухоконный режим для изучения"}
                            </span>
                            <button
                              type="button"
                              className={"btn small " + (isSplit ? "primary" : "ghost")}
                              style={{ fontSize: 12, padding: "3px 10px" }}
                              onClick={() => setSplitModes((prev) => ({ ...prev, [th.id]: !prev[th.id] }))}
                            >
                              {isSplit ? "📋 Обычный список" : "🖥️ Сплит-экран (Видео + Конспект)"}
                            </button>
                          </div>
                        )}

                        {isSplit ? (
                          <ThemeSplitView
                            materials={th.materials}
                            themeId={th.id}
                            completedIds={completedIds}
                            onToggleCompleted={handleToggleCompleted}
                            onOpenReport={(matId) =>
                              setChatFor({
                                chatThemeId: th.id,
                                chatTitle: th.title,
                                initialIsReport: true,
                                initialMaterialId: matId,
                                materials: th.materials,
                              })
                            }
                          />
                        ) : (
                          <MaterialsBlock
                            materials={th.materials}
                            themeId={th.id}
                            completedIds={completedIds}
                            onToggleCompleted={handleToggleCompleted}
                            onOpenReport={(matId) =>
                              setChatFor({
                                chatThemeId: th.id,
                                chatTitle: th.title,
                                initialIsReport: true,
                                initialMaterialId: matId,
                                materials: th.materials,
                              })
                            }
                          />
                        )}

                        {/* Быстрые переходы и навигация */}
                        <div
                          className="spread"
                          style={{
                            marginTop: 14,
                            paddingTop: 10,
                            borderTop: "1px solid var(--border)",
                            flexWrap: "wrap",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              className="btn small ghost"
                              style={{
                                background: "rgba(37, 99, 235, 0.08)",
                                color: "#1d4ed8",
                                borderColor: "#93c5fd",
                                fontWeight: 600,
                              }}
                              onClick={() => setTab("chat")}
                            >
                              💬 Задать вопрос в чат по урокам
                            </button>
                            {th.test && (
                              <button
                                type="button"
                                className="btn small ghost"
                                onClick={() => setTab("test")}
                              >
                                ✍️ Проверочный тест {th.test.passed ? "✓" : ""}
                              </button>
                            )}
                          </div>

                          <div className="row" style={{ gap: 6, marginLeft: "auto" }}>
                            {prevTheme && (
                              <button
                                type="button"
                                className="btn small ghost"
                                onClick={() => switchTheme(prevTheme.id)}
                                title={`Перейти к теме ${prevTheme.order_index}: ${prevTheme.title}`}
                              >
                                ← Тема {prevTheme.order_index}
                              </button>
                            )}
                            {nextTheme &&
                              (nextTheme.unlocked ? (
                                <button
                                  type="button"
                                  className="btn small primary"
                                  onClick={() => switchTheme(nextTheme.id)}
                                  title={`Перейти к теме ${nextTheme.order_index}: ${nextTheme.title}`}
                                >
                                  Тема {nextTheme.order_index} →
                                </button>
                              ) : (
                                <span
                                  className="muted small"
                                  style={{ padding: "4px 8px" }}
                                  title="Сдайте проверочный тест для открытия следующей темы"
                                >
                                  🔒 Тема {nextTheme.order_index} (после теста)
                                </span>
                              ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* СОДЕРЖИМОЕ ВКЛАДКИ 2: ВЫДЕЛЕННЫЙ ЧАТ ПО УРОКАМ */}
                    {activeTab === "chat" && (
                      <div
                        style={{
                          marginTop: 6,
                          padding: "14px 16px",
                          background: "var(--bg-soft)",
                          borderRadius: 10,
                          border: "1px solid var(--border)",
                        }}
                      >
                        <div
                          className="spread"
                          style={{ marginBottom: 12, flexWrap: "wrap", gap: 8, alignItems: "center" }}
                        >
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 18 }}>💬</span>
                              <b style={{ fontSize: 15, color: "var(--navy)" }}>
                                Чат и вопросы по теме: {th.title}
                              </b>
                            </div>
                            <div className="muted small" style={{ marginTop: 2 }}>
                              Здесь вы можете задавать любые вопросы куратору и преподавателю по урокам этой темы.
                            </div>
                          </div>
                          <div className="row" style={{ gap: 6 }}>
                            <button
                              type="button"
                              className="btn small ghost"
                              onClick={() =>
                                setChatFor({
                                  chatThemeId: th.id,
                                  chatTitle: th.title,
                                  initialIsReport: false,
                                  materials: th.materials,
                                })
                              }
                              title="Открыть чат в отдельном модальном окне"
                            >
                              ⛶ В отдельном окне
                            </button>
                            <button
                              type="button"
                              className="btn small ghost"
                              onClick={() => setTab("lessons")}
                            >
                              ← К урокам
                            </button>
                          </div>
                        </div>

                        <div
                          style={{
                            background: "var(--surface)",
                            borderRadius: 8,
                            padding: 12,
                            border: "1px solid var(--border)",
                          }}
                        >
                          <ChatPanel
                            themeId={th.id}
                            apiBase="/api/student"
                            initialIsReport={false}
                            materials={th.materials}
                            onReportSubmitted={() => load()}
                          />
                        </div>
                      </div>
                    )}

                    {/* СОДЕРЖИМОЕ ВКЛАДКИ 3: ПРОЙТИ ПРОВЕРОЧНЫЙ ТЕСТ */}
                    {activeTab === "test" && (
                      <div
                        style={{
                          marginTop: 6,
                          padding: "16px 18px",
                          background: "var(--bg-soft)",
                          borderRadius: 10,
                          border: "1px solid var(--border)",
                        }}
                      >
                        <div
                          className="spread"
                          style={{ marginBottom: 12, flexWrap: "wrap", gap: 8, alignItems: "center" }}
                        >
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 18 }}>✍️</span>
                              <b style={{ fontSize: 15, color: "var(--navy)" }}>
                                Проверочный тест по теме: {th.title}
                              </b>
                            </div>
                            <div className="muted small" style={{ marginTop: 2 }}>
                              Проверка усвоения материала по всем урокам темы {th.order_index}.
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn small ghost"
                            onClick={() => setTab("lessons")}
                          >
                            ← К урокам
                          </button>
                        </div>

                        {th.test ? (
                          <div
                            style={{
                              background: "var(--surface)",
                              padding: 16,
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                            }}
                          >
                            {th.test.passed ? (
                              <div>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    marginBottom: 12,
                                  }}
                                >
                                  <span style={{ fontSize: 28 }}>✅</span>
                                  <div>
                                    <b style={{ fontSize: 15, color: "var(--olive)" }}>Тест успешно пройден!</b>
                                    <div className="muted small" style={{ marginTop: 2 }}>
                                      Использовано попыток: {th.test.attempts_used}{" "}
                                      {th.test.max_attempts ? `/ ${th.test.max_attempts}` : ""}
                                    </div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="btn ghost"
                                  onClick={() => setChatFor({ test: th.test })}
                                >
                                  {th.test.attempts_left === 0 ? "Посмотреть результаты теста" : "Посмотреть тест / пройти повторно"}
                                </button>
                              </div>
                            ) : (
                              <div>
                                <p style={{ margin: "0 0 10px", fontSize: 14, color: "var(--navy)" }}>
                                  Для открытия следующей темы и закрепления знаний необходимо успешно сдать этот тест.
                                </p>
                                <div className="muted small" style={{ marginBottom: 14 }}>
                                  Попыток использовано: {th.test.attempts_used}
                                  {th.test.max_attempts ? ` / ${th.test.max_attempts}` : " (без ограничений)"}
                                  {th.test.attempts_left !== null && ` · осталось: ${th.test.attempts_left}`}
                                </div>
                                <button
                                  type="button"
                                  className={th.test.attempts_left === 0 ? "btn ghost" : "btn primary"}
                                  onClick={() => setChatFor({ test: th.test })}
                                  style={{ fontSize: 14, padding: "8px 20px" }}
                                >
                                  {th.test.attempts_left === 0
                                    ? "🔒 Лимит попыток исчерпан (посмотреть результаты)"
                                    : "✍️ Начать проверочный тест"}
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="card muted" style={{ textAlign: "center", padding: 20 }}>
                            Для этой темы проверочный тест не требуется.
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()
            ) : (
              <div className="muted">🔒 Заблокировано. Сдайте тест предыдущей темы или обратитесь к куратору.</div>
            )}
          </Collapsible>
        );
      })}

      {chatFor?.test && (
        <TestModal testId={chatFor.test.id} onClose={() => { setChatFor(null); load(); }}
                   onDone={() => { setChatFor(null); load(); }} />
      )}
      {chatFor?.chatThemeId && (
        <Modal onClose={() => setChatFor(null)}>
          <div className="spread" style={{ alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <b>Обсуждение темы: {chatFor.chatTitle}</b>
              <div className="muted small">
                Группа: {groups && groups[0] ? groups[0].name : "—"} · Общаются ученики этой группы, куратор и администрация
              </div>
            </div>
            <button className="btn ghost" onClick={() => setChatFor(null)} aria-label="Закрыть чат">✕</button>
          </div>
          <ChatPanel
            themeId={chatFor.chatThemeId}
            apiBase="/api/student"
            initialIsReport={!!chatFor.initialIsReport}
            initialMaterialId={chatFor.initialMaterialId || null}
            materials={chatFor.materials || []}
            onReportSubmitted={() => {
              load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function ThemeSplitView({ materials, themeId, completedIds = [], onToggleCompleted, onOpenReport }) {
  const videoMats = materials.filter(m => m.type === "video" || (m.type === "link" && parseVideoUrl(m.url)));
  const textMats = materials.filter(m => !videoMats.includes(m));

  const me = getUser();
  const videoStorageKey = `student_last_opened_video_${me?.id || "me"}_${themeId}`;

  const [activeVideoId, setActiveVideoId] = useState(() => {
    try {
      const saved = localStorage.getItem(videoStorageKey);
      if (saved && videoMats.some(vm => String(vm.id) === String(saved))) {
        return Number(saved);
      }
    } catch (_) {}
    return videoMats[0]?.id;
  });
  const [activeTextId, setActiveTextId] = useState(textMats[0]?.id);

  const handleSelectVideo = (vid) => {
    setActiveVideoId(vid);
    try {
      localStorage.setItem(videoStorageKey, String(vid));
      localStorage.setItem(`student_last_opened_mat_${me?.id || "me"}_${themeId}`, String(vid));
    } catch (_) {}
  };

  const currentVideo = videoMats.find(m => m.id === activeVideoId) || videoMats[0];
  const currentText = textMats.find(m => m.id === activeTextId) || textMats[0];

  return (
    <div className="theme-split-container">
      {/* Левая колонка: Видео */}
      <div className="theme-split-pane">
        <div className="spread" style={{ marginBottom: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--navy)" }}>
            🎬 Видеоматериал
          </span>
          {videoMats.length > 1 && (
            <div className="row" style={{ gap: 4 }}>
              {videoMats.map((vm, idx) => (
                <button
                  key={vm.id}
                  type="button"
                  className={"btn small " + (vm.id === currentVideo?.id ? "primary" : "ghost")}
                  style={{ fontSize: 11, padding: "2px 6px" }}
                  onClick={() => handleSelectVideo(vm.id)}
                >
                  Урок {idx + 1}
                </button>
              ))}
            </div>
          )}
        </div>
        {currentVideo && (
          <div style={{ background: "#000", borderRadius: 8, overflow: "hidden" }}>
            <SmartMediaViewer
              url={currentVideo.url}
              title={currentVideo.title}
              sources={currentVideo.sources}
              synopsis={currentVideo.synopsis}
              audio_url={currentVideo.audio_url}
              attachments={currentVideo.attachments}
              materialType={currentVideo.type}
            />
          </div>
        )}
        {currentVideo && (
          <div className="spread" style={{ marginTop: 8, flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{currentVideo.title}</span>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <button
                type="button"
                className={"btn small " + (completedIds.includes(currentVideo.id) ? "ok" : "ghost")}
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  color: completedIds.includes(currentVideo.id) ? "var(--olive)" : "var(--text-soft)",
                  borderColor: completedIds.includes(currentVideo.id) ? "var(--olive)" : "var(--border)",
                }}
                onClick={() => onToggleCompleted(currentVideo.id)}
              >
                {completedIds.includes(currentVideo.id) ? "✓ Видео изучено" : "Отметить изученным"}
              </button>
              {onOpenReport && !currentVideo.no_report && (
                <button
                  type="button"
                  className={"btn small " + (currentVideo.report?.status === "accepted" ? "ok" : currentVideo.report?.status === "pending" ? "warn" : currentVideo.report?.status === "rejected" ? "danger" : "primary")}
                  style={{ fontSize: 11, padding: "3px 8px" }}
                  onClick={() => onOpenReport(currentVideo.id)}
                >
                  {currentVideo.report?.status === "accepted"
                    ? "✅ Отчёт зачтён"
                    : currentVideo.report?.status === "pending"
                    ? "⏳ Отчёт на проверке"
                    : currentVideo.report?.status === "rejected"
                    ? "🔄 Отчёт: доработка"
                    : "📝 Сдать отчёт по уроку"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Правая колонка: Конспект / Документ */}
      <div className="theme-split-pane">
        <div className="spread" style={{ marginBottom: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--navy)" }}>
            📝 Конспект и тезисы
          </span>
          {textMats.length > 1 && (
            <div className="row" style={{ gap: 4 }}>
              {textMats.map((tm, idx) => (
                <button
                  key={tm.id}
                  type="button"
                  className={"btn small " + (tm.id === currentText?.id ? "primary" : "ghost")}
                  style={{ fontSize: 11, padding: "2px 6px" }}
                  onClick={() => setActiveTextId(tm.id)}
                >
                  Материал {idx + 1}
                </button>
              ))}
            </div>
          )}
        </div>
        {currentText && (
          <div className="theme-split-text-body">
            <h4 style={{ margin: "0 0 8px", fontSize: 15, color: "var(--navy)" }}>
              {currentText.title}
            </h4>
            {currentText.type === "note" && (
              <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6, color: "var(--text)" }}>
                {currentText.url}
              </div>
            )}
            {currentText.type === "document" && (
              <div style={{ padding: "16px", background: "var(--bg-soft)", borderRadius: 8, textAlign: "center" }}>
                <p style={{ margin: "0 0 10px", fontSize: 14 }}>Документ для самостоятельного изучения</p>
                <a
                  href={currentText.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn primary small"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  📄 Открыть документ в новой вкладке
                </a>
              </div>
            )}
            {currentText.type === "image" && (
              <img
                src={currentText.url}
                alt={currentText.title}
                referrerPolicy="no-referrer"
                style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 8, display: "block" }}
              />
            )}
            {currentText.type === "link" && (
              <a href={currentText.url} target="_blank" rel="noreferrer" className="btn small primary">
                🔗 Перейти по ссылке
              </a>
            )}
            <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className={"btn small " + (completedIds.includes(currentText.id) ? "ok" : "ghost")}
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  color: completedIds.includes(currentText.id) ? "var(--olive)" : "var(--text-soft)",
                  borderColor: completedIds.includes(currentText.id) ? "var(--olive)" : "var(--border)",
                }}
                onClick={() => onToggleCompleted(currentText.id)}
              >
                {completedIds.includes(currentText.id) ? "✓ Конспект изучен" : "Отметить изученным"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MaterialsBlock({ materials, themeId, completedIds = [], onToggleCompleted, onOpenReport }) {
  const me = getUser();
  const storageKey = `student_last_opened_mat_${me?.id || "me"}_${themeId}`;

  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && materials && materials.some((m) => String(m.id) === String(saved))) {
        return { [saved]: true };
      }
    } catch (_) {}
    // If not saved previously, do NOT auto-open lesson 1!
    // Start collapsed so the student cleanly sees all lessons in the theme
    return {};
  });

  const handleToggle = (matId) => {
    setOpen((prev) => {
      const willOpen = !prev[matId];
      // Компактный режим: открыт только 1 урок, остальные свернуты
      const next = willOpen ? { [matId]: true } : {};
      try {
        if (willOpen) {
          localStorage.setItem(storageKey, String(matId));
          const m = materials.find((x) => x.id === matId);
          if (m && (m.type === "video" || (m.type === "link" && parseVideoUrl(m.url)))) {
            localStorage.setItem(`student_last_opened_video_${me?.id || "me"}_${themeId}`, String(matId));
          }
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch (_) {}
      return next;
    });
  };

  return (
    <div>
      {materials.map(m => {
        const isOpen = open[m.id];
        const isCompleted = completedIds.includes(m.id);
        const isLastOpened = localStorage.getItem(storageKey) === String(m.id);
        return (
          <div key={m.id} className="material-block">
            <div className="material-head spread" onClick={() => handleToggle(m.id)}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span className="collapsible-arrow">{isOpen ? "▾" : "▸"}</span>{" "}
                <b style={{ color: isCompleted ? "var(--olive)" : "var(--navy)" }}>
                  {m.type === "video" ? "🎬"
                   : m.type === "audio" ? "🎧"
                   : m.type === "image" ? "🖼"
                   : m.type === "document" ? "📄"
                   : m.type === "link" ? "🔗"
                   : "📝"} {m.title}
                </b>
                {isCompleted && (
                  <span className="tag ok" style={{ fontSize: 11, padding: "1px 6px" }}>✓ Изучено</span>
                )}
                {m.no_report && (
                  <span className="tag" style={{ fontSize: 10, padding: "1px 6px", background: "#f3f4f6", color: "#4b5563" }}>
                    Без отчёта
                  </span>
                )}
                {isLastOpened && !isOpen && (
                  <span className="tag small" style={{ fontSize: 10, padding: "1px 6px", background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" }}>
                    📌 Последний открытый
                  </span>
                )}
              </div>
              <div className="row" style={{ gap: 6, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={"btn small " + (isCompleted ? "ok" : "ghost")}
                  style={{
                    fontSize: 12,
                    padding: "3px 8px",
                    background: isCompleted ? "var(--olive-soft)" : "transparent",
                    color: isCompleted ? "var(--olive)" : "var(--text-soft)",
                    borderColor: isCompleted ? "var(--olive)" : "var(--border)",
                  }}
                  onClick={() => {
                    if (onToggleCompleted) onToggleCompleted(m.id);
                  }}
                  title={isCompleted ? "Нажмите, чтобы снять отметку" : "Отметить материал как изученный"}
                >
                  {isCompleted ? "✓ Изучено" : "Отметить изученным"}
                </button>
                {onOpenReport && !m.no_report && (
                  <button
                    type="button"
                    className={"btn small " + (m.report?.status === "accepted" ? "ok" : m.report?.status === "pending" ? "warn" : m.report?.status === "rejected" ? "danger" : "primary")}
                    style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={() => onOpenReport(m.id)}
                  >
                    {m.report?.status === "accepted"
                      ? "✅ Отчёт зачтён"
                      : m.report?.status === "pending"
                      ? "⏳ Отчёт на проверке"
                      : m.report?.status === "rejected"
                      ? "🔄 Отчёт: доработка"
                      : "📝 Сдать отчёт"}
                  </button>
                )}
              </div>
            </div>
            {isOpen && (
              <div className="material-body">
                {(m.type === "video" || m.type === "link" || (m.sources && m.sources.length > 0)) && (
                  <SmartMediaViewer
                    url={m.url}
                    title={m.title}
                    sources={m.sources}
                    synopsis={m.synopsis}
                    audio_url={m.audio_url}
                    attachments={m.attachments}
                    materialType={m.type}
                  />
                )}
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
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState(null);

  useEffect(() => {
    setLoading(true);
    setLoadErr(null);
    setData(null);
    api("/api/student/test/" + testId)
      .then(setData)
      .catch((e) => setLoadErr(e.message))
      .finally(() => setLoading(false));
  }, [testId]);

  if (loadErr || loading || !data) {
    return (
      <Modal onClose={onClose} innerStyle={{ maxWidth: 420 }}>
        <div className="spread">
          <h3>Тест</h3>
          <button className="btn ghost" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        {loadErr
          ? <div style={{ color: "#dc2626" }}>Не удалось загрузить тест: {loadErr}</div>
          : <div className="muted">Загрузка теста…</div>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn" onClick={onClose}>Закрыть</button>
        </div>
      </Modal>
    );
  }

  // Если лимит попыток исчерпан
  if (data.test?.attempts_exhausted || (data.test?.max_attempts > 0 && data.test?.attempts_used >= data.test?.max_attempts)) {
    const last = data.last_attempt;
    return (
      <Modal onClose={onClose} innerStyle={{ maxWidth: 540 }}>
        <div className="spread">
          <div>
            <h3 style={{ margin: 0, color: "var(--navy)" }}>{data.test.title}</h3>
            <div className="muted small" style={{ marginTop: 2 }}>
              Проходной балл: {data.test.passing_score}% · Макс. попыток: {data.test.max_attempts}
            </div>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>

        <div style={{ margin: "20px 0", textAlign: "center" }}>
          <div
            className={"result " + (last?.passed ? "ok" : "no")}
            style={{ padding: 20, borderRadius: 12 }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>{last?.passed ? "🎉" : "🔒"}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              {last?.passed ? "Тест успешно сдан!" : "Лимит попыток исчерпан"}
            </div>
            {last && (
              <div style={{ marginTop: 6, fontSize: 14 }}>
                Ваш результат: <b>{last.score}%</b> ({last.passed ? "зачёт" : "не зачёт"}).
              </div>
            )}
            <div className="muted small" style={{ marginTop: 8 }}>
              Использовано попыток: <b>{data.test.attempts_used}</b> из <b>{data.test.max_attempts}</b>. Повторная сдача недоступна.
            </div>
          </div>

          <div className="row" style={{ marginTop: 16, justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
            {last && (
              <button
                className="btn primary"
                onClick={async () => {
                  try {
                    const d = await api(`/api/student/attempts/${last.id}/details`);
                    setDetails(d);
                  } catch (e) {
                    if (window.appToast) window.appToast.error(e.message);
                  }
                }}
              >
                🔍 Посмотреть свои ответы
              </button>
            )}
            <button className="btn ghost" onClick={onClose}>Закрыть</button>
          </div>
        </div>
        {details && <AttemptDetailsModal data={details} onClose={() => setDetails(null)} />}
      </Modal>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const totalCount = data.questions.length;
  const progressPct = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;

  const scrollToQuestion = (qId) => {
    const el = document.getElementById("q-card-" + qId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const submit = async () => {
    const missing = data.questions.filter((q) => {
      const a = answers[q.id];
      if (q.question_type === "text") {
        return !a || !String(a).trim();
      }
      return !a;
    });
    if (missing.length > 0) {
      const first = missing[0];
      const idx = data.questions.indexOf(first) + 1;
      scrollToQuestion(first.id);
      if (typeof window !== "undefined" && window.appToast) {
        window.appToast.warning(`Осталось ответить на ${missing.length} вопр. Перейдите к вопросу №${idx}`);
      }
      return;
    }
    setBusy(true);
    try {
      const choiceAnswers = {};
      const textAnswers = {};
      for (const q of data.questions) {
        if (q.question_type === "text") {
          textAnswers[q.id] = String(answers[q.id] || "").trim();
        } else {
          choiceAnswers[q.id] = answers[q.id];
        }
      }
      const r = await api(`/api/student/test/${testId}/submit`, {
        method: "POST",
        body: JSON.stringify({ answers: choiceAnswers, text_answers: textAnswers }),
      });
      setResult(r);
      if (r.passed && typeof window !== "undefined" && window.appToast) {
        window.appToast.success(`Поздравляем! Тест сдан с результатом ${r.score}%!`);
      }
    } catch (e) {
      if (typeof window !== "undefined" && window.appToast) {
        window.appToast.error(e.message);
      }
    }
    finally { setBusy(false); }
  };

  const handleRetry = () => {
    setResult(null);
    setAnswers({});
    setDetails(null);
    api("/api/student/test/" + testId).then(setData).catch(() => {});
  };

  const viewDetails = async () => {
    try {
      const d = await api(`/api/student/attempts/${result.attempt_id}/details`);
      setDetails(d);
    } catch (e) {
      if (typeof window !== "undefined" && window.appToast) window.appToast.error(e.message);
    }
  };

  return (
    <Modal onClose={onClose} innerStyle={{ maxWidth: 740 }}>
      <div className="spread">
        <div>
          <h3 style={{ margin: 0 }}>{data.test.title}</h3>
          <div className="muted small" style={{ marginTop: 2 }}>
            Проходной балл: {data.test.passing_score}%
            {data.test.max_attempts > 0 && ` · Макс. попыток: ${data.test.max_attempts}`}
          </div>
        </div>
        <button className="btn ghost" onClick={onClose} aria-label="Закрыть">✕</button>
      </div>

      {!result && (
        <div className="test-nav-box" style={{ marginTop: 12 }}>
          <div className="spread" style={{ fontSize: 13, marginBottom: 4 }}>
            <span>
              Отвечено: <b>{answeredCount}</b> из <b>{totalCount}</b> ({progressPct}%)
            </span>
            <span className="muted small">Нажмите на номер для перехода</span>
          </div>
          <div className="bar" style={{ height: 6, background: "#e2e8f0", borderRadius: 999, marginBottom: 8 }}>
            <div
              style={{
                width: `${progressPct}%`,
                transition: "width 0.3s ease",
                background: progressPct === 100 ? "var(--olive)" : "var(--navy)",
                borderRadius: 999,
                height: "100%",
              }}
            />
          </div>
          <div className="test-nav-pills">
            {data.questions.map((q, i) => (
              <button
                type="button"
                key={q.id}
                className={"test-pill " + (answers[q.id] ? "answered" : "")}
                onClick={() => scrollToQuestion(q.id)}
                title={`Вопрос ${i + 1}${answers[q.id] ? " (отвечен)" : " (не отвечен)"}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {!result && data.questions.map((q, i) => (
        <div className="q" id={"q-card-" + q.id} key={q.id} style={{ scrollMarginTop: 140 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <b style={{ color: "var(--navy)" }}>{i + 1}. {q.text}</b>
              {q.question_type === "text" && (
                <span className="badge" style={{ fontSize: 11, background: "#eff6ff", color: "#1e40af" }}>
                  ✍️ Развёрнутый ответ
                </span>
              )}
            </div>
            {answers[q.id] && String(answers[q.id]).trim() ? (
              <span className="tag ok" style={{ fontSize: 11, padding: "2px 8px" }}>Отвечен</span>
            ) : (
              <span className="muted small" style={{ fontSize: 11 }}>Ожидает ответа</span>
            )}
          </div>

          {q.question_type === "text" ? (
            <div style={{ marginTop: 8 }}>
              <textarea
                rows={3}
                value={answers[q.id] || ""}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                placeholder="Введите ваш письменный ответ на вопрос..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  fontFamily: "inherit",
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
              />
            </div>
          ) : (
            (q.answers || []).map(a => {
              const isSelected = answers[q.id] === a.id;
              return (
                <label
                  className={"test-answer-label " + (isSelected ? "selected" : "")}
                  key={a.id}
                >
                  <input
                    type="radio"
                    name={"q" + q.id}
                    checked={isSelected}
                    onChange={() => setAnswers({ ...answers, [q.id]: a.id })}
                  />
                  <span style={{ fontSize: 14 }}>{a.text}</span>
                </label>
              );
            })
          )}
        </div>
      ))}

      {result && (
        <div style={{ margin: "16px 0" }}>
          <div
            className={"result " + (result.passed ? "ok" : "no")}
            style={{ padding: 18, borderRadius: 12, textAlign: "center" }}
          >
            <div style={{ fontSize: 24, marginBottom: 6 }}>{result.passed ? "🎉" : "📚"}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              {result.passed ? "Тест успешно пройден!" : "Тест не пройден"}
            </div>
            <div>
              Результат: <b>{result.score}%</b> ({result.correct} из {result.total} верных ответов).
            </div>
            <div className="muted small" style={{ marginTop: 4 }}>
              {result.passed
                ? "Вы можете перейти к следующей теме курса."
                : `Для зачета требуется минимум ${result.passing_score}%.`}
            </div>
            {result.max_attempts > 0 && (
              <div className="muted small" style={{ marginTop: 6 }}>
                Использовано попыток: <b>{result.attempts_used}</b> из <b>{result.max_attempts}</b>
                {result.attempts_left !== null && (
                  <span> · Осталось: <b>{result.attempts_left}</b></span>
                )}
              </div>
            )}
          </div>
          <div className="row" style={{ marginTop: 12, justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" onClick={viewDetails}>🔍 Посмотреть свои ответы</button>
            {!result.passed && (
              result.attempts_left === 0 || (result.max_attempts > 0 && result.attempts_used >= result.max_attempts) ? (
                <div
                  style={{
                    color: "var(--danger)",
                    fontWeight: 600,
                    padding: "6px 14px",
                    background: "#fee2e2",
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  Лимит попыток ({result.max_attempts}) исчерпан. Повторная сдача недоступна.
                </div>
              ) : (
                <button className="btn primary" onClick={handleRetry}>
                  🔄 Попробовать снова {result.attempts_left !== null && `(осталось: ${result.attempts_left})`}
                </button>
              )
            )}
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 14, gap: 8 }}>
        <button className="btn ghost" onClick={onClose}>Закрыть</button>
        {!result && (
          <button
            className="btn primary"
            disabled={busy}
            onClick={submit}
            style={{ minWidth: 120 }}
          >
            {busy ? "Отправка..." : progressPct === 100 ? "✓ Завершить и отправить" : "Отправить ответы"}
          </button>
        )}
        {result && result.passed && (
          <button className="btn primary" onClick={onDone}>Продолжить обучение ➔</button>
        )}
      </div>
      {details && <AttemptDetailsModal data={details} onClose={() => setDetails(null)} />}
    </Modal>
  );
}

function Announcements() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api("/api/student/announcements")
      .then(setList)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="list">
      {loading && <div className="card muted">Загрузка объявлений…</div>}
      {err && (
        <div className="card" style={{ color: "#dc2626" }}>
          Не удалось загрузить объявления: {err}
        </div>
      )}
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
      {!loading && !err && !list.length && <div className="card muted">Объявлений пока нет</div>}
    </div>
  );
}

function History() {
  const [subTab, setSubTab] = useState("tests"); // "tests" | "reports"
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [details, setDetails] = useState(null);
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsErr, setReportsErr] = useState(null);

  useEffect(() => {
    api("/api/student/history")
      .then(setList)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const loadReports = () => {
    setReportsLoading(true);
    setReportsErr(null);
    api("/api/student/reports")
      .then(setReports)
      .catch((e) => setReportsErr(e.message))
      .finally(() => setReportsLoading(false));
  };

  useEffect(() => {
    if (subTab === "reports") {
      loadReports();
    }
  }, [subTab]);

  const openDetails = async (id) => {
    try {
      setDetails(await api(`/api/student/attempts/${id}/details`));
    } catch (e) {
      alert(e.message);
    }
  };

  const cmp = (a, b) => {
    switch (sortKey) {
      case "test": return a.test.localeCompare(b.test, "ru");
      case "score": return a.score - b.score;
      case "result": return (a.passed ? 1 : 0) - (b.passed ? 1 : 0) || a.score - b.score;
      default: return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
  };
  const rows = [...list].sort((a, b) => (sortDir === "asc" ? cmp(a, b) : -cmp(a, b)));

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
      <div className="spread" style={{ marginBottom: 14, flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>История и успеваемость</h3>
        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className={"btn small " + (subTab === "tests" ? "primary" : "ghost")}
            onClick={() => setSubTab("tests")}
          >
            📊 Попытки тестов ({list.length})
          </button>
          <button
            type="button"
            className={"btn small " + (subTab === "reports" ? "primary" : "ghost")}
            onClick={() => setSubTab("reports")}
          >
            📝 Сданные отчёты по урокам ({reports.length || "..."})
          </button>
        </div>
      </div>

      {subTab === "tests" && (
        <>
          {loading && <div className="muted">Загрузка истории…</div>}
          {err && <div style={{ color: "#dc2626" }}>Не удалось загрузить историю: {err}</div>}
          {!loading && !err && !rows.length && <div className="muted">Попыток пока нет</div>}
          {rows.length > 0 && (
            <div className="table-wrap"><table className="table">
              <thead>
                <tr>
                  {th("date", "Дата")}
                  {th("test", "Тест")}
                  {th("score", "%")}
                  {th("result", "Результат")}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(a => (
                  <tr key={a.id}>
                    <td className="muted small">{new Date(a.created_at).toLocaleString()}</td>
                    <td>{a.test}</td><td>{a.score}%</td>
                    <td>{a.passed ? <span className="tag ok">сдан</span> : <span className="tag no">не сдан</span>}</td>
                    <td><button className="btn small" onClick={() => openDetails(a.id)}>Мои ответы</button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          {details && <AttemptDetailsModal data={details} onClose={() => setDetails(null)} />}
        </>
      )}

      {subTab === "reports" && (
        <>
          {reportsLoading && <div className="muted">Загрузка отчётов…</div>}
          {reportsErr && <div style={{ color: "#dc2626" }}>Не удалось загрузить отчёты: {reportsErr}</div>}
          {!reportsLoading && !reportsErr && reports.length === 0 && (
            <div className="muted" style={{ padding: "16px 0" }}>
              Вы пока не отправили ни одного отчёта по урокам. Перейдите во вкладку «Курс и материалы» и в обсуждении любого урока отправьте отчёт, отметив галочку «Сдать как отчёт по уроку».
            </div>
          )}
          {reports.length > 0 && (
            <div className="table-wrap"><table className="table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Курс / Урок</th>
                  <th>Текст отчёта</th>
                  <th>Статус</th>
                  <th>Замечания куратора</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td className="muted small" style={{ whiteSpace: "nowrap" }}>
                      {new Date(r.created_at).toLocaleString("ru-RU")}
                    </td>
                    <td>
                      <div>
                        <b>{r.theme_order_index ? `${r.theme_order_index}. ` : ""}{r.theme_title}</b>
                      </div>
                      {r.material_title && (
                        <div style={{ fontSize: 12, color: "var(--navy)", fontWeight: 600, marginTop: 2 }}>
                          🎯 Урок {r.material_order_index ? `№${r.material_order_index} ` : ""}: {r.material_title}
                        </div>
                      )}
                      {r.course_title && <div className="muted small">{r.course_title}</div>}
                    </td>
                    <td style={{ maxWidth: 320 }}>
                      <div style={{ maxHeight: 70, overflowY: "auto", whiteSpace: "pre-wrap", fontSize: 13 }}>
                        {r.text}
                      </div>
                    </td>
                    <td>
                      <span className={"tag " + (r.status === "accepted" ? "ok" : r.status === "rejected" ? "no" : "warn")}>
                        {r.status === "accepted" ? "✅ Зачтено" : r.status === "rejected" ? "🔄 На доработке" : "⏳ На проверке"}
                      </span>
                    </td>
                    <td>
                      {r.comment ? (
                        <div style={{ fontSize: 12, color: "#92400e", background: "#fef3c7", padding: "4px 8px", borderRadius: 4 }}>
                          {r.comment}
                          {r.reviewer_name && <span className="muted small"> ({r.reviewer_name})</span>}
                        </div>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
                    <td>
                      {r.course_id && r.theme_id && (
                        <a
                          href={`/student?course=${r.course_id}&theme=${r.theme_id}`}
                          className="btn small ghost"
                        >
                          Перейти к уроку
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </>
      )}
    </div>
  );
}

function ExtraMaterialsStudentList({ courseId, groups, initialExtra, onExtraConsumed }) {
  const [materials, setMaterials] = useState([]);
  const [chatFor, setChatFor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    setErr(null);
    api(`/api/student/course/${courseId}/extra-materials`)
      .then((res) => {
        setMaterials(res);
        setLoading(false);
      })
      .catch((e) => {
        setErr(e.message);
        setLoading(false);
      });
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

      {err && (
        <div className="card" style={{ color: "#dc2626" }}>
          Не удалось загрузить материалы: {err}
        </div>
      )}

      {!loading && !err && !materials.length && (
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
            {(em.type === "video" || em.type === "link" || (em.sources && em.sources.length > 0)) && (
              <SmartMediaViewer
                url={em.url}
                title={em.title}
                description={em.description}
                sources={em.sources}
                synopsis={em.synopsis}
                audio_url={em.audio_url}
                attachments={em.attachments}
                materialType={em.type}
              />
            )}
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
        <Modal onClose={() => setChatFor(null)} innerStyle={{ maxWidth: 640 }}>
          <div className="spread" style={{ alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <b>Обсуждение: {chatFor.title}</b>
              <div className="muted small">
                Группа: {groups && groups[0] ? groups[0].name : "—"} · Сообщения видят ученики этой группы, куратор и администрация
              </div>
            </div>
            <button className="btn ghost" onClick={() => setChatFor(null)} aria-label="Закрыть чат">✕</button>
          </div>
          <ChatPanel extraMaterialId={chatFor.id} apiBase="/api/student" />
        </Modal>
      )}
    </div>
  );
}
