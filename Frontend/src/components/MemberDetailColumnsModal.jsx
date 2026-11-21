import { Modal, Btn } from './ui';
import { OPTIONAL_VISIT_COLUMNS } from '../lib/memberDetailColumns';
import { useI18n } from '../i18n/useI18n';

/**
 * Checkbox modal for optional member-detail columns on Check In / Attendance.
 * Only mount when the viewer has `member_detail_columns` access.
 */
export default function MemberDetailColumnsModal({
  open,
  visibleKeys = [],
  onChange,
  onClose,
}) {
  const { t } = useI18n();

  const setKeys = (next) => {
    onChange?.(next);
  };

  const toggleKey = (key) => {
    setKeys(
      visibleKeys.includes(key)
        ? visibleKeys.filter((k) => k !== key)
        : [...visibleKeys, key],
    );
  };

  return (
    <Modal open={open} title={t('Customize Table Columns')} onClose={onClose} size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--t3)', margin: 0 }}>
          {t('Select which extra member fields to show in the visits table.')}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px 14px' }}>
          {OPTIONAL_VISIT_COLUMNS.map((col) => {
            const checked = visibleKeys.includes(col.key);
            return (
              <label
                key={col.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--t1)',
                  cursor: 'pointer',
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: checked
                    ? 'var(--navy-subtle, color-mix(in srgb, var(--navy) 6%, transparent))'
                    : 'var(--bg)',
                  border: `1px solid ${checked ? 'var(--navy)' : 'var(--border)'}`,
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleKey(col.key)}
                />
                <span>{t(col.label)}</span>
              </label>
            );
          })}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 8,
          borderTop: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn size="xs" variant="ghost" onClick={() => setKeys([])}>
              {t('Reset Default')}
            </Btn>
            <Btn
              size="xs"
              variant="ghost"
              onClick={() => setKeys(OPTIONAL_VISIT_COLUMNS.map((c) => c.key))}
            >
              {t('Select All')}
            </Btn>
          </div>
          <Btn size="sm" variant="primary" onClick={onClose}>
            {t('Apply Columns')}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
