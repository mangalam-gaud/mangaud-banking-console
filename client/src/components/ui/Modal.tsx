import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from './Button';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  // Lock background scroll and close on Escape while open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-ink/55 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full bg-card border border-border shadow-pop',
          'rounded-t-2xl sm:rounded-2xl animate-scale-in',
          'max-h-[92vh] sm:max-h-[88vh] flex flex-col',
          'safe-b sm:safe-b-0',
          SIZES[size]
        )}
      >
        {/* drag affordance on mobile sheets */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
          <span className="h-1 w-10 rounded-full bg-rule" aria-hidden="true" />
        </div>

        {title ? (
          <div className="flex items-start justify-between gap-4 px-5 pt-4 sm:pt-5 sm:px-6">
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-xl font-semibold text-text">{title}</h2>
              {description ? <p className="text-sm text-muted mt-1">{description}</p> : null}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog">
              <X className="w-5 h-5" />
            </Button>
          </div>
        ) : null}

        <div className="px-5 py-4 sm:px-6 overflow-y-auto flex-1">{children}</div>

        {footer ? (
          <div className="px-5 sm:px-6 py-4 border-t border-border flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 bg-paper/60 rounded-b-2xl">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
