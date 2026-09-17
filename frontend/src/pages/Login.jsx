import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, setToken, setUser } from "../api";
import { SCHOOL_NAME } from "../components/Layout";

export default function Login() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: u, password: p }),
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

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="logo">
          <h1>{SCHOOL_NAME}</h1>
          <div className="sub">Вход в систему</div>
        </div>
        <input placeholder="Логин" value={u} onChange={e => setU(e.target.value)} autoFocus />
        <input type="password" placeholder="Пароль" value={p} onChange={e => setP(e.target.value)} />
        {err && <div className="error">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? "..." : "Войти"}</button>
        <div className="muted small" style={{ textAlign: "center" }}>
          Нет аккаунта? <Link to="/register">Зарегистрироваться по телефону</Link>
        </div>
      </form>
    </div>
  );
}
