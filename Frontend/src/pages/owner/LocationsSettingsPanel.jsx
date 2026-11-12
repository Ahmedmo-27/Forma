import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { Card, CardHeader, Input, Btn, Spinner } from '../../components/ui';
import {
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
} from '../../api/endpoints';
import { useTenant } from '../../context/TenantContext';
import { useLocationScope } from '../../context/LocationContext';

export default function LocationsSettingsPanel() {
  const { hasFeature, limits, usage, plan } = useTenant();
  const { refreshLocations } = useLocationScope();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', branch_location: '' });
  const [editingId, setEditingId] = useState(null);

  const planKey = String(plan?.key || '').toLowerCase();
  const multi = hasFeature('multi_branches') || planKey === 'gold' || planKey === 'platinum';
  const maxBranches = limits?.maxBranches ?? 1;
  const branchCount = usage?.branches ?? locations.length;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listLocations();
      setLocations(data?.locations || []);
    } catch (err) {
      toast.error(err.normalized?.message || 'Failed to load locations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setForm({ name: '', branch_location: '' });
    setEditingId(null);
  };

  const startEdit = (loc) => {
    setEditingId(loc._id);
    setForm({
      name: loc.name || '',
      branch_location: loc.branch_location || '',
    });
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error('Location name is required');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateLocation(editingId, {
          name,
          branch_location: form.branch_location.trim(),
        });
        toast.success('Location updated');
      } else {
        // Let the API enforce plan/feature/limits — avoid stale client feature flags
        await createLocation({
          name,
          branch_location: form.branch_location.trim(),
        });
        toast.success('Location created');
      }
      resetForm();
      await load();
      await refreshLocations();
    } catch (err) {
      toast.error(err.normalized?.message || err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (loc) => {
    if (!window.confirm(`Delete location "${loc.name}"? Members must be reassigned first.`)) return;
    try {
      await deleteLocation(loc._id);
      toast.success('Location deleted');
      if (editingId === loc._id) resetForm();
      await load();
      await refreshLocations();
    } catch (err) {
      toast.error(err.normalized?.message || err.response?.data?.message || 'Delete failed');
    }
  };

  if (!multi && locations.length <= 1) {
    // Still show the single location + upgrade hint
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card>
        <CardHeader
          title="Locations / Branches"
          sub={
            multi
              ? `Manage gym branches. Quota: ${branchCount} / ${maxBranches}`
              : 'Multi-branch is available on Gold and Platinum plans. You can keep one Main location.'
          }
        />
        {loading ? (
          <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {locations.length === 0 && (
              <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
                No locations yet. Create your Main branch below.
              </p>
            )}
            {locations.map((loc) => (
              <div
                key={loc._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid #E5E7EB',
                  background: editingId === loc._id ? '#F5F3FF' : '#fff',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: 'color-mix(in srgb, var(--navy) 12%, #fff)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--navy)', flexShrink: 0,
                }}>
                  <MapPin size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{loc.name}</div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>
                    Code: {loc.locationId}
                    {loc.branch_location ? (
                      <>
                        {' · '}
                        <a href={loc.branch_location} target="_blank" rel="noreferrer" style={{ color: 'var(--navy)' }}>
                          Maps link
                        </a>
                      </>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(loc)}
                  aria-label="Edit location"
                  style={{
                    background: 'none', border: '1px solid #E5E7EB', borderRadius: 8,
                    width: 34, height: 34, cursor: 'pointer', color: '#374151',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(loc)}
                  aria-label="Delete location"
                  style={{
                    background: 'none', border: '1px solid #FECACA', borderRadius: 8,
                    width: 34, height: 34, cursor: 'pointer', color: '#DC2626',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title={editingId ? 'Edit location' : 'Add location'}
          sub="Name and optional Google Maps link. Location code is generated automatically."
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Downtown Branch"
          />
          <Input
            label="Google Maps link"
            value={form.branch_location}
            onChange={(e) => setForm((f) => ({ ...f, branch_location: e.target.value }))}
            placeholder="https://maps.google.com/..."
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? <><Spinner size="sm" /> Saving…</> : (
                editingId ? 'Save changes' : <><Plus size={16} /> Create location</>
              )}
            </Btn>
            {editingId && (
              <Btn variant="ghost" onClick={resetForm} disabled={saving}>Cancel</Btn>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
