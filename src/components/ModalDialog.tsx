import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalDialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A window in front of the page, like Pay and Add an expense: it opens when it
 * appears, Esc and Close both close it, and it starts in its first field.
 * Show it only while it should be open.
 */
export function ModalDialog({ title, onClose, children }: ModalDialogProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null || dialog.open) return;
    dialog.showModal();
    // showModal focuses the first button (Close); start in the first field instead.
    dialog.querySelector('input')?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="expense-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        // Esc: we close it ourselves, so React's state and the dialog agree.
        event.preventDefault();
        onClose();
      }}
    >
      <div className="expense-dialog-head">
        <h2 id={`${id}-title`} className="expense-dialog-title">
          {title}
        </h2>
        <button type="button" className="button-text" onClick={onClose}>
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}
