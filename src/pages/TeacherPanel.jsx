import DirectMessages from "../components/DirectMessages";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import Collapsible from "../components/Collapsible";
import ChatPanel from "../components/ChatPanel";
import { StudentsTab, ProgressTable, AttemptsTab, AnalyticsTab, ReportsTab } from "../components/MonitoringTabsLazy";
import Modal from "../components/Modal";
import UnlockThemeModal from "../components/UnlockThemeModal";
import { api } from "../api";
import ScheduleCalendar from "../components/ScheduleCalendar";
import { getIcon } from "../lib/materialIcons";

const TABS = [
  { id: "students",      label: "Ученики" },
  { id: "progress",      label: "Таблица прогресса" },
  { id: "reports",       label: "Отчёты по урокам" },
  { id: "schedule",      label: "Учебный график" },
  { id: "materials",     label: "Доп. материалы" },
  { id: "attempts",      label: "Попытки" },
  { id: "analytics",     label: "Аналитика" },
  { id: "announcements", label: "Объявления" },
  { id: "messages",      label: "Сообщения" },
];

export default function TeacherPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTabState] = useState(() => {
    const t = searchParams.get("tab");
    return TABS.some((x) => x.id === t) ? t : "students";
  });
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsErr, setGroupsErr] = useState(null);
  const [groupId, setGroupId] = useState("");
  const [pendingTheme, setPendingTheme] = useState(null);
  const [pendingExtra, setPendingExtra] = useState(null);
  const [unlockStudent, setUnlockStudent] = useState(null);

  // переключение таба пишем в URL — F5 и «назад» сохраняют место
  const changeTab = (id) => {
    setTabState(id);
    const next = new URLSearchParams(searchParams);
    next.set("tab", id);
    if (id !== "students") {
      next.delete("theme");
    }
    if (id !== "materials") {
      next.delete("extra_material");
    }
    setSearchParams(next);
  };

  const openChatWithStudent = (studentId) => {
    setTabState("messages");
    setSearchParams({ tab: "messages", user: String(studentId) });
  };

  // точечная очистка: убираем только использованные параметры, tab оставляем
  const clearParams = (keys) => {
    const next = new URLSearchParams(searchParams);
    keys.forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
  };

  // 1. Загружаем группы
  useEffect(() => {
    api("/api/teacher/groups")
      .then(setGroups)
      .catch((e) => setGroupsErr(e.message))
      .finally(() => setGroupsLoading(false));
  }, []);

  // 2. Дефолтная группа
  useEffect(() => {
    if (!groupId && groups[0]) setGroupId(groups[0].id);
  }, [groups, groupId]);

  // 3. Реакция на URL — работает и при монтировании, и при клике по уведомлению
  useEffect(() => {
    const urlTheme = searchParams.get("theme");
    const urlExtra = searchParams.get("extra_material");
    const urlTab = searchParams.get("tab");
    if (urlTab && TABS.some((x) => x.id === urlTab)) {
      setTabState(urlTab);
      if (urlTab === "students" && urlTheme) {
        setPendingTheme(+urlTheme);
      } else if (urlTab === "materials" && urlExtra) {
        setPendingExtra(+urlExtra);
      }
    } else if (urlTheme) {
      setPendingTheme(+urlTheme);
      setTabState("students");
    } else if (urlExtra) {
      setPendingExtra(+urlExtra);
      setTabState("materials");
    }
  }, [searchParams.toString()]);

  // 4. Выбираем группу по теме
  useEffect(() => {
    if (!pendingTheme) return;
    if (!groupsLoading && !groups.length) {
      alert("Открыть тему не удалось: вам ещё не назначены группы");
      setPendingTheme(null);
      return;
    }
    if (!groups.length) return;
    (async () => {
      try {
        const theme = await api(`/api/public/theme/${pendingTheme}`);
        const matching = groups.find(g => g.course_id === theme.course_id);
        if (matching) setGroupId(matching.id);
        else alert("Открыть тему не удалось: вам не назначена группа этого курса");
        setPendingTheme(null);
        clearParams(["theme"]);
      } catch (e) {
        alert(`Открыть тему не удалось: ${e.message}`);
        setPendingTheme(null);
      }
    })();
  }, [pendingTheme, groups, groupsLoading]);

  // 5. Выбираем группу по доп. материалу
  useEffect(() => {
    if (!pendingExtra) return;
    if (!groupsLoading && !groups.length) {
      alert("Открыть материал не удалось: вам ещё не назначены группы");
      setPendingExtra(null);
      return;
    }
    if (!groups.length) return;
    (async () => {
      try {
        const em = await api(`/api/public/extra-material/${pendingExtra}`);
        const matching = groups.find(g => g.course_id === em.course_id);
        if (matching) setGroupId(matching.id);
        else alert("Открыть материал не удалось: вам не назначена группа этого курса");
        setPendingExtra(null);
        clearParams(["extra_material"]);
      } catch (e) {
        alert(`Открыть материал не удалось: ${e.message}`);
        setPendingExtra(null);
      }
    })();
  }, [pendingExtra, groups, groupsLoading]);

  return (
    <Layout title="Панель куратора" tabs={TABS} active={tab} onChange={changeTab}>
      <div className="card row">
        <label>Группа:</label>
        <select value={groupId} onChange={e => setGroupId(e.target.value)}>
          {groups.map(g => (
            <option key={g.id} value={g.id}>
              {g.course_title} — {g.name}
            </option>
          ))}
        </select>
      </div>

      {groupsLoading && <div className="card muted">Загрузка групп…</div>}
      {groupsErr && (
        <div className="card" style={{ color: "#dc2626" }}>
          Не удалось загрузить группы: {groupsErr}
        </div>
      )}
      {!groupsLoading && !groupsErr && !groups.length && tab !== "messages" && (
        <div className="card muted">Вам ещё не назначены группы</div>
      )}

       {groupId && tab === "students"      && (
        <StudentsTab groupId={+groupId}
                     initialTheme={pendingTheme}
                     onThemeConsumed={() => {
                       setPendingTheme(null);
                       clearParams(["theme"]);
                     }}
                     onDirectMessage={openChatWithStudent} />
      )}
      {groupId && tab === "progress"      && <ProgressTable groupId={+groupId} />}
      {groupId && tab === "reports"       && <ReportsTab groupId={+groupId} />}
      {groupId && tab === "schedule"      && (
        <ScheduleCalendar
          courseId={groups.find(g => g.id === +groupId)?.course_id}
          groupId={+groupId}
          readOnly={false}
        />
      )}
      {groupId && tab === "materials"     && (
        <TeacherMaterialsTab
          group={groups.find(g => g.id === +groupId)}
          initialExtra={pendingExtra}
          onExtraConsumed={() => {
            setPendingExtra(null);
            clearParams(["extra_material"]);
          }}
        />
      )}
      {groupId && tab === "attempts"      && <AttemptsTab groupId={+groupId} />}
      {groupId && tab === "analytics"     && <AnalyticsTab groupId={+groupId} />}
      {groupId && tab === "announcements" && <AnnouncementsTab groups={groups} />}
      {tab === "messages"                   && <DirectMessages />}
    </Layout>
  );
}

function AnnouncementsTab({ groups }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: "", body: "", group_ids: [] });

  const load = () =>
    api("/api/teacher/announcements")
      .then(setList)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const startNew = () => {
    setEditing(null);
    setForm({ title: "", body: "", group_ids: groups.map(g => g.id) });
  };
  const startEdit = (a) => {
    setEditing(a.id);
    setForm({ title: a.title, body: a.body, group_ids: a.group_ids });
  };
  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) return alert("Заполните заголовок и текст");
    if (!form.group_ids.length) return alert("Выберите хотя бы одну группу");
    try {
      if (editing) {
        await api(`/api/teacher/announcements/${editing}`, { method: "PUT", body: JSON.stringify(form) });
      } else {
        await api("/api/teacher/announcements", { method: "POST", body: JSON.stringify(form) });
      }
      setEditing(null); setForm({ title: "", body: "", group_ids: [] });
      load();
    } catch (e) { alert(e.message); }
  };
  const del = async (id) => {
    if (!confirm("Удалить объявление?")) return;
    try {
      await api("/api/teacher/announcements/" + id, { method: "DELETE" });
      load();
    } catch (e) { alert(e.message); }
  };

  const toggleGroup = (id) => {
    setForm(f => ({
      ...f,
      group_ids: f.group_ids.includes(id)
        ? f.group_ids.filter(x => x !== id)
        : [...f.group_ids, id],
    }));
  };

  return (
    <div>
      <div className="card">
        <h3>{editing ? "Редактирование объявления" : "Новое объявление"}</h3>
        <input placeholder="Заголовок" value={form.title}
               onChange={e => setForm({ ...form, title: e.target.value })}
               style={{ width: "100%" }} />
        <textarea placeholder="Текст объявления" rows={4} value={form.body}
                  onChange={e => setForm({ ...form, body: e.target.value })}
                  style={{ width: "100%", marginTop: 6 }} />
        <div className="section-title">Кому отправить</div>
        <div className="chips">
          {groups.map(g => (
            <label key={g.id} className="chip" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={form.group_ids.includes(g.id)}
                     onChange={() => toggleGroup(g.id)} />
              {g.course_title} — {g.name}
            </label>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={save}>
            {editing ? "Сохранить" : "Опубликовать"}
          </button>
          {editing && <button className="btn ghost" onClick={() => { setEditing(null); setForm({ title: "", body: "", group_ids: [] }); }}>Отмена</button>}
          {!editing && <button className="btn ghost" onClick={startNew}>Очистить</button>}
        </div>
      </div>

      <div className="list">
        {loading && <div className="card muted">Загрузка объявлений…</div>}
        {err && (
          <div className="card" style={{ color: "#dc2626" }}>
            Не удалось загрузить объявления: {err}
          </div>
        )}
        {list.map(a => (
          <div className="card" key={a.id}>
            <div className="spread">
              <b>{a.title}</b>
              {a.is_mine ? (
                <div>
                  <button className="btn small" onClick={() => startEdit(a)}>Изм.</button>{" "}
                  <button className="btn danger small" onClick={() => del(a.id)}>Уд.</button>
                </div>
              ) : (
                <span className="tag">от {a.author || "системы"}</span>
              )}
            </div>
            <div className="muted small">
              {new Date(a.created_at).toLocaleString()}
              {a.updated_at !== a.created_at && " · изменено"}
            </div>
            <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{a.body}</div>
            <div className="chips" style={{ marginTop: 6 }}>
              {(a.groups || []).map(g => (
                <span key={g.id} className="tag">{g.course} — {g.name}</span>
              ))}
            </div>
          </div>
        ))}
        {!loading && !err && !list.length && <div className="card muted">Объявлений пока нет</div>}
      </div>
    </div>
  );
}

function TeacherMaterialsTab({ group, initialExtra, onExtraConsumed }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [chatMaterial, setChatMaterial] = useState(null);

  useEffect(() => {
    if (!group?.course_id) return;
    setLoading(true);
    setErr(null);
    api(`/api/teacher/course/${group.course_id}/extra-materials`)
      .then((res) => {
        setMaterials(res);
        setLoading(false);
      })
      .catch((e) => {
        setErr(e.message);
        setLoading(false);
      });
  }, [group?.course_id]);

  useEffect(() => {
    if (initialExtra && materials.length) {
      const found = materials.find((m) => m.id === initialExtra);
      if (found) setChatMaterial(found);
      if (onExtraConsumed) onExtraConsumed();
    }
  }, [initialExtra, materials]);

  if (!group) return <div className="card muted">Выберите группу</div>;

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="spread" style={{ alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>Дополнительные материалы курса «{group.course_title}»</h3>
            <div className="muted small">
              В дополнительных материалах нет тестов. Каждый материал содержит чат обсуждения, объединяющий учеников группы, куратора и администраторов.
            </div>
          </div>
          <span className="tag ok">Без тестов</span>
        </div>
      </div>

      {loading && <div className="card muted">Загрузка материалов...</div>}

      {err && (
        <div className="card" style={{ color: "#dc2626" }}>
          Не удалось загрузить материалы: {err}
        </div>
      )}

      {!loading && !err && !materials.length && (
        <div className="card muted">Для курса «{group.course_title}» ещё не добавлены дополнительные материалы.</div>
      )}

      <div className="list">
        {materials.map((m) => (
          <div className="card" key={m.id}>
            <div className="spread" style={{ alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <b>
                    {m.order_index}. {getIcon(m.type)} {m.title}
                  </b>
                  <span className="tag ok" style={{ fontSize: "0.75rem" }}>Без тестов</span>
                </div>
                {m.description && (
                  <div className="muted small" style={{ marginTop: 4 }}>
                    {m.description}
                  </div>
                )}
                {m.url && (
                  <div className="small" style={{ marginTop: 6 }}>
                    {m.url.startsWith("http") || m.url.startsWith("/uploads") || m.url.startsWith("/api/files") ? (
                      <a href={m.url} target="_blank" rel="noreferrer" className="muted">
                        🔗 {m.url}
                      </a>
                    ) : (
                      <span className="muted">📝 {m.url.slice(0, 80)}{m.url.length > 80 ? "..." : ""}</span>
                    )}
                  </div>
                )}
              </div>
              <div>
                <button
                  className="btn primary small"
                  onClick={() => setChatMaterial(m)}
                >
                  💬 Чат обсуждения
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {chatMaterial && (
        <Modal onClose={() => setChatMaterial(null)} innerStyle={{ maxWidth: 640 }}>
          <div className="spread" style={{ alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <b>Обсуждение: {chatMaterial.title}</b>
              <div className="muted small">
                Группа: {group.name} · Участвуют ученики группы, кураторы и администрация
              </div>
            </div>
            <button className="btn ghost" onClick={() => setChatMaterial(null)} aria-label="Закрыть чат">✕</button>
          </div>
          <ChatPanel extraMaterialId={chatMaterial.id} groupId={group?.id} apiBase="/api/teacher" />
        </Modal>
      )}
    </div>
  );
}

