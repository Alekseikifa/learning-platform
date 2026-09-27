import { lazy, Suspense, createElement } from "react";

const load = () => import("./MonitoringTabs");

const named = (name) =>
  lazy(async () => ({ default: (await load())[name] }));

const withSuspense = (Comp) => {
  function Wrapped(props) {
    return createElement(Suspense, { fallback: null }, createElement(Comp, props));
  }
  return Wrapped;
};

// recharts (~300 КБ) уезжает отдельным чанком и подгружается только при открытии мониторинга
export const StudentsTab = withSuspense(named("StudentsTab"));
export const ProgressTable = withSuspense(named("ProgressTable"));
export const AttemptsTab = withSuspense(named("AttemptsTab"));
export const AnalyticsTab = withSuspense(named("AnalyticsTab"));
