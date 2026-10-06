import { useEffect, useState } from "react";
import Modal from "./Modal";
import { api, getUser } from "../api";

const ROLE_LABELS = {
  admin: "Администратор",
  student: "Ученик",
  teacher: "Декан",
  dean: "Декан",
  curator: "Куратор",
  manager: "Методист",
};

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
  const currentUser = getUser();
  const isCurrentUserRoot = !!currentUser?.is_root_admin;
  const isTargetAdmin = user.role === "admin" || (user.extra_roles && user.extra_roles.includes("admin"));
  const isTargetManager = user.role === "manager";
  // методист не может редактировать методиста — кроме ФИО, логина и доступа
  const locked = variant === "manager" && isTargetManager;
  const isAdminVariant = variant === "admin";
  const groupsEditable = isAdminVariant ? (isCurrentUserRoot || !isTargetAdmin) : !locked;

  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email || "");
  const [password, setPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(true);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [phone, setPhone] = useState(user.phone || "");
  const currentPassword = user.password_plain || "";
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

  const roleOptions = isAdminVariant
    ? (isCurrentUserRoot ? ["student", "curator", "teacher", "manager", "admin"] : ["student", "curator", "teacher", "manager"])
    : ["student", "curator", "teacher"];
  const activeRoles = [role, ...extra];
  const showStudentBlock = groupsEditable && activeRoles.includes("student");
  const showCuratorBlock = groupsEditable && (activeRoles.includes("teacher") || activeRoles.includes("curator"));

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
      const payload = { name, username, email: email.trim(), phone: phone.trim() };
      if (isAdminVariant) {
        payload.extra_roles = extra.join(",");
        if (isCurrentUserRoot || !isTargetAdmin) {
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

      <label style={{ marginTop: 8, display: "block" }}>Email</label>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="user@example.com"
        style={{ width: "100%" }}
      />

      <label style={labelStyle}>Номер телефона</label>
      {isAdminVariant ? (
        <input value={phone} onChange={e => setPhone(e.target.value)}
               placeholder="+7 (999) 000-00-00" style={{ width: "100%" }} />
      ) : (
        <input value={phone} readOnly disabled
               placeholder="—" title="Изменять телефон может только администратор"
               style={{ width: "100%" }} />
      )}

      {isAdminVariant && (
        <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--bg-soft, #f8fafc)", borderRadius: 10, border: "1px solid var(--border, #cbd5e1)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <label style={{ fontWeight: 700, fontSize: 13, color: "var(--navy, #1e3a8a)", margin: 0 }}>
              🔑 Пароль пользователя
            </label>
            <span className="small" style={{ fontSize: 11, background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
              Виден только администратору
            </span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "var(--text-soft, #475569)", marginBottom: 4, fontWeight: 600 }}>
              Текущий пароль:
            </div>
            {currentPassword ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  readOnly
                  style={{
                    flex: 1,
                    fontFamily: "monospace",
                    fontSize: 15,
                    fontWeight: 700,
                    letterSpacing: showCurrentPassword ? "normal" : "2px",
                    background: "#fff",
                    color: "#0f172a",
                    border: "1px solid #94a3b8",
                  }}
                />
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  title={showCurrentPassword ? "Скрыть" : "Показать"}
                  style={{ padding: "6px 10px", whiteSpace: "nowrap" }}
                >
                  {showCurrentPassword ? "🙈 Скрыть" : "👁 Показать"}
                </button>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => {
                    navigator.clipboard.writeText(currentPassword);
                    alert("Пароль скопирован в буфер обмена!");
                  }}
                  title="Скопировать пароль"
                  style={{ padding: "6px 10px", whiteSpace: "nowrap" }}
                >
                  📋 Копировать
                </button>
              </div>
            ) : (
              <div style={{ padding: "8px 10px", background: "#fef3c7", borderRadius: 6, border: "1px solid #fde68a", color: "#92400e", fontSize: 13 }}>
                Пароль сохранён в зашифрованном виде (создан до обновления системы).
                <div style={{ marginTop: 4 }}>
                  Вы можете задать новый пароль ниже или нажать <b>«🎲 Сгенерировать»</b>.
                </div>
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 12, color: "var(--text-soft, #475569)", marginBottom: 4, fontWeight: 600 }}>
              Изменить пароль (оставьте поле пустым, чтобы не менять пароль):
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type={showNewPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Новый пароль"
                autoComplete="new-password"
                style={{ flex: 1, background: "#fff" }}
              />
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setShowNewPassword(!showNewPassword)}
                style={{ padding: "6px 10px" }}
                title={showNewPassword ? "Скрыть" : "Показать"}
              >
                {showNewPassword ? "🙈" : "👁"}
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  const gen = Math.random().toString(36).slice(-6) + Math.floor(10 + Math.random() * 89);
                  setPassword(gen);
                  setShowNewPassword(true);
                }}
                title="Сгенерировать случайный пароль"
                style={{ padding: "6px 10px", whiteSpace: "nowrap" }}
              >
                🎲 Сгенерировать
              </button>
            </div>
          </div>
        </div>
      )}

      {((isAdminVariant && isCurrentUserRoot) || (!isTargetAdmin && !locked)) && (
        <>
          <label style={labelStyle}>Основная роль</label>
          <select value={role} onChange={e => setRole(e.target.value)} style={{ width: "100%" }}>
            {roleOptions.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
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
            {roleOptions.filter(r => r !== role).map(r => (
              <label key={r} className="chip" style={{ cursor: "pointer" }}>
                <input type="checkbox"
                       checked={extra.includes(r)}
                       onChange={() => toggleExtra(r)} />
                {ROLE_LABELS[r] || r}
              </label>
            ))}
          </div>
        </>
      )}

      {(isCurrentUserRoot || !isTargetAdmin) && (
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
