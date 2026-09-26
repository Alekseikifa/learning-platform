import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { api, getToken, getUser, setToken, setUser } from "./api";
import AdminPanel from "./pages/AdminPanel";
import Login from "./pages/Login";
import ManagerPanel from "./pages/ManagerPanel";
import Register from "./pages/Register";
import StudentPanel from "./pages/StudentPanel";
import TeacherPanel from "./pages/TeacherPanel";

const defaultRouteFor = (role) =>
  role === "admin" ? "/admin"
  : role === "manager" ? "/manager"
  : role === "teacher" ? "/teacher"
  : "/student";

function ProtectedRoute({ role, children }) {
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
    (async () => {
      try {
        const res = await api("/api/auth/switch-role", {
          method: "POST",
          body: JSON.stringify({ role }),
        });
        setToken(res.access_token);
        setUser({ role: res.role, roles: res.roles, name: res.name });
        setStatus("ok");
      } catch {
        setStatus("wrong");
      }
    })();
  }, [status, role]);

  if (status === "no-auth") return <Navigate to="/login" replace />;
  if (status === "wrong") {
    const u = getUser();
    return <Navigate to={defaultRouteFor(u ? u.role : "student")} replace />;
  }
  if (status === "need-switch") return null;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}
