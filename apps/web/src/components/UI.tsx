import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Icon } from './Icon';
import { initials, fmtDelta } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { copyText } from '../lib/format';
import { useToast } from '../lib/toast';

/* ------------------------------- page header ------------------------------- */

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow ? <div className="eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div> : null}
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

/* --------------------------------- card ---------------------------------- */

export function Card({
  title,
  subtitle,
  action,
  children,
  className,
  flush,
  style,
  bodyStyle,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  flush?: boolean;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
}) {
  return (
    <section className={`card ${flush ? 'flush' : ''} ${className ?? ''}`} style={style}>
      {title || action ? (
        <div className="card-head" style={flush ? { padding: '16px 18px 0', marginBottom: 12 } : undefined}>
          <div>
            <div className="card-title">{title}</div>
            {subtitle ? <div className="card-sub">{subtitle}</div> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div style={bodyStyle}>{children}</div>
    </section>
  );
}

/* -------------------------------- avatars -------------------------------- */

export function Avatar({
  name,
  color,
  size = 'md',
}: {
  name: string;
  color?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span className={`avatar ${size}`} style={{ background: color ?? '#6366F1' }} title={name}>
      {initials(name)}
    </span>
  );
}

/* -------------------------------- badges --------------------------------- */

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone ?? ''}`}>{children}</span>;
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  draft: 'calendar.status.draft',
  idea: 'calendar.status.idea',
  review: 'calendar.status.review',
  approved: 'calendar.status.approved',
  scheduled: 'calendar.status.scheduled',
  published: 'calendar.status.published',
  archived: 'calendar.status.archived',
  connected: 'connections.status.connected',
  attention: 'connections.status.attention',
  expired: 'connections.status.expired',
  error: 'connections.status.error',
  active: 'campaigns.status.active',
  paused: 'campaigns.status.paused',
  completed: 'campaigns.status.completed',
  granted: 'audience.consent.granted',
  revoked: 'audience.consent.revoked',
  pending: 'audience.consent.pending',
  customer: 'audience.customer',
  prospect: 'audience.prospect',
  positive: 'audience.sentiment.positive',
  neutral: 'audience.sentiment.neutral',
  negative: 'audience.sentiment.negative',
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const key = STATUS_LABEL_KEYS[status];
  return (
    <span className={`badge ${status}`}>
      <span className="dot" />
      {key ? t(key) : status}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const { t } = useI18n();
  return <span className={`badge ${role}`}>{t(`common.role.${role}`)}</span>;
}

export function Delta({ value, suffix }: { value: number; suffix?: string }) {
  const tone = value > 0.05 ? 'up' : value < -0.05 ? 'down' : 'flat';
  return (
    <span className={`delta ${tone}`}>
      {tone !== 'flat' ? <Icon name={value > 0 ? 'trend-up' : 'trend-down'} size={11} strokeWidth={2.2} /> : null}
      {fmtDelta(value)}
      {suffix ? <span style={{ fontWeight: 400, opacity: 0.8 }}>{suffix}</span> : null}
    </span>
  );
}

/* -------------------------------- progress -------------------------------- */

export function Progress({ value, tone }: { value: number; tone?: 'warn' | 'danger' }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className={`progress ${tone ?? ''}`}>
      <span style={{ width: `${width}%` }} />
    </div>
  );
}

/* --------------------------------- empty --------------------------------- */

export function Empty({
  icon = 'layers',
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name={icon} size={30} strokeWidth={1.4} />
      <strong>{title}</strong>
      {hint ? <span className="small" style={{ maxWidth: 340 }}>{hint}</span> : null}
      {action}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | string; style?: CSSProperties }) {
  return <div className="skeleton" style={{ height, width, ...style }} />;
}

/* --------------------------------- fields -------------------------------- */

export function Field({
  label,
  hint,
  children,
  style,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <label className="field" style={style}>
      <span className="label">
        {label} {hint ? <span className="hint">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

/* --------------------------------- modal --------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <div className="card-title" style={{ fontSize: 16 }}>{title}</div>
            {subtitle ? <div className="card-sub">{subtitle}</div> : null}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="drawer-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div style={{ minWidth: 0 }}>
            <div className="card-title" style={{ fontSize: 15.5 }}>{title}</div>
            {subtitle ? <div className="card-sub">{subtitle}</div> : null}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={17} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? <div className="drawer-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/* -------------------------------- confirm -------------------------------- */

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button className="btn" onClick={onCancel}>{t('common.cancel')}</button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>
            {confirmLabel ?? t('common.confirm')}
          </button>
        </>
      }
    >
      {body ? <p className="small muted" style={{ lineHeight: 1.7 }}>{body}</p> : null}
    </Modal>
  );
}

/* --------------------------------- tabs ---------------------------------- */

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: string; label: string; icon?: string }>;
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`tab ${active === tab.key ? 'active' : ''}`}
          onClick={() => onChange(tab.key)}
          role="tab"
          aria-selected={active === tab.key}
        >
          <span className="row" style={{ gap: 6 }}>
            {tab.icon ? <Icon name={tab.icon} size={15} /> : null}
            {tab.label}
          </span>
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- copy ---------------------------------- */

export function CopyButton({
  text,
  label,
  small,
  className,
}: {
  text: string;
  label?: string;
  small?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const onCopy = async () => {
    try {
      await copyText(text);
      toast.push(t('common.copied'));
    } catch {
      toast.push(t('error.generic'), { kind: 'error' });
    }
  };
  return (
    <button className={`btn ${small ? 'sm' : ''} ${className ?? ''}`} onClick={onCopy} type="button">
      <Icon name="copy" size={small ? 13 : 15} />
      {label ?? t('common.copy')}
    </button>
  );
}

/* --------------------------------- misc ---------------------------------- */

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: string; label: string }>;
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="btn-group">
      {options.map((option) => (
        <button key={option.key} className={value === option.key ? 'active' : ''} onClick={() => onChange(option.key)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function PageLoading() {
  const { t } = useI18n();
  return (
    <div style={{ padding: 40 }}>
      <div className="row" style={{ gap: 10, color: 'var(--muted)' }}>
        <span className="skeleton" style={{ width: 18, height: 18, borderRadius: 99 }} />
        {t('common.loading')}
      </div>
    </div>
  );
}

export function StatStrip({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <div className="stat-strip">
      {items.map((item) => (
        <div key={item.label}>
          <div className="s-label">{item.label}</div>
          <div className="s-value">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
