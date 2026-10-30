import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { Icon } from '../components/Icon';
import { PlatformIcon } from '../components/PlatformIcon';
import { ApiError } from '../lib/api';

const DEMO_ACCOUNTS = [
  { email: 'ariya@uarea.in', name: 'อารีย์ วัฒนกุล', roleKey: 'login.demo.owner', avatar: '#6366F1' },
  { email: 'thanakrit@uarea.in', name: 'ธนกฤต ศรีสุข', roleKey: 'login.demo.admin', avatar: '#0EA5E9' },
  { email: 'priya@uarea.in', name: 'ปรียา จันทร์เพ็ญ', roleKey: 'login.demo.editor', avatar: '#F59E0B' },
  { email: 'nattapong@uarea.in', name: 'ณัฐพงษ์ ใจดี', roleKey: 'login.demo.analyst', avatar: '#10B981' },
];

const HERO_PLATFORMS = ['facebook', 'instagram', 'tiktok', 'line', 'linkedin', 'x', 'youtube', 'google_drive', 'gmail'];

export function LoginPage({ title }: { title: string }) {
  const { t, lang, setLang } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const invitedEmail = params.get('email') ?? '';
  const nextPath = params.get('next') ?? '';
  const { theme, setTheme } = useTheme();

  const [email, setEmail] = useState(invitedEmail || 'ariya@uarea.in');
  const [password, setPassword] = useState('SocialMK2026');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(nextPath.startsWith('/') ? nextPath : '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error.network'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <aside className="login-art">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark" style={{ width: 38, height: 38 }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
              <path d="M4 15.5 9.5 6l4 7 2.5-4 4 6.5" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="18.5" cy="6.5" r="2" fill="#7CF7D4" />
            </svg>
          </span>
          <div>
            <div className="brand-name">SocialMK</div>
            <div className="brand-sub">Social Marketing Command Center</div>
          </div>
        </div>

        <h1 className="login-headline">
          {lang === 'th' ? (
            <>
              ทุกช่องทางโซเชียลของคุณ
              <br />
              รวมเป็น <span>ศูนย์บัญชาการเดียว</span>
            </>
          ) : (
            <>
              Every social channel.
              <br />
              One <span>command center</span>.
            </>
          )}
        </h1>
        <p className="login-copy">{t('login.heroSub')}</p>

        <div className="login-points">
          <div className="pt">
            <b>01</b> {t('login.point1')}
          </div>
          <div className="pt">
            <b>02</b> {t('login.point2')}
          </div>
          <div className="pt">
            <b>03</b> {t('login.point3')}
          </div>
        </div>

        <div className="login-platforms">
          {HERO_PLATFORMS.map((platform) => (
            <PlatformIcon key={platform} platform={platform} size="sm" />
          ))}
          <span className="badge" style={{ background: 'rgba(255,255,255,.1)', color: '#dbdff0' }}>
            + more
          </span>
        </div>
        <p className="tiny" style={{ color: 'rgba(219,226,241,.42)', marginTop: 22 }}>
          {t('login.footer')}
        </p>
      </aside>

      <section className="login-panel">
        <div className="login-top-actions">
          <button className="icon-btn" onClick={() => setLang(lang === 'th' ? 'en' : 'th')} title={t('common.language')}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>{lang === 'th' ? 'TH' : 'EN'}</span>
          </button>
          <button className="icon-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            <Icon name={theme === 'light' ? 'moon' : 'sun'} size={17} />
          </button>
        </div>

        <div className="login-box">
          <div className="badge" style={{ background: 'var(--primary-weak)', color: 'var(--primary)', marginBottom: 14 }}>
            <span className="dot" /> SocialMK Beta
          </div>
          <h2 className="page-title" style={{ fontSize: 26 }}>{title}</h2>
          <p className="page-sub" style={{ marginBottom: 24 }}>{t('login.subtitle')}</p>

          {invitedEmail ? (
            <div className="notice info" style={{ marginBottom: 14 }}>
              <Icon name="mail" size={15} />
              <span>{t('login.inviteHint', { email: invitedEmail })}</span>
            </div>
          ) : null}

          <form onSubmit={submit} className="form-stack">
            <label className="field">
              <span className="label">{t('login.email')}</span>
              <input
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                required
                style={{ height: 42 }}
              />
            </label>
            <label className="field">
              <span className="label">{t('login.password')}</span>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
                style={{ height: 42 }}
              />
            </label>

            {error ? (
              <div className="notice danger">
                <Icon name="alert" size={16} />
                <span>{error}</span>
              </div>
            ) : null}

            <button className="btn primary block" type="submit" disabled={busy} style={{ height: 43, fontSize: 14 }}>
              {busy ? t('login.signingIn') : t('login.signIn')}
              {!busy ? <Icon name="arrow-up-right" size={16} /> : null}
            </button>
          </form>

          <div style={{ marginTop: 26 }}>
            <div className="row between">
              <span className="eyebrow">{t('login.demoTitle')}</span>
              <span className="tiny faint">{t('login.demoHint')}</span>
            </div>
            <div className="demo-accounts">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className="demo-account"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword('SocialMK2026');
                    setError('');
                  }}
                >
                  <span className="avatar sm" style={{ background: account.avatar }}>
                    {account.name.slice(0, 1)}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', color: 'var(--text)', fontWeight: 500 }}>{account.name}</span>
                    <span className="tiny faint">{account.email}</span>
                  </span>
                  <span className="role">{t(account.roleKey)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="row" style={{ gap: 6, marginTop: 22, color: 'var(--faint)' }}>
            <Icon name="lock" size={13} />
            <span className="tiny">{t('login.secure')}</span>
          </div>
          <p className="tiny faint" style={{ marginTop: 8 }}>{t('login.betaNote')}</p>
        </div>
      </section>
    </div>
  );
}
