import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertCircle, Check, X } from 'lucide-react';
import { commonMessages } from '../i18n/common';
import { useLocale, useMessages } from '../i18n/locale';
import { joinClassNames } from '../utils/format';

type CardProps = {
  readonly children: ReactNode;
  readonly className?: string;
  readonly as?: 'article' | 'section' | 'div';
};

export function Card({ children, className, as: Element = 'section' }: CardProps) {
  return <Element className={joinClassNames('card', className)}>{children}</Element>;
}

type CardHeaderProps = {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly eyebrow?: string;
  readonly action?: ReactNode;
  readonly className?: string;
};

export function CardHeader({ title, description, eyebrow, action, className }: CardHeaderProps) {
  return (
    <header className={joinClassNames('card__header', className)}>
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </header>
  );
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

export function IconButton({ className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={joinClassNames('icon-button', className)} type={type} {...props} />;
}

type MoneyProps = {
  readonly amountMinor: number;
  readonly signed?: boolean;
  readonly className?: string;
};

export function Money({ amountMinor, signed = false, className }: MoneyProps) {
  const { format } = useLocale();
  const prefix = signed && amountMinor > 0 ? '+' : '';
  return (
    <span className={joinClassNames('money', className)}>
      {prefix}
      {format.money(amountMinor)}
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
  readonly variant?: 'dialog' | 'sheet';
  readonly onClose: () => void;
};

export function Modal({
  open,
  title,
  description,
  children,
  footer,
  size = 'medium',
  variant = 'dialog',
  onClose,
}: ModalProps) {
  const t = useMessages(commonMessages);
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
      className={joinClassNames('modal', `modal--${size}`, variant === 'sheet' && 'modal--sheet')}
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
          <IconButton aria-label={t('closeDialog', { title })} onClick={onClose}>
            <X aria-hidden="true" size={20} />
          </IconButton>
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
  const t = useMessages(commonMessages);
  return (
    <div className="skeleton" aria-label={t('loading')} role="status">
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
  const t = useMessages(commonMessages);
  return (
    <div className={`toast toast--${tone}`}>
      {tone === 'success' ? <Check aria-hidden="true" size={18} /> : <AlertCircle aria-hidden="true" size={18} />}
      <span>{message}</span>
      <button type="button" aria-label={t('dismissNotification')} onClick={onDismiss}>
        <X aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

export function SessionEndedNotice({ onReload }: { readonly onReload: () => void }) {
  const t = useMessages(commonMessages);
  return (
    <div className="session-ended" role="alert">
      <AlertCircle aria-hidden="true" size={18} />
      <div>
        <strong>{t('sessionEndedTitle')}</strong>
        <p>{t('sessionEndedBody')}</p>
      </div>
      <Button variant="ghost" onClick={onReload}>
        {t('reload')}
      </Button>
    </div>
  );
}

export function LoadError({ code, onRetry }: { readonly code: string; readonly onRetry: () => void }) {
  const t = useMessages(commonMessages);
  const stale = code === 'CONFLICT';
  return (
    <div className="load-error" role="alert">
      <AlertCircle aria-hidden="true" size={20} />
      <div>
        <strong>{stale ? t('loadStaleTitle') : t('loadFailedTitle')}</strong>
        <p>{stale ? t('loadStaleBody') : t('loadFailedBody')}</p>
      </div>
      <Button variant="ghost" onClick={onRetry}>
        {t('tryAgain')}
      </Button>
    </div>
  );
}
