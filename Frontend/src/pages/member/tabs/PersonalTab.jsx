import { useState } from 'react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Btn, Modal, Input, Select, Spinner, InfoRow, Badge, fmtDate } from '../../../components/ui';
import { assignSales, getSalesUsers, updateMember } from '../../../api/endpoints';
import { toWhatsAppUrl, WhatsAppBtn } from '../../../utils/whatsapp';
import WhatsAppTemplateSendModal from '../../../components/WhatsAppTemplateSendModal';
import { mapFieldErrors, focusFirstInvalidField } from '../../../lib/formErrors';
import { isValidPhone, isDateInFuture } from '../../../lib/validation';

const SOURCES = ['Social media', 'Walk in', 'Word of mouth', 'referral', 'sales call', 'data entry', 'others'];
const EDIT_ROLES = ['Owner', 'Sales Manager', 'Receptionist', 'Sales', 'Accountant', 'General Manager'];

function toDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function PersonalTab({ member, user, onRefresh }) {
  const [showAssign, setShowAssign] = useState(false);
  const [showPhone, setShowPhone]   = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showEdit, setShowEdit]     = useState(false);
  const [editForm, setEditForm]     = useState(null);
  const [editErrors, setEditErrors] = useState({});
  const [saving, setSaving]         = useState(false);
  const [salesUsers, setSalesUsers] = useState([]);
  const [selected, setSelected]     = useState(member.assignedSales?._id ?? '');
  const [loading, setLoading]       = useState(false);

  const canAssign = user?.role === 'Sales Manager' || user?.role === 'Owner' ||
    (user?.role === 'Receptionist' && !member.assignedSales);
  const canEdit = EDIT_ROLES.includes(user?.role);
  const canEditPhone = Boolean(member.phones && member.phones !== 'hidden');

  // Phone visibility
  const isSalesManager = user?.role === 'Sales Manager';
  const isAssignedSales = user?.role === 'Sales' && member.assignedSales?._id === user?._id;
  const isAssignedCoach = user?.role === 'Coach' && (
    member.current_couch?._id === user?._id || member.current_couch === user?._id
  );
  // Privacy flag applies to both Sales and Receptionist
  const phonePrivacyRestricted = ['Sales', 'Receptionist'].includes(user?.role) && user?.canViewPhones === false;
  const canSeePhone = !phonePrivacyRestricted && (
    isSalesManager || isAssignedSales || isAssignedCoach || user?.role === 'Receptionist'
  );
  // Owner, Accountant, and Coach Manager always see phone directly, no button needed
  const showPhoneDirectly = ['Owner', 'Accountant', 'Coach Manager'].includes(user?.role);
  const hasUsablePhone = Boolean(member.phones && member.phones !== 'hidden' && toWhatsAppUrl(member.phones));
  const canSendTemplate = user?.role !== 'Sales' || user?.abilities?.canSendWhatsAppTemplates !== false;

  const openAssign = async () => {
    try { const res = await getSalesUsers(); setSalesUsers(res.data.salesUsers ?? []); setSelected(member.assignedSales?._id ?? ''); }
    catch { toast.error('Failed to load sales users.'); }
    setShowAssign(true);
  };

  const openEdit = () => {
    setEditForm({
      name: member.name || '',
      phones: canEditPhone ? member.phones : '',
      gender: member.gender || '',
      birthdate: toDateInput(member.birthdate),
      source: member.source || '',
    });
    setEditErrors({});
    setShowEdit(true);
  };

  const setEdit = (key, value) => setEditForm((form) => ({ ...form, [key]: value }));

  const handleSave = async () => {
    if (!editForm) return;
    const errors = {};
    const name = editForm.name.trim();
    if (!name) errors.name = 'Name is required';
    else if (name.length > 120) errors.name = 'Name must not exceed 120 characters';
    if (canEditPhone) {
      const phone = editForm.phones.trim();
      if (!phone) errors.phones = 'Phone is required';
      else if (!isValidPhone(phone)) errors.phones = 'Phone must be 5–40 characters and contain valid phone digits';
    }
    if (editForm.birthdate && isDateInFuture(editForm.birthdate)) {
      errors.birthdate = 'Birthdate cannot be in the future';
    }
    setEditErrors(errors);
    if (Object.keys(errors).length) return;

    const payload = {
      name,
      gender: editForm.gender || null,
      birthdate: editForm.birthdate || null,
      source: editForm.source || null,
    };
    if (canEditPhone) payload.phones = editForm.phones.trim();

    setSaving(true);
    try {
      await updateMember(member.systemId, payload);
      toast.success('Member details saved.');
      setShowEdit(false);
      onRefresh();
    } catch (e) {
      if (e.normalized?.code === 'VALIDATION_FAILED' && e.normalized.fieldErrors) {
        setEditErrors(mapFieldErrors(e.normalized.fieldErrors));
        focusFirstInvalidField(e.normalized.fieldErrors);
      } else if (e.normalized?.status !== 403 && e.normalized?.status !== 429) {
        toast.error(e.normalized?.message || e.response?.data?.message || 'Could not save member details.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async () => {
    if (!selected) { toast.error('Select a salesperson.'); return; }
    setLoading(true);
    try { await assignSales(member.systemId, selected); toast.success('Sales rep assigned.'); setShowAssign(false); onRefresh(); }
    catch (e) { toast.error(e.response?.data?.message ?? 'Failed.'); }
    finally { setLoading(false); }
  };

  const whatsAppActions = hasUsablePhone ? (
    <>
      <WhatsAppBtn phone={member.phones} />
      {canSendTemplate && (
        <Btn variant="outline" size="xs" onClick={() => setShowTemplate(true)}>
          Send ready message
        </Btn>
      )}
    </>
  ) : null;

  const phoneValue = (() => {
    if (showPhoneDirectly) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace' }}>{member.phones}</span>
          {whatsAppActions}
        </div>
      );
    }
    if (canSeePhone) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant="outline" size="xs" onClick={() => setShowPhone(true)}>Show Number</Btn>
          {whatsAppActions}
        </div>
      );
    }
    return <span style={{ color: 'var(--t4)' }}>Hidden</span>;
  })();

  return (
    <>
      <Card>
        <CardHeader title="Personal Information">
          <div style={{ display: 'flex', gap: 8 }}>
            {canEdit && <Btn variant="outline" size="sm" onClick={openEdit}>Edit</Btn>}
            {canAssign && <Btn variant="outline" size="sm" onClick={openAssign}>Assign Sales Rep</Btn>}
          </div>
        </CardHeader>
        <InfoRow label="Full Name"         value={member.name} />
        <InfoRow label="Phone"             value={phoneValue} />
        <InfoRow label="Gender"            value={member.gender} />
        <InfoRow label="Birthdate"         value={fmtDate(member.birthdate)} />
        <InfoRow label="Source"            value={member.source} />
        <InfoRow label="System ID"         value={`#${member.systemId}`} />
        <InfoRow label="Member ID"         value={member.memberId ? `M${member.memberId}` : '—'} />
        <InfoRow label="Status"            value={<Badge status={member.status} />} />
        <InfoRow label="Added By"          value={member.createdBy?.name} />
        <InfoRow label="Added On"          value={fmtDate(member.createdAt)} />
        <InfoRow label="Assigned Sales Rep" value={member.assignedSales ? `${member.assignedSales.name} (${member.assignedSales.role})` : '—'} />
      </Card>

      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="Edit personal information"
        footer={(
          <>
            <Btn variant="ghost" size="sm" onClick={() => setShowEdit(false)}>Cancel</Btn>
            <Btn size="sm" onClick={handleSave} disabled={saving}>{saving ? <Spinner size="sm" /> : 'Save'}</Btn>
          </>
        )}
      >
        {editForm && (
          <div className="grid-2-form">
            <Input label="Full Name *" value={editForm.name} onChange={(e) => setEdit('name', e.target.value)} error={editErrors.name} />
            {canEditPhone ? (
              <Input label="Phone *" value={editForm.phones} onChange={(e) => setEdit('phones', e.target.value)} error={editErrors.phones} />
            ) : (
              <Input label="Phone" value="Hidden" disabled />
            )}
            <Select label="Gender" value={editForm.gender} onChange={(e) => setEdit('gender', e.target.value)}>
              <option value="">— Select —</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
            <Input label="Birthdate" type="date" value={editForm.birthdate} onChange={(e) => setEdit('birthdate', e.target.value)} error={editErrors.birthdate} />
            <Select label="Source" value={editForm.source} onChange={(e) => setEdit('source', e.target.value)}>
              <option value="">— Select —</option>
              {SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}
            </Select>
          </div>
        )}
      </Modal>

      <Modal open={showAssign} onClose={() => setShowAssign(false)} title="Assign Sales Rep" size="sm"
        footer={<><Btn variant="ghost" size="sm" onClick={() => setShowAssign(false)}>Cancel</Btn><Btn size="sm" onClick={handleAssign} disabled={loading}>{loading ? <Spinner size="sm" /> : 'Assign'}</Btn></>}>
        <Select label="Salesperson" value={selected} onChange={e => setSelected(e.target.value)}>
          <option value="">— Select —</option>
          {salesUsers.map(s => <option key={s._id} value={s._id}>{s.name} ({s.role})</option>)}
        </Select>
      </Modal>

      {/* Phone number popup */}
      <Modal open={showPhone} onClose={() => setShowPhone(false)} title="Phone Number" size="sm">
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <p style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
            {member.name}
          </p>
          <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--t1)', letterSpacing: '1px', fontFamily: 'monospace', marginBottom: hasUsablePhone ? 16 : 0 }}>
            {member.phones}
          </p>
          {hasUsablePhone && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <WhatsAppBtn phone={member.phones} size="sm" />
              {canSendTemplate && (
                <Btn variant="outline" size="sm" onClick={() => { setShowPhone(false); setShowTemplate(true); }}>
                  Send ready message
                </Btn>
              )}
            </div>
          )}
        </div>
      </Modal>

      <WhatsAppTemplateSendModal
        open={showTemplate}
        onClose={() => setShowTemplate(false)}
        phone={member.phones}
        memberName={member.name}
        memberId={member._id || member.systemId}
      />
    </>
  );
}
