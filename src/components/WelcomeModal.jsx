import { useState } from "react";
import WarningCard from "./WarningCard";

export default function WelcomeModal({ isOpen, onClose, settings = {}, user }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (dontShowAgain) localStorage.setItem("mku_welcome_never_show", "true");
    onClose();
  };

  const title = settings.welcome_title || "Добро пожаловать в МКУ!";
  const text = settings.welcome_text || "Мы верим, что время обучения станет для вас поистине особенным временем.\nПусть Дух Святой работает с вашим сердцем на этом пути, а жизнь изменяется!";

  return (
    <div className="modal-back" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(15, 23, 42, 0.72)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16, overflowY: "auto" }}>
      <div className="card" style={{ width: "100%", maxWidth: 780, background: "#ffffff", borderRadius: 24, padding: "28px 32px", boxShadow: "0 25px 50px -12px rgba(15, 23, 42, 0.25)", border: "1px solid #e2e8f0", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <img src="/mku_logo.svg" alt="Логотип" style={{ height: 58, width: "auto", margin: "0 auto 12px", display: "block" }} />
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "var(--text, #0f172a)", margin: 0 }}>{title}</h2>
        </div>
        <div style={{ background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)", border: "1px solid #bfdbfe", borderRadius: 16, padding: "18px 22px", marginBottom: 20, textAlign: "center", whiteSpace: "pre-line", fontSize: 16, lineHeight: 1.6, color: "#1e3a8a", fontWeight: 500 }}>{text}</div>
        <WarningCard title={settings.warning_title} text={settings.warning_text} enabled={settings.warning_enabled !== "false"} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", color: "#64748b" }}>
            <input type="checkbox" checked={dontShowAgain} onChange={e => setDontShowAgain(e.target.checked)} /> Больше не показывать
          </label>
          <button className="btn primary" onClick={handleConfirm}>Понятно</button>
        </div>
      </div>
    </div>
  );
}