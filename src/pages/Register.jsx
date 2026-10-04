import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken, setUser } from "../api";

const APP_NAME = "МКУ — Международные Курсы Ученичества";

const ROLE_LABELS = {
  admin: "Администратор",
  manager: "Методист",
  teacher: "Куратор",
  student: "Ученик",
};

export default function Register() {
  const [form, setForm] = useState({
    email: "",
    phone: "",
    name: "",
    password: "",
    password_confirm: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [inviteStatus, setInviteStatus] = useState(null); // null | "ok" | "used" | "no-invite"
  const [inviteData, setInviteData] = useState(null);
  const navigate = useNavigate();

  const update = (field, val) => {
    setForm((prev) => ({ ...prev, [field]: val }));
    if (field === "email" || field === "phone") {
      setInviteStatus(null);
      setInviteData(null);
    }
  };

  const checkInvite = async () => {
    const query = form.email.trim() || form.phone.trim();
    if (!query) return;

    setIsChecking(true);
    try {
      const res = await api(`/api/auth/check-invite?query=${encodeURIComponent(query)}`);
      if (res.available) {
        setInviteStatus("ok");
        setInviteData(res);
        // Автоматически подставляем имя и телефон из приглашения, если они есть
        setForm((prev) => ({
          ...prev,
          name: prev.name || res.name || "",
          phone: prev.phone || res.phone || "",
          email: prev.email || res.email || "",
        }));
      } else if (res.reason === "already_registered") {
        setInviteStatus("used");
        setInviteData(null);
      } else {
        setInviteStatus("no-invite");
        setInviteData(null);
      }
    } catch {
      setInviteStatus(null);
    } finally {
      setIsChecking(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.email.trim() && !form.phone.trim()) {
      setError("Укажите Email или номер телефона");
      return;
    }
    if (!form.phone.trim()) {
      setError("Укажите ваш номер телефона для связи с куратором");
      return;
    }
    if (!form.name.trim()) {
      setError("Укажите ваше имя и фамилию (ФИО)");
      return;
    }
    if (form.password !== form.password_confirm) {
      setError("Пароли не совпадают");
      return;
    }
    if (form.password.length < 4) {
      setError("Пароль должен содержать минимум 4 символа");
      return;
    }

    setIsLoading(true);
    try {
      const res = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setToken(res.access_token);
      setUser({ role: res.role, roles: res.roles || [res.role], name: res.name, is_root_admin: res.is_root_admin });
      const target =
        res.role === "admin"
          ? "/admin"
          : res.role === "manager"
          ? "/manager"
          : res.role === "teacher"
          ? "/teacher"
          : "/student";
      navigate(target);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={handleSubmit} style={{ maxWidth: 440 }}>
        <div className="logo">
          <h1>{APP_NAME}</h1>
          <div className="sub">Активация приглашения и регистрация</div>
        </div>

        <div style={{ marginBottom: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>
            Email из Tilda:
          </label>
          <input
            type="email"
            placeholder="Ваш email (например, ivanova@mail.ru)"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            onBlur={checkInvite}
            autoFocus
            required
          />
        </div>

        {/* Статус проверки приглашения */}
        {isChecking && (
          <div className="small muted" style={{ marginBottom: 6 }}>
            Проверка приглашения…
          </div>
        )}

        {inviteStatus === "ok" && inviteData && (
          <div
            style={{
              background: "rgba(34, 197, 94, 0.1)",
              border: "1px solid #22c55e",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12,
              color: "#15803d",
              marginBottom: 10,
              lineHeight: 1.4,
            }}
          >
            <b>✓ Приглашение подтверждено!</b>
            {inviteData.name && <div>ФИО: <b>{inviteData.name}</b></div>}
            {inviteData.role && (
              <div>Роль: <b>{ROLE_LABELS[inviteData.role] || inviteData.role}</b></div>
            )}
            {inviteData.group_names && inviteData.group_names.length > 0 && (
              <div>Курс: <b>{inviteData.group_names.join(", ")}</b></div>
            )}
            <div style={{ marginTop: 4, color: "#166534" }}>
              Заполните номер телефона и придумайте пароль для входа.
            </div>
          </div>
        )}

        {inviteStatus === "no-invite" && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid #ef4444",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12,
              color: "#b91c1c",
              marginBottom: 10,
            }}
          >
            ❌ Email не найден в списке приглашённых учеников. Убедитесь, что указали Email, с которым регистрировались в Tilda, или обратитесь к куратору/администратору.
          </div>
        )}

        {inviteStatus === "used" && (
          <div
            style={{
              background: "rgba(245, 158, 11, 0.1)",
              border: "1px solid #f59e0b",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12,
              color: "#b45309",
              marginBottom: 10,
            }}
          >
            ⚠️ Этот аккаунт уже активирован. Пожалуйста, <Link to="/login" style={{ fontWeight: 700 }}>войдите в систему</Link>.
          </div>
        )}

        <div style={{ marginBottom: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>
            Номер телефона:
          </label>
          <input
            placeholder="+7 (999) 000-00-00"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            onBlur={() => { if (!form.email && form.phone) checkInvite(); }}
            required
          />
        </div>

        <div style={{ marginBottom: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>
            ФИО:
          </label>
          <input
            placeholder="Фамилия Имя Отчество"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
          />
        </div>

        <div style={{ marginBottom: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>
            Придумайте пароль:
          </label>
          <input
            type="password"
            placeholder="Минимум 4 символа"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            required
          />
        </div>

        <div style={{ marginBottom: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 3 }}>
            Повторите пароль:
          </label>
          <input
            type="password"
            placeholder="Повтор пароля"
            value={form.password_confirm}
            onChange={(e) => update("password_confirm", e.target.value)}
            required
          />
        </div>

        {error && <div className="error" style={{ marginBottom: 10 }}>{error}</div>}

        <button
          className="btn primary"
          disabled={isLoading || inviteStatus === "used" || inviteStatus === "no-invite"}
          style={{ width: "100%", padding: "10px 14px", marginTop: 4 }}
        >
          {isLoading ? "Регистрация…" : "Завершить регистрацию и войти"}
        </button>

        <div className="muted small" style={{ textAlign: "center", marginTop: 8 }}>
          Уже есть аккаунт? <Link to="/login">Войти в систему</Link>
        </div>
      </form>
    </div>
  );
}
