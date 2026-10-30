import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type Brand, type Campaign, type Post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { addDaysISO, fmtCompact, fmtDate, fmtTHB, todayISO } from '../lib/format';
import { Icon } from '../components/Icon';
import { PlatformIcon, PlatformStack } from '../components/PlatformIcon';
import {
  Badge,
  Card,
  ConfirmDialog,
  Drawer,
  Empty,
  Field,
  Modal,
  PageHeader,
  Progress,
  StatusBadge,
} from '../components/UI';

const OBJECTIVES = ['awareness', 'engagement', 'conversion', 'lead_generation', 'traffic'];

export function CampaignsPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [boostable, setBoostable] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Campaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    name: '',
    brandId: '',
    objective: 'awareness',
    budget: 40000,
    startDate: todayISO(),
    endDate: addDaysISO(todayISO(), 30),
    platforms: ['facebook', 'instagram'],
  });

  const [boost, setBoost] = useState({ postId: '', budget: 15000, duration: 14 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, brandList, posts] = await Promise.all([
        api.get<Campaign[]>('/campaigns'),
        api.get<Brand[]>('/brands'),
        api.get<Post[]>('/campaigns/boostable'),
      ]);
      setCampaigns(list);
      setBrands(brandList);
      setBoostable(posts);
      if (brandList.length) {
        setForm((prev) => ({ ...prev, brandId: prev.brandId || brandList[0].id }));
        setBoost((prev) => ({ ...prev, postId: prev.postId || posts[0]?.id || '' }));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const active = campaigns.filter((item) => item.status === 'active');
    const spend = campaigns.reduce((acc, item) => acc + item.spend, 0);
    const revenue = campaigns.reduce((acc, item) => acc + (item.results.revenue ?? 0), 0);
    const leads = campaigns.reduce((acc, item) => acc + (item.results.leads ?? 0), 0);
    return {
      active: active.length,
      spend,
      roas: spend ? revenue / spend : 0,
      cpl: leads ? spend / leads : 0,
    };
  }, [campaigns]);

  const createCampaign = async () => {
    if (!form.name.trim() || !form.brandId) return;
    setBusy(true);
    try {
      await api.post('/campaigns', {
        brandId: form.brandId,
        name: form.name.trim(),
        objective: form.objective,
        status: 'draft',
        budget: Number(form.budget),
        startDate: form.startDate,
        endDate: form.endDate,
        platforms: form.platforms,
      });
      toast.push(t('campaigns.created'), { detail: form.name });
      setCreateOpen(false);
      setForm((prev) => ({ ...prev, name: '' }));
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const createBoost = async () => {
    const post = boostable.find((item) => item.id === boost.postId);
    if (!post) return;
    setBusy(true);
    try {
      await api.post('/campaigns', {
        brandId: post.brandId,
        name: `Boost · ${post.title}`.slice(0, 110),
        objective: 'engagement',
        status: 'active',
        budget: Number(boost.budget),
        startDate: todayISO(),
        endDate: addDaysISO(todayISO(), Number(boost.duration)),
        platforms: post.platforms,
        boostPostId: post.id,
      });
      toast.push(t('campaigns.boostCreated'), { detail: post.title });
      setBoostOpen(false);
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (campaign: Campaign, status: string) => {
    try {
      await api.patch(`/campaigns/${campaign.id}`, { status });
      toast.push(t('campaigns.updated'), { detail: campaign.name });
      setDetail((prev) => (prev ? { ...prev, status } : prev));
      await load();
    } catch {
      toast.push(t('error.generic'), { kind: 'error' });
    }
  };

  const removeCampaign = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/campaigns/${deleteTarget.id}`);
      toast.push(t('campaigns.deleted'));
      setDeleteTarget(null);
      setDetail(null);
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    }
  };

  const pacingTone = (value: number) => (value > 115 ? 'danger' : value > 100 ? 'warn' : undefined);

  return (
    <div className="page">
      <PageHeader
        title={t('campaigns.title')}
        subtitle={t('campaigns.subtitle')}
        actions={
          can('editor') ? (
            <>
              <button className="btn" onClick={() => setBoostOpen(true)}>
                <Icon name="zap" size={15} /> {t('campaigns.boost')}
              </button>
              <button className="btn primary" onClick={() => setCreateOpen(true)}>
                <Icon name="plus" size={15} /> {t('campaigns.new')}
              </button>
            </>
          ) : null
        }
      />

      <div className="grid grid-4">
        <div className="card kpi">
          <span className="kpi-label">{t('campaigns.active')}</span>
          <span className="kpi-value">{stats.active}</span>
          <span className="kpi-foot">{campaigns.length} {t('campaigns.tableTitle').toLowerCase()}</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label">{t('campaigns.spendMonth')}</span>
          <span className="kpi-value">{fmtTHB(stats.spend, lang, true)}</span>
          <span className="kpi-foot">{fmtTHB(campaigns.reduce((acc, c) => acc + c.budget, 0), lang, true)} {t('campaigns.totalBudget').toLowerCase()}</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label">{t('campaigns.avgRoas')}</span>
          <span className="kpi-value">{stats.roas.toFixed(2)}x</span>
          <span className="kpi-foot">{t('campaigns.estimated')}</span>
        </div>
        <div className="card kpi">
          <span className="kpi-label">{t('campaigns.avgCpa')}</span>
          <span className="kpi-value">{fmtTHB(stats.cpl, lang)}</span>
          <span className="kpi-foot">{t('campaigns.cpl')}</span>
        </div>
      </div>

      <Card
        title={t('campaigns.tableTitle')}
        subtitle={t('campaigns.subtitle')}
        flush
        className="section"
        action={<Badge tone="">{campaigns.length}</Badge>}
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('campaigns.name')}</th>
                <th>{t('campaigns.objective')}</th>
                <th>{t('common.platforms')}</th>
                <th style={{ width: 180 }}>{t('campaigns.pacing')}</th>
                <th className="num">{t('common.results')}</th>
                <th className="num">ROAS</th>
                <th>{t('common.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(campaign)}>
                  <td>
                    <div className="strong">{campaign.name}</div>
                    <div className="tiny muted">
                      <span className="row" style={{ gap: 5 }}>
                        <span className="swatch" style={{ width: 6, height: 6, borderRadius: 2, background: campaign.brandColor ?? 'var(--primary)' }} />
                        {campaign.brandName} · {campaign.startDate ? fmtDate(campaign.startDate, lang) : '—'} → {campaign.endDate ? fmtDate(campaign.endDate, lang) : '—'}
                      </span>
                    </div>
                  </td>
                  <td><span className="small">{t(`campaigns.objective.${campaign.objective}`)}</span></td>
                  <td><PlatformStack platforms={campaign.platforms} max={3} /></td>
                  <td>
                    <div className="row between tiny muted" style={{ marginBottom: 4 }}>
                      <span>{fmtTHB(campaign.spend, lang, true)} / {fmtTHB(campaign.budget, lang, true)}</span>
                      <span>{campaign.budgetUsed}%</span>
                    </div>
                    <Progress value={campaign.budgetUsed} tone={pacingTone(campaign.pacing)} />
                  </td>
                  <td className="num">
                    {campaign.status === 'draft' ? (
                      <span className="faint">—</span>
                    ) : (
                      <>
                        <div className="small strong">{fmtCompact(campaign.results.leads ?? 0, lang)} leads</div>
                        <div className="tiny muted">{fmtCompact(campaign.results.impressions ?? 0, lang)} imp.</div>
                      </>
                    )}
                  </td>
                  <td className="num">{campaign.roas ? `${campaign.roas.toFixed(2)}x` : '—'}</td>
                  <td><StatusBadge status={campaign.status} /></td>
                  <td className="actions" onClick={(event) => event.stopPropagation()}>
                    <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                      {campaign.status === 'active' ? (
                        <button className="btn xs" onClick={() => updateStatus(campaign, 'paused')}>
                          <Icon name="refresh" size={11} /> {t('campaigns.pause')}
                        </button>
                      ) : campaign.status === 'paused' || campaign.status === 'draft' ? (
                        <button className="btn xs" onClick={() => updateStatus(campaign, 'active')}>
                          <Icon name="play" size={11} /> {t('campaigns.resume')}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!campaigns.length && !loading ? (
                <tr>
                  <td colSpan={8}><Empty icon="megaphone" title={t('campaigns.noCampaigns')} /></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name ?? ''}
        subtitle={`${detail?.brandName ?? ''} · ${detail ? t(`campaigns.objective.${detail.objective}`) : ''}`}
        footer={
          detail ? (
            <>
              {can('admin') ? (
                <button className="btn danger" onClick={() => setDeleteTarget(detail)}>
                  <Icon name="trash" size={14} />
                </button>
              ) : null}
              <span className="spacer" />
              {detail.status === 'active' ? (
                <button className="btn" onClick={() => updateStatus(detail, 'paused')}>{t('campaigns.pause')}</button>
              ) : (
                <button className="btn" onClick={() => updateStatus(detail, 'active')}>{t('campaigns.resume')}</button>
              )}
              <button className="btn primary" onClick={() => updateStatus(detail, 'completed')}>{t('campaigns.complete')}</button>
            </>
          ) : null
        }
      >
        {detail ? (
          <div className="form-stack">
            <div className="row between">
              <StatusBadge status={detail.status} />
              <span className="small muted">{t('campaigns.daysLeft', { days: detail.daysLeft })}</span>
            </div>

            <div className="stat-strip">
              <div>
                <div className="s-label">{t('campaigns.totalBudget')}</div>
                <div className="s-value">{fmtTHB(detail.budget, lang)}</div>
              </div>
              <div>
                <div className="s-label">{t('common.spend')}</div>
                <div className="s-value">{fmtTHB(detail.spend, lang)}</div>
              </div>
              <div>
                <div className="s-label">{t('campaigns.remaining')}</div>
                <div className="s-value">{fmtTHB(Math.max(detail.budget - detail.spend, 0), lang)}</div>
              </div>
            </div>

            <div>
              <div className="row between small" style={{ marginBottom: 6 }}>
                <span className="muted">{t('campaigns.pacing')}</span>
                <span>{detail.pacing}%</span>
              </div>
              <Progress value={detail.pacing} tone={pacingTone(detail.pacing)} />
              <div className="tiny faint" style={{ marginTop: 4 }}>
                {detail.pacing > 110 ? t('campaigns.pacingFast') : detail.pacing < 85 ? t('campaigns.pacingSlow') : t('campaigns.pacingOnTrack')} · {t('campaigns.dailyBudget')} {fmtTHB(detail.dailyBudget, lang)}
              </div>
            </div>

            <div className="divider" />

            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>{t('campaigns.results')}</div>
              <div className="grid grid-2" style={{ gap: 10 }}>
                <Metric label={t('common.impressions')} value={fmtCompact(detail.results.impressions ?? 0, lang)} />
                <Metric label={t('common.clicks')} value={fmtCompact(detail.results.clicks ?? 0, lang)} />
                <Metric label={t('common.leads')} value={fmtCompact(detail.results.leads ?? 0, lang)} />
                <Metric label={t('common.revenue')} value={fmtTHB(detail.results.revenue ?? 0, lang, true)} />
                <Metric label="ROAS" value={`${detail.roas.toFixed(2)}x`} />
                <Metric label={t('campaigns.cpl')} value={fmtTHB(detail.cpl, lang)} />
              </div>
            </div>

            <div className="divider" />

            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>{t('campaigns.platformBreakdown')}</div>
              {detail.platforms.map((platform, index) => {
                const weight = 1 + ((index * 7) % 5) / 10;
                const total = detail.platforms.reduce((acc, _, i) => acc + 1 + ((i * 7) % 5) / 10, 0);
                const share = weight / total;
                return (
                  <div className="row between" key={platform} style={{ padding: '6px 0' }}>
                    <span className="row" style={{ gap: 8 }}>
                      <PlatformIcon platform={platform} size="sm" />
                      <span className="small">{platform}</span>
                    </span>
                    <span className="small muted">
                      {fmtCompact(Math.round((detail.results.impressions ?? 0) * share), lang)} imp ·{' '}
                      {fmtTHB(Math.round(detail.spend * share), lang, true)}
                    </span>
                  </div>
                );
              })}
              <p className="tiny faint" style={{ marginTop: 4 }}>{t('campaigns.estimated')}</p>
            </div>

            {detail.boostPostId ? (
              <div className="notice info">
                <Icon name="zap" size={15} />
                <span>Boosted post · {detail.boostPostId}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('campaigns.createTitle')}
        footer={
          <>
            <button className="btn" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</button>
            <button className="btn primary" onClick={createCampaign} disabled={busy || !form.name.trim()}>
              {busy ? t('common.saving') : t('common.create')}
            </button>
          </>
        }
      >
        <div className="form-stack">
          <Field label={t('campaigns.name')}>
            <input
              className="input"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t('campaigns.namePlaceholder')}
            />
          </Field>
          <div className="form-row">
            <Field label={t('common.brand')}>
              <select className="select" value={form.brandId} onChange={(event) => setForm({ ...form, brandId: event.target.value })}>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </select>
            </Field>
            <Field label={t('campaigns.objective')}>
              <select className="select" value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })}>
                {OBJECTIVES.map((key) => (
                  <option key={key} value={key}>{t(`campaigns.objective.${key}`)}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t('campaigns.budgetLabel')}>
            <input
              className="input"
              type="number"
              min={0}
              step={1000}
              value={form.budget}
              onChange={(event) => setForm({ ...form, budget: Number(event.target.value) })}
            />
          </Field>
          <div className="form-row">
            <Field label={t('campaigns.startDate')}>
              <input className="input" type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
            </Field>
            <Field label={t('campaigns.endDate')}>
              <input className="input" type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
            </Field>
          </div>
          <Field label={t('common.platforms')}>
            <div className="chips">
              {['facebook', 'instagram', 'tiktok', 'line', 'linkedin', 'x', 'youtube'].map((platform) => (
                <button
                  key={platform}
                  type="button"
                  className={`chip ${form.platforms.includes(platform) ? 'active' : ''}`}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      platforms: prev.platforms.includes(platform)
                        ? prev.platforms.filter((p) => p !== platform)
                        : [...prev.platforms, platform],
                    }))
                  }
                >
                  <PlatformIcon platform={platform} size="sm" />
                  {platform}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Modal>

      <Modal
        open={boostOpen}
        onClose={() => setBoostOpen(false)}
        title={t('campaigns.boostTitle')}
        subtitle={t('campaigns.boostSub')}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setBoostOpen(false)}>{t('common.cancel')}</button>
            <button className="btn primary" onClick={createBoost} disabled={busy || !boost.postId}>
              {busy ? t('common.saving') : t('campaigns.boostCreate')}
            </button>
          </>
        }
      >
        {boostable.length === 0 ? (
          <Empty icon="megaphone" title={t('campaigns.noBoostable')} />
        ) : (
          <div className="form-stack">
            <div className="col" style={{ gap: 8, maxHeight: 300, overflowY: 'auto' }}>
              {boostable.slice(0, 8).map((post) => (
                <button
                  key={post.id}
                  onClick={() => setBoost({ ...boost, postId: post.id })}
                  className="row between"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 11,
                    border: `1px solid ${boost.postId === post.id ? 'var(--primary)' : 'var(--border)'}`,
                    background: boost.postId === post.id ? 'var(--primary-weak)' : 'var(--surface)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    gap: 10,
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span className="small strong truncate" style={{ display: 'block' }}>{post.title}</span>
                    <span className="tiny muted">{post.brandName} · {fmtCompact(post.metrics.engagements ?? 0, lang)} engagement</span>
                  </span>
                  <PlatformStack platforms={post.platforms} max={3} />
                </button>
              ))}
            </div>
            <div className="form-row">
              <Field label={t('campaigns.boostBudget')}>
                <input
                  className="input"
                  type="number"
                  min={1000}
                  step={1000}
                  value={boost.budget}
                  onChange={(event) => setBoost({ ...boost, budget: Number(event.target.value) })}
                />
              </Field>
              <Field label={t('campaigns.boostDuration')}>
                <input
                  className="input"
                  type="number"
                  min={3}
                  max={60}
                  value={boost.duration}
                  onChange={(event) => setBoost({ ...boost, duration: Number(event.target.value) })}
                />
              </Field>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('campaigns.confirmDelete')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={removeCampaign}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '9px 12px' }}>
      <div className="tiny muted">{label}</div>
      <div className="small strong" style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
}
