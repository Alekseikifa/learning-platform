import { useEffect, useState } from "react";
import { api, getUser } from "../api";
import Modal from "./Modal";

export default function UnlockThemeModal({ student, apiPrefix, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Определяем префикс с учётом роли, если не передан
  const role = getUser()?.role;
  const effectivePrefix = apiPrefix
    || (role === "admin" ? "/api/admin" : role === "manager" ? "/api/manager" : role === "curator" ? "/api/curator" : "/api/teacher");

  const load = () => {
    setLoading(true);
    api(`${effectivePrefix}/students/${student.id}/unlockable-themes`)
      .then((res) => {
        setData(res);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [student.id, effectivePrefix]);

  const grant = async (themeId) => {
    try {
      await api(`${effectivePrefix}/students/${student.id}/unlock-theme`, {
        method: "POST",
        body: JSON.stringify({ theme_id: themeId }),
      });
      setError("");
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const revoke = async (themeId) => {
    try {
      await api(`${effectivePrefix}/students/${student.id}/unlock-theme?theme_id=${themeId}`, {
        method: "DELETE",
      });
      setError("");
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const totalThemes = data ? data.reduce((n, c) => n + (c.themes || []).length, 0) : 0;

  return (
    <Modal onClose={onClose} innerStyle={{ maxWidth: 640 }}>
      <div className="spread" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, color: "var(--navy)" }}>🔓 Управление доступом к темам</h3>
          <div className="muted small" style={{ marginTop: 2 }}>
            Ученик: <b>{student.name}</b> {student.email ? `(${student.email})` : ""}
          </div>
        </div>
        <button className="btn ghost" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
      </div>

      <div
        className="card"
        style={{
          background: "var(--bg-soft, #f8fafc)",
          border: "1px solid var(--border)",
          padding: "10px 14px",
          marginBottom: 14,
          fontSize: 13,
          color: "var(--text-soft)",
        }}
      >
        💡 <b>Подсказка:</b> Темы открываются последовательно после успешной сдачи теста или отчётов. Вы можете принудительно выдать ручной доступ к любой теме (даже если предыдущая ещё не сдана) или закрыть выданный ранее ручной доступ.
      </div>

      {error && (
        <div className="card" style={{ color: "#dc2626", marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading && !data && <div className="muted" style={{ padding: 12 }}>Загрузка списка тем...</div>}

      {data && totalThemes === 0 && !loading && (
        <div className="card muted" style={{ textAlign: "center", padding: 16 }}>
          Курсы или темы для данного ученика пока не найдены.
        </div>
      )}

      {data &&
        data.map((c) => (
          <div
            key={c.course_id}
            style={{
              marginBottom: 16,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "12px 14px",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--navy)", marginBottom: 8 }}>
              📚 Курс: {c.course_title}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(c.themes || []).map((t) => (
                <div
                  key={t.id}
                  className="spread"
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: t.granted ? "#f0fdf4" : t.locked ? "#fef2f2" : "#f8fafc",
                    border: t.granted ? "1px solid #bbf7d0" : t.locked ? "1px solid #fecaca" : "1px solid var(--border)",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 }}>
                    <span style={{ fontWeight: 600, color: "var(--navy)", fontSize: 13 }}>
                      {t.order_index}. {t.title}
                    </span>

                    {t.granted ? (
                      <span className="tag ok" style={{ fontSize: 11 }}>
                        🔓 Открыта вручную
                      </span>
                    ) : t.passed ? (
                      <span className="tag ok" style={{ fontSize: 11 }}>
                        ✅ Пройдена (тест сдан)
                      </span>
                    ) : t.naturally_unlocked || !t.locked ? (
                      <span
                        className="tag"
                        style={{ fontSize: 11, background: "#e0f2fe", color: "#0369a1" }}
                      >
                        📖 Открыта по программе
                      </span>
                    ) : (
                      <span className="tag no" style={{ fontSize: 11 }}>
                        🔒 Закрыта (предыдущая не сдана)
                      </span>
                    )}
                  </div>

                  <div>
                    {t.granted ? (
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={() => revoke(t.id)}
                        title="Отозвать выданный ранее ручной доступ"
                      >
                        ✕ Отозвать ручной доступ
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={"btn small " + (t.locked ? "primary" : "ghost")}
                        onClick={() => grant(t.id)}
                        title={t.locked ? "Открыть тему для изучения" : "Открыть вручную"}
                      >
                        {t.locked ? "🔓 Открыть вручную" : "🔓 Принудительный доступ"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn primary" onClick={onClose}>
          Готово
        </button>
      </div>
    </Modal>
  );
}
