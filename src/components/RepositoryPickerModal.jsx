import { useEffect, useState } from "react";
import { api } from "../api";
import { getFormatInfo } from "./UnifiedMaterialsRepository";

/**
 * Modal to pick either an entire theme or individual material(s) from the repository
 * and attach them to a course or theme.
 */
export default function RepositoryPickerModal({
  open,
  onClose,
  mode = "theme", // "theme" (pick theme to import) | "material" (pick material to attach)
  courseId,
  courseTitle = "",
  themeId,
  themeTitle = "",
  apiPrefix = "/api/admin",
  onSuccess,
}) {
  const [themes, setThemes] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedThemeName, setSelectedThemeName] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      api(`${apiPrefix}/repository/themes`),
      api(`${apiPrefix}/repository/materials`),
    ])
      .then(([thms, mats]) => {
        setThemes(thms || []);
        setMaterials(mats || []);
        if (thms?.[0]) setSelectedThemeName(thms[0].theme_name);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [open, apiPrefix]);

  if (!open) return null;

  const handleImportTheme = async (themeName) => {
    if (!courseId) return alert("Курс не выбран");
    setSubmitting(true);
    try {
      const res = await api(`${apiPrefix}/courses/${courseId}/import-theme`, {
        method: "POST",
        body: JSON.stringify({ theme_name: themeName }),
      });
      alert(`Тема «${themeName}» (${res.imported_count} уроков) успешно добавлена в курс!`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      alert("Ошибка импорта: " + (err.message || err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAttachMaterial = async (materialId) => {
    if (!courseId) return alert("Курс не выбран");
    setSubmitting(true);
    try {
      if (themeId) {
        // Attach to course theme
        await api(`${apiPrefix}/courses/${courseId}/themes/${themeId}/attach-material`, {
          method: "POST",
          body: JSON.stringify({ repository_material_id: Number(materialId) }),
        });
        alert("Урок успешно прикреплен к теме курса!");
      } else {
        // Attach as extra material to course
        await api(`${apiPrefix}/courses/${courseId}/attach-extra-material`, {
          method: "POST",
          body: JSON.stringify({ repository_material_id: Number(materialId) }),
        });
        alert("Материал успешно прикреплен к дополнительным материалам курса!");
      }
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      alert("Ошибка прикрепления: " + (err.message || err));
    } finally {
      setSubmitting(false);
    }
  };

  const filteredMaterials = materials.filter((m) => {
    if (selectedThemeName && m.theme_name !== selectedThemeName) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        m.title.toLowerCase().includes(q) ||
        (m.description || "").toLowerCase().includes(q) ||
        (m.theme_name || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="modal-overlay" style={overlayStyle} onClick={onClose}>
      <div className="card modal-content" style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="spread" style={{ alignItems: "center", marginBottom: 14, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
          <div>
            <span className="small muted">
              {courseTitle ? `Курс: ${courseTitle}` : ""}
              {themeTitle ? ` → Тема: ${themeTitle}` : ""}
            </span>
            <h3 style={{ margin: 0 }}>
              {mode === "theme"
                ? "📥 Импорт готовой темы из накопителя материалов"
                : "📎 Выбор урока/материала из накопителя"}
            </h3>
          </div>
          <button type="button" className="btn ghost small" onClick={onClose} disabled={submitting}>
            ✕
          </button>
        </div>

        {loading ? (
          <div className="muted" style={{ padding: 24, textAlign: "center" }}>
            Загрузка накопителя материалов...
          </div>
        ) : mode === "theme" ? (
          /* Mode: Pick Theme to import */
          <div>
            <div className="small muted" style={{ marginBottom: 12 }}>
              Выберите тему, подготовленную в накопителе материалов. Все входящие в неё уроки (видео, тексты, документы, аудио, рисунки) будут автоматически скопированы в этот курс:
            </div>

            {themes.length === 0 ? (
              <div className="muted" style={{ padding: 20, textAlign: "center" }}>
                В накопителе пока нет созданных тем. Перейдите во вкладку «Материалы» для их создания.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflowY: "auto" }}>
                {themes.map((th) => (
                  <div
                    key={th.theme_name}
                    className="spread"
                    style={{
                      padding: "12px 14px",
                      background: "var(--bg-soft)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15, color: "var(--navy)" }}>
                        📚 {th.theme_name}
                      </div>
                      <div className="small muted" style={{ marginTop: 2 }}>
                        Содержит <b>{th.count}</b> уроков / материалов
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn primary small"
                      onClick={() => handleImportTheme(th.theme_name)}
                      disabled={submitting}
                      style={{ fontWeight: 600 }}
                    >
                      {submitting ? "Импорт..." : "📥 Импортировать в курс"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Mode: Pick individual material to attach */
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <select
                value={selectedThemeName}
                onChange={(e) => setSelectedThemeName(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">Все темы ({themes.length})</option>
                {themes.map((t) => (
                  <option key={t.theme_name} value={t.theme_name}>
                    {t.theme_name} ({t.count})
                  </option>
                ))}
              </select>

              <input
                placeholder="Поиск по урокам..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>

            <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {filteredMaterials.length === 0 ? (
                <div className="muted" style={{ padding: 20, textAlign: "center" }}>
                  Материалы не найдены
                </div>
              ) : (
                filteredMaterials.map((mat) => {
                  const fmt = getFormatInfo(mat.type);
                  return (
                    <div
                      key={mat.id}
                      className="spread"
                      style={{
                        padding: "10px 12px",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        background: "#FFFFFF",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                        <span
                          className="tag"
                          style={{
                            background: fmt.bg,
                            color: fmt.badgeColor,
                            border: `1px solid ${fmt.badgeColor}33`,
                            fontSize: 11,
                            padding: "2px 6px",
                          }}
                        >
                          {fmt.l}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{mat.title}</div>
                          <div className="small muted">
                            {mat.theme_name} · #{mat.order_index}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn primary small"
                        onClick={() => handleAttachMaterial(mat.id)}
                        disabled={submitting}
                        style={{ fontSize: 12, fontWeight: 600 }}
                      >
                        📎 Прикрепить
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        <div className="spread" style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <button type="button" className="btn ghost" onClick={onClose} disabled={submitting}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1100,
  padding: 16,
};

const modalContentStyle = {
  background: "#FFFFFF",
  borderRadius: 12,
  width: "100%",
  maxWidth: 620,
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
  padding: 20,
};
