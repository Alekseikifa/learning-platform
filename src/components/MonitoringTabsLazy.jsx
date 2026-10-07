import { lazy, Suspense, createElement } from "react";

// ProgressTab — default export, остальные — именованные экспорты MonitoringTabs
const loadNamed = (name, file) => () => import(file).then((m) => ({ default: m[name] }));
const loadDefault = (file) => () => import(file).then((m) => ({ default: m.default }));

const withSuspense = (Comp) => {
  function Wrapped(props) {
    return createElement(Suspense, { fallback: null }, createElement(Comp, props));
  }
  return Wrapped;
};

// recharts (~300 КБ) уезжает отдельным чанком и подгружается только при открытии мониторинга
export const ProgressTab = withSuspense(lazy(loadDefault("./ProgressTab")));
export const ReviewTab = withSuspense(lazy(loadNamed("ReviewTab", "./MonitoringTabs")));
export const AttemptsTab = withSuspense(lazy(loadNamed("AttemptsTab", "./MonitoringTabs")));
export const AnalyticsTab = withSuspense(lazy(loadNamed("AnalyticsTab", "./MonitoringTabs")));
