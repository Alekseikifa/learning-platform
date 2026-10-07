import { ProgressTab, ReviewTab, AttemptsTab, AnalyticsTab } from "./MonitoringTabsLazy";
import { setMonitoringParams } from "../lib/monitoringTabs";

// Общая точка рендера вкладок мониторинга для всех панелей.
// Параметры URL: view (list|matrix), student, theme.
export default function MonitoringView({
  tab,
  groupId,
  searchParams,
  setSearchParams,
  onOpenReview,
  onDirectMessage,
}) {
  if (!groupId) return null;

  const setParam = (updates) => setSearchParams(setMonitoringParams(searchParams, updates));

  if (tab === "progress") {
    return (
      <ProgressTab
        groupId={+groupId}
        initialTheme={searchParams.get("theme") || null}
        onThemeConsumed={() => setParam({ theme: null })}
        view={searchParams.get("view") === "matrix" ? "matrix" : "list"}
        onViewChange={(v) => setParam({ view: v === "list" ? null : v })}
        onOpenReview={onOpenReview}
        onDirectMessage={onDirectMessage}
      />
    );
  }

  if (tab === "review") {
    return (
      <ReviewTab
        groupId={+groupId}
        initialStudentId={searchParams.get("student")}
        initialThemeId={searchParams.get("theme")}
        onFilterConsumed={() => setParam({ student: null, theme: null })}
      />
    );
  }

  if (tab === "attempts") return <AttemptsTab groupId={+groupId} />;
  if (tab === "analytics") return <AnalyticsTab groupId={+groupId} />;
  return null;
}
