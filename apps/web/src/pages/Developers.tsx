import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type ApiKey, type Webhook } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { fmtDate, fmtInt, relativeTime } from '../lib/format';
import { Icon } from '../components/Icon';
import {
  Badge,
  Card,
  ConfirmDialog,
  CopyButton,
  Empty,
  Field,
  Modal,
  PageHeader,
  Tabs,
} from '../components/UI';

interface ApiLog {
  id: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  at: string;
}

const SCOPES = ['posts:read', 'posts:write', 'analytics:read', 'contacts:read', 'campaigns:read'];

const ENDPOINTS = [
  { method: 'GET', path: '/api/v1/posts', scope: 'posts:read', description: 'รายการโพสต์ทั้งหมด พร้อมสถานะและแพลตฟอร์ม' },
  { method: 'GET', path: '/api/v1/analytics/summary', scope: 'analytics:read', description: 'สรุปผลรายวัน รายแพลตฟอร์ม และ delta เทียบช่วงก่อน' },
  { method: 'GET', path: '/api/v1/contacts', scope: 'contacts:read', description: 'ผู้ติดต่อที่ยินยอม (consent = granted) เท่านั้น' },
  { method: 'GET', path: '/api/v1/campaigns', scope: 'campaigns:read', description: 'แคมเปญ งบประมาณ และผลลัพธ์' },
  { method: 'GET', path: '/api/v1/brands', scope: 'posts:read', description: 'แบรนด์ใน workspace' },
];

const WEBHOOK_EVENTS = ['post.published', 'post.scheduled', 'contact.created', 'campaign.budget_threshold', 'report.ready'];

export function DevelopersPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState('keys');
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);

  const [keyOpen, setKeyOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [keyScopes, setKeyScopes] = useState<string[]>(['posts:read', 'analytics:read']);
  const [createdKey, setCreatedKey] = useState<{ name: string; key: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [busy, setBusy] = useState(false);

  const [hookOpen, setHookOpen] = useState(false);
  const [hookUrl, setHookUrl] = useState('');
  const [hookEvents, setHookEvents] = useState<string[]>(['post.published']);
  const [hookDelete, setHookDelete] = useState<Webhook | null>(null);

  const load = useCallback(async () => {
    if (!can('admin')) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [keyList, logList, hooks] = await Promise.all([
        api.get<ApiKey[]>('/api-keys'),
        api.get<ApiLog[]>('/api-logs'),
        api.get<Webhook[]>('/webhooks'),
      ]);
      setKeys(keyList);
      setLogs(logList);
      setWebhooks(hooks);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const baseUrl = useMemo(() => `${window.location.origin}/api/v1`, []);
  const sampleCurl = useMemo(
    () => `curl -X GET "${baseUrl}/analytics/summary?days=30" \\\n  -H "x-api-key: smk_live_xxxxxxxxxxxxxxxx"`,
    [baseUrl],
  );

  const createKey = async () => {
    if (!keyName.trim() || !keyScopes.length) return;
    setBusy(true);
    try {
      const result = await api.post<{ name: string; key: string }>('/api-keys', { name: keyName.trim(), scopes: keyScopes });
      setCreatedKey({ name: result.name, key: result.key });
      setKeyName('');
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const revokeKey = async () => {
    if (!revokeTarget) return;
    try {
      await api.del(`/api-keys/${revokeTarget.id}`);
      toast.push(t('developers.revoked'));
      setRevokeTarget(null);
      await load();
    } catch {
      toast.push(t('error.generic'), { kind: 'error' });
    }
  };

  const addWebhook = async () => {
    if (!hookUrl.trim()) return;
    setBusy(true);
    try {
      await api.post('/webhooks', { url: hookUrl.trim(), events: hookEvents });
      toast.push(t('developers.webhookCreated'));
      setHookOpen(false);
      setHookUrl('');
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const toggleWebhook = async (hook: Webhook) => {
    try {
      await api.patch(`/webhooks/${hook.id}`, { active: !hook.active });
      await load();
    } catch {
      toast.push(t('error.generic'), { kind: 'error' });
    }
  };

  const testWebhook = async (hook: Webhook) => {
    try {
      const result = await api.post<{ note: string }>(`/webhooks/${hook.id}/test`);
      toast.push(t('developers.testSent'), { kind: 'info', detail: result.note });
      await load();
    } catch {
      toast.push(t('error.generic'), { kind: 'error' });
    }
  };

  const deleteWebhook = async () => {
    if (!hookDelete) return;
    try {
      await api.del(`/webhooks/${hookDelete.id}`);
      toast.push(t('developers.webhookDeleted'));
      setHookDelete(null);
      await load();
    } catch {
      toast.push(t('error.generic'), { kind: 'error' });
    }
  };

  if (!can('admin')) {
    return (
      <div className="page">
        <PageHeader title={t('developers.title')} subtitle={t('developers.subtitle')} />
        <Card>
          <Empty icon="lock" title={t('developers.adminOnly')} />
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={t('developers.title')}
        subtitle={t('developers.subtitle')}
        actions={
          <>
            <a className="btn" href="/api/v1/openapi.json" target="_blank" rel="noreferrer">
              <Icon name="external" size={15} /> {t('developers.openapi')}
            </a>
            {tab === 'keys' && can('admin') ? (
              <button className="btn primary" onClick={() => { setKeyOpen(true); setCreatedKey(null); }}>
                <Icon name="plus" size={15} /> {t('developers.createKey')}
              </button>
            ) : null}
            {tab === 'webhooks' && can('admin') ? (
              <button className="btn primary" onClick={() => setHookOpen(true)}>
                <Icon name="plus" size={15} /> {t('developers.addWebhook')}
              </button>
            ) : null}
          </>
        }
      />

      <div className="stat-strip" style={{ marginBottom: 16 }}>
        <div>
          <div className="s-label">{t('developers.tab.keys')}</div>
          <div className="s-value">{keys.filter((key) => !key.revokedAt).length}</div>
        </div>
        <div>
          <div className="s-label">{t('developers.requests')}</div>
          <div className="s-value">{fmtInt(keys.reduce((acc, key) => acc + key.requestCount, 0), lang)}</div>
        </div>
        <div>
          <div className="s-label">{t('developers.rateLimit')}</div>
          <div className="s-value" style={{ fontSize: 14 }}>{t('developers.rateLimitValue')}</div>
        </div>
        <div>
          <div className="s-label">{t('developers.tab.webhooks')}</div>
          <div className="s-value">{webhooks.filter((hook) => hook.active).length}</div>
        </div>
      </div>

      <Tabs
        tabs={[
          { key: 'keys', label: t('developers.tab.keys'), icon: 'key' },
          { key: 'endpoints', label: t('developers.tab.endpoints'), icon: 'code' },
          { key: 'webhooks', label: t('developers.tab.webhooks'), icon: 'webhook' },
          { key: 'logs', label: t('developers.tab.logs'), icon: 'file' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'keys' ? (
        <Card flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('developers.keyName')}</th>
                  <th>{t('developers.keyPrefix')}</th>
                  <th>{t('developers.scopes')}</th>
                  <th>{t('developers.created')}</th>
                  <th>{t('developers.lastUsed')}</th>
                  <th className="num">{t('developers.requests')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id}>
                    <td>
                      <div className="strong">{key.name}</div>
                      <div className="tiny muted">{key.createdBy}</div>
                    </td>
                    <td className="mono">{key.prefix}••••</td>
                    <td>
                      <span className="row wrap" style={{ gap: 4 }}>
                        {key.scopes.map((scope) => <span className="tag" key={scope}>{scope}</span>)}
                      </span>
                    </td>
                    <td className="small muted">{fmtDate(key.createdAt, lang)}</td>
                    <td className="small muted">{key.lastUsedAt ? relativeTime(key.lastUsedAt, lang) : '—'}</td>
                    <td className="num">{fmtInt(key.requestCount, lang)}</td>
                    <td className="actions">
                      {key.revokedAt ? (
                        <Badge tone="draft">{t('common.revoke')}</Badge>
                      ) : can('admin') ? (
                        <button className="btn xs danger" onClick={() => setRevokeTarget(key)}>
                          {t('developers.revokeKey')}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!keys.length && !loading ? (
                  <tr><td colSpan={7}><Empty icon="key" title={t('developers.noKeys')} /></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === 'endpoints' ? (
        <div className="grid grid-side">
          <Card title={t('developers.tab.endpoints')} subtitle={t('developers.docsNote')} flush>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('developers.method')}</th>
                    <th>{t('developers.endpoint')}</th>
                    <th>{t('developers.scope')}</th>
                    <th>{t('developers.description')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ENDPOINTS.map((endpoint) => (
                    <tr key={endpoint.path}>
                      <td><span className="badge scheduled">{endpoint.method}</span></td>
                      <td className="mono">{endpoint.path}</td>
                      <td><span className="tag">{endpoint.scope}</span></td>
                      <td className="small muted">{endpoint.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title={t('developers.sample')} subtitle={`${t('developers.auth')}: x-api-key`}>
            <pre className="code-block">{sampleCurl}</pre>
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              <CopyButton text={sampleCurl} label={t('developers.copySample')} small />
              <a className="btn sm" href="/api/v1/openapi.json" target="_blank" rel="noreferrer">
                <Icon name="external" size={13} /> OpenAPI
              </a>
            </div>
            <div className="notice info" style={{ marginTop: 12 }}>
              <Icon name="info" size={15} />
              <span>{t('developers.docsNote')}</span>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'webhooks' ? (
        <Card flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('developers.webhookUrl')}</th>
                  <th>{t('developers.events')}</th>
                  <th>{t('developers.lastDelivery')}</th>
                  <th>{t('developers.webhookActive')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {webhooks.map((hook) => (
                  <tr key={hook.id}>
                    <td>
                      <div className="mono truncate" style={{ maxWidth: 320 }}>{hook.url}</div>
                      <div className="tiny faint">secret: {hook.secretPreview}</div>
                    </td>
                    <td>
                      <span className="row wrap" style={{ gap: 4 }}>
                        {hook.events.map((event) => <span className="tag" key={event}>{event}</span>)}
                      </span>
                    </td>
                    <td className="small muted">{hook.lastDeliveryAt ? relativeTime(hook.lastDeliveryAt, lang) : '—'}</td>
                    <td>
                      <button className={`switch ${hook.active ? 'on' : ''}`} onClick={() => toggleWebhook(hook)} aria-label="toggle" />
                    </td>
                    <td className="actions">
                      <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn xs" onClick={() => testWebhook(hook)}>
                          <Icon name="zap" size={11} /> {t('developers.test')}
                        </button>
                        {can('admin') ? (
                          <button className="icon-btn" style={{ width: 26, height: 26, color: 'var(--rose)' }} onClick={() => setHookDelete(hook)}>
                            <Icon name="trash" size={13} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!webhooks.length && !loading ? (
                  <tr><td colSpan={5}><Empty icon="webhook" title={t('developers.noWebhooks')} /></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === 'logs' ? (
        <Card title={t('developers.logTitle')} subtitle={t('developers.deliveryNote')} flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('developers.method')}</th>
                  <th>{t('developers.endpoint')}</th>
                  <th>{t('developers.status')}</th>
                  <th className="num">{t('developers.latency')}</th>
                  <th>{t('common.date')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td><span className="badge scheduled">{log.method}</span></td>
                    <td className="mono">{log.path}</td>
                    <td>
                      <span className={`badge ${log.status < 300 ? 'published' : log.status === 429 ? 'attention' : 'draft'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="num">{log.latencyMs}</td>
                    <td className="small muted">{relativeTime(log.at, lang)}</td>
                  </tr>
                ))}
                {!logs.length ? (
                  <tr><td colSpan={5}><Empty icon="file" title={t('developers.noLogs')} /></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Modal
        open={keyOpen}
        onClose={() => { setKeyOpen(false); setCreatedKey(null); }}
        title={t('developers.createKey')}
        footer={
          <>
            <button className="btn" onClick={() => { setKeyOpen(false); setCreatedKey(null); }}>{t('common.close')}</button>
            <button className="btn primary" onClick={createKey} disabled={busy || !keyName.trim() || !keyScopes.length}>
              {busy ? t('common.saving') : t('common.create')}
            </button>
          </>
        }
      >
        <div className="form-stack">
          <Field label={t('developers.keyName')}>
            <input
              className="input"
              value={keyName}
              onChange={(event) => setKeyName(event.target.value)}
              placeholder={t('developers.keyNamePlaceholder')}
            />
          </Field>
          <Field label={t('developers.scopes')} hint={t('developers.keyScopesHint')}>
            <div className="col" style={{ gap: 6 }}>
              {SCOPES.map((scope) => (
                <label className="check" key={scope}>
                  <input
                    type="checkbox"
                    checked={keyScopes.includes(scope)}
                    onChange={(event) =>
                      setKeyScopes((prev) => event.target.checked ? [...prev, scope] : prev.filter((item) => item !== scope))
                    }
                  />
                  <span className="mono">{scope}</span>
                </label>
              ))}
            </div>
          </Field>
          {createdKey ? (
            <div className="notice" style={{ display: 'block' }}>
              <b className="small">{t('developers.keyOnce')}</b>
              <div className="key-reveal" style={{ marginTop: 8 }}>{createdKey.key}</div>
              <div className="row" style={{ marginTop: 8 }}>
                <CopyButton text={createdKey.key} small />
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={hookOpen}
        onClose={() => setHookOpen(false)}
        title={t('developers.addWebhook')}
        footer={
          <>
            <button className="btn" onClick={() => setHookOpen(false)}>{t('common.cancel')}</button>
            <button className="btn primary" onClick={addWebhook} disabled={busy || !hookUrl.trim()}>
              {busy ? t('common.saving') : t('common.add')}
            </button>
          </>
        }
      >
        <div className="form-stack">
          <Field label={t('developers.webhookUrl')}>
            <input
              className="input"
              value={hookUrl}
              onChange={(event) => setHookUrl(event.target.value)}
              placeholder="https://hooks.example.com/socialmk"
            />
          </Field>
          <Field label={t('developers.events')}>
            <div className="col" style={{ gap: 6 }}>
              {WEBHOOK_EVENTS.map((event) => (
                <label className="check" key={event}>
                  <input
                    type="checkbox"
                    checked={hookEvents.includes(event)}
                    onChange={(e) =>
                      setHookEvents((prev) => e.target.checked ? [...prev, event] : prev.filter((item) => item !== event))
                    }
                  />
                  <span className="mono">{event}</span>
                </label>
              ))}
            </div>
          </Field>
          <div className="notice info">
            <Icon name="info" size={15} />
            <span>{t('developers.deliveryNote')}</span>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title={t('developers.revokeKey')}
        body={revokeTarget?.name}
        confirmLabel={t('common.revoke')}
        danger
        onConfirm={revokeKey}
        onCancel={() => setRevokeTarget(null)}
      />
      <ConfirmDialog
        open={Boolean(hookDelete)}
        title={t('common.delete')}
        body={hookDelete?.url}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={deleteWebhook}
        onCancel={() => setHookDelete(null)}
      />
    </div>
  );
}
