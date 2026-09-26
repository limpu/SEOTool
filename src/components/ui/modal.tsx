"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The app's one dialog. Replaces three copy-pasted hand-rolled dialogs
 * (delete-account, delete-website, upgrade-package) that each re-implemented
 * the backdrop, the panel and the `role="dialog"` wiring slightly differently
 * and none of which handled Escape, scroll lock or focus.
 *
 * Behaviour this adds over what it replaced:
 *
 *  - **Escape closes.** Routed through the same `onClose` the backdrop and
 *    Cancel use, so a submitting dialog that refuses to close still refuses
 *    to close via Escape — the guard lives at the call site, in one place.
 *  - **Body scroll lock** while open, restored to whatever it was before
 *    (not blindly to `""`), so nested/sequential dialogs can't strand the
 *    page unscrollable.
 *  - **Focus moves into the dialog on open and returns to the trigger on
 *    close.** Without the restore, closing a modal drops keyboard focus back
 *    to `<body>` and the user loses their place entirely.
 *  - **Focus trap on Tab/Shift+Tab**, wrapping at both ends, so keyboard
 *    focus cannot wander behind the backdrop into inert content.
 *
 * `tone="destructive"` only changes the panel border and title ink — it is an
 * ACTION signal (`--destructive`), never `--status-critical`, which is
 * reserved for measurements.
 */
export function Modal({
  open,
  onClose,
  title,
  tone = "neutral",
  children,
  footer,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  tone?: "neutral" | "destructive";
  children: ReactNode;
  /** Right-aligned action row. Kept a slot so each call site owns its own buttons. */
  footer?: ReactNode;
  /** Explicit id for the title element, when a call site needs to reference it. */
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const generatedId = useId();
  const titleId = labelledBy ?? `${generatedId}-title`;

  // Latest-value ref so the key handler never closes over a stale `onClose`.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCloseRef.current();
      return;
    }

    if (event.key !== "Tab") return;

    const panel = panelRef.current;
    if (!panel) return;

    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => element.offsetParent !== null || element === document.activeElement
    );
    if (focusable.length === 0) {
      // Nothing tabbable inside — keep focus pinned on the panel rather than
      // letting Tab escape to the inert page behind the backdrop.
      event.preventDefault();
      panel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the panel itself rather than the first control: on a destructive
    // dialog the first control may be the delete button, and auto-focusing
    // that is how people delete things by reflex.
    panelRef.current?.focus();

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        tabIndex={-1}
        className="absolute inset-0 bg-primary/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border bg-surface p-6 shadow-xl focus:outline-none ${
          tone === "destructive" ? "border-destructive-border" : "border-default"
        }`}
      >
        <h2
          id={titleId}
          className={`text-lg font-bold ${tone === "destructive" ? "text-destructive" : "text-foreground"}`}
        >
          {title}
        </h2>

        {children}

        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
