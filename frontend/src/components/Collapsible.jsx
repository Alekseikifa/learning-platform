import { useState } from "react";

export default function Collapsible({ title, subtitle, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={"collapsible " + (open ? "open" : "")}>
      <div className="collapsible-head" onClick={() => setOpen(o => !o)}>
        <span className="collapsible-arrow">{open ? "▾" : "▸"}</span>
        <span className="collapsible-title">{title}</span>
        {subtitle && <span className="collapsible-subtitle">{subtitle}</span>}
      </div>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}