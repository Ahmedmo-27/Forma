import { useEffect, useRef, useState } from 'react';
import {
  addDays,
  endOfMonth,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns';
import { DayPicker } from 'react-day-picker';
import { ar as dayPickerAr } from 'react-day-picker/locale';
import { ar as arLocale } from 'date-fns/locale';
import { useI18n } from '../i18n/useI18n';
import { tr } from '../i18n/translate';
import { CalendarDays, Check, Loader2 } from 'lucide-react';
import 'react-day-picker/style.css';
import './DateRangePicker.css';

const DISPLAY_FORMAT = 'MMM dd, yyyy';
const WEEK_OPTIONS = { weekStartsOn: 1 };

function buildPresets(today) {
  const thisWeekStart = startOfWeek(today, WEEK_OPTIONS);
  const lastWeekStart = subDays(thisWeekStart, 7);
  const lastMonth = subMonths(today, 1);
  return [
    { label: tr('Today'), range: { from: today, to: today } },
    { label: tr('Yesterday'), range: { from: subDays(today, 1), to: subDays(today, 1) } },
    { label: tr('This Week'), range: { from: thisWeekStart, to: today } },
    { label: tr('Last Week'), range: { from: lastWeekStart, to: addDays(lastWeekStart, 6) } },
    { label: tr('Last 7 Days'), range: { from: subDays(today, 6), to: today } },
    { label: tr('Last 30 Days'), range: { from: subDays(today, 29), to: today } },
    { label: tr('This Month'), range: { from: startOfMonth(today), to: today } },
    { label: tr('Last Month'), range: { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) } },
  ];
}

function sameRange(a, b) {
  if (!a?.from || !b?.from) return false;
  if (!isSameDay(a.from, b.from)) return false;
  const aTo = a.to || a.from;
  const bTo = b.to || b.from;
  return isSameDay(aTo, bTo);
}

function describeRange(range, fallback) {
  if (!range?.from) return fallback;
  const from = format(range.from, DISPLAY_FORMAT);
  if (!range.to || isSameDay(range.from, range.to)) return from;
  return `${from} – ${format(range.to, DISPLAY_FORMAT)}`;
}

function useMonthCount() {
  const query = '(max-width: 720px)';
  const [single, setSingle] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = (event) => setSingle(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return single ? 1 : 2;
}

/**
 * Date range picker with presets and a range calendar.
 * `value` and `onChange` use `{ from: Date, to: Date }`. Future days are disabled.
 */
export default function DateRangePicker({
  value,
  onChange,
  placeholder,
  loading = false,
  disabled = false,
}) {
  const { t, lang, isRtl } = useI18n();
  const formatOptions = lang === 'ar' ? { locale: arLocale } : undefined;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const rootRef = useRef(null);
  const months = useMonthCount();
  const today = startOfDay(new Date());
  const presets = buildPresets(today);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (disabled) return;
    if (!open) setDraft(value);
    setOpen((prev) => !prev);
  };

  const applyPreset = (preset) => {
    setDraft(preset.range);
    onChange?.(preset.range);
    setOpen(false);
  };

  const apply = () => {
    if (!draft?.from) return;
    onChange?.({ from: draft.from, to: draft.to || draft.from });
    setOpen(false);
  };

  const cancel = () => {
    setDraft(value);
    setOpen(false);
  };

  const anchor = draft?.to || draft?.from || today;
  const defaultMonth = months === 2 ? startOfMonth(subMonths(anchor, 1)) : startOfMonth(anchor);

  return (
    <div className="drp-root" ref={rootRef}>
      <button
        type="button"
        className="drp-trigger"
        onClick={toggle}
        disabled={disabled || loading}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-empty={value?.from ? undefined : 'true'}
      >
        {loading
          ? <Loader2 size={16} className="drp-spin" aria-hidden />
          : <CalendarDays size={16} aria-hidden />}
        <span className="drp-trigger-text">{describeRange(value, placeholder ?? t('Pick a period'), formatOptions)}</span>
      </button>

      {open && (
        <div className="drp-popover" role="dialog" aria-label={t('Select date range')}>
          <div className="drp-body">
            <div className="drp-presets">
              <span className="drp-presets-title">{t('Presets')}</span>
              {presets.map((preset) => {
                const active = sameRange(draft, preset.range);
                return (
                  <button
                    key={preset.label}
                    type="button"
                    className="drp-preset"
                    data-active={active ? 'true' : undefined}
                    onClick={() => applyPreset(preset)}
                  >
                    <span>{t(preset.label)}</span>
                    {active && <Check size={12} aria-hidden />}
                  </button>
                );
              })}
            </div>

            <div className="drp-calendar">
              <DayPicker
                mode="range"
                selected={draft}
                onSelect={setDraft}
                numberOfMonths={months}
                defaultMonth={defaultMonth}
                weekStartsOn={1}
                dir={isRtl ? 'rtl' : 'ltr'}
                locale={lang === 'ar' ? dayPickerAr : undefined}
                disabled={{ after: today }}
                endMonth={today}
              />
              <div className="drp-footer">
                <div className="drp-summary">
                  {draft?.from ? describeRange(draft, undefined, formatOptions) : t('Select a date range')}
                </div>
                <div className="drp-actions">
                  <button type="button" className="drp-btn" onClick={cancel}>{t('Cancel')}</button>
                  <button type="button" className="drp-btn drp-btn-primary" onClick={apply} disabled={!draft?.from}>
                    {t('Apply')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
