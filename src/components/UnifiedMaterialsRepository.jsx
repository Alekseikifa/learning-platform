import { useEffect, useState, useMemo } from "react";
import { api, uploadFile } from "../api";
import Modal from "./Modal";

export const MAT_FORMATS = [
  { v: "video", l: "🎬 Видео", badgeColor: "#1E3A5F", bg: "#EBF1F8" },
  { v: "note", l: "📝 Текст / Конспект", badgeColor: "#5A7247", bg: "#E8EDE0" },
  { v: "document", l: "📄 Документ / PDF", badgeColor: "#B8703E", bg: "#FBF0E6" },
  { v: "audio", l: "🎧 Аудио", badgeColor: "#7B4B94", bg: "#F4EBF8" },
  { v: "image", l: "🖼 Рисунок / Схема", badgeColor: "#0D7C75", bg: "#E2F5F4" },
  { v: "link", l: "🔗 Ссылка", badgeColor: "#555555", bg: "#EFEFEF" },
];

export function getFormatInfo(type) {
  return MAT_FORMATS.find(f => f.v === type) || { v: type, l: "📎 Файл", badgeColor: "#555", bg: "#eee" };
}

export default function UnifiedMaterialsRepository({ courses = [], apiPrefix = "/api/admin" }) {
  const [materials, setMaterials] = useState([]);
  const [playlistsList, setThemesList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState("playlists"); // "playlists" | "flat"

  // Filter & Search
  const [search, setSearch] = useState("");
  const [selectedPlaylistFilter, setSelectedThemeFilter] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("all");

  // Add/Edit Material Modal / Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [uploading, setUploading] = useState(false);

  // New Material Form
  const [form, setForm] = useState({
    title: "",
    playlist_name: "",
    new_playlist_name: "",
    type: "video",
    url: "",
    description: "",
    order_index: 1,
  });

  // Attach to Course Modal State
  const [attachModal, setAttachModal] = useState({
    open: false,
    mode: "playlist", // "playlist" or "material"
    playlistName: "",
    material: null,
    courseId: courses[0]?.id || "",
    targetType: "theme", // "theme" (add as course theme) | "extra" (add as course extra material)
    courseThemeId: "",
  });

  // Rename playlist modal
  const [renamePlaylistModal, setRenameThemeModal] = useState({
    open: false,
    oldName: "",
    newName: "",
  });

  // Preview Note Modal
  const [previewNote, setPreviewNote] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [mats, thms] = await Promise.all([
        api(`${apiPrefix}/repository/materials`),
        api(`${apiPrefix}/repository/playlists`),
      ]);
      setMaterials(mats || []);
      setThemesList(thms || []);
    } catch (err) {
      console.error("Failed to load repository:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [apiPrefix]);

  // Derived existing playlist names
  const existingPlaylistNames = useMemo(() => {
    return playlistsList.map(t => t.playlist_name);
  }, [playlistsList]);

  // Handle open add modal
  const openAddForPlaylist = (playlistName = "") => {
    const existingInTheme = materials.filter(m => m.playlist_name === playlistName);
    setForm({
      title: "",
      playlist_name: playlistName || (existingPlaylistNames[0] || ""),
      new_playlist_name: "",
      type: "video",
      url: "",
      description: "",
      order_index: existingInTheme.length + 1,
    });
    setEditingMaterial(null);
    setShowAddModal(true);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadFile(file);
      let detectedType = form.type;
      if (file.type.startsWith("video")) detectedType = "video";
      else if (file.type.startsWith("audio")) detectedType = "audio";
      else if (file.type.startsWith("image")) detectedType = "image";
      else if (file.type.includes("pdf") || file.name.endsWith(".pdf") || file.name.endsWith(".doc") || file.name.endsWith(".docx")) {
        detectedType = "document";
      }
      setForm(prev => ({
        ...prev,
        url: "/uploads/" + res.filename,
        type: detectedType,
        title: prev.title || file.name.replace(/\.[^/.]+$/, ""),
      }));
    } catch (err) {
      alert("Ошибка загрузки файла: " + (err.message || err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSaveMaterial = async (e) => {
    e.preventDefault();
    const finalTheme = (form.playlist_name === "__new__" || !form.playlist_name)
      ? (form.new_playlist_name.trim() || "Общие материалы")
      : form.playlist_name.trim();

    if (!form.title.trim()) {
      alert("Пожалуйста, введите название урока или материала");
      return;
    }

    const payload = {
      title: form.title.trim(),
      playlist_name: finalTheme,
      type: form.type,
      url: form.url.trim(),
      description: form.description.trim(),
      order_index: Number(form.order_index) || 1,
    };

    try {
      if (editingMaterial) {
        await api(`${apiPrefix}/repository/materials/${editingMaterial.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api(`${apiPrefix}/repository/materials`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setShowAddModal(false);
      setEditingMaterial(null);
      await loadData();
    } catch (err) {
      alert("Ошибка сохранения: " + (err.message || err));
    }
  };

  const handleDeleteMaterial = async (id, title) => {
    if (!confirm(`Удалить материал «${title}» из накопителя?`)) return;
    try {
      await api(`${apiPrefix}/repository/materials/${id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      alert("Ошибка удаления: " + (err.message || err));
    }
  };

  const handleEditClick = (mat) => {
    setEditingMaterial(mat);
    setForm({
      title: mat.title,
      playlist_name: mat.playlist_name,
      new_playlist_name: "",
      type: mat.type,
      url: mat.url,
      description: mat.description || "",
      order_index: mat.order_index || 1,
    });
    setShowAddModal(true);
  };

  // Reorder material inside playlist
  const handleChangeOrder = async (mat, newOrder) => {
    if (newOrder < 1 || newOrder === mat.order_index) return;
    try {
      await api(`${apiPrefix}/repository/materials/${mat.id}`, {
        method: "PUT",
        body: JSON.stringify({ order_index: Number(newOrder) }),
      });
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  // Rename playlist across all items
  const handleRenamePlaylistSubmit = async (e) => {
    e.preventDefault();
    const { oldName, newName } = renamePlaylistModal;
    if (!newName.trim() || newName.trim() === oldName) {
      setRenameThemeModal({ open: false, oldName: "", newName: "" });
      return;
    }

    const itemsToUpdate = materials.filter(m => m.playlist_name === oldName);
    try {
      for (const item of itemsToUpdate) {
        await api(`${apiPrefix}/repository/materials/${item.id}`, {
          method: "PUT",
          body: JSON.stringify({ playlist_name: newName.trim() }),
        });
      }
      setRenameThemeModal({ open: false, oldName: "", newName: "" });
      await loadData();
    } catch (err) {
      alert("Ошибка при переименовании плейлиста: " + (err.message || err));
    }
  };

  // Execute Attachment to Course
  const handleAttachSubmit = async (e) => {
    e.preventDefault();
    const { mode, playlistName, material, courseId, targetType, courseThemeId } = attachModal;
    if (!courseId) {
      alert("Выберите курс для привязки");
      return;
    }

    const selectedCourse = courses.find(c => c.id === Number(courseId));
    const courseTitle = selectedCourse?.title || `Курс #${courseId}`;

    try {
      if (mode === "playlist") {
        if (targetType === "theme") {
          // Import entire playlist as course theme with lessons
          const res = await api(`${apiPrefix}/courses/${courseId}/import-playlist`, {
            method: "POST",
            body: JSON.stringify({ playlist_name: playlistName }),
          });
          alert(`Успешно! Плейлист «${playlistName}» (${res.imported_count} уроков) импортирован в курс «${courseTitle}» как тема.`);
        } else {
          // Import as extra materials
          const res = await api(`${apiPrefix}/courses/${courseId}/import-extra-playlist`, {
            method: "POST",
            body: JSON.stringify({ playlist_name: playlistName }),
          });
          alert(`Успешно! ${res.count} материалов плейлиста «${playlistName}» добавлены в доп. материалы курса «${courseTitle}».`);
        }
      } else if (mode === "material" && material) {
        if (targetType === "theme") {
          if (!courseThemeId) {
            alert("Выберите тему внутри курса для прикрепления урока");
            return;
          }
          await api(`${apiPrefix}/courses/${courseId}/themes/${courseThemeId}/attach-material`, {
            method: "POST",
            body: JSON.stringify({ repository_material_id: material.id }),
          });
          alert(`Урок «${material.title}» прикреплен к теме курса «${courseTitle}».`);
        } else {
          await api(`${apiPrefix}/courses/${courseId}/attach-extra-material`, {
            method: "POST",
            body: JSON.stringify({ repository_material_id: material.id }),
          });
          alert(`Материал «${material.title}» добавлен в дополнительные материалы курса «${courseTitle}».`);
        }
      }

      setAttachModal(prev => ({ ...prev, open: false }));
    } catch (err) {
      alert("Ошибка привязки: " + (err.message || err));
    }
  };

  // Filtered materials
  const filteredMaterials = useMemo(() => {
    return materials.filter(m => {
      if (selectedPlaylistFilter && m.playlist_name !== selectedPlaylistFilter) return false;
      if (selectedTypeFilter !== "all" && m.type !== selectedTypeFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchTitle = (m.title || "").toLowerCase().includes(q);
        const matchPlaylist = (m.playlist_name || "").toLowerCase().includes(q);
        const matchDesc = (m.description || "").toLowerCase().includes(q);
        const matchUrl = (m.url || "").toLowerCase().includes(q);
        if (!matchTitle && !matchPlaylist && !matchDesc && !matchUrl) return false;
      }
      return true;
    });
  }, [materials, selectedPlaylistFilter, selectedTypeFilter, search]);

  // Group filtered materials by playlist
  const groupedPlaylists = useMemo(() => {
    const map = new Map();
    for (const m of filteredMaterials) {
      const key = m.playlist_name || "Без плейлиста";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    return Array.from(map.entries()).map(([name, items]) => {
      items.sort((a, b) => (a.order_index || 0) - (b.order_index || 0) || a.id - b.id);
      return { playlist_name: name, materials: items };
    });
  }, [filteredMaterials]);

  // Stats calculation
  const stats = useMemo(() => {
    const byType = {};
    for (const m of materials) {
      byType[m.type] = (byType[m.type] || 0) + 1;
    }
    return {
      total: materials.length,
      playlistsCount: existingPlaylistNames.length,
      byType,
    };
  }, [materials, existingPlaylistNames]);

  const targetCourseThemes = useMemo(() => {
    const cid = Number(attachModal.courseId);
    const c = courses.find(item => item.id === cid);
    return c?.themes || [];
  }, [courses, attachModal.courseId]);

  return (
    <div className="unified-repository" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Informative Header Banner */}
      <div className="card" style={{ background: "linear-gradient(135deg, #FAF8F3 0%, #F3EEE4 100%)", border: "1px solid var(--border)", position: "relative" }}>
        <div className="spread" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>📁</span>
              <h3 style={{ margin: 0 }}>Файловый накопитель материалов и плейлистов</h3>
            </div>
            <p className="muted" style={{ margin: 0, maxWidth: 820, fontSize: 14 }}>
              Центральное хранилище для всех форматов обучающих материалов: <b>видео</b>, <b>конспекты/тексты</b>, <b>документы</b>, <b>аудио</b>, <b>рисунки и схемы</b>.
              Объединяйте файлы в плейлисты (материалы плейлиста), а затем во вкладке <b>«Курсы и темы»</b> привязывайте готовый плейлист целиком или отдельные материалы к курсам.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn primary"
              onClick={() => openAddForPlaylist("")}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}
            >
              <span>➕</span> Загрузить / добавить урок
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                const name = prompt("Введите название нового плейлиста:");
                if (name && name.trim()) openAddForPlaylist(name.trim());
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <span>📑</span> Создать плейлист
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div className="tag" style={{ background: "#FFFFFF", border: "1px solid var(--border)", padding: "4px 10px", borderRadius: 6 }}>
            📚 <b>{stats.playlistsCount}</b> плейлистов
          </div>
          <div className="tag" style={{ background: "#FFFFFF", border: "1px solid var(--border)", padding: "4px 10px", borderRadius: 6 }}>
            📄 <b>{stats.total}</b> материалов/уроков
          </div>
          {MAT_FORMATS.map(f => {
            const count = stats.byType[f.v] || 0;
            if (!count) return null;
            return (
              <div
                key={f.v}
                className="tag"
                style={{ background: f.bg, color: f.badgeColor, border: `1px solid ${f.badgeColor}33`, padding: "4px 10px", borderRadius: 6 }}
              >
                {f.l}: <b>{count}</b>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 220, position: "relative" }}>
          <input
            placeholder="🔍 Поиск по названию урока, плейлисту, конспекту или файлу..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", paddingLeft: 12 }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", color: "#888" }}
            >
              ✕
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 180 }}>
          <span className="small muted">Плейлист:</span>
          <select
            value={selectedPlaylistFilter}
            onChange={e => setSelectedThemeFilter(e.target.value)}
            style={{ flex: 1 }}
          >
            <option value="">Все плейлисты ({existingPlaylistNames.length})</option>
            {existingPlaylistNames.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 160 }}>
          <span className="small muted">Формат:</span>
          <select
            value={selectedTypeFilter}
            onChange={e => setSelectedTypeFilter(e.target.value)}
          >
            <option value="all">Все форматы</option>
            {MAT_FORMATS.map(f => (
              <option key={f.v} value={f.v}>{f.l}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          <button
            type="button"
            className={"btn small " + (activeView === "playlists" ? "primary" : "ghost")}
            onClick={() => setActiveView("playlists")}
            title="Группировать по плейлистам"
          >
            🗂 По плейлистам
          </button>
          <button
            type="button"
            className={"btn small " + (activeView === "flat" ? "primary" : "ghost")}
            onClick={() => setActiveView("flat")}
            title="Показать все файлы единым списком"
          >
            📋 Все файлы
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="card muted" style={{ textAlign: "center", padding: 30 }}>
          Загрузка накопителя материалов...
        </div>
      ) : activeView === "playlists" ? (
        /* Grouped by Themes View */
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {groupedPlaylists.length === 0 ? (
            <div className="card muted" style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              <div>В накопителе нет материалов, соответствующих фильтрам.</div>
              <button
                type="button"
                className="btn primary small"
                style={{ marginTop: 12 }}
                onClick={() => openAddForPlaylist("")}
              >
                ➕ Добавить первый материал в накопитель
              </button>
            </div>
          ) : (
            groupedPlaylists.map(({ playlist_name, materials: items }) => (
              <PlaylistStorageCard
                key={playlist_name}
                playlistName={playlist_name}
                items={items}
                courses={courses}
                onAddLesson={() => openAddForPlaylist(playlist_name)}
                onEditLesson={handleEditClick}
                onDeleteLesson={handleDeleteMaterial}
                onChangeOrder={handleChangeOrder}
                onRenamePlaylist={() => setRenameThemeModal({ open: true, oldName: playlist_name, newName: playlist_name })}
                onAttachPlaylist={() => setAttachModal({
                  open: true,
                  mode: "playlist",
                  playlistName: playlist_name,
                  material: null,
                  courseId: courses[0]?.id || "",
                  targetType: "theme",
                  courseThemeId: "",
                })}
                onAttachMaterial={(mat) => setAttachModal({
                  open: true,
                  mode: "material",
                  playlistName: playlist_name,
                  material: mat,
                  courseId: courses[0]?.id || "",
                  targetType: "theme",
                  courseThemeId: "",
                })}
                onPreviewNote={setPreviewNote}
              />
            ))
          )}
        </div>
      ) : (
        /* Flat List View */
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", background: "var(--bg-soft)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b>Все материалы ({filteredMaterials.length})</b>
            <span className="small muted">Сортировка: Плейлист → Порядковый номер</span>
          </div>

          <div className="list" style={{ margin: 0 }}>
            {filteredMaterials.map(mat => (
              <FlatMaterialRow
                key={mat.id}
                material={mat}
                onEdit={() => handleEditClick(mat)}
                onDelete={() => handleDeleteMaterial(mat.id, mat.title)}
                onAttach={() => setAttachModal({
                  open: true,
                  mode: "material",
                  playlistName: mat.playlist_name,
                  material: mat,
                  courseId: courses[0]?.id || "",
                  targetType: "theme",
                  courseThemeId: "",
                })}
                onPreviewNote={() => setPreviewNote(mat)}
              />
            ))}
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT MATERIAL */}
      {showAddModal && (
        <Modal
          onClose={() => setShowAddModal(false)}
          backdropClassName="modal-overlay"
          backdropStyle={overlayStyle}
          innerClassName="card modal-content"
          innerStyle={modalContentStyle}
        >
            <div className="spread" style={{ marginBottom: 14, alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
              <h3 style={{ margin: 0 }}>
                {editingMaterial ? "✏️ Редактирование материала" : "➕ Загрузить материал в накопитель"}
              </h3>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setShowAddModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMaterial} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Theme selection */}
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>
                  Плейлист (раздел, объединяющий материалы): <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    value={form.playlist_name}
                    onChange={e => setForm(f => ({ ...f, playlist_name: e.target.value }))}
                    style={{ flex: 1 }}
                  >
                    <option value="__new__">✨ Создать новый плейлист...</option>
                    {existingPlaylistNames.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                {(form.playlist_name === "__new__" || !form.playlist_name) && (
                  <input
                    placeholder="Введите название нового плейлиста (например: 1. Призвание ученика)"
                    value={form.new_playlist_name}
                    onChange={e => setForm(f => ({ ...f, new_playlist_name: e.target.value }))}
                    required
                    style={{ marginTop: 6, width: "100%" }}
                  />
                )}
              </div>

              {/* Title and order */}
              <div className="row" style={{ gap: 10 }}>
                <div style={{ flex: 3 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>
                    Название материала / урока: <span style={{ color: "var(--danger)" }}>*</span>
                  </label>
                  <input
                    placeholder="Например: Урок 1: Вводная лекция"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    required
                    style={{ width: "100%" }}
                  />
                </div>

                <div style={{ flex: 1, minWidth: 100 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>
                    Порядок №:
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.order_index}
                    onChange={e => setForm(f => ({ ...f, order_index: e.target.value }))}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              {/* Format selection */}
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>
                  Формат материала:
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 6 }}>
                  {MAT_FORMATS.map(f => (
                    <button
                      key={f.v}
                      type="button"
                      className="btn"
                      onClick={() => setForm(prev => ({ ...prev, type: f.v }))}
                      style={{
                        padding: "8px 10px",
                        fontSize: 13,
                        textAlign: "left",
                        justifyContent: "flex-start",
                        border: form.type === f.v ? `2px solid ${f.badgeColor}` : "1px solid var(--border)",
                        background: form.type === f.v ? f.bg : "#FFFFFF",
                        color: form.type === f.v ? f.badgeColor : "inherit",
                        fontWeight: form.type === f.v ? 600 : 400,
                      }}
                    >
                      {f.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content / Upload Area */}
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>
                  {form.type === "note" ? "Текст заметки / конспекта:" : "Файл или ссылка (URL):"} <span style={{ color: "var(--danger)" }}>*</span>
                </label>

                {form.type === "note" ? (
                  <textarea
                    placeholder="Введите или вставьте текст конспекта, тезисы лекции, цитаты из Писания..."
                    value={form.url}
                    onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                    rows={6}
                    required
                    style={{ width: "100%", fontFamily: "inherit", fontSize: 14 }}
                  />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {/* Drag and Drop or Browse File Upload */}
                    <div
                      style={{
                        border: "2px dashed var(--border)",
                        borderRadius: 8,
                        padding: "16px 20px",
                        textAlign: "center",
                        background: uploading ? "var(--gold-soft)" : "var(--bg)",
                        cursor: "pointer",
                      }}
                      onClick={() => document.getElementById("repo-file-input")?.click()}
                    >
                      <input
                        id="repo-file-input"
                        type="file"
                        hidden
                        onChange={handleFileUpload}
                        disabled={uploading}
                      />
                      <div style={{ fontSize: 24, marginBottom: 4 }}>
                        {uploading ? "⏳" : "📤"}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {uploading ? "Загрузка файла на сервер..." : "Нажмите для выбора файла или перетащите его сюда"}
                      </div>
                      <div className="small muted" style={{ marginTop: 4 }}>
                        Поддерживаются видео (MP4, WEBM), аудио (MP3, WAV), документы (PDF, DOCX), рисунки (JPG, PNG) до 500 МБ
                      </div>
                    </div>

                    {/* Direct URL input fallback */}
                    <div className="row" style={{ gap: 8, alignItems: "center" }}>
                      <span className="small muted" style={{ whiteSpace: "nowrap" }}>Либо прямая ссылка:</span>
                      <input
                        placeholder="https://... или /uploads/..."
                        value={form.url}
                        onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                        required
                        style={{ flex: 1 }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>
                  Краткое описание / пояснение к уроку (опционально):
                </label>
                <input
                  placeholder="Например: Ключевые вопросы для повторения и практическое задание"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  style={{ width: "100%" }}
                />
              </div>

              {/* Action buttons */}
              <div className="spread" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setShowAddModal(false)}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={uploading}
                  style={{ fontWeight: 600 }}
                >
                  {editingMaterial ? "Сохранить изменения" : "💾 Добавить в накопитель"}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {/* MODAL: ATTACH TO COURSE */}
      {attachModal.open && (
        <Modal
          onClose={() => setAttachModal(prev => ({ ...prev, open: false }))}
          backdropClassName="modal-overlay"
          backdropStyle={overlayStyle}
          innerClassName="card modal-content"
          innerStyle={modalContentStyle}
        >
            <div className="spread" style={{ marginBottom: 14, alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
              <h3 style={{ margin: 0 }}>
                {attachModal.mode === "playlist"
                  ? `📥 Привязать плейлист «${attachModal.playlistName}» к курсу`
                  : `📎 Привязать урок «${attachModal.material?.title}» к курсу`}
              </h3>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setAttachModal(prev => ({ ...prev, open: false }))}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAttachSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
                  Выберите целевой курс:
                </label>
                <select
                  value={attachModal.courseId}
                  onChange={e => setAttachModal(prev => ({ ...prev, courseId: e.target.value, courseThemeId: "" }))}
                  style={{ width: "100%" }}
                  required
                >
                  <option value="">-- Выберите курс --</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>
                      #{c.id} {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
                  Куда добавить в курсе:
                </label>
                <div style={{ display: "flex", gap: 10 }}>
                  <label className="btn" style={{ flex: 1, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, background: attachModal.targetType === "theme" ? "var(--olive-soft)" : "transparent", borderColor: attachModal.targetType === "theme" ? "var(--olive)" : "var(--border)" }}>
                    <input
                      type="radio"
                      name="targetType"
                      checked={attachModal.targetType === "theme"}
                      onChange={() => setAttachModal(prev => ({ ...prev, targetType: "theme" }))}
                    />
                    <span>📚 Как тему курса с уроками</span>
                  </label>
                  <label className="btn" style={{ flex: 1, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, background: attachModal.targetType === "extra" ? "var(--gold-soft)" : "transparent", borderColor: attachModal.targetType === "extra" ? "var(--gold)" : "var(--border)" }}>
                    <input
                      type="radio"
                      name="targetType"
                      checked={attachModal.targetType === "extra"}
                      onChange={() => setAttachModal(prev => ({ ...prev, targetType: "extra" }))}
                    />
                    <span>🌟 В дополнительные материалы курса</span>
                  </label>
                </div>
              </div>

              {/* If single material and targetType is theme, pick which course theme */}
              {attachModal.mode === "material" && attachModal.targetType === "theme" && (
                <div>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
                    В какую тему курса добавить этот урок:
                  </label>
                  {targetCourseThemes.length === 0 ? (
                    <div className="small muted">
                      В выбранном курсе пока нет тем. Перейдите во вкладку «Курсы и темы» или выберите привязку в «Дополнительные материалы».
                    </div>
                  ) : (
                    <select
                      value={attachModal.courseThemeId}
                      onChange={e => setAttachModal(prev => ({ ...prev, courseThemeId: e.target.value }))}
                      style={{ width: "100%" }}
                      required
                    >
                      <option value="">-- Выберите тему курса --</option>
                      {targetCourseThemes.map(t => (
                        <option key={t.id} value={t.id}>
                          Тема {t.order_index}. {t.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div className="spread" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setAttachModal(prev => ({ ...prev, open: false }))}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  style={{ fontWeight: 600 }}
                >
                  Привязать к курсу
                </button>
              </div>
            </form>
        </Modal>
      )}

      {/* MODAL: RENAME THEME */}
      {renamePlaylistModal.open && (
        <Modal
          onClose={() => setRenameThemeModal({ open: false, oldName: "", newName: "" })}
          backdropClassName="modal-overlay"
          backdropStyle={overlayStyle}
          innerClassName="card modal-content"
          innerStyle={modalContentStyle}
        >
            <div className="spread" style={{ marginBottom: 14, alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
              <h3 style={{ margin: 0 }}>✏️ Переименовать плейлист</h3>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setRenameThemeModal({ open: false, oldName: "", newName: "" })}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRenamePlaylistSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label className="small muted" style={{ display: "block", marginBottom: 4 }}>Текущее название:</label>
                <input value={renamePlaylistModal.oldName} disabled style={{ width: "100%", opacity: 0.7 }} />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Новое название плейлиста:</label>
                <input
                  value={renamePlaylistModal.newName}
                  onChange={e => setRenameThemeModal(prev => ({ ...prev, newName: e.target.value }))}
                  required
                  style={{ width: "100%" }}
                  autoFocus
                />
              </div>

              <div className="spread" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setRenameThemeModal({ open: false, oldName: "", newName: "" })}
                >
                  Отмена
                </button>
                <button type="submit" className="btn primary">
                  Сохранить
                </button>
              </div>
            </form>
        </Modal>
      )}

      {/* MODAL: PREVIEW NOTE */}
      {previewNote && (
        <Modal
          onClose={() => setPreviewNote(null)}
          backdropClassName="modal-overlay"
          backdropStyle={overlayStyle}
          innerClassName="card modal-content"
          innerStyle={{ ...modalContentStyle, maxWidth: 650 }}
        >
            <div className="spread" style={{ marginBottom: 12, alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
              <div>
                <span className="small muted">{previewNote.playlist_name}</span>
                <h3 style={{ margin: 0 }}>📝 {previewNote.title}</h3>
              </div>
              <button type="button" className="btn ghost small" onClick={() => setPreviewNote(null)} aria-label="Закрыть">✕</button>
            </div>
            {previewNote.description && (
              <div className="muted small" style={{ marginBottom: 10, fontStyle: "italic" }}>
                {previewNote.description}
              </div>
            )}
            <div style={{ whiteSpace: "pre-wrap", background: "var(--bg)", padding: 14, borderRadius: 8, fontSize: 14, lineHeight: 1.6, maxHeight: 400, overflowY: "auto" }}>
              {previewNote.url}
            </div>
        </Modal>
      )}
    </div>
  );
}

// Subcomponent: Card for a single playlist grouping materials
function PlaylistStorageCard({
  playlistName,
  items,
  courses,
  onAddLesson,
  onEditLesson,
  onDeleteLesson,
  onChangeOrder,
  onRenamePlaylist,
  onAttachPlaylist,
  onAttachMaterial,
  onPreviewNote,
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Group counts by format
  const formatCounts = useMemo(() => {
    const counts = {};
    for (const it of items) {
      counts[it.type] = (counts[it.type] || 0) + 1;
    }
    return counts;
  }, [items]);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", border: "1px solid var(--border)" }}>
      {/* Theme Header Bar */}
      <div
        style={{
          padding: "12px 16px",
          background: "var(--bg-soft)",
          borderBottom: collapsed ? "none" : "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 240 }}>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => setCollapsed(!collapsed)}
            style={{ padding: "4px 8px", fontSize: 13 }}
            title={collapsed ? "Развернуть плейлист" : "Свернуть плейлист"}
          >
            {collapsed ? "▶" : "▼"}
          </button>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>📚</span>
              <b style={{ fontSize: 16, color: "var(--navy)" }}>{playlistName}</b>
              <button
                type="button"
                className="btn ghost small"
                onClick={onRenamePlaylist}
                title="Переименовать плейлист"
                style={{ padding: "2px 6px", fontSize: 12, opacity: 0.7 }}
              >
                ✏️
              </button>
            </div>
            <div className="small muted" style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
              <span><b>{items.length}</b> уроков/файлов:</span>
              {MAT_FORMATS.map(f => {
                const count = formatCounts[f.v];
                if (!count) return null;
                return (
                  <span key={f.v} style={{ color: f.badgeColor }}>
                    {f.l.split(" ")[0]} {count}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action buttons on playlist */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            className="btn primary small"
            onClick={onAttachPlaylist}
            style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <span>📥</span> Привязать весь плейлист к курсу →
          </button>
          <button
            type="button"
            className="btn ghost small"
            onClick={onAddLesson}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <span>➕</span> Материал в плейлист
          </button>
        </div>
      </div>

      {/* Lessons List inside this Theme */}
      {!collapsed && (
        <div className="list" style={{ margin: 0 }}>
          {items.map((mat, idx) => {
            const fmt = getFormatInfo(mat.type);
            return (
              <div
                key={mat.id}
                className="spread"
                style={{
                  padding: "10px 16px",
                  alignItems: "center",
                  borderBottom: idx < items.length - 1 ? "1px solid var(--border)" : "none",
                  background: idx % 2 === 0 ? "#FFFFFF" : "#FAF8F3",
                }}
              >
                {/* Left: Order and Title */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 260 }}>
                  {/* Order control */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span
                      style={{
                        display: "inline-block",
                        minWidth: 26,
                        height: 26,
                        lineHeight: "26px",
                        textAlign: "center",
                        borderRadius: "50%",
                        background: "var(--bg-soft)",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--navy)",
                      }}
                    >
                      {mat.order_index || idx + 1}
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => onChangeOrder(mat, (mat.order_index || idx + 1) - 1)}
                        style={{ padding: "0 3px", fontSize: 9, lineHeight: 1 }}
                        title="Поднять выше"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => onChangeOrder(mat, (mat.order_index || idx + 1) + 1)}
                        style={{ padding: "0 3px", fontSize: 9, lineHeight: 1 }}
                        title="Опустить ниже"
                      >
                        ▼
                      </button>
                    </div>
                  </div>

                  {/* Format badge */}
                  <span
                    className="tag"
                    style={{
                      background: fmt.bg,
                      color: fmt.badgeColor,
                      border: `1px solid ${fmt.badgeColor}33`,
                      fontSize: 12,
                      padding: "3px 8px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmt.l}
                  </span>

                  {/* Title & description */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {mat.title}
                    </div>
                    {mat.description && (
                      <div className="small muted" style={{ marginTop: 2 }}>
                        {mat.description}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Preview & Action Buttons */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {/* Preview action */}
                  {mat.type === "note" ? (
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => onPreviewNote(mat)}
                      style={{ fontSize: 12 }}
                    >
                      📖 Читать текст
                    </button>
                  ) : (
                    <a
                      href={mat.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn ghost small"
                      style={{ fontSize: 12, textDecoration: "none" }}
                    >
                      ↗ Открыть файл
                    </a>
                  )}

                  {/* Attach to course */}
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => onAttachMaterial(mat)}
                    style={{ fontSize: 12, color: "var(--navy)", fontWeight: 600 }}
                    title="Прикрепить этот отдельный урок к курсу"
                  >
                    📎 В курс →
                  </button>

                  {/* Edit */}
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => onEditLesson(mat)}
                    title="Редактировать"
                  >
                    Изм.
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    className="btn danger small"
                    onClick={() => onDeleteLesson(mat.id, mat.title)}
                    title="Удалить"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Subcomponent: Flat material row
function FlatMaterialRow({ material, onEdit, onDelete, onAttach, onPreviewNote }) {
  const fmt = getFormatInfo(material.type);

  return (
    <div
      className="spread"
      style={{
        padding: "10px 16px",
        alignItems: "center",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
        <span
          className="tag"
          style={{
            background: fmt.bg,
            color: fmt.badgeColor,
            border: `1px solid ${fmt.badgeColor}33`,
            fontSize: 12,
            padding: "3px 8px",
            whiteSpace: "nowrap",
          }}
        >
          {fmt.l}
        </span>

        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {material.title}
          </div>
          <div className="small muted">
            Плейлист: <b>{material.playlist_name}</b> · Порядок: #{material.order_index}
            {material.description && ` · ${material.description}`}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {material.type === "note" ? (
          <button type="button" className="btn ghost small" onClick={onPreviewNote}>
            📖 Текст
          </button>
        ) : (
          <a href={material.url} target="_blank" rel="noreferrer" className="btn ghost small" style={{ textDecoration: "none" }}>
            ↗ Файл
          </a>
        )}
        <button type="button" className="btn ghost small" onClick={onAttach} style={{ fontWeight: 600, color: "var(--navy)" }}>
          📎 В курс
        </button>
        <button type="button" className="btn small" onClick={onEdit}>Изм.</button>
        <button type="button" className="btn danger small" onClick={onDelete} aria-label="Удалить">✕</button>
      </div>
    </div>
  );
}

// Modal styles
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
  zIndex: 1000,
  padding: 16,
};

const modalContentStyle = {
  background: "#FFFFFF",
  borderRadius: 12,
  width: "100%",
  maxWidth: 580,
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
  padding: 20,
};
