import { useState } from "react";

export default function HeaderBanner({ onOpenWelcome, isEmbedded = false }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="mku-header-banner"
      style={{
        width: "100%",
        maxWidth: 1240,
        margin: isEmbedded ? "4px auto 0" : "8px auto 10px",
        padding: "0",
        boxSizing: "border-box",
      }}
    >
      <div
        onClick={onOpenWelcome}
        title={onOpenWelcome ? "Нажмите, чтобы открыть приветствие и правила МКУ" : undefined}
        style={{
          position: "relative",
          height: 160,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 4px 16px -2px rgba(15, 23, 42, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.04)",
          border: "1px solid #e2e8f0",
          background: "#ffffff",
          cursor: onOpenWelcome ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
        }}
      >
        {!imgError ? (
          <img
            src="/Frame_28_1.svg"
            alt="МКУ — Международные Курсы Ученичества"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center 35%",
              display: "block",
            }}
          />
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 1440 190"
            width="100%"
            height="100%"
            style={{ display: "block" }}
            preserveAspectRatio="xMidYMid meet"
          >
            <rect width="1440" height="190" fill="#ffffff" />
            <rect x="420" y="20" width="980" height="150" rx="14" fill="#244192" />
            <text x="460" y="118" fill="#ffffff" fontSize="72" fontWeight="900" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" letterSpacing="1">
              МКУ
            </text>
            <g fill="#ffffff" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" fontWeight="700" fontSize="19" letterSpacing="0.2">
              <text x="640" y="75">Укрепите ваше библейское основание</text>
              <text x="640" y="105">для близких отношений со Христом</text>
              <text x="640" y="135">и победоносной жизни</text>
            </g>
            <g transform="translate(45, 38) scale(0.92)">
              <g stroke="#244192" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M 16 60 C 36 22, 75 22, 106 88" />
                <path d="M 16 60 C 36 98, 75 98, 106 32" />
              </g>
              <text x="126" y="32" fill="#111827" fontSize="19.5" fontWeight="700" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" letterSpacing="1.8">
                МЕЖДУНАРОДНЫЕ
              </text>
              <text x="125" y="76" fill="#000000" fontSize="45" fontWeight="900" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" letterSpacing="0.5">
                КУРСЫ
              </text>
              <rect x="125" y="85" width="206" height="30" fill="#244192" />
              <text x="228" y="106" textAnchor="middle" fill="#ffffff" fontSize="18" fontWeight="800" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" letterSpacing="1.4">
                УЧЕНИЧЕСТВА
              </text>
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
