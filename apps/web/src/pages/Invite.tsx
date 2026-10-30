import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { fmtDate, relativeTime } from '../lib/format';
import { Icon } from '../components/Icon';
import { Badge } from '../components/UI';

interface InviteInfo {
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  workspaceName: string;
  workspaceSlug: string;
  invitedBy: string | null;
  createdAt: string;
  expiresInDays: number;
}

export function InvitePage() {
  const { token = '' } = useParams();
  const { t, lang } = useI18n();
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<InviteInfo>(`/auth/invites/${token}`);
      setInvite(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error.generic'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const loginUrl = `/login?email=${encodeURIComponent(invite?.email ?? '')}&next=${encodeURIComponent(`/invite/${token}`)}`;
  const matches = Boolean(user && invite && user.email.toLowerCase() === invite.email.toLowerCase());

  const accept = async () => {
    setBusy(true);
    try {
      await api.post(`/auth/invites/${token}/accept`);
      toast.push(t('invite.acceptedToast'));
      setInvite((prev) => (prev ? { ...prev, status: 'accepted' } : prev));
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : t('error.generic'), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const enter = () => {
    window.location.assign('/');
  };

  const switchAccount = async () => {
    await logout();
    navigate(loginUrl, { replace: true });
  };

  return (
    <div className="invite-shell">
      <div className="invite-card card">
        <div className="row" style={{ gap: 10 }}>
          <span className="brand-mark" style={{ width: 34, height: 34 }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path d="M4 15.5 9.5 6l4 7 2.5-4 4 6.5" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="18.5" cy="6.5" r="2" fill="#7CF7D4" />
            </svg>
          </span>
          <div>
            <div className="brand-name" style={{ color: 'var(--text)' }}>SocialMK</div>
            <div className="tiny faint">{t('invite.badge')}</div>
          </div>
        </div>

        {loading ? (
          <p className="small muted" style={{ marginTop: 22 }}>{t('common.loading')}</p>
        ) : error ? (
          <>
            <h1 className="page-title" style={{ fontSize: 22, marginTop: 22 }}>{t('invite.invalid')}</h1>
            <p className="small muted" style={{ marginTop: 6 }}>{error}</p>
            <button className="btn" style={{ marginTop: 18 }} onClick={() => navigate('/')}>{t('invite.backHome')}</button>
          </>
        ) : invite ? (
          <>
            <h1 className="page-title" style={{ fontSize: 22, marginTop: 22 }}>
              {invite.status === 'accepted' ? t('invite.accepted') : t('invite.title')}
            </h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              {t(invite.status === 'accepted' ? 'invite.acceptedBody' : 'invite.subtitle', { workspace: invite.workspaceName })}
            </p>

            <div className="invite-facts">
              <div>
                <span className="tiny faint">{t('invite.workspace')}</span>
                <div className="small strong">{invite.workspaceName}</div>
              </div>
              <div>
                <span className="tiny faint">{t('invite.role')}</span>
                <div><Badge tone={invite.role}>{t(`common.role.${invite.role}`)}</Badge></div>
              </div>
              <div>
                <span className="tiny faint">{t('invite.email')}</span>
                <div className="small">{invite.email}</div>
              </div>
              <div>
                <span className="tiny faint">{t('invite.invitedBy')}</span>
                <div className="small">{invite.invitedBy ?? '—'}</div>
              </div>
            </div>

            <p className="tiny faint" style={{ marginTop: 12 }}>
              {invite.status === 'pending'
                ? t('invite.validFor', { days: invite.expiresInDays })
                : `${t('invite.sentAt')} ${fmtDate(invite.createdAt, lang)} · ${relativeTime(invite.createdAt, lang)}`}
            </p>

            {invite.status === 'pending' && matches ? (
              <button className="btn primary block" style={{ marginTop: 18 }} onClick={accept} disabled={busy}>
                <Icon name="check" size={15} /> {busy ? t('invite.accepting') : t('invite.accept')}
              </button>
            ) : null}

            {invite.status === 'pending' && !user ? (
              <>
                <button className="btn primary block" style={{ marginTop: 18 }} onClick={() => navigate(loginUrl)}>
                  {t('invite.loginToAccept')}
                </button>
                <p className="tiny faint" style={{ marginTop: 8 }}>{t('invite.loginHint')}</p>
              </>
            ) : null}

            {invite.status === 'pending' && user && !matches ? (
              <>
                <div className="notice info" style={{ marginTop: 16 }}>
                  <Icon name="alert" size={15} />
                  <span>{t('invite.wrongUser', { email: invite.email })}</span>
                </div>
                <button className="btn block" style={{ marginTop: 12 }} onClick={switchAccount}>
                  {t('invite.switchAccount')}
                </button>
              </>
            ) : null}

            {invite.status === 'accepted' ? (
              <button className="btn primary block" style={{ marginTop: 18 }} onClick={enter}>
                <Icon name="arrow-up-right" size={15} /> {t('invite.goToWorkspace')}
              </button>
            ) : null}

            {invite.status === 'expired' || invite.status === 'revoked' ? (
              <div className="notice warn" style={{ marginTop: 16 }}>
                <Icon name="alert" size={15} />
                <span>{t('invite.notPending')}</span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <p className="tiny faint">{t('login.footer')}</p>
    </div>
  );
}
