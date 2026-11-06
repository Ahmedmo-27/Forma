import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import { PageHeader, Card, Btn, Spinner, Badge } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import { searchAccessUsers, getUserAccess, updateUserAccess } from '../../api/endpoints';

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: 'relative', width: 40, height: 22, borderRadius: 11,
        border: 'none', padding: 0, flexShrink: 0,
        background: checked ? 'var(--blue)' : '#cbd5e1',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.18s',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: 'var(--card)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        transition: 'left 0.18s',
      }} />
    </button>
  );
}

function draftBadge(feature, on) {
  const isDefault = feature.isDefault ?? (feature.source === 'revoked' || (feature.source === 'default' && feature.enabled));
  if (on && isDefault) return { text: 'Default', color: 'var(--t3)' };
  if (on && !isDefault) return { text: 'Extra', color: 'var(--green)' };
  if (!on && isDefault) return { text: 'Removed', color: 'var(--red)' };
  return null;
}

function enabledKeys(groups) {
  const keys = [];
  for (const group of groups || []) {
    for (const feature of group.features || []) {
      if (feature.enabled) keys.push(feature.key);
    }
  }
  return keys;
}

export default function AccessControl() {
  usePageTitle('Access Control');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [groups, setGroups] = useState([]);
  const [draft, setDraft] = useState({});
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const close = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      searchAccessUsers(q)
        .then((res) => {
          if (!cancelled) setResults(res.data.users || []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const chooseUser = async (person) => {
    setSelected(person);
    setQuery(person.name);
    setOpen(false);
    setLoadingAccess(true);
    try {
      const res = await getUserAccess(person._id);
      const nextGroups = res.data.groups || [];
      setGroups(nextGroups);
      const flags = {};
      nextGroups.forEach((group) => {
        group.features.forEach((feature) => {
          flags[feature.key] = feature.enabled;
        });
      });
      setDraft(flags);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not load access');
      setGroups([]);
      setDraft({});
    } finally {
      setLoadingAccess(false);
    }
  };

  const savedKeys = useMemo(() => enabledKeys(groups).sort().join('|'), [groups]);
  const draftKeys = useMemo(
    () => Object.entries(draft).filter(([, on]) => on).map(([key]) => key).sort().join('|'),
    [draft],
  );
  const dirty = Boolean(selected) && savedKeys !== draftKeys;

  const confirm = async () => {
    if (!selected || !dirty) return;
    const features = Object.entries(draft).filter(([, on]) => on).map(([key]) => key);
    setSaving(true);
    try {
      const res = await updateUserAccess(selected._id, features);
      const nextGroups = res.data.groups || [];
      setGroups(nextGroups);
      const flags = {};
      nextGroups.forEach((group) => {
        group.features.forEach((feature) => {
          flags[feature.key] = feature.enabled;
        });
      });
      setDraft(flags);
      toast.success(`Access updated for ${selected.name}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save access');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <PageHeader title="Access Control" />
      <div className="page-wrap" style={{ paddingTop: 24, paddingBottom: 96 }}>
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>
            Choose a staff member
          </h3>
          <p style={{ fontSize: 12, color: 'var(--t4)', marginBottom: 14 }}>
            Search by name. Each result shows the person and their role.
          </p>
          <div ref={boxRef} style={{ position: 'relative', maxWidth: 480 }}>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
                if (selected && event.target.value !== selected.name) setSelected(null);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search staff by name"
              aria-label="Search staff by name"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--card)',
                color: 'var(--t1)', fontSize: 13,
              }}
            />
            {open && query.trim() && (
              <div style={{
                position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0,
                background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
              }}>
                {searching && (
                  <div style={{ padding: 12, display: 'flex', justifyContent: 'center' }}><Spinner size="sm" /></div>
                )}
                {!searching && results.length === 0 && (
                  <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--t4)' }}>No matching staff</div>
                )}
                {!searching && results.map((person) => (
                  <button
                    key={person._id}
                    type="button"
                    onClick={() => chooseUser(person)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      width: '100%', textAlign: 'left', padding: '10px 14px',
                      background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
                      cursor: 'pointer', color: 'var(--t1)',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{person.name}</span>
                    <Badge status={person.role} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        {loadingAccess && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
        )}

        {!loadingAccess && selected && groups.length > 0 && (
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--t3)', margin: 0 }}>
              Features for <strong>{selected.name}</strong> ({selected.role}). Defaults stay on until you change them. Confirm at the bottom to save.
            </p>
            {groups.map((group) => (
              <Card key={group.role}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 12 }}>
                  {group.role}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  {group.features.map((feature) => {
                    const on = Boolean(draft[feature.key]);
                    const label = draftBadge(feature, on);
                    return (
                      <div key={feature.key} style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        background: 'var(--card)', padding: '14px 16px',
                        opacity: feature.locked ? 0.72 : 1,
                      }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{feature.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{feature.label}</span>
                            {label && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: label.color, letterSpacing: '0.3px' }}>{label.text}</span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--t4)' }}>{feature.description}</div>
                          {feature.locked && feature.lockReason && (
                            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{feature.lockReason}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: on ? 'var(--green)' : 'var(--red)' }}>
                            {on ? 'Enabled' : 'Disabled'}
                          </span>
                          <Toggle
                            checked={on}
                            disabled={feature.locked}
                            onChange={(value) => setDraft((prev) => ({ ...prev, [feature.key]: value }))}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}

            <div style={{
              position: 'sticky', bottom: 16, zIndex: 5,
              display: 'flex', justifyContent: 'flex-end', gap: 10,
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '12px 14px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            }}>
              <Btn
                variant="ghost"
                disabled={!dirty || saving}
                onClick={() => {
                  const flags = {};
                  groups.forEach((group) => group.features.forEach((feature) => { flags[feature.key] = feature.enabled; }));
                  setDraft(flags);
                }}
              >
                Reset
              </Btn>
              <Btn disabled={!dirty || saving} onClick={confirm}>
                {saving ? <Spinner size="sm" /> : 'Confirm access'}
              </Btn>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
