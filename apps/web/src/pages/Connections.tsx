import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type Brand, type Connection, type Workspace } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { fmtCompact, relativeTime } from '../lib/format';
import { Icon } from '../components/Icon';
import { ALL_PLATFORMS, PLATFORM_META, PlatformIcon } from '../components/PlatformIcon';
import {
  Badge,
  Card,
  ConfirmDialog,
  Empty,
  Field,
  Modal,
  PageHeader,
  Progress,
  StatusBadge,
} from '../components/UI';

export function ConnectionsPage() {
  const { t, lang } = useI18n();
  const { can, workspace } = useAuth();
  const toast = useToast();

  const [connections, setConnections] = useState<Connection[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [connectPlatform, setConnectPlatform] = useState<string | null>(null);
  const [accountName, setAccountName] = useState('');
  const [brandId, setBrandId] = useState('');
  const [disconnectTarget, setDisconnectTarget] = useState<Connection | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, brandList, wsList] = await Promise.all([
        api.get<Connection[]>('/connections'),
        api.get<Brand[]>('/brands'),
        api.get<Workspace[]>('/workspaces'),
      ]);
      setConnections(list);
      setBrands(brandList);
      setWorkspaces(wsList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connectedKeys = useMemo(() => new Set(connections.map((connection) => connection.platform)), [connections]);
  const availableSocial = ALL_PLATFORMS.filter((item) => item.group === 'social' && !connectedKeys.has(item.key));
  const availableGoogle = ALL_PLATFORMS.filter((item) => item.group === 'google' && !connectedKeys.has(item.key));
  const future = ALL_PLATFORMS.filter((item) => item.group === 'future');

  const totalFollowers = connections.reduce((acc, item) => acc + item.followers, 0);
  const attention = connections.filter((item) => item.status !== 'connected');
  const currentWorkspace = workspaces.find((item) => item.id === workspace?.id);
  const bridgeUrl = currentWorkspace?.bridgeUrl ?? workspace?.bridgeUrl ?? null;

  const openConnect = (platform: string) => {
    setConnectPlatform(platform);
    setAccountName('');
    setBrandId('');
  };

  const connect = async () => {
    if (!connectPlatform || !accountName.trim()) return;
    setBusy(true);
    try {
      await api.post('/connections', {
        platform: connectPlatform,
        accountName: accountName.trim(),
        brandId: brandId || null,
      });
      toast.push(t('connections.connected', { name: accountName.trim() }));
      setConnectPlatform(null);
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const sync = async (connection: Connection) => {
    try {
      await api.post(`/connections/${connection.id}/sync`);
      toast.push(t('connections.synced', { name: connection.accountName }));
      await load();
    } catch {
      toast.push(t('error.generic'), { kind: 'error' });
    }
  };

  const syncAll = async () => {
    setBusy(true);
    try {
      if (bridgeUrl) {
        const result = await api.post<{ syncedAt: string }>('/bridge/sync', { bridgeUrl });
        toast.push(t('connections.bridgeSynced'), { detail: relativeTime(result.syncedAt, lang) });
      } else {
        await Promise.all(connections.map((connection) => api.post(`/connections/${connection.id}/sync`)));
        toast.push(t('connections.bridgeSynced'));
      }
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!disconnectTarget) return;
    try {
      await api.del(`/connections/${disconnectTarget.id}`);
      toast.push(t('connections.disconnected'));
      setDisconnectTarget(null);
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    }
  };

  return (
    <div className="page">
      <PageHeader
        title={t('connections.title')}
        subtitle={t('connections.subtitle')}
        actions={
          can('admin') ? (
            <>
              <button className="btn" onClick={syncAll} disabled={busy}>
                <Icon name="refresh" size={15} /> {t('connections.syncAll')}
              </button>
              <button className="btn primary" onClick={() => openConnect(availableSocial[0]?.key ?? 'facebook')}>
                <Icon name="plus" size={15} /> {t('connections.available')}
              </button>
            </>
          ) : (
            <Badge tone="">Admin+ · {t('connections.teamsNote')}</Badge>
          )
        }
      />

      <div className="bridge-card">
        <div className="row between wrap" style={{ gap: 16 }}>
          <div style={{ maxWidth: 560 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Workspace Bridge</div>
            <div className="row" style={{ gap: 8 }}>
              <Icon name="link" size={18} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: 18, letterSpacing: '-0.3px' }}>{t('connections.bridgeTitle')}</h2>
              {bridgeUrl ? <Badge tone="published">{t('connections.bridgeConfigured')}</Badge> : <Badge tone="attention">{t('common.pending')}</Badge>}
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>{t('connections.bridgeSub')}</p>
            <div className="mono" style={{ marginTop: 10, color: bridgeUrl ? 'var(--primary)' : 'var(--faint)' }}>
              {bridgeUrl ?? t('connections.bridgeNotConfigured')}
            </div>
            <p className="tiny faint" style={{ marginTop: 8 }}>
              {t('connections.lastSync', {
                time: connections[0]?.lastSyncAt ? relativeTime(connections[0].lastSyncAt, lang) : '—',
              })}
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={syncAll} disabled={busy || !can('admin')}>
              <Icon name="refresh" size={15} /> {t('connections.bridgeSync')}
            </button>
          </div>
        </div>
      </div>

      <div className="stat-strip section">
        <div>
          <div className="s-label">{t('connections.channels')}</div>
          <div className="s-value">{connections.length}</div>
        </div>
        <div>
          <div className="s-label">{t('connections.totalFollowers')}</div>
          <div className="s-value">{fmtCompact(totalFollowers, lang)}</div>
        </div>
        <div>
          <div className="s-label">{t('connections.attentionCount')}</div>
          <div className="s-value" style={{ color: attention.length ? 'var(--amber)' : 'var(--teal)' }}>{attention.length}</div>
        </div>
        <div>
          <div className="s-label">{t('common.brand')}</div>
          <div className="s-value">{brands.length}</div>
        </div>
      </div>

      <Card
        title={t('connections.connectedAccounts')}
        subtitle={t('connections.bridgeSub')}
        className="section"
        action={<Badge tone="">{connections.length}</Badge>}
      >
        {!connections.length && !loading ? (
          <Empty icon="plug" title={t('connections.noAccounts')} />
        ) : (
          <div className="grid grid-2" style={{ gap: 10 }}>
            {connections.map((connection) => (
              <div key={connection.id} className={`conn-card ${connection.status !== 'connected' ? 'attention' : ''}`}>
                <PlatformIcon platform={connection.platform} size="lg" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="strong truncate" style={{ fontSize: 13 }}>{connection.accountName}</span>
                    <StatusBadge status={connection.status} />
                  </div>
                  <div className="tiny muted truncate">
                    {connection.handle}
                    {connection.brandName ? ` · ${connection.brandName}` : ` · ${t('connections.brandOptional')}`}
                  </div>
                  <div className="row" style={{ gap: 10, marginTop: 6 }}>
                    <span className="tiny faint">
                      {connection.followers ? `${fmtCompact(connection.followers, lang)} ${t('connections.followers')}` : connection.platformLabel}
                    </span>
                    <span className="tiny faint">{t('connections.health')} {connection.health}%</span>
                  </div>
                  <div style={{ marginTop: 5 }}>
                    <Progress
                      value={connection.health}
                      tone={connection.health < 75 ? 'danger' : connection.health < 90 ? 'warn' : undefined}
                    />
                  </div>
                  <div className="tiny faint" style={{ marginTop: 5 }}>
                    {t('connections.lastSync', { time: relativeTime(connection.lastSyncAt, lang) })}
                    {connection.daysToExpiry !== null && connection.daysToExpiry <= 7
                      ? ` · ${t('connections.tokenExpiry', { days: Math.max(connection.daysToExpiry, 0) })}`
                      : ''}
                  </div>
                </div>
                <div className="col" style={{ gap: 4 }}>
                  <button className="icon-btn" onClick={() => sync(connection)} title={t('connections.sync')} disabled={!can('editor')}>
                    <Icon name="refresh" size={15} />
                  </button>
                  {can('admin') ? (
                    <button
                      className="icon-btn"
                      style={{ color: 'var(--rose)' }}
                      onClick={() => setDisconnectTarget(connection)}
                      title={t('connections.disconnect')}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-2 section">
        <Card title={t('connections.available')} subtitle={t('connections.social')}>
          <div className="col" style={{ gap: 8 }}>
            {availableSocial.map((platform) => (
              <div key={platform.key} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="row" style={{ gap: 10 }}>
                  <PlatformIcon platform={platform.key} size="md" ghost />
                  <span>
                    <span className="small strong" style={{ display: 'block' }}>{platform.label}</span>
                    <span className="tiny faint">
                      {platform.key === 'tiktok' ? 'Content posting + insights' : 'Pages, posts & insights'}
                    </span>
                  </span>
                </span>
                <button className="btn sm" onClick={() => openConnect(platform.key)} disabled={!can('admin')}>
                  {t('connections.connect')}
                </button>
              </div>
            ))}
            {!availableSocial.length ? <div className="small muted">{t('connections.noAccounts')}</div> : null}
          </div>
        </Card>

        <div className="col" style={{ gap: 16 }}>
          <Card title={t('connections.google')} subtitle="Drive · Gmail · Calendar">
            <div className="col" style={{ gap: 8 }}>
              {availableGoogle.map((platform) => (
                <div key={platform.key} className="row between" style={{ padding: '6px 0' }}>
                  <span className="row" style={{ gap: 10 }}>
                    <PlatformIcon platform={platform.key} size="md" ghost />
                    <span className="small strong">{platform.label}</span>
                  </span>
                  <button className="btn sm" onClick={() => openConnect(platform.key)} disabled={!can('admin')}>
                    {t('connections.connect')}
                  </button>
                </div>
              ))}
              {!availableGoogle.length ? (
                <div className="row" style={{ gap: 8, color: 'var(--teal)' }}>
                  <Icon name="check-circle" size={16} /> <span className="small">เชื่อมต่อ Google Workspace ครบแล้ว</span>
                </div>
              ) : null}
            </div>
          </Card>

          <Card title={t('connections.future')} subtitle={t('connections.futureNote')}>
            <div className="row wrap" style={{ gap: 8 }}>
              {future.map((platform) => (
                <span key={platform.key} className="chip static" style={{ opacity: 0.7 }}>
                  <PlatformIcon platform={platform.key} size="sm" />
                  {platform.label}
                  <span className="tiny faint">· {t('common.comingSoon')}</span>
                </span>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={Boolean(connectPlatform)}
        onClose={() => setConnectPlatform(null)}
        title={t('connections.connectTitle', { platform: connectPlatform ? PLATFORM_META[connectPlatform]?.label ?? connectPlatform : '' })}
        subtitle={t('connections.connectSub')}
        footer={
          <>
            <button className="btn" onClick={() => setConnectPlatform(null)}>{t('common.cancel')}</button>
            <button className="btn primary" onClick={connect} disabled={busy || !accountName.trim()}>
              {busy ? t('common.saving') : t('connections.connect')}
            </button>
          </>
        }
      >
        <div className="form-stack">
          <div className="row" style={{ gap: 12, padding: 12, background: 'var(--surface-2)', borderRadius: 12 }}>
            {connectPlatform ? <PlatformIcon platform={connectPlatform} size="lg" /> : null}
            <div>
              <div className="small strong">{connectPlatform ? PLATFORM_META[connectPlatform]?.label : ''}</div>
              <div className="tiny muted">{t('connections.scopes')}: read_insights, publish_content, manage_comments</div>
            </div>
          </div>
          <Field label={t('connections.accountName')}>
            <input
              className="input"
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              placeholder="UAREA Studio"
            />
          </Field>
          <Field label={t('connections.selectBrand')} hint={t('common.optional')}>
            <select className="select" value={brandId} onChange={(event) => setBrandId(event.target.value)}>
              <option value="">{t('connections.brandOptional')}</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>{brand.name}</option>
              ))}
            </select>
          </Field>
          <div className="notice info">
            <Icon name="lock" size={15} />
            <span>{t('connections.connectSub')}</span>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(disconnectTarget)}
        title={t('connections.disconnect')}
        body={t('connections.confirmDisconnect', { name: disconnectTarget?.accountName ?? '' })}
        confirmLabel={t('connections.disconnect')}
        danger
        onConfirm={disconnect}
        onCancel={() => setDisconnectTarget(null)}
      />
    </div>
  );
}
