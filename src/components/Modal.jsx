import { useEffect, useRef } from "react";

// стек открытых модалок: Esc закрывает только верхнюю (важно для вложенных)
const modalStack = [];

/** Esc-закрытие для модалок, которые не обёрнуты в <Modal>. */
export function useModalEsc(onClose, dismissible = true) {
  const onCloseRef = useRef(onClose);
  const dismissRef = useRef(dismissible);
  onCloseRef.current = onClose;
  dismissRef.current = dismissible;

  useEffect(() => {
    const id = Symbol("modal");
    modalStack.push(id);
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (modalStack[modalStack.length - 1] !== id) return;
      if (!dismissRef.current) return;
      e.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = modalStack.indexOf(id);
      if (i >= 0) modalStack.splice(i, 1);
    };
  }, []);
}

/**
 * Универсальная модалка: закрытие по Esc и по клику на фон,
 * клик по содержимому не закрывает (stopPropagation).
 */
export default function Modal({
  onClose,
  dismissible = true,
  backdropClassName = "modal-back",
  backdropStyle,
  innerClassName = "card modal",
  innerStyle,
  children,
}) {
  useModalEsc(onClose, dismissible);

  const handleBackdrop = () => {
    if (dismissible) onClose();
  };

  return (
    <div
      className={backdropClassName}
      style={backdropStyle}
      onClick={handleBackdrop}
    >
      <div
        className={innerClassName}
        style={innerStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}
