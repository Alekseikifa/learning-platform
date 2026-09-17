import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import AdminPanel from "./pages/AdminPanel";
import ManagerPanel from "./pages/ManagerPanel";
import TeacherPanel from "./pages/TeacherPanel";
import StudentPanel from "./pages/StudentPanel";
import { getToken, getUser } from "./api";
import Register from "./pages/Register";

function Private({ role, children }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;

  if (role && user.role !== role) {
    const path =
      user.role === "admin" ? "/admin"
      : user.role === "manager" ? "/manager"
      : user.role === "teacher" ? "/teacher"
      : "/student";
    return <Navigate to={path} replace />;
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
          element={<Private role="admin"><AdminPanel /></Private>}
        />
        <Route
          path="/manager"
          element={<Private role="manager"><ManagerPanel /></Private>}
        />
        <Route
          path="/teacher"
          element={<Private role="teacher"><TeacherPanel /></Private>}
        />
        <Route
          path="/student"
          element={<Private role="student"><StudentPanel /></Private>}
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
