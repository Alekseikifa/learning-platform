import React, { useState, useEffect } from "react";
import { api } from "../api";

export default function InvitesTab() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ phone: "", role: "student", note: "" });
  const [busy, setBusy] = useState(false);

  const load = () => api("/api/admin/invites").then(setList);
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!form.phone.trim()) return alert("Введите номер телефона");
    setBusy(true);
    try {
      await api("/api/admin/invites", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ phone: "", role: "student", note: "" });
      load();
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  const del = async (id) => {
    if (!confirm("Удалить приглашение?")) return;
    await api("/api/admin/invites/" + id, { method: "DELETE" });
    load();
  };

  const roleLabel = (r) =>
    r === "manager" ? "Методист"
    : r === "teacher" ? "Куратор"
    : "Ученик";

  return (
    <div>
      <div className="card">
        <h3>Приглашения по номеру телефона</h3>
        <div className="muted small">
          Внесите номер телефона и предполагаемую роль. После этого человек сможет
          зарегистрироваться сам на странице «Регистрация», указав ФИО, телефон и пароль.
        </div>
        <form className="row" onSubmit={add} style={{ marginTop: 12 }}>
          <input placeholder="Номер телефона (например, +79261234567)"
                 value={form.phone}
                 onChange={e => setForm({ ...form, phone: e.target.value })}
                 style={{ flex: 1 }} />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="student">Ученик</option>
            <option value="teacher">Куратор</option>
            <option value="manager">Методист</option>
          </select>
          <input placeholder="Комментарий (кто это)"
                 value={form.note}
                 onChange={e => setForm({ ...form, note: e.target.value })}
                 style={{ flex: 1 }} />
          <button className="btn primary" disabled={busy}>
            {busy ? "..." : "Добавить приглашение"}
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Ожидают регистрации ({list.length})</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Телефон</th>
              <th>Роль</th>
              <th>Комментарий</th>
              <th>Добавлено</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map(inv => (
              <tr key={inv.id}>
                <td><b>{inv.phone}</b></td>
                <td>{roleLabel(inv.role)}</td>
                <td className="muted small">{inv.note || "—"}</td>
                <td className="muted small">
                  {new Date(inv.created_at).toLocaleString("ru-RU")}
                </td>
                <td>
                  <button className="btn danger small" onClick={() => del(inv.id)}>
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={5} className="muted">
                  Приглашений пока нет. Добавьте первое выше.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}