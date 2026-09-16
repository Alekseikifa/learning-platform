import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken, setUser } from "../api";

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
      setUser({ role: r.role, name: r.name });
      nav(r.role === "admin" ? "/admin" : r.role === "teacher" ? "/teacher" : "/student");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <h2>Вход в платформу</h2>
        <input placeholder="Логин" value={u} onChange={e => setU(e.target.value)} autoFocus />
        <input type="password" placeholder="Пароль" value={p} onChange={e => setP(e.target.value)} />
        {err && <div className="error">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? "..." : "Войти"}</button>
        <div className="muted small">По умолчанию: admin / admin</div>
      </form>
    </div>
  );
}