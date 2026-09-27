import { useEffect, useState } from "react";
import Modal from "./Modal";
import { api } from "../api";

const ROLE_LABELS = { student: "Ученик", teacher: "Куратор", manager: "Методист" };

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const labelStyle = { marginTop: 12, display: "block" };

/**
 * Общая модалка редактирования пользователя для админской и методистской панелей.
 * variant: "admin" | "manager"
 */
export default function UserEditModal({ user, variant = "admin", onClose, onSaved }) {
  const isTargetAdmin = user.role === "admin";
  const isTargetManager = user.role === "manager";
  // методист не может редактировать методиста — кроме ФИО, логина и доступа
  const locked = variant === "manager" && isTargetManager;
  const isAdminVariant = variant === "admin";
  const groupsEditable = isAdminVariant ? !isTargetAdmin : !locked;

  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState(user.phone || "");
  const [role, setRole] = useState(user.role);
  const [extra, setExtra] = useState(
    (user.extra_roles || "").split(",")
      .map(s => s.trim())
      .filter(r => r && (isAdminVariant || r !== "manager"))
  );
  const [active, setActive] = useState(user.is_active !== false);
  const [studentGroupIds, setStudentGroupIds] = useState((user.groups || []).map(g => g.id));
  const [curatorGroupIds, setCuratorGroupIds] = useState((user.teacher_groups || []).map(g => g.id));
  const [allGroups, setAllGroups] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api("/api/staff/groups")
      .then(g => { if (alive) setAllGroups(g); })
      .catch(() => { if (alive) setAllGroups([]); });
    return () => { alive = false; };
  }, []);

  const roleOptions = isAdminVariant ? ["student", "teacher", "manager"] : ["student", "teacher"];
  const activeRoles = [role, ...extra];
  const showStudentBlock = groupsEditable && activeRoles.includes("student");
  const showCuratorBlock = groupsEditable && activeRoles.includes("teacher");

  const toggleExtra = (r) => {
    setExtra(extra.includes(r) ? extra.filter(x => x !== r) : [...extra, r]);
  };
  const toggleStudentGroup = (id) => {
    setStudentGroupIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  };
  const toggleCuratorGroup = (id) => {
    setCuratorGroupIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  };

  const save = async () => {
    if (isAdminVariant && password && password.length < 4) {
      alert("Пароль слишком короткий (минимум 4 символа)");
      return;
    }
    setSaving(true);
    try {
      const payload = { name, username };
      if (isAdminVariant) {
        payload.extra_roles = extra.join(",");
        payload.phone = phone;
        if (!isTargetAdmin) {
          payload.role = role;
          payload.is_active = active;
        }
        if (showStudentBlock) payload.group_ids = studentGroupIds;
        if (showCuratorBlock) payload.curator_group_ids = curatorGroupIds;
        await api(`/api/admin/users/${user.id}`, {
          method: "PUT", body: JSON.stringify(payload),
        });
        if (password) {
          try {
            await api(`/api/admin/users/${user.id}/password`, {
              method: "PUT", body: JSON.stringify({ password }),
            });
          } catch (e) {
            alert("Данные сохранены, но пароль не изменён: " + e.message);
            onSaved();
            return;
          }
        }
      } else {
        payload.is_active = active;
        if (!locked) {
          payload.role = role;
          payload.extra_roles = extra.join(",");
          if (showStudentBlock) payload.group_ids = studentGroupIds;
          if (showCuratorBlock) payload.curator_group_ids = curatorGroupIds;
        }
        await api(`/api/manager/users/${user.id}`, {
          method: "PUT", body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (e) {
      alert(e.message);
      setSaving(false);
    }
  };

  const groupsSection = (
    <>
      {showStudentBlock && (
        <>
          <label style={labelStyle}>Группы (ученик)</label>
          <div className="muted small" style={{ marginBottom: 6 }}>
            Отметьте группы, в которые входит пользователь.
          </div>
          <div className="chips">
            {allGroups === null && <span className="muted small">Загрузка групп…</span>}
            {allGroups && allGroups.map(g => (
              <label key={g.id} className="chip" style={{ cursor: "pointer" }}>
                <input type="checkbox"
                       checked={studentGroupIds.includes(g.id)}
                       onChange={() => toggleStudentGroup(g.id)} />
                {g.course_title} · {g.name}
              </label>
            ))}
            {allGroups && !allGroups.length && <span className="muted small">Групп пока нет</span>}
          </div>
        </>
      )}

      {showCuratorBlock && (
        <>
          <label style={labelStyle}>Куратор в группах</label>
          <div className="muted small" style={{ marginBottom: 6 }}>
            Отметьте группы, в которых пользователь является куратором.
          </div>
          <div className="chips">
            {allGroups === null && <span className="muted small">Загрузка групп…</span>}
            {allGroups && allGroups.map(g => (
              <label key={g.id} className="chip" style={{ cursor: "pointer" }}>
                <input type="checkbox"
                       checked={curatorGroupIds.includes(g.id)}
                       onChange={() => toggleCuratorGroup(g.id)} />
                {g.course_title} · {g.name}
              </label>
            ))}
            {allGroups && !allGroups.length && <span className="muted small">Групп пока нет</span>}
          </div>
        </>
      )}
    </>
  );

  return (
    <Modal onClose={onClose} innerStyle={{ maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}>
      <h3>Редактирование пользователя</h3>
      <label>ФИО</label>
      <input value={name} onChange={e => setName(e.target.value)} style={{ width: "100%" }} />
      <label style={{ marginTop: 8, display: "block" }}>Логин</label>
      <input value={username} onChange={e => setUsername(e.target.value)} style={{ width: "100%" }} />

      {isAdminVariant && (
        <>
          <label style={labelStyle}>Пароль</label>
          <div className="muted small" style={{ marginBottom: 6 }}>
            Виден только администратору. Оставьте поле пустым, чтобы не менять пароль.
          </div>
          <input type="password" value={password}
                 onChange={e => setPassword(e.target.value)}
                 placeholder="Новый пароль (необязательно)"
                 autoComplete="new-password"
                 style={{ width: "100%" }} />
        </>
      )}

      <label style={labelStyle}>Телефон при регистрации</label>
      {isAdminVariant ? (
        <input value={phone} onChange={e => setPhone(e.target.value)}
               placeholder="Номер телефона" style={{ width: "100%" }} />
      ) : (
        <input value={phone} readOnly disabled
               placeholder="—" title="Изменять телефон может только администратор"
               style={{ width: "100%" }} />
      )}

      {!isTargetAdmin && !locked && (
        <>
          <label style={labelStyle}>Основная роль</label>
          <select value={role} onChange={e => setRole(e.target.value)} style={{ width: "100%" }}>
            {roleOptions.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </>
      )}

      {!locked && (
        <>
          <label style={labelStyle}>Дополнительные роли</label>
          <div className="muted small" style={{ marginBottom: 6 }}>
            Пользователь сможет переключаться между ролями при входе и в шапке сайта.
          </div>
          <div className="chips">
            {roleOptions.map(r => (
              <label key={r} className="chip" style={{ cursor: "pointer" }}>
                <input type="checkbox"
                       checked={extra.includes(r)}
                       onChange={() => toggleExtra(r)} />
                {ROLE_LABELS[r]}
              </label>
            ))}
          </div>
        </>
      )}

      {!(isAdminVariant && isTargetAdmin) && (
        <>
          <label style={labelStyle}>Доступ к курсам</label>
          <label className="chip" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={active}
                   onChange={e => setActive(e.target.checked)} />
            ✅ Активен — можно пользоваться курсами
          </label>
        </>
      )}

      {groupsSection}

      <div style={{ ...labelStyle, display: "flex", gap: 24 }}>
        <div>
          <div className="muted small">Дата регистрации</div>
          <div>{fmtDateTime(user.created_at)}</div>
        </div>
        <div>
          <div className="muted small">Последняя авторизация</div>
          <div>{fmtDateTime(user.last_login_at)}</div>
        </div>
      </div>

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn ghost" onClick={onClose} disabled={saving}>Отмена</button>
        <button className="btn primary" onClick={save} disabled={saving}>
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>
    </Modal>
  );
}
