import { useState } from "react";

export default function SearchSelect({ options, value, onChange,
                                       placeholder = "Поиск...", style }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(query.toLowerCase())
  );
  const selected = options.find(o => String(o.value) === String(value));

  return (
    <div className="search-select" style={style}>
      <input
        value={open ? query : (selected?.label || "")}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onChange={e => setQuery(e.target.value)}
      />
      {open && (
        <div className="search-select-dropdown">
          {filtered.length === 0 && (
            <div className="search-select-empty">Ничего не найдено</div>
          )}
          {filtered.slice(0, 30).map(o => (
            <div key={o.value}
                 className={"search-select-option " +
                            (String(o.value) === String(value) ? "active" : "")}
                 onMouseDown={() => {
                   onChange(o.value);
                   setOpen(false);
                   setQuery("");
                 }}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}