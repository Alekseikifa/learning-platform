import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { getToken, getUser } from "./api";
import AdminPanel from "./pages/AdminPanel";
import Login from "./pages/Login";
import ManagerPanel from "./pages/ManagerPanel";
import Register from "./pages/Register";
import StudentPanel from "./pages/StudentPanel";
import TeacherPanel from "./pages/TeacherPanel";

function ProtectedRoute({ role, children }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  const user = getUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (role && user.role !== role) {
    const defaultRoute =
      user.role === "admin"
        ? "/admin"
        : user.role === "manager"
        ? "/manager"
        : user.role === "teacher"
        ? "/teacher"
        : "/student";
    return <Navigate to={defaultRoute} replace />;
  }
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
