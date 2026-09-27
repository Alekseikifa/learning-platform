import { useEffect, useState } from "react";
import { api, uploadFile } from "../api";

export default function UploadsTab({ apiPrefix = "/api/admin", showMimetype = false }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState(null);
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

  return (
    <div>
      <div className="card row">
        <label className="btn">
          {busy ? "Загрузка..." : "Загрузить файл"}
          <input type="file" hidden onChange={onUpload} />
        </label>
      </div>
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
              <td>{f.original_name}</td>
              {showMimetype && <td>{f.mimetype}</td>}
              <td>{Math.round((f.size || 0) / 1024)} КБ</td>
              <td><a href={"/uploads/" + f.filename} target="_blank" rel="noreferrer">открыть</a></td>
              <td><button className="btn danger small" onClick={() => del(f.id)}>Удалить</button></td>
            </tr>
          ))}
          {!files.length && !loadErr && (
            <tr><td colSpan={showMimetype ? 5 : 4} className="muted">Файлов пока нет</td></tr>
          )}
        </tbody>
      </table></div>
    </div>
  );
}
