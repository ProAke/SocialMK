import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type Asset, type Brand, type CopyVariant } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { copyText, downloadBlob, downloadSvgAsPng, fmtInt, todayISO, truncate } from '../lib/format';
import { Icon } from '../components/Icon';
import { ALL_PLATFORMS, PlatformIcon } from '../components/PlatformIcon';
import { Badge, Card, Empty, Field, PageHeader, Tabs } from '../components/UI';

const ART_STYLES = [
  { key: 'gradient-mesh', colors: ['#5B5BD6', '#7CF7D4'] },
  { key: 'bold-type', colors: ['#0EA5E9', '#A5F3FC'] },
  { key: 'editorial', colors: ['#F3EADA', '#0F766E'] },
  { key: 'product', colors: ['#111827', '#F97316'] },
  { key: 'tech-grid', colors: ['#070C18', '#62B8EC'] },
  { key: 'festive', colors: ['#0C2A26', '#F6C86B'] },
];

const SIZES = [
  { key: 'square', width: 1080, height: 1080 },
  { key: 'portrait', width: 1080, height: 1350 },
  { key: 'landscape', width: 1920, height: 1080 },
  { key: 'story', width: 1080, height: 1920 },
];

export function StudioPage() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<'copy' | 'design'>('copy');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState('');
  const [platform, setPlatform] = useState('facebook');
  const [objective, setObjective] = useState('engagement');
  const [keywords, setKeywords] = useState('');
  const [offer, setOffer] = useState('');
  const [variantsCount, setVariantsCount] = useState(3);
  const [variants, setVariants] = useState<CopyVariant[] | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);

  const [style, setStyle] = useState('gradient-mesh');
  const [headline, setHeadline] = useState('คอนเทนต์ที่ดี เริ่มจากฟังลูกค้า');
  const [subline, setSubline] = useState('SocialMK · Playbook');
  const [badge, setBadge] = useState('Beta');
  const [size, setSize] = useState('square');
  const [artBusy, setArtBusy] = useState(false);
  const [art, setArt] = useState<{ url: string; width: number; height: number; id?: string } | null>(null);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);

  const brand = useMemo(() => brands.find((item) => item.id === brandId), [brands, brandId]);

  const loadAssets = useCallback(async () => {
    setLoadingAssets(true);
    try {
      setAssets(await api.get<Asset[]>('/assets'));
    } finally {
      setLoadingAssets(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const list = await api.get<Brand[]>('/brands');
      setBrands(list);
      if (list.length) setBrandId(list[0].id);
    })();
    void loadAssets();
  }, [loadAssets]);

  const runCopy = async () => {
    setCopyBusy(true);
    try {
      const result = await api.post<{ variants: CopyVariant[] }>('/ai/copy', {
        brandId,
        platform,
        objective,
        language: lang,
        keywords,
        offer,
        variants: variantsCount,
      });
      setVariants(result.variants);
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    } finally {
      setCopyBusy(false);
    }
  };

  const saveDraft = async (variant: CopyVariant) => {
    try {
      await api.post('/posts', {
        brandId,
        title: truncate(variant.hook, 90),
        body: `${variant.hook}\n\n${variant.body}`,
        hashtags: variant.hashtags,
        platforms: [platform],
        contentType: 'image',
        scheduledAt: `${todayISO()}T${variant.bestTime}`,
        status: 'draft',
        aiGenerated: true,
        notes: `AI Studio · ${variant.labelTh}`,
      });
      toast.push(t('studio.draftSaved'), { detail: truncate(variant.hook, 50) });
      navigate('/calendar');
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    }
  };

  const runArt = async () => {
    if (!brandId) {
      toast.push(t('studio.selectBrandFirst'), { kind: 'error' });
      return;
    }
    setArtBusy(true);
    try {
      const dims = SIZES.find((item) => item.key === size) ?? SIZES[0];
      const result = await api.post<{ svg: string; asset: { id: string; url: string; width: number; height: number } }>(
        '/ai/image',
        {
          brandId,
          style,
          headline,
          subline,
          badge,
          width: dims.width,
          height: dims.height,
          save: true,
        },
      );
      setArt({ url: result.asset.url, width: result.asset.width, height: result.asset.height, id: result.asset.id });
      toast.push(t('studio.artReady'));
      await loadAssets();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    } finally {
      setArtBusy(false);
    }
  };

  const useArt = async () => {
    if (!art) return;
    try {
      await api.post('/posts', {
        brandId,
        title: headline,
        body: subline,
        hashtags: [],
        platforms: [platform],
        contentType: 'image',
        scheduledAt: `${todayISO()}T09:00`,
        status: 'draft',
        media: [{ type: 'ai', url: art.url, alt: headline }],
        aiGenerated: true,
        notes: 'AI Studio artwork',
      });
      toast.push(t('studio.draftSaved'));
      navigate('/calendar');
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    }
  };

  const deleteAsset = async (asset: Asset) => {
    try {
      await api.del(`/assets/${asset.id}`);
      toast.push(t('studio.assetDeleted'));
      await loadAssets();
    } catch {
      toast.push(t('error.generic'), { kind: 'error' });
    }
  };

  const downloadSvg = async () => {
    if (!art) return;
    const text = await fetch(art.url).then((response) => response.text());
    downloadBlob(text, 'socialmk-art.svg', 'image/svg+xml');
  };

  return (
    <div className="page">
      <PageHeader
        title={t('studio.title')}
        subtitle={t('studio.subtitle')}
        actions={
          <span className="badge" style={{ background: 'var(--primary-weak)', color: 'var(--primary)' }}>
            <Icon name="sparkles" size={12} /> Beta AI
          </span>
        }
      />

      <Tabs
        tabs={[
          { key: 'copy', label: t('studio.tab.copy'), icon: 'edit' },
          { key: 'design', label: t('studio.tab.design'), icon: 'image' },
        ]}
        active={tab}
        onChange={(key) => setTab(key as 'copy' | 'design')}
      />

      {tab === 'copy' ? (
        <div className="studio-grid">
          <Card title={t('studio.brief')} subtitle={t('studio.briefSub')}>
            <div className="form-stack">
              <Field label={t('common.brand')}>
                <select className="select" value={brandId} onChange={(event) => setBrandId(event.target.value)}>
                  {brands.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('common.platforms')}>
                <select className="select" value={platform} onChange={(event) => setPlatform(event.target.value)}>
                  {ALL_PLATFORMS.filter((item) => item.group === 'social').map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('studio.objective')}>
                <select className="select" value={objective} onChange={(event) => setObjective(event.target.value)}>
                  {['awareness', 'engagement', 'conversion', 'education', 'community'].map((key) => (
                    <option key={key} value={key}>{t(`studio.objective.${key}`)}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('studio.keywords')}>
                <input
                  className="input"
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  placeholder={t('studio.keywordsPlaceholder')}
                />
              </Field>
              <Field label={t('studio.offer')} hint={t('common.optional')}>
                <input
                  className="input"
                  value={offer}
                  onChange={(event) => setOffer(event.target.value)}
                  placeholder={t('studio.offerPlaceholder')}
                />
              </Field>
              <Field label={t('studio.variants')}>
                <select className="select" value={variantsCount} onChange={(event) => setVariantsCount(Number(event.target.value))}>
                  {[1, 2, 3].map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </Field>
              {brand?.tone ? (
                <div className="notice info">
                  <Icon name="info" size={15} />
                  <span>
                    <b>{t('studio.tone')}:</b> {brand.tone}
                  </span>
                </div>
              ) : null}
              <button className="btn primary block" onClick={runCopy} disabled={copyBusy || !brandId}>
                <Icon name="sparkles" size={15} />
                {copyBusy ? t('common.generating') : t('studio.generateCopy')}
              </button>
              <p className="tiny faint">{t('studio.aiDisclosure')}</p>
            </div>
          </Card>

          <div>
            <div className="row between" style={{ marginBottom: 10 }}>
              <div>
                <div className="card-title">{t('studio.copyResult')}</div>
                <div className="card-sub">{t('studio.copyResultSub')}</div>
              </div>
              {variants ? (
                <button className="btn sm" onClick={runCopy} disabled={copyBusy}>
                  <Icon name="refresh" size={13} /> {t('common.regenerate')}
                </button>
              ) : null}
            </div>
            {copyBusy ? (
              <Card>
                <div className="col" style={{ gap: 10 }}>
                  {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 96 }} />)}
                </div>
              </Card>
            ) : !variants ? (
              <Card>
                <Empty
                  icon="sparkles"
                  title={t('studio.copyResult')}
                  hint={t('studio.briefSub')}
                  action={
                    <button className="btn primary sm" onClick={runCopy} disabled={!brandId}>
                      {t('studio.generateCopy')}
                    </button>
                  }
                />
              </Card>
            ) : (
              <div className="col" style={{ gap: 12 }}>
                {variants.map((variant) => (
                  <div className="variant" key={variant.id}>
                    <div className="v-head">
                      <div className="row" style={{ gap: 8 }}>
                        <Badge tone="scheduled">{lang === 'th' ? variant.labelTh : variant.label}</Badge>
                        <span className="tiny faint">{variant.charCount} chars</span>
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <span className="tiny faint">{t('studio.variantScore')}</span>
                        <span className="score-ring">{variant.score}</span>
                      </div>
                    </div>
                    <div className="small strong" style={{ marginBottom: 6 }}>{variant.hook}</div>
                    <div className="v-body">{variant.body}</div>
                    <div className="v-tags">{variant.hashtags.join(' ')}</div>
                    <div className="row between" style={{ marginTop: 10 }}>
                      <span className="row tiny faint" style={{ gap: 5 }}>
                        <Icon name="clock" size={12} /> {t('studio.bestTime')}: {variant.bestTime}
                      </span>
                      <span className="row" style={{ gap: 6 }}>
                        <button
                          className="btn xs"
                          onClick={() => {
                            void copyText(`${variant.hook}\n\n${variant.body}\n\n${variant.hashtags.join(' ')}`);
                            toast.push(t('studio.copied'));
                          }}
                        >
                          <Icon name="copy" size={12} /> {t('common.copy')}
                        </button>
                        <button className="btn xs primary" onClick={() => saveDraft(variant)} disabled={!can('editor')}>
                          {t('studio.useVariant')}
                        </button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Card
            title={t('studio.library')}
            subtitle={t('studio.librarySub')}
            action={
              <button className="icon-btn" onClick={loadAssets} title={t('common.refresh')}>
                <Icon name="refresh" size={15} />
              </button>
            }
          >
            {loadingAssets ? (
              <div className="skeleton" style={{ height: 120 }} />
            ) : assets.length === 0 ? (
              <Empty icon="image" title={t('studio.noAssets')} />
            ) : (
              <div className="asset-grid">
                {assets.slice(0, 9).map((asset) => (
                  <div className="asset-card" key={asset.id}>
                    {asset.kind === 'ai' ? (
                      <img src={asset.url} alt={asset.name} />
                    ) : (
                      <div className="asset-ph" style={{ display: 'grid', placeItems: 'center', color: 'var(--faint)' }}>
                        <Icon name="folder" size={26} />
                      </div>
                    )}
                    <div className="asset-meta">
                      <div className="truncate small" title={asset.name}>{asset.name}</div>
                      <div className="tiny faint truncate">
                        {asset.kind === 'drive' ? t('studio.driveBadge') : 'AI'} · {asset.brandName}
                      </div>
                    </div>
                    {can('editor') ? (
                      <button
                        className="icon-btn asset-del"
                        style={{ background: 'var(--surface)', width: 26, height: 26 }}
                        onClick={() => deleteAsset(asset)}
                        title={t('common.delete')}
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : (
        <div className="studio-grid">
          <Card title={t('studio.designBrief')} subtitle={brand?.name}>
            <div className="form-stack">
              <Field label={t('common.brand')}>
                <select className="select" value={brandId} onChange={(event) => setBrandId(event.target.value)}>
                  {brands.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('studio.style')}>
                <div className="style-grid">
                  {ART_STYLES.map((item) => (
                    <button
                      key={item.key}
                      className={`style-card ${style === item.key ? 'active' : ''}`}
                      onClick={() => setStyle(item.key)}
                      type="button"
                    >
                      <span
                        className="swatch-art"
                        style={{
                          backgroundImage: `linear-gradient(135deg, ${item.colors[0]}, ${item.colors[1]})`,
                        }}
                      />
                      {t(`studio.style.${item.key}`)}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={t('studio.headline')}>
                <input className="input" value={headline} onChange={(event) => setHeadline(event.target.value)} />
              </Field>
              <Field label={t('studio.subline')} hint={t('common.optional')}>
                <input className="input" value={subline} onChange={(event) => setSubline(event.target.value)} />
              </Field>
              <div className="form-row">
                <Field label={t('studio.badge')} hint={t('common.optional')}>
                  <input className="input" value={badge} onChange={(event) => setBadge(event.target.value)} />
                </Field>
                <Field label={t('studio.size')}>
                  <select className="select" value={size} onChange={(event) => setSize(event.target.value)}>
                    {SIZES.map((item) => (
                      <option key={item.key} value={item.key}>{t(`studio.size.${item.key}`)}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <button className="btn primary block" onClick={runArt} disabled={artBusy || !can('editor')}>
                <Icon name="wand" size={15} /> {artBusy ? t('common.generating') : t('studio.generateArt')}
              </button>
            </div>
          </Card>

          <div>
            <div className="row between" style={{ marginBottom: 10 }}>
              <div>
                <div className="card-title">{t('common.preview')}</div>
                <div className="card-sub">
                  {brand ? `${brand.name} · ${t('studio.onBrandColor')}` : ''}
                </div>
              </div>
              {art ? (
                <Badge tone="">
                  {art.width}×{art.height}
                </Badge>
              ) : null}
            </div>
            <div className="art-preview" style={{ minHeight: 360 }}>
              {artBusy ? (
                <div className="skeleton" style={{ width: '100%', height: 360 }} />
              ) : art ? (
                <img src={art.url} alt={headline} />
              ) : (
                <div style={{ padding: 30, textAlign: 'center' }}>
                  <Icon name="image" size={34} style={{ color: 'var(--faint)' }} />
                  <p className="small muted" style={{ marginTop: 8 }}>{t('studio.designBrief')}</p>
                  <p className="tiny faint">{t('studio.aiDisclosure')}</p>
                </div>
              )}
            </div>
            {art ? (
              <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                <button
                  className="btn sm"
                  onClick={() => downloadSvgAsPng(art.url, 'socialmk-art.png', art.width, art.height)}
                >
                  <Icon name="download" size={13} /> {t('studio.downloadPng')}
                </button>
                <button className="btn sm" onClick={downloadSvg}>
                  <Icon name="download" size={13} /> {t('studio.downloadSvg')}
                </button>
                <span className="spacer" />
                <button className="btn sm primary" onClick={useArt} disabled={!can('editor')}>
                  <Icon name="plus" size={13} /> {t('studio.addToPost')}
                </button>
              </div>
            ) : null}
            <p className="tiny faint" style={{ marginTop: 10 }}>{t('studio.aiDisclosure')}</p>
          </div>

          <Card title={t('studio.library')} subtitle={t('studio.librarySub')}>
            {assets.filter((asset) => asset.kind === 'ai').length === 0 ? (
              <Empty icon="image" title={t('studio.noAssets')} />
            ) : (
              <div className="asset-grid">
                {assets.filter((asset) => asset.kind === 'ai').slice(0, 9).map((asset) => (
                  <div className="asset-card" key={asset.id}>
                    <img src={asset.url} alt={asset.name} />
                    <div className="asset-meta">
                      <div className="truncate small">{asset.name}</div>
                      <div className="tiny faint truncate">{asset.brandName} · {fmtInt(asset.width, lang)}×{fmtInt(asset.height, lang)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
