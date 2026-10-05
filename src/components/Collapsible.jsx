import { useState } from "react";

export default function Collapsible({ title, subtitle, actions, defaultOpen = false, isOpen: controlledOpen, onToggle, children, id }) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const handleToggle = () => {
    if (onToggle) onToggle(!isOpen);
    else setInternalOpen(v => !v);
  };

  return (
    <div id={id} className={"collapsible " + (isOpen ? "open" : "")}>
      <div className="collapsible-head" onClick={handleToggle}>
        <span className="collapsible-arrow">{isOpen ? "▾" : "▸"}</span>
        <span className="collapsible-title">{title}</span>
        {actions && (
          <div className="collapsible-actions" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
        {subtitle && <span className="collapsible-subtitle">{subtitle}</span>}
      </div>
      {isOpen && <div className="collapsible-body">{children}</div>}
    </div>
  );
}
