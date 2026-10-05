import { useState, useEffect, useCallback } from "react";
import Modal from "./Modal";
import { api, getToken, getUser } from "../api";
import { addToast } from "../lib/toast";

export default function LogsModal({ isOpen, onClose, initialTab = "activity" }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  
  // Activity state
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [activityRole, setActivityRole] = useState("all");
  const [activityCategory, setActivityCategory] = useState("all");
  const [activityCategories, setActivityCategories] = useState([]);
  const [activitySearch, setActivitySearch] = useState("");
  const [activitySearchInput, setActivitySearchInput] = useState("");
  const [activityPeriod, setActivityPeriod] = useState("all");
  const [activityLoading, setActivityLoading] = useState(false);

  // System state
  const [systemLogs, setSystemLogs] = useState([]);
  const [systemTotal, setSystemTotal] = useState(0);
  const [systemPage, setSystemPage] = useState(1);
  const [systemLevel, setSystemLevel] = useState("all");
  const [systemSource, setSystemSource] = useState("all");
  const [systemSources, setSystemSources] = useState([]);
  const [systemSearch, setSystemSearch] = useState("");
  const [systemSearchInput, setSystemSearchInput] = useState("");
  const [systemPeriod, setSystemPeriod] = useState("all");
  const [systemLoading, setSystemLoading] = useState(false);

  // Detailed inspect modal
  const [inspectItem, setInspectItem] = useState(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);

  const limit = 30;
  const isRoot = Boolean(getUser()?.is_root_admin);

  // Calculate from_date based on period filter
  const getFromDate = (period) => {
    if (period === "all") return "";
    const d = new Date();
    if (period === "today") {
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    if (period === "3days") {
      d.setDate(d.getDate() - 3);
      return d.toISOString();
    }
    if (period === "7days") {
      d.setDate(d.getDate() - 7);
      return d.toISOString();
    }
    if (period === "30days") {
      d.setDate(d.getDate() - 30);
      return d.toISOString();
    }
    return "";
  };

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(activityPage));
      params.set("limit", String(limit));
      if (activityRole !== "all") params.set("role", activityRole);
      if (activityCategory !== "all") params.set("category", activityCategory);
      if (activitySearch) params.set("search", activitySearch);
      const from = getFromDate(activityPeriod);
      if (from) params.set("from_date", from);

      const res = await api(`/api/admin/activity-logs?${params.toString()}`);
      setActivityLogs(res.logs || []);
      setActivityTotal(res.total || 0);
      if (res.categories) setActivityCategories(res.categories);
    } catch (err) {
      addToast("Ошибка загрузки журнала аудита: " + (err.message || err), "error");
    } finally {
      setActivityLoading(false);
    }
  }, [activityPage, activityRole, activityCategory, activitySearch, activityPeriod]);

  const loadSystem = useCallback(async () => {
    setSystemLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(systemPage));
      params.set("limit", String(limit));
      if (systemLevel !== "all") params.set("level", systemLevel);
      if (systemSource !== "all") params.set("source", systemSource);
      if (systemSearch) params.set("search", systemSearch);
      const from = getFromDate(systemPeriod);
      if (from) params.set("from_date", from);

      const res = await api(`/api/admin/system-logs?${params.toString()}`);
      setSystemLogs(res.logs || []);
      setSystemTotal(res.total || 0);
      if (res.sources) setSystemSources(res.sources);
    } catch (err) {
      addToast("Ошибка загрузки системного журнала: " + (err.message || err), "error");
    } finally {
      setSystemLoading(false);
    }
  }, [systemPage, systemLevel, systemSource, systemSearch, systemPeriod]);

  useEffect(() => {
    if (isOpen) {
      if (activeTab === "activity") {
        loadActivity();
      } else {
        loadSystem();
      }
    }
  }, [isOpen, activeTab, loadActivity, loadSystem]);

  if (!isOpen) return null;

  const handleDownloadCsv = async (type) => {
    try {
      const token = getToken();
      const res = await fetch(`/api/admin/logs/export.csv?type=${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Не удалось скачать выгрузку");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type === "activity" ? "audit-activity-logs" : "system-logs"}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      addToast("Файл CSV успешно сформирован и скачан", "success");
    } catch (err) {
      addToast("Ошибка выгрузки: " + (err.message || err), "error");
    }
  };

  const handleClear = async () => {
    setClearBusy(true);
    try {
      await api("/api/admin/logs/clear", {
        method: "DELETE",
        body: JSON.stringify({ type: activeTab }),
      });
      addToast(`Журнал (${activeTab === "activity" ? "деятельности" : "системный"}) очищен`, "success");
      setConfirmClearOpen(false);
      if (activeTab === "activity") {
        setActivityPage(1);
        loadActivity();
      } else {
        setSystemPage(1);
        loadSystem();
      }
    } catch (err) {
      addToast("Ошибка очистки: " + (err.message || err), "error");
    } finally {
      setClearBusy(false);
    }
  };

  const formatDateTime = (iso) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const activityTotalPages = Math.ceil(activityTotal / limit) || 1;
  const systemTotalPages = Math.ceil(systemTotal / limit) || 1;

  return (
    <Modal
      onClose={onClose}
      innerStyle={{
        maxWidth: 1100,
        width: "95vw",
        maxHeight: "92vh",
        display: "flex",
        flexDirection: "column",
        padding: 0,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          background: "linear-gradient(180deg, #162f52 0%, #1e3a5f 100%)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "2px solid #c9a961",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>📋</span>
          <div>
            <h3 style={{ margin: 0, color: "#fff", fontSize: 18, fontWeight: 600 }}>
              Журналы аудита и безопасности
            </h3>
            <div style={{ fontSize: 12, color: "#cbd5e1" }}>
              Контроль действий методистов, администраторов и системных событий
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="btn"
          style={{
            background: "transparent",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.25)",
            padding: "4px 10px",
            fontSize: 16,
            lineHeight: 1,
            cursor: "pointer",
          }}
          title="Закрыть"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #e2e8f0",
          background: "#f8fafc",
          padding: "0 20px",
        }}
      >
        <button
          onClick={() => {
            setActiveTab("activity");
            setInspectItem(null);
          }}
          style={{
            padding: "12px 18px",
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "activity" ? "3px solid #1e3a5f" : "3px solid transparent",
            color: activeTab === "activity" ? "#1e3a5f" : "#64748b",
            fontWeight: activeTab === "activity" ? 700 : 500,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 14,
          }}
        >
          <span>👤 Журнал действий администрации</span>
          <span
            style={{
              fontSize: 11,
              background: activeTab === "activity" ? "#e0e7ff" : "#e2e8f0",
              color: activeTab === "activity" ? "#1e3a8a" : "#475569",
              padding: "2px 7px",
              borderRadius: 12,
              fontWeight: 600,
            }}
          >
            {activityTotal}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab("system");
            setInspectItem(null);
          }}
          style={{
            padding: "12px 18px",
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "system" ? "3px solid #1e3a5f" : "3px solid transparent",
            color: activeTab === "system" ? "#1e3a5f" : "#64748b",
            fontWeight: activeTab === "system" ? 700 : 500,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 14,
          }}
        >
          <span>⚙️ Системный журнал логов</span>
          <span
            style={{
              fontSize: 11,
              background: activeTab === "system" ? "#fee2e2" : "#e2e8f0",
              color: activeTab === "system" ? "#991b1b" : "#475569",
              padding: "2px 7px",
              borderRadius: 12,
              fontWeight: 600,
            }}
          >
            {systemTotal}
          </span>
        </button>
      </div>

      {/* Body content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {activeTab === "activity" ? (
          <>
            {/* Activity Filters Toolbar */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                justifyContent: "space-between",
                background: "#f1f5f9",
                padding: "10px 12px",
                borderRadius: 8,
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", flex: 1 }}>
                {/* Search */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setActivityPage(1);
                    setActivitySearch(activitySearchInput);
                  }}
                  style={{ display: "flex", gap: 4, minWidth: 200, flex: 1, maxWidth: 300 }}
                >
                  <input
                    type="text"
                    placeholder="Поиск по действиям, ФИО, IP..."
                    value={activitySearchInput}
                    onChange={(e) => setActivitySearchInput(e.target.value)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid #cbd5e1",
                      width: "100%",
                      fontSize: 13,
                    }}
                  />
                  {activitySearch && (
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => {
                        setActivitySearch("");
                        setActivitySearchInput("");
                        setActivityPage(1);
                      }}
                      style={{ padding: "0 8px" }}
                      title="Сбросить поиск"
                    >
                      ✕
                    </button>
                  )}
                  <button type="submit" className="btn small primary" style={{ whiteSpace: "nowrap" }}>
                    Найти
                  </button>
                </form>

                {/* Role select */}
                <select
                  value={activityRole}
                  onChange={(e) => {
                    setActivityRole(e.target.value);
                    setActivityPage(1);
                  }}
                  style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
                >
                  <option value="all">Все роли</option>
                  <option value="admin">Только Администраторы</option>
                  <option value="manager">Только Методисты</option>
                </select>

                {/* Category select */}
                <select
                  value={activityCategory}
                  onChange={(e) => {
                    setActivityCategory(e.target.value);
                    setActivityPage(1);
                  }}
                  style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
                >
                  <option value="all">Все категории</option>
                  {activityCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {/* Period select */}
                <select
                  value={activityPeriod}
                  onChange={(e) => {
                    setActivityPeriod(e.target.value);
                    setActivityPage(1);
                  }}
                  style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
                >
                  <option value="all">За всё время</option>
                  <option value="today">За сегодня</option>
                  <option value="3days">За 3 дня</option>
                  <option value="7days">За неделю</option>
                  <option value="30days">За месяц</option>
                </select>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  type="button"
                  className="btn small"
                  onClick={loadActivity}
                  disabled={activityLoading}
                  title="Обновить список"
                >
                  🔄 {activityLoading ? "…" : "Обновить"}
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => handleDownloadCsv("activity")}
                  style={{ background: "#1e3a8a", color: "#fff", fontWeight: 600 }}
                  title="Экспорт в CSV"
                >
                  📥 Экспорт CSV
                </button>
                {isRoot && (
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => setConfirmClearOpen(true)}
                    style={{ background: "#fee2e2", color: "#991b1b", borderColor: "#fca5a5" }}
                    title="Очистить журнал (только Главный админ)"
                  >
                    🗑 Очистить
                  </button>
                )}
              </div>
            </div>

            {/* Activity Table */}
            <div style={{ flex: 1, overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #cbd5e1", textAlign: "left" }}>
                    <th style={{ padding: "8px 10px", width: 140 }}>Дата и время</th>
                    <th style={{ padding: "8px 10px", width: 150 }}>Сотрудник</th>
                    <th style={{ padding: "8px 10px", width: 120 }}>Категория</th>
                    <th style={{ padding: "8px 10px", width: 180 }}>Объект</th>
                    <th style={{ padding: "8px 10px" }}>Описание действия</th>
                    <th style={{ padding: "8px 10px", width: 100 }}>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {activityLoading ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
                        ⏳ Загрузка записей журнала…
                      </td>
                    </tr>
                  ) : activityLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
                        Записей не найдено. Действия методистов и администраторов появятся здесь при работе с платформой.
                      </td>
                    </tr>
                  ) : (
                    activityLogs.map((log) => {
                      const isManager = log.user_role === "manager";
                      return (
                        <tr
                          key={log.id}
                          onClick={() => setInspectItem(log)}
                          style={{
                            borderBottom: "1px solid #f1f5f9",
                            cursor: "pointer",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "#475569", fontSize: 12 }}>
                            {formatDateTime(log.timestamp)}
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: isManager ? "#ccfbf1" : "#dbeafe",
                                  color: isManager ? "#0f766e" : "#1d4ed8",
                                }}
                              >
                                {isManager ? "Методист" : "Администратор"}
                              </span>
                              <span style={{ fontWeight: 600 }}>{log.user_name}</span>
                            </div>
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <span
                              style={{
                                background: "#f1f5f9",
                                color: "#334155",
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 500,
                              }}
                            >
                              {log.category}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "8px 10px",
                              fontWeight: 600,
                              color: "#0f172a",
                              maxWidth: 180,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={log.target_title}
                          >
                            {log.target_title || "—"}
                          </td>
                          <td
                            style={{
                              padding: "8px 10px",
                              color: "#334155",
                              maxWidth: 320,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={log.details}
                          >
                            {log.details}
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>
                            {log.ip || "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Activity Pagination */}
            {activityTotal > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  fontSize: 13,
                  color: "#64748b",
                }}
              >
                <div>
                  Показано {activityLogs.length} из {activityTotal} записей (Страница {activityPage} из {activityTotalPages})
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn small"
                    disabled={activityPage <= 1}
                    onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                  >
                    ◀ Назад
                  </button>
                  <button
                    className="btn small"
                    disabled={activityPage >= activityTotalPages}
                    onClick={() => setActivityPage((p) => p + 1)}
                  >
                    Вперёд ▶
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* System Logs Toolbar */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                justifyContent: "space-between",
                background: "#f1f5f9",
                padding: "10px 12px",
                borderRadius: 8,
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", flex: 1 }}>
                {/* Search */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSystemPage(1);
                    setSystemSearch(systemSearchInput);
                  }}
                  style={{ display: "flex", gap: 4, minWidth: 200, flex: 1, maxWidth: 300 }}
                >
                  <input
                    type="text"
                    placeholder="Поиск по тексту ошибки, сообщению..."
                    value={systemSearchInput}
                    onChange={(e) => setSystemSearchInput(e.target.value)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid #cbd5e1",
                      width: "100%",
                      fontSize: 13,
                    }}
                  />
                  {systemSearch && (
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => {
                        setSystemSearch("");
                        setSystemSearchInput("");
                        setSystemPage(1);
                      }}
                      style={{ padding: "0 8px" }}
                      title="Сбросить поиск"
                    >
                      ✕
                    </button>
                  )}
                  <button type="submit" className="btn small primary" style={{ whiteSpace: "nowrap" }}>
                    Найти
                  </button>
                </form>

                {/* Level select */}
                <select
                  value={systemLevel}
                  onChange={(e) => {
                    setSystemLevel(e.target.value);
                    setSystemPage(1);
                  }}
                  style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
                >
                  <option value="all">Все уровни</option>
                  <option value="ERROR">🛑 Только Ошибки (ERROR)</option>
                  <option value="WARN">⚠️ Только Предупреждения (WARN)</option>
                  <option value="INFO">ℹ️ Только Инфо (INFO)</option>
                </select>

                {/* Source select */}
                <select
                  value={systemSource}
                  onChange={(e) => {
                    setSystemSource(e.target.value);
                    setSystemPage(1);
                  }}
                  style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
                >
                  <option value="all">Все источники</option>
                  {systemSources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                {/* Period select */}
                <select
                  value={systemPeriod}
                  onChange={(e) => {
                    setSystemPeriod(e.target.value);
                    setSystemPage(1);
                  }}
                  style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
                >
                  <option value="all">За всё время</option>
                  <option value="today">За сегодня</option>
                  <option value="3days">За 3 дня</option>
                  <option value="7days">За неделю</option>
                  <option value="30days">За месяц</option>
                </select>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  type="button"
                  className="btn small"
                  onClick={loadSystem}
                  disabled={systemLoading}
                  title="Обновить список"
                >
                  🔄 {systemLoading ? "…" : "Обновить"}
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => handleDownloadCsv("system")}
                  style={{ background: "#1e3a8a", color: "#fff", fontWeight: 600 }}
                  title="Экспорт в CSV"
                >
                  📥 Экспорт CSV
                </button>
                {isRoot && (
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => setConfirmClearOpen(true)}
                    style={{ background: "#fee2e2", color: "#991b1b", borderColor: "#fca5a5" }}
                    title="Очистить журнал (только Главный админ)"
                  >
                    🗑 Очистить
                  </button>
                )}
              </div>
            </div>

            {/* System Table */}
            <div style={{ flex: 1, overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #cbd5e1", textAlign: "left" }}>
                    <th style={{ padding: "8px 10px", width: 140 }}>Дата и время</th>
                    <th style={{ padding: "8px 10px", width: 90 }}>Уровень</th>
                    <th style={{ padding: "8px 10px", width: 90 }}>Источник</th>
                    <th style={{ padding: "8px 10px" }}>Сообщение системы</th>
                    <th style={{ padding: "8px 10px", width: 100 }}>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {systemLoading ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
                        ⏳ Загрузка системных логов…
                      </td>
                    </tr>
                  ) : systemLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
                        Системных логов пока нет.
                      </td>
                    </tr>
                  ) : (
                    systemLogs.map((log) => {
                      const isErr = log.level === "ERROR";
                      const isWarn = log.level === "WARN";
                      return (
                        <tr
                          key={log.id}
                          onClick={() => setInspectItem(log)}
                          style={{
                            borderBottom: "1px solid #f1f5f9",
                            cursor: "pointer",
                            background: isErr ? "#fef2f2" : isWarn ? "#fffbeb" : "transparent",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={(e) => {
                            if (!isErr && !isWarn) e.currentTarget.style.background = "#f8fafc";
                          }}
                          onMouseLeave={(e) => {
                            if (!isErr && !isWarn) e.currentTarget.style.background = "transparent";
                          }}
                        >
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "#475569", fontSize: 12 }}>
                            {formatDateTime(log.timestamp)}
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: isErr ? "#fee2e2" : isWarn ? "#fef3c7" : "#e0e7ff",
                                color: isErr ? "#b91c1c" : isWarn ? "#b45309" : "#1e40af",
                              }}
                            >
                              {log.level}
                            </span>
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <span
                              style={{
                                background: "#e2e8f0",
                                color: "#334155",
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              {log.source}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "8px 10px",
                              color: isErr ? "#991b1b" : isWarn ? "#92400e" : "#1e293b",
                              fontWeight: isErr ? 600 : 400,
                              maxWidth: 450,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={log.message}
                          >
                            {log.message}
                            {log.details && (
                              <span style={{ fontSize: 11, color: "#64748b", marginLeft: 6 }}>
                                (нажмите для деталей)
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>
                            {log.ip || "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* System Pagination */}
            {systemTotal > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  fontSize: 13,
                  color: "#64748b",
                }}
              >
                <div>
                  Показано {systemLogs.length} из {systemTotal} записей (Страница {systemPage} из {systemTotalPages})
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn small"
                    disabled={systemPage <= 1}
                    onClick={() => setSystemPage((p) => Math.max(1, p - 1))}
                  >
                    ◀ Назад
                  </button>
                  <button
                    className="btn small"
                    disabled={systemPage >= systemTotalPages}
                    onClick={() => setSystemPage((p) => p + 1)}
                  >
                    Вперёд ▶
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Inspect Item Modal */}
      {inspectItem && (
        <Modal onClose={() => setInspectItem(null)} innerStyle={{ maxWidth: 650, width: "90vw" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 17 }}>
              {inspectItem.level ? "🔍 Детали системного события" : "🔍 Детали действия пользователя"}
            </h3>
            <button className="btn small" onClick={() => setInspectItem(null)}>
              ✕
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
            <div>
              <b className="muted">Дата и время:</b> {formatDateTime(inspectItem.timestamp)}
            </div>

            {inspectItem.user_name && (
              <div>
                <b className="muted">Сотрудник:</b> {inspectItem.user_name} ({inspectItem.user_role === "manager" ? "Методист" : "Администратор"})
              </div>
            )}

            {inspectItem.category && (
              <div>
                <b className="muted">Категория:</b> {inspectItem.category}
              </div>
            )}

            {inspectItem.target_title && (
              <div>
                <b className="muted">Объект:</b> {inspectItem.target_title}
              </div>
            )}

            {inspectItem.level && (
              <div>
                <b className="muted">Уровень:</b>{" "}
                <span
                  style={{
                    fontWeight: 700,
                    color: inspectItem.level === "ERROR" ? "#b91c1c" : inspectItem.level === "WARN" ? "#b45309" : "#1e40af",
                  }}
                >
                  {inspectItem.level}
                </span>{" "}
                · <b className="muted">Источник:</b> {inspectItem.source}
              </div>
            )}

            {inspectItem.ip && (
              <div>
                <b className="muted">IP-адрес:</b> <code>{inspectItem.ip}</code>
              </div>
            )}

            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
              <b className="muted">{inspectItem.level ? "Сообщение:" : "Подробности:"}</b>
              <div
                style={{
                  marginTop: 4,
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  padding: "8px 10px",
                  borderRadius: 6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "inherit",
                }}
              >
                {inspectItem.message || inspectItem.details || "—"}
              </div>
            </div>

            {inspectItem.details && inspectItem.message && (
              <div>
                <b className="muted">Технические подробности / Стек:</b>
                <pre
                  style={{
                    marginTop: 4,
                    background: "#0f172a",
                    color: "#f8fafc",
                    padding: "8px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    maxHeight: 180,
                    overflowY: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {inspectItem.details}
                </pre>
              </div>
            )}
          </div>

          <div style={{ marginTop: 14, textAlign: "right" }}>
            <button className="btn primary small" onClick={() => setInspectItem(null)}>
              Закрыть
            </button>
          </div>
        </Modal>
      )}

      {/* Confirm Clear Modal */}
      {confirmClearOpen && (
        <Modal onClose={() => setConfirmClearOpen(false)} innerStyle={{ maxWidth: 450, width: "90vw" }}>
          <h3 style={{ margin: "0 0 8px", color: "#991b1b" }}>⚠️ Подтвердите очистку</h3>
          <div style={{ fontSize: 14, color: "#334155" }}>
            Вы действительно хотите очистить <b>{activeTab === "activity" ? "журнал действий администрации" : "системный журнал логов"}</b>?
            Это действие необратимо.
          </div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn" disabled={clearBusy} onClick={() => setConfirmClearOpen(false)}>
              Отмена
            </button>
            <button
              className="btn"
              disabled={clearBusy}
              onClick={handleClear}
              style={{ background: "#b91c1c", color: "#fff", fontWeight: 600 }}
            >
              {clearBusy ? "⏳ Очищаем…" : "Да, очистить"}
            </button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
