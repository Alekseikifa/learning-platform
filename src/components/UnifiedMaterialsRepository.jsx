import { useEffect, useState, useMemo } from "react";
import { api, uploadFile } from "../api";
import Modal from "./Modal";
import SmartMediaViewer, { getPlatformBadge, parseVideoUrl } from "./SmartMediaViewer";
import RichTextEditor, { sanitizeRichHtml } from "./RichTextEditor";

function cleanPastedUrl(raw) {
  if (!raw || typeof raw !== "string") return raw;
  const str = raw.trim();
  const iframeMatch = str.match(/src=["']([^"']+)["']/i);
  return iframeMatch ? iframeMatch[1].trim() : str;
}

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

  // Expanded playlists state: all playlists are collapsed by default!
  const [expandedPlaylists, setExpandedPlaylists] = useState(() => new Set());
  // Highlighted playlist for centering and visual focus
  const [highlightedPlaylist, setHighlightedPlaylist] = useState(null);

  // Toggle single playlist
  const handleTogglePlaylist = (name) => {
    if (!name) return;
    setExpandedPlaylists(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  // Expand ONLY the changed playlist, center it in the window and highlight
  const focusPlaylist = (playlistName) => {
    if (!playlistName) return;
    // Only the changed playlist should be expanded, all others collapsed
    setExpandedPlaylists(new Set([playlistName]));
    setHighlightedPlaylist(playlistName);
    setActiveView("playlists");

    setTimeout(() => {
      const el = document.getElementById(`playlist-card-${encodeURIComponent(playlistName)}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);

    setTimeout(() => {
      setHighlightedPlaylist(prev => (prev === playlistName ? null : prev));
    }, 2800);
  };

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
    sources: [],
    synopsis: "",
    audio_url: "",
    attachments: [],
    description: "",
    order_index: 1,
    no_report: false,
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
  // Full Lesson Preview Modal (SmartMediaViewer)
  const [previewLesson, setPreviewLesson] = useState(null);

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
      sources: [],
      synopsis: "",
      audio_url: "",
      attachments: [],
      description: "",
      order_index: existingInTheme.length + 1,
      no_report: false,
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
        url: res.url || ("/api/files/" + res.id),
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
      sources: form.sources || [],
      synopsis: form.synopsis ? form.synopsis.trim() : null,
      audio_url: form.audio_url ? form.audio_url.trim() : null,
      attachments: form.attachments || [],
      description: form.description.trim(),
      order_index: Number(form.order_index) || 1,
      no_report: Boolean(form.no_report),
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
      focusPlaylist(finalTheme);
    } catch (err) {
      alert("Ошибка сохранения: " + (err.message || err));
    }
  };

  const handleDeleteMaterial = async (id, title) => {
    if (!confirm(`Удалить материал «${title}» из накопителя?`)) return;
    const targetMat = materials.find(m => m.id === id);
    const playlistName = targetMat?.playlist_name;
    try {
      await api(`${apiPrefix}/repository/materials/${id}`, { method: "DELETE" });
      await loadData();
      if (playlistName) {
        focusPlaylist(playlistName);
      }
    } catch (err) {
      alert("Ошибка удаления: " + (err.message || err));
    }
  };

  const handleEditClick = (mat) => {
    setEditingMaterial(mat);
    setForm({
      title: mat.title || "",
      playlist_name: mat.playlist_name || "",
      new_playlist_name: "",
      type: mat.type || "video",
      url: mat.url || "",
      sources: Array.isArray(mat.sources) ? JSON.parse(JSON.stringify(mat.sources)) : [],
      synopsis: mat.synopsis || "",
      audio_url: mat.audio_url || "",
      attachments: Array.isArray(mat.attachments) ? JSON.parse(JSON.stringify(mat.attachments)) : [],
      description: mat.description || "",
      order_index: mat.order_index || 1,
      no_report: Boolean(mat.no_report),
    });
    setShowAddModal(true);
  };

  // Video sources management
  const handleAddSource = () => {
    setForm(f => ({
      ...f,
      sources: [
        ...(f.sources || []),
        { platform: "vk", url: "", label: "ВКонтакте (VK Видео)" }
      ]
    }));
  };

  const handleRemoveSource = (idx) => {
    setForm(f => ({
      ...f,
      sources: (f.sources || []).filter((_, i) => i !== idx)
    }));
  };

  const handleSourceChange = (idx, field, value) => {
    const finalVal = field === "url" ? cleanPastedUrl(value) : value;
    setForm(f => {
      const list = [...(f.sources || [])];
      list[idx] = { ...list[idx], [field]: finalVal };
      if (field === "platform") {
        const badge = getPlatformBadge(value);
        if (!list[idx].label || list[idx].label.includes("VK") || list[idx].label.includes("YouTube") || list[idx].label.includes("RuTube")) {
          list[idx].label = badge.label;
        }
      }
      return { ...f, sources: list };
    });
  };

  const handleSourceFileUpload = async (idx, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadFile(file);
      const url = res.url || ("/api/files/" + res.id);
      handleSourceChange(idx, "url", url);
      handleSourceChange(idx, "platform", "file");
      handleSourceChange(idx, "label", "Видеофайл (" + file.name.slice(0, 20) + ")");
    } catch (err) {
      alert("Ошибка загрузки видеофайла: " + (err.message || err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // Audio file upload
  const handleAudioUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadFile(file);
      setForm(f => ({ ...f, audio_url: res.url || ("/api/files/" + res.id) }));
    } catch (err) {
      alert("Ошибка загрузки аудиофайла: " + (err.message || err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // Attachments management
  const handleAddAttachmentUrl = () => {
    setForm(f => ({
      ...f,
      attachments: [
        ...(f.attachments || []),
        { title: "Документ к уроку", url: "", type: "document" }
      ]
    }));
  };

  const handleRemoveAttachment = (idx) => {
    setForm(f => ({
      ...f,
      attachments: (f.attachments || []).filter((_, i) => i !== idx)
    }));
  };

  const handleAttachmentChange = (idx, field, value) => {
    setForm(f => {
      const list = [...(f.attachments || [])];
      list[idx] = { ...list[idx], [field]: value };
      return { ...f, attachments: list };
    });
  };

  const handleAttachmentFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadFile(file);
      const url = res.url || ("/api/files/" + res.id);
      const isDoc = file.name.endsWith(".doc") || file.name.endsWith(".docx") || file.name.endsWith(".pdf");
      const isImg = file.type.startsWith("image");
      const isAudio = file.type.startsWith("audio");
      const attType = isDoc ? "document" : isImg ? "image" : isAudio ? "audio" : "document";

      setForm(f => ({
        ...f,
        attachments: [
          ...(f.attachments || []),
          {
            title: file.name.replace(/\.[^/.]+$/, ""),
            url,
            type: attType,
            file_name: file.name,
            file_size: file.size,
          }
        ]
      }));
    } catch (err) {
      alert("Ошибка загрузки документа: " + (err.message || err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // Reorder material inside playlist
  const handleChangeOrder = async (mat, newOrder) => {
    if (newOrder < 1 || newOrder === mat.order_index) return;
    const playlistName = mat.playlist_name;
    try {
      await api(`${apiPrefix}/repository/materials/${mat.id}`, {
        method: "PUT",
        body: JSON.stringify({ order_index: Number(newOrder) }),
      });
      await loadData();
      if (playlistName) {
        focusPlaylist(playlistName);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Rename playlist across all items
  const handleRenamePlaylistSubmit = async (e) => {
    e.preventDefault();
    const { oldName, newName } = renamePlaylistModal;
    const targetName = newName.trim();
    if (!targetName || targetName === oldName) {
      setRenameThemeModal({ open: false, oldName: "", newName: "" });
      return;
    }

    const itemsToUpdate = materials.filter(m => m.playlist_name === oldName);
    try {
      for (const item of itemsToUpdate) {
        await api(`${apiPrefix}/repository/materials/${item.id}`, {
          method: "PUT",
          body: JSON.stringify({ playlist_name: targetName }),
        });
      }
      setRenameThemeModal({ open: false, oldName: "", newName: "" });
      await loadData();
      focusPlaylist(targetName);
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

        <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap", alignItems: "center" }}>
          {activeView === "playlists" && groupedPlaylists.length > 0 && (
            <div style={{ display: "flex", gap: 4, marginRight: 6 }}>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setExpandedPlaylists(new Set())}
                title="Свернуть все плейлисты"
                style={{ fontSize: 12, padding: "4px 8px" }}
              >
                ◀ Свернуть все
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setExpandedPlaylists(new Set(groupedPlaylists.map(g => g.playlist_name)))}
                title="Развернуть все плейлисты"
                style={{ fontSize: 12, padding: "4px 8px" }}
              >
                ▼ Развернуть все
              </button>
            </div>
          )}

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
                isCollapsed={!expandedPlaylists.has(playlist_name)}
                onToggleCollapse={() => handleTogglePlaylist(playlist_name)}
                isHighlighted={highlightedPlaylist === playlist_name}
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
                onPreviewLesson={setPreviewLesson}
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
                onPreviewLesson={() => setPreviewLesson(mat)}
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
          innerStyle={{ ...modalContentStyle, maxWidth: 760 }}
        >
            <div className="spread" style={{ marginBottom: 14, alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
              <div>
                <h3 style={{ margin: 0 }}>
                  {editingMaterial ? "✏️ Редактирование урока / материала" : "➕ Добавить урок / материал в накопитель"}
                </h3>
                <span className="small muted">
                  Поддержка нескольких источников видео (VK, YouTube, RuTube), конспекта, аудио и документов
                </span>
              </div>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setShowAddModal(false)}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMaterial} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Playlist selection */}
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
                    placeholder="Введите название нового плейлиста (например: Библейские заветы)"
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
                    placeholder="Например: Библейские заветы, урок первый, Дмитрий Бабков"
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
                  Основной формат материала:
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

              {/* Primary Content / Upload Area */}
              <div style={{ background: "#F8FAFC", padding: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: 13 }}>
                  {form.type === "note" ? "Текст заметки / конспекта:" : "Основная ссылка на видео / файл (URL):"} <span style={{ color: "var(--danger)" }}>*</span>
                </label>

                {form.type === "note" ? (
                  <RichTextEditor
                    value={form.url || ""}
                    onChange={val => setForm(f => ({ ...f, url: val }))}
                    placeholder="Введите или вставьте текст конспекта, тезисы лекции, цитаты из Писания..."
                    minHeight={300}
                    maxHeight={520}
                  />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {/* Drag and Drop or Browse File Upload */}
                    <div
                      style={{
                        border: "2px dashed var(--border)",
                        borderRadius: 8,
                        padding: "14px 16px",
                        textAlign: "center",
                        background: uploading ? "var(--gold-soft)" : "#FFFFFF",
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
                      <div style={{ fontSize: 22, marginBottom: 2 }}>
                        {uploading ? "⏳" : "📤"}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {uploading ? "Загрузка файла на сервер..." : "Нажмите для выбора файла или перетащите его сюда"}
                      </div>
                      <div className="small muted" style={{ marginTop: 2 }}>
                        Поддерживаются видео (MP4, WEBM), аудио, документы (PDF, DOCX)
                      </div>
                    </div>

                    {/* Direct URL input */}
                    <div className="row" style={{ gap: 8, alignItems: "center" }}>
                      <span className="small muted" style={{ whiteSpace: "nowrap" }}>Ссылка:</span>
                      <input
                        placeholder="https://vk.com/video... или https://youtube.com/watch?v=... или /api/files/..."
                        value={form.url}
                        onChange={e => setForm(f => ({ ...f, url: cleanPastedUrl(e.target.value) }))}
                        required
                        style={{ flex: 1 }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION: ALTERNATIVE VIDEO SOURCES (ВКонтакте, YouTube, RuTube...) */}
              <div style={{
                background: "#EFF6FF",
                padding: "14px",
                borderRadius: 8,
                border: "1px solid #BFDBFE",
              }}>
                <div className="spread" style={{ alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                  <div>
                    <b style={{ color: "#1D4ED8", fontSize: 13 }}>
                      📺 Альтернативные источники видео (ВКонтакте, YouTube, RuTube...)
                    </b>
                    <div className="small muted" style={{ color: "#3B82F6" }}>
                      Ученик сможет в один клик переключиться на VK, если YouTube не загружается
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn small"
                    onClick={handleAddSource}
                    style={{
                      background: "#2563EB",
                      color: "#FFFFFF",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontWeight: 600,
                    }}
                  >
                    ➕ Добавить источник видео
                  </button>
                </div>

                {(!form.sources || form.sources.length === 0) ? (
                  <div className="small muted" style={{ fontStyle: "italic", padding: "6px 0" }}>
                    Альтернативные источники пока не добавлены. Нажмите «➕ Добавить источник видео», чтобы добавить ссылку на ВКонтакте, YouTube или RuTube.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {form.sources.map((src, sIdx) => {
                      return (
                        <div
                          key={sIdx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            background: "#FFFFFF",
                            padding: "8px 10px",
                            borderRadius: 6,
                            border: "1px solid #DBEAFE",
                            flexWrap: "wrap",
                          }}
                        >
                          <select
                            value={src.platform || "vk"}
                            onChange={e => handleSourceChange(sIdx, "platform", e.target.value)}
                            style={{ width: 140, fontSize: 12, padding: "4px 8px" }}
                          >
                            <option value="vk">🔷 ВКонтакте (VK)</option>
                            <option value="youtube">▶️ YouTube</option>
                            <option value="rutube">🔴 RuTube</option>
                            <option value="ok">🟠 OK.ru</option>
                            <option value="file">🎬 Видеофайл</option>
                            <option value="other">🔗 Другой источник</option>
                          </select>

                          <input
                            placeholder="Подпись кнопки (напр: ВКонтакте)"
                            value={src.label || ""}
                            onChange={e => handleSourceChange(sIdx, "label", e.target.value)}
                            style={{ width: 150, fontSize: 12, padding: "4px 8px" }}
                            title="Текст на кнопке переключения источника для учеников"
                          />

                          <input
                            placeholder="URL видео (https://vk.com/... или https://youtube.com/...)"
                            value={src.url || ""}
                            onChange={e => handleSourceChange(sIdx, "url", e.target.value)}
                            style={{ flex: 1, minWidth: 160, fontSize: 12, padding: "4px 8px" }}
                          />

                          <label
                            className="btn small ghost"
                            style={{
                              fontSize: 11,
                              padding: "4px 8px",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                            title="Загрузить локальный видеофайл на сервер"
                          >
                            {uploading ? "⏳" : "📤 Файл"}
                            <input
                              type="file"
                              accept="video/*"
                              hidden
                              onChange={e => handleSourceFileUpload(sIdx, e)}
                              disabled={uploading}
                            />
                          </label>

                          <button
                            type="button"
                            className="btn danger small"
                            onClick={() => handleRemoveSource(sIdx)}
                            style={{ padding: "3px 7px", fontSize: 11 }}
                            title="Удалить этот источник"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SECTION: TEXT SYNOPSIS (Конспект первого урока в текстовом варианте) */}
              <div style={{
                background: "#F0FDF4",
                padding: "14px",
                borderRadius: 8,
                border: "1px solid #BBF7D0",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 16 }}>📝</span>
                  <b style={{ color: "#166534", fontSize: 13 }}>
                    Текстовый конспект урока (тезисы лекции, план, ключевые места Писания):
                  </b>
                </div>
                <div className="small muted" style={{ color: "#15803D", marginBottom: 6 }}>
                  Вы можете прикрепить к видеоуроку конспект в текстовом виде. Ученики смогут читать его прямо под видео или на сплит-экране.
                </div>
                <RichTextEditor
                  value={form.synopsis || ""}
                  onChange={val => setForm(f => ({ ...f, synopsis: val }))}
                  placeholder="Введите тезисы лекции, план урока, ключевые места Писания или вставьте готовый конспект..."
                  minHeight={320}
                  maxHeight={540}
                />
              </div>

              {/* SECTION: AUDIO RECORDING (Аудио к первому уроку) */}
              <div style={{
                background: "#FAF5FF",
                padding: "14px",
                borderRadius: 8,
                border: "1px solid #E9D5FF",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 16 }}>🎧</span>
                  <b style={{ color: "#6B21A8", fontSize: 13 }}>
                    Аудиозапись к уроку (MP3 / аудиоверсия лекции):
                  </b>
                </div>
                <div className="small muted" style={{ color: "#7E22CE", marginBottom: 8 }}>
                  Прикрепите аудиоверсию урока, чтобы ученики могли слушать лекцию в наушниках или в дороге.
                </div>

                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <input
                    placeholder="https://... или /api/files/... (ссылка на MP3/WAV)"
                    value={form.audio_url || ""}
                    onChange={e => setForm(f => ({ ...f, audio_url: e.target.value }))}
                    style={{ flex: 1, fontSize: 13, background: "#FFFFFF" }}
                  />
                  <label
                    className="btn small"
                    style={{
                      background: "#7E22CE",
                      color: "#FFFFFF",
                      cursor: "pointer",
                      fontSize: 12,
                      padding: "6px 12px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {uploading ? "⏳ Загрузка..." : "📤 Загрузить MP3"}
                    <input
                      type="file"
                      accept="audio/*"
                      hidden
                      onChange={handleAudioUpload}
                      disabled={uploading}
                    />
                  </label>
                  {form.audio_url && (
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => setForm(f => ({ ...f, audio_url: "" }))}
                      title="Удалить аудио"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {form.audio_url && (
                  <div style={{ marginTop: 8 }}>
                    <audio controls src={form.audio_url} style={{ width: "100%", height: 36 }} />
                  </div>
                )}
              </div>

              {/* SECTION: MULTIPLE ATTACHMENTS (Прикреплённые документы: PDF, Word, файлы) */}
              <div style={{
                background: "#FFFBEB",
                padding: "14px",
                borderRadius: 8,
                border: "1px solid #FDE68A",
              }}>
                <div className="spread" style={{ alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                  <div>
                    <b style={{ color: "#92400E", fontSize: 13 }}>
                      📎 Прикреплённые документы и файлы к уроку
                    </b>
                    <div className="small muted" style={{ color: "#B45309" }}>
                      Конспекты в PDF, рабочие тетради, схемы и презентации
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6 }}>
                    <label
                      className="btn small"
                      style={{
                        background: "#D97706",
                        color: "#FFFFFF",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: 12,
                        padding: "4px 10px",
                      }}
                    >
                      {uploading ? "⏳ Загрузка..." : "📎 Загрузить файл/PDF"}
                      <input
                        type="file"
                        hidden
                        onChange={handleAttachmentFileUpload}
                        disabled={uploading}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn small ghost"
                      onClick={handleAddAttachmentUrl}
                      style={{ fontSize: 12, padding: "4px 8px" }}
                    >
                      ➕ По ссылке
                    </button>
                  </div>
                </div>

                {(!form.attachments || form.attachments.length === 0) ? (
                  <div className="small muted" style={{ fontStyle: "italic", padding: "6px 0" }}>
                    Документы к уроку пока не прикреплены. Нажмите «Загрузить файл/PDF» или «По ссылке».
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {form.attachments.map((att, aIdx) => (
                      <div
                        key={aIdx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          background: "#FFFFFF",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #FDE68A",
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontSize: 16 }}>📄</span>
                        <input
                          placeholder="Название документа (напр: Конспект урока №1 PDF)"
                          value={att.title || ""}
                          onChange={e => handleAttachmentChange(aIdx, "title", e.target.value)}
                          style={{ flex: 2, minWidth: 150, fontSize: 12, padding: "4px 8px" }}
                        />
                        <input
                          placeholder="URL / ссылка на документ"
                          value={att.url || ""}
                          onChange={e => handleAttachmentChange(aIdx, "url", e.target.value)}
                          style={{ flex: 3, minWidth: 180, fontSize: 12, padding: "4px 8px" }}
                        />
                        {att.file_size ? (
                          <span className="small muted" style={{ fontSize: 11 }}>
                            {(att.file_size / (1024 * 1024)).toFixed(2)} МБ
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className="btn danger small"
                          onClick={() => handleRemoveAttachment(aIdx)}
                          style={{ padding: "3px 7px", fontSize: 11 }}
                          title="Удалить этот документ"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
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

              {/* Checkbox: No Report Required */}
              <div style={{
                background: form.no_report ? "#FEF3C7" : "#F8FAFC",
                padding: "10px 14px",
                borderRadius: 8,
                border: form.no_report ? "1px solid #F59E0B" : "1px solid #E2E8F0",
                transition: "all 0.15s ease",
              }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 600, fontSize: 13, color: form.no_report ? "#92400E" : "var(--navy)" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(form.no_report)}
                    onChange={e => setForm(f => ({ ...f, no_report: e.target.checked }))}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                  <span>Отметить материал: по нему не нужно писать отчёт (без отчёта)</span>
                </label>
                <div className="small muted" style={{ marginTop: 4, marginLeft: 26, color: form.no_report ? "#B45309" : undefined }}>
                  Ученикам не потребуется сдавать отчёт по этому уроку декану. Урок не будет требоваться в обязательной статистике сдачи отчётов по теме.
                </div>
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
                  style={{ fontWeight: 600, padding: "8px 20px" }}
                >
                  {editingMaterial ? "💾 Сохранить изменения" : "💾 Добавить в накопитель"}
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
            {/<[a-z][\s\S]*>/i.test(previewNote.url || "") ? (
              <div
                className="rich-synopsis"
                style={{ background: "var(--bg)", padding: 14, borderRadius: 8, fontSize: 14, lineHeight: 1.6, maxHeight: 400, overflowY: "auto" }}
                dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(previewNote.url) }}
              />
            ) : (
              <div style={{ whiteSpace: "pre-wrap", background: "var(--bg)", padding: 14, borderRadius: 8, fontSize: 14, lineHeight: 1.6, maxHeight: 400, overflowY: "auto" }}>
                {previewNote.url}
              </div>
            )}
          </Modal>
      )}

      {/* MODAL: PREVIEW LESSON (SMART MEDIA VIEWER) */}
      {previewLesson && (
        <Modal
          onClose={() => setPreviewLesson(null)}
          backdropClassName="modal-overlay"
          backdropStyle={overlayStyle}
          innerClassName="card modal-content"
          innerStyle={{ ...modalContentStyle, maxWidth: 840 }}
        >
          <div className="spread" style={{ marginBottom: 12, alignItems: "flex-start", borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
            <div>
              <span className="tag" style={{ fontSize: 11, marginBottom: 4, display: "inline-block" }}>
                📚 Плейлист: {previewLesson.playlist_name}
              </span>
              <h3 style={{ margin: "2px 0 0", color: "var(--navy)" }}>{previewLesson.title}</h3>
              {previewLesson.description && (
                <div className="muted small" style={{ marginTop: 4 }}>
                  {previewLesson.description}
                </div>
              )}
            </div>
            <button type="button" className="btn ghost small" onClick={() => setPreviewLesson(null)} aria-label="Закрыть">✕</button>
          </div>

          <SmartMediaViewer
            url={previewLesson.url}
            sources={previewLesson.sources || []}
            title={previewLesson.title}
            description={previewLesson.description}
            audio_url={previewLesson.audio_url}
            synopsis={previewLesson.synopsis}
            attachments={previewLesson.attachments || []}
          />

          <div className="spread" style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border)", alignItems: "center" }}>
            <span className="small muted">
              Так этот урок увидят ученики в курсе при выборе источника видео, аудио и конспекта
            </span>
            <button type="button" className="btn ghost" onClick={() => setPreviewLesson(null)}>
              Закрыть
            </button>
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
  isCollapsed = true,
  onToggleCollapse,
  isHighlighted = false,
  onAddLesson,
  onEditLesson,
  onDeleteLesson,
  onChangeOrder,
  onRenamePlaylist,
  onAttachPlaylist,
  onAttachMaterial,
  onPreviewNote,
  onPreviewLesson,
}) {
  // Group counts by format
  const formatCounts = useMemo(() => {
    const counts = {};
    for (const it of items) {
      counts[it.type] = (counts[it.type] || 0) + 1;
    }
    return counts;
  }, [items]);

  return (
    <div
      id={`playlist-card-${encodeURIComponent(playlistName)}`}
      className="card playlist-card-box"
      style={{
        padding: 0,
        overflow: "hidden",
        border: isHighlighted ? "2px solid #2563EB" : "1px solid var(--border)",
        boxShadow: isHighlighted
          ? "0 0 0 4px rgba(37, 99, 235, 0.25), 0 8px 24px rgba(37, 99, 235, 0.18)"
          : "var(--shadow, 0 1px 3px rgba(0,0,0,0.05))",
        transition: "border-color 0.3s ease, box-shadow 0.3s ease",
        scrollMargin: "100px",
      }}
    >
      {/* Theme Header Bar */}
      <div
        style={{
          padding: "12px 16px",
          background: isHighlighted ? "#EFF6FF" : "var(--bg-soft)",
          borderBottom: isCollapsed ? "none" : "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          cursor: "pointer",
        }}
        onClick={(e) => {
          if (e.target.closest("button") || e.target.closest("input")) return;
          onToggleCollapse?.();
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 240 }}>
          <button
            type="button"
            className="btn ghost small"
            onClick={onToggleCollapse}
            style={{ padding: "4px 8px", fontSize: 13 }}
            title={isCollapsed ? "Развернуть плейлист" : "Свернуть плейлист"}
          >
            {isCollapsed ? "▶" : "▼"}
          </button>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 18 }}>📚</span>
              <b style={{ fontSize: 16, color: "var(--navy)" }}>{playlistName}</b>
              {isHighlighted && (
                <span
                  className="tag"
                  style={{
                    background: "#2563EB",
                    color: "#FFFFFF",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 4,
                  }}
                >
                  ✓ Изменено
                </span>
              )}
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
      {!isCollapsed && (
        <div className="list" style={{ margin: 0 }}>
          {items.map((mat, idx) => {
            const fmt = getFormatInfo(mat.type);
            const totalSources = 1 + (mat.sources?.length || 0);

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

                  {/* Title & description & Badges */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span>{mat.title}</span>

                      {/* Source & Attachment badges */}
                      {mat.sources && mat.sources.length > 0 && (
                        <span className="tag" style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', fontSize: 11, padding: '1px 6px' }}>
                          🎬 {totalSources} источника (VK/YouTube)
                        </span>
                      )}
                      {mat.synopsis && (
                        <span className="tag" style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', fontSize: 11, padding: '1px 6px' }}>
                          📝 Конспект
                        </span>
                      )}
                      {mat.audio_url && (
                        <span className="tag" style={{ background: '#FAF5FF', color: '#7E22CE', border: '1px solid #E9D5FF', fontSize: 11, padding: '1px 6px' }}>
                          🎧 Аудио
                        </span>
                      )}
                      {mat.attachments && mat.attachments.length > 0 && (
                        <span className="tag" style={{ background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A', fontSize: 11, padding: '1px 6px' }}>
                          📎 {mat.attachments.length} {mat.attachments.length === 1 ? 'док.' : 'док.'}
                        </span>
                      )}
                      {mat.no_report && (
                        <span className="tag" style={{ background: '#F3F4F6', color: '#4B5563', border: '1px solid #D1D5DB', fontSize: 11, padding: '1px 6px' }}>
                          Без отчёта
                        </span>
                      )}
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
                  {/* Full preview action */}
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => onPreviewLesson(mat)}
                    style={{ fontSize: 12, fontWeight: 600, color: "var(--navy)", display: "inline-flex", alignItems: "center", gap: 4 }}
                    title="Открыть урок со всеми источниками видео, аудио, конспектом и документами"
                  >
                    <span>👁️</span> Просмотр
                  </button>

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
function FlatMaterialRow({ material, onEdit, onDelete, onAttach, onPreviewNote, onPreviewLesson }) {
  const fmt = getFormatInfo(material.type);
  const totalSources = 1 + (material.sources?.length || 0);

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
          <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span>{material.title}</span>

            {material.sources && material.sources.length > 0 && (
              <span className="tag" style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', fontSize: 11, padding: '1px 6px' }}>
                🎬 {totalSources} источника
              </span>
            )}
            {material.synopsis && (
              <span className="tag" style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', fontSize: 11, padding: '1px 6px' }}>
                📝 Конспект
              </span>
            )}
            {material.audio_url && (
              <span className="tag" style={{ background: '#FAF5FF', color: '#7E22CE', border: '1px solid #E9D5FF', fontSize: 11, padding: '1px 6px' }}>
                🎧 Аудио
              </span>
            )}
            {material.attachments && material.attachments.length > 0 && (
              <span className="tag" style={{ background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A', fontSize: 11, padding: '1px 6px' }}>
                📎 {material.attachments.length} док.
              </span>
            )}
            {material.no_report && (
              <span className="tag" style={{ background: '#F3F4F6', color: '#4B5563', border: '1px solid #D1D5DB', fontSize: 11, padding: '1px 6px' }}>
                Без отчёта
              </span>
            )}
          </div>
          <div className="small muted">
            Плейлист: <b>{material.playlist_name}</b> · Порядок: #{material.order_index}
            {material.description && ` · ${material.description}`}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          className="btn ghost small"
          onClick={onPreviewLesson}
          style={{ fontWeight: 600, color: "var(--navy)" }}
          title="Открыть полный интерактивный просмотр урока"
        >
          👁️ Просмотр
        </button>
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
