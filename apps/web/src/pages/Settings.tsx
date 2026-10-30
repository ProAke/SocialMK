import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Brand, type Workspace } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { fmtDate } from '../lib/format';
import { Icon } from '../components/Icon';
import {
  Badge,
  Card,
  ConfirmDialog,
  Empty,
  Field,
  Modal,
  PageHeader,
  Tabs,
} from '../components/UI';

interface Changelog {
  current: string;
  releasedAt: string;
  channel: string;
  entries: Array<{ version: string; date: string; highlights: string[] }>;
  roadmap: Array<{ version: string; eta: string; items: string[] }>;
}

interface BrandForm {
  id?: string;
  name: string;
  industry: string;
  color: string;
  accent: string;
  tone: string;
  audience: string;
  guidelines: string;
}

const EMPTY_BRAND: BrandForm = {
  name: '',
  industry: '',
  color: '#5B5BD6',
  accent: '#7CF7D4',
  tone: '',
  audience: '',
  guidelines: '',
};

export function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const { user, workspace, role, can, setUser } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState('workspace');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [changelog, setChangelog] = useState<Changelog | null>(null);
  const [loading, setLoading] = useState(true);

  const [wsForm, setWsForm] = useState({ name: '', industry: '', bridgeUrl: '' });
  const [profile, setProfile] = useState({ name: '', title: '', locale: lang });
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '' });
  const [brandForm, setBrandForm] = useState<BrandForm | null>(null);
  const [brandDelete, setBrandDelete] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [brandList, wsList, log] = await Promise.all([
        api.get<Brand[]>('/brands'),
        api.get<Workspace[]>('/workspaces'),
        api.get<Changelog>('/changelog'),
      ]);
      setBrands(brandList);
      setWorkspaces(wsList);
      setChangelog(log);
      const current = wsList.find((item) => item.id === workspace?.id);
      setWsForm({
        name: current?.name ?? workspace?.name ?? '',
        industry: current?.industry ?? '',
        bridgeUrl: current?.bridgeUrl ?? '',
      });
    } finally {
      setLoading(false);
    }
  }, [workspace?.id, workspace?.name]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (user) setProfile({ name: user.name, title: user.title ?? '', locale: lang });
  }, [user, lang]);

  const saveWorkspace = async () => {
    setBusy(true);
    try {
      await api.patch(`/workspaces/${workspace?.id}`, {
        name: wsForm.name,
        industry: wsForm.industry,
        bridgeUrl: wsForm.bridgeUrl || null,
      });
      toast.push(t('settings.workspaceSaved'));
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    setBusy(true);
    try {
      const result = await api.patch<{ user: typeof user }>('/auth/profile', {
        name: profile.name,
        title: profile.title,
        locale: profile.locale,
      });
      if (result.user) setUser(result.user);
      setLang(profile.locale as 'th' | 'en');
      toast.push(t('settings.profileSaved'));
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (password.newPassword.length < 8) {
      toast.push(t('settings.passwordMin'), { kind: 'error' });
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/change-password', password);
      setPassword({ currentPassword: '', newPassword: '' });
      toast.push(t('settings.passwordUpdated'));
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const saveBrand = async () => {
    if (!brandForm?.name.trim()) return;
    setBusy(true);
    try {
      if (brandForm.id) {
        await api.patch(`/brands/${brandForm.id}`, brandForm);
      } else {
        await api.post('/brands', brandForm);
      }
      toast.push(t('settings.brandSaved'));
      setBrandForm(null);
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const deleteBrand = async () => {
    if (!brandDelete) return;
    try {
      await api.del(`/brands/${brandDelete.id}`);
      toast.push(t('settings.brandDeleted'));
      setBrandDelete(null);
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    }
  };

  const current = workspaces.find((item) => item.id === workspace?.id);

  return (
    <div className="page">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <Tabs
        tabs={[
          { key: 'workspace', label: t('settings.tab.workspace'), icon: 'layers' },
          { key: 'brands', label: t('settings.tab.brands'), icon: 'target' },
          { key: 'profile', label: t('settings.tab.profile'), icon: 'users' },
          { key: 'about', label: t('settings.tab.about'), icon: 'info' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'workspace' ? (
        <div className="grid grid-side">
          <Card title={t('settings.workspaceInfo')} subtitle={t('settings.aiNote')}>
            <div className="form-stack">
              <Field label={t('settings.workspaceName')}>
                <input
                  className="input"
                  value={wsForm.name}
                  onChange={(event) => setWsForm({ ...wsForm, name: event.target.value })}
                  disabled={!can('admin')}
                />
              </Field>
              <Field label={t('settings.industry')}>
                <input
                  className="input"
                  value={wsForm.industry}
                  onChange={(event) => setWsForm({ ...wsForm, industry: event.target.value })}
                  disabled={!can('admin')}
                />
              </Field>
              <Field label={t('settings.bridgeUrl')} hint={t('settings.bridgeHint')}>
                <input
                  className="input"
                  value={wsForm.bridgeUrl}
                  onChange={(event) => setWsForm({ ...wsForm, bridgeUrl: event.target.value })}
                  placeholder="https://mng.uarea.in"
                  disabled={!can('admin')}
                />
              </Field>
              <div className="form-row">
                <Field label={t('settings.timezone')}>
                  <input className="input" value="Asia/Bangkok (UTC+7)" readOnly />
                </Field>
                <Field label={t('settings.plan')}>
                  <input className="input" value={(current?.plan ?? 'beta').toUpperCase()} readOnly />
                </Field>
              </div>
              <div className="row">
                <button className="btn primary" onClick={saveWorkspace} disabled={busy || !can('admin')}>
                  {busy ? t('common.saving') : t('settings.saveWorkspace')}
                </button>
                {!can('admin') ? <span className="tiny faint">{t('error.forbidden')}</span> : null}
              </div>
            </div>
          </Card>

          <div className="col" style={{ gap: 16 }}>
            <Card title={t('nav.group.workspace')} subtitle={workspace?.slug}>
              <div className="grid grid-2" style={{ gap: 10 }}>
                <Stat label={t('settings.members')} value={String(current?.memberCount ?? '—')} />
                <Stat label={t('settings.brandsCount')} value={String(current?.brandCount ?? brands.length)} />
                <Stat label={t('settings.connectionsCount')} value={String(current?.connectionCount ?? '—')} />
                <Stat label={t('common.role')} value={t(`common.role.${role}`)} />
              </div>
            </Card>
            <Card title={t('settings.security')} subtitle={t('settings.securitySub')}>
              <div className="row" style={{ gap: 10 }}>
                <span className="plat-icon" style={{ background: 'var(--teal-weak)', color: 'var(--teal)' }}>
                  <Icon name="shield" size={18} />
                </span>
                <div>
                  <div className="small strong">{t('settings.tokenType')}</div>
                  <div className="tiny faint">{t('settings.tokenDetail')}</div>
                </div>
              </div>
              <div className="notice info" style={{ marginTop: 12 }}>
                <Icon name="lock" size={15} />
                <span>{t('settings.twoFactor')} · {t('common.comingSoon')} (1.0)</span>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'brands' ? (
        <>
          <div className="row between" style={{ marginBottom: 12 }}>
            <div>
              <div className="card-title">{t('settings.brandProfile')}</div>
              <div className="card-sub">{t('settings.brandSub')}</div>
            </div>
            {can('admin') ? (
              <button className="btn primary" onClick={() => setBrandForm({ ...EMPTY_BRAND })}>
                <Icon name="plus" size={15} /> {t('settings.addBrand')}
              </button>
            ) : null}
          </div>
          {brands.length === 0 ? (
            <Card><Empty icon="target" title={t('common.noData')} /></Card>
          ) : (
            <div className="grid grid-2">
              {brands.map((brand) => (
                <Card key={brand.id}>
                  <div className="row between" style={{ alignItems: 'flex-start' }}>
                    <div className="row" style={{ gap: 12, minWidth: 0 }}>
                      <span style={{ width: 40, height: 40, borderRadius: 12, background: brand.color, flex: 'none' }} />
                      <div style={{ minWidth: 0 }}>
                        <div className="small strong">{brand.name}</div>
                        <div className="tiny muted">{brand.industry}</div>
                        <div className="tiny faint">{brand.tone}</div>
                      </div>
                    </div>
                    {can('admin') ? (
                      <div className="row" style={{ gap: 4 }}>
                        <button
                          className="icon-btn"
                          style={{ width: 30, height: 30 }}
                          onClick={() =>
                            setBrandForm({
                              id: brand.id,
                              name: brand.name,
                              industry: brand.industry ?? '',
                              color: brand.color,
                              accent: brand.accent ?? '#FFFFFF',
                              tone: brand.tone ?? '',
                              audience: brand.audience ?? '',
                              guidelines: brand.guidelines ?? '',
                            })
                          }
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        <button
                          className="icon-btn"
                          style={{ width: 30, height: 30, color: 'var(--rose)' }}
                          onClick={() => setBrandDelete(brand)}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="divider" />
                  <div className="small muted" style={{ lineHeight: 1.7 }}>{brand.audience}</div>
                  <div className="row" style={{ gap: 6, marginTop: 10 }}>
                    <span className="tag">{brand.postCount} posts</span>
                    <span className="tag">{brand.connectionCount} channels</span>
                    <span className="tag" style={{ background: `${brand.color}1a`, color: brand.color }}>{brand.color}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : null}

      {tab === 'profile' ? (
        <div className="grid grid-side">
          <Card title={t('common.account')} subtitle={t('settings.profileSub')}>
            <div className="form-stack">
              <div className="row" style={{ gap: 12 }}>
                <span className="avatar lg" style={{ background: user?.avatarColor ?? 'var(--primary)' }}>
                  {user?.name?.slice(0, 1)}
                </span>
                <div>
                  <div className="small strong">{user?.email}</div>
                  <div className="row" style={{ gap: 6, marginTop: 4 }}>
                    <Badge tone="owner">{t(`common.role.${role}`)}</Badge>
                    <span className="tiny faint">{workspace?.name}</span>
                  </div>
                </div>
              </div>
              <Field label={t('settings.displayName')}>
                <input className="input" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
              </Field>
              <Field label={t('settings.jobTitle')}>
                <input className="input" value={profile.title} onChange={(event) => setProfile({ ...profile, title: event.target.value })} />
              </Field>
              <Field label={t('settings.prefLanguage')}>
                <select className="select" value={profile.locale} onChange={(event) => setProfile({ ...profile, locale: event.target.value as 'th' | 'en' })}>
                  <option value="th">ไทย</option>
                  <option value="en">English</option>
                </select>
              </Field>
              <button className="btn primary" onClick={saveProfile} disabled={busy}>{t('settings.saveProfile')}</button>
            </div>
          </Card>

          <div className="col" style={{ gap: 16 }}>
            <Card title={t('settings.changePassword')} subtitle={t('settings.securitySub')}>
              <div className="form-stack">
                <Field label={t('settings.currentPassword')}>
                  <input
                    className="input"
                    type="password"
                    value={password.currentPassword}
                    onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })}
                  />
                </Field>
                <Field label={t('settings.newPassword')} hint="≥ 8">
                  <input
                    className="input"
                    type="password"
                    value={password.newPassword}
                    onChange={(event) => setPassword({ ...password, newPassword: event.target.value })}
                  />
                </Field>
                <button
                  className="btn"
                  onClick={changePassword}
                  disabled={busy || !password.currentPassword || !password.newPassword}
                >
                  {t('settings.updatePassword')}
                </button>
              </div>
            </Card>
            <Card title={t('settings.betaNotice')} subtitle="SocialMK Beta">
              <div className="row" style={{ gap: 8 }}>
                <Icon name="sparkles" size={16} style={{ color: 'var(--primary)' }} />
                <span className="small muted">
                  {t('app.plan.beta')} · {t('app.versionLabel')} 0.1.0-beta.1
                </span>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'about' ? (
        <div className="grid grid-side">
          <div className="col" style={{ gap: 16 }}>
            <Card title={t('settings.changelog')} subtitle={`${changelog?.current ?? '0.1.0-beta.1'} · ${changelog ? fmtDate(changelog.releasedAt, lang) : ''}`}>
              {changelog?.entries.map((entry) => (
                <div key={entry.version}>
                  <div className="row between">
                    <div className="row" style={{ gap: 8 }}>
                      <Badge tone="scheduled">{entry.version}</Badge>
                      <span className="tiny faint">{fmtDate(entry.date, lang)}</span>
                    </div>
                    <span className="tiny faint">{changelog.channel}</span>
                  </div>
                  <ul className="ai-bullets" style={{ padding: 0, marginTop: 10 }}>
                    {entry.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
                  </ul>
                </div>
              ))}
            </Card>

            <Card title={t('settings.roadmap')} subtitle={t('settings.betaNotice')}>
              <div className="col" style={{ gap: 14 }}>
                {changelog?.roadmap.map((stage) => (
                  <div key={stage.version}>
                    <div className="row" style={{ gap: 8 }}>
                      <Badge tone="owner">{stage.version}</Badge>
                      <span className="tiny faint">{stage.eta}</span>
                    </div>
                    <div className="col" style={{ gap: 4, marginTop: 6 }}>
                      {stage.items.map((item) => (
                        <div key={item} className="row" style={{ gap: 8 }}>
                          <Icon name="chevron-right" size={13} style={{ color: 'var(--faint)' }} />
                          <span className="small muted">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="col" style={{ gap: 16 }}>
            <Card title={t('settings.version')}>
              <div className="stat-strip" style={{ border: 'none' }}>
                <div>
                  <div className="s-label">{t('settings.version')}</div>
                  <div className="s-value">{changelog?.current ?? '0.1.0-beta.1'}</div>
                </div>
                <div>
                  <div className="s-label">API</div>
                  <div className="s-value">v1</div>
                </div>
              </div>
              <div className="row" style={{ gap: 8, marginTop: 12 }}>
                <a className="btn sm" href="/api/v1/openapi.json" target="_blank" rel="noreferrer">
                  <Icon name="external" size={13} /> {t('developers.openapi')}
                </a>
                <a className="btn sm" href="/api/health" target="_blank" rel="noreferrer">
                  <Icon name="info" size={13} /> Health
                </a>
              </div>
              <p className="tiny faint" style={{ marginTop: 12 }}>{t('settings.aiNote')}</p>
            </Card>

            <Card title={t('settings.dangerZone')} subtitle={t('settings.dangerSub')}>
              <button className="btn danger block" disabled title={t('settings.notAvailable')}>
                <Icon name="trash" size={14} /> {t('settings.deleteWorkspace')}
              </button>
              <p className="tiny faint" style={{ marginTop: 8 }}>{t('settings.notAvailable')}</p>
            </Card>
          </div>
        </div>
      ) : null}

      <Modal
        open={Boolean(brandForm)}
        onClose={() => setBrandForm(null)}
        title={brandForm?.id ? t('settings.editBrand') : t('settings.addBrand')}
        footer={
          <>
            <button className="btn" onClick={() => setBrandForm(null)}>{t('common.cancel')}</button>
            <button className="btn primary" onClick={saveBrand} disabled={busy || !brandForm?.name.trim()}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        {brandForm ? (
          <div className="form-stack">
            <Field label={t('settings.brandName')}>
              <input className="input" value={brandForm.name} onChange={(event) => setBrandForm({ ...brandForm, name: event.target.value })} />
            </Field>
            <Field label={t('settings.industry')}>
              <input className="input" value={brandForm.industry} onChange={(event) => setBrandForm({ ...brandForm, industry: event.target.value })} />
            </Field>
            <div className="form-row">
              <Field label={t('settings.brandColor')}>
                <input className="input" type="color" value={brandForm.color} onChange={(event) => setBrandForm({ ...brandForm, color: event.target.value })} style={{ height: 38, padding: 4 }} />
              </Field>
              <Field label={t('settings.brandAccent')}>
                <input className="input" type="color" value={brandForm.accent} onChange={(event) => setBrandForm({ ...brandForm, accent: event.target.value })} style={{ height: 38, padding: 4 }} />
              </Field>
            </div>
            <Field label={t('settings.tone')}>
              <input
                className="input"
                value={brandForm.tone}
                onChange={(event) => setBrandForm({ ...brandForm, tone: event.target.value })}
                placeholder={t('settings.tonePlaceholder')}
              />
            </Field>
            <Field label={t('settings.audience')}>
              <input
                className="input"
                value={brandForm.audience}
                onChange={(event) => setBrandForm({ ...brandForm, audience: event.target.value })}
                placeholder={t('settings.audiencePlaceholder')}
              />
            </Field>
            <Field label={t('settings.guidelines')}>
              <textarea
                className="textarea"
                value={brandForm.guidelines}
                onChange={(event) => setBrandForm({ ...brandForm, guidelines: event.target.value })}
                placeholder={t('settings.guidelinesPlaceholder')}
              />
            </Field>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(brandDelete)}
        title={t('common.delete')}
        body={t('settings.confirmBrandDelete', { name: brandDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={deleteBrand}
        onCancel={() => setBrandDelete(null)}
      />
      {loading ? <div className="tiny faint" style={{ marginTop: 10 }}>{t('common.loading')}</div> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '9px 11px' }}>
      <div className="tiny muted">{label}</div>
      <div className="small strong" style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
}
