import { useState } from 'react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Btn, Input, Spinner, EmptyState, fmtDate, fmtDateTime } from '../../../components/ui';
import { addInvitation } from '../../../api/endpoints';
import { fetchProtectedUploadBlobUrl } from '../../../api/axios';

/** Open an authenticated upload in a new tab (Bearer required — public /uploads is disabled). */
async function openProtectedUpload(filename) {
  const url = await fetchProtectedUploadBlobUrl(filename);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function InvitationsTab({ member, user, onRefresh }) {
  const [name,  setName]  = useState('');
  const [phone, setPhone] = useState('');
  const [file,  setFile]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState(null);

  const invitations = [...(member.invitations ?? [])].reverse();
  const sub       = member.subscriptions?.at(-1);
  const pkg       = sub?.package;
  const allowed   = pkg?.invitationLimit ?? 0;
  const used      = member.invitationsUsed ?? 0;
  const remaining = allowed - used;
  const canAdd    = ['Sales', 'Sales Manager', 'Receptionist', 'Owner'].includes(user?.role);

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('Name is required.'); return; }
    if (remaining <= 0) { toast.error('No slots remaining.'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('invitedName', name.trim());
      if (phone.trim()) fd.append('invitedPhone', phone.trim());
      if (file) fd.append('idFile', file);
      await addInvitation(member.systemId, fd);
      toast.success('Invitation recorded.'); setName(''); setPhone(''); setFile(null); onRefresh();
    } catch (e) { toast.error(e.response?.data?.message ?? 'Failed.'); }
    finally { setLoading(false); }
  };

  const handleViewId = async (idFile) => {
    setOpeningId(idFile);
    try {
      await openProtectedUpload(idFile);
    } catch (e) {
      toast.error(e.response?.data?.message ?? 'Could not open ID file.');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardHeader title="Add Invitation">
          {allowed > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', gap: 3 }}>
                {Array.from({ length: allowed }).map((_, i) => (
                  <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < used ? 'var(--navy)' : 'var(--border-md)' }} />
                ))}
              </div>
              <span style={{ fontSize: 11, color: 'var(--t4)' }}>{used}/{allowed} used</span>
            </div>
          )}
        </CardHeader>

        {!canAdd ? <p style={{ fontSize: 13, color: 'var(--t3)' }}>No permission to add invitations.</p>
          : allowed === 0 ? <p style={{ fontSize: 13, color: 'var(--t3)' }}>Package has no invitation slots.</p>
          : remaining <= 0 ? <p style={{ fontSize: 13, color: 'var(--t3)' }}>All {allowed} slot{allowed !== 1 ? 's' : ''} used.</p>
          : <>
              <div className="grid-2-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                <Input label="Invited Name *" value={name}  onChange={e => setName(e.target.value)}  placeholder="Full name" />
                <Input label="Phone"          value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 5 }}>ID Photo / File <span style={{ fontWeight: 400, color: 'var(--t4)' }}>(optional, max 5MB)</span></label>
                <input type="file" accept="image/*,.pdf" onChange={e => setFile(e.target.files[0] ?? null)}
                  style={{ width: '100%', padding: '7px 10px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--t2)', fontFamily: 'inherit' }} />
                {file && <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 3 }}>Selected: {file.name} ({(file.size/1024).toFixed(0)} KB)</p>}
              </div>
              <Btn size="sm" onClick={handleSubmit} disabled={loading}>{loading ? <Spinner size="sm" /> : 'Record Invitation'}</Btn>
            </>
        }
      </Card>

      <Card noPad>
        <div style={{ padding: '14px 18px 0' }}>
          <CardHeader title={`Invitation History (${member.invitations?.length ?? 0})`} />
        </div>
        {!invitations.length ? <EmptyState message="No invitations yet" /> :
          <div>
            {invitations.map(inv => (
              <div key={inv._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border)', gap: 16 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', margin: 0 }}>{inv.invitedName}</p>
                  <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>
                    {inv.invitedPhone && `${inv.invitedPhone} · `}By {inv.createdBy?.name ?? '—'} · {fmtDateTime(inv.createdAt)}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {inv.idFile && (
                    <button
                      type="button"
                      onClick={() => handleViewId(inv.idFile)}
                      disabled={openingId === inv.idFile}
                      style={{ fontSize: 12, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                    >
                      {openingId === inv.idFile ? 'Opening…' : 'View ID'}
                    </button>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--t4)' }}>{fmtDate(inv.usedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        }
      </Card>
    </div>
  );
}
