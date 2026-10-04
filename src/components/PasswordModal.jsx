import { useState } from "react";
import Modal from "./Modal";

export default function PasswordModal({ name, currentPassword, onClose, onSubmit }) {
  const [pw, setPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(true);
  const [showNew, setShowNew] = useState(true);

  return (
    <Modal onClose={onClose} innerStyle={{ maxWidth: 440 }}>
      <h3 style={{ margin: "0 0 6px" }}>Пароль пользователя</h3>
      <div className="muted small" style={{ marginBottom: 12 }}>
        Пользователь: <b>{name}</b>
      </div>

      {currentPassword ? (
        <div style={{ marginBottom: 14, padding: "10px 12px", background: "var(--bg-soft, #f8fafc)", borderRadius: 8, border: "1px solid var(--border, #cbd5e1)" }}>
          <div style={{ fontSize: 12, color: "var(--text-soft, #475569)", marginBottom: 4, fontWeight: 600 }}>
            Текущий пароль:
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type={showCurrent ? "text" : "password"}
              value={currentPassword}
              readOnly
              style={{
                flex: 1,
                fontFamily: "monospace",
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: showCurrent ? "normal" : "2px",
                background: "#fff",
                color: "#0f172a",
                border: "1px solid #94a3b8",
              }}
            />
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setShowCurrent(!showCurrent)}
              title={showCurrent ? "Скрыть" : "Показать"}
              style={{ padding: "6px 10px" }}
            >
              {showCurrent ? "🙈" : "👁"}
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => {
                navigator.clipboard.writeText(currentPassword);
                alert("Пароль скопирован в буфер обмена!");
              }}
              title="Скопировать пароль"
              style={{ padding: "6px 10px" }}
            >
              📋 Копировать
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: "8px 10px", background: "#fef3c7", borderRadius: 6, border: "1px solid #fde68a", color: "#92400e", fontSize: 13, marginBottom: 12 }}>
          Пароль сохранён в зашифрованном виде (сохранён до обновления). Вы можете задать новый пароль ниже.
        </div>
      )}

      <div style={{ marginBottom: 4 }}>
        <label style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>
          Новый пароль:
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type={showNew ? "text" : "password"}
            placeholder="Введите новый пароль"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn ghost small"
            onClick={() => setShowNew(!showNew)}
            style={{ padding: "6px 10px" }}
          >
            {showNew ? "🙈" : "👁"}
          </button>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              const gen = Math.random().toString(36).slice(-6) + Math.floor(10 + Math.random() * 89);
              setPw(gen);
              setShowNew(true);
            }}
            title="Сгенерировать случайный пароль"
            style={{ padding: "6px 10px", whiteSpace: "nowrap" }}
          >
            🎲 Сгенерировать
          </button>
        </div>
      </div>

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn ghost" onClick={onClose}>
          Отмена
        </button>
        <button
          className="btn primary"
          disabled={!pw || pw.length < 4}
          onClick={() => onSubmit(pw)}
        >
          Сохранить пароль
        </button>
      </div>
    </Modal>
  );
}
