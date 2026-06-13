import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Shared behavior for mobile bottom sheets: slide-in on mount, slide-out on
 * close, and drag-to-dismiss from a handle/header area.
 *
 * Usage: keep the sheet mounted while `mounted` is true; apply
 * `translateClass` + `style` to the sheet; spread `handleProps` on the drag
 * handle / header; call `requestClose()` instead of closing directly.
 */
export function useBottomSheet(open: boolean, onClose: () => void) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    if (open) {
      closingRef.current = false;
      setMounted(true);
      // Two rAFs: ensure the translate-y-full frame is committed before
      // sliding in. Guarded so a close landing mid-flight wins (a double-tap
      // would otherwise leave the sheet stuck open behind its backdrop).
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!closingRef.current) setVisible(true);
        }),
      );
    } else {
      closingRef.current = true;
      setVisible(false);
      // Fallback: if no transitionend fires (already off-screen / display
      // toggles), still unmount.
      const t = setTimeout(() => {
        if (closingRef.current) setMounted(false);
      }, 400);
      return () => clearTimeout(t);
    }
  }, [open]);

  const requestClose = useCallback(() => {
    closingRef.current = true;
    setVisible(false);
    onClose();
  }, [onClose]);

  const onTransitionEnd = useCallback((e: React.TransitionEvent) => {
    if (e.target !== e.currentTarget || e.propertyName !== "transform") return;
    if (closingRef.current) setMounted(false);
  }, []);

  const handleProps = {
    onTouchStart: (e: React.TouchEvent) => {
      dragStartY.current = e.touches[0].clientY;
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (dragStartY.current === null) return;
      setDragOffset(Math.max(0, e.touches[0].clientY - dragStartY.current));
    },
    onTouchEnd: () => {
      if (dragOffset > 80) {
        setDragOffset(0);
        requestClose();
      } else {
        setDragOffset(0);
      }
      dragStartY.current = null;
    },
  };

  const translateClass = visible && dragOffset === 0
    ? "translate-y-0"
    : dragOffset > 0
      ? ""
      : "translate-y-full";

  const style = dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined;

  return { mounted, translateClass, style, handleProps, requestClose, onTransitionEnd, dragging: dragOffset > 0 };
}
