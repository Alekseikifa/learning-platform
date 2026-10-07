// Единые идентификаторы вкладок мониторинга и маппинг старых ссылок.
// Старые id (students / progress / reports / mon_*) продолжают работать в URL.
import { useEffect, useState } from "react";
import { api } from "../api";

export const MONITORING_TABS = [
  { id: "progress", label: "Прогресс" },
  { id: "review", label: "Проверка" },
  { id: "attempts", label: "Попытки" },
  { id: "analytics", label: "Аналитика" },
];

const LEGACY = {
  students: "progress",
  mon_students: "progress",
  progress: "progress",
  mon_progress: "progress",
  reports: "review",
  mon_reports: "review",
  attempts: "attempts",
  mon_attempts: "attempts",
  analytics: "analytics",
  mon_analytics: "analytics",
};

export const normalizeMonitoringTab = (t) => LEGACY[t] || t;

export const isMonitoringTab = (t) => MONITORING_TABS.some((m) => m.id === t);

// оставить в URL только нужные параметры мониторинга
export const setMonitoringParams = (searchParams, updates) => {
  const next = new URLSearchParams(searchParams);
  Object.entries(updates).forEach(([k, v]) => {
    if (v === null || v === undefined || v === "") next.delete(k);
    else next.set(k, String(v));
  });
  return next;
};

// Deep-link вида ?tab=progress&theme=19 / ?tab=review&student=8&theme=19:
// сначала подбираем группу по курсу темы, и только потом отдаём вкладку —
// иначе фильтр/чат применялись бы к группе по умолчанию и тут же сгорали.
// Вызывать ДО эффекта, выставляющего группу по умолчанию.
export const useThemeGroupReady = (searchParams, tab, groups, setGroupId) => {
  const themeId = ["progress", "review"].includes(tab) ? searchParams.get("theme") : null;
  const [ready, setReady] = useState(() => !(themeId && groups.length));
  useEffect(() => {
    if (!themeId || !groups.length) {
      setReady(true);
      return undefined;
    }
    let alive = true;
    setReady(false);
    api(`/api/public/theme/${themeId}`)
      .then((th) => {
        const m = groups.find((g) => g.course_id === th.course_id);
        if (alive && m) setGroupId(String(m.id));
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [themeId, groups, setGroupId]);
  return ready;
};

