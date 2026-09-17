import { useEffect, useState } from "react";
import ChatPanel from "./ChatPanel";
import { api } from "../api";

export default function StaffChatsPanel() {
  const [themes, setThemes] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [themeId, setThemeId] = useState("");

  useEffect(() => {
    api("/api/staff/themes").then(ts => {
      setThemes(ts);
      if (ts[0]) {
        setCourseId(ts[0].course_id);
        setThemeId(ts[0].id);
      }
    });
  }, []);

  // уникальные курсы
  const coursesMap = new Map();
  themes.forEach(t => coursesMap.set(t.course_id, { id: t.course_id, title: t.course_title }));
  const courses = Array.from(coursesMap.values());
  const courseThemes = themes.filter(t => t.course_id === +courseId);

  // при смене курса — выбрать первую тему
  useEffect(() => {
    const first = courseThemes[0];
    if (first && first.id !== +themeId) setThemeId(first.id);
  }, [courseId, themes]);

  if (!themes.length) {
    return <div className="card muted">Тем пока нет — создайте курсы и темы в админке</div>;
  }

  return (
    <div>
      <div className="card row">
        <label>Курс:</label>
        <select value={courseId} onChange={e => setCourseId(e.target.value)}>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <label>Тема:</label>
        <select value={themeId} onChange={e => setThemeId(e.target.value)}>
          {courseThemes.map(t => (
            <option key={t.id} value={t.id}>Тема {t.order_index}. {t.title}</option>
          ))}
        </select>
      </div>

      {themeId ? (
        <div className="card">
          <h3>Обсуждение темы</h3>
          <div className="muted small">
            Ваше сообщение увидят все ученики и кураторы этого курса. Они получат уведомление.
          </div>
          <ChatPanel themeId={+themeId} apiBase="/api/staff" />
        </div>
      ) : (
        <div className="card muted">Выберите тему</div>
      )}
    </div>
  );
}
