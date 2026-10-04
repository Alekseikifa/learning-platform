import React, { useState, useMemo } from "react";
import { api, getUser } from "../api";

export const TILDA_ROLE_CONFIG = {
  student: { value: "student", label: "Ученик", icon: "👤", color: "#475569", bg: "#f1f5f9" },
  teacher: { value: "teacher", label: "Куратор", icon: "🎓", color: "#0891b2", bg: "#ecfeff" },
  manager: { value: "manager", label: "Методист", icon: "📋", color: "#7c3aed", bg: "#f5f3ff" },
  admin:   { value: "admin",   label: "Администратор", icon: "👑", color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
};

/**
 * Парсер CSV с поддержкой кавычек, переносов и экранирования (\N)
 */
function parseTildaCsv(text) {
  const lines = [];
  let cur = [];
  let inQuotes = false;
  let token = "";

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const nextCh = text[i + 1];

    if (ch === '"') {
      if (inQuotes && nextCh === '"') {
        token += '"';
        i++; // пропуск парной кавычки
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cur.push(token);
      token = "";
    } else if ((ch === "\r" || ch === "\n") && !inQuotes) {
      if (ch === "\r" && nextCh === "\n") i++;
      cur.push(token);
      if (cur.some((c) => c.trim().length > 0)) {
        lines.push(cur);
      }
      cur = [];
      token = "";
    } else {
      token += ch;
    }
  }
  if (token.length > 0 || cur.length > 0) {
    cur.push(token);
    if (cur.some((c) => c.trim().length > 0)) {
      lines.push(cur);
    }
  }

  // Проверка и маппинг колонок
  const cleanVal = (v) => {
    let s = (v || "").trim();
    if (s === "\\N" || s === "null" || s === "undefined") return "";
    return s;
  };

  const parsedRows = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const r = lines[idx];
    const email = cleanVal(r[0]);
    // Пропуск строки заголовков, если она есть
    if (idx === 0 && (email.toLowerCase() === "email" || email.toLowerCase() === "почта")) {
      continue;
    }
    if (!email || !email.includes("@")) continue;

    const name = cleanVal(r[1]);
    const phone = cleanVal(r[2]);
    const status = cleanVal(r[3]) || "Active";
    const regDate = cleanVal(r[4]);
    const lastLogin = cleanVal(r[5]);
    const rawGroups = cleanVal(r[6]);

    const groupsList = rawGroups
      ? rawGroups
          .split(",")
          .map((g) => g.trim())
          .filter((g) => g.length > 0 && g !== "\\N")
      : [];

    parsedRows.push({
      email,
      name,
      phone,
      status,
      registered_at: regDate,
      last_login_at: lastLogin,
      tilda_groups: groupsList.join(", "),
      groups_array: groupsList,
    });
  }

  return parsedRows;
}

export default function TildaImportModal({ allGroups = [], onClose, onSuccess }) {
  const currentUser = getUser();
  const isCurrentUserRoot = !!currentUser?.is_root_admin;

  const [rawText, setRawText] = useState("");
  const [parsedRows, setParsedRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [step, setStep] = useState(1); // 1: Загрузка, 2: Настройка маппинга и предпросмотр
  const [skipDisabled, setSkipDisabled] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [defaultRole, setDefaultRole] = useState("student");
  const [groupMappings, setGroupMappings] = useState({}); // { [tildaGroup]: { groupId: number | null, role: string } }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultStats, setResultStats] = useState(null);
  const [error, setError] = useState(null);

  // Извлечение всех уникальных групп из Tilda
  const uniqueTildaGroups = useMemo(() => {
    const set = new Set();
    for (const r of parsedRows) {
      for (const g of r.groups_array) {
        set.add(g);
      }
    }
    return Array.from(set).sort();
  }, [parsedRows]);

  // Умный подбор групп по умолчанию при парсинге
  const autoMapGroups = (groupsList) => {
    const map = {};
    for (const tg of groupsList) {
      const lower = tg.toLowerCase();
      let targetGroupId = "";
      let targetRole = "student";

      // Определение роли с поддержкой всех 4 ролей
      if (lower.includes("админ") || lower.includes("admin")) {
        // Назначать администратора может только главный администратор
        targetRole = isCurrentUserRoot ? "admin" : "teacher";
      } else if (lower.includes("методист") || lower.includes("метод") || lower.includes("manager")) {
        targetRole = "manager";
      } else if (lower.includes("команда мку") || lower.includes("преподавател") || lower.includes("учител") || lower.includes("куратор") || lower.includes("teacher")) {
        targetRole = "teacher";
      }

      // Определение курса/группы в нашей LMS
      for (const g of allGroups) {
        const cTitle = (g.course_title || "").toLowerCase();
        const gName = (g.name || "").toLowerCase();

        if (lower.includes("1 курс") || lower.includes("1курс")) {
          if (cTitle.includes("1 курс") || cTitle.includes("1-й курс")) targetGroupId = g.id;
        } else if (lower.includes("2 курс") || lower.includes("2-й курс")) {
          if (cTitle.includes("2 курс") || cTitle.includes("2-й курс")) targetGroupId = g.id;
        } else if (lower.includes("3 курс") || lower.includes("3-й курс")) {
          if (cTitle.includes("3 курс") || cTitle.includes("3-й курс")) targetGroupId = g.id;
        } else if (lower.includes("4 курс") || lower.includes("4-й курс")) {
          if (cTitle.includes("4 курс") || cTitle.includes("4-й курс")) targetGroupId = g.id;
        } else if (lower.includes("вводный")) {
          if (cTitle.includes("вводн")) targetGroupId = g.id;
        }

        // Если точное совпадение имени группы
        if (lower === gName) {
          targetGroupId = g.id;
          break;
        }
      }

      map[tg] = {
        groupId: targetGroupId || "",
        role: targetRole,
        skip: lower.includes("архив"), // архивные группы по умолчанию можно пропустить
      };
    }
    return map;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === "string") {
        setRawText(text);
        const rows = parseTildaCsv(text);
        setParsedRows(rows);
        setGroupMappings(autoMapGroups(Array.from(new Set(rows.flatMap((r) => r.groups_array)))));
        setStep(2);
      }
    };
    reader.readAsText(file, "utf-8");
  };

  const handleTextParse = () => {
    if (!rawText.trim()) {
      setError("Вставьте текст экспорта CSV из Tilda");
      return;
    }
    setError(null);
    const rows = parseTildaCsv(rawText);
    if (!rows.length) {
      setError("Не удалось обнаружить записи пользователей с Email в переданном тексте");
      return;
    }
    setParsedRows(rows);
    setGroupMappings(autoMapGroups(Array.from(new Set(rows.flatMap((r) => r.groups_array)))));
    setStep(2);
  };

  const updateMapping = (tildaGroup, field, val) => {
    // Безопасность: обычный администратор или методист не может назначить роль администратора
    if (field === "role" && val === "admin" && !isCurrentUserRoot) {
      setError("Только главный администратор может назначать роль администратора");
      return;
    }
    setGroupMappings((prev) => ({
      ...prev,
      [tildaGroup]: {
        ...(prev[tildaGroup] || { groupId: "", role: "student", skip: false }),
        [field]: val,
      },
    }));
  };

  // Расчёт ролей и групп для отдельной строки из Tilda
  const getRowComputedRoles = (row) => {
    const studentGroupIds = new Set();
    const curatorGroupIds = new Set();
    const assignedRoles = new Set();

    for (const tg of row.groups_array) {
      const mapping = groupMappings[tg];
      if (!mapping || mapping.skip) continue;

      if (mapping.role) {
        assignedRoles.add(mapping.role);
      }
      if (mapping.role === "teacher") {
        if (mapping.groupId) curatorGroupIds.add(Number(mapping.groupId));
      } else if (mapping.role === "student") {
        if (mapping.groupId) studentGroupIds.add(Number(mapping.groupId));
      } else {
        // manager или admin
        if (mapping.groupId) studentGroupIds.add(Number(mapping.groupId));
      }
    }

    let primaryRole = defaultRole;
    if (assignedRoles.size > 0) {
      // Иерархия основных ролей: admin > manager > teacher > student
      if (assignedRoles.has("admin")) primaryRole = "admin";
      else if (assignedRoles.has("manager")) primaryRole = "manager";
      else if (assignedRoles.has("teacher")) primaryRole = "teacher";
      else primaryRole = "student";
    }

    const extraRoles = Array.from(assignedRoles).filter((r) => r !== primaryRole);

    return {
      role: primaryRole,
      extra_roles: extraRoles.join(","),
      group_ids: Array.from(studentGroupIds),
      curator_group_ids: Array.from(curatorGroupIds),
    };
  };

  // Выполнение импорта
  const handleImportSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Преобразуем каждую строку в структуру приглашения с учётом маппинга
      const itemsToImport = [];

      for (const row of parsedRows) {
        if (skipDisabled && row.status.toLowerCase() === "disabled") {
          continue;
        }

        const comp = getRowComputedRoles(row);

        if ((comp.role === "admin" || comp.extra_roles.includes("admin")) && !isCurrentUserRoot) {
          setError("Только главный администратор может назначать роль администратора");
          setIsSubmitting(false);
          return;
        }

        itemsToImport.push({
          email: row.email,
          name: row.name,
          phone: row.phone,
          status: row.status,
          role: comp.role,
          extra_roles: comp.extra_roles,
          group_ids: comp.group_ids,
          curator_group_ids: comp.curator_group_ids,
          tilda_groups: row.tilda_groups,
          note: row.tilda_groups ? `Tilda: ${row.tilda_groups}` : "Импорт из Tilda",
        });
      }

      const res = await api("/api/admin/invites/import-tilda", {
        method: "POST",
        body: JSON.stringify({
          items: itemsToImport,
          update_existing: updateExisting,
          skip_disabled: skipDisabled,
        }),
      });

      setResultStats(res);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.message || "Ошибка при выполнении импорта");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 860, width: "95%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        <div className="spread" style={{ alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: "var(--navy)" }}>
            📥 Импорт пользователей из Tilda (CSV)
          </h3>
          <button type="button" className="btn ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && (
          <div className="card" style={{ color: "#dc2626", background: "#fef2f2", marginBottom: 12, padding: "8px 12px" }}>
            {error}
          </div>
        )}

        {/* Успешный результат */}
        {resultStats && (
          <div style={{ textAlign: "center", padding: "20px 10px" }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>🎉</div>
            <h3 style={{ color: "#166534", margin: "0 0 8px" }}>Импорт успешно завершён!</h3>
            <div className="card" style={{ maxWidth: 460, margin: "0 auto 16px", textAlign: "left", fontSize: 14 }}>
              <div>Всего обработано в файле: <b>{resultStats.total}</b></div>
              <div style={{ color: "#16a34a", marginTop: 4 }}>
                ✓ Создано новых приглашений: <b>{resultStats.created}</b>
              </div>
              {resultStats.updated > 0 && (
                <div style={{ color: "#d97706", marginTop: 4 }}>
                  ↻ Обновлено существующих: <b>{resultStats.updated}</b>
                </div>
              )}
              {resultStats.skipped > 0 && (
                <div style={{ color: "var(--text-soft)", marginTop: 4 }}>
                  — Пропущено (заблокированы или уже зарегистрированы): <b>{resultStats.skipped}</b>
                </div>
              )}
            </div>
            <p className="muted small" style={{ maxWidth: 520, margin: "0 auto 16px" }}>
              Теперь ученики могут перейти на страницу «Регистрация», ввести свой Email, указать действующий номер телефона и придумать пароль для входа.
            </p>
            <button type="button" className="btn primary" onClick={onClose}>
              Готово
            </button>
          </div>
        )}

        {!resultStats && (
          <div style={{ overflowY: "auto", flex: 1, paddingRight: 4 }}>
            {/* ШАГ 1: Загрузка файла */}
            {step === 1 && (
              <div>
                <div className="muted small" style={{ marginBottom: 12, lineHeight: 1.5 }}>
                  Выгрузите пользователей из Tilda (в формате CSV) и загрузите файл сюда. Система создаст приглашения по Email с привязкой к соответствующим курсам.
                </div>

                <div
                  style={{
                    border: "2px dashed var(--border)",
                    borderRadius: 12,
                    padding: "24px 16px",
                    textAlign: "center",
                    background: "var(--bg-soft)",
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 6 }}>📄</div>
                  <div style={{ fontWeight: 600, color: "var(--navy)", marginBottom: 4 }}>
                    Выберите файл выгрузки Tilda (.csv)
                  </div>
                  <div className="muted small" style={{ marginBottom: 12 }}>
                    Файл содержит email, имя, телефон и группы учеников
                  </div>
                  <label className="btn primary" style={{ cursor: "pointer", display: "inline-block" }}>
                    Выбрать CSV файл
                    <input
                      type="file"
                      accept=".csv,text/csv,text/plain"
                      onChange={handleFileUpload}
                      style={{ display: "none" }}
                    />
                  </label>
                  {fileName && (
                    <div style={{ marginTop: 8, fontSize: 13, color: "var(--navy)" }}>
                      Выбран: <b>{fileName}</b>
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Или вставьте текст CSV напрямую:
                  </label>
                  <textarea
                    rows={6}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder={'"ivanova@mail.ru","Анна Иванова","+79001234567","Active","...","1курс 26-27 онлайн"'}
                    style={{ width: "100%", fontSize: 12, fontFamily: "monospace", padding: 8 }}
                  />
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                    <button type="button" className="btn primary" onClick={handleTextParse}>
                      Распознать данные →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ШАГ 2: Настройка маппинга и предпросмотр */}
            {step === 2 && (
              <div>
                <div className="spread" style={{ alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <b>Распознано пользователей: {parsedRows.length}</b>
                    <span className="muted small" style={{ marginLeft: 8 }}>
                      (с телефонами: {parsedRows.filter((r) => r.phone).length}, активно:{" "}
                      {parsedRows.filter((r) => r.status.toLowerCase() === "active").length})
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      setStep(1);
                      setParsedRows([]);
                    }}
                  >
                    ← Выбрать другой файл
                  </button>
                </div>

                {/* Роль по умолчанию */}
                <div
                  className="card"
                  style={{
                    background: "var(--bg-soft)",
                    border: "1px solid var(--border)",
                    marginBottom: 14,
                    padding: "10px 14px",
                  }}
                >
                  <div className="spread" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--navy)" }}>
                        ⚙️ Роль по умолчанию:
                      </div>
                      <div className="muted small">
                        Назначается пользователям, у которых в Tilda нет групп или группа не сопоставлена
                      </div>
                    </div>
                    <div className="row" style={{ alignItems: "center", gap: 6 }}>
                      <select
                        value={defaultRole}
                        onChange={(e) => setDefaultRole(e.target.value)}
                        style={{ padding: "6px 12px", fontSize: 13, borderRadius: 6, fontWeight: 500 }}
                      >
                        <option value="student">👤 Ученик</option>
                        <option value="teacher">🎓 Куратор</option>
                        <option value="manager">📋 Методист</option>
                        {isCurrentUserRoot ? (
                          <option value="admin">👑 Администратор</option>
                        ) : (
                          <option value="admin" disabled title="Только главный администратор">
                            👑 Администратор (только главный админ)
                          </option>
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Настройка сопоставления групп */}
                <div
                  className="card"
                  style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", marginBottom: 14 }}
                >
                  <h4 style={{ margin: "0 0 6px", fontSize: 14, color: "var(--navy)" }}>
                    🔗 Сопоставление групп из Tilda с курсами платформы:
                  </h4>
                  <div className="muted small" style={{ marginBottom: 10 }}>
                    Укажите роль и группу в нашей LMS для каждой группы пользователей из Tilda:
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {uniqueTildaGroups.map((tg) => {
                      const m = groupMappings[tg] || { groupId: "", role: "student", skip: false };
                      return (
                        <div
                          key={tg}
                          className="spread"
                          style={{
                            alignItems: "center",
                            background: "var(--surface)",
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "1px solid var(--border)",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ minWidth: 200, flex: 1 }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: "var(--navy)" }}>
                              «{tg}»
                            </span>
                          </div>

                          <div className="row" style={{ alignItems: "center", gap: 6 }}>
                            <label style={{ fontSize: 12 }}>Роль:</label>
                            <select
                              value={m.role}
                              onChange={(e) => updateMapping(tg, "role", e.target.value)}
                              style={{ padding: "4px 8px", fontSize: 12, borderRadius: 6 }}
                            >
                              <option value="student">👤 Ученик</option>
                              <option value="teacher">🎓 Куратор</option>
                              <option value="manager">📋 Методист</option>
                              {isCurrentUserRoot ? (
                                <option value="admin">👑 Администратор</option>
                              ) : (
                                <option value="admin" disabled title="Только главный администратор">
                                  👑 Администратор (недоступно)
                                </option>
                              )}
                            </select>

                            <label style={{ fontSize: 12, marginLeft: 4 }}>Группа в LMS:</label>
                            <select
                              value={m.groupId}
                              onChange={(e) => updateMapping(tg, "groupId", e.target.value)}
                              disabled={m.skip}
                              style={{ padding: "4px 8px", fontSize: 12, minWidth: 160 }}
                            >
                              <option value="">(Не привязывать)</option>
                              {allGroups.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.course_title} · {g.name}
                                </option>
                              ))}
                            </select>

                            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", marginLeft: 6 }}>
                              <input
                                type="checkbox"
                                checked={m.skip}
                                onChange={(e) => updateMapping(tg, "skip", e.target.checked)}
                              />
                              <span className="muted">Пропустить</span>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Опции импорта */}
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={skipDisabled}
                      onChange={(e) => setSkipDisabled(e.target.checked)}
                    />
                    <span>Пропускать заблокированных (Disabled) пользователей</span>
                  </label>

                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={updateExisting}
                      onChange={(e) => setUpdateExisting(e.target.checked)}
                    />
                    <span>Обновлять данные приглашения при совпадении Email</span>
                  </label>
                </div>

                {/* Предпросмотр списка */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", marginBottom: 6 }}>
                    Предпросмотр первых 15 записей (с рассчитанной ролью):
                  </div>
                  <div className="table-wrap" style={{ maxHeight: 240, overflowY: "auto" }}>
                    <table className="table small">
                      <thead>
                        <tr>
                          <th>Email</th>
                          <th>ФИО</th>
                          <th>Телефон</th>
                          <th>Статус в Tilda</th>
                          <th>Группы в Tilda</th>
                          <th>Роль в LMS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedRows.slice(0, 15).map((r, i) => {
                          const comp = getRowComputedRoles(r);
                          const cfg = TILDA_ROLE_CONFIG[comp.role] || TILDA_ROLE_CONFIG.student;
                          return (
                            <tr key={i} style={{ opacity: skipDisabled && r.status.toLowerCase() === "disabled" ? 0.45 : 1 }}>
                              <td><b>{r.email}</b></td>
                              <td>{r.name || "—"}</td>
                              <td>{r.phone || <span className="muted">нет</span>}</td>
                              <td>
                                <span className={`tag small ${r.status.toLowerCase() === "active" ? "ok" : "no"}`}>
                                  {r.status}
                                </span>
                              </td>
                              <td className="muted small">{r.tilda_groups || "—"}</td>
                              <td>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    padding: "2px 8px",
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: cfg.bg,
                                    color: cfg.color,
                                    border: cfg.border ? `1px solid ${cfg.border}` : "1px solid rgba(0,0,0,0.08)",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  <span>{cfg.icon}</span>
                                  <span>{cfg.label}</span>
                                </span>
                                {comp.extra_roles && (
                                  <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>
                                    + {comp.extra_roles.split(",").map((er) => TILDA_ROLE_CONFIG[er]?.label || er).join(", ")}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {parsedRows.length > 15 && (
                    <div className="muted small" style={{ marginTop: 4 }}>
                      ... и ещё {parsedRows.length - 15} записей
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {!resultStats && step === 2 && (
          <div
            className="spread"
            style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border)", alignItems: "center" }}
          >
            <button type="button" className="btn ghost" onClick={onClose} disabled={isSubmitting}>
              Отмена
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={handleImportSubmit}
              disabled={isSubmitting || parsedRows.length === 0}
            >
              {isSubmitting ? "Импорт…" : `Импортировать ${parsedRows.length} приглашений`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
