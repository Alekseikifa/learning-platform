import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../api";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

export default function TeacherPanel() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [students, setStudents] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    api("/api/teacher/courses").then(cs => {
      setCourses(cs);
      if (cs[0]) setCourseId(cs[0].id);
    });
  }, []);

  useEffect(() => {
    if (!courseId) return;
    api(`/api/teacher/course/${courseId}/students`).then(setStudents);
    api(`/api/teacher/course/${courseId}/attempts`).then(setAttempts);
    api(`/api/teacher/course/${courseId}/analytics`).then(setAnalytics);
  }, [courseId]);

  return (
    <Layout title="Панель преподавателя">
      <div className="card row">
        <label>Курс:</label>
        <select value={courseId} onChange={e => setCourseId(e.target.value)}>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      {analytics && (
        <>
          <div className="grid-2">
            <div className="card">
              <h3>Динамика активности (30 дней)</h3>
              {analytics.timeline.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={analytics.timeline}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis yAxisId="l" />
                    <YAxis yAxisId="r" orientation="right" domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="l" type="monotone" dataKey="attempts" name="Попыток" stroke="#2563eb" />
                    <Line yAxisId="r" type="monotone" dataKey="avg_score" name="Средний %" stroke="#10b981" />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="muted">Пока нет данных за последние 30 дней</div>}
            </div>

            <div className="card">
              <h3>Результаты по тестам</h3>
              {analytics.per_test.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={analytics.per_test}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="test" fontSize={11} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="avg_score" name="Средний %" fill="#3b82f6" />
                    <Bar dataKey="pass_rate" name="% сдавших" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="muted">Нет тестов</div>}
            </div>
          </div>

          <div className="card">
            <h3>Прогресс учеников</h3>
            {analytics.per_student.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.per_student}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="progress" name="Прогресс %" fill="#8b5cf6" />
                  <Bar dataKey="avg_score" name="Средний балл %" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="muted">Нет учеников</div>}
          </div>
        </>
      )}

      <div className="card">
        <h3>Ученики</h3>
        <table className="table">
          <thead><tr><th>ФИО</th><th>Логин</th><th>Прогресс</th><th>Тестов сдано</th><th>Активность</th></tr></thead>
          <tbody>
            {students.map(s => (
              <tr key={s.id}>
                <td>{s.name}</td><td>{s.username}</td>
                <td style={{ minWidth: 160 }}>
                  <div className="bar"><div style={{ width: s.progress + "%" }} /></div>
                  <span className="muted small">{s.progress}%</span>
                </td>
                <td>{s.passed_tests}/{s.total_tests}</td>
                <td className="muted small">{s.last_activity
                    ? new Date(s.last_activity).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Последние попытки</h3>
        <table className="table">
          <thead><tr><th>Дата</th><th>Ученик</th><th>Тест</th><th>%</th><th>Результат</th></tr></thead>
          <tbody>
            {attempts.map(a => (
              <tr key={a.id}>
                <td className="muted small">{new Date(a.created_at).toLocaleString()}</td>
                <td>{a.student}</td><td>{a.test}</td><td>{a.score}%</td>
                <td>{a.passed ? <span className="tag ok">сдан</span> : <span className="tag no">не сдан</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}