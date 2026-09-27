import React, { useState, useEffect } from "react";
import { api } from "../api";

const ROLE_LABELS = { student: "Ученик", teacher: "Куратор", manager: "Методист" };
const roleLabel = (r) => ROLE_LABELS[r] || r;

export default function InvitesTab({ allowManagerRole = true }) {
  const [list, setList] = useState([]);
  const [loadErr, setLoadErr] = useState(null);
  const [form, setForm] = useState({ phone: "", role: "student", note: "" });
  const [extra, setExtra] = useState([]);
  const [groupIds, setGroupIds] = useState([]);
  const [curatorGroupIds, setCuratorGroupIds] = useState([]);
  const [allGroups, setAllGroups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const roleOptions = allowManagerRole
    ? ["student", "teacher", "manager"]
    : ["student", "teacher"];

  const load = () =>
    api("/api/admin/invites")
      .then(setList)
      .catch((e) => setLoadErr(e.message))
      .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    api("/api/staff/groups").then(setAllGroups).catch(() => setAllGroups([]));
  }, []);

  const activeRoles = [form.role, ...extra];
  const showStudentGroups = activeRoles.includes("student");
  const showCuratorGroups = activeRoles.includes("teacher");

  const toggleExtra = (r) => {
    setExtra(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  };
  const toggleGroup = (setter) => (id) => {
    setter(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const resetForm = () => {
    setForm({ phone: "", role: "student", note: "" });
    setExtra([]);
    setGroupIds([]);
    setCuratorGroupIds([]);
  };

  const add = async (e) => {
    e.preventDefault();
    if (!form.phone.trim()) return alert("Введите номер телефона");
    setBusy(true);
    try {
      const role = allowManagerRole || form.role !== "manager" ? form.role : "student";
      await api("/api/admin/invites", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          role,
          extra_roles: extra.filter(r => r !== role).join(","),
          group_ids: activeRoles.includes("student") ? groupIds : [],
          curator_group_ids: activeRoles.includes("teacher") ? curatorGroupIds : [],
        }),
      });
      resetForm();
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

  const groupNames = (ids) =>
    (ids || []).map(id => {
      const g = allGroups.find(x => x.id === id);
      return g ? `${g.course_title} · ${g.name}` : `#${id}`;
    });

  const groupChips = (selected, setter) => (
    <div className="chips">
      {!allGroups.length && <span className="muted small">Групп пока нет</span>}
      {allGroups.map(g => (
        <label key={g.id} className="chip" style={{ cursor: "pointer" }}>
          <input type="checkbox"
                 checked={selected.includes(g.id)}
                 onChange={() => toggleGroup(setter)(g.id)} />
          {g.course_title} · {g.name}
        </label>
      ))}
    </div>
  );

  return (
    <div>
      <div className="card">
        <h3>Приглашения по номеру телефона</h3>
        <div className="muted small">
          Внесите номер телефона, роли и группы. После этого человек сможет зарегистрироваться сам
          на странице «Регистрация» — указанные роли и группы установятся автоматически.
        </div>
        <form onSubmit={add} style={{ marginTop: 12 }}>
          <div className="row">
            <input placeholder="Номер телефона (например, +79261234567)"
                   value={form.phone}
                   onChange={e => setForm({ ...form, phone: e.target.value })}
                   style={{ flex: 1 }} />
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="student">Ученик</option>
              <option value="teacher">Куратор</option>
              {allowManagerRole && <option value="manager">Методист</option>}
            </select>
            <input placeholder="Комментарий (кто это)"
                   value={form.note}
                   onChange={e => setForm({ ...form, note: e.target.value })}
                   style={{ flex: 1 }} />
            <button className="btn primary" disabled={busy}>
              {busy ? "..." : "Добавить приглашение"}
            </button>
          </div>

          <div className="section-title">Дополнительные роли</div>
          <div className="muted small" style={{ marginBottom: 6 }}>
            Можно привязать несколько ролей сразу — при входе пользователь сможет переключаться между ними.
          </div>
          <div className="chips">
            {roleOptions.map(r => (
              <label key={r} className="chip" style={{ cursor: "pointer" }}>
                <input type="checkbox"
                       checked={extra.includes(r)}
                       onChange={() => toggleExtra(r)} />
                {roleLabel(r)}
              </label>
            ))}
          </div>

          {showStudentGroups && (
            <>
              <div className="section-title">Группы (ученик)</div>
              <div className="muted small" style={{ marginBottom: 6 }}>
                Отметьте группы, в которые пользователь попадёт при регистрации как ученик.
              </div>
              {groupChips(groupIds, setGroupIds)}
            </>
          )}

          {showCuratorGroups && (
            <>
              <div className="section-title">Группы (куратор)</div>
              <div className="muted small" style={{ marginBottom: 6 }}>
                Отметьте группы, в которых пользователь станет куратором при регистрации.
              </div>
              {groupChips(curatorGroupIds, setCuratorGroupIds)}
            </>
          )}
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
              <th>Группы</th>
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
                    `${inv.phone} ${roleLabel(inv.role)} ${inv.extra_roles || ""} ${inv.note || ""}`
                      .toLowerCase().includes(needle))
                : list;
              if (!rows.length) {
                return (
                  <tr>
                    <td colSpan={6} className="muted">
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
              return rows.map(inv => {
                const studentGroups = groupNames(inv.group_ids);
                const curatorGroups = groupNames(inv.curator_group_ids);
                return (
                <tr key={inv.id}>
                  <td><b>{inv.phone}</b></td>
                  <td>
                    {roleLabel(inv.role)}
                    {inv.extra_roles && (
                      <span className="muted small">
                        {" "}+ {inv.extra_roles.split(",").map(r => roleLabel(r.trim())).filter(Boolean).join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="small">
                    {studentGroups.length > 0 && (
                      <div>Ученик: {studentGroups.join(", ")}</div>
                    )}
                    {curatorGroups.length > 0 && (
                      <div>Куратор: {curatorGroups.join(", ")}</div>
                    )}
                    {!studentGroups.length && !curatorGroups.length && <span className="muted">—</span>}
                  </td>
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
                );
              });
            })()}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
