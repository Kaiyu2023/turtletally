import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertCircle, Check, X } from 'lucide-react';
import { formatMoney, joinClassNames } from '../utils/format';

type CardProps = {
  readonly children: ReactNode;
  readonly className?: string;
  readonly as?: 'article' | 'section' | 'div';
};

export function Card({ children, className, as: Element = 'section' }: CardProps) {
  return <Element className={joinClassNames('card', className)}>{children}</Element>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  readonly busy?: boolean;
};

export function Button({ children, className, variant = 'secondary', busy = false, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={joinClassNames('button', `button--${variant}`, className)}
      disabled={disabled || busy}
      {...props}
    >
      {busy ? <span className="spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

type MoneyProps = {
  readonly amountMinor: number;
  readonly signed?: boolean;
  readonly className?: string;
};

export function Money({ amountMinor, signed = false, className }: MoneyProps) {
  const prefix = signed && amountMinor > 0 ? '+' : '';
  return (
    <span className={joinClassNames('money', className)}>
      {prefix}
      {formatMoney(amountMinor)}
    </span>
  );
}

type BadgeProps = {
  readonly children: ReactNode;
  readonly tone?: 'neutral' | 'positive' | 'warning' | 'negative' | 'info';
};

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

type ProgressBarProps = {
  readonly value: number;
  readonly label: string;
  readonly tone?: 'primary' | 'warning' | 'negative';
};

export function ProgressBar({ value, label, tone = 'primary' }: ProgressBarProps) {
  const bounded = Math.min(Math.max(value, 0), 1);
  return (
    <div
      className="progress"
      aria-label={label}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(bounded * 100)}
    >
      <span className={`progress__fill progress__fill--${tone}`} style={{ width: `${bounded * 100}%` }} />
    </div>
  );
}

type ModalProps = {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly size?: 'small' | 'medium' | 'large';
  readonly onClose: () => void;
};

export function Modal({ open, title, description, children, footer, size = 'medium', onClose }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={`modal modal--${size}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="modal__surface">
        <header className="modal__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button className="icon-button" type="button" aria-label={`Close ${title}`} onClick={onClose}>
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}

type PageHeaderProps = {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description: string;
  readonly actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="page-header page-enter">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

type EmptyStateProps = {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
};

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-state__icon">{icon}</div> : null}
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { readonly lines?: number }) {
  return (
    <div className="skeleton" aria-label="Loading" role="status">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

type ToastProps = {
  readonly message: string;
  readonly tone?: 'success' | 'error';
  readonly onDismiss: () => void;
};

export function Toast({ message, tone = 'success', onDismiss }: ToastProps) {
  return (
    <div className={`toast toast--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {tone === 'success' ? <Check aria-hidden="true" size={18} /> : <AlertCircle aria-hidden="true" size={18} />}
      <span>{message}</span>
      <button type="button" aria-label="Dismiss notification" onClick={onDismiss}>
        <X aria-hidden="true" size={16} />
      </button>
    </div>
  );
}
