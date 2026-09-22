import { useEffect, useState } from "react";
import { api } from "../api";

export default function AnnouncementsPanel({ initialGroups = [] }) {
  const [groups, setGroups] = useState(Array.isArray(initialGroups) ? initialGroups : []);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: "", body: "", group_ids: [], to_all_groups: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const loadGroups = async () => {
    try {
      const data = await api("/api/staff/groups");
      if (Array.isArray(data)) setGroups(data);
    } catch (err) {
      console.warn("Could not load groups:", err);
    }
  };

  const loadAnnouncements = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api("/api/staff/announcements");
      if (Array.isArray(data)) {
        setAnnouncements(data);
      } else {
        setAnnouncements([]);
      }
    } catch (err) {
      console.error("Error loading announcements:", err);
      setError(err?.message || "Не удалось загрузить список объявлений");
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
    loadAnnouncements();
  }, []);

  const toggleGroup = (gid) => {
    setForm((f) => {
      const nextGroupIds = f.group_ids.includes(gid)
        ? f.group_ids.filter((id) => id !== gid)
        : [...f.group_ids, gid];
      return {
        ...f,
        group_ids: nextGroupIds,
        to_all_groups: nextGroupIds.length === groups.length && groups.length > 0,
      };
    });
  };

  const selectAllGroups = () => {
    setForm((f) => ({
      ...f,
      to_all_groups: true,
      group_ids: groups.map((g) => g.id),
    }));
  };

  const deselectAllGroups = () => {
    setForm((f) => ({
      ...f,
      to_all_groups: false,
      group_ids: [],
    }));
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!form.title.trim()) return alert("Заполните заголовок объявления");
    if (!form.body.trim()) return alert("Заполните текст объявления");

    if (groups.length > 0 && !form.to_all_groups && form.group_ids.length === 0) {
      return alert("Выберите хотя бы одну группу или отметьте «Отправить всем группам»");
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        group_ids: form.to_all_groups ? groups.map((g) => g.id) : form.group_ids,
        to_all_groups: form.to_all_groups,
      };

      if (editingId) {
        await api(`/api/staff/announcements/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/staff/announcements", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setForm({ title: "", body: "", group_ids: [], to_all_groups: false });
      setEditingId(null);
      await loadAnnouncements();
    } catch (err) {
      alert(err.message || "Ошибка при сохранении объявления");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (a) => {
    setEditingId(a.id);
    const targetIds = Array.isArray(a.group_ids) ? a.group_ids : [];
    setForm({
      title: a.title || "",
      body: a.body || "",
      group_ids: targetIds,
      to_all_groups: targetIds.length === 0 || (groups.length > 0 && targetIds.length === groups.length),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (window.confirm("Удалить это объявление?")) {
      try {
        await api("/api/staff/announcements/" + id, { method: "DELETE" });
        await loadAnnouncements();
      } catch (err) {
        alert(err.message || "Ошибка при удалении");
      }
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm({ title: "", body: "", group_ids: [], to_all_groups: false });
  };

  const safeAnnouncements = Array.isArray(announcements) ? announcements : [];
  const safeGroups = Array.isArray(groups) ? groups : [];

  const filteredAnnouncements = safeAnnouncements.filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (a.title && a.title.toLowerCase().includes(q)) ||
      (a.body && a.body.toLowerCase().includes(q)) ||
      (a.author && a.author.toLowerCase().includes(q))
    );
  });

  return (
    <div>
      {/* Form card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="spread" style={{ alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>
            {editingId ? "✏️ Редактирование объявления" : "📢 Новое объявление"}
          </h3>
          {editingId && (
            <span className="badge" style={{ background: "#e0f2fe", color: "#0369a1" }}>
              Редактируется ID #{editingId}
            </span>
          )}
        </div>
        <div className="muted small" style={{ marginTop: 4 }}>
          Объявления мгновенно отображаются у учеников и кураторов выбранных групп, а также отправляют системное уведомление.
        </div>

        <input
          id="announcement-title-input"
          placeholder="Заголовок объявления *"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          style={{ width: "100%", marginTop: 12, fontSize: 15 }}
        />

        <textarea
          id="announcement-body-input"
          placeholder="Текст объявления (поддерживаются абзацы и ссылки) *"
          rows={5}
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          style={{ width: "100%", marginTop: 8, fontSize: 14 }}
        />

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border, #e2e8f0)" }}>
          <div className="spread" style={{ alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              🎯 Получатели объявления
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button
                type="button"
                className="btn small ghost"
                onClick={selectAllGroups}
                disabled={safeGroups.length === 0}
              >
                Выбрать все ({safeGroups.length})
              </button>
              <button
                type="button"
                className="btn small ghost"
                onClick={deselectAllGroups}
                disabled={form.group_ids.length === 0 && !form.to_all_groups}
              >
                Снять выбор
              </button>
            </div>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              marginBottom: 10,
              padding: "6px 10px",
              background: form.to_all_groups ? "#f0fdf4" : "var(--bg-card, #f8fafc)",
              borderRadius: 6,
              border: form.to_all_groups ? "1px solid #86efac" : "1px solid var(--border, #e2e8f0)",
            }}
          >
            <input
              type="checkbox"
              checked={form.to_all_groups}
              onChange={(e) => {
                const checked = e.target.checked;
                setForm((f) => ({
                  ...f,
                  to_all_groups: checked,
                  group_ids: checked ? safeGroups.map((g) => g.id) : [],
                }));
              }}
            />
            <span style={{ fontWeight: form.to_all_groups ? 600 : 400 }}>
              🌐 Отправить всем группам и ученикам платформы
            </span>
          </label>

          {!form.to_all_groups && (
            <div className="chips" style={{ marginTop: 6 }}>
              {safeGroups.map((g) => {
                const isSelected = form.group_ids.includes(g.id);
                return (
                  <label
                    key={g.id}
                    className="chip"
                    style={{
                      cursor: "pointer",
                      padding: "6px 10px",
                      background: isSelected ? "var(--primary-light, #e0f2fe)" : undefined,
                      borderColor: isSelected ? "var(--primary, #0284c7)" : undefined,
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleGroup(g.id)}
                      style={{ marginRight: 6 }}
                    />
                    <span>{g.course_title ? `${g.course_title} — ` : ""}{g.name}</span>
                  </label>
                );
              })}
              {safeGroups.length === 0 && (
                <div className="muted small">Группы пока не созданы. Объявление будет доступно всем зарегистрированным ученикам.</div>
              )}
            </div>
          )}

          <div className="muted small" style={{ marginTop: 8 }}>
            {form.to_all_groups
              ? "Выбрано: Все группы и ученики платформы"
              : `Выбрано групп: ${form.group_ids.length} из ${safeGroups.length}`}
          </div>
        </div>

        <div className="row" style={{ marginTop: 16, justifyContent: "flex-end", gap: 8 }}>
          {editingId && (
            <button type="button" className="btn ghost" onClick={handleCancel}>
              Отмена
            </button>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={isSubmitting}
            onClick={handleSubmit}
            style={{ minWidth: 140 }}
          >
            {isSubmitting ? "Сохранение..." : editingId ? "💾 Сохранить изменения" : "🚀 Опубликовать объявление"}
          </button>
        </div>
      </div>

      {/* Announcements header and search */}
      <div className="card" style={{ marginBottom: 14, padding: "12px 16px" }}>
        <div className="spread" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div className="row" style={{ alignItems: "center", gap: 8 }}>
            <h4 style={{ margin: 0 }}>Опубликованные объявления</h4>
            <span className="badge" style={{ background: "var(--bg-card, #f1f5f9)" }}>
              {safeAnnouncements.length}
            </span>
          </div>

          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Поиск по объявлениям..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: 220, padding: "6px 10px", fontSize: 13 }}
            />
            <button
              type="button"
              className="btn small ghost"
              onClick={loadAnnouncements}
              title="Обновить список"
            >
              🔄 Обновить
            </button>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="card" style={{ background: "#fef2f2", borderColor: "#fca5a5", color: "#991b1b", marginBottom: 12 }}>
          <b>Ошибка загрузки:</b> {error}
          <div style={{ marginTop: 6 }}>
            <button className="btn small" onClick={loadAnnouncements}>Попробовать снова</button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && safeAnnouncements.length === 0 && (
        <div className="card muted" style={{ textAlign: "center", padding: 32 }}>
          ⏳ Загрузка объявлений...
        </div>
      )}

      {/* Announcements list */}
      <div className="list">
        {filteredAnnouncements.map((a) => {
          const itemGroups = Array.isArray(a.groups) ? a.groups : [];
          return (
            <div key={a.id} className="card" style={{ transition: "all 0.15s ease" }}>
              <div className="spread" style={{ alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text, #0f172a)" }}>
                    {a.title}
                  </div>
                  <div className="muted small" style={{ marginTop: 4 }}>
                    👤 {a.author || "Администратор"} · 📅 {a.created_at ? new Date(a.created_at).toLocaleString("ru-RU") : ""}
                    {a.updated_at && a.updated_at !== a.created_at && (
                      <span title={new Date(a.updated_at).toLocaleString("ru-RU")}> · изменено</span>
                    )}
                  </div>
                </div>

                <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => handleEdit(a)}
                    title="Редактировать объявление"
                  >
                    ✏️ Изм.
                  </button>
                  <button
                    type="button"
                    className="btn danger small"
                    onClick={() => handleDelete(a.id)}
                    title="Удалить объявление"
                  >
                    🗑️ Уд.
                  </button>
                </div>
              </div>

              <div
                style={{
                  marginTop: 10,
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.6,
                  color: "var(--text, #1e293b)",
                  fontSize: 14.5,
                }}
              >
                {a.body}
              </div>

              <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px dashed var(--border, #e2e8f0)" }}>
                <div className="chips" style={{ alignItems: "center" }}>
                  <span className="muted small" style={{ marginRight: 4 }}>
                    Получатели:
                  </span>
                  {itemGroups.length > 0 ? (
                    itemGroups.map((g) => (
                      <span key={g?.id || Math.random()} className="tag" style={{ fontSize: 12 }}>
                        {g?.course ? `${g.course} — ` : ""}{g?.name || "Группа"}
                      </span>
                    ))
                  ) : (
                    <span
                      className="tag"
                      style={{ background: "#ecfdf5", color: "#065f46", borderColor: "#a7f3d0", fontSize: 12 }}
                    >
                      🌐 Все группы и ученики
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {!loading && filteredAnnouncements.length === 0 && (
          <div className="card muted" style={{ textAlign: "center", padding: 32 }}>
            {searchQuery
              ? "По вашему запросу объявлений не найдено"
              : "Объявлений пока нет. Создайте первое объявление в форме выше!"}
          </div>
        )}
      </div>
    </div>
  );
}
