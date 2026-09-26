import { useEffect, useState } from "react";
import { api } from "../api";

export default function UnlockThemeModal({ student, apiPrefix, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = () =>
    api(`${apiPrefix}/students/${student.id}/unlockable-themes`)
      .then(setData)
      .catch((e) => setError(e.message));

  useEffect(() => { load(); }, [student.id, apiPrefix]);

  const grant = async (themeId) => {
    try {
      await api(`${apiPrefix}/students/${student.id}/unlock-theme`, {
        method: "POST",
        body: JSON.stringify({ theme_id: themeId }),
      });
      setError("");
      load();
    } catch (e) { alert(e.message); }
  };

  const revoke = async (themeId) => {
    try {
      await api(`${apiPrefix}/students/${student.id}/unlock-theme?theme_id=${themeId}`, {
        method: "DELETE",
      });
      setError("");
      load();
    } catch (e) { alert(e.message); }
  };

  const total = data ? data.reduce((n, c) => n + c.themes.length, 0) : 0;

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <div>
            <h3>🔓 Открытие тем</h3>
            <div className="muted small">Ученик: {student.name}</div>
          </div>
          <button className="btn ghost" onClick={onClose}>✕</button>
        </div>

        {error && <div className="muted small" style={{ color: "#dc2626" }}>{error}</div>}
        {!data && !error && <div className="muted">Загрузка...</div>}
        {data && !total && (
          <div className="muted">Все темы ученика открыты — действий не требуется.</div>
        )}

        {data && data.map((c) => (
          <div key={c.course_id} style={{ marginBottom: 12 }}>
            <div className="section-title">{c.course_title}</div>
            {c.themes.map((t) => (
              <div key={t.id} className="spread" style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
                <span>
                  {t.order_index}. {t.title}{" "}
                  {t.granted
                    ? <span className="tag ok">🔓 открыто вручную</span>
                    : <span className="tag no">🔒 закрыта</span>}
                </span>
                {t.granted ? (
                  <button className="btn small" onClick={() => revoke(t.id)}>Закрыть</button>
                ) : (
                  <button className="btn small primary" onClick={() => grant(t.id)}>Открыть</button>
                )}
              </div>
            ))}
          </div>
        ))}

        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn primary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
