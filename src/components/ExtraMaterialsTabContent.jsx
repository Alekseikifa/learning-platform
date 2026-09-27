import { useEffect, useState } from "react";
import { api, uploadFile } from "../api";
import ChatPanel from "./ChatPanel";
import Modal from "./Modal";
import { getIcon } from "../lib/materialIcons";

const MAT_TYPES = [
  { v: "video", l: "🎬 Видео" },
  { v: "document", l: "📄 Документ / конспект" },
  { v: "note", l: "📝 Текстовая заметка" },
  { v: "audio", l: "🎧 Аудио" },
  { v: "image", l: "🖼 Рисунок" },
];

export default function ExtraMaterialsTabContent({ courses = [], groups = [], apiPrefix = "/api/admin" }) {
  const [extraMaterials, setExtraMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [chatMaterial, setChatMaterial] = useState(null);

  // Filters
  const [filterCourse, setFilterCourse] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // New material form
  const [form, setForm] = useState({
    title: "",
    type: "video",
    url: "",
    description: "",
    order_index: 1,
    course_ids: [],
    group_ids: [],
  });

  // Editing state
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const loadList = async () => {
    setLoading(true);
    try {
      const data = await api(`${apiPrefix}/extra-materials`);
      setExtraMaterials(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, [apiPrefix]);

  const handleToggleCourse = (cid) => {
    setForm((prev) => ({
      ...prev,
      course_ids: prev.course_ids.includes(cid)
        ? prev.course_ids.filter((id) => id !== cid)
        : [...prev.course_ids, cid],
    }));
  };

  const handleToggleGroup = (gid) => {
    setForm((prev) => ({
      ...prev,
      group_ids: prev.group_ids.includes(gid)
        ? prev.group_ids.filter((id) => id !== gid)
        : [...prev.group_ids, gid],
    }));
  };

  const selectAllCourses = () => setForm((f) => ({ ...f, course_ids: courses.map((c) => c.id) }));
  const clearAllCourses = () => setForm((f) => ({ ...f, course_ids: [] }));
  const selectAllGroups = () => setForm((f) => ({ ...f, group_ids: groups.map((g) => g.id) }));
  const clearAllGroups = () => setForm((f) => ({ ...f, group_ids: [] }));

  const handleUploadNew = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadFile(file);
      const inferredType = file.type.startsWith("audio")
        ? "audio"
        : file.type.startsWith("image")
        ? "image"
        : file.type.includes("pdf") || file.name.endsWith(".doc") || file.name.endsWith(".docx")
        ? "document"
        : file.type.startsWith("video")
        ? "video"
        : "document";
      setForm((f) => ({ ...f, url: res.url, type: inferredType }));
    } catch (err) {
      alert(err.message || "Ошибка загрузки файла");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return alert("Введите название дополнительного материала");
    if (!form.course_ids.length && !form.group_ids.length) {
      if (!confirm("Материал не привязан ни к одному курсу и ни к одной группе. Сохранить всё равно?")) {
        return;
      }
    }

    try {
      await api(`${apiPrefix}/extra-materials`, {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          type: form.type,
          url: form.url.trim(),
          order_index: Number(form.order_index) || 0,
          course_ids: form.course_ids,
          group_ids: form.group_ids,
        }),
      });
      setForm({
        title: "",
        type: "video",
        url: "",
        description: "",
        order_index: extraMaterials.length + 2,
        course_ids: [],
        group_ids: [],
      });
      await loadList();
    } catch (err) {
      alert(err.message || "Ошибка добавления");
    }
  };

  const startEdit = (mat) => {
    setEditingId(mat.id);
    setEditForm({
      title: mat.title,
      description: mat.description || "",
      type: mat.type || "video",
      url: mat.url || "",
      order_index: mat.order_index ?? 0,
      course_ids: Array.isArray(mat.course_ids) ? [...mat.course_ids] : mat.course_id ? [mat.course_id] : [],
      group_ids: Array.isArray(mat.group_ids) ? [...mat.group_ids] : [],
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleEditToggleCourse = (cid) => {
    setEditForm((prev) => ({
      ...prev,
      course_ids: prev.course_ids.includes(cid)
        ? prev.course_ids.filter((id) => id !== cid)
        : [...prev.course_ids, cid],
    }));
  };

  const handleEditToggleGroup = (gid) => {
    setEditForm((prev) => ({
      ...prev,
      group_ids: prev.group_ids.includes(gid)
        ? prev.group_ids.filter((id) => id !== gid)
        : [...prev.group_ids, gid],
    }));
  };

  const saveEdit = async (id) => {
    if (!editForm.title.trim()) return alert("Введите название материала");
    try {
      await api(`${apiPrefix}/extra-materials/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: editForm.title.trim(),
          description: editForm.description.trim(),
          type: editForm.type,
          url: editForm.url.trim(),
          order_index: Number(editForm.order_index) || 0,
          course_ids: editForm.course_ids,
          group_ids: editForm.group_ids,
        }),
      });
      cancelEdit();
      await loadList();
    } catch (err) {
      alert(err.message || "Ошибка сохранения");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Удалить дополнительный материал и историю его обсуждений?")) return;
    try {
      await api(`${apiPrefix}/extra-materials/${id}`, { method: "DELETE" });
      await loadList();
    } catch (err) {
      alert(err.message);
    }
  };

  // Filter materials
  const filteredMaterials = extraMaterials.filter((m) => {
    if (filterCourse) {
      const cids = m.course_ids || (m.course_id ? [m.course_id] : []);
      if (!cids.includes(Number(filterCourse))) return false;
    }
    if (filterGroup) {
      const gids = m.group_ids || [];
      if (!gids.includes(Number(filterGroup))) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (m.title || "").toLowerCase().includes(q);
      const matchDesc = (m.description || "").toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }
    return true;
  });

  return (
    <div>
      {/* Creation form */}
      <form className="card" onSubmit={handleAdd} style={{ marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 4px" }}>Добавить дополнительный материал</h3>
        <div className="muted small" style={{ marginBottom: 12 }}>
          Дополнительные материалы не содержат тестов и имеют собственный чат обсуждения. Здесь вы можете прикрепить один и тот же материал сразу к нескольким курсам и группам.
        </div>

        <div className="row" style={{ gap: 8 }}>
          <input
            placeholder="Название дополнительного материала *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            style={{ flex: 2 }}
          />
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            style={{ width: 170 }}
          >
            {MAT_TYPES.map((t) => (
              <option key={t.v} value={t.v}>
                {t.l}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Порядок"
            value={form.order_index}
            onChange={(e) => setForm({ ...form, order_index: e.target.value })}
            style={{ width: 85 }}
            title="Порядковый номер"
          />
        </div>

        <div style={{ marginTop: 8 }}>
          {form.type === "note" ? (
            <textarea
              placeholder="Текст заметки / конспекта *"
              rows={4}
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              style={{ width: "100%" }}
              required
            />
          ) : (
            <div className="row" style={{ gap: 8 }}>
              <input
                placeholder="Ссылка на материал (URL) или загрузите файл →"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                style={{ flex: 1 }}
              />
              <label className="btn ghost" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
                {uploading ? "Загрузка..." : "📎 Загрузить файл"}
                <input type="file" hidden onChange={handleUploadNew} disabled={uploading} />
              </label>
            </div>
          )}
        </div>

        <div style={{ marginTop: 8 }}>
          <input
            placeholder="Краткое описание / пояснение к материалу (опционально)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={{ width: "100%" }}
          />
        </div>

        {/* Course Assignment */}
        <div style={{ marginTop: 14 }}>
          <div className="spread" style={{ alignItems: "center", marginBottom: 6 }}>
            <div>
              <b className="small">Привязать к курсам:</b>
              <span className="muted small" style={{ marginLeft: 8 }}>
                (выбрано: {form.course_ids.length} из {courses.length})
              </span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn small ghost" onClick={selectAllCourses}>
                Выбрать все курсы
              </button>
              <button type="button" className="btn small ghost" onClick={clearAllCourses}>
                Снять все
              </button>
            </div>
          </div>
          <div className="chips" style={{ margin: 0 }}>
            {courses.map((c) => (
              <label key={c.id} className="chip" style={{ cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={form.course_ids.includes(c.id)}
                  onChange={() => handleToggleCourse(c.id)}
                />
                {c.title}
              </label>
            ))}
            {!courses.length && <span className="muted small">Курсов пока нет</span>}
          </div>
        </div>

        {/* Group Assignment */}
        <div style={{ marginTop: 12 }}>
          <div className="spread" style={{ alignItems: "center", marginBottom: 6 }}>
            <div>
              <b className="small">Привязать к группам:</b>
              <span className="muted small" style={{ marginLeft: 8 }}>
                (выбрано: {form.group_ids.length} из {groups.length})
              </span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn small ghost" onClick={selectAllGroups}>
                Выбрать все группы
              </button>
              <button type="button" className="btn small ghost" onClick={clearAllGroups}>
                Снять все
              </button>
            </div>
          </div>
          <div className="chips" style={{ margin: 0 }}>
            {groups.map((g) => (
              <label key={g.id} className="chip" style={{ cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={form.group_ids.includes(g.id)}
                  onChange={() => handleToggleGroup(g.id)}
                />
                {g.course_title ? `${g.course_title} — ` : ""}{g.name}
              </label>
            ))}
            {!groups.length && <span className="muted small">Групп пока нет</span>}
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>
            💡 Если выбраны курсы, материал увидят все группы этих курсов. Дополнительно можно выбрать конкретные группы других курсов.
          </div>
        </div>

        <div className="spread" style={{ marginTop: 16, alignItems: "center" }}>
          <span className="tag ok">С чатом обсуждения · Без тестов</span>
          <button className="btn primary" disabled={uploading}>
            Добавить материал
          </button>
        </div>
      </form>

      {/* Filter & Search Bar */}
      <div className="card row" style={{ alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <b className="small">Фильтр:</b>
        <div className="row" style={{ alignItems: "center", gap: 6 }}>
          <label className="small">Курс:</label>
          <select value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)}>
            <option value="">Все курсы ({extraMaterials.length})</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        <div className="row" style={{ alignItems: "center", gap: 6 }}>
          <label className="small">Группа:</label>
          <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
            <option value="">Все группы</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.course_title ? `${g.course_title} — ` : ""}{g.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            placeholder="🔍 Поиск по названию или описанию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        {(filterCourse || filterGroup || searchQuery) && (
          <button
            className="btn small ghost"
            onClick={() => {
              setFilterCourse("");
              setFilterGroup("");
              setSearchQuery("");
            }}
          >
            Сбросить фильтры
          </button>
        )}
      </div>

      {/* Materials List */}
      <div className="list">
        {loading && <div className="card muted">Загрузка материалов...</div>}

        {!loading && filteredMaterials.length === 0 && (
          <div className="card muted">
            {extraMaterials.length === 0
              ? "Дополнительных материалов пока нет. Добавьте первый материал выше."
              : "По выбранным фильтрам ничего не найдено."}
          </div>
        )}

        {!loading &&
          filteredMaterials.map((m) => {
            const isEditing = editingId === m.id;
            const linkedCourseIds = m.course_ids || (m.course_id ? [m.course_id] : []);
            const linkedGroupIds = m.group_ids || [];

            if (isEditing) {
              return (
                <div key={m.id} className="card" style={{ border: "2px solid var(--gold)" }}>
                  <div className="spread" style={{ marginBottom: 10 }}>
                    <b>Редактирование материала #{m.id}</b>
                    <button className="btn small ghost" onClick={cancelEdit}>
                      ✕
                    </button>
                  </div>

                  <div className="row" style={{ gap: 8 }}>
                    <input
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      placeholder="Название"
                      style={{ flex: 2 }}
                    />
                    <select
                      value={editForm.type}
                      onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                      style={{ width: 170 }}
                    >
                      {MAT_TYPES.map((t) => (
                        <option key={t.v} value={t.v}>
                          {t.l}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={editForm.order_index}
                      onChange={(e) => setEditForm({ ...editForm, order_index: e.target.value })}
                      style={{ width: 85 }}
                      title="Порядок"
                    />
                  </div>

                  <div style={{ marginTop: 8 }}>
                    {editForm.type === "note" ? (
                      <textarea
                        rows={4}
                        value={editForm.url}
                        onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                        style={{ width: "100%" }}
                        placeholder="Текст заметки"
                      />
                    ) : (
                      <input
                        value={editForm.url}
                        onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                        placeholder="Ссылка на файл / URL"
                        style={{ width: "100%" }}
                      />
                    )}
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <input
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      placeholder="Описание"
                      style={{ width: "100%" }}
                    />
                  </div>

                  {/* Edit Course Links */}
                  <div style={{ marginTop: 12 }}>
                    <b className="small">Привязанные курсы:</b>
                    <div className="chips" style={{ marginTop: 4 }}>
                      {courses.map((c) => (
                        <label key={c.id} className="chip" style={{ cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={editForm.course_ids.includes(c.id)}
                            onChange={() => handleEditToggleCourse(c.id)}
                          />
                          {c.title}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Edit Group Links */}
                  <div style={{ marginTop: 10 }}>
                    <b className="small">Привязанные группы:</b>
                    <div className="chips" style={{ marginTop: 4 }}>
                      {groups.map((g) => (
                        <label key={g.id} className="chip" style={{ cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={editForm.group_ids.includes(g.id)}
                            onChange={() => handleEditToggleGroup(g.id)}
                          />
                          {g.course_title ? `${g.course_title} — ` : ""}{g.name}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                    <button className="btn ghost" onClick={cancelEdit}>
                      Отмена
                    </button>
                    <button className="btn primary" onClick={() => saveEdit(m.id)}>
                      Сохранить изменения
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} className="card">
                <div className="spread" style={{ alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <b>
                        #{m.order_index} {getIcon(m.type)} {m.title}
                      </b>
                      <span className="tag ok">Без тестов</span>
                      {m.chat_messages_count !== undefined && (
                        <span className="tag">
                          💬 {m.chat_messages_count} сообщ.
                        </span>
                      )}
                    </div>

                    {m.description && (
                      <div className="muted small" style={{ marginTop: 4 }}>
                        {m.description}
                      </div>
                    )}

                    {m.url && (
                      <div className="small" style={{ marginTop: 4 }}>
                        {m.url.startsWith("http") || m.url.startsWith("/uploads") || m.url.startsWith("/api/files") ? (
                          <a href={m.url} target="_blank" rel="noreferrer" className="muted">
                            🔗 {m.url}
                          </a>
                        ) : (
                          <span className="muted">
                            📝 {m.url.slice(0, 100)}
                            {m.url.length > 100 ? "..." : ""}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Linked Courses & Groups Chips */}
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      <div className="row" style={{ gap: 4, alignItems: "center" }}>
                        <span className="small muted">Курсы:</span>
                        {linkedCourseIds.length > 0 ? (
                          linkedCourseIds.map((cid) => {
                            const cObj = courses.find((c) => c.id === cid);
                            return (
                              <span key={cid} className="tag ok" style={{ fontSize: 11 }}>
                                📚 {cObj ? cObj.title : `Курс #${cid}`}
                              </span>
                            );
                          })
                        ) : (
                          <span className="small muted">не привязан к курсам</span>
                        )}
                      </div>

                      <div className="row" style={{ gap: 4, alignItems: "center" }}>
                        <span className="small muted">Группы:</span>
                        {linkedGroupIds.length > 0 ? (
                          linkedGroupIds.map((gid) => {
                            const gObj = groups.find((g) => g.id === gid);
                            return (
                              <span key={gid} className="tag" style={{ fontSize: 11 }}>
                                👥 {gObj ? (gObj.course_title ? `${gObj.course_title} — ${gObj.name}` : gObj.name) : `Группа #${gid}`}
                              </span>
                            );
                          })
                        ) : (
                          <span className="small muted">все группы выбранных курсов</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="row" style={{ gap: 6, alignItems: "center", marginLeft: 12 }}>
                    <button
                      className="btn small primary"
                      onClick={() => setChatMaterial(m)}
                      title="Открыть чат обсуждения материала"
                    >
                      💬 Чат обсуждения
                    </button>
                    <button className="btn small" onClick={() => startEdit(m)}>
                      Изм.
                    </button>
                    <button className="btn danger small" onClick={() => handleDelete(m.id)}>
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Discussion Chat Modal */}
      {chatMaterial && (
        <Modal onClose={() => setChatMaterial(null)} innerStyle={{ maxWidth: 680 }}>
            <div className="spread" style={{ alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <h3 style={{ margin: 0 }}>💬 Чат обсуждения материала</h3>
                <div className="muted small">
                  «{chatMaterial.title}» · Участвуют ученики привязанных групп, кураторы и администраторы
                </div>
              </div>
              <button className="btn ghost" onClick={() => setChatMaterial(null)}>
                ✕
              </button>
            </div>
            <ChatPanel extraMaterialId={chatMaterial.id} apiBase="/api/staff" />
        </Modal>
      )}
    </div>
  );
}
