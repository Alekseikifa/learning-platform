import { useEffect, useState } from "react";
import { api } from "../api";

export default function AnnouncementsPanel() {
  const [groups, setGroups] = useState([]);
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: "", body: "", group_ids: [] });
  const [busy, setBusy] = useState(false);

  const loadGroups = () => api("/api/staff/groups").then(setGroups);
  const loadList = () => api("/api/staff/announcements").then(setList);

  useEffect(() => { loadGroups(); loadList(); }, []);

  const toggleGroup = (gid) => {
    setForm(f => ({
      ...f,
      group_ids: f.group_ids.includes(gid)
        ? f.group_ids.filter(x => x !== gid)
        : [...f.group_ids, gid],
    }));
  };

  const selectAll = () => setForm(f => ({ ...f, group_ids: groups.map(g => g.id) }));
  const clearAll = () => setForm(f => ({ ...f, group_ids: [] }));

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) return alert("Заполните заголовок и текст");
    if (!form.group_ids.length) return alert("Выберите хотя бы одну группу");
    setBusy(true);
    try {
      if (editing) {
        await api(`/api/staff/announcements/${editing}`, {
          method: "PUT", body: JSON.stringify(form),
        });
      } else {
        await api("/api/staff/announcements", {
          method: "POST", body: JSON.stringify(form),
        });
      }
      setForm({ title: "", body: "", group_ids: [] });
      setEditing(null);
      loadList();
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  const startEdit = (a) => {
    setEditing(a.id);
    setForm({ title: a.title, body: a.body, group_ids: a.group_ids });
  };
  const del = async (id) => {
    if (!confirm("Удалить объявление?")) return;
    await api("/api/staff/announcements/" + id, { method: "DELETE" });
    loadList();
  };
  const reset = () => {
    setEditing(null);
    setForm({ title: "", body: "", group_ids: [] });
  };

  return (
    <div>
      <div className="card">
        <h3>{editing ? "Редактирование объявления" : "Новое объявление"}</h3>
        <div className="muted small">
          Отправьте всем группам или выберите нужные. Все ученики выбранных групп получат уведомление.
        </div>
        <input placeholder="Заголовок" value={form.title}
               onChange={e => setForm({ ...form, title: e.target.value })}
               style={{ width: "100%", marginTop: 8 }} />
        <textarea placeholder="Текст объявления" rows={4} value={form.body}
                  onChange={e => setForm({ ...form, body: e.target.value })}
                  style={{ width: "100%", marginTop: 6 }} />

        <div className="section-title">Кому отправить</div>
        <div className="row" style={{ marginBottom: 6 }}>
          <button className="btn small" onClick={selectAll}>Выбрать все</button>
          <button className="btn small" onClick={clearAll}>Снять все</button>
          <span className="muted small">
            Выбрано: {form.group_ids.length} из {groups.length}
          </span>
        </div>
        <div className="chips">
          {groups.map(g => (
            <label key={g.id} className="chip" style={{ cursor: "pointer" }}>
              <input type="checkbox"
                     checked={form.group_ids.includes(g.id)}
                     onChange={() => toggleGroup(g.id)} />
              {g.course_title} — {g.name}
            </label>
          ))}
          {!groups.length && <span className="muted small">Групп пока нет</span>}
        </div>

        <div className="row" style={{ marginTop: 10, justifyContent: "flex-end" }}>
          {editing && <button className="btn ghost" onClick={reset}>Отмена</button>}
          <button className="btn primary" disabled={busy} onClick={save}>
            {busy ? "..." : editing ? "Сохранить" : "Опубликовать"}
          </button>
        </div>
      </div>

      <div className="list">
        {list.map(a => (
          <div className="card" key={a.id}>
            <div className="spread">
              <b>{a.title}</b>
              <div>
                <button className="btn small" onClick={() => startEdit(a)}>Изм.</button>{" "}
                <button className="btn danger small" onClick={() => del(a.id)}>Уд.</button>
              </div>
            </div>
            <div className="muted small">
              {a.author} · {new Date(a.created_at).toLocaleString("ru-RU")}
              {a.updated_at !== a.created_at && " · изменено"}
            </div>
            <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{a.body}</div>
            <div className="chips" style={{ marginTop: 6 }}>
              {a.groups.map(g => (
                <span key={g.id} className="tag">{g.course} — {g.name}</span>
              ))}
            </div>
          </div>
        ))}
        {!list.length && <div className="card muted">Объявлений пока нет</div>}
      </div>
    </div>
  );
}
