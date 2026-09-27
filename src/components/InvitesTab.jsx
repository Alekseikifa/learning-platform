import React, { useState, useEffect } from "react";
import { api } from "../api";

export default function InvitesTab() {
  const [list, setList] = useState([]);
  const [loadErr, setLoadErr] = useState(null);
  const [form, setForm] = useState({ phone: "", role: "student", note: "" });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () =>
    api("/api/admin/invites")
      .then(setList)
      .catch((e) => setLoadErr(e.message))
      .finally(() => setLoading(false));
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
    try {
      await api("/api/admin/invites/" + id, { method: "DELETE" });
      load();
    } catch (e) { alert(e.message); }
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
        {loadErr && (
          <div style={{ color: "#dc2626" }}>Не удалось загрузить приглашения: {loadErr}</div>
        )}
        <div className="row" style={{ alignItems: "center", gap: 8, marginBottom: 8 }}>
          <label>Поиск:</label>
          <input placeholder="Телефон, роль или комментарий…" value={q}
                 onChange={e => setQ(e.target.value)} style={{ flex: 1 }} />
        </div>
        <div className="table-wrap"><table className="table">
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
            {(() => {
              const needle = q.trim().toLowerCase();
              const rows = needle
                ? list.filter(inv =>
                    `${inv.phone} ${roleLabel(inv.role)} ${inv.note || ""}`.toLowerCase().includes(needle))
                : list;
              if (!rows.length) {
                return (
                  <tr>
                    <td colSpan={5} className="muted">
                      {loading
                        ? "Загрузка приглашений…"
                        : loadErr
                          ? "Список не загрузился — попробуйте обновить страницу"
                          : needle
                            ? "Ничего не найдено по запросу «" + q + "»"
                            : "Приглашений пока нет. Добавьте первое выше."}
                    </td>
                  </tr>
                );
              }
              return rows.map(inv => (
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
              ));
            })()}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}