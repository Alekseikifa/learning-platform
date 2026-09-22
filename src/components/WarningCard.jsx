import React from "react";

export default function WarningCard({ title, text, style = {}, enabled = true }) {
  if (enabled === false || enabled === "false") return null;
  const displayTitle = title || "Уважаемые студенты!";
  const displayText = text || "Обращаем ваше внимание, что копирование и распространение материалов обучения (конспекты, видео и аудио-уроки) запрещено.\nВы можете использовать материалы в целях собственного обучения, а также сохранять на личные устройства, без передачи третьим лицам. Надеемся на ваше понимание и благословляем на плодотворную учебу!";

  return (
    <div className="mku-warning-card" style={{ width: "100%", maxWidth: 1100, margin: "0 auto 16px", boxSizing: "border-box", background: "linear-gradient(135deg, #28469c 0%, #233e8d 50%, #1d3478 100%)", borderRadius: 24, padding: "24px 28px", color: "#ffffff", boxShadow: "0 12px 28px -4px rgba(15, 23, 42, 0.18)", ...style }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 800, textAlign: "center", color: "#ffffff" }}>{displayTitle}</h3>
      <div style={{ fontSize: 15, lineHeight: 1.6, textAlign: "center", whiteSpace: "pre-line", opacity: 0.95 }}>{displayText}</div>
    </div>
  );
}