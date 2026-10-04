import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api, getToken, getUser, setToken, setUser } from "./api";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ToastContainer from "./components/ToastContainer";

// панели ролей грузим отдельными чанками — логин/регистрация открываются сразу
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const ManagerPanel = lazy(() => import("./pages/ManagerPanel"));
const StudentPanel = lazy(() => import("./pages/StudentPanel"));
const TeacherPanel = lazy(() => import("./pages/TeacherPanel"));

const defaultRouteFor = (role) =>
  role === "admin" ? "/admin"
  : role === "manager" ? "/manager"
  : role === "teacher" ? "/teacher"
  : "/student";

function ProtectedRoute({ role, children }) {
  const location = useLocation();
  const initial = () => {
    if (!getToken()) return "no-auth";
    const u = getUser();
    if (!u) return "no-auth";
    if (!role || u.role === role) return "ok";
    if ((u.roles || [u.role]).includes(role)) return "need-switch";
    return "wrong";
  };
  const [status, setStatus] = useState(initial);

  useEffect(() => {
    if (status !== "need-switch") return;
    let cancelled = false;
    const timer = setTimeout(() => { if (!cancelled) setStatus("wrong"); }, 10000);
    (async () => {
      try {
        const res = await api("/api/auth/switch-role", {
          method: "POST",
          body: JSON.stringify({ role }),
        });
        if (cancelled) return;
        setToken(res.access_token);
        setUser({ role: res.role, roles: res.roles, name: res.name });
        setStatus("ok");
      } catch {
        if (!cancelled) setStatus("wrong");
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status, role]);

  if (status === "no-auth") return <Navigate to="/login" replace />;
  if (status === "wrong") {
    const u = getUser();
    // сохраняем query (?tab=… и пр.), чтобы deep-links не терялись при редиректе «не на свою роль»
    return <Navigate to={{ pathname: defaultRouteFor(u ? u.role : "student"), search: location.search }} replace />;
  }
  if (status === "need-switch") {
    return (
      <div style={{ display: "flex", minHeight: "60vh", alignItems: "center", justifyContent: "center" }}>
        <span className="muted">Переключение роли…</span>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastContainer />
      <Suspense
        fallback={
          <div style={{ display: "flex", minHeight: "60vh", alignItems: "center", justifyContent: "center" }}>
            <span className="muted">Загрузка…</span>
          </div>
        }
      >
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute role="admin">
              <AdminPanel />
            </ProtectedRoute>
          }
        />
        <Route
          path="/manager"
          element={
            <ProtectedRoute role="manager">
              <ManagerPanel />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher"
          element={
            <ProtectedRoute role="teacher">
              <TeacherPanel />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student"
          element={
            <ProtectedRoute role="student">
              <StudentPanel />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
