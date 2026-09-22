import { useState } from "react";

export default function SearchSelect({ options = [], value, onChange, placeholder = "Выберите...", style }) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filtered = options.filter(opt =>
    (opt.label || "").toLowerCase().includes(search.toLowerCase())
  );

  const selectedOption = options.find(opt => String(opt.value) === String(value));

  return (
    <div className="search-select" style={style}>
      <input
        value={isOpen ? search : (selectedOption?.label || "")}
        placeholder={placeholder}
        onFocus={() => {
          setIsOpen(true);
          setSearch("");
        }}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        onChange={e => setSearch(e.target.value)}
      />
      {isOpen && (
        <div className="search-select-dropdown">
          {filtered.length === 0 && (
            <div className="search-select-empty">Ничего не найдено</div>
          )}
          {filtered.slice(0, 30).map(opt => (
            <div
              key={opt.value}
              className={"search-select-option " + (String(opt.value) === String(value) ? "active" : "")}
              onMouseDown={() => {
                onChange(opt.value);
                setIsOpen(false);
                setSearch("");
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
