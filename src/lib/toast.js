const listeners = new Set();
let nextId = 1;

export function addToast(message, type = "info", duration = 4000) {
  if (!message) return;
  const str = String(message);
  
  // Smartly determine type if default "info"
  let resolvedType = type;
  if (type === "info") {
    const lower = str.toLowerCase();
    if (lower.includes("ошибк") || lower.includes("не удалось") || lower.includes("неверн") || lower.includes("заполните") || lower.includes("слишком коротк")) {
      resolvedType = "error";
    } else if (lower.includes("успешн") || lower.includes("сохранен") || lower.includes("восстановлен") || lower.includes("изменён") || lower.includes("изменен") || lower.includes("прикреплен") || lower.includes("импортирован")) {
      resolvedType = "success";
    } else if (lower.includes("внимание") || lower.includes("предупрежд")) {
      resolvedType = "warning";
    }
  }

  const item = {
    id: nextId++,
    message: str,
    type: resolvedType,
    duration,
    createdAt: Date.now(),
  };

  listeners.forEach((fn) => {
    try {
      fn({ action: "add", item });
    } catch (e) {
      console.error("Toast listener error", e);
    }
  });

  return item.id;
}

export function removeToast(id) {
  listeners.forEach((fn) => {
    try {
      fn({ action: "remove", id });
    } catch (e) {
      console.error("Toast listener error", e);
    }
  });
}

export function subscribeToasts(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export const toast = {
  info: (msg, duration) => addToast(msg, "info", duration),
  success: (msg, duration) => addToast(msg, "success", duration),
  error: (msg, duration) => addToast(msg, "error", duration),
  warning: (msg, duration) => addToast(msg, "warning", duration),
};

// Safe interception for window.alert in iFrame to prevent blocking popups
if (typeof window !== "undefined") {
  window.appToast = toast;
  window.alert = (msg) => {
    addToast(msg, "info");
  };
}
