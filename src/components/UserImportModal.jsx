import { useState } from "react";
import { api } from "../api";
import Modal from "./Modal";
import { readFileAsText, parseCsv, toCsv, downloadText, describeDelimiter } from "../lib/csv";

const FIELDS = [
  { key: "name", label: "ФИО", required: true, aliases: ["name", "фио", "имя", "полное имя", "full name", "fullname", "фамилия имя отчество", "пользователь"] },
  { key: "username", label: "Логин", aliases: ["username", "login", "логин", "user name", "email", "e-mail", "почта", "эл. почта", "адрес эл. почты", "id"] },
  { key: "phone", label: "Телефон", aliases: ["phone", "телефон", "mobile", "мобильный", "tel", "телефонный номер", "номер телефона"] },
  { key: "role", label: "Роль", required: true, aliases: ["role", "роль", "роли", "roles", "тип"] },
  { key: "extra_roles", label: "Доп. роли", aliases: ["extra_roles", "доп. роли", "дополнительные роли", "additional roles"] },
  { key: "password", label: "Пароль", aliases: ["password", "пароль", "pass"] },
  { key: "groups", label: "Группы", aliases: ["groups", "group", "группы", "группа", "класс"] },
  { key: "curator_groups", label: "Кураторские группы", aliases: ["curator_groups", "кураторские группы", "кураторство", "curator groups", "куратор"] },
  { key: "is_active", label: "Активен", aliases: ["is_active", "active", "активен", "доступ", "статус", "status"] },
];

const normHeader = (s) =>
  String(s || "").trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");

function autoMap(headers) {
  const mapping = {};
  const used = new Set();
  for (const f of FIELDS) {
    for (const h of headers) {
      if (used.has(h)) continue;
      const nh = normHeader(h);
      if (nh === f.key || f.aliases.includes(nh)) {
        mapping[f.key] = h;
        used.add(h);
        break;
      }
    }
    if (!mapping[f.key]) mapping[f.key] = "";
  }
  return mapping;
}

const STATUS_LABEL = { ok: "создать", skip: "пропустить", error: "ошибка" };
const STATUS_COLOR = { ok: "#16a34a", skip: "#a16207", error: "#dc2626" };

export default function UserImportModal({ onClose }) {
  const [step, setStep] = useState(1);
  const [fileInfo, setFileInfo] = useState(null);
  const [mapping, setMapping] = useState({});
  const [defaultPassword, setDefaultPassword] = useState("");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const mappingProblem =
    !fileInfo
      ? null
      : !mapping.name
      ? "Сопоставьте колонку файла с полем «ФИО»"
      : !mapping.role
      ? "Сопоставьте колонку файла с полем «Роль»"
      : !mapping.username && !mapping.phone
      ? "Сопоставьте хотя бы «Логин» или «Телефон»"
      : null;

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    try {
      const text = await readFileAsText(file);
      const parsed = parseCsv(text);
      if (!parsed.headers.length || !parsed.rows.length) {
        setErr("Файл пуст или не содержит строк данных (первая строка должна быть заголовками)");
        return;
      }
      setFileInfo({
        name: file.name,
        headers: parsed.headers,
        rows: parsed.rows,
        delimiter: parsed.delimiter,
      });
      setMapping(autoMap(parsed.headers));
      setStep(2);
    } catch (e2) {
      setErr("Не удалось прочитать файл: " + (e2.message || e2));
    } finally {
      e.target.value = "";
    }
  };

  const buildRows = () => {
    const idx = {};
    for (const f of FIELDS) {
      const h = mapping[f.key];
      idx[f.key] = h ? fileInfo.headers.indexOf(h) : -1;
    }
    const val = (r, key) => (idx[key] >= 0 ? r[idx[key]] ?? "" : "");
    return fileInfo.rows.map((r) => ({
      name: val(r, "name"),
      username: val(r, "username"),
      phone: val(r, "phone"),
      role: val(r, "role"),
      extra_roles: val(r, "extra_roles"),
      password: val(r, "password"),
      groups: String(val(r, "groups") || "")
        .split(/[|;]/)
        .map((s) => s.trim())
        .filter(Boolean),
      curator_groups: String(val(r, "curator_groups") || "")
        .split(/[|;]/)
        .map((s) => s.trim())
        .filter(Boolean),
      is_active: val(r, "is_active"),
    }));
  };

  const runPreview = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api("/api/admin/users/import", {
        method: "POST",
        body: JSON.stringify({ dry_run: true, rows: buildRows(), options: { default_password: defaultPassword } }),
      });
      setPreview(res);
      setStep(3);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api("/api/admin/users/import", {
        method: "POST",
        body: JSON.stringify({ dry_run: false, rows: buildRows(), options: { default_password: defaultPassword } }),
      });
      setResult(res);
      setStep(4);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadReport = () => {
    const rows = result.rows.map((r) => [STATUS_LABEL[r.status], r.username, r.name, r.password || "", r.detail]);
    downloadText(`import-result-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(["status", "username", "name", "password", "detail"], rows));
  };

  const summary = step === 4 ? result?.summary : preview?.summary;
  const reportRows = (step === 4 ? result?.rows : preview?.rows) || [];

  return (
    <Modal
      onClose={() => !busy && onClose()}
      dismissible={!busy}
      backdropClassName="modal-overlay"
      backdropStyle={overlayStyle}
      innerClassName="card modal-content"
      innerStyle={modalContentStyle}
    >
      <div className="spread" style={{ alignItems: "center", marginBottom: 12, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
        <h3 style={{ margin: 0 }}>⬆ Импорт пользователей из CSV</h3>
        <button type="button" className="btn ghost small" onClick={onClose} disabled={busy}>✕</button>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[1, 2, 3, 4].map((n) => {
          const labels = { 1: "Файл", 2: "Поля", 3: "Проверка", 4: "Готово" };
          const active = step === n;
          const done = step > n;
          return (
            <span
              key={n}
              className="small"
              style={{
                padding: "3px 10px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: active ? "#1e3a8a" : done ? "#eef2ff" : "var(--bg-soft)",
                color: active ? "#fff" : done ? "#1e3a8a" : "var(--muted, #64748b)",
                fontWeight: active ? 600 : 400,
              }}
            >
              {n}. {labels[n]}
            </span>
          );
        })}
      </div>

      {err && <div style={{ color: "#dc2626", marginBottom: 10 }}>{err}</div>}

      {/* Шаг 1 — файл */}
      {step === 1 && (
        <div>
          <div className="small muted" style={{ marginBottom: 12 }}>
            Выберите CSV-файл (например, «Скачать как CSV» из Google Таблиц, Excel, Moodle или экспорта с другой платформы).
            Кодировка (UTF-8 / Windows-1251) и разделитель (; , таб) определяются автоматически. Первая строка файла — заголовки колонок.
          </div>
          <label className="btn">
            Выбрать файл…
            <input type="file" hidden accept=".csv,text/csv,text/plain" onChange={onFile} />
          </label>
          {fileInfo && (
            <div className="small" style={{ marginTop: 10 }}>
              {fileInfo.name}: {fileInfo.rows.length} строк, {fileInfo.headers.length} колонок, разделитель «{describeDelimiter(fileInfo.delimiter)}»
            </div>
          )}
        </div>
      )}

      {/* Шаг 2 — сопоставление полей */}
      {step === 2 && fileInfo && (
        <div>
          <div className="small muted" style={{ marginBottom: 10 }}>
            Файл: <b>{fileInfo.name}</b> — {fileInfo.rows.length} строк, {fileInfo.headers.length} колонок.
            Сопоставьте колонки файла с полями платформы. Предзаполненные значения (по заголовкам) можно менять.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {FIELDS.map((f) => (
              <div key={f.key} className="row" style={{ gap: 10, alignItems: "center" }}>
                <div style={{ width: 190, flexShrink: 0, fontWeight: 600, fontSize: 13 }}>
                  {f.label}
                  {f.required && <span style={{ color: "#dc2626" }}> *</span>}
                </div>
                <select
                  style={{ flex: 1 }}
                  value={mapping[f.key] || ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                >
                  <option value="">— не импортировать —</option>
                  {fileInfo.headers.map((h, hi) => (
                    <option key={hi} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <label className="small" style={{ display: "block", marginBottom: 6 }}>
            Пароль по умолчанию (если колонка «Пароль» не заполнена/не сопоставлена)
            <input
              type="text"
              value={defaultPassword}
              onChange={(e) => setDefaultPassword(e.target.value)}
              placeholder="оставьте пустым — пароли будут сгенерированы"
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <div className="small muted" style={{ marginBottom: 10 }}>
            Сгенерированные пароли попадут в итоговый отчёт после импорта (кнопка «Скачать отчёт CSV»).
            Роль можно указывать как код (student/teacher/manager), так и словом (ученик, куратор, методист).
          </div>

          {mappingProblem && <div style={{ color: "#b45309", marginBottom: 8 }}>⚠ {mappingProblem}</div>}

          <div className="spread" style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
            <button className="btn ghost" onClick={() => setStep(1)} disabled={busy}>← Назад</button>
            <button className="btn primary" onClick={runPreview} disabled={busy || !!mappingProblem}>
              {busy ? "Проверка…" : "Далее → Проверка"}
            </button>
          </div>
        </div>
      )}

      {/* Шаг 3 — предпросмотр */}
      {step === 3 && preview && (
        <div>
          <div className="row" style={{ gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
            <span><b style={{ color: "#16a34a" }}>{preview.summary.created}</b> <span className="small muted">будет создано</span></span>
            <span><b style={{ color: "#a16207" }}>{preview.summary.skipped}</b> <span className="small muted">пропущено (уже есть)</span></span>
            <span><b style={{ color: "#dc2626" }}>{preview.summary.errors}</b> <span className="small muted">ошибок</span></span>
            <span><b>{preview.summary.warnings}</b> <span className="small muted">предупреждений</span></span>
          </div>

          <div className="table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
            <table className="table">
              <thead>
                <tr><th style={{ width: 36 }}>№</th><th style={{ width: 110 }}>Действие</th><th>ФИО</th><th>Логин</th><th>Детали</th></tr>
              </thead>
              <tbody>
                {reportRows.slice(0, 100).map((r) => (
                  <tr key={r.index}>
                    <td>{r.index + 1}</td>
                    <td>
                      <span className="small" style={{ color: STATUS_COLOR[r.status], fontWeight: 600 }}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td>{r.name}</td>
                    <td>{r.username}</td>
                    <td className="small muted">{r.detail}</td>
                  </tr>
                ))}
                {reportRows.length > 100 && (
                  <tr><td colSpan={5} className="small muted">… и ещё {reportRows.length - 100} строк</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="spread" style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
            <button className="btn ghost" onClick={() => setStep(2)} disabled={busy}>← Назад</button>
            <button
              className="btn primary"
              onClick={commit}
              disabled={busy || preview.summary.created === 0}
            >
              {busy ? "Импорт…" : `⬇ Импортировать (${preview.summary.created})`}
            </button>
          </div>
        </div>
      )}

      {/* Шаг 4 — результат */}
      {step === 4 && result && (
        <div>
          <div className="row" style={{ gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
            <span><b style={{ color: "#16a34a" }}>{result.summary.created}</b> <span className="small muted">создано</span></span>
            <span><b style={{ color: "#a16207" }}>{result.summary.skipped}</b> <span className="small muted">пропущено</span></span>
            <span><b style={{ color: "#dc2626" }}>{result.summary.errors}</b> <span className="small muted">ошибок</span></span>
            <span><b>{result.summary.warnings}</b> <span className="small muted">предупреждений</span></span>
          </div>

          <div className="table-wrap" style={{ maxHeight: 320, overflowY: "auto", marginBottom: 10 }}>
            <table className="table">
              <thead>
                <tr><th style={{ width: 36 }}>№</th><th style={{ width: 110 }}>Статус</th><th>ФИО</th><th>Логин</th><th>Пароль</th><th>Детали</th></tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 100).map((r) => (
                  <tr key={r.index}>
                    <td>{r.index + 1}</td>
                    <td>
                      <span className="small" style={{ color: STATUS_COLOR[r.status], fontWeight: 600 }}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td>{r.name}</td>
                    <td>{r.username}</td>
                    <td className="small" style={{ fontFamily: "monospace" }}>{r.password || "—"}</td>
                    <td className="small muted">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="spread" style={{ marginTop: 4, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
            <button className="btn ghost" onClick={onClose}>Закрыть</button>
            <button className="btn" onClick={downloadReport}>⬇ Скачать отчёт CSV</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const overlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1100,
  padding: 16,
};

const modalContentStyle = {
  background: "#FFFFFF",
  borderRadius: 12,
  width: "100%",
  maxWidth: 720,
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
  padding: 20,
};
