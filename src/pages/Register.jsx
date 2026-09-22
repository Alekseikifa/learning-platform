import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken, setUser } from "../api";

const APP_NAME = "МКУ — Международные Курсы Ученичества";

export default function Register() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    password: "",
    password_confirm: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [phoneStatus, setPhoneStatus] = useState(null);
  const navigate = useNavigate();

  const update = (field, val) => setForm((prev) => ({ ...prev, [field]: val }));

  const checkPhone = async () => {
    if (!form.phone.trim()) return;
    try {
      const res = await api(`/api/auth/check-phone?phone=${encodeURIComponent(form.phone)}`);
      if (res.available) setPhoneStatus("ok");
      else if (res.reason === "already_registered") setPhoneStatus("used");
      else setPhoneStatus("no-invite");
    } catch {
      setPhoneStatus(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.password_confirm) {
      setError("Пароли не совпадают");
      return;
    }
    setIsLoading(true);
    try {
      const res = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setToken(res.access_token);
      setUser({ role: res.role, roles: res.roles || [res.role], name: res.name });
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

  const renderPhoneHint = () => {
    if (phoneStatus === "ok") {
      return <span style={{ color: "var(--olive)" }}>✓ Номер найден. Заполните остальные поля.</span>;
    }
    if (phoneStatus === "no-invite") {
      return (
        <span style={{ color: "var(--danger)" }}>
          Номер не найден в списке приглашений. Обратитесь к администратору.
        </span>
      );
    }
    if (phoneStatus === "used") {
      return <span style={{ color: "var(--danger)" }}>Этот номер уже зарегистрирован. Войдите.</span>;
    }
    return null;
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={handleSubmit}>
        <div className="logo">
          <h1>{APP_NAME}</h1>
          <div className="sub">Регистрация</div>
        </div>
        <input
          placeholder="ФИО"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          required
          autoFocus
        />
        <input
          placeholder="Номер телефона"
          value={form.phone}
          onChange={(e) => {
            update("phone", e.target.value);
            setPhoneStatus(null);
          }}
          onBlur={checkPhone}
          required
        />
        <div className="small" style={{ minHeight: 18 }}>
          {renderPhoneHint()}
        </div>
        <input
          type="password"
          placeholder="Пароль"
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Подтверждение пароля"
          value={form.password_confirm}
          onChange={(e) => update("password_confirm", e.target.value)}
          required
        />
        {error && <div className="error">{error}</div>}
        <button className="btn primary" disabled={isLoading || phoneStatus !== "ok"}>
          {isLoading ? "..." : "Зарегистрироваться"}
        </button>
        <div className="muted small" style={{ textAlign: "center" }}>
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </div>
      </form>
    </div>
  );
}
