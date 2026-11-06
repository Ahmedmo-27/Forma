import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import usePageTitle from '../../hooks/usePageTitle';
import Layout from '../../components/Layout';
import {
  PageHeader, Card, CardHeader, Btn,
  Spinner, Modal, ConfirmDialog, Table, EmptyState, fmtDate, Pagination,
} from '../../components/ui';
import PackageForm, { EMPTY_PACKAGE_FORM, validatePackageForm, packageFormToPayload } from '../../components/PackageForm';
import { getPackages, createPackage, updatePackage, deletePackage } from '../../api/endpoints';

const PAGE_SIZE = 15;

const ACTIVITY_COLOR = {
  gym:          { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  crossfit:     { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
  box:          { bg: '#fdf4ff', color: '#9333ea', border: '#e9d5ff' },
  mma:          { bg: '#fff1f2', color: '#e11d48', border: '#fecdd3' },
  kickboxing:   { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  calisthenics: { bg: '#f0f9ff', color: '#0284c7', border: '#bae6fd' },
};
function ActivityBadge({ type }) {
  const c = ACTIVITY_COLOR[type] ?? { bg: 'var(--slate-bg)', color: 'var(--slate)', border: 'var(--slate-bd)' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.3px', textTransform: 'capitalize',
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>{type}</span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ManagePackages() {
  usePageTitle('Packages');

  const [packages, setPackages] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });

  const [showCreate,    setShowCreate]    = useState(false);
  const [createForm,    setCreateForm]    = useState(EMPTY_PACKAGE_FORM);
  const [createErrors,  setCreateErrors]  = useState({});
  const [creating,      setCreating]      = useState(false);

  const [editTarget,  setEditTarget]  = useState(null);
  const [editForm,    setEditForm]    = useState(EMPTY_PACKAGE_FORM);
  const [editErrors,  setEditErrors]  = useState({});
  const [editing,     setEditing]     = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting,     setDeleting]     = useState(false);

  const load = useCallback(async (override = {}) => {
    const pageNum = override.page ?? page;
    setLoading(true);
    try {
      const res = await getPackages({ page: pageNum, limit: PAGE_SIZE });
      setPackages(res.data.packages ?? []);
      setPagination(res.data.pagination ?? { page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
    } catch { toast.error('Failed to load packages'); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  // ── Create ──────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const errs = validatePackageForm(createForm);
    if (Object.keys(errs).length) { setCreateErrors(errs); return; }
    setCreating(true);
    try {
      await createPackage(packageFormToPayload(createForm));
      toast.success('Package created');
      setShowCreate(false);
      setCreateForm(EMPTY_PACKAGE_FORM);
      setCreateErrors({});
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create package');
    } finally { setCreating(false); }
  };

  // ── Edit ────────────────────────────────────────────────────────────────
  const openEdit = pkg => {
    setEditTarget(pkg);
    setEditForm({
      name:                   pkg.name,
      activityType:           pkg.activityType,
      duration:               pkg.duration,
      price:                  String(pkg.price),
      freezeLimitDays:        String(pkg.freezeLimitDays ?? 0),
      invitationLimit:        String(pkg.invitationLimit ?? 0),
      renewalDiscountPercent: String(pkg.renewalDiscountPercent ?? 0),
      description:            pkg.description ?? '',
    });
    setEditErrors({});
  };

  const handleEdit = async () => {
    const errs = validatePackageForm(editForm);
    if (Object.keys(errs).length) { setEditErrors(errs); return; }
    setEditing(true);
    try {
      const res = await updatePackage(editTarget._id, packageFormToPayload(editForm));
      const updated = res.data?.package;
      toast.success('Package updated');
      setEditTarget(null);
      await load();
      if (updated?._id) {
        setPackages((prev) => prev.map((pkg) => (pkg._id === updated._id ? { ...pkg, ...updated } : pkg)));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update package');
    } finally { setEditing(false); }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePackage(deleteTarget._id);
      toast.success('Package deactivated');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete package');
    } finally { setDeleting(false); }
  };

  return (
    <Layout>
      <PageHeader title="Packages">
        <Btn variant="blue" size="sm" onClick={() => { setCreateForm(EMPTY_PACKAGE_FORM); setCreateErrors({}); setShowCreate(true); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Package
        </Btn>
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <Card noPad>
          <CardHeader title={`Active Packages (${pagination.total})`} />
          <Table
            headers={['Name', 'Activity', 'Duration', 'Price', 'Freeze', 'Invites', 'Discount', 'Created', '']}
            loading={loading} skeletonRows={4}
          >
            {!loading && packages.length === 0 && (
              <tr><td colSpan={9}><EmptyState icon="📦" message="No packages yet" sub="Create your first package above" /></td></tr>
            )}
            {packages.map(pkg => (
              <tr key={pkg._id} style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--t1)', fontSize: 13 }}>
                  {pkg.name}
                  {pkg.description && (
                    <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2, fontWeight: 400 }}>
                      {pkg.description.length > 60 ? pkg.description.slice(0, 60) + '…' : pkg.description}
                    </div>
                  )}
                </td>
                <td style={{ padding: '11px 14px' }}><ActivityBadge type={pkg.activityType} /></td>
                <td style={{ padding: '11px 14px', color: 'var(--t2)', fontSize: 13 }}>{pkg.duration}</td>
                <td style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--t1)', fontSize: 13 }}>
                  {pkg.price.toLocaleString()} EGP
                </td>
                <td style={{ padding: '11px 14px', color: 'var(--t2)', fontSize: 13 }}>
                  {pkg.freezeLimitDays > 0 ? `${pkg.freezeLimitDays}d` : <span style={{ color: 'var(--t4)' }}>—</span>}
                </td>
                <td style={{ padding: '11px 14px', color: 'var(--t2)', fontSize: 13 }}>
                  {pkg.invitationLimit > 0 ? pkg.invitationLimit : <span style={{ color: 'var(--t4)' }}>—</span>}
                </td>
                <td style={{ padding: '11px 14px', fontSize: 13 }}>
                  {pkg.renewalDiscountPercent > 0
                    ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>{pkg.renewalDiscountPercent}%</span>
                    : <span style={{ color: 'var(--t4)' }}>—</span>}
                </td>
                <td style={{ padding: '11px 14px', color: 'var(--t4)', fontSize: 12 }}>{fmtDate(pkg.createdAt)}</td>
                <td style={{ padding: '11px 14px' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Btn variant="outline" size="xs" onClick={() => openEdit(pkg)}>Edit</Btn>
                    <Btn variant="danger"  size="xs" onClick={() => setDeleteTarget(pkg)}>Delete</Btn>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={pagination.limit ?? PAGE_SIZE}
            onPageChange={setPage}
          />
        </Card>
      </div>

      {/* Create */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Package" size="md"
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Btn>
          <Btn variant="blue"  size="sm" onClick={handleCreate} disabled={creating}>
            {creating ? <Spinner size="sm" /> : 'Create Package'}
          </Btn>
        </>}
      >
        <PackageForm form={createForm} onChange={setCreateForm} errors={createErrors} />
      </Modal>

      {/* Edit */}
      <Modal open={Boolean(editTarget)} onClose={() => setEditTarget(null)} title={`Edit — ${editTarget?.name ?? ''}`} size="md"
        footer={<>
          <Btn variant="ghost" size="sm" onClick={() => setEditTarget(null)} disabled={editing}>Cancel</Btn>
          <Btn variant="blue"  size="sm" onClick={handleEdit} disabled={editing}>
            {editing ? <Spinner size="sm" /> : 'Save Changes'}
          </Btn>
        </>}
      >
        <PackageForm form={editForm} onChange={setEditForm} errors={editErrors} />
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Deactivate Package"
        message={`Deactivate "${deleteTarget?.name}"? It will no longer appear when assigning packages to members.`}
        confirmLabel="Deactivate" danger loading={deleting}
      />
    </Layout>
  );
}
