import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ChatPanel from "./ChatPanel";
import { api } from "../api";

export default function StaffChatsPanel() {
  const [themes, setThemes] = useState([]);
  const [extraMaterials, setExtraMaterials] = useState([]);
  const [loadErr, setLoadErr] = useState(null);
  const [courseId, setCourseId] = useState("");
  const [mode, setMode] = useState("extra"); // "themes" | "extra"
  const [themeId, setThemeId] = useState("");
  const [extraId, setExtraId] = useState("");
  const [searchParams] = useSearchParams();

  useEffect(() => {
    Promise.all([
      api("/api/staff/themes").catch((e) => { setLoadErr(`темы: ${e.message}`); return []; }),
      api("/api/staff/extra-materials").catch((e) => { setLoadErr(`доп. материалы: ${e.message}`); return []; }),
    ])
      .then(([ts, ems]) => {
        setThemes(ts);
        setExtraMaterials(ems);

        const urlExtra = searchParams.get("extra_material");
        const urlTheme = searchParams.get("theme");

        if (urlExtra && ems.some((x) => x.id === +urlExtra)) {
          const found = ems.find((x) => x.id === +urlExtra);
          setCourseId(found.course_id);
          setMode("extra");
          setExtraId(found.id);
        } else if (urlTheme && ts.some((x) => x.id === +urlTheme)) {
          const found = ts.find((x) => x.id === +urlTheme);
          setCourseId(found.course_id);
          setMode("themes");
          setThemeId(found.id);
        } else if (ts[0]) {
          setCourseId(ts[0].course_id);
          setThemeId(ts[0].id);
          if (ems.length > 0) {
            const em = ems.find((x) => x.course_id === ts[0].course_id);
            if (em) setExtraId(em.id);
          }
        } else if (ems[0]) {
          setCourseId(ems[0].course_id);
          setMode("extra");
          setExtraId(ems[0].id);
        }
      })
      .catch((e) => setLoadErr(e.message));
  }, [searchParams]);

  // Уникальные курсы из тем и доп. материалов
  const coursesMap = new Map();
  themes.forEach((t) => coursesMap.set(t.course_id, { id: t.course_id, title: t.course_title }));
  extraMaterials.forEach((em) => coursesMap.set(em.course_id, { id: em.course_id, title: em.course_title }));
  const courses = Array.from(coursesMap.values());

  const currentCourseThemes = themes.filter((t) => t.course_id === +courseId);
  const currentCourseExtra = extraMaterials.filter((em) => em.course_id === +courseId);

  // При смене курса или режима синхронизируем выбор
  useEffect(() => {
    if (mode === "themes") {
      const firstTheme = currentCourseThemes[0];
      if (firstTheme && !currentCourseThemes.some((t) => t.id === +themeId)) {
        setThemeId(firstTheme.id);
      }
    } else {
      const firstExtra = currentCourseExtra[0];
      if (firstExtra && !currentCourseExtra.some((x) => x.id === +extraId)) {
        setExtraId(firstExtra.id);
      }
    }
  }, [courseId, mode, themes, extraMaterials]);

  if (!themes.length && !extraMaterials.length) {
    if (loadErr) {
      return (
        <div className="card" style={{ color: "#dc2626" }}>
          Не удалось загрузить темы и материалы: {loadErr}
        </div>
      );
    }
    return <div className="card muted">Тем и дополнительных материалов пока нет — создайте их в курсах</div>;
  }

  const activeExtra = currentCourseExtra.find((x) => x.id === +extraId);

  return (
    <div>
      <div className="card row" style={{ flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <div className="row" style={{ alignItems: "center", gap: 6 }}>
          <label>Курс:</label>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        <div className="row" style={{ alignItems: "center", gap: 6 }}>
          <label>Раздел обсуждения:</label>
          <div style={{ display: "inline-flex", gap: 4 }}>
            <button
              type="button"
              className={"btn small " + (mode === "extra" ? "primary" : "ghost")}
              onClick={() => setMode("extra")}
            >
              Доп. материалы ({currentCourseExtra.length})
            </button>
            <button
              type="button"
              className={"btn small " + (mode === "themes" ? "primary" : "ghost")}
              onClick={() => setMode("themes")}
            >
              Темы курса ({currentCourseThemes.length})
            </button>
          </div>
        </div>

        {mode === "themes" && (
          <div className="row" style={{ alignItems: "center", gap: 6 }}>
            <label>Тема:</label>
            <select value={themeId} onChange={(e) => setThemeId(e.target.value)}>
              {currentCourseThemes.map((t) => (
                <option key={t.id} value={t.id}>
                  Тема {t.order_index}. {t.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === "extra" && (
          <div className="row" style={{ alignItems: "center", gap: 6 }}>
            <label>Материал:</label>
            {currentCourseExtra.length > 0 ? (
              <select value={extraId} onChange={(e) => setExtraId(e.target.value)}>
                {currentCourseExtra.map((em) => (
                  <option key={em.id} value={em.id}>
                    {em.order_index}. {em.title}
                  </option>
                ))}
              </select>
            ) : (
              <span className="muted small">В этом курсе ещё нет доп. материалов</span>
            )}
          </div>
        )}
      </div>

      {mode === "themes" && themeId && (
        <div className="card">
          <h3>Обсуждение темы курса</h3>
          <div className="muted small" style={{ marginBottom: 12 }}>
            Чат темы курса: сообщение увидят ученики группы, деканы и администраторы.
          </div>
          <ChatPanel themeId={+themeId} apiBase="/api/staff" />
        </div>
      )}

      {mode === "extra" && extraId && activeExtra && (
        <div className="card">
          <div className="spread" style={{ alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <h3 style={{ margin: 0 }}>
                Обсуждение доп. материала: {activeExtra.title}
              </h3>
              {activeExtra.description && (
                <p className="muted small" style={{ margin: "4px 0 0 0" }}>
                  {activeExtra.description}
                </p>
              )}
            </div>
            <span className="tag ok">Без тестов</span>
          </div>
          <div className="muted small" style={{ marginBottom: 12 }}>
            Общий чат обсуждения: участвуют ученики группы, деканы и администраторы курса.
          </div>
          <ChatPanel extraMaterialId={+extraId} apiBase="/api/staff" />
        </div>
      )}

      {mode === "extra" && (!extraId || !currentCourseExtra.length) && (
        <div className="card muted">
          В выбранном курсе нет дополнительных материалов. Их можно добавить во вкладке «Курсы и темы».
        </div>
      )}
    </div>
  );
}
