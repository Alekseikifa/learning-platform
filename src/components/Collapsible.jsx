import { useState } from "react";

export default function Collapsible({ title, subtitle, defaultOpen = false, children }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={"collapsible " + (isOpen ? "open" : "")}>
      <div className="collapsible-head" onClick={() => setIsOpen(v => !v)}>
        <span className="collapsible-arrow">{isOpen ? "▾" : "▸"}</span>
        <span className="collapsible-title">{title}</span>
        {subtitle && <span className="collapsible-subtitle">{subtitle}</span>}
      </div>
      {isOpen && <div className="collapsible-body">{children}</div>}
    </div>
  );
}
