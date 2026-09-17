import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, setToken, setUser } from "../api";
import { SCHOOL_NAME } from "../components/Layout";

export default function Register() {
  const [form, setForm] = useState({
    name: "", phone: "", password: "", password_confirm: "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [phoneStatus, setPhoneStatus] = useState(null); // null | "ok" | "no-invite" | "used"
  const nav = useNavigate();

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const checkPhone = async () => {
    if (!form.phone.trim()) return;
    try {
      const r = await api(`/api/auth/check-phone?phone=${encodeURIComponent(form.phone)}`);
      if (r.available) setPhoneStatus("ok");
      else if (r.reason === "already_registered") setPhoneStatus("used");
      else setPhoneStatus("no-invite");
    } catch {
      setPhoneStatus(null);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (form.password !== form.password_confirm) {
      setErr("Пароли не совпадают");
      return;
    }
    setBusy(true);
    try {
      const r = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setToken(r.access_token);
      setUser({ role: r.role, roles: r.roles || [r.role], name: r.name });
      const dest = r.role === "admin" ? "/admin"
                 : r.role === "manager" ? "/manager"
                 : r.role === "teacher" ? "/teacher" : "/student";
      nav(dest);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const phoneHint = () => {
    if (phoneStatus === "ok") return <span style={{ color: "var(--olive)" }}>✓ Номер найден. Заполните остальные поля.</span>;
    if (phoneStatus === "no-invite") return <span style={{ color: "var(--danger)" }}>Номер не найден в списке приглашений. Обратитесь к администратору.</span>;
    if (phoneStatus === "used") return <span style={{ color: "var(--danger)" }}>Этот номер уже зарегистрирован. Войдите.</span>;
    return null;
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="logo">
          <h1>{SCHOOL_NAME}</h1>
          <div className="sub">Регистрация</div>
        </div>

        <input placeholder="ФИО" value={form.name}
               onChange={e => setF("name", e.target.value)} required autoFocus />

        <input placeholder="Номер телефона" value={form.phone}
               onChange={e => { setF("phone", e.target.value); setPhoneStatus(null); }}
               onBlur={checkPhone} required />
        <div className="small" style={{ minHeight: 18 }}>{phoneHint()}</div>

        <input type="password" placeholder="Пароль" value={form.password}
               onChange={e => setF("password", e.target.value)} required />
        <input type="password" placeholder="Подтверждение пароля" value={form.password_confirm}
               onChange={e => setF("password_confirm", e.target.value)} required />

        {err && <div className="error">{err}</div>}
        <button className="btn primary" disabled={busy || phoneStatus !== "ok"}>
          {busy ? "..." : "Зарегистрироваться"}
        </button>
        <div className="muted small" style={{ textAlign: "center" }}>
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </div>
      </form>
    </div>
  );
}
