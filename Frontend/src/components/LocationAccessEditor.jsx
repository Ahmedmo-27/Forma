import { Card } from './ui';

/**
 * Branch viewing access editor used by Access Control and Manage Staff create forms.
 */
export default function LocationAccessEditor({
  title = 'Branch viewing access',
  description,
  locations = [],
  canAccessAll,
  onCanAccessAllChange,
  selectedIds = [],
  onToggleId,
  allMeansNoRestriction = false,
  disabled = false,
  error = '',
  embedded = false,
}) {
  const body = (
    <>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: 12, color: 'var(--t3)', margin: '0 0 12px', lineHeight: 1.45 }}>
          {description}
        </p>
      )}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
      }}>
        <input
          type="checkbox"
          checked={Boolean(canAccessAll)}
          disabled={disabled}
          onChange={(e) => onCanAccessAllChange?.(e.target.checked)}
        />
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {allMeansNoRestriction ? 'All locations (no restriction)' : 'All locations'}
        </span>
      </label>
      {!canAccessAll && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {locations.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--t3)', margin: 0 }}>
              No locations configured yet. Add branches in Settings → Locations.
            </p>
          )}
          {locations.map((loc) => {
            const checked = selectedIds.includes(String(loc._id));
            return (
              <label
                key={loc._id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--border)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.6 : 1,
                  background: checked ? 'color-mix(in srgb, var(--navy) 6%, var(--card))' : 'var(--card)',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={(e) => onToggleId?.(String(loc._id), e.target.checked)}
                />
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{loc.name}</span>
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>{loc.locationId}</span>
              </label>
            );
          })}
        </div>
      )}
      {error && (
        <p style={{ fontSize: 12, color: 'var(--red)', margin: '10px 0 0' }}>{error}</p>
      )}
    </>
  );

  if (embedded) {
    return (
      <div style={{
        marginTop: 4,
        paddingTop: 12,
        borderTop: '1px solid var(--border)',
      }}>
        {body}
      </div>
    );
  }

  return <Card>{body}</Card>;
}
