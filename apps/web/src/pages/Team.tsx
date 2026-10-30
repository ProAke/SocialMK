import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type ActivityItem, type Invite, type Member } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { copyText, fmtDate, relativeTime } from '../lib/format';
import { Icon } from '../components/Icon';
import {
  Avatar,
  Badge,
  Card,
  ConfirmDialog,
  Empty,
  Field,
  Modal,
  PageHeader,
  RoleBadge,
} from '../components/UI';

interface TeamResponse {
  members: Member[];
  invites: Invite[];
}

const ROLES = ['owner', 'admin', 'editor', 'analyst'];

const PERMISSIONS: Array<{ key: string; owner: boolean; admin: boolean; editor: boolean; analyst: boolean }> = [
  { key: 'team.permission.create', owner: true, admin: true, editor: true, analyst: false },
  { key: 'team.permission.publish', owner: true, admin: true, editor: true, analyst: false },
  { key: 'team.permission.connections', owner: true, admin: true, editor: false, analyst: false },
  { key: 'team.permission.team', owner: true, admin: true, editor: false, analyst: false },
  { key: 'team.permission.api', owner: true, admin: true, editor: false, analyst: false },
  { key: 'team.permission.billing', owner: true, admin: false, editor: false, analyst: false },
];

export function TeamPage() {
  const { t, lang } = useI18n();
  const { user, role, can } = useAuth();
  const toast = useToast();

  const [data, setData] = useState<TeamResponse>({ members: [], invites: [] });
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [inviteResult, setInviteResult] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Invite | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [team, acts] = await Promise.all([
        api.get<TeamResponse>('/team'),
        api.get<ActivityItem[]>('/activity', { limit: 24 }),
      ]);
      setData(team);
      setActivity(acts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changeRole = async (member: Member, nextRole: string) => {
    try {
      await api.patch(`/team/${member.id}`, { role: nextRole });
      toast.push(t('team.roleChanged'), { detail: `${member.name} → ${t(`common.role.${nextRole}`)}` });
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    }
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setBusy(true);
    try {
      const result = await api.post<Invite>('/team/invites', { email: inviteEmail.trim(), role: inviteRole });
      setInviteResult(result);
      setInviteEmail('');
      await load();
      toast.push(t('team.inviteSent'), { detail: result.email });
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async (invite: Invite) => {
    await copyText(`${window.location.origin}${invite.inviteUrl}`);
    toast.push(t('team.linkCopied'));
  };

  const revokeInvite = async () => {
    if (!revokeTarget) return;
    try {
      await api.del(`/team/invites/${revokeTarget.id}`);
      toast.push(t('team.inviteRevoked'));
      setRevokeTarget(null);
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    }
  };

  const removeMember = async () => {
    if (!removeTarget) return;
    try {
      await api.del(`/team/${removeTarget.id}`);
      toast.push(t('team.memberRemoved'));
      setRemoveTarget(null);
      await load();
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : t('error.generic'), { kind: 'error' });
    }
  };

  return (
    <div className="page">
      <PageHeader
        title={t('team.title')}
        subtitle={t('team.subtitle')}
        actions={
          can('admin') ? (
            <button className="btn primary" onClick={() => setInviteOpen(true)}>
              <Icon name="user-plus" size={15} /> {t('team.inviteMember')}
            </button>
          ) : (
            <Badge tone={role}>{t(`common.role.${role}`)}</Badge>
          )
        }
      />

      <Card
        title={t('team.members')}
        subtitle={`${data.members.length} ${t('team.members')}`}
        flush
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('common.role')}</th>
                <th>{t('team.lastActive')}</th>
                <th>{t('team.joined')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <span className="row" style={{ gap: 10 }}>
                      <Avatar name={member.name} color={member.avatarColor} />
                      <span>
                        <span className="strong" style={{ display: 'block' }}>
                          {member.name} {member.id === user?.id ? <span className="tiny faint">({t('team.you')})</span> : null}
                        </span>
                        <span className="tiny muted">{member.email}</span>
                      </span>
                    </span>
                  </td>
                  <td>
                    {can('admin') && member.role !== 'owner' && member.id !== user?.id ? (
                      <select
                        className="select sm"
                        style={{ width: 130 }}
                        value={member.role}
                        onChange={(event) => changeRole(member, event.target.value)}
                      >
                        {ROLES.filter((item) => item !== 'owner' || can('owner')).map((item) => (
                          <option key={item} value={item}>{t(`common.role.${item}`)}</option>
                        ))}
                      </select>
                    ) : (
                      <RoleBadge role={member.role} />
                    )}
                    {member.title ? <div className="tiny faint" style={{ marginTop: 3 }}>{member.title}</div> : null}
                  </td>
                  <td className="small muted">{relativeTime(member.lastActiveAt, lang)}</td>
                  <td className="small muted">{fmtDate(member.joinedAt, lang)}</td>
                  <td className="actions">
                    {can('admin') && member.role !== 'owner' && member.id !== user?.id ? (
                      <button
                        className="icon-btn"
                        style={{ width: 28, height: 28, color: 'var(--rose)' }}
                        onClick={() => setRemoveTarget(member)}
                        title={t('team.removeMember')}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-side section">
        <Card title={t('team.pendingInvites')} subtitle={t('team.invites')}>
          {!data.invites.length ? (
            <Empty icon="mail" title={t('team.noInvites')} />
          ) : (
            <div className="col" style={{ gap: 10 }}>
              {data.invites.map((invite) => (
                <div key={invite.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="small strong truncate">{invite.email}</span>
                      <Badge tone={invite.status === 'pending' ? 'attention' : 'draft'}>{t(`common.role.${invite.role}`)}</Badge>
                    </div>
                    <div className="tiny faint">
                      {invite.invitedBy ? `${invite.invitedBy} · ` : ''}{fmtDate(invite.createdAt, lang)}
                      {invite.status === 'pending' ? '' : ''}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    {invite.status === 'pending' ? (
                      <button className="btn xs" onClick={() => copyInvite(invite)}>
                        <Icon name="copy" size={11} /> {t('team.copyLink')}
                      </button>
                    ) : (
                      <Badge tone={invite.status}>{t(`team.inviteStatus.${invite.status}`)}</Badge>
                    )}
                    {can('admin') ? (
                      <button className="btn xs danger" onClick={() => setRevokeTarget(invite)}>
                        {t('team.revokeInvite')}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={t('team.roles')} subtitle={t('team.permissions')}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('team.permissions')}</th>
                  {ROLES.map((item) => (
                    <th key={item} className="num">{t(`common.role.${item}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map((permission) => (
                  <tr key={permission.key}>
                    <td className="small">{t(permission.key)}</td>
                    {ROLES.map((item) => (
                      <td key={item} className="num">
                        {(permission as any)[item] ? (
                          <Icon name="check" size={14} style={{ color: 'var(--teal)' }} />
                        ) : (
                          <span className="faint">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title={t('team.activity')} subtitle={t('team.activitySub')} className="section">
        <div className="timeline">
          {activity.map((item) => (
            <div className="tl-item" key={item.id}>
              <Avatar name={item.userName} color={item.userColor} size="sm" />
              <div className="tl-body">
                <div className="tl-title"><b>{item.userName}</b> · {item.target}</div>
                <div className="tl-meta">{item.detail || item.action} · {relativeTime(item.at, lang)}</div>
              </div>
            </div>
          ))}
          {!activity.length && !loading ? <Empty icon="clock" title={t('common.noData')} /> : null}
        </div>
      </Card>

      <Modal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setInviteResult(null);
        }}
        title={t('team.inviteTitle')}
        footer={
          <>
            <button className="btn" onClick={() => setInviteOpen(false)}>{t('common.close')}</button>
            <button className="btn primary" onClick={sendInvite} disabled={busy || !inviteEmail.trim()}>
              {busy ? t('common.saving') : t('common.invite')}
            </button>
          </>
        }
      >
        <div className="form-stack">
          <Field label={t('team.inviteEmail')}>
            <input
              className="input"
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="teammate@company.com"
            />
          </Field>
          <Field label={t('team.inviteRole')}>
            <select className="select" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
              {['admin', 'editor', 'analyst'].map((item) => (
                <option key={item} value={item}>{t(`common.role.${item}`)}</option>
              ))}
            </select>
          </Field>
          {inviteResult ? (
            <div className="notice info" style={{ display: 'block' }}>
              <div className="row between" style={{ marginBottom: 6 }}>
                <b className="small">{t('team.inviteSent')}</b>
                <Badge tone="">{inviteResult.email}</Badge>
              </div>
              <div className="key-reveal" style={{ marginTop: 6 }}>
                {window.location.origin}{inviteResult.inviteUrl}
              </div>
              <button className="btn sm" style={{ marginTop: 8 }} onClick={() => copyInvite(inviteResult)}>
                <Icon name="copy" size={12} /> {t('team.copyLink')}
              </button>
            </div>
          ) : (
            <div className="notice info">
              <Icon name="mail" size={15} />
              <span>{t('team.activitySub')}</span>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title={t('team.removeMember')}
        body={t('team.confirmRemove', { name: removeTarget?.name ?? '' })}
        confirmLabel={t('common.remove')}
        danger
        onConfirm={removeMember}
        onCancel={() => setRemoveTarget(null)}
      />
      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title={t('team.revokeInvite')}
        body={revokeTarget?.email}
        confirmLabel={t('common.revoke')}
        danger
        onConfirm={revokeInvite}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
