import React, { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Stack of open modals so that only the top-most one reacts to Escape / Tab.
const modalStack: symbol[] = [];

const getFocusable = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      !el.hasAttribute('disabled') &&
      el.getAttribute('aria-hidden') !== 'true' &&
      el.getClientRects().length > 0,
  );

interface ModalProps {
  /** Defaults to true; when false nothing is rendered. */
  isOpen?: boolean;
  onClose: () => void;
  /** id of the element that labels the dialog (usually its heading). */
  labelledBy?: string;
  /** Accessible name when there is no visible heading. */
  ariaLabel?: string;
  describedBy?: string;
  /** Close when clicking the backdrop (default true). */
  closeOnBackdrop?: boolean;
  /** Close on Escape (default true). */
  closeOnEscape?: boolean;
  /** Element to focus when the dialog opens; defaults to the first focusable element. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Classes for the full-screen backdrop / positioning layer. */
  overlayClassName?: string;
  /** Classes for the dialog panel. */
  className?: string;
  children: React.ReactNode;
}

/**
 * Shared accessible modal dialog: role="dialog", aria-modal, labelled by its heading,
 * Escape to close, focus trap, focus return to the previously focused element and
 * backdrop click to close.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen = true,
  onClose,
  labelledBy,
  ariaLabel,
  describedBy,
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef,
  overlayClassName = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs',
  className = '',
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeOnEscapeRef = useRef(closeOnEscape);
  closeOnEscapeRef.current = closeOnEscape;
  const backdropPressRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    const token = Symbol('modal');
    modalStack.push(token);
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    if (panel) {
      const target = initialFocusRef?.current || getFocusable(panel)[0] || panel;
      target.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== token) return;
      const currentPanel = panelRef.current;
      if (!currentPanel) return;

      if (e.key === 'Escape') {
        if (closeOnEscapeRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onCloseRef.current();
        }
        return;
      }

      if (e.key === 'Tab') {
        const focusable = getFocusable(currentPanel);
        if (focusable.length === 0) {
          e.preventDefault();
          currentPanel.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        const outside = !active || !currentPanel.contains(active);
        if (e.shiftKey && (active === first || active === currentPanel || outside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || outside)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      const idx = modalStack.indexOf(token);
      if (idx !== -1) modalStack.splice(idx, 1);
      if (
        previouslyFocused &&
        typeof previouslyFocused.focus === 'function' &&
        document.contains(previouslyFocused)
      ) {
        previouslyFocused.focus();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={overlayClassName}
      onMouseDown={(e) => {
        backdropPressRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (closeOnBackdrop && backdropPressRef.current && e.target === e.currentTarget) {
          onClose();
        }
        backdropPressRef.current = false;
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : ariaLabel}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`focus:outline-hidden ${className}`}
      >
        {children}
      </div>
    </div>
  );
};
