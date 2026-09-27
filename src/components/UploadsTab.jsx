import { useEffect, useState } from "react";
import { api, uploadFile } from "../api";
import Modal from "./Modal";

const fileUrl = (f) => {
  const dot = (f.filename || "").lastIndexOf(".");
  const ext = dot > 0 ? f.filename.slice(dot) : "";
  return "/api/files/" + f.id + ext;
};

const typeFromMime = (mime) => {
  if (!mime) return "document";
  if (mime.startsWith("video")) return "video";
  if (mime.startsWith("audio")) return "audio";
  if (mime.startsWith("image")) return "image";
  return "document";
};

const baseName = (name) => (name || "").replace(/\.[^.]+$/, "");

export default function UploadsTab({ apiPrefix = "/api/admin", showMimetype = false }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState(null);
  const [msg, setMsg] = useState(null);

  // переименование
  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  // добавление в плейлист
  const [attachFile, setAttachFile] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [attachPlaylist, setAttachPlaylist] = useState("__new__");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [attachTitle, setAttachTitle] = useState("");
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachErr, setAttachErr] = useState(null);

  const load = () =>
    api(apiPrefix + "/uploads")
      .then(setFiles)
      .catch((e) => setLoadErr(e.message));
  useEffect(() => { load(); }, []);

  const onUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setBusy(true);
    try { await uploadFile(file, apiPrefix + "/uploads"); await load(); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); e.target.value = ""; }
  };

  const del = async (id) => {
    if (!confirm("Удалить файл?")) return;
    try {
      await api(apiPrefix + "/uploads/" + id, { method: "DELETE" });
      load();
    } catch (e) { alert(e.message); }
  };

  const startRename = (f) => {
    setRenameId(f.id);
    setRenameValue(f.original_name);
    setAttachFile(null);
  };

  const saveRename = async () => {
    if (!renameValue.trim()) return;
    setRenameBusy(true);
    try {
      await api(apiPrefix + "/uploads/" + renameId, {
        method: "PUT",
        body: JSON.stringify({ original_name: renameValue }),
      });
      setRenameId(null);
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setRenameBusy(false);
    }
  };

  const openAttach = async (f) => {
    setAttachErr(null);
    setAttachFile(f);
    setAttachTitle(baseName(f.original_name));
    setNewPlaylistName("");
    setAttachPlaylist("__new__");
    try {
      const pl = await api(apiPrefix + "/repository/playlists");
      setPlaylists(pl || []);
      if (pl?.length) setAttachPlaylist(pl[0].playlist_name);
    } catch (e) {
      setPlaylists([]);
      setAttachErr("Не удалось загрузить плейлисты: " + e.message);
    }
  };

  const saveAttach = async () => {
    const playlist = attachPlaylist === "__new__" ? newPlaylistName.trim() : attachPlaylist;
    if (!playlist) return setAttachErr("Укажите название нового плейлиста");
    if (!attachTitle.trim()) return setAttachErr("Введите название материала");
    setAttachBusy(true);
    setAttachErr(null);
    try {
      await api(apiPrefix + "/repository/materials", {
        method: "POST",
        body: JSON.stringify({
          file_id: attachFile.id,
          title: attachTitle.trim(),
          playlist_name: playlist,
          type: typeFromMime(attachFile.mimetype),
        }),
      });
      setAttachFile(null);
      setMsg(`Материал «${attachTitle.trim()}» добавлен в плейлист «${playlist}»`);
      setTimeout(() => setMsg(null), 5000);
    } catch (e) {
      setAttachErr(e.message);
    } finally {
      setAttachBusy(false);
    }
  };

  const cols = showMimetype ? 6 : 5;

  return (
    <div>
      <div className="card row">
        <label className="btn">
          {busy ? "Загрузка..." : "Загрузить файл"}
          <input type="file" hidden onChange={onUpload} />
        </label>
      </div>
      {msg && <div className="card" style={{ color: "#16a34a" }}>{msg}</div>}
      {loadErr && (
        <div className="card" style={{ color: "#dc2626" }}>
          Не удалось загрузить файлы: {loadErr}
        </div>
      )}
      <div className="table-wrap"><table className="table">
        <thead>
          <tr>
            <th>Файл</th>
            {showMimetype && <th>Тип</th>}
            <th>Размер</th>
            <th>URL</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {files.map(f => (
            <tr key={f.id}>
              <td>
                {renameId === f.id ? (
                  <span className="row" style={{ gap: 6 }}>
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename();
                        if (e.key === "Escape") setRenameId(null);
                      }}
                      autoFocus
                      style={{ minWidth: 220 }}
                    />
                    <button className="btn small" onClick={saveRename} disabled={renameBusy}>
                      {renameBusy ? "..." : "Сохранить"}
                    </button>
                    <button className="btn ghost small" onClick={() => setRenameId(null)}>✕</button>
                  </span>
                ) : (
                  <span className="row" style={{ gap: 6 }}>
                    <span>{f.original_name}</span>
                    <button
                      className="btn ghost small"
                      title="Переименовать"
                      onClick={() => startRename(f)}
                    >✏️</button>
                  </span>
                )}
              </td>
              {showMimetype && <td>{f.mimetype}</td>}
              <td>{Math.round((f.size || 0) / 1024)} КБ</td>
              <td>
                <a href={fileUrl(f)} target="_blank" rel="noreferrer">открыть</a>
                {" · "}
                <a href={fileUrl(f) + "?download=1"}>скачать</a>
              </td>
              <td>
                <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                  <button className="btn small" onClick={() => openAttach(f)}>В плейлист</button>
                  <button className="btn danger small" onClick={() => del(f.id)}>Удалить</button>
                </span>
              </td>
            </tr>
          ))}
          {!files.length && !loadErr && (
            <tr><td colSpan={cols} className="muted">Файлов пока нет</td></tr>
          )}
        </tbody>
      </table></div>

      {attachFile && (
        <Modal
          onClose={() => !attachBusy && setAttachFile(null)}
          dismissible={!attachBusy}
          backdropClassName="modal-overlay"
          backdropStyle={overlayStyle}
          innerClassName="card modal-content"
          innerStyle={modalContentStyle}
        >
          <div className="spread" style={{ alignItems: "center", marginBottom: 14, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
            <h3 style={{ margin: 0 }}>📥 Добавить файл в плейлист</h3>
            <button type="button" className="btn ghost small" onClick={() => setAttachFile(null)} disabled={attachBusy}>✕</button>
          </div>

          <div className="small muted" style={{ marginBottom: 12 }}>
            Файл: <b>{attachFile.original_name}</b>
          </div>

          <label className="small" style={{ display: "block", marginBottom: 8 }}>
            Плейлист
            <select
              value={attachPlaylist}
              onChange={(e) => setAttachPlaylist(e.target.value)}
              style={{ width: "100%", marginTop: 4 }}
            >
              {playlists.map((pl) => (
                <option key={pl.playlist_name} value={pl.playlist_name}>
                  {pl.playlist_name} ({pl.count})
                </option>
              ))}
              <option value="__new__">＋ Новый плейлист</option>
            </select>
          </label>

          {attachPlaylist === "__new__" && (
            <label className="small" style={{ display: "block", marginBottom: 8 }}>
              Название нового плейлиста
              <input
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Например: Конспекты"
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
          )}

          <label className="small" style={{ display: "block", marginBottom: 8 }}>
            Название материала
            <input
              value={attachTitle}
              onChange={(e) => setAttachTitle(e.target.value)}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>

          {attachErr && <div style={{ color: "#dc2626", marginBottom: 8 }}>{attachErr}</div>}

          <div className="spread" style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
            <button type="button" className="btn ghost" onClick={() => setAttachFile(null)} disabled={attachBusy}>
              Отмена
            </button>
            <button type="button" className="btn primary" onClick={saveAttach} disabled={attachBusy}>
              {attachBusy ? "Добавление..." : "📥 Добавить"}
            </button>
          </div>
        </Modal>
      )}
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
  maxWidth: 520,
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
  padding: 20,
};
