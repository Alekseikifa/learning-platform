import React, { useState, useEffect, useMemo } from "react";
import { api, getUser } from "../api";
import Modal from "./Modal";

const EVENT_TYPES = [
  { id: "theme_open",      label: "Открытие темы",      icon: "🟢", color: "#10b981", bg: "#ecfdf5", border: "#a7f3d0" },
  { id: "report_deadline", label: "Дедлайн отчёта",     icon: "📝", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
  { id: "test_deadline",   label: "Сдача теста",        icon: "✍️", color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe" },
  { id: "webinar",         label: "Онлайн-встреча",     icon: "🎥", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  { id: "holiday",         label: "Каникулы / Отдых",   icon: "🏖️", color: "#06b6d4", bg: "#ecfeff", border: "#a5f3fc" },
  { id: "custom",          label: "Событие курса",      icon: "📌", color: "#64748b", bg: "#f8fafc", border: "#cbd5e1" },
];

export function getEventTypeMeta(type) {
  return EVENT_TYPES.find((t) => t.id === type) || EVENT_TYPES[5];
}

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

const WEEK_DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export default function ScheduleCalendar({
  courseId: initialCourseId,
  groupId: initialGroupId,
  studentCourses = [],
  courses: propCourses = [],
  onNavigateToTheme,
  readOnly = false,
}) {
  const me = getUser();
  const isStaffRole = ["admin", "manager", "teacher", "curator"].includes(me?.role);
  const isStaff = !readOnly && me && isStaffRole;
  // эндпоинты курсов/групп зависят от роли: куратор/декан ходят под своим префиксом
  const staffCoursesEndpoint = () =>
    me?.role === "teacher" || me?.role === "curator" ? "/api/teacher/courses" : "/api/courses";
  const staffGroupsEndpoint = () => {
    if (me?.role === "manager") return `/api/manager/groups/${selectedCourseId}`;
    if (me?.role === "admin" || me?.role === "teacher" || me?.role === "curator") return "/api/teacher/groups";
    return `/api/groups?course_id=${selectedCourseId}`;
  };

  const inputCourses = (studentCourses && studentCourses.length > 0)
    ? studentCourses
    : (propCourses && propCourses.length > 0)
    ? propCourses
    : [];

  // Фильтры курса и группы
  const [courses, setCourses] = useState(inputCourses || []);
  const [selectedCourseId, setSelectedCourseId] = useState(initialCourseId || "");
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroupId || "");
  const [availableGroups, setAvailableGroups] = useState([]);
  const [availableThemes, setAvailableThemes] = useState([]);

  // Режим просмотра: "month" | "week" | "agenda"
  const [viewMode, setViewMode] = useState("month");

  // Текущая отображаемая дата в календаре
  const [currentDate, setCurrentDate] = useState(() => new Date());

  // Данные событий
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Модальные окна
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState(null); // null = создание нового

  // 1. Загрузка курсов и групп (если для стаффа или если курсы не переданы)
  useEffect(() => {
    if (inputCourses && inputCourses.length > 0) {
      setCourses(inputCourses);
      if (!selectedCourseId) {
        const found = initialCourseId ? inputCourses.find((c) => String(c.id) === String(initialCourseId)) : inputCourses[0];
        if (found) setSelectedCourseId(found.id);
      }
    } else {
      const endpoint = isStaff ? staffCoursesEndpoint() : "/api/student/courses";
      api(endpoint)
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) {
            setCourses(data);
            if (!selectedCourseId) {
              const found = initialCourseId ? data.find((c) => String(c.id) === String(initialCourseId)) : data[0];
              if (found) setSelectedCourseId(found.id);
            }
          }
        })
        .catch(() => {});
    }
  }, [inputCourses, isStaff]);

  // Синхронизация выбранного курса из пропсов
  useEffect(() => {
    if (initialCourseId) setSelectedCourseId(initialCourseId);
  }, [initialCourseId]);

  useEffect(() => {
    if (initialGroupId !== undefined && initialGroupId !== null && initialGroupId !== "") {
      setSelectedGroupId(initialGroupId);
    }
  }, [initialGroupId]);

  // 2. Загрузка групп для выбранного курса
  useEffect(() => {
    if (!selectedCourseId) {
      setAvailableGroups([]);
      setAvailableThemes([]);
      return;
    }

    if (!isStaff && courses.length > 0) {
      const c = courses.find((x) => String(x.id) === String(selectedCourseId));
      if (c && Array.isArray(c.groups)) {
        setAvailableGroups(c.groups);
        if (c.groups.length > 0) {
          const match = c.groups.find((g) => String(g.id) === String(selectedGroupId));
          if (!match && !selectedGroupId) {
            setSelectedGroupId(c.groups[0].id);
          }
        }
      }
    } else {
      // Для персонала или если групп не было в объекте курса
      const grpEndpoint = staffGroupsEndpoint();
      api(grpEndpoint)
        .then((data) => {
          const filtered = Array.isArray(data)
            ? data.filter((g) => !g.course_id || String(g.course_id) === String(selectedCourseId))
            : [];
          setAvailableGroups(filtered);
        })
        .catch(() => setAvailableGroups([]));
    }

    // Загрузка тем для привязки событий (универсальный роут)
    api(`/api/schedule/themes?course_id=${selectedCourseId}`)
      .then((data) => setAvailableThemes(Array.isArray(data) ? data : []))
      .catch(() => {
        api(`/api/student/course/${selectedCourseId}/themes`)
          .then((data) => setAvailableThemes(Array.isArray(data) ? data : []))
          .catch(() => setAvailableThemes([]));
      });
  }, [selectedCourseId, isStaff]);

  // 3. Загрузка событий графика
  const loadSchedule = () => {
    if (!selectedCourseId) return;
    setLoading(true);
    setErr(null);

    let url = isStaff ? `/api/schedule/events?course_id=${selectedCourseId}` : `/api/student/schedule?course_id=${selectedCourseId}`;
    if (selectedGroupId) {
      url += `&group_id=${selectedGroupId}`;
    }

    api(url)
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch((e) => setErr(e.message || "Ошибка загрузки графика"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSchedule();
  }, [selectedCourseId, selectedGroupId, isStaff]);

  // Навигация по месяцам / неделям
  const handlePrev = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === "week") {
        d.setDate(d.getDate() - 7);
      } else {
        d.setMonth(d.getMonth() - 1);
      }
      return d;
    });
  };

  const handleNext = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === "week") {
        d.setDate(d.getDate() + 7);
      } else {
        d.setMonth(d.getMonth() + 1);
      }
      return d;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Удаление события (стафф)
  const handleDeleteEvent = async (evId) => {
    if (!window.confirm("Вы уверены, что хотите удалить это событие из графика?")) return;
    try {
      await api(`/api/schedule/events/${evId}`, { method: "DELETE" });
      setSelectedEvent(null);
      loadSchedule();
    } catch (e) {
      alert("Ошибка удаления: " + e.message);
    }
  };

  // Расчёт ячеек для календарной сетки месяца
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // День недели первого дня (0 = вс, переводим в 0 = пн)
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const days = [];

    // Дни предыдущего месяца для заполнения первой недели
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      days.push({ date: d, isCurrentMonth: false });
    }

    // Дни текущего месяца
    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({ date: d, isCurrentMonth: true });
    }

    // Дни следующего месяца для завершения сетки (до 35 или 42 ячеек)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: d, isCurrentMonth: false });
    }

    return days;
  }, [currentDate]);

  // Дни для недельного вида
  const weekDays = useMemo(() => {
    const d = new Date(currentDate);
    let dayOfWeek = d.getDay() - 1;
    if (dayOfWeek === -1) dayOfWeek = 6;
    d.setDate(d.getDate() - dayOfWeek);

    const week = [];
    for (let i = 0; i < 7; i++) {
      const current = new Date(d);
      current.setDate(d.getDate() + i);
      week.push(current);
    }
    return week;
  }, [currentDate]);

  // Хелпер сопоставления событий с датой (включая многодневные события от start_date до end_date)
  const getEventsForDate = (date) => {
    if (!date || !(date instanceof Date)) return [];
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;

    return events.filter((ev) => {
      if (!ev || !ev.start_date || typeof ev.start_date !== "string") return false;
      const startDay = ev.start_date.split("T")[0];
      const endDay = ev.end_date && typeof ev.end_date === "string" ? ev.end_date.split("T")[0] : startDay;
      return dateStr >= startDay && dateStr <= endDay;
    });
  };

  const getEventDayInfo = (ev, date) => {
    if (!ev || !ev.start_date || typeof ev.start_date !== "string" || !date) {
      return { isMultiDay: false, isStart: true, isEnd: true, label: "" };
    }
    const startDay = ev.start_date.split("T")[0];
    const endDay = ev.end_date && typeof ev.end_date === "string" ? ev.end_date.split("T")[0] : startDay;
    const isMultiDay = startDay !== endDay;
    if (!isMultiDay) {
      return { isMultiDay: false, isStart: true, isEnd: true, label: "" };
    }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;
    const isStart = dateStr === startDay;
    const isEnd = dateStr === endDay;
    const isMiddle = dateStr > startDay && dateStr < endDay;
    return {
      isMultiDay: true,
      isStart,
      isEnd,
      isMiddle,
      startDay,
      endDay,
      label: isStart ? "Начало" : isEnd ? "Завершение" : "Длится",
    };
  };

  const isToday = (d) => {
    const now = new Date();
    return (
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  };

  const selectedGroupObj = availableGroups.find((g) => String(g.id) === String(selectedGroupId));

  return (
    <div className="schedule-calendar-container" style={{ width: "100%" }}>
      {/* 1. Верхняя панель: фильтр курса/группы, переключатели вида и навигация */}
      <div
        className="card"
        style={{
          marginBottom: 14,
          padding: "12px 16px",
          background: "linear-gradient(135deg, #ffffff 0%, var(--bg-soft, #f8fafc) 100%)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="spread" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          {/* Селектор курса и группы */}
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: "var(--navy)" }}>
              📅 Учебный график:
            </span>

            {courses.length > 1 ? (
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                style={{ padding: "5px 10px", fontSize: 13, fontWeight: 500 }}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            ) : courses[0] ? (
              <span style={{ fontWeight: 600, color: "var(--navy)", fontSize: 13 }}>
                {courses[0].title}
              </span>
            ) : null}

            {availableGroups.length > 0 && (
              <div className="row" style={{ gap: 4, alignItems: "center" }}>
                <span className="muted small" style={{ fontSize: 12 }}>
                  Группа:
                </span>
                {isStaff ? (
                  <select
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    style={{ padding: "4px 8px", fontSize: 12 }}
                  >
                    <option value="">Все группы курса</option>
                    {availableGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    className="tag small ok"
                    style={{ fontSize: 11, padding: "2px 8px" }}
                  >
                    {selectedGroupObj ? selectedGroupObj.name : availableGroups[0]?.name}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Действия и кнопка создания (для персонала) */}
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Переключатель режимов вида */}
            <div
              style={{
                display: "inline-flex",
                background: "var(--surface)",
                borderRadius: 8,
                padding: 2,
                border: "1px solid var(--border)",
              }}
            >
              <button
                type="button"
                className={"btn small " + (viewMode === "month" ? "primary" : "ghost")}
                style={{ fontSize: 12, padding: "4px 10px", border: "none" }}
                onClick={() => setViewMode("month")}
              >
                Месяц
              </button>
              <button
                type="button"
                className={"btn small " + (viewMode === "week" ? "primary" : "ghost")}
                style={{ fontSize: 12, padding: "4px 10px", border: "none" }}
                onClick={() => setViewMode("week")}
              >
                Неделя
              </button>
              <button
                type="button"
                className={"btn small " + (viewMode === "agenda" ? "primary" : "ghost")}
                style={{ fontSize: 12, padding: "4px 10px", border: "none" }}
                onClick={() => setViewMode("agenda")}
              >
                Дедлайны
              </button>
            </div>

            {isStaff && (
              <button
                type="button"
                className="btn small primary"
                style={{ fontSize: 12, padding: "5px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}
                onClick={() => {
                  setEventToEdit(null);
                  setEditModalOpen(true);
                }}
              >
                <span>➕</span>
                <span>Добавить событие</span>
              </button>
            )}
          </div>
        </div>

        {/* Навигатор по датам */}
        <div
          className="spread"
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid rgba(0,0,0,0.06)",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <button
              type="button"
              className="btn small ghost"
              style={{ padding: "4px 10px" }}
              onClick={handlePrev}
              title="Предыдущий период"
            >
              ◀
            </button>
            <button
              type="button"
              className="btn small ghost"
              style={{ padding: "4px 10px", fontSize: 12 }}
              onClick={handleToday}
            >
              Сегодня
            </button>
            <button
              type="button"
              className="btn small ghost"
              style={{ padding: "4px 10px" }}
              onClick={handleNext}
              title="Следующий период"
            >
              ▶
            </button>
            <b style={{ fontSize: 15, color: "var(--navy)", marginLeft: 6 }}>
              {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
              {viewMode === "week" && ` (Неделя ${weekDays[0].getDate()} – ${weekDays[6].getDate()} ${MONTH_NAMES[weekDays[6].getMonth()]})`}
            </b>
          </div>

          {/* Легенда типов событий */}
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {EVENT_TYPES.slice(0, 5).map((t) => (
              <span
                key={t.id}
                style={{
                  fontSize: 11,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  color: "var(--text-soft)",
                }}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="card muted">Загрузка графика обучения…</div>}
      {err && <div className="card" style={{ color: "#dc2626" }}>Ошибка загрузки: {err}</div>}

      {/* 2. Отображение вида «Месяц» */}
      {!loading && viewMode === "month" && (
        <div
          className="calendar-grid-card"
          style={{
            background: "var(--surface)",
            borderRadius: 12,
            border: "1px solid var(--border)",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            width: "100%",
          }}
        >
          {/* Дни недели */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              width: "100%",
              background: "var(--bg-soft)",
              borderBottom: "1px solid var(--border)",
              textAlign: "center",
              fontWeight: 600,
              fontSize: 12,
              color: "var(--navy)",
            }}
          >
            {WEEK_DAYS.map((day, idx) => (
              <div
                key={day}
                style={{
                  padding: "8px 4px",
                  color: idx >= 5 ? "#ef4444" : "var(--navy)",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Сетка дней месяца */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              width: "100%",
              gridAutoRows: "minmax(95px, auto)",
            }}
          >
            {calendarDays.map((item, index) => {
              const dayEvents = getEventsForDate(item.date);
              const isCurrentDay = isToday(item.date);

              return (
                <div
                  key={index}
                  style={{
                    borderRight: (index + 1) % 7 === 0 ? "none" : "1px solid var(--border)",
                    borderBottom: "1px solid var(--border)",
                    padding: "6px",
                    background: isCurrentDay
                      ? "rgba(37, 99, 235, 0.04)"
                      : item.isCurrentMonth
                      ? "var(--surface)"
                      : "rgba(0,0,0,0.02)",
                    opacity: item.isCurrentMonth ? 1 : 0.45,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    minHeight: 95,
                    minWidth: 0,
                    width: "100%",
                    boxSizing: "border-box",
                    overflow: "hidden",
                    transition: "background 0.15s ease",
                  }}
                >
                  <div className="spread" style={{ alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: isCurrentDay ? 700 : 500,
                        color: isCurrentDay ? "#2563eb" : "var(--navy)",
                        background: isCurrentDay ? "#dbeafe" : "transparent",
                        padding: isCurrentDay ? "2px 6px" : "0",
                        borderRadius: 6,
                      }}
                    >
                      {item.date.getDate()}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="muted small" style={{ fontSize: 10 }}>
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  {/* Список карточек событий на день */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
                    {dayEvents.slice(0, 3).map((ev) => {
                      const meta = getEventTypeMeta(ev.event_type);
                      const isCompleted = ev.completion_status === "completed";
                      const isPending = ev.completion_status === "pending";
                      const isOverdue = ev.completion_status === "overdue";
                      const dayInfo = getEventDayInfo(ev, item.date);

                      return (
                        <div
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          style={{
                            background: meta.bg,
                            border: `1px solid ${meta.border}`,
                            borderLeft: `3px solid ${meta.color}`,
                            borderRadius: 4,
                            padding: "3px 5px",
                            fontSize: 11,
                            lineHeight: 1.25,
                            cursor: "pointer",
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                            overflowWrap: "anywhere",
                            color: "var(--navy)",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 4,
                            minWidth: 0,
                            width: "100%",
                            boxSizing: "border-box",
                            boxShadow: dayInfo.isMultiDay ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
                          }}
                          title={`${ev.title}${dayInfo.isMultiDay ? ` (${dayInfo.label})` : ""}${ev.description ? ` — ${ev.description}` : ""}`}
                        >
                          <span style={{ fontSize: 10, flexShrink: 0, marginTop: 1 }}>
                            {dayInfo.isMultiDay ? (dayInfo.isStart ? "🏁" : dayInfo.isEnd ? "⚑" : "⏳") : meta.icon}
                          </span>
                          <span style={{ flex: 1, minWidth: 0, fontWeight: 500, wordBreak: "break-word", overflowWrap: "anywhere" }}>
                            {ev.title}
                            {dayInfo.isMultiDay && (
                              <span style={{ fontSize: 9, opacity: 0.8, marginLeft: 4, fontStyle: "italic" }}>
                                {dayInfo.isStart ? "(старт)" : dayInfo.isEnd ? "(финал)" : "(длится)"}
                              </span>
                            )}
                          </span>
                          {!readOnly && (
                            <span style={{ flexShrink: 0, marginLeft: 2, fontSize: 10 }}>
                              {isCompleted && <span style={{ color: "var(--olive)", fontWeight: 700 }}>✓</span>}
                              {isPending && <span style={{ color: "#d97706" }}>⏳</span>}
                              {isOverdue && <span style={{ color: "#dc2626" }}>⚠️</span>}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {dayEvents.length > 3 && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "#2563eb",
                          cursor: "pointer",
                          fontWeight: 500,
                          paddingLeft: 4,
                        }}
                        onClick={() => setSelectedEvent(dayEvents[0])}
                      >
                        +{dayEvents.length - 3} ещё
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Отображение вида «Неделя» */}
      {!loading && viewMode === "week" && (
        <div
          className="calendar-week-card"
          style={{
            background: "var(--surface)",
            borderRadius: 12,
            border: "1px solid var(--border)",
            overflow: "hidden",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              width: "100%",
              background: "var(--bg-soft)",
              borderBottom: "1px solid var(--border)",
              textAlign: "center",
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            {weekDays.map((day, idx) => {
              const isCurrentDay = isToday(day);
              return (
                <div
                  key={idx}
                  style={{
                    padding: "10px 4px",
                    background: isCurrentDay ? "rgba(37, 99, 235, 0.08)" : "transparent",
                    color: isCurrentDay ? "#2563eb" : idx >= 5 ? "#ef4444" : "var(--navy)",
                    minWidth: 0,
                    overflow: "hidden",
                  }}
                >
                  <div>{WEEK_DAYS[idx]}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{day.getDate()}</div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              width: "100%",
              minHeight: 260,
            }}
          >
            {weekDays.map((day, idx) => {
              const dayEvents = getEventsForDate(day);
              const isCurrentDay = isToday(day);

              return (
                <div
                  key={idx}
                  style={{
                    borderRight: idx === 6 ? "none" : "1px solid var(--border)",
                    padding: "8px",
                    background: isCurrentDay ? "rgba(37, 99, 235, 0.02)" : "var(--surface)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    minWidth: 0,
                    width: "100%",
                    boxSizing: "border-box",
                    overflow: "hidden",
                  }}
                >
                  {dayEvents.map((ev) => {
                    const meta = getEventTypeMeta(ev.event_type);
                    return (
                      <div
                        key={ev.id}
                        onClick={() => setSelectedEvent(ev)}
                        style={{
                          background: meta.bg,
                          border: `1px solid ${meta.border}`,
                          borderLeft: `4px solid ${meta.color}`,
                          borderRadius: 6,
                          padding: "6px 8px",
                          fontSize: 12,
                          cursor: "pointer",
                          minWidth: 0,
                          width: "100%",
                          boxSizing: "border-box",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 600,
                            color: "var(--navy)",
                            marginBottom: 2,
                            wordBreak: "break-word",
                            overflowWrap: "anywhere",
                            whiteSpace: "normal",
                            lineHeight: 1.3,
                          }}
                        >
                          {meta.icon} {ev.title}
                        </div>
                        {(() => {
                          const hasStart = typeof ev.start_date === "string";
                          const hasEnd = typeof ev.end_date === "string" && ev.end_date;
                          const hasStartTime = hasStart && ev.start_date.includes("T");
                          const hasEndTime = hasEnd && ev.end_date.includes("T");
                          const startDay = hasStart ? ev.start_date.split("T")[0] : "";
                          const endDay = hasEnd ? ev.end_date.split("T")[0] : startDay;
                          const isMultiDay = hasEnd && startDay !== endDay;

                          if (isMultiDay) {
                            return (
                              <div className="muted small" style={{ fontSize: 10, color: "#1e40af" }}>
                                ⏳ {startDay.slice(5)} – {endDay.slice(5)} {hasStartTime ? `(${ev.start_date.split("T")[1].slice(0, 5)})` : ""}
                              </div>
                            );
                          }
                          if (hasStartTime && hasEndTime) {
                            return (
                              <div className="muted small" style={{ fontSize: 10 }}>
                                ⏰ {ev.start_date.split("T")[1].slice(0, 5)} – {ev.end_date.split("T")[1].slice(0, 5)}
                              </div>
                            );
                          }
                          if (hasStartTime) {
                            return (
                              <div className="muted small" style={{ fontSize: 10 }}>
                                ⏰ {ev.start_date.split("T")[1].slice(0, 5)}
                              </div>
                            );
                          }
                          return null;
                        })()}
                        {ev.link_url && (
                          <div style={{ fontSize: 10, color: "#2563eb", marginTop: 2 }}>
                            🔗 Онлайн-ссылка
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {dayEvents.length === 0 && (
                    <div className="muted small" style={{ textAlign: "center", marginTop: 20, fontSize: 11 }}>
                      —
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Отображение вида «Дедлайны / Список» (Хронологический список) */}
      {!loading && viewMode === "agenda" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {events.length === 0 ? (
            <div className="card muted" style={{ textAlign: "center", padding: 30 }}>
              На этот период пока нет запланированных дедлайнов и событий.
            </div>
          ) : (
            events.map((ev) => {
              const meta = getEventTypeMeta(ev.event_type);
              const dateObj = new Date(ev.start_date);
              const dateStr = !isNaN(dateObj.getTime())
                ? dateObj.toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                    weekday: "short",
                  })
                : ev.start_date;
              const timeStr = typeof ev.start_date === "string" && ev.start_date.includes("T") ? ev.start_date.split("T")[1].slice(0, 5) : null;

              const isCompleted = ev.completion_status === "completed";
              const isPending = ev.completion_status === "pending";
              const isOverdue = ev.completion_status === "overdue";

              return (
                <div
                  key={ev.id}
                  className="card"
                  style={{
                    padding: "12px 16px",
                    borderLeft: `5px solid ${meta.color}`,
                    background: "var(--surface)",
                  }}
                >
                  <div className="spread" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: 6,
                            background: meta.bg,
                            color: meta.color,
                            border: `1px solid ${meta.border}`,
                          }}
                        >
                          {meta.icon} {meta.label}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--navy)" }}>
                          {(() => {
                            const hasEnd = typeof ev.end_date === "string" && ev.end_date;
                            const startDay = ev.start_date ? ev.start_date.split("T")[0] : "";
                            const endDay = hasEnd ? ev.end_date.split("T")[0] : startDay;
                            const isMulti = hasEnd && startDay !== endDay;
                            if (isMulti) {
                              const endObj = new Date(ev.end_date);
                              const endStr = !isNaN(endObj.getTime())
                                ? endObj.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
                                : endDay;
                              return `📅 с ${dateStr} по ${endStr}`;
                            }
                            if (hasEnd && ev.start_date.includes("T") && ev.end_date.includes("T")) {
                              return `📅 ${dateStr} (${timeStr} – ${ev.end_date.split("T")[1].slice(0, 5)})`;
                            }
                            return `📅 ${dateStr} ${timeStr ? `в ${timeStr}` : ""}`;
                          })()}
                        </span>
                        {ev.group_name && (
                          <span className="muted small" style={{ fontSize: 11 }}>
                            · {ev.group_name}
                          </span>
                        )}
                        {/* Статусы выполнения для ученика */}
                        {isCompleted && (
                          <span className="tag small ok" style={{ fontSize: 11 }}>
                            ✓ Выполнено
                          </span>
                        )}
                        {isPending && (
                          <span className="tag small warn" style={{ fontSize: 11 }}>
                            ⏳ Отчёт на проверке
                          </span>
                        )}
                        {isOverdue && (
                          <span className="tag small no" style={{ fontSize: 11 }}>
                            ⚠️ Дедлайн прошёл
                          </span>
                        )}
                      </div>

                      <h4 style={{ margin: "2px 0 6px", fontSize: 15, color: "var(--navy)" }}>
                        {ev.title}
                      </h4>

                      {ev.description && (
                        <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--text-soft)", lineHeight: 1.4 }}>
                          {ev.description}
                        </p>
                      )}

                      {ev.theme_title && (
                        <div style={{ fontSize: 12, color: "var(--navy)", marginTop: 4 }}>
                          📚 Тема: <b>{ev.theme_title}</b>
                          {ev.material_title && ` · Урок: ${ev.material_title}`}
                        </div>
                      )}
                    </div>

                    {/* Действия с событием */}
                    <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {ev.link_url && (
                        <a
                          href={ev.link_url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn small primary"
                          style={{ fontSize: 12, padding: "4px 10px" }}
                        >
                          🎥 Подключиться
                        </a>
                      )}

                      {ev.theme_id && onNavigateToTheme && (
                        <button
                          type="button"
                          className="btn small ghost"
                          style={{ fontSize: 12, padding: "4px 10px" }}
                          onClick={() => onNavigateToTheme(ev.theme_id, ev.material_id)}
                        >
                          К теме урока →
                        </button>
                      )}

                      {isStaff && (
                        <>
                          <button
                            type="button"
                            className="btn small ghost"
                            style={{ fontSize: 12, padding: "4px 8px" }}
                            onClick={() => {
                              setEventToEdit(ev);
                              setEditModalOpen(true);
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="btn small danger"
                            style={{ fontSize: 12, padding: "4px 8px" }}
                            onClick={() => handleDeleteEvent(ev.id)}
                          >
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 5. Модальное окно просмотра деталей события */}
      {selectedEvent && (
        <Modal onClose={() => setSelectedEvent(null)}>
          <div style={{ padding: "4px 0" }}>
            <div className="spread" style={{ alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 22 }}>
                  {getEventTypeMeta(selectedEvent.event_type).icon}
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, color: "var(--navy)" }}>
                    {selectedEvent.title}
                  </h3>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: getEventTypeMeta(selectedEvent.event_type).bg,
                      color: getEventTypeMeta(selectedEvent.event_type).color,
                      fontWeight: 600,
                    }}
                  >
                    {getEventTypeMeta(selectedEvent.event_type).label}
                  </span>
                </div>
              </div>
              <button className="btn ghost" onClick={() => setSelectedEvent(null)}>
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
              <div>
                <b>📅 Период проведения:</b>{" "}
                {(() => {
                  const ev = selectedEvent;
                  const hasEnd = typeof ev.end_date === "string" && ev.end_date;
                  const startDay = typeof ev.start_date === "string" ? ev.start_date.split("T")[0] : "";
                  const endDay = hasEnd ? ev.end_date.split("T")[0] : startDay;
                  const isMultiDay = hasEnd && startDay !== endDay;

                  if (isMultiDay) {
                    const d1 = new Date(ev.start_date);
                    const d2 = new Date(ev.end_date);
                    const diffDays = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
                    return (
                      <span>
                        с{" "}
                        <b>
                          {d1.toLocaleString("ru-RU", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: ev.start_date.includes("T") ? "2-digit" : undefined,
                            minute: ev.start_date.includes("T") ? "2-digit" : undefined,
                          })}
                        </b>{" "}
                        по{" "}
                        <b>
                          {d2.toLocaleString("ru-RU", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: ev.end_date.includes("T") ? "2-digit" : undefined,
                            minute: ev.end_date.includes("T") ? "2-digit" : undefined,
                          })}
                        </b>
                        <span
                          className="badge"
                          style={{ marginLeft: 8, background: "#eff6ff", color: "#1e40af", fontWeight: 600 }}
                        >
                          ⏳ Длится {diffDays} {diffDays === 1 ? "день" : diffDays < 5 ? "дня" : "дней"}
                        </span>
                      </span>
                    );
                  }

                  if (hasEnd && ev.start_date.includes("T") && ev.end_date.includes("T")) {
                    const d1 = new Date(ev.start_date);
                    const t1 = ev.start_date.split("T")[1].slice(0, 5);
                    const t2 = ev.end_date.split("T")[1].slice(0, 5);
                    return (
                      <span>
                        <b>{d1.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</b>
                        {" "}с <b>{t1}</b> до <b>{t2}</b>
                      </span>
                    );
                  }

                  return (
                    <span>
                      {typeof ev.start_date === "string" ? (
                        new Date(ev.start_date).toLocaleString("ru-RU", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: ev.start_date.includes("T") ? "2-digit" : undefined,
                          minute: ev.start_date.includes("T") ? "2-digit" : undefined,
                        })
                      ) : (
                        "—"
                      )}
                    </span>
                  );
                })()}
              </div>

              {selectedEvent.group_name && (
                <div>
                  <b>👥 Аудитория:</b> {selectedEvent.group_name}
                </div>
              )}

              {selectedEvent.theme_title && (
                <div>
                  <b>📚 Тема:</b> {selectedEvent.theme_title}
                  {selectedEvent.material_title && ` (Урок: ${selectedEvent.material_title})`}
                </div>
              )}

              {selectedEvent.description && (
                <div style={{ background: "var(--bg-soft)", padding: 10, borderRadius: 8, marginTop: 4 }}>
                  <b>Пояснение:</b>
                  <div style={{ marginTop: 2, whiteSpace: "pre-wrap", color: "var(--text)" }}>
                    {selectedEvent.description}
                  </div>
                </div>
              )}

              {selectedEvent.link_url && (
                <div style={{ marginTop: 6 }}>
                  <a
                    href={selectedEvent.link_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn primary small"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    🎥 Открыть онлайн-встречу / ссылку
                  </a>
                </div>
              )}

              {/* Статус для ученика */}
              {selectedEvent.completion_status && (
                <div style={{ marginTop: 6, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                  <b>Ваш статус: </b>
                  {selectedEvent.completion_status === "completed" && (
                    <span className="tag ok">✅ Успешно выполнено (зачтено)</span>
                  )}
                  {selectedEvent.completion_status === "pending" && (
                    <span className="tag warn">⏳ Отчёт находится на проверке декана</span>
                  )}
                  {selectedEvent.completion_status === "overdue" && (
                    <span className="tag no">⚠️ Срок сдачи истёк</span>
                  )}
                  {selectedEvent.completion_status === "not_done" && (
                    <span className="muted small">Ожидает сдачи</span>
                  )}
                </div>
              )}
            </div>

            <div
              className="spread"
              style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}
            >
              <div>
                {selectedEvent.theme_id && onNavigateToTheme && (
                  <button
                    type="button"
                    className="btn primary small"
                    onClick={() => {
                      const tId = selectedEvent.theme_id;
                      const mId = selectedEvent.material_id;
                      setSelectedEvent(null);
                      onNavigateToTheme(tId, mId);
                    }}
                  >
                    Перейти к материалам →
                  </button>
                )}
              </div>

              {isStaff && (
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => {
                      const ev = selectedEvent;
                      setSelectedEvent(null);
                      setEventToEdit(ev);
                      setEditModalOpen(true);
                    }}
                  >
                    ✏️ Редактировать
                  </button>
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={() => handleDeleteEvent(selectedEvent.id)}
                  >
                    Удалить
                  </button>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* 6. Модальное окно создания / редактирования события (Стафф) */}
      {editModalOpen && (
        <EditScheduleEventModal
          event={eventToEdit}
          courseId={selectedCourseId}
          courses={courses}
          groups={availableGroups}
          themes={availableThemes}
          onClose={() => {
            setEditModalOpen(false);
            setEventToEdit(null);
          }}
          onSaved={() => {
            setEditModalOpen(false);
            setEventToEdit(null);
            loadSchedule();
          }}
        />
      )}
    </div>
  );
}

// Модальное окно добавления/редактирования
function EditScheduleEventModal({
  event,
  courseId,
  courses,
  groups,
  themes,
  onClose,
  onSaved,
}) {
  const isEditing = !!event;

  const [formCourseId, setFormCourseId] = useState(event ? event.course_id : (courseId || (courses[0] ? courses[0].id : "")));
  const [formGroupId, setFormGroupId] = useState(event ? event.group_id || "" : "");
  const [modalGroups, setModalGroups] = useState(groups || []);
  const [modalThemes, setModalThemes] = useState(themes || []);
  const [title, setTitle] = useState(event ? event.title : "");
  const [eventType, setEventType] = useState(event ? event.event_type : "theme_open");
  const [startDate, setStartDate] = useState(
    event && typeof event.start_date === "string"
      ? event.start_date.includes("T")
        ? event.start_date.slice(0, 16)
        : event.start_date
      : new Date().toISOString().slice(0, 10) + "T19:00"
  );
  const [endDate, setEndDate] = useState(
    event && typeof event.end_date === "string" ? event.end_date.slice(0, 16) : ""
  );
  const [themeId, setThemeId] = useState(event ? event.theme_id || "" : "");
  const [linkUrl, setLinkUrl] = useState(event?.link_url || "");
  const [description, setDescription] = useState(event?.description || "");
  const [notifyStudents, setNotifyStudents] = useState(true);
  const [isRecurring, setIsRecurring] = useState(false);
  const [repeatInterval, setRepeatInterval] = useState(7);
  const [repeatCount, setRepeatCount] = useState(4);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!formCourseId) {
      setModalGroups([]);
      setModalThemes([]);
      return;
    }
    if (String(formCourseId) === String(courseId) && groups?.length && themes?.length) {
      setModalGroups(groups);
      setModalThemes(themes);
      return;
    }
    api(`/api/groups?course_id=${formCourseId}`)
      .then((data) => setModalGroups(Array.isArray(data) ? data : []))
      .catch(() => setModalGroups([]));
    api(`/api/schedule/themes?course_id=${formCourseId}`)
      .then((data) => setModalThemes(Array.isArray(data) ? data : []))
      .catch(() => {
        api(`/api/student/course/${formCourseId}/themes`)
          .then((data) => setModalThemes(Array.isArray(data) ? data : []))
          .catch(() => setModalThemes([]));
      });
  }, [formCourseId, courseId, groups, themes]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Укажите название события");
      return;
    }
    if (!startDate) {
      setError("Укажите дату начала события");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      course_id: Number(formCourseId),
      group_id: formGroupId ? Number(formGroupId) : null,
      title: title.trim(),
      event_type: eventType,
      start_date: startDate,
      end_date: endDate || null,
      theme_id: themeId ? Number(themeId) : null,
      link_url: linkUrl.trim() || null,
      description: description.trim() || null,
      notify_students: isEditing ? false : notifyStudents,
    };

    try {
      if (isEditing) {
        await api(`/api/schedule/events/${event.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/schedule/events", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (isRecurring && repeatCount > 1) {
          const shiftDateStr = (origStr, daysToAdd) => {
            if (!origStr) return null;
            const d = new Date(origStr);
            d.setDate(d.getDate() + daysToAdd);
            const pad = (n) => String(n).padStart(2, "0");
            const y = d.getFullYear();
            const m = pad(d.getMonth() + 1);
            const day = pad(d.getDate());
            const h = pad(d.getHours());
            const min = pad(d.getMinutes());
            return `${y}-${m}-${day}T${h}:${min}`;
          };

          for (let i = 1; i < repeatCount; i++) {
            const nextStart = shiftDateStr(startDate, i * repeatInterval);
            const nextEnd = endDate ? shiftDateStr(endDate, i * repeatInterval) : null;
            await api("/api/schedule/events", {
              method: "POST",
              body: JSON.stringify({
                ...payload,
                start_date: nextStart,
                end_date: nextEnd,
                notify_students: false,
              }),
            });
          }
        }
      }
      onSaved();
    } catch (err) {
      setError(err.message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="spread" style={{ alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 17, color: "var(--navy)" }}>
            {isEditing ? "✏️ Редактирование события графика" : "➕ Новое событие учебного графика"}
          </h3>
          <button type="button" className="btn ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && <div className="card" style={{ color: "#dc2626", marginBottom: 10 }}>{error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="spread" style={{ gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                Курс:
              </label>
              <select
                value={formCourseId}
                onChange={(e) => setFormCourseId(e.target.value)}
                style={{ width: "100%", padding: 6, fontSize: 13 }}
                required
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                Группа:
              </label>
              <select
                value={formGroupId}
                onChange={(e) => setFormGroupId(e.target.value)}
                style={{ width: "100%", padding: 6, fontSize: 13 }}
              >
                <option value="">Для всех групп курса</option>
                {modalGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
              Тип события:
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {EVENT_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEventType(t.id)}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: eventType === t.id ? 700 : 400,
                    background: eventType === t.id ? t.bg : "var(--surface)",
                    border: eventType === t.id ? `2px solid ${t.color}` : "1px solid var(--border)",
                    color: "var(--navy)",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
              Название события:
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Сдача отчёта по теме 1 или Вебинар с деканом"
              style={{ width: "100%", padding: "7px 10px", fontSize: 13 }}
              required
            />
          </div>

          <div className="spread" style={{ gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                Дата и время начала / дедлайн:
              </label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ width: "100%", padding: 6, fontSize: 13 }}
                required
              />
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                Окончание (опционально):
              </label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ width: "100%", padding: 6, fontSize: 13 }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
              Связанная тема курса (опционально):
            </label>
            <select
              value={themeId}
              onChange={(e) => setThemeId(e.target.value)}
              style={{ width: "100%", padding: 6, fontSize: 13 }}
            >
              <option value="">Не привязана к теме</option>
              {(modalThemes || []).map((th) => (
                <option key={th.id} value={th.id}>
                  Тема {th.order_index}: {th.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
              Ссылка на онлайн-встречу / материал (если есть):
            </label>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://telemost.yandex.ru/j/... или https://zoom.us/..."
              style={{ width: "100%", padding: "6px 10px", fontSize: 13 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
              Пояснение для учеников:
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Опишите, к чему готовиться или что требуется сдать..."
              style={{ width: "100%", padding: "6px 10px", fontSize: 13 }}
            />
          </div>

          {!isEditing && (
            <div style={{ padding: 10, background: "var(--bg-soft, #f8fafc)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                />
                <span>🔁 Создать регулярную серию занятий (повторы)</span>
              </label>
              {isRecurring && (
                <div className="row" style={{ marginTop: 8, gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <label className="small muted" style={{ display: "block", marginBottom: 3 }}>Периодичность:</label>
                    <select
                      value={repeatInterval}
                      onChange={(e) => setRepeatInterval(Number(e.target.value))}
                      style={{ width: "100%", padding: 5, fontSize: 13 }}
                    >
                      <option value={7}>Каждую неделю (раз в 7 дней)</option>
                      <option value={14}>Каждые 2 недели (раз в 14 дней)</option>
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <label className="small muted" style={{ display: "block", marginBottom: 3 }}>Количество занятий:</label>
                    <select
                      value={repeatCount}
                      onChange={(e) => setRepeatCount(Number(e.target.value))}
                      style={{ width: "100%", padding: 5, fontSize: 13 }}
                    >
                      <option value={4}>4 занятия (~1 месяц)</option>
                      <option value={8}>8 занятий (~2 месяца)</option>
                      <option value={12}>12 занятий (~3 месяца)</option>
                      <option value={16}>16 занятий (семестр / 4 месяца)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isEditing && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginTop: 4 }}>
              <input
                type="checkbox"
                checked={notifyStudents}
                onChange={(e) => setNotifyStudents(e.target.checked)}
              />
              <span>Отправить уведомление ученикам группы о новом событии</span>
            </label>
          )}
        </div>

        <div className="spread" style={{ marginTop: 16, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Сохранение…" : isEditing ? "Сохранить изменения" : "Создать событие"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
