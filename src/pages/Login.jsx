import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken, setUser } from "../api";

const APP_NAME = "МКУ — Международные Курсы Ученичества";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
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
          : res.role === "curator"
          ? "/curator"
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
      <form className="card login-card" onSubmit={handleSubmit}>
        <div className="logo">
          <h1>{APP_NAME}</h1>
          <div className="sub">Вход в систему</div>
        </div>
        <input
          placeholder="Email, телефон или логин"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="error">{error}</div>}
        <button className="btn primary" disabled={isLoading}>
          {isLoading ? "..." : "Войти"}
        </button>

        <div className="muted small" style={{ textAlign: "center", marginTop: 4 }}>
          Первый вход или регистрация? <Link to="/register">Активировать приглашение</Link>
        </div>
      </form>
    </div>
  );
}
