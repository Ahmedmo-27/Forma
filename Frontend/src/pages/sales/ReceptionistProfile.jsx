import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import {
  PageHeader, Card, Btn, Spinner, Avatar, CAIRO_ZONE, Skeleton,
} from '../../components/ui';
import { getUserById, updateStaffMobile, updatePhonePrivacy } from '../../api/endpoints';
import ChangeRoleField from '../../components/ChangeRoleField';
import { Lock, Monitor, Phone } from 'lucide-react';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';

/** Renders a translated sentence with a `{token}` placeholder swapped for a React node. */
function withNode(text, token, node) {
  const [before, after = ''] = text.split(token);
  return <>{before}{node}{after}</>;
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? 'var(--green)' : 'var(--border-md)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0,
      }}
    >
      <span style={{
        display: 'block', width: 16, height: 16, borderRadius: '50%', background: 'var(--bg)',
        position: 'absolute', top: 3,
        insetInlineStart: checked ? 21 : 3,
        transition: 'inset-inline-start 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ReceptionistProfile() {
  const { t } = useI18n();
  const { fmtDate } = useFormat();
  const fmtJoined = (d) => (d ? fmtDate(d, {
    timeZone: CAIRO_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }, 'en-GB') : '—');
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const isManager = ['Sales Manager', 'Owner'].includes(currentUser?.role);

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Mobile number edit
  const [mobileInput, setMobileInput] = useState('');
  const [savingMobile, setSavingMobile] = useState(false);

  // Phone privacy
  const [savingPhonePrivacy, setSavingPhonePrivacy] = useState(false);

  usePageTitle(user?.name ?? t('Receptionist Profile'));

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getUserById(id);
      setUser(res.data);
      setMobileInput(res.data?.mobile_number ?? '');
    } catch {
      toast.error(t('Failed to load profile.'));
      navigate(-1);
    } finally { setLoading(false); }
  }, [id, navigate, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSaveMobile = async () => {
    if (!mobileInput.trim()) { toast.error(t('Mobile number is required')); return; }
    setSavingMobile(true);
    try {
      const res = await updateStaffMobile(id, mobileInput.trim());
      setUser(res.data.user);
      toast.success(t('Mobile number updated'));
    } catch (e) {
      toast.error(e.response?.data?.message || t('Failed to update mobile'));
    } finally { setSavingMobile(false); }
  };

  const handleTogglePhonePrivacy = async (value) => {
    // Optimistic update
    setUser(prev => ({ ...prev, canViewPhones: value }));
    setSavingPhonePrivacy(true);
    try {
      await updatePhonePrivacy(id, value);
      toast.success(t('Phone privacy updated'));
    } catch (e) {
      setUser(prev => ({ ...prev, canViewPhones: !value }));
      toast.error(e.response?.data?.message || t('Failed to update phone privacy'));
    } finally { setSavingPhonePrivacy(false); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <PageHeader walkthrough="receptionist-profile-header" title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/sales/team')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', fontSize: 12 }}>
            {t('← Team')}
          </button>
          <span style={{ color: 'var(--border-md)' }}>/</span>
          <span>{loading ? t('Loading…') : (user?.name ?? t('Profile'))}</span>
        </div>
      } />

      <div className="page-wrap" data-walkthrough="staff-body" style={{ paddingTop: 20, paddingBottom: 32, maxWidth: 600 }}>
        {loading ? <ProfileSkeleton /> : (
          <>
            {/* ── Profile header ──────────────────────────────────── */}
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
                <Avatar name={user?.name} size="lg" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--t1)', margin: 0 }}>{user?.name}</h2>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', background: 'var(--bg)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Monitor size={12} aria-hidden /> {t('Receptionist')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: 'var(--t3)' }}>
                    {user?.email && <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{user.email}</span>}
                    <span>{t('Joined {date}', { date: fmtJoined(user?.createdAt) })}</span>
                  </div>
                  <div style={{ maxWidth: 420, marginTop: 10 }}>
                    <ChangeRoleField
                      userId={id}
                      currentRole={user?.role}
                      label={t('Change role')}
                      onChanged={(newRole) => {
                        if (newRole === 'Receptionist') fetchData();
                        else navigate('/sales/team');
                      }}
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* ── Mobile Number ────────────────────────────────────── */}
            {isManager && (
              <div data-walkthrough="receptionist-mobile">
              <Card style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Phone size={16} aria-hidden /> {t('Mobile Number')}
                </h3>
                <p style={{ fontSize: 12, color: 'var(--t4)', marginBottom: 12 }}>
                  {withNode(t('Edit the mobile number for {name}.'), '{name}', <strong><bdi>{user?.name}</bdi></strong>)}
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={mobileInput}
                    onChange={e => setMobileInput(e.target.value)}
                    placeholder={t('Enter mobile number')}
                    dir="ltr"
                    style={{
                      flex: 1, padding: '8px 12px', fontSize: 13,
                      border: '1px solid var(--border)', borderRadius: 6,
                      fontFamily: 'monospace', background: 'var(--bg)',
                    }}
                  />
                  <Btn size="sm" onClick={handleSaveMobile} disabled={savingMobile}>
                    {savingMobile ? <Spinner size="sm" /> : t('Save')}
                  </Btn>
                </div>
              </Card>
              </div>
            )}
            {/* ── Phone Privacy Toggle ─────────────────────────────── */}
            {isManager && (
              <div data-walkthrough="receptionist-privacy">
              <Card>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Lock size={16} aria-hidden /> {t('Phone Number Access')}
                </h3>
                <p style={{ fontSize: 12, color: 'var(--t4)', marginBottom: 16 }}>
                  {withNode(t('Control whether {name} can view member phone numbers.'), '{name}', <strong><bdi>{user?.name}</bdi></strong>)}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 2 }}>
                      {t('Can View Phone Numbers')}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t4)' }}>{t('Can view member phone numbers on profiles')}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: (user?.canViewPhones !== false) ? 'var(--green)' : 'var(--red)' }}>
                      {(user?.canViewPhones !== false) ? t('Enabled') : t('Disabled')}
                    </span>
                    {savingPhonePrivacy
                      ? <Spinner size="sm" />
                      : <Toggle
                          checked={user?.canViewPhones !== false}
                          onChange={val => handleTogglePhonePrivacy(val)}
                        />
                    }
                  </div>
                </div>
              </Card>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function ProfileSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 18px', display: 'flex', gap: 14 }}>
        <Skeleton h="48px" w="48px" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <Skeleton h="14px" w="160px" />
          <Skeleton h="11px" w="220px" />
        </div>
      </div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, height: 120 }} />
    </div>
  );
}
