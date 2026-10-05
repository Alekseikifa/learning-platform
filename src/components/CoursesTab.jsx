import { useEffect, useState } from "react";
import Collapsible from "./Collapsible";
import ChatPanel from "./ChatPanel";
import RepositoryPickerModal from "./RepositoryPickerModal";
import Modal from "./Modal";
import SmartMediaViewer from "./SmartMediaViewer";
import { api, uploadFile } from "../api";
import { getIcon } from "../lib/materialIcons";

export default function CoursesTab({ courses, groups = [], reload, apiPrefix = "/api/admin" }) {
  const [form, setForm] = useState({ title: "", description: "", order_index: courses.length + 1 });

  const add = async (e) => {
    e.preventDefault();
    try {
      await api(`${apiPrefix}/courses`, {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          order_index: Number(form.order_index) || (courses.length + 1),
        }),
      });
      setForm({ title: "", description: "", order_index: courses.length + 2 });
      reload();
    } catch (err) { alert(err.message); }
  };
  const del = async (id) => {
    if (!confirm("Удалить курс со всем содержимым?")) return;
    try {
      await api(`${apiPrefix}/courses/` + id, { method: "DELETE" });
      reload();
    } catch (e) { alert(e.message); }
  };

  const handleSetCourseOrder = async (courseId, newOrder) => {
    if (newOrder < 1) return;
    try {
      await api(`${apiPrefix}/courses/${courseId}`, {
        method: "PUT",
        body: JSON.stringify({ order_index: Number(newOrder) }),
      });
      reload();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <form className="card row" onSubmit={add} style={{ alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span className="small muted">№:</span>
          <input
            type="number"
            min="1"
            placeholder="№"
            value={form.order_index}
            onChange={e => setForm({ ...form, order_index: e.target.value })}
            style={{ width: 60 }}
            title="Порядковый номер курса"
          />
        </div>
        <input placeholder="Название курса" value={form.title}
               onChange={e => setForm({ ...form, title: e.target.value })} required style={{ flex: 1 }} />
        <input placeholder="Описание курса" value={form.description}
               onChange={e => setForm({ ...form, description: e.target.value })} style={{ flex: 2 }} />
        <button className="btn primary">Создать курс</button>
      </form>
      {courses.map(c => (
        <CourseCard
          key={c.id}
          course={c}
          courses={courses}
          groups={groups}
          reload={reload}
          onDelete={() => del(c.id)}
          onSetOrder={handleSetCourseOrder}
          apiPrefix={apiPrefix}
        />
      ))}
    </div>
  );
}

function CourseCard({ course, courses = [], groups = [], reload, onDelete, onSetOrder, apiPrefix = "/api/admin" }) {
  const [edit, setEdit] = useState(false);
  const [showImportThemeModal, setShowImportThemeModal] = useState(false);
  const [openThemes, setOpenThemes] = useState(false);
  const curOrder = course.order_index ?? course.id;
  const [form, setForm] = useState({
    title: course.title,
    description: course.description,
    order_index: curOrder,
  });

  const saveEdit = async () => {
    await api(`${apiPrefix}/courses/${course.id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        order_index: Number(form.order_index),
      }),
    });
    setEdit(false);
    reload();
  };

  return (
    <div className="card">
      <div className="spread" style={{ alignItems: "center" }}>
        {edit ? (
          <div className="row" style={{ flex: 1, gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span className="small muted">№:</span>
              <input
                type="number"
                min="1"
                value={form.order_index}
                onChange={e => setForm({ ...form, order_index: e.target.value })}
                style={{ width: 65 }}
              />
            </div>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                   placeholder="Название курса" style={{ flex: 1 }} />
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                   placeholder="Описание" style={{ flex: 2 }} />
            <button className="btn primary" onClick={saveEdit}>ОК</button>
            <button className="btn ghost" onClick={() => { setEdit(false); setForm({ title: course.title, description: course.description, order_index: curOrder }); }}>Отмена</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Order number badge with quick up/down arrows */}
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: "var(--navy)",
                    color: "#FFFFFF",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                  title="Порядковый номер курса"
                >
                  #{curOrder}
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => onSetOrder(course.id, curOrder - 1)}
                    style={{ padding: "0 4px", fontSize: 9, lineHeight: 1 }}
                    title="Поднять курс выше (уменьшить порядковый номер)"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => onSetOrder(course.id, curOrder + 1)}
                    style={{ padding: "0 4px", fontSize: 9, lineHeight: 1 }}
                    title="Опустить курс ниже (увеличить порядковый номер)"
                  >
                    ▼
                  </button>
                </div>
              </div>

              <div>
                <b style={{ fontSize: 16 }}>{course.title}</b>{" "}
                <span className="muted small">{course.description}</span>
              </div>
            </div>
            <div>
              <button className="btn small" onClick={() => setEdit(true)}>Изм.</button>{" "}
              <button className="btn danger small" onClick={onDelete}>Уд.</button>
            </div>
          </>
        )}
      </div>
      <Collapsible
        title="Темы курса"
        subtitle={`${course.themes?.length || 0}`}
        isOpen={openThemes}
        onToggle={setOpenThemes}
        actions={
          <button
            type="button"
            className="btn primary small"
            onClick={(e) => {
              e.stopPropagation();
              setOpenThemes(true);
              setShowImportThemeModal(true);
            }}
            style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <span>📥</span> Выбрать готовый плейлист из накопителя материалов
          </button>
        }
      >
        <ThemesList course={course} reload={reload} apiPrefix={apiPrefix} />
      </Collapsible>
      <Collapsible
        title="Дополнительные материалы курса"
        subtitle={`${course.extra_materials?.length || 0} (без тестов, с чатом)`}
        defaultOpen={false}
      >
        <ExtraMaterialsList course={course} courses={courses} groups={groups} reload={reload} apiPrefix={apiPrefix} />
      </Collapsible>

      <RepositoryPickerModal
        open={showImportThemeModal}
        onClose={() => setShowImportThemeModal(false)}
        mode="playlist"
        courseId={course.id}
        courseTitle={course.title}
        apiPrefix={apiPrefix}
        onSuccess={reload}
      />
    </div>
  );
}

function ExtraMaterialsList({ course, courses = [], groups = [], reload, apiPrefix = "/api/admin" }) {
  const [libraryMaterials, setLibraryMaterials] = useState([]);
  const [selectedLibId, setSelectedLibId] = useState("");
  const [isLinking, setIsLinking] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "video",
    url: "",
    order_index: (course.extra_materials?.length || 0) + 1,
    course_ids: [course.id],
    group_ids: [],
  });
  const [uploading, setUploading] = useState(false);
  const [chatMaterial, setChatMaterial] = useState(null);

  const loadLibrary = async () => {
    try {
      const all = await api(`${apiPrefix}/extra-materials`);
      setLibraryMaterials(all);
    } catch {}
  };

  useEffect(() => {
    loadLibrary();
  }, [course]);

  // Materials in the library not yet linked to this course
  const availableToLink = libraryMaterials.filter((m) => {
    const cids = m.course_ids || (m.course_id ? [m.course_id] : []);
    return !cids.includes(course.id);
  });

  const handleLinkExisting = async () => {
    if (!selectedLibId) return;
    setIsLinking(true);
    try {
      await api(`${apiPrefix}/courses/${course.id}/link-extra-material`, {
        method: "POST",
        body: JSON.stringify({ material_id: Number(selectedLibId) }),
      });
      setSelectedLibId("");
      reload();
      loadLibrary();
    } catch (err) {
      alert(err.message || "Ошибка привязки");
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async (id) => {
    if (!confirm("Отвязать этот материал от текущего курса? (Сам материал и привязки к другим курсам сохранятся)")) return;
    try {
      await api(`${apiPrefix}/courses/${course.id}/unlink-extra-material`, {
        method: "POST",
        body: JSON.stringify({ material_id: id }),
      });
      reload();
      loadLibrary();
    } catch (err) {
      alert(err.message || "Ошибка отвязки");
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadFile(file, `${apiPrefix}/uploads`);
      setForm((f) => ({ ...f, url: res.url }));
    } catch (err) {
      alert(err.message || "Ошибка загрузки файла");
    } finally {
      setUploading(false);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return alert("Введите название дополнительного материала");
    try {
      await api(`${apiPrefix}/courses/${course.id}/extra-materials`, {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          type: form.type,
          url: form.url.trim(),
          order_index: +form.order_index,
          course_ids: form.course_ids.length ? form.course_ids : [course.id],
          group_ids: form.group_ids,
        }),
      });
      setForm({
        title: "",
        description: "",
        type: "video",
        url: "",
        order_index: (course.extra_materials?.length || 0) + 2,
        course_ids: [course.id],
        group_ids: [],
      });
      reload();
      loadLibrary();
    } catch (err) {
      alert(err.message || "Ошибка добавления");
    }
  };

  const del = async (id) => {
    if (!confirm("Удалить дополнительный материал полностью (из всех курсов) и историю его чата?")) return;
    try {
      await api(`${apiPrefix}/extra-materials/${id}`, { method: "DELETE" });
      reload();
      loadLibrary();
    } catch (err) {
      alert(err.message);
    }
  };

  const upd = async (id, patch) => {
    try {
      await api(`${apiPrefix}/extra-materials/${id}`, { method: "PUT", body: JSON.stringify(patch) });
      reload();
      loadLibrary();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div className="muted small" style={{ marginBottom: 8 }}>
        Список дополнительных материалов курса. В них <b>нет тестов</b>, и к каждому материалу прикреплён <b>отдельный чат обсуждения</b>, где участвуют ученики группы, кураторы и администраторы.
      </div>

      {/* Select Box to attach existing extra material to this course */}
      <div
        className="card"
        style={{
          marginBottom: 12,
          padding: "10px 12px",
          background: "var(--bg-card-alt, #f0f4f8)",
          border: "1px solid var(--border)",
        }}
      >
        <b className="small" style={{ display: "block", marginBottom: 6 }}>
          📎 Привязать материал из библиотеки к этому курсу:
        </b>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <select
            value={selectedLibId}
            onChange={(e) => setSelectedLibId(e.target.value)}
            style={{ flex: 1 }}
          >
            <option value="">-- Выберите дополнительный материал из списка для привязки --</option>
            {availableToLink.map((m) => (
              <option key={m.id} value={m.id}>
                #{m.id} [{m.type}] {m.title}
                {m.courses && m.courses.length > 0 ? ` (привязан к: ${m.courses.map((c) => c.title).join(", ")})` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn primary small"
            disabled={!selectedLibId || isLinking}
            onClick={handleLinkExisting}
          >
            {isLinking ? "Привязка..." : "Привязать к курсу"}
          </button>
        </div>
        {!availableToLink.length && (
          <div className="muted small" style={{ marginTop: 4 }}>
            {libraryMaterials.length === 0
              ? "В библиотеке пока нет материалов. Вы можете создать новый материал ниже или во вкладке «Материалы»."
              : "Все созданные материалы уже привязаны к этому курсу."}
          </div>
        )}
      </div>

      {(course.extra_materials || []).map((em) => (
        <ExtraMaterialRow
          key={em.id}
          material={em}
          currentCourseId={course.id}
          onDelete={() => del(em.id)}
          onUnlink={() => handleUnlink(em.id)}
          onUpdate={upd}
          onOpenChat={() => setChatMaterial(em)}
        />
      ))}

      {(!course.extra_materials || course.extra_materials.length === 0) && (
        <div className="muted small" style={{ padding: "8px 0" }}>
          К этому курсу пока не привязаны дополнительные материалы.
        </div>
      )}

      <form className="card" onSubmit={add} style={{ marginTop: 12, background: "var(--bg-card-alt, #f9fafb)" }}>
        <b className="small">Создать и сразу привязать новый материал:</b>
        <div className="row" style={{ marginTop: 8, gap: 8 }}>
          <input
            placeholder="Название материала *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            style={{ flex: 2 }}
          />
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            style={{ width: 140 }}
          >
            <option value="video">🎬 Видео</option>
            <option value="document">📄 Документ</option>
            <option value="note">📝 Заметка / текст</option>
            <option value="audio">🎧 Аудио</option>
            <option value="image">🖼 Рисунок</option>
          </select>
          <input
            type="number"
            placeholder="Порядок"
            value={form.order_index}
            onChange={(e) => setForm({ ...form, order_index: e.target.value })}
            style={{ width: 80 }}
          />
        </div>

        <div className="row" style={{ marginTop: 8, gap: 8 }}>
          <input
            placeholder="Ссылка на материал (URL) или текст конспекта"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            style={{ flex: 1 }}
          />
          <label className="btn small ghost" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
            {uploading ? "Загрузка..." : "📎 Загрузить файл"}
            <input type="file" onChange={onFile} style={{ display: "none" }} disabled={uploading} />
          </label>
        </div>

        <div style={{ marginTop: 8 }}>
          <input
            placeholder="Краткое описание / пояснение к материалу (опционально)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={{ width: "100%" }}
          />
        </div>

        {/* Optional cross-course assignment */}
        {courses.length > 1 && (
          <div style={{ marginTop: 10 }}>
            <div className="small muted" style={{ marginBottom: 4 }}>
              Также прикрепить к другим курсам:
            </div>
            <div className="chips" style={{ margin: 0 }}>
              {courses.map((c) => (
                <label key={c.id} className="chip" style={{ cursor: "pointer", fontSize: 11 }}>
                  <input
                    type="checkbox"
                    checked={form.course_ids.includes(c.id)}
                    onChange={() =>
                      setForm((prev) => ({
                        ...prev,
                        course_ids: prev.course_ids.includes(c.id)
                          ? prev.course_ids.filter((id) => id !== c.id)
                          : [...prev.course_ids, c.id],
                      }))
                    }
                  />
                  {c.title}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="spread" style={{ marginTop: 10, alignItems: "center" }}>
          <span className="tag ok">Без тестов · С чатом обсуждения</span>
          <button className="btn primary">Создать и привязать</button>
        </div>
      </form>

      {chatMaterial && (
        <Modal onClose={() => setChatMaterial(null)} innerStyle={{ maxWidth: 640 }}>
            <div className="spread" style={{ alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <h3 style={{ margin: 0 }}>💬 Чат обсуждения материала</h3>
                <div className="muted small">
                  «{chatMaterial.title}» · Участвуют ученики группы, кураторы и администраторы
                </div>
              </div>
              <button className="btn ghost" onClick={() => setChatMaterial(null)} aria-label="Закрыть чат">✕</button>
            </div>
            <ChatPanel extraMaterialId={chatMaterial.id} apiBase="/api/staff" />
        </Modal>
      )}
    </div>
  );
}

function ExtraMaterialRow({ material, currentCourseId, onDelete, onUnlink, onUpdate, onOpenChat }) {
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(material.title);
  const [description, setDescription] = useState(material.description || "");
  const [type, setType] = useState(material.type || "note");
  const [url, setUrl] = useState(material.url || "");
  const [order, setOrder] = useState(material.order_index);

  const save = () => {
    onUpdate(material.id, {
      title,
      description,
      type,
      url,
      order_index: +order,
    });
    setEdit(false);
  };

  const otherCourses = (material.courses || []).filter((c) => c.id !== currentCourseId);

  return (
    <div className="card inner-card" style={{ marginBottom: 8 }}>
      {edit ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название" style={{ flex: 2 }} />
            <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 140 }}>
              <option value="video">🎬 Видео</option>
              <option value="document">📄 Документ</option>
              <option value="note">📝 Заметка / текст</option>
              <option value="audio">🎧 Аудио</option>
              <option value="image">🖼 Рисунок</option>
            </select>
            <input type="number" value={order} onChange={(e) => setOrder(e.target.value)} style={{ width: 70 }} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL / файл / текст" style={{ flex: 1 }} />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Описание" style={{ flex: 1 }} />
          </div>
          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button className="btn primary small" onClick={save}>Сохранить</button>
            <button className="btn ghost small" onClick={() => setEdit(false)}>Отмена</button>
          </div>
        </div>
      ) : (
        <div className="spread" style={{ alignItems: "center" }}>
          <div>
            <b>{order}. {getIcon(material.type)} {material.title}</b>{" "}
            <span className="tag ok" style={{ marginLeft: 6, fontSize: "0.75rem" }}>Без тестов</span>
            {otherCourses.length > 0 && (
              <span className="tag" style={{ marginLeft: 6, fontSize: "0.75rem" }}>
                Также в: {otherCourses.map((c) => c.title).join(", ")}
              </span>
            )}
            {material.description && (
              <div className="muted small" style={{ marginTop: 2 }}>{material.description}</div>
            )}
            {material.url && (
              <div className="small" style={{ marginTop: 2 }}>
                {material.url.startsWith("http") || material.url.startsWith("/uploads") || material.url.startsWith("/api/files") ? (
                  <a href={material.url} target="_blank" rel="noreferrer" className="muted">
                    🔗 {material.url}
                  </a>
                ) : (
                  <span className="muted">📝 {material.url.slice(0, 70)}{material.url.length > 70 ? "..." : ""}</span>
                )}
              </div>
            )}
          </div>
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <button className="btn small primary" onClick={onOpenChat}>
              💬 Чат
            </button>
            <button className="btn small" onClick={() => setEdit(true)}>Изм.</button>
            {onUnlink && (
              <button className="btn small ghost" onClick={onUnlink} title="Отвязать от этого курса">
                Отвязать
              </button>
            )}
            <button className="btn danger small" onClick={onDelete} title="Удалить полностью" aria-label="Удалить полностью">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThemesList({ course, reload, apiPrefix = "/api/admin" }) {
  const [form, setForm] = useState({ title: "", order_index: course.themes.length + 1 });

  const add = async (e) => {
    e.preventDefault();
    await api(`${apiPrefix}/themes`, {
      method: "POST",
      body: JSON.stringify({ course_id: course.id, title: form.title, order_index: +form.order_index }),
    });
    setForm({ title: "", order_index: course.themes.length + 2 });
    reload();
  };
  const del = async (id) => {
    if (!confirm("Удалить тему с материалами и тестом?")) return;
    await api(`${apiPrefix}/themes/` + id, { method: "DELETE" });
    reload();
  };
  const upd = async (id, patch) => {
    await api(`${apiPrefix}/themes/` + id, { method: "PUT", body: JSON.stringify(patch) });
    reload();
  };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {course.themes.map(t => (
          <ThemeRow
            key={t.id}
            theme={t}
            course={course}
            onDelete={() => del(t.id)}
            onUpdate={upd}
            reload={reload}
            apiPrefix={apiPrefix}
          />
        ))}
      </div>

      <form className="row" onSubmit={add} style={{ marginTop: 10, gap: 8 }}>
        <input placeholder="Либо создать новую тему вручную..." value={form.title}
               onChange={e => setForm({ ...form, title: e.target.value })} required style={{ flex: 1 }} />
        <input type="number" placeholder="Порядок" value={form.order_index}
               onChange={e => setForm({ ...form, order_index: e.target.value })} style={{ width: 85 }} />
        <button className="btn ghost">➕ Создать тему</button>
      </form>
    </div>
  );
}

function ThemeRow({ theme, course, onDelete, onUpdate, reload, apiPrefix = "/api/admin" }) {
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(theme.title);
  const [order, setOrder] = useState(theme.order_index);
  const [expanded, setExpanded] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [loadingMats, setLoadingMats] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [noteFor, setNoteFor] = useState(null);
  const [previewMaterial, setPreviewMaterial] = useState(null);

  const loadMats = async () => {
    setLoadingMats(true);
    try {
      const data = await api(`${apiPrefix}/themes/${theme.id}/materials`);
      setMaterials(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMats(false);
    }
  };

  useEffect(() => {
    if (expanded) loadMats();
  }, [expanded, theme.id]);

  const delMat = async (matId) => {
    if (!confirm("Удалить этот урок из темы курса?")) return;
    await api(`${apiPrefix}/materials/${matId}`, { method: "DELETE" });
    loadMats();
    reload();
  };

  return (
    <div className="card inner-card" style={{ padding: "10px 14px", margin: 0, border: "1px solid var(--border)" }}>
      <div className="spread" style={{ alignItems: "center" }}>
        {edit ? (
          <div className="row" style={{ flex: 1, gap: 8 }}>
            <input value={title} onChange={e => setTitle(e.target.value)} style={{ flex: 1 }} />
            <input type="number" value={order} onChange={e => setOrder(e.target.value)} style={{ width: 80 }} />
            <button className="btn primary small" onClick={() => { onUpdate(theme.id, { title, order_index: +order }); setEdit(false); }}>ОК</button>
            <button className="btn ghost small" onClick={() => setEdit(false)}>Отмена</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setExpanded(!expanded)}
                style={{ padding: "2px 8px", fontSize: 12 }}
                title={expanded ? "Свернуть уроки" : "Развернуть уроки"}
              >
                {expanded ? "▼" : "▶"}
              </button>
              <b style={{ fontSize: 15, color: "var(--navy)" }}>
                Тема {theme.order_index}. {theme.title}
              </b>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setShowPicker(true)}
                style={{ fontSize: 12, color: "var(--navy)", fontWeight: 600 }}
              >
                📎 Прикрепить урок из накопителя
              </button>
              <button className="btn small" onClick={() => setEdit(true)}>Изм.</button>{" "}
              <button className="btn danger small" onClick={onDelete} aria-label="Удалить">✕</button>
            </div>
          </>
        )}
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          {loadingMats ? (
            <div className="small muted">Загрузка уроков темы...</div>
          ) : materials.length === 0 ? (
            <div className="small muted spread" style={{ alignItems: "center" }}>
              <span>В этой теме пока нет прикрепленных уроков.</span>
              <button
                type="button"
                className="btn primary small"
                onClick={() => setShowPicker(true)}
                style={{ fontSize: 12 }}
              >
                📎 Прикрепить урок из накопителя
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="spread" style={{ alignItems: "center", marginBottom: 4 }}>
                <span className="small muted">Уроки темы ({materials.length}):</span>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => setShowPicker(true)}
                  style={{ fontSize: 12, color: "var(--navy)", fontWeight: 600 }}
                >
                  ➕ Прикрепить ещё урок
                </button>
              </div>

              {materials.map((m, idx) => (
                <div
                  key={m.id}
                  className="spread"
                  style={{
                    padding: "6px 10px",
                    background: "var(--bg)",
                    borderRadius: 6,
                    alignItems: "center",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: "var(--navy)" }}>
                      #{m.order_index || idx + 1}
                    </span>
                    <span className="tag" style={{ fontSize: 11, padding: "2px 6px" }}>
                      {m.type === "video" ? "🎬 Видео" : m.type === "note" ? "📝 Конспект" : m.type === "document" ? "📄 Документ" : m.type === "audio" ? "🎧 Аудио" : m.type === "image" ? "🖼 Рисунок" : "📎 Файл"}
                    </span>
                    <b style={{ fontSize: 13 }}>{m.title}</b>
                    {m.sources && m.sources.length > 0 && (
                      <span className="tag" style={{ fontSize: 10, background: "#e0e7ff", color: "#3730a3", padding: "1px 6px" }}>
                        ▶ Источники ({m.sources.length}): {m.sources.map(s => s.platform === "vk" ? "VK" : s.platform === "youtube" ? "YouTube" : s.platform === "rutube" ? "RuTube" : "Файл").join(", ")}
                      </span>
                    )}
                    {m.synopsis && (
                      <span className="tag" style={{ fontSize: 10, background: "#f3e8ff", color: "#6b21a8", padding: "1px 6px" }}>
                        📝 Конспект
                      </span>
                    )}
                    {m.audio_url && (
                      <span className="tag" style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 6px" }}>
                        🎧 Аудио
                      </span>
                    )}
                    {m.attachments && m.attachments.length > 0 && (
                      <span className="tag" style={{ fontSize: 10, background: "#ecfdf5", color: "#065f46", padding: "1px 6px" }}>
                        📎 Файлы ({m.attachments.length})
                      </span>
                    )}
                    {m.no_report && (
                      <span className="tag" style={{ fontSize: 10, background: "#f3f4f6", color: "#4b5563", padding: "1px 6px" }}>
                        Без отчёта
                      </span>
                    )}
                    {m.description && <span className="small muted">· {m.description}</span>}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      type="button"
                      className="btn ghost small"
                      style={{ fontSize: 11, padding: "2px 8px", color: "var(--navy)", fontWeight: 600, border: "1px solid var(--border)" }}
                      onClick={() => setPreviewMaterial(m)}
                      title="Предпросмотр урока в интерактивном плеере с переключением источников (ВКонтакте/YouTube), аудио и документами"
                    >
                      👁 Просмотр
                    </button>
                    {m.url && (
                      m.type === "note" ? (
                        <button
                          type="button"
                          className="btn ghost small"
                          style={{ fontSize: 11, padding: "2px 6px" }}
                          onClick={() => setNoteFor(m)}
                        >
                          📖 Читать
                        </button>
                      ) : m.url.startsWith("http") || m.url.startsWith("/uploads") || m.url.startsWith("/api/files") ? (
                        <a href={m.url} target="_blank" rel="noreferrer" className="btn ghost small" style={{ fontSize: 11, textDecoration: "none", padding: "2px 6px" }}>
                          ↗ Открыть
                        </a>
                      ) : (
                        <span className="muted small" style={{ fontSize: 11 }} title={m.url}>
                          📝 {m.url.slice(0, 60)}{m.url.length > 60 ? "…" : ""}
                        </span>
                      )
                    )}
                    <button
                      type="button"
                      className="btn danger small"
                      onClick={() => delMat(m.id)}
                      style={{ padding: "2px 6px", fontSize: 11 }}
                      title="Удалить из темы курса"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {course && (
        <RepositoryPickerModal
          open={showPicker}
          onClose={() => setShowPicker(false)}
          mode="material"
          courseId={course.id}
          courseTitle={course.title}
          themeId={theme.id}
          themeTitle={theme.title}
          apiPrefix={apiPrefix}
          onSuccess={() => {
            loadMats();
            reload();
          }}
        />
      )}

      {noteFor && (
        <Modal onClose={() => setNoteFor(null)} innerStyle={{ maxWidth: 640 }}>
          <h3>📝 {noteFor.title}</h3>
          {noteFor.description && <div className="muted small">{noteFor.description}</div>}
          <div
            style={{
              whiteSpace: "pre-wrap",
              background: "var(--bg)",
              padding: 14,
              borderRadius: 8,
              fontSize: 14,
              lineHeight: 1.6,
              maxHeight: 400,
              overflowY: "auto",
              marginTop: 10,
            }}
          >
            {noteFor.url}
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn ghost" onClick={() => setNoteFor(null)} aria-label="Закрыть">Закрыть</button>
          </div>
        </Modal>
      )}

      {previewMaterial && (
        <Modal onClose={() => setPreviewMaterial(null)} innerStyle={{ maxWidth: 880, padding: 20 }}>
          <div className="spread" style={{ alignItems: "center", marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
            <div>
              <div className="small muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
                Предпросмотр урока (вид ученика)
              </div>
              <h3 style={{ margin: "2px 0 0", fontSize: 18, color: "var(--navy)" }}>
                {previewMaterial.title}
              </h3>
            </div>
            <button className="btn ghost" onClick={() => setPreviewMaterial(null)} aria-label="Закрыть">✕</button>
          </div>
          <SmartMediaViewer
            url={previewMaterial.url}
            title={previewMaterial.title}
            sources={previewMaterial.sources}
            synopsis={previewMaterial.synopsis}
            audio_url={previewMaterial.audio_url}
            attachments={previewMaterial.attachments}
            materialType={previewMaterial.type}
          />
        </Modal>
      )}
    </div>
  );
}

