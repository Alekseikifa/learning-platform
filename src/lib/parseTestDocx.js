const LETTER = /^([A-Fa-fА-Еа-е])\s*[.)]\s*(.*)$/;
const NUMBER = /^(\d{1,2})\s*[.)]\s+(.*)$/;
const QUESTION_NUM = /^\s*\d{1,3}[.)]\s+/;
const MAX_ANSWERS = 8;

function elementLines(el) {
  const segs = [];
  const walk = (node, bold) => {
    if (node.nodeType === 3) {
      if (node.nodeValue) segs.push({ text: node.nodeValue, bold });
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.nodeName === "BR") { segs.push({ br: true }); return; }
    const style = node.style;
    const b = bold || node.nodeName === "STRONG" || node.nodeName === "B" ||
      !!(style && style.fontWeight && style.fontWeight !== "normal" && style.fontWeight !== "400");
    for (const c of node.childNodes) walk(c, b);
  };
  for (const c of el.childNodes) walk(c, false);
  const lines = [];
  let cur = [];
  for (const s of segs) {
    if (s.br) { lines.push(cur); cur = []; }
    else cur.push(s);
  }
  lines.push(cur);
  return lines;
}

function toBlock(segs) {
  let text = "";
  let hasBold = false;
  for (const s of segs) {
    text += s.text;
    if (s.bold && s.text.trim()) hasBold = true;
  }
  return { text: text.replace(/\s+/g, " ").trim(), hasBold };
}

export function parseBlocks(blocks) {
  const questions = [];
  let cur = null;
  const flush = () => { if (cur) { questions.push(cur); cur = null; } };

  for (const b of blocks) {
    if (!b.text) {
      if (cur && cur.answers.length) flush();
      continue;
    }
    const letter = b.text.match(LETTER);
    const num = b.text.match(NUMBER);

    if (cur && cur.answers.length < MAX_ANSWERS && letter) {
      if (!cur.labelMode) cur.labelMode = "letter";
      cur.answers.push({ text: letter[2].trim(), is_correct: b.hasBold });
      continue;
    }
    const numericAllowed = cur && cur.answers.length < MAX_ANSWERS &&
      num && (!cur.labelMode || cur.labelMode === "number") &&
      +num[1] === cur.answers.length + 1;
    if (numericAllowed) {
      if (!cur.labelMode) cur.labelMode = "number";
      cur.answers.push({ text: num[2].trim(), is_correct: b.hasBold });
      continue;
    }

    if (cur && cur.answers.length) flush();
    if (!cur) cur = { text: b.text.replace(QUESTION_NUM, "").trim(), answers: [], labelMode: null };
    else cur.text += " " + b.text;
  }
  flush();

  return questions.map((q) => {
    let issue = null;
    if (!q.text) issue = "Пустой текст вопроса";
    else if (q.answers.length < 2) issue = "Менее 2 вариантов ответа";
    else if (!q.answers.some((a) => a.is_correct)) issue = "Нет правильного ответа (жирное выделение не найдено)";
    return { text: q.text, answers: q.answers, valid: !issue, issue, include: !issue };
  });
}

export async function parseTestDocx(arrayBuffer) {
  let convertToHtml;
  try {
    const mod = await import("mammoth");
    convertToHtml = mod.convertToHtml || (mod.default && mod.default.convertToHtml);
  } catch (e) {
    throw new Error("Не удалось загрузить модуль чтения Word: " + (e && e.message ? e.message : e));
  }
  if (!convertToHtml) throw new Error("Модуль чтения Word недоступен.");
  let html;
  try {
    html = (await convertToHtml({ arrayBuffer })).value;
  } catch (e) {
    throw new Error("Не удалось прочитать .docx: " + (e && e.message ? e.message : e));
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const els = doc.body.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li");
  const blocks = [];
  for (const el of els) {
    for (const segs of elementLines(el)) blocks.push(toBlock(segs));
  }

  const questions = parseBlocks(blocks);
  const warnings = [];
  if (!questions.length) warnings.push("В документе не найдено ни одного вопроса.");
  const bad = questions.filter((q) => !q.valid).length;
  if (bad) warnings.push(`Вопросов с проблемами: ${bad} — они показаны ниже, но не будут импортированы.`);
  return { questions, warnings };
}
