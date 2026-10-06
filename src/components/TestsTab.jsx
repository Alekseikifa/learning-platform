import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { parseTestDocx } from "../lib/parseTestDocx";
import Modal from "./Modal";

/* ---------- TESTS ---------- */
export default function TestsTab({ courses = [], apiPrefix = "/api/admin" }) {
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [themeId, setThemeId] = useState("");
  const [test, setTest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);
  const fetchSeq = useRef(0);

  const currentCourse = courses.find(c => c.id === +courseId);
  const themes = currentCourse?.themes || [];

  useEffect(() => { if (!courseId && courses[0]) setCourseId(courses[0].id); }, [courses, courseId]);
  useEffect(() => {
    if (!themes.length) { setThemeId(""); return; }
    if (!themes.find(t => t.id === +themeId)) setThemeId(themes[0].id);
  }, [courseId, courses]);

  const load = async () => {
    const seq = ++fetchSeq.current; // защита от гонки при быстрой смене темы
    if (!themeId) { setTest(null); setLoadErr(null); setLoading(false); return; }
    setTest(null); // тест предыдущей темы не должен остаться видимым
    setLoadErr(null);
    setLoading(true);
    try {
      const data = await api(`${apiPrefix}/themes/${themeId}/test`);
      if (seq === fetchSeq.current) setTest(data);
    } catch (e) {
      if (seq === fetchSeq.current) setLoadErr(e.message);
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  };
  useEffect(() => { load(); }, [themeId]);

  return (
    <div>
      <div className="card row">
        <label>Курс:</label>
        <select value={courseId} onChange={e => setCourseId(e.target.value)}>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <label>Тема:</label>
        <select value={themeId} onChange={e => setThemeId(e.target.value)}>
          {themes.map(t => <option key={t.id} value={t.id}>Тема {t.order_index}. {t.title}</option>)}
        </select>
      </div>

      {!themes.length && <div className="card muted">Сначала добавьте темы</div>}

      {loadErr && (
        <div className="card" style={{ color: "#dc2626" }}>
          Не удалось загрузить тест: {loadErr}
        </div>
      )}

      {themeId && loading && !loadErr && <div className="card muted">Загрузка теста…</div>}

      {themeId && !loading && !test && !loadErr && (
        <CreateTestForm themeId={+themeId}
                        onCreate={async (payload) => {
                          try { await api(`${apiPrefix}/tests`, { method: "POST", body: JSON.stringify(payload) }); load(); }
                          catch (e) { alert(e.message); }
                        }} />
      )}

      {test && <TestCard test={test} reload={load} apiPrefix={apiPrefix} />}
    </div>
  );
}

function CreateTestForm({ themeId, onCreate }) {
  const [title, setTitle] = useState("");
  const [pass, setPass] = useState(70);
  const [maxA, setMaxA] = useState(0);
  return (
    <form className="card row"
          onSubmit={(e) => {
            e.preventDefault();
            onCreate({ theme_id: themeId, title, passing_score: +pass, max_attempts: +maxA });
          }}>
      <input placeholder="Название теста" value={title}
             onChange={e => setTitle(e.target.value)} required style={{ flex: 1 }} />
      <input type="number" title="Проходной %" value={pass}
             onChange={e => setPass(e.target.value)} style={{ width: 110 }} />
      <input type="number" title="Макс. попыток (0 = ∞)" value={maxA}
             onChange={e => setMaxA(e.target.value)} style={{ width: 130 }} />
      <button className="btn primary">Создать тест</button>
    </form>
  );
}

function TestCard({ test, reload, apiPrefix = "/api/admin" }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({
    title: test.title,
    passing_score: test.passing_score,
    max_attempts: Number(test.max_attempts) || 0,
  });

  useEffect(() => {
    setForm({
      title: test.title,
      passing_score: test.passing_score,
      max_attempts: Number(test.max_attempts) || 0,
    });
  }, [test]);

  const fileRef = useRef(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsed, setParsed] = useState(null);

  const pickDocx = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) {
      alert("Поддерживается только формат .docx.\nОткройте документ в Word и сохраните его как «Документ Word (.docx)».");
      return;
    }
    try {
      const res = await parseTestDocx(await file.arrayBuffer());
      if (!res.questions.length) {
        alert(res.warnings.join("\n") || "В документе не найдено ни одного вопроса.");
        return;
      }
      setParsed(res);
      setImportOpen(true);
    } catch (err) {
      alert(err && err.message ? err.message : "Не удалось прочитать документ");
    }
  };

  const toggleImportQ = (idx) => setParsed((p) => ({
    ...p,
    questions: p.questions.map((q, i) => (i === idx && q.valid ? { ...q, include: !q.include } : q)),
  }));

  const runImport = async () => {
    const list = parsed.questions.filter((q) => q.include && q.valid);
    if (!list.length) return;
    setImporting(true);
    let ok = 0;
    const fails = [];
    for (const q of list) {
      try {
        await api(`${apiPrefix}/questions`, {
          method: "POST",
          body: JSON.stringify({
            test_id: test.id,
            text: q.text,
            question_type: q.question_type || "choice",
            sample_answer: q.sample_answer || "",
            answers: (q.answers || []).map((a) => ({ text: a.text, is_correct: a.is_correct })),
          }),
        });
        ok += 1;
      } catch (e) {
        fails.push(`«${q.text.slice(0, 50)}» — ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    setImporting(false);
    setImportOpen(false);
    setParsed(null);
    reload();
    alert(fails.length
      ? `Импортировано ${ok} из ${list.length}.\nОшибки:\n${fails.join("\n")}`
      : `Импортировано вопросов: ${ok}`);
  };

  const saveEdit = async () => {
    try {
      await api(`${apiPrefix}/tests/${test.id}`, { method: "PUT", body: JSON.stringify(form) });
      setEdit(false); reload();
    } catch (e) { alert(e.message); }
  };
  const del = async () => {
    if (!confirm("Удалить тест со всеми вопросами?")) return;
    try {
      await api(`${apiPrefix}/tests/` + test.id, { method: "DELETE" });
      reload();
    } catch (e) { alert(e.message); }
  };
  const delQ = async (id) => {
    try {
      await api(`${apiPrefix}/questions/` + id, { method: "DELETE" });
      reload();
    } catch (e) { alert(e.message); }
  };
  const updQ = async (id, patch) => {
    try {
      await api(`${apiPrefix}/questions/${id}`, { method: "PUT", body: JSON.stringify(patch) });
      reload();
    } catch (e) { alert(e.message); }
  };
  const addQ = async (payload) => {
    try {
      await api(`${apiPrefix}/questions`, { method: "POST", body: JSON.stringify({ test_id: test.id, ...payload }) });
      reload();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="card">
      <div className="spread">
        {edit ? (
          <div className="row" style={{ flex: 1 }}>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                   style={{ flex: 1 }} />
            <input type="number" value={form.passing_score}
                   onChange={e => setForm({ ...form, passing_score: +e.target.value })}
                   style={{ width: 100 }} />
            <input type="number" value={form.max_attempts}
                   onChange={e => setForm({ ...form, max_attempts: +e.target.value })}
                   style={{ width: 130 }} title="Макс. попыток (0 = ∞)" />
            <button className="btn primary" onClick={saveEdit}>ОК</button>
            <button className="btn ghost" onClick={() => setEdit(false)}>Отмена</button>
          </div>
        ) : (
          <>
            <b>Тест: {test.title}</b>
            <div className="muted small">
              проходной {test.passing_score}% · попыток: {test.max_attempts || "∞"}
            </div>
            <div>
              <button className="btn small" onClick={() => setEdit(true)}>Изм.</button>{" "}
              <button className="btn danger small" onClick={del}>Удалить</button>
            </div>
          </>
        )}
      </div>

      <div className="list" style={{ marginTop: 10 }}>
        {test.questions.map((q, i) => <QuestionRow key={q.id} idx={i} q={q}
                                                    onDelete={() => delQ(q.id)} onUpdate={updQ} />)}
      </div>
      <NewQuestionForm testId={test.id} onSubmit={addQ} />

      <div className="spread" style={{ marginTop: 14, alignItems: "center" }}>
        <button type="button" className="btn" onClick={() => fileRef.current && fileRef.current.click()}>
          📥 Импортировать вопросы из Word (.docx)
        </button>
        <span className="small muted">Вопрос, затем варианты A. B. C. D. — правильный ответ выделен жирным</span>
      </div>
      <input ref={fileRef} type="file" accept=".docx" style={{ display: "none" }} onChange={pickDocx} />

      {importOpen && parsed && (
        <Modal onClose={() => setImportOpen(false)} dismissible={!importing}>
            <div className="spread">
              <b>Импорт вопросов из Word</b>
              <span className="small muted">
                выбрано: {parsed.questions.filter((q) => q.include && q.valid).length} / {parsed.questions.length}
              </span>
            </div>
            {parsed.warnings.map((w, i) => (
              <div key={i} className="small" style={{ color: "#b45309", marginTop: 6 }}>⚠ {w}</div>
            ))}
            <div className="list" style={{ marginTop: 10, maxHeight: "50vh", overflow: "auto" }}>
              {parsed.questions.map((q, i) => (
                <div className="q" key={i} style={{ padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}>
                  <label className="row" style={{ gap: 8, alignItems: "flex-start", cursor: q.valid ? "pointer" : "default" }}>
                    <input
                      type="checkbox"
                      checked={q.include && q.valid}
                      disabled={!q.valid || importing}
                      onChange={() => toggleImportQ(i)}
                      style={{ marginTop: 4 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <b>{i + 1}. {q.text || "(пустой вопрос)"}</b>
                        {q.question_type === "text" && (
                          <span className="badge" style={{ background: "#eff6ff", color: "#1e40af", fontSize: 11 }}>
                            ✍️ Письменный
                          </span>
                        )}
                      </div>
                      {!q.valid && <div className="small" style={{ color: "#b91c1c" }}>⚠ {q.issue}</div>}
                      {q.question_type === "text" ? (
                        <div className="small muted" style={{ marginTop: 4 }}>
                          {q.sample_answer ? `Ключевой ответ / образец: «${q.sample_answer}»` : "Развёрнутый ответ (ручная проверка куратором)"}
                        </div>
                      ) : (
                        <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                          {q.answers.map((a, j) => (
                            <li key={j} style={{ color: a.is_correct ? "#15803d" : "inherit", fontWeight: a.is_correct ? 600 : 400 }}>
                              {a.is_correct ? "✅" : "▫️"} {String.fromCharCode(65 + j)}. {a.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </label>
                </div>
              ))}
            </div>
            <div className="spread" style={{ marginTop: 12, justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn ghost" disabled={importing} onClick={() => setImportOpen(false)}>
                Отмена
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={importing || !parsed.questions.some((q) => q.include && q.valid)}
                onClick={runImport}
              >
                {importing ? "Импорт..." : `Импортировать ${parsed.questions.filter((q) => q.include && q.valid).length}`}
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}

function QuestionRow({ idx, q, onDelete, onUpdate }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(q.text);
  const [qType, setQType] = useState(q.question_type || "choice");
  const [sampleAnswer, setSampleAnswer] = useState(q.sample_answer || "");
  const [answers, setAnswers] = useState(
    Array.isArray(q.answers) && q.answers.length > 0
      ? q.answers.map(a => ({ text: a.text, is_correct: a.is_correct }))
      : [{ text: "", is_correct: true }, { text: "", is_correct: false }]
  );

  const save = async () => {
    if (qType === "text") {
      if (!text.trim()) return alert("Введите текст вопроса");
      await onUpdate(q.id, { text, question_type: "text", sample_answer: sampleAnswer.trim() });
    } else {
      if (answers.length < 2) return alert("Минимум 2 варианта ответа");
      if (answers.filter(a => a.is_correct).length < 1) return alert("Выберите хотя бы один правильный ответ");
      if (answers.some(a => !a.text.trim())) return alert("Заполните текст всех вариантов ответа");
      await onUpdate(q.id, { text, question_type: "choice", answers });
    }
    setEdit(false);
  };

  const addAnswerOption = () => {
    if (answers.length >= 8) return alert("Максимум 8 вариантов ответа");
    setAnswers([...answers, { text: "", is_correct: false }]);
  };

  const removeAnswerOption = (indexToRemove) => {
    if (answers.length <= 2) return alert("Минимум 2 варианта ответа");
    const filtered = answers.filter((_, i) => i !== indexToRemove);
    if (!filtered.some(a => a.is_correct) && filtered.length > 0) {
      filtered[0].is_correct = true;
    }
    setAnswers(filtered);
  };

  const isText = q.question_type === "text";

  if (!edit) {
    return (
      <div className="q">
        <div className="spread">
          <div>
            <b>{idx + 1}. {q.text}</b>
            <span
              className="badge"
              style={{
                marginLeft: 8,
                background: isText ? "#eff6ff" : "#f1f5f9",
                color: isText ? "#1e40af" : "#475569",
                fontWeight: 600,
              }}
            >
              {isText ? "✍️ Письменный ответ" : `${q.answers?.length || 0} вар.`}
            </span>
          </div>
          <div>
            <button className="btn small" onClick={() => setEdit(true)}>Изм.</button>{" "}
            <button className="btn danger small" onClick={onDelete} aria-label="Удалить">✕</button>
          </div>
        </div>

        {isText ? (
          <div className="small muted" style={{ marginTop: 6, paddingLeft: 12, borderLeft: "2px solid #93c5fd" }}>
            {q.sample_answer ? (
              <span>Ключевые слова для автопроверки: <b>«{q.sample_answer}»</b></span>
            ) : (
              <span>Развёрнутый письменный ответ (проверяется куратором/деканом)</span>
            )}
          </div>
        ) : (
          <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            {q.answers.map(a => (
              <li key={a.id} style={{ color: a.is_correct ? "#15803d" : "inherit", fontWeight: a.is_correct ? 600 : 400 }}>
                {a.is_correct ? "✅" : "▫️"} {a.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="q" style={{ background: "#f8fafc", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1" }}>
      <div className="row" style={{ gap: 8, marginBottom: 8, alignItems: "center" }}>
        <span className="small muted">Тип вопроса:</span>
        <button
          type="button"
          className={"btn small " + (qType === "choice" ? "primary" : "ghost")}
          onClick={() => setQType("choice")}
        >
          🔘 Тест с вариантами
        </button>
        <button
          type="button"
          className={"btn small " + (qType === "text" ? "primary" : "ghost")}
          onClick={() => setQType("text")}
        >
          ✍️ Письменный ответ
        </button>
      </div>

      <label className="small muted">Текст вопроса:</label>
      <input value={text} onChange={e => setText(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />

      {qType === "text" ? (
        <div style={{ marginTop: 8 }}>
          <label className="small muted">
            Образцовый ответ или ключевые фразы (опционально, для автопроверки совпадения):
          </label>
          <input
            value={sampleAnswer}
            placeholder="Оставьте пустым для ручной проверки развёрнутого ответа"
            onChange={e => setSampleAnswer(e.target.value)}
            style={{ width: "100%", marginTop: 4 }}
          />
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span className="small muted">Варианты ответа (отметьте правильный):</span>
            <button type="button" className="btn small" onClick={addAnswerOption} disabled={answers.length >= 8}>
              + Добавить вариант
            </button>
          </div>

          {answers.map((a, i) => (
            <div className="row" key={i} style={{ marginTop: 4, alignItems: "center" }}>
              <label className="radio" title="Отметить как правильный">
                <input
                  type="radio"
                  name={"edit-ok-" + q.id}
                  checked={a.is_correct}
                  onChange={() => setAnswers(answers.map((x, j) => ({ ...x, is_correct: i === j })))}
                />
              </label>
              <input
                style={{ flex: 1 }}
                value={a.text}
                placeholder={`Вариант ${i + 1}`}
                onChange={e => {
                  const copy = [...answers];
                  copy[i] = { ...copy[i], text: e.target.value };
                  setAnswers(copy);
                }}
              />
              {answers.length > 2 && (
                <button
                  type="button"
                  className="btn danger small"
                  onClick={() => removeAnswerOption(i)}
                  title="Удалить этот вариант"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </>
      )}

      <div className="row" style={{ marginTop: 10, justifyContent: "flex-end" }}>
        <button className="btn ghost" onClick={() => setEdit(false)}>Отмена</button>
        <button className="btn primary" onClick={save}>Сохранить</button>
      </div>
    </div>
  );
}

function NewQuestionForm({ testId, onSubmit }) {
  const [qType, setQType] = useState("choice"); // "choice" | "text"
  const [text, setText] = useState("");
  const [sampleAnswer, setSampleAnswer] = useState("");
  const [answers, setAnswers] = useState(["", ""]);
  const [correct, setCorrect] = useState(0);

  const applyPreset = (presetType) => {
    if (presetType === "yes_no") {
      setAnswers(["Да", "Нет"]);
      setCorrect(0);
    } else if (presetType === "true_false") {
      setAnswers(["Верно", "Неверно"]);
      setCorrect(0);
    } else if (presetType === "two_custom") {
      setAnswers(["", ""]);
      setCorrect(0);
    } else if (presetType === "four_standard") {
      setAnswers(["", "", "", ""]);
      setCorrect(0);
    }
  };

  const addOption = () => {
    if (answers.length >= 8) return;
    setAnswers([...answers, ""]);
  };

  const removeOption = (idxToRemove) => {
    if (answers.length <= 2) return;
    const next = answers.filter((_, i) => i !== idxToRemove);
    if (correct >= next.length) setCorrect(0);
    setAnswers(next);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return alert("Введите текст вопроса");
    if (qType === "text") {
      onSubmit({
        text: text.trim(),
        question_type: "text",
        sample_answer: sampleAnswer.trim(),
      });
      setText("");
      setSampleAnswer("");
    } else {
      if (answers.length < 2) return alert("Минимум 2 варианта ответа");
      if (answers.some(a => !a.trim())) return alert("Заполните текст всех вариантов ответа");
      onSubmit({
        text: text.trim(),
        question_type: "choice",
        answers: answers.map((a, i) => ({ text: a.trim(), is_correct: i === correct })),
      });
      setText("");
      setAnswers(["", ""]);
      setCorrect(0);
    }
  };

  return (
    <form className="card qform" onSubmit={submit} style={{ marginTop: 14 }}>
      <div className="spread" style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <b>Добавить вопрос к тесту</b>
        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className={"btn small " + (qType === "choice" ? "primary" : "ghost")}
            onClick={() => setQType("choice")}
          >
            🔘 Выбор варианта
          </button>
          <button
            type="button"
            className={"btn small " + (qType === "text" ? "primary" : "ghost")}
            onClick={() => setQType("text")}
          >
            ✍️ Письменный ответ
          </button>
        </div>
      </div>

      {qType === "choice" && (
        <div className="row" style={{ gap: 6, margin: "8px 0 10px", flexWrap: "wrap" }}>
          <span className="small muted" style={{ alignSelf: "center", marginRight: 4 }}>Быстрый выбор:</span>
          <button
            type="button"
            className="btn small"
            onClick={() => applyPreset("yes_no")}
            title="Вопрос с 2 вариантами: Да / Нет"
            style={{ background: "#f0fdf4", borderColor: "#86efac", color: "#166534" }}
          >
            ⚡ 2 варианта: Да / Нет
          </button>
          <button
            type="button"
            className="btn small"
            onClick={() => applyPreset("true_false")}
            title="Вопрос с 2 вариантами: Верно / Неверно"
            style={{ background: "#f0fdf4", borderColor: "#86efac", color: "#166534" }}
          >
            ⚡ 2 варианта: Верно / Неверно
          </button>
          <button
            type="button"
            className="btn small"
            onClick={() => applyPreset("two_custom")}
            title="2 произвольных варианта"
            style={{ background: "#eff6ff", borderColor: "#93c5fd", color: "#1e40af" }}
          >
            2 варианта (пустые)
          </button>
          <button
            type="button"
            className="btn small"
            onClick={() => applyPreset("four_standard")}
            title="4 стандартных варианта"
          >
            4 варианта (стандарт)
          </button>
        </div>
      )}

      <input
        placeholder="Текст вопроса *"
        value={text}
        onChange={e => setText(e.target.value)}
        style={{ width: "100%", marginTop: 8, fontSize: 15 }}
        required
      />

      {qType === "text" ? (
        <div style={{ marginTop: 10 }}>
          <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
            Образцовый ответ / ключевые слова (для автопроверки, опционально):
          </label>
          <input
            placeholder="Если не заполнено — ответ будет принят и проверен куратором вручную"
            value={sampleAnswer}
            onChange={e => setSampleAnswer(e.target.value)}
            style={{ width: "100%", fontSize: 13 }}
          />
          <div className="small muted" style={{ marginTop: 4 }}>
            💡 Ученик введёт свой развёрнутый ответ в текстовое поле во время прохождения теста.
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div className="small muted" style={{ marginBottom: 4 }}>
            Отметьте радиокнопку слева от правильного ответа:
          </div>
          {answers.map((a, i) => (
            <div className="row" key={i} style={{ marginTop: 4, alignItems: "center" }}>
              <label className="radio" title="Отметить этот вариант как правильный">
                <input
                  type="radio"
                  name={"new-ok-" + testId}
                  checked={correct === i}
                  onChange={() => setCorrect(i)}
                />
              </label>
              <input
                style={{ flex: 1 }}
                placeholder={"Вариант " + (i + 1) + (correct === i ? " (Правильный ✅)" : "")}
                value={a}
                onChange={e => {
                  const c = [...answers];
                  c[i] = e.target.value;
                  setAnswers(c);
                }}
                required
              />
              {answers.length > 2 && (
                <button
                  type="button"
                  className="btn danger small"
                  onClick={() => removeOption(i)}
                  title="Удалить вариант"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="spread" style={{ marginTop: 12, alignItems: "center" }}>
        {qType === "choice" ? (
          <button
            type="button"
            className="btn small"
            onClick={addOption}
            disabled={answers.length >= 8}
          >
            + Добавить вариант ответа
          </button>
        ) : <div />}
        <button className="btn primary">Сохранить вопрос</button>
      </div>
    </form>
  );
}
