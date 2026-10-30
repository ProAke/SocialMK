import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, type Post } from '../lib/api';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { relativeTime } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Icon } from './Icon';
import { Avatar, Modal } from './UI';

interface NavItem {
  to: string;
  icon: string;
  label: string;
  exact?: boolean;
  adminOnly?: boolean;
}

const NAV: Array<{ section: string; items: NavItem[] }> = [
  {
    section: 'nav.group.workspace',
    items: [{ to: '/', icon: 'overview', label: 'nav.overview', exact: true }],
  },
  {
    section: 'nav.group.content',
    items: [
      { to: '/calendar', icon: 'calendar', label: 'nav.calendar' },
      { to: '/studio', icon: 'sparkles', label: 'nav.studio' },
    ],
  },
  {
    section: 'nav.group.growth',
    items: [
      { to: '/campaigns', icon: 'megaphone', label: 'nav.campaigns' },
      { to: '/analytics', icon: 'chart', label: 'nav.analytics' },
      { to: '/audience', icon: 'users', label: 'nav.audience' },
    ],
  },
  {
    section: 'nav.group.admin',
    items: [
      { to: '/connections', icon: 'plug', label: 'nav.connections' },
      { to: '/team', icon: 'team', label: 'nav.team' },
      { to: '/developers', icon: 'code', label: 'nav.developers', adminOnly: true },
      { to: '/settings', icon: 'settings', label: 'nav.settings' },
    ],
  },
];

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  detail: string;
  at: string;
  href?: string;
}

export function AppShell() {
  const { t, lang, setLang } = useI18n();
  const { user, workspace, workspaces, switchWorkspace, logout, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const [wsOpen, setWsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Post[]>([]);
  const [searching, setSearching] = useState(false);
  const wsRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const items = await api.get<NotificationItem[]>('/notifications');
      setNotifications(items);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    const interval = window.setInterval(loadNotifications, 90_000);
    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    setWsOpen(false);
    setUserOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!wsRef.current?.contains(target) && !topRef.current?.contains(target)) {
        setWsOpen(false);
        setUserOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const posts = await api.get<Post[]>('/posts', { q: query.trim(), limit: 8 });
        setResults(posts);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 260);
    return () => window.clearTimeout(timer);
  }, [query, searchOpen]);

  const navMatches = useMemo(() => {
    const flat = NAV.flatMap((group) => group.items);
    if (!query.trim()) return flat.slice(0, 6);
    const q = query.toLowerCase();
    return flat.filter((item) => t(item.label).toLowerCase().includes(q));
  }, [query, t]);

  const go = (path: string) => {
    setSearchOpen(false);
    setQuery('');
    navigate(path);
  };

  const userInitialsColor = user?.avatarColor ?? '#6366F1';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 15.5 9.5 6l4 7 2.5-4 4 6.5" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="18.5" cy="6.5" r="2" fill="#7CF7D4" />
            </svg>
          </span>
          <div className="brand-text">
            <div className="brand-name">SocialMK</div>
            <div className="brand-sub">Command Center</div>
          </div>
        </div>

        <div className="workspace-switch" ref={wsRef}>
          <button onClick={() => setWsOpen((open) => !open)} aria-haspopup="menu" aria-expanded={wsOpen}>
            <span
              className="avatar sm"
              style={{ background: 'linear-gradient(135deg,#8f8ff0,#2fb9a0)' }}
            >
              <Icon name="layers" size={15} />
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="ws-name truncate" style={{ display: 'block' }}>{workspace?.name ?? '—'}</span>
              <span className="ws-role">{t(`common.role.${workspace?.role ?? 'analyst'}`)}</span>
            </span>
            <Icon name="chevron-down" size={14} className="chev" style={{ opacity: 0.6 }} />
          </button>
          {wsOpen ? (
            <div className="ws-menu" role="menu">
              <div className="tiny faint" style={{ padding: '6px 10px' }}>{t('app.switchWorkspace')}</div>
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  className="ws-menu-item"
                  onClick={() => {
                    if (ws.id !== workspace?.id) void switchWorkspace(ws.id);
                  }}
                >
                  <span className="row" style={{ gap: 8, minWidth: 0 }}>
                    <Icon name={ws.id === workspace?.id ? 'check-circle' : 'layers'} size={15} />
                    <span className="truncate">{ws.name}</span>
                  </span>
                  <span className="tiny muted">{t(`common.role.${ws.role}`)}</span>
                </button>
              ))}
              <div className="sep" />
              <button className="ws-menu-item" onClick={() => navigate('/settings')}>
                <span className="row" style={{ gap: 8 }}>
                  <Icon name="settings" size={15} /> {t('settings.tab.workspace')}
                </span>
              </button>
            </div>
          ) : null}
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map((group) => (
            <div key={group.section}>
              <div className="nav-section">{t(group.section)}</div>
              <div className="nav">
                {group.items
                  .filter((item) => !('adminOnly' in item && item.adminOnly) || can('admin'))
                  .map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={Boolean(item.exact)}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    title={t(item.label)}
                  >
                    <Icon name={item.icon} size={17} className="nav-icon" />
                    <span>{t(item.label)}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="plan-card">
            <strong>{t('app.plan.beta')}</strong>
            <span>{workspace?.plan === 'beta' ? 'Beta' : (workspace?.plan ?? 'beta').toUpperCase()} · {t('app.versionLabel')} 0.1.0</span>
          </div>
          <div className="sidebar-version">
            <span>SocialMK · Beta</span>
            <button
              className="icon-btn"
              style={{ width: 26, height: 26, color: 'rgba(199,206,226,.6)' }}
              onClick={() => navigate('/settings')}
              title={t('nav.settings')}
            >
              <Icon name="settings" size={14} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setSearchOpen(true)} title={t('common.search')}>
            <Icon name="search" size={18} />
          </button>
          <div className="search-box">
            <Icon name="search" size={15} />
            <input
              placeholder={t('common.searchPlaceholder')}
              onFocus={() => setSearchOpen(true)}
              readOnly
              aria-label={t('common.search')}
            />
            <span className="kbd" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
              ⌘K
            </span>
          </div>
          <div className="topbar-spacer" />
          <span className="badge" style={{ background: 'var(--primary-weak)', color: 'var(--primary)' }}>
            <span className="dot" /> Beta
          </span>
          <button
            className="icon-btn"
            onClick={() => setLang(lang === 'th' ? 'en' : 'th')}
            title={t('common.language')}
          >
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>{lang === 'th' ? 'TH' : 'EN'}</span>
          </button>
          <button
            className="icon-btn"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            title={theme === 'light' ? t('common.dark') : t('common.light')}
          >
            <Icon name={theme === 'light' ? 'moon' : 'sun'} size={17} />
          </button>
          <div className="row" style={{ gap: 14 }} ref={topRef}>
          <div style={{ position: 'relative' }}>
            <button className="icon-btn" onClick={() => setNotifOpen((open) => !open)} title={t('common.notifications')}>
              <Icon name="bell" size={18} />
              {notifications.length ? <span className="dot" /> : null}
            </button>
            {notifOpen ? (
              <div className="menu-pop" style={{ width: 330, padding: 8 }}>
                <div className="row between" style={{ padding: '4px 6px 8px' }}>
                  <strong className="small">{t('common.notifications')}</strong>
                  <span className="tiny muted">{notifications.length}</span>
                </div>
                {notifications.length === 0 ? (
                  <div className="empty" style={{ padding: '22px 10px' }}>
                    <Icon name="check-circle" size={22} />
                    <span className="small">{t('app.notifications.empty')}</span>
                  </div>
                ) : (
                  <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                    {notifications.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setNotifOpen(false);
                          if (item.href) navigate(item.href);
                        }}
                        style={{ display: 'flex', gap: 10, padding: '9px 8px', alignItems: 'flex-start' }}
                      >
                        <span
                          className="plat-icon sm ghost"
                          style={{ width: 26, height: 26, borderRadius: 8, marginTop: 1 }}
                        >
                          <Icon
                            name={item.kind === 'approval' ? 'edit' : item.kind === 'budget' ? 'wallet' : item.kind === 'team' ? 'team' : 'plug'}
                            size={13}
                          />
                        </span>
                        <span style={{ textAlign: 'left', minWidth: 0 }}>
                          <span className="small" style={{ display: 'block', fontWeight: 600 }}>{item.title}</span>
                          <span className="tiny muted truncate" style={{ display: 'block', maxWidth: 220 }}>{item.detail}</span>
                          <span className="tiny faint">{relativeTime(item.at, lang)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div style={{ position: 'relative' }}>
            <button className="user-chip" onClick={() => setUserOpen((open) => !open)}>
              <Avatar name={user?.name ?? '?'} color={userInitialsColor} size="sm" />
              <span className="brand-text" style={{ textAlign: 'left' }}>
                <span className="u-name" style={{ display: 'block' }}>{user?.name}</span>
                <span className="u-role">{t(`common.role.${workspace?.role ?? 'analyst'}`)}</span>
              </span>
              <Icon name="chevron-down" size={13} className="chev" style={{ opacity: 0.5 }} />
            </button>
            {userOpen ? (
              <div className="menu-pop" role="menu">
                <div style={{ padding: '8px 10px 10px' }}>
                  <div className="small" style={{ fontWeight: 600 }}>{user?.name}</div>
                  <div className="tiny muted">{user?.email}</div>
                </div>
                <div className="sep" />
                <button onClick={() => navigate('/settings')}>
                  <Icon name="settings" size={15} /> {t('common.account')}
                </button>
                <button onClick={() => setLang(lang === 'th' ? 'en' : 'th')}>
                  <Icon name="globe" size={15} /> {t('common.language')}: {lang === 'th' ? 'ไทย' : 'English'}
                </button>
                <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
                  <Icon name={theme === 'light' ? 'moon' : 'sun'} size={15} /> {theme === 'light' ? t('common.dark') : t('common.light')}
                </button>
                {can('admin') ? (
                  <button onClick={() => navigate('/developers')}>
                    <Icon name="code" size={15} /> {t('nav.developers')}
                  </button>
                ) : null}
                <div className="sep" />
                <button
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                >
                  <Icon name="logout" size={15} /> {t('common.logout')}
                </button>
              </div>
            ) : null}
          </div>
          </div>
        </header>

        <main>
          <Outlet />
        </main>
      </div>

      <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title={t('common.search')} wide>
        <div className="search-box" style={{ maxWidth: '100%', marginBottom: 14 }}>
          <Icon name="search" size={16} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('common.searchPlaceholder')}
            style={{ height: 44, fontSize: 14 }}
          />
        </div>
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          <div className="eyebrow" style={{ padding: '6px 2px' }}>{t('app.menu')}</div>
          {navMatches.map((item) => (
            <button
              key={item.to}
              onClick={() => go(item.to)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 8px',
                border: 'none',
                background: 'none',
                borderRadius: 9,
                cursor: 'pointer',
                color: 'var(--text)',
              }}
              onMouseEnter={(event) => (event.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(event) => (event.currentTarget.style.background = 'none')}
            >
              <Icon name={item.icon} size={16} style={{ color: 'var(--muted)' }} />
              <span className="small">{t(item.label)}</span>
              <span className="spacer" />
              <Icon name="chevron-right" size={14} style={{ color: 'var(--faint)' }} />
            </button>
          ))}
          {query.trim().length >= 2 ? (
            <>
              <div className="eyebrow" style={{ padding: '12px 2px 6px' }}>{t('nav.calendar')}</div>
              {searching ? (
                <div className="row muted small" style={{ padding: 8 }}>
                  <Icon name="refresh" size={14} /> {t('common.loading')}
                </div>
              ) : results.length === 0 ? (
                <div className="small muted" style={{ padding: 8 }}>{t('app.searchEmpty')}</div>
              ) : (
                results.map((post) => (
                  <button
                    key={post.id}
                    onClick={() => go('/calendar')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 8px',
                      border: 'none',
                      background: 'none',
                      borderRadius: 9,
                      cursor: 'pointer',
                      color: 'var(--text)',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(event) => (event.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(event) => (event.currentTarget.style.background = 'none')}
                  >
                    <span
                      className="plat-icon sm"
                      style={{ background: post.brandColor ?? 'var(--primary)' }}
                    >
                      <Icon name="file" size={12} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="small truncate" style={{ display: 'block' }}>{post.title}</span>
                      <span className="tiny muted">{post.brandName} · {post.status}</span>
                    </span>
                  </button>
                ))
              )}
            </>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
