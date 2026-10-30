import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, downloadFile, ApiError, type Contact } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { fmtTHB, relativeTime } from '../lib/format';
import { Icon } from '../components/Icon';
import { ALL_PLATFORMS, PlatformIcon } from '../components/PlatformIcon';
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

interface Segments {
  total: number;
  customers: number;
  prospects: number;
  revoked: number;
  positive: number;
  totalLtv: number;
  platforms: Array<{ platform: string; n: number }>;
}

const EMPTY_FORM = {
  id: '',
  type: 'prospect',
  name: '',
  email: '',
  phone: '',
  platform: 'instagram',
  tags: '',
  source: 'Manual',
  ltv: 0,
  consent: 'granted',
  sentiment: 'neutral',
  score: 55,
  note: '',
};

export function AudiencePage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [segments, setSegments] = useState<Segments | null>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('all');
  const [consent, setConsent] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [query, setQuery] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, segmentData] = await Promise.all([
        api.get<Contact[]>('/contacts', { type, consent, platform, q: query }),
        api.get<Segments>('/contacts/segments'),
      ]);
      setContacts(list);
      setSegments(segmentData);
    } finally {
      setLoading(false);
    }
  }, [type, consent, platform, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 220);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openNew = () => {
    setForm({ ...EMPTY_FORM });
    setFormOpen(true);
  };

  const openEdit = (contact: Contact) => {
    setForm({
      id: contact.id,
      type: contact.type,
      name: contact.name,
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      platform: contact.platform ?? 'instagram',
      tags: contact.tags.join(', '),
      source: contact.source ?? 'Manual',
      ltv: contact.ltv,
      consent: contact.consent,
      sentiment: contact.sentiment,
      score: contact.score,
      note: contact.note ?? '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const payload = {
        type: form.type,
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        platform: form.platform,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        source: form.source || 'Manual',
        ltv: Number(form.ltv) || 0,
        consent: form.consent,
        sentiment: form.sentiment,
        score: Number(form.score) || 50,
        note: form.note,
      };
      if (form.id) await api.patch(`/contacts/${form.id}`, payload);
      else await api.post('/contacts', payload);
      toast.push(t('audience.saved'));
      setFormOpen(false);
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/contacts/${deleteTarget.id}`);
      toast.push(t('audience.deleted'));
      setDeleteTarget(null);
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    }
  };

  const exportCsv = async () => {
    try {
      await downloadFile('/contacts/export.csv', { type, consent, platform, q: query });
      toast.push(t('common.export'));
    } catch {
      toast.push(t('error.generic'), { kind: 'error' });
    }
  };

  const platformOptions = useMemo(
    () => ALL_PLATFORMS.filter((item) => item.group === 'social'),
    [],
  );

  return (
    <div className="page">
      <PageHeader
        title={t('audience.title')}
        subtitle={t('audience.subtitle')}
        actions={
          <>
            <button className="btn" onClick={exportCsv}>
              <Icon name="download" size={15} /> {t('audience.export')}
            </button>
            {can('editor') ? (
              <button className="btn primary" onClick={openNew}>
                <Icon name="plus" size={15} /> {t('audience.add')}
              </button>
            ) : null}
          </>
        }
      />

      <div className="grid grid-4">
        <div className="card kpi">
          <span className="kpi-label">{t('audience.total')}</span>
          <span className="kpi-value">{segments?.total ?? 0}</span>
          <span className="kpi-foot">{t('audience.customers')} {segments?.customers ?? 0} · {t('audience.prospects')} {segments?.prospects ?? 0}</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label">{t('audience.customers')}</span>
          <span className="kpi-value">{segments?.customers ?? 0}</span>
          <span className="kpi-foot">{t('audience.sentiment.positive')} {segments?.positive ?? 0}</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label">{t('audience.ltv')}</span>
          <span className="kpi-value">{fmtTHB(segments?.totalLtv ?? 0, lang, true)}</span>
          <span className="kpi-foot">{t('audience.ltvHint')}</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label">{t('audience.revoked')}</span>
          <span className="kpi-value">{segments?.revoked ?? 0}</span>
          <span className="kpi-foot">PDPA · opt-out</span>
        </div>
      </div>

      <div className="pdpa-note section">
        <Icon name="shield" size={18} style={{ flex: 'none', marginTop: 1 }} />
        <div>
          <b>{t('audience.pdpaTitle')}</b>
          <div>{t('audience.pdpaBody')}</div>
        </div>
      </div>

      <Card className="section" flush>
        <div className="cal-toolbar" style={{ padding: '14px 16px 0', marginBottom: 12 }}>
          <div className="search-box" style={{ maxWidth: 280, flex: 1 }}>
            <Icon name="search" size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('audience.searchPlaceholder')}
              style={{ height: 34 }}
            />
          </div>
          <select className="select sm" value={type} onChange={(event) => setType(event.target.value)} style={{ width: 140 }}>
            <option value="all">{t('audience.allTypes')}</option>
            <option value="customer">{t('audience.customer')}</option>
            <option value="prospect">{t('audience.prospect')}</option>
          </select>
          <select className="select sm" value={platform} onChange={(event) => setPlatform(event.target.value)} style={{ width: 150 }}>
            <option value="all">{t('audience.allPlatforms')}</option>
            {platformOptions.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
          <select className="select sm" value={consent} onChange={(event) => setConsent(event.target.value)} style={{ width: 140 }}>
            <option value="all">{t('audience.allConsent')}</option>
            <option value="granted">{t('audience.consent.granted')}</option>
            <option value="revoked">{t('audience.consent.revoked')}</option>
            <option value="pending">{t('audience.consent.pending')}</option>
          </select>
          <span className="spacer" />
          <span className="small muted">{contacts.length} {t('audience.total')}</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('audience.type')}</th>
                <th>{t('common.platforms')}</th>
                <th>{t('audience.tags')}</th>
                <th>{t('audience.score')}</th>
                <th>{t('audience.consent')}</th>
                <th className="num">LTV</th>
                <th>{t('audience.lastInteraction')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(contact)}>
                  <td>
                    <div className="strong">{contact.name}</div>
                    <div className="tiny muted">{contact.email}</div>
                  </td>
                  <td><StatusBadge status={contact.type} /></td>
                  <td>
                    {contact.platform ? (
                      <span className="row" style={{ gap: 6 }}>
                        <PlatformIcon platform={contact.platform} size="sm" />
                        <span className="small">{contact.platform}</span>
                      </span>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td>
                    <span className="row wrap" style={{ gap: 4 }}>
                      {contact.tags.slice(0, 2).map((tag) => (
                        <span className="tag" key={tag}>{tag}</span>
                      ))}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <div className="score-meter"><span style={{ width: `${contact.score}%` }} /></div>
                      <span className="tiny muted">{contact.score}</span>
                    </div>
                  </td>
                  <td><StatusBadge status={contact.consent} /></td>
                  <td className="num">{contact.ltv ? fmtTHB(contact.ltv, lang, true) : '—'}</td>
                  <td className="small muted">{relativeTime(contact.lastInteractionAt, lang)}</td>
                  <td className="actions" onClick={(event) => event.stopPropagation()}>
                    <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                      <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => openEdit(contact)}>
                        <Icon name="edit" size={14} />
                      </button>
                      {can('admin') ? (
                        <button
                          className="icon-btn"
                          style={{ width: 28, height: 28, color: 'var(--rose)' }}
                          onClick={() => setDeleteTarget(contact)}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!contacts.length && !loading ? (
                <tr>
                  <td colSpan={9}>
                    <Empty icon="users" title={query || type !== 'all' ? t('audience.emptyFilter') : t('audience.empty')} />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-2 section">
        <Card title={t('audience.topSources')} subtitle={t('audience.segmentInsight')}>
          {segments?.platforms?.length ? (
            <div className="col" style={{ gap: 4 }}>
              {segments.platforms.map((item) => {
                const max = Math.max(...segments.platforms.map((row) => row.n));
                return (
                  <div key={item.platform} className="row" style={{ gap: 10, padding: '4px 0' }}>
                    <PlatformIcon platform={item.platform} size="sm" />
                    <span className="small" style={{ width: 100 }}>{t(`platform.${item.platform}`)}</span>
                    <div className="progress" style={{ flex: 1 }}>
                      <span style={{ width: `${(item.n / max) * 100}%` }} />
                    </div>
                    <span className="tiny muted" style={{ width: 28, textAlign: 'right' }}>{item.n}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty icon="users" title={t('common.noData')} />
          )}
        </Card>
        <Card title={t('audience.segmentInsight')} subtitle={t('audience.pdpaTitle')}>
          <div className="grid grid-2" style={{ gap: 10 }}>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px' }}>
              <div className="tiny muted">{t('audience.customers')}</div>
              <div className="small strong" style={{ fontSize: 16 }}>{segments?.customers ?? 0}</div>
              <Progress value={segments ? (segments.customers / Math.max(segments.total, 1)) * 100 : 0} />
            </div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px' }}>
              <div className="tiny muted">{t('audience.prospects')}</div>
              <div className="small strong" style={{ fontSize: 16 }}>{segments?.prospects ?? 0}</div>
              <Progress value={segments ? (segments.prospects / Math.max(segments.total, 1)) * 100 : 0} />
            </div>
          </div>
          <p className="tiny faint" style={{ marginTop: 12 }}>{t('audience.maskedNote')}</p>
        </Card>
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.id ? t('audience.edit') : t('audience.add')}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setFormOpen(false)}>{t('common.cancel')}</button>
            <button className="btn primary" onClick={save} disabled={busy || !form.name.trim()}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        <div className="form-stack">
          <div className="form-row">
            <Field label={t('common.name')}>
              <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <Field label={t('common.email')}>
              <input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </Field>
          </div>
          <div className="form-row">
            <Field label={t('audience.type')}>
              <select className="select" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                <option value="prospect">{t('audience.prospect')}</option>
                <option value="customer">{t('audience.customer')}</option>
              </select>
            </Field>
            <Field label={t('common.platforms')}>
              <select className="select" value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value })}>
                {platformOptions.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t('audience.tags')} hint={t('audience.tagsPlaceholder')}>
            <input className="input" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="VIP, Bangkok" />
          </Field>
          <div className="form-row">
            <Field label={t('audience.source')}>
              <input className="input" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} />
            </Field>
            <Field label="LTV (THB)">
              <input className="input" type="number" min={0} value={form.ltv} onChange={(event) => setForm({ ...form, ltv: Number(event.target.value) })} />
            </Field>
          </div>
          <div className="form-row">
            <Field label={t('audience.consent')}>
              <select className="select" value={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.value })}>
                <option value="granted">{t('audience.consent.granted')}</option>
                <option value="pending">{t('audience.consent.pending')}</option>
                <option value="revoked">{t('audience.consent.revoked')}</option>
              </select>
            </Field>
            <Field label={t('audience.sentiment')}>
              <select className="select" value={form.sentiment} onChange={(event) => setForm({ ...form, sentiment: event.target.value })}>
                <option value="positive">{t('audience.sentiment.positive')}</option>
                <option value="neutral">{t('audience.sentiment.neutral')}</option>
                <option value="negative">{t('audience.sentiment.negative')}</option>
              </select>
            </Field>
          </div>
          <Field label={`${t('audience.score')} (${form.score})`}>
            <input
              type="range"
              min={0}
              max={100}
              value={form.score}
              onChange={(event) => setForm({ ...form, score: Number(event.target.value) })}
              style={{ accentColor: 'var(--primary)' }}
            />
          </Field>
          <Field label={t('audience.note')} hint={t('common.optional')}>
            <textarea className="textarea" style={{ minHeight: 70 }} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          </Field>
          <div className="notice info">
            <Icon name="shield" size={15} />
            <span>{t('audience.maskedNote')}</span>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('common.delete')}
        body={t('audience.confirmDelete')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />
      <span style={{ display: 'none' }}>
        <Badge tone="">{segments?.total ?? 0}</Badge>
      </span>
      {loading ? <div className="small muted" style={{ marginTop: 8 }}>{t('common.loading')}</div> : null}
    </div>
  );
}
