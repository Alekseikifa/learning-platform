import { useEffect, useState } from "react";
import SearchSelect from "./SearchSelect";
import { api } from "../api";

const userHasRole = (u, r) =>
  u.role === r || (u.extra_roles || "").split(",").map(s => s.trim()).includes(r);

/**
 * Вкладка «Группы» для админской и методистской панелей.
 * apiPrefix: "/api/admin" | "/api/manager"
 */
export default function GroupsTab({ courses, users, reload, apiPrefix = "/api/admin" }) {
  const teachers = users.filter(u => userHasRole(u, "teacher"));
  const students = users.filter(u => userHasRole(u, "student"));
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [groups, setGroups] = useState([]);
  const [loadErr, setLoadErr] = useState(null);
  const [newName, setNewName] = useState("");

  const load = () =>
    courseId &&
    api(`${apiPrefix}/groups/${courseId}`)
      .then(setGroups)
      .catch((e) => setLoadErr(e.message));
  useEffect(() => { load(); }, [courseId]);
  useEffect(() => { if (!courseId && courses[0]) setCourseId(courses[0].id); }, [courses, courseId]);

  const addGroup = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await api(`${apiPrefix}/groups`, {
        method: "POST", body: JSON.stringify({ course_id: +courseId, name: newName.trim() }),
      });
      setNewName(""); load(); reload();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div className="card row">
        <label>Курс:</label>
        <select value={courseId} onChange={e => setCourseId(e.target.value)}>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>
      <form className="card row" onSubmit={addGroup}>
        <input placeholder="Название группы (например, ИС-21)" value={newName}
               onChange={e => setNewName(e.target.value)} style={{ flex: 1 }} />
        <button className="btn primary">Создать группу</button>
      </form>

      {loadErr && (
        <div className="card" style={{ color: "#dc2626" }}>
          Не удалось загрузить группы: {loadErr}
        </div>
      )}
      {groups.map(g => (
        <GroupCard key={g.id} group={g} teachers={teachers} students={students}
                   apiPrefix={apiPrefix}
                   reload={() => { load(); reload(); }} />
      ))}
      {!groups.length && !loadErr && <div className="card muted">В этом курсе пока нет групп</div>}
    </div>
  );
}

function GroupCard({ group, teachers, students, reload, apiPrefix }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(group.name);
  const [teacherId, setTeacherId] = useState("");
  const [studentId, setStudentId] = useState("");

  const saveName = async () => {
    try {
      await api(`${apiPrefix}/groups/${group.id}`, { method: "PUT", body: JSON.stringify({ name }) });
      setEdit(false); reload();
    } catch (e) { alert(e.message); }
  };
  const del = async () => {
    if (!confirm("Удалить группу?")) return;
    try {
      await api(`${apiPrefix}/groups/${group.id}`, { method: "DELETE" });
      reload();
    } catch (e) { alert(e.message); }
  };
  const addTeacher = async () => {
    if (!teacherId) return;
    try {
      await api(`${apiPrefix}/groups/${group.id}/teachers`, {
        method: "POST", body: JSON.stringify({ teacher_id: +teacherId }),
      });
      setTeacherId(""); reload();
    } catch (e) { alert(e.message); }
  };
  const removeTeacher = async (tid) => {
    try {
      await api(`${apiPrefix}/groups/${group.id}/teachers/${tid}`, { method: "DELETE" });
      reload();
    } catch (e) { alert(e.message); }
  };
  const addStudent = async () => {
    if (!studentId) return;
    try {
      await api(`${apiPrefix}/groups/${group.id}/students`, {
        method: "POST", body: JSON.stringify({ user_id: +studentId }),
      });
      setStudentId(""); reload();
    } catch (e) { alert(e.message); }
  };
  const removeStudent = async (uid) => {
    try {
      await api(`${apiPrefix}/groups/${group.id}/students/${uid}`, { method: "DELETE" });
      reload();
    } catch (e) { alert(e.message); }
  };

  const studentOptions = students.map(s => ({ value: s.id, label: `${s.name} (${s.username})` }));

  return (
    <div className="card">
      <div className="spread">
        {edit ? (
          <>
            <input value={name} onChange={e => setName(e.target.value)} style={{ flex: 1 }} />
            <button className="btn primary" onClick={saveName}>ОК</button>
            <button className="btn ghost" onClick={() => setEdit(false)}>Отмена</button>
          </>
        ) : (
          <>
            <b>{group.name}</b>
            <div>
              <button className="btn small" onClick={() => setEdit(true)}>Переименовать</button>{" "}
              <button className="btn danger small" onClick={del}>Удалить</button>
            </div>
          </>
        )}
      </div>

      <div className="section-title">Кураторы</div>
      <div className="chips">
        {group.teachers.map(t => (
          <span key={t.id} className="chip">
            {t.name}<button onClick={() => removeTeacher(t.id)} aria-label="Убрать куратора">✕</button>
          </span>
        ))}
        {!group.teachers.length && <span className="muted small">нет</span>}
      </div>
      <div className="row">
        <select value={teacherId} onChange={e => setTeacherId(e.target.value)}>
          <option value="">— куратор —</option>
          {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="btn" onClick={addTeacher}>Добавить</button>
      </div>

      <div className="section-title">Ученики ({group.students.length})</div>
      <div className="chips">
        {group.students.map(s => (
          <span key={s.id} className="chip">
            {s.name}<button onClick={() => removeStudent(s.id)} aria-label="Убрать ученика">✕</button>
          </span>
        ))}
        {!group.students.length && <span className="muted small">нет</span>}
      </div>
      <div className="row">
        <div style={{ minWidth: 260 }}>
          <SearchSelect options={studentOptions} value={studentId}
                        onChange={v => setStudentId(v)}
                        placeholder="Поиск ученика по ФИО..." />
        </div>
        <button className="btn" onClick={addStudent}>Добавить ученика</button>
      </div>
    </div>
  );
}
