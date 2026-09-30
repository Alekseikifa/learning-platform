// Минимальный CSV-парсер/сериализатор: кавычки, разделители ; , таб, BOM, UTF-8/1251

export function detectDelimiter(sample) {
  let best = ";";
  let bestCount = 0;
  for (const d of [";", ",", "\t"]) {
    const count = (sample.match(new RegExp(d === "\t" ? "\\t" : d === ";" ? ";" : ",", "g")) || []).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** Читает файл: автоопределение UTF-8 / windows-1251, снятие BOM */
export async function readFileAsText(file) {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("\uFFFD")) {
    try {
      const alt = new TextDecoder("windows-1251").decode(buf);
      if (!alt.includes("\uFFFD")) text = alt;
    } catch {
      /* windows-1251 недоступен — оставляем UTF-8 */
    }
  }
  return text.replace(/^\uFEFF/, "");
}

/** Разбирает CSV в { headers, rows, delimiter }. Первая строка — заголовки. */
export function parseCsv(text, delimiter) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delim = delimiter || detectDelimiter(firstLine);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === "") {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  const cleaned = rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
  const headers = cleaned.shift() || [];
  return { headers, rows: cleaned, delimiter: delim };
}

const delimLabel = (d) => (d === "\t" ? "таб" : d);

export function describeDelimiter(d) {
  return delimLabel(d);
}

/** Сериализует в CSV (BOM + CRLF, разделитель «;») */
export function toCsv(headers, rows, delim = ";") {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    if (s.includes(delim) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [headers.map(esc).join(delim)];
  for (const r of rows) lines.push(r.map(esc).join(delim));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

export function downloadText(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
