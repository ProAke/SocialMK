import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  ApiError,
  type Asset,
  type Brand,
  type CopyVariant,
  type Post,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import {
  addDaysISO,
  dateKey,
  fmtDate,
  fmtTime,
  monthLabel,
  monthMatrix,
  timeOf,
  toDateTimeInput,
  todayISO,
  truncate,
  weekdayLabels,
} from '../lib/format';
import { useToast } from '../lib/toast';
import { Icon } from '../components/Icon';
import { ALL_PLATFORMS, PlatformIcon } from '../components/PlatformIcon';
import {
  Badge,
  Card,
  ConfirmDialog,
  Drawer,
  Empty,
  Field,
  Modal,
  PageHeader,
  Segmented,
  StatusBadge,
} from '../components/UI';

const CONTENT_TYPES = ['image', 'carousel', 'reel', 'story', 'live', 'text'];
const STATUSES = ['idea', 'draft', 'review', 'approved', 'scheduled', 'published', 'archived'];

interface PostFormState {
  id?: string;
  brandId: string;
  title: string;
  body: string;
  hashtags: string;
  platforms: string[];
  contentType: string;
  pillar: string;
  date: string;
  time: string;
  status: string;
  notes: string;
  media: Array<{ type: string; url: string; alt?: string }>;
  aiGenerated: boolean;
}

function emptyForm(date: string, brandId: string): PostFormState {
  return {
    brandId,
    title: '',
    body: '',
    hashtags: '',
    platforms: ['facebook'],
    contentType: 'image',
    pillar: '',
    date,
    time: '09:00',
    status: 'draft',
    notes: '',
    media: [],
    aiGenerated: false,
  };
}

function fromPost(post: Post): PostFormState {
  return {
    id: post.id,
    brandId: post.brandId,
    title: post.title,
    body: post.body,
    hashtags: post.hashtags.join(' '),
    platforms: post.platforms,
    contentType: post.contentType,
    pillar: post.pillar ?? '',
    date: dateKey(post.scheduledAt) || todayISO(),
    time: timeOf(post.scheduledAt),
    status: post.status,
    notes: post.notes ?? '',
    media: post.media ?? [],
    aiGenerated: post.aiGenerated,
  };
}

export function CalendarPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();

  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const [year, month] = today.split('-').map(Number);
    return { year, month };
  });
  const [view, setView] = useState<'month' | 'list'>('month');
  const [brandId, setBrandId] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [status, setStatus] = useState('all');
  const [posts, setPosts] = useState<Post[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<PostFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiVariants, setAiVariants] = useState<CopyVariant[] | null>(null);

  const [planOpen, setPlanOpen] = useState(false);
  const [planBrand, setPlanBrand] = useState('');
  const [planMonth, setPlanMonth] = useState(today.slice(0, 7));
  const [planPlatforms, setPlanPlatforms] = useState<string[]>(['facebook', 'instagram']);
  const [planCadence, setPlanCadence] = useState(3);
  const [planTopics, setPlanTopics] = useState('');
  const [planItems, setPlanItems] = useState<Array<Record<string, any>> | null>(null);
  const [planBusy, setPlanBusy] = useState(false);

  const cells = useMemo(() => monthMatrix(cursor.year, cursor.month), [cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [postList, brandList, assetList] = await Promise.all([
        api.get<Post[]>('/posts', {
          from: cells[0],
          to: cells[cells.length - 1],
          brandId,
          platform,
          status,
        }),
        api.get<Brand[]>('/brands'),
        api.get<Asset[]>('/assets'),
      ]);
      setPosts(postList);
      setBrands(brandList);
      setAssets(assetList);
      if (!planBrand && brandList.length) setPlanBrand(brandList[0].id);
    } finally {
      setLoading(false);
    }
  }, [cells, brandId, platform, status, planBrand]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const post of posts) {
      const key = dateKey(post.scheduledAt);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(post);
    }
    return map;
  }, [posts]);

  const monthPosts = posts.filter((post) => dateKey(post.scheduledAt).slice(0, 7) === `${cursor.year}-${String(cursor.month).padStart(2, '0')}`);

  const canEdit = can('editor');

  const openNew = (date: string) => {
    if (!canEdit) return;
    setAiVariants(null);
    setForm(emptyForm(date, brandId !== 'all' ? brandId : brands[0]?.id ?? ''));
  };

  const openEdit = (post: Post) => {
    setAiVariants(null);
    setForm(fromPost(post));
  };

  const save = async () => {
    if (!form) return;
    if (!form.title.trim()) {
      toast.push(t('calendar.titleRequired'), { kind: 'error' });
      return;
    }
    if (!form.platforms.length) {
      toast.push(t('calendar.platformRequired'), { kind: 'error' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        brandId: form.brandId,
        title: form.title.trim(),
        body: form.body,
        hashtags: form.hashtags.split(/\s+/).filter(Boolean),
        platforms: form.platforms,
        contentType: form.contentType,
        pillar: form.pillar || undefined,
        scheduledAt: toDateTimeInput(form.date, form.time),
        status: form.status,
        notes: form.notes,
        media: form.media,
        aiGenerated: form.aiGenerated,
      };
      if (form.id) {
        await api.patch<Post>(`/posts/${form.id}`, payload);
      } else {
        await api.post<Post>('/posts', payload);
      }
      toast.push(t('calendar.saved'), { detail: form.title });
      setForm(null);
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    if (!form?.id) return;
    try {
      const copy = await api.post<Post>(`/posts/${form.id}/duplicate`);
      toast.push(t('calendar.saved'), { detail: copy.title });
      setForm(fromPost(copy));
      await load();
    } catch {
      toast.push(t('error.generic'), { kind: 'error' });
    }
  };

  const remove = async () => {
    if (!form?.id) return;
    setDeleting(true);
    try {
      await api.del(`/posts/${form.id}`);
      toast.push(t('calendar.deletedToast'));
      setForm(null);
      setDeleteTarget(null);
      await load();
    } catch {
      toast.push(t('error.generic'), { kind: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const movePost = async (postId: string, date: string) => {
    const post = posts.find((item) => item.id === postId);
    if (!post || !canEdit) return;
    const time = timeOf(post.scheduledAt);
    setPosts((prev) =>
      prev.map((item) =>
        item.id === postId ? { ...item, scheduledAt: `${date}T${time}:00+07:00` } : item,
      ),
    );
    try {
      await api.patch(`/posts/${postId}`, { scheduledAt: toDateTimeInput(date, time) });
      toast.push(t('calendar.moved', { date: fmtDate(date, lang) }));
    } catch {
      toast.push(t('error.generic'), { kind: 'error' });
      await load();
    }
  };

  const runAi = async () => {
    if (!form) return;
    setAiBusy(true);
    try {
      const result = await api.post<{ variants: CopyVariant[] }>('/ai/copy', {
        brandId: form.brandId,
        platform: form.platforms[0] ?? 'facebook',
        objective: 'engagement',
        language: lang,
        keywords: form.title || form.pillar,
      });
      setAiVariants(result.variants);
    } catch {
      toast.push(t('error.generic'), { kind: 'error' });
    } finally {
      setAiBusy(false);
    }
  };

  const generatePlan = async () => {
    if (!planBrand) return;
    setPlanBusy(true);
    try {
      const result = await api.post<{ items: Array<Record<string, any>> }>('/ai/plan', {
        brandId: planBrand,
        month: planMonth,
        platforms: planPlatforms,
        postsPerWeek: planCadence,
        language: lang,
        topics: planTopics,
      });
      setPlanItems(result.items);
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    } finally {
      setPlanBusy(false);
    }
  };

  const applyPlan = async () => {
    if (!planItems?.length || !planBrand) return;
    setPlanBusy(true);
    try {
      const result = await api.post<{ created: number }>('/ai/plan/apply', {
        brandId: planBrand,
        items: planItems,
      });
      toast.push(t('calendar.planApplied', { count: result.created }));
      setPlanOpen(false);
      setPlanItems(null);
      await load();
    } catch {
      toast.push(t('error.generic'), { kind: 'error' });
    } finally {
      setPlanBusy(false);
    }
  };

  const goMonth = (delta: number) => {
    setCursor((prev) => {
      const next = new Date(Date.UTC(prev.year, prev.month - 1 + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 };
    });
  };

  const weekdays = weekdayLabels(lang);

  return (
    <div className="page">
      <PageHeader
        title={t('calendar.title')}
        subtitle={t('calendar.subtitle')}
        actions={
          canEdit ? (
            <>
              <button className="btn" onClick={() => setPlanOpen(true)}>
                <Icon name="sparkles" size={15} /> {t('calendar.aiPlan')}
              </button>
              <button className="btn primary" onClick={() => openNew(today)}>
                <Icon name="plus" size={15} /> {t('calendar.newPost')}
              </button>
            </>
          ) : (
            <Badge tone="">{t('common.analyst')} · read-only</Badge>
          )
        }
      />

      <div className="cal-toolbar">
        <div className="cal-nav">
          <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => goMonth(-1)}>
            <Icon name="chevron-left" size={16} />
          </button>
          <button className="btn sm ghost" onClick={() => setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) })}>
            {t('calendar.today')}
          </button>
          <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => goMonth(1)}>
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
        <div className="cal-month">{monthLabel(cursor.year, cursor.month, lang)}</div>
        <span className="badge" style={{ background: 'var(--surface-2)' }}>
          {monthPosts.length} {t('calendar.postsThisMonth')}
        </span>
        <span className="spacer" />
        <select className="select sm" value={brandId} onChange={(event) => setBrandId(event.target.value)} style={{ width: 150 }}>
          <option value="all">{t('calendar.allBrands')}</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>{brand.name}</option>
          ))}
        </select>
        <select className="select sm" value={platform} onChange={(event) => setPlatform(event.target.value)} style={{ width: 150 }}>
          <option value="all">{t('calendar.allPlatforms')}</option>
          {ALL_PLATFORMS.filter((p) => p.group !== 'future').map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
        <select className="select sm" value={status} onChange={(event) => setStatus(event.target.value)} style={{ width: 150 }}>
          <option value="all">{t('calendar.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{t(`calendar.status.${s}`)}</option>
          ))}
        </select>
        <Segmented
          value={view}
          onChange={(key) => setView(key as 'month' | 'list')}
          options={[
            { key: 'month', label: t('calendar.month') },
            { key: 'list', label: t('calendar.list') },
          ]}
        />
      </div>

      {view === 'month' ? (
        <div className="calendar">
          {weekdays.map((day) => (
            <div key={day} className="cal-dow">{day}</div>
          ))}
          {cells.map((date) => {
            const inMonth = date.slice(0, 7) === `${cursor.year}-${String(cursor.month).padStart(2, '0')}`;
            const isToday = date === today;
            const dayPosts = grouped.get(date) ?? [];
            return (
              <div
                key={date}
                className={`cal-cell ${inMonth ? '' : 'dim'} ${isToday ? 'today' : ''} ${dragOver === date ? 'drag-over' : ''}`}
                onDragOver={(event) => {
                  if (!canEdit) return;
                  event.preventDefault();
                  setDragOver(date);
                }}
                onDragLeave={() => setDragOver((prev) => (prev === date ? null : prev))}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(null);
                  const postId = event.dataTransfer.getData('text/plain');
                  if (postId) void movePost(postId, date);
                }}
              >
                <div className="cal-date">
                  <span>{Number(date.slice(8, 10))}</span>
                  {canEdit ? (
                    <button className="cal-add" onClick={() => openNew(date)} title={t('calendar.newPost')}>
                      <Icon name="plus" size={13} />
                    </button>
                  ) : null}
                </div>
                {dayPosts.slice(0, 3).map((post) => (
                  <div
                    key={post.id}
                    className={`cal-post ${post.status}`}
                    style={{ ['--brand' as any]: post.brandColor ?? 'var(--primary)' }}
                    draggable={canEdit}
                    onDragStart={(event) => event.dataTransfer.setData('text/plain', post.id)}
                    onClick={() => openEdit(post)}
                    title={`${post.title} · ${fmtTime(post.scheduledAt)}`}
                  >
                    <span className="cp-dot" style={{ background: post.brandColor ?? 'var(--primary)' }} />
                    <span className="cp-title">{truncate(post.title, 26)}</span>
                    {post.platforms[0] ? <PlatformIcon platform={post.platforms[0]} size="sm" /> : null}
                  </div>
                ))}
                {dayPosts.length > 3 ? (
                  <button className="cal-more" onClick={() => { setView('list'); }}>
                    +{dayPosts.length - 3} {t('common.more')}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <Card flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('calendar.schedule')}</th>
                  <th>{t('calendar.postTitle')}</th>
                  <th>{t('common.brand')}</th>
                  <th>{t('common.platforms')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('calendar.owner')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...posts]
                  .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''))
                  .map((post) => (
                    <tr key={post.id} style={{ cursor: 'pointer' }} onClick={() => openEdit(post)}>
                      <td>
                        <div className="small strong">{fmtDate(post.scheduledAt, lang)}</div>
                        <div className="tiny faint">{fmtTime(post.scheduledAt)}</div>
                      </td>
                      <td style={{ maxWidth: 320 }}>
                        <div className="strong truncate">{post.title}</div>
                        <div className="tiny muted truncate">{post.body.slice(0, 70)}</div>
                      </td>
                      <td>
                        <span className="row" style={{ gap: 6 }}>
                          <span className="swatch" style={{ width: 7, height: 7, borderRadius: 2, background: post.brandColor ?? 'var(--primary)' }} />
                          <span className="small">{post.brandName}</span>
                        </span>
                      </td>
                      <td>
                        <span className="row" style={{ gap: 4 }}>
                          {post.platforms.map((p) => <PlatformIcon key={p} platform={p} size="sm" />)}
                        </span>
                      </td>
                      <td><StatusBadge status={post.status} /></td>
                      <td className="small muted">{post.ownerName}</td>
                      <td className="actions">
                        <Icon name="chevron-right" size={15} style={{ color: 'var(--faint)' }} />
                      </td>
                    </tr>
                  ))}
                {!posts.length ? (
                  <tr>
                    <td colSpan={7}>
                      <SafeEmpty title={t('calendar.noPosts')} />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {loading ? <div className="small muted" style={{ marginTop: 10 }}>{t('common.loading')}</div> : null}

      <Drawer
        open={Boolean(form)}
        onClose={() => setForm(null)}
        wide
        title={form?.id ? t('calendar.editPost') : t('calendar.newPostTitle')}
        subtitle={form ? `${fmtDate(form.date, lang)} · ${form.time}` : undefined}
        footer={
          form ? (
            <>
              {form.id ? (
                <button className="btn ghost" onClick={() => setDeleteTarget(form.id!)} disabled={!canEdit}>
                  <Icon name="trash" size={15} />
                </button>
              ) : null}
              {form.id ? (
                <button className="btn ghost" onClick={duplicate} disabled={!canEdit} title={t('calendar.duplicate')}>
                  <Icon name="copy" size={15} />
                </button>
              ) : null}
              <span className="spacer" />
              <button className="btn" onClick={() => setForm(null)}>{t('common.cancel')}</button>
              <button className="btn primary" onClick={save} disabled={saving || !canEdit}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </>
          ) : null
        }
      >
        {form ? (
          <div className="form-stack">
            {form.id ? (
              <div className="row between">
                <StatusBadge status={form.status} />
                <span className="row" style={{ gap: 6 }}>
                  {form.aiGenerated ? <Badge tone="scheduled"><Icon name="sparkles" size={11} /> AI</Badge> : null}
                  <span className="tiny faint">{form.platforms.map((p) => p).join(' · ')}</span>
                </span>
              </div>
            ) : null}

            <Field label={t('calendar.postTitle')}>
              <input
                className="input"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder={t('calendar.postTitlePlaceholder')}
                disabled={!canEdit}
              />
            </Field>

            <div className="form-row">
              <Field label={t('common.brand')}>
                <select
                  className="select"
                  value={form.brandId}
                  onChange={(event) => setForm({ ...form, brandId: event.target.value })}
                  disabled={!canEdit}
                >
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>{brand.name}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('calendar.contentType')}>
                <select
                  className="select"
                  value={form.contentType}
                  onChange={(event) => setForm({ ...form, contentType: event.target.value })}
                  disabled={!canEdit}
                >
                  {CONTENT_TYPES.map((type) => (
                    <option key={type} value={type}>{t(`calendar.contentType.${type}`)}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label={t('calendar.selectPlatforms')}>
              <div className="chips">
                {ALL_PLATFORMS.filter((p) => p.group !== 'future' && p.group !== 'google').map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    className={`chip ${form.platforms.includes(item.key) ? 'active' : ''}`}
                    onClick={() => {
                      if (!canEdit) return;
                      setForm({
                        ...form,
                        platforms: form.platforms.includes(item.key)
                          ? form.platforms.filter((p) => p !== item.key)
                          : [...form.platforms, item.key],
                      });
                    }}
                  >
                    <PlatformIcon platform={item.key} size="sm" />
                    {item.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={t('calendar.caption')} hint={t('calendar.characterCount', { count: form.body.length })}>
              <textarea
                className="textarea"
                value={form.body}
                onChange={(event) => setForm({ ...form, body: event.target.value })}
                placeholder={t('calendar.captionPlaceholder')}
                disabled={!canEdit}
                rows={7}
              />
              <div className="row" style={{ gap: 8 }}>
                <button className="btn sm subtle" onClick={runAi} disabled={aiBusy || !canEdit}>
                  <Icon name="sparkles" size={13} /> {aiBusy ? t('common.generating') : t('studio.generateCopy')}
                </button>
                <span className="tiny faint">{t('studio.aiDisclosure')}</span>
              </div>
              {aiVariants ? (
                <div className="col" style={{ gap: 8, marginTop: 4 }}>
                  {aiVariants.slice(0, 2).map((variant) => (
                    <div key={variant.id} className="variant">
                      <div className="v-head">
                        <span className="small strong">{lang === 'th' ? variant.labelTh : variant.label}</span>
                        <button
                          className="btn xs primary"
                          onClick={() =>
                            setForm({
                              ...form,
                              body: `${variant.hook}\n\n${variant.body}`,
                              hashtags: variant.hashtags.join(' '),
                              aiGenerated: true,
                            })
                          }
                        >
                          {t('studio.useVariant')}
                        </button>
                      </div>
                      <div className="v-body clamp-2">{variant.body}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </Field>

            <Field label={t('calendar.hashtags')}>
              <input
                className="input"
                value={form.hashtags}
                onChange={(event) => setForm({ ...form, hashtags: event.target.value })}
                placeholder={t('calendar.hashtagsPlaceholder')}
                disabled={!canEdit}
              />
            </Field>

            <div className="form-row">
              <Field label={t('calendar.schedule')}>
                <input
                  className="input"
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                  disabled={!canEdit}
                />
              </Field>
              <Field label={t('common.time')}>
                <input
                  className="input"
                  type="time"
                  value={form.time}
                  onChange={(event) => setForm({ ...form, time: event.target.value })}
                  disabled={!canEdit}
                />
              </Field>
            </div>

            <div className="form-row">
              <Field label={t('common.status')}>
                <select
                  className="select"
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value })}
                  disabled={!canEdit}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{t(`calendar.status.${s}`)}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('calendar.pillar')} hint={t('common.optional')}>
                <input
                  className="input"
                  value={form.pillar}
                  onChange={(event) => setForm({ ...form, pillar: event.target.value })}
                  placeholder="Educate / Promote"
                  disabled={!canEdit}
                />
              </Field>
            </div>

            <Field label={t('calendar.media')} hint={t('calendar.addMediaHint')}>
              <div className="asset-grid">
                {form.media.map((item, index) => (
                  <div key={`${item.url}-${index}`} className="asset-card">
                    <img src={item.url} alt={item.alt ?? ''} />
                    <button
                      className="icon-btn asset-del"
                      style={{ background: 'var(--surface)' }}
                      onClick={() => setForm({ ...form, media: form.media.filter((_, i) => i !== index) })}
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <select
                className="select"
                value=""
                onChange={(event) => {
                  const asset = assets.find((item) => item.id === event.target.value);
                  if (asset) setForm({ ...form, media: [...form.media, { type: asset.kind === 'ai' ? 'ai' : 'drive', url: asset.url, alt: asset.name }] });
                }}
                disabled={!canEdit}
              >
                <option value="">+ {t('studio.library')}</option>
                {assets.slice(0, 20).map((asset) => (
                  <option key={asset.id} value={asset.id}>{asset.name}</option>
                ))}
              </select>
            </Field>

            <Field label={t('calendar.notes')} hint={t('common.optional')}>
              <textarea
                className="textarea"
                style={{ minHeight: 64 }}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                disabled={!canEdit}
              />
            </Field>

            {form.id && canEdit ? (
              <>
                <div className="divider" />
                <div className="row wrap" style={{ gap: 6 }}>
                  {['review', 'approved', 'scheduled', 'published'].map((target) => (
                    <button
                      key={target}
                      className={`btn sm ${form.status === target ? 'primary' : ''}`}
                      onClick={() => setForm({ ...form, status: target })}
                    >
                      {t(`calendar.status.${target}`)}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('calendar.deletePost')}
        body={t('calendar.confirmDelete')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />

      <Modal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        title={t('calendar.planTitle')}
        subtitle={t('calendar.planSub')}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setPlanOpen(false)}>{t('common.close')}</button>
            <button className="btn" onClick={generatePlan} disabled={planBusy}>
              <Icon name="sparkles" size={14} /> {planBusy ? t('common.generating') : t('calendar.generatePlan')}
            </button>
            <button className="btn primary" onClick={applyPlan} disabled={!planItems?.length || planBusy}>
              {t('calendar.planApply')}
            </button>
          </>
        }
      >
        <div className="grid grid-2" style={{ gap: 14, alignItems: 'start' }}>
          <div className="form-stack">
            <Field label={t('common.brand')}>
              <select className="select" value={planBrand} onChange={(event) => setPlanBrand(event.target.value)}>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </select>
            </Field>
            <div className="form-row">
              <Field label={t('calendar.planMonth')}>
                <input className="input" type="month" value={planMonth} onChange={(event) => setPlanMonth(event.target.value)} />
              </Field>
              <Field label={t('calendar.postsPerWeek')}>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={7}
                  value={planCadence}
                  onChange={(event) => setPlanCadence(Number(event.target.value))}
                />
              </Field>
            </div>
            <Field label={t('common.platforms')}>
              <div className="chips">
                {ALL_PLATFORMS.filter((p) => p.group === 'social').map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`chip ${planPlatforms.includes(item.key) ? 'active' : ''}`}
                    onClick={() =>
                      setPlanPlatforms((prev) =>
                        prev.includes(item.key) ? prev.filter((p) => p !== item.key) : [...prev, item.key],
                      )
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t('calendar.topics')} hint={t('common.optional')}>
              <input
                className="input"
                value={planTopics}
                onChange={(event) => setPlanTopics(event.target.value)}
                placeholder={t('calendar.topicsPlaceholder')}
              />
            </Field>
          </div>

          <div>
            {!planItems ? (
              <Empty icon="sparkles" title={t('calendar.planEmpty')} hint={t('calendar.planSub')} />
            ) : (
              <div>
                <div className="row between" style={{ marginBottom: 8 }}>
                  <span className="small strong">{t('calendar.planSummary', { total: planItems.length, platforms: planPlatforms.length })}</span>
                  <Badge tone="scheduled">{planMonth}</Badge>
                </div>
                <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                  {planItems.map((item, index) => (
                    <div key={index} className="row" style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', gap: 8 }}>
                      <span className="tiny muted" style={{ width: 44, flex: 'none' }}>{item.date.slice(8, 10)}/{item.date.slice(5, 7)}</span>
                      <PlatformIcon platform={item.platform} size="sm" />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span className="small truncate" style={{ display: 'block' }}>{item.title}</span>
                        <span className="tiny faint">{item.pillar} · {item.time}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SafeEmpty({ title }: { title: string }) {
  return <Empty icon="calendar" title={title} />;
}
