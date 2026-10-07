import { useEffect, useRef, useState } from "react";
import { api, getUser } from "../api";

const STANDARD_EMOJIS = ["👍", "❤️", "🙏", "🔥", "👏", "😂", "🤔", "✅"];

export default function ChatPanel({
  themeId,
  extraMaterialId,
  apiBase,
  groupId,
  initialIsReport = false,
  initialMaterialId = null,
  materials = [],
  onReportSubmitted,
}) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [isReport, setIsReport] = useState(initialIsReport);
  const [themeMaterials, setThemeMaterials] = useState(materials || []);
  const [reportMaterialId, setReportMaterialId] = useState(initialMaterialId || null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [activeEmojiPicker, setActiveEmojiPicker] = useState(null);
  const [reviewingMsg, setReviewingMsg] = useState(null);
  const [reviewComment, setReviewComment] = useState("");
  const [err, setErr] = useState("");
  const bottomRef = useRef(null);
  const me = getUser();
  const isStaff = ["teacher", "admin", "manager"].includes(me?.role);

  useEffect(() => {
    if (initialIsReport) setIsReport(true);
  }, [initialIsReport]);

  useEffect(() => {
    if (initialMaterialId) {
      setReportMaterialId(initialMaterialId);
    }
  }, [initialMaterialId]);

  useEffect(() => {
    if (Array.isArray(materials) && materials.length > 0) {
      setThemeMaterials(materials);
      if (!reportMaterialId) {
        setReportMaterialId(materials[0].id);
      }
    }
  }, [materials]);

  useEffect(() => {
    if (themeId && (!themeMaterials || themeMaterials.length === 0)) {
      const base = apiBase || "/api/student";
      api(`${base}/themes/${themeId}/materials`)
        .then((mats) => {
          if (Array.isArray(mats) && mats.length > 0) {
            setThemeMaterials(mats);
            if (!reportMaterialId) {
              setReportMaterialId(mats[0].id);
            }
          }
        })
        .catch(() => {});
    }
  }, [themeId]);

  const groupQuery = groupId ? `?group_id=${groupId}` : "";
  const chatUrl = extraMaterialId
    ? `${apiBase}/extra-materials/${extraMaterialId}/chat${groupQuery}`
    : `${apiBase}/themes/${themeId}/chat${groupQuery}`;

  const load = async () => {
    if (!themeId && !extraMaterialId) return;
    try {
      const list = await api(chatUrl);
      setMessages(list);
      setErr("");
    } catch (e) {
      console.error("ChatPanel error:", e);
      setErr(e.message || "Не удалось загрузить сообщения");
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [themeId, extraMaterialId, chatUrl, groupId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const chosenMaterialId = isReport
      ? (reportMaterialId || (themeMaterials && themeMaterials[0] ? themeMaterials[0].id : null))
      : null;

    try {
      await api(chatUrl, {
        method: "POST",
        body: JSON.stringify({
          text,
          is_report: themeId ? isReport : false,
          material_id: chosenMaterialId,
          reply_to_id: replyingTo ? replyingTo.id : null,
        }),
      });
      setText("");
      if (isReport && onReportSubmitted) onReportSubmitted();
      setIsReport(false);
      setReplyingTo(null);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleReact = async (msgId, emoji) => {
    setActiveEmojiPicker(null);
    try {
      await api(`/api/chat/messages/${msgId}/react`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      });
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleReviewReport = async (msgId, status, comment = "") => {
    try {
      await api(`/api/chat/messages/${msgId}/review-report`, {
        method: "POST",
        body: JSON.stringify({ status, comment }),
      });
      setReviewingMsg(null);
      setReviewComment("");
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const scrollToMessage = (id) => {
    const el = document.getElementById(`chat-msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("msg-highlight");
      setTimeout(() => el.classList.remove("msg-highlight"), 1800);
    }
  };

  const getRoleBadge = (role) => {
    if (role === "admin") return " (администратор)";
    if (role === "teacher") return " (декан)";
    if (role === "curator") return " (куратор)";
    if (role === "manager") return " (методист)";
    return " (ученик)";
  };

  return (
    <div className="chat">
      <div className="chat-list" onClick={() => setActiveEmojiPicker(null)}>
        {messages.length === 0 && <div className="muted small">Пока нет сообщений в обсуждении</div>}
        {messages.map((m) => {
          const reactions = m.reactions || {};
          const hasReactions = Object.keys(reactions).length > 0;

          return (
            <div
              key={m.id}
              id={`chat-msg-${m.id}`}
              className={"chat-msg " + (m.is_mine ? "mine " : "") + (m.is_report ? "is-report " : "")}
            >
              {/* Бейдж отчёта */}
              {m.is_report && (
                <div className="chat-report-header">
                  <div className="chat-report-badge" style={{ flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <span>
                      📝 <b>Отчёт по уроку {m.material_order_index ? `№${m.material_order_index}` : ""}</b>
                      {m.material_title ? `: «${m.material_title}»` : ""}
                    </span>
                    <span className={"tag small " + (m.report_status === "accepted" ? "ok" : m.report_status === "rejected" ? "no" : "")}>
                      {m.report_status === "accepted"
                        ? "✅ Зачтено"
                        : m.report_status === "rejected"
                        ? "🔄 На доработку"
                        : "⏳ На проверке"}
                    </span>
                  </div>
                  {m.report_reviewed_by_name && (
                    <span className="muted small" style={{ fontSize: 11 }}>
                      Проверил(а): {m.report_reviewed_by_name}
                    </span>
                  )}
                </div>
              )}

              {/* Цитата / Ответ на сообщение */}
              {m.reply_to && (
                <div
                  className="chat-quote-box"
                  onClick={() => scrollToMessage(m.reply_to.id)}
                  title="Нажмите, чтобы перейти к сообщению"
                >
                  <div className="chat-quote-line" />
                  <div className="chat-quote-content">
                    <b>{m.reply_to.user_name}</b>
                    <span>{m.reply_to.text}</span>
                  </div>
                </div>
              )}

              <div className="chat-meta">
                <b>{m.user_name}</b>
                <span className="muted small">
                  {getRoleBadge(m.user_role)}
                  {m.group_name ? ` · группа «${m.group_name}»` : ""}{" "}
                  · {new Date(m.created_at).toLocaleString("ru-RU")}
                </span>
              </div>

              <div className="chat-text">{m.text}</div>

              {/* Комментарий декана к отчёту, если есть */}
              {m.is_report && m.report_comment && (
                <div className="chat-report-feedback">
                  <b>Комментарий декана:</b> {m.report_comment}
                </div>
              )}

              {/* Блок действий декана/администратора по проверке отчёта */}
              {m.is_report && isStaff && (
                <div className="chat-report-actions">
                  {m.report_status !== "accepted" && (
                    <button
                      type="button"
                      className="btn small"
                      style={{ background: "var(--olive-soft)", color: "var(--olive)", borderColor: "var(--olive)" }}
                      onClick={() => handleReviewReport(m.id, "accepted")}
                    >
                      ✅ Зачесть отчёт
                    </button>
                  )}
                  {m.report_status !== "rejected" && (
                    <button
                      type="button"
                      className="btn small danger"
                      onClick={() => {
                        setReviewingMsg(m);
                        setReviewComment(m.report_comment || "");
                      }}
                    >
                      🔄 На доработку
                    </button>
                  )}
                </div>
              )}

              {/* Реакции под сообщением */}
              {hasReactions && (
                <div className="chat-reactions-row">
                  {Object.entries(reactions).map(([emoji, r]) => (
                    <button
                      key={emoji}
                      type="button"
                      className={"chat-reaction-chip " + (r.reacted ? "active" : "")}
                      onClick={() => handleReact(m.id, emoji)}
                      title={r.users.map((u) => u.name).join(", ")}
                    >
                      <span>{emoji}</span>
                      <span className="count">{r.count}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Панель действий сообщения (Ответить + Реакции) */}
              <div className={"chat-msg-actions" + (activeEmojiPicker === m.id ? " has-active-picker" : "")}>
                <button
                  type="button"
                  className="chat-action-btn"
                  onClick={() => setReplyingTo({ id: m.id, user_name: m.user_name, text: m.text })}
                  title="Ответить на сообщение"
                >
                  ↩
                </button>
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    className="chat-action-btn"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveEmojiPicker(activeEmojiPicker === m.id ? null : m.id);
                    }}
                    title="Поставить реакцию"
                  >
                    😀+
                  </button>
                  {activeEmojiPicker === m.id && (
                    <div
                      className="chat-emoji-picker"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {STANDARD_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="chat-emoji-btn"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReact(m.id, emoji);
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Модальное окно комментария к доработке отчёта */}
      {reviewingMsg && (
        <div className="chat-review-prompt">
          <div className="chat-review-prompt-inner card">
            <b>Отправить отчёт на доработку</b>
            <p className="muted small" style={{ margin: "4px 0 8px" }}>
              Укажите замечания для ученика <b>{reviewingMsg.user_name}</b>:
            </p>
            <textarea
              rows={3}
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Например: Пожалуйста, дополните ответ на второй вопрос конспекта..."
              style={{ width: "100%", boxSizing: "border-box", fontSize: 13 }}
            />
            <div className="row" style={{ marginTop: 8, justifyContent: "flex-end", gap: 6 }}>
              <button
                type="button"
                className="btn small ghost"
                onClick={() => setReviewingMsg(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn small danger"
                onClick={() => handleReviewReport(reviewingMsg.id, "rejected", reviewComment)}
              >
                Вернуть на доработку
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Панель цитируемого сообщения перед отправкой */}
      {replyingTo && (
        <div className="chat-reply-bar">
          <span className="chat-reply-icon">↩</span>
          <div className="chat-reply-preview">
            <b>{replyingTo.user_name}</b>
            <span>{replyingTo.text.slice(0, 90)}</span>
          </div>
          <button
            type="button"
            className="chat-reply-cancel"
            onClick={() => setReplyingTo(null)}
            title="Отменить ответ"
          >
            ✕
          </button>
        </div>
      )}

      <form className="chat-form" onSubmit={send} style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          {isReport ? (
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                themeMaterials && themeMaterials.length > 0
                  ? (() => {
                      const cur = themeMaterials.find((m) => m.id === (reportMaterialId || themeMaterials[0]?.id)) || themeMaterials[0];
                      const num = cur ? (cur.order_index || themeMaterials.indexOf(cur) + 1) : 1;
                      return `Напишите отчёт по Уроку ${num} («${cur?.title || "Урок"}»)...`;
                    })()
                  : "Напишите ваш отчёт по уроку (ответы на вопросы, ключевые мысли, выводы)..."
              }
              style={{
                width: "100%",
                boxSizing: "border-box",
                fontSize: 13,
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
          ) : (
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                replyingTo
                  ? `Ответ для ${replyingTo.user_name}...`
                  : "Написать в обсуждение..."
              }
            />
          )}

          {themeId && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label className="chat-report-toggle" style={{ userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={isReport}
                  onChange={(e) => setIsReport(e.target.checked)}
                />
                <span>📝 <b>Сдать как отчёт по уроку</b> (попадёт в статистику успеваемости)</span>
              </label>

              {isReport && themeMaterials && themeMaterials.length > 0 && (() => {
                const defaultMat = themeMaterials.find((m) => !m.no_report) || themeMaterials[0];
                const curMatId = reportMaterialId || defaultMat?.id;
                const curMat = themeMaterials.find((m) => m.id === curMatId) || defaultMat;
                const curNum = curMat ? (curMat.order_index || themeMaterials.indexOf(curMat) + 1) : 1;
                const rep = curMat?.report;

                return (
                  <div style={{
                    padding: "10px 12px",
                    background: "#fffdf5",
                    border: "1px solid #fef3c7",
                    borderRadius: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
                      <span>🎯 Выберите урок темы, по которому вы сдаёте отчёт:</span>
                      <span className="muted small" style={{ fontWeight: 400, color: "#b45309" }}>
                        (всего уроков в теме: {themeMaterials.length})
                      </span>
                    </div>

                    {/* Быстрые кнопки выбора урока (сокращённо) */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {themeMaterials.map((mat, idx) => {
                        const num = mat.order_index || idx + 1;
                        const isSelected = mat.id === curMatId;
                        const status = mat.report?.status;
                        const statusIcon = status === "accepted" ? "✅" : status === "pending" ? "⏳" : status === "rejected" ? "🔄" : "";

                        return (
                          <button
                            key={mat.id}
                            type="button"
                            className={"btn small " + (isSelected ? "gold" : "ghost")}
                            style={{
                              padding: "4px 10px",
                              fontSize: 12,
                              fontWeight: isSelected ? 700 : 500,
                              borderRadius: 6,
                              borderColor: isSelected ? "#b45309" : "#cbd5e1",
                              background: isSelected ? "#fef3c7" : "#fff",
                              color: isSelected ? "#78350f" : "var(--navy)",
                              boxShadow: isSelected ? "0 1px 3px rgba(180, 83, 9, 0.2)" : "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                            onClick={() => setReportMaterialId(mat.id)}
                            title={`Урок ${num}: ${mat.title}${mat.no_report ? " (отчёт не требуется)" : ""}${status === "accepted" ? " (Зачтён)" : status === "pending" ? " (На проверке)" : status === "rejected" ? " (На доработке)" : ""}`}
                          >
                            <span>Урок {num}</span>
                            {statusIcon && <span style={{ fontSize: 11 }}>{statusIcon}</span>}
                            {mat.no_report && !statusIcon && (
                              <span style={{ fontSize: 10, opacity: 0.7 }}>[без отчёта]</span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Выпадающий список уроков с полными названиями */}
                    <select
                      value={curMatId || ""}
                      onChange={(e) => setReportMaterialId(Number(e.target.value))}
                      style={{
                        fontSize: 13,
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid #cbd5e1",
                        background: "#fff",
                        color: "var(--navy)",
                        fontWeight: 500,
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      {themeMaterials.map((mat, idx) => {
                        const num = mat.order_index || idx + 1;
                        const hasAccepted = mat.report?.status === "accepted";
                        const hasPending = mat.report?.status === "pending";
                        const hasRejected = mat.report?.status === "rejected";
                        const statusMark = hasAccepted
                          ? " — ✅ Зачтён"
                          : hasPending
                          ? " — ⏳ На проверке"
                          : hasRejected
                          ? " — 🔄 На доработке"
                          : mat.no_report
                          ? " — ℹ️ Без обязательного отчёта"
                          : "";
                        return (
                          <option key={mat.id} value={mat.id}>
                            Урок {num}: {mat.title}{statusMark}
                          </option>
                        );
                      })}
                    </select>

                    {/* Карточка выбранного урока */}
                    {curMat && (
                      <div style={{
                        padding: "6px 10px",
                        background: "rgba(254, 243, 199, 0.5)",
                        borderRadius: 6,
                        fontSize: 12,
                        color: "#78350f",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}>
                        <div>
                          <b>Выбран:</b> Урок №{curNum}: «{curMat.title}»
                          {curMat.no_report && (
                            <span style={{ marginLeft: 6, padding: "1px 5px", background: "#f3f4f6", color: "#4b5563", borderRadius: 4, fontSize: 11 }}>
                              Без отчёта
                            </span>
                          )}
                        </div>
                        {curMat.no_report && (
                          <div style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>
                            ℹ️ По этому уроку отчёт не является обязательным для сдачи темы.
                          </div>
                        )}
                        {rep && (
                          <div style={{ fontSize: 11, color: rep.status === "accepted" ? "#15803d" : rep.status === "rejected" ? "#b91c1c" : "#b45309" }}>
                            Текущий статус отчёта: {rep.status === "accepted" ? "✅ Зачтён" : rep.status === "rejected" ? "🔄 Требует доработки" : "⏳ На проверке деканом"}
                            {rep.comment && ` (Замечание: «${rep.comment}»)`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
        <button
          className={"btn " + (isReport ? "gold" : "primary")}
          disabled={!text.trim()}
          style={{ alignSelf: "flex-start", marginTop: 2, whiteSpace: "nowrap" }}
        >
          {isReport
            ? (() => {
                const cur = themeMaterials?.find((m) => m.id === (reportMaterialId || themeMaterials[0]?.id));
                const num = cur ? (cur.order_index || themeMaterials.indexOf(cur) + 1) : 1;
                return `Сдать отчёт (Урок ${num})`;
              })()
            : "Отправить"}
        </button>
      </form>
      {err && <div className="error small">{err}</div>}
    </div>
  );
}
