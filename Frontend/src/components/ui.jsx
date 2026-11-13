// ─── Forma UI — sharp, data-dense design system ─────────────────────────────

import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, Children, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Inbox, X } from 'lucide-react';
import { fetchProtectedUploadBlobUrl } from '../api/axios';

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 'md' }) {
  const cls = size === 'sm' ? 'spin spin-sm' : size === 'lg' ? 'spin spin-lg' : 'spin';
  return <span className={cls} aria-hidden="true" />;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
export function Skeleton({ h = '13px', w = '100%' }) {
  return <div className="skel" style={{ height: h, width: w }} aria-hidden="true" />;
}
export function SkeletonRow({ cols = 6 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '11px 14px' }}>
          <Skeleton h="12px" w={i === 0 ? '60px' : '100%'} />
        </td>
      ))}
    </tr>
  );
}

/** KPI / stat card placeholder — matches StatCard footprint */
export function StatCardSkeleton() {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        borderTop: '3px solid var(--border-md)',
        padding: '14px 16px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.06)',
      }}
      aria-hidden="true"
    >
      <Skeleton h="11px" w="55%" />
      <div style={{ marginTop: 10 }}>
        <Skeleton h="26px" w="45%" />
      </div>
      <div style={{ marginTop: 8 }}>
        <Skeleton h="10px" w="70%" />
      </div>
    </div>
  );
}

/** Stacked note / activity card placeholders */
export function CardListSkeleton({ rows = 5 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <Skeleton h="13px" w="40%" />
            <Skeleton h="12px" w="72px" />
          </div>
          <Skeleton h="12px" w="90%" />
          <Skeleton h="12px" w="65%" />
        </div>
      ))}
    </div>
  );
}

/** Access / feature checklist group placeholders */
export function ChecklistSkeleton({ rows = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <Skeleton h="13px" w="30%" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Skeleton h="18px" w="100%" />
            <Skeleton h="18px" w="100%" />
            <Skeleton h="18px" w="85%" />
            <Skeleton h="18px" w="70%" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Thin dashboard shell: KPI row + optional list/table area.
 * Use when location/date selection refetches a mixed dashboard layout.
 */
export function DashboardSkeleton({ stats = 4, listRows = 5, showList = true }) {
  return (
    <div aria-busy="true" aria-live="polite">
      {stats > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
            gap: 12,
            marginBottom: 20,
          }}
        >
          {Array.from({ length: stats }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      )}
      {showList && (
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={{ marginBottom: 14 }}>
            <Skeleton h="14px" w="160px" />
          </div>
          <CardListSkeleton rows={listRows} />
        </div>
      )}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
const BADGE_MAP = {
  active:   { bg: 'var(--green-bg)',  color: 'var(--green)',  border: 'var(--green-bd)',  dot: '#22c55e' },
  expired:  { bg: 'var(--red-bg)',    color: 'var(--red)',    border: 'var(--red-bd)',    dot: '#ef4444' },
  frozen:   { bg: 'var(--sky-bg)',    color: 'var(--sky)',    border: 'var(--sky-bd)',    dot: '#38bdf8' },
  guest:    { bg: 'var(--slate-bg)',  color: 'var(--slate)',  border: 'var(--slate-bd)', dot: '#A6A0C2' },
  blocked:  { bg: 'rgba(239,68,68,0.12)', color: '#f87171',  border: 'rgba(239,68,68,0.30)', dot: '#ef4444' },
  pending:  { bg: 'var(--amber-bg)', color: 'var(--amber)',  border: 'var(--amber-bd)', dot: '#f59e0b' },
  accepted: { bg: 'var(--green-bg)',  color: 'var(--green)',  border: 'var(--green-bd)',  dot: '#22c55e' },
  completed: { bg: 'var(--green-bg)',  color: 'var(--green)',  border: 'var(--green-bd)',  dot: '#22c55e' },
  in_progress: { bg: 'var(--sky-bg)',  color: 'var(--sky)',  border: 'var(--sky-bd)',  dot: '#38bdf8' },
  rejected: { bg: 'var(--red-bg)',    color: 'var(--red)',    border: 'var(--red-bd)',    dot: '#ef4444' },
};
export function Badge({ status }) {
  const s = BADGE_MAP[status] ?? BADGE_MAP.guest;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 6,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.4px',
      background: s.bg, color: s.color,
      border: `1px solid ${s.border}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, flexShrink: 0, boxShadow: '0 0 5px currentColor' }} />
      {status}
    </span>
  );
}

// ── Button ────────────────────────────────────────────────────────────────────
const BV = {
  primary: {
    bg: 'linear-gradient(135deg, var(--navy), var(--navy-2))',
    color: '#fff',
    border: 'var(--navy-2)',
    hbg: 'linear-gradient(135deg, var(--navy-2), var(--navy-3, var(--navy-2)))',
    shadow: '0 2px 12px color-mix(in srgb, var(--navy) 35%, transparent)',
    hShadow: '0 4px 18px color-mix(in srgb, var(--navy) 50%, transparent)',
  },
  blue: {
    bg: 'linear-gradient(135deg, var(--navy), var(--navy-2))',
    color: '#fff',
    border: 'var(--navy)',
    hbg: 'linear-gradient(135deg, var(--navy-2), var(--navy-3, var(--navy-2)))',
    shadow: '0 2px 12px color-mix(in srgb, var(--navy) 30%, transparent)',
    hShadow: '0 4px 18px color-mix(in srgb, var(--navy) 45%, transparent)',
  },
  outline: {
    bg: 'transparent',
    color: 'var(--t2)',
    border: 'var(--border-md)',
    hbg: 'color-mix(in srgb, var(--navy) 6%, transparent)',
    hborder: 'color-mix(in srgb, var(--navy) 40%, transparent)',
    hcolor: 'var(--navy)',
    shadow: 'none',
    hShadow: 'none',
  },
  ghost: {
    bg: 'transparent',
    color: 'var(--t3)',
    border: 'transparent',
    hbg: 'color-mix(in srgb, var(--navy) 6%, transparent)',
    hcolor: 'var(--navy)',
    shadow: 'none',
    hShadow: 'none',
  },
  danger: {
    bg: 'linear-gradient(135deg,#dc2626,#ef4444)',
    color: '#fff',
    border: '#ef4444',
    hbg: 'linear-gradient(135deg,#b91c1c,#dc2626)',
    shadow: '0 2px 12px rgba(239,68,68,0.3)',
    hShadow: '0 4px 18px rgba(239,68,68,0.45)',
  },
  success: {
    bg: 'linear-gradient(135deg,#16a34a,#22c55e)',
    color: '#fff',
    border: '#22c55e',
    hbg: 'linear-gradient(135deg,#15803d,#16a34a)',
    shadow: '0 2px 12px rgba(34,197,94,0.3)',
    hShadow: '0 4px 18px rgba(34,197,94,0.45)',
  },
};
const BS = {
  xs: { p: '4px 11px',  fs: 11, r: 6 },
  sm: { p: '6px 14px',  fs: 12, r: 7 },
  md: { p: '9px 18px',  fs: 13, r: 8 },
  lg: { p: '11px 22px', fs: 14, r: 8 },
};
export function Btn({ children, variant = 'primary', size = 'md', onClick, disabled, type = 'button', fullWidth = false, style: ex = {} }) {
  const v = BV[variant] ?? BV.primary;
  const s = BS[size] ?? BS.md;
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: s.p, fontSize: s.fs, fontWeight: 600, borderRadius: s.r,
        background: v.bg, color: v.color,
        border: `1px solid ${v.border}`,
        boxShadow: v.shadow,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
        fontFamily: 'inherit', whiteSpace: 'nowrap',
        width: fullWidth ? '100%' : 'auto',
        ...ex,
      }}
      onMouseEnter={e => {
        if (!disabled) {
          e.currentTarget.style.background = v.hbg;
          if (variant === 'outline') { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--navy) 40%, transparent)'; e.currentTarget.style.color = 'var(--navy)'; }
          if (variant === 'ghost') { e.currentTarget.style.color = v.hcolor ?? 'var(--navy)'; }
          e.currentTarget.style.boxShadow = v.hShadow;
        }
      }}
      onMouseLeave={e => {
        if (!disabled) {
          e.currentTarget.style.background = v.bg;
          if (variant === 'outline') { e.currentTarget.style.borderColor = v.border; e.currentTarget.style.color = v.color; }
          if (variant === 'ghost') { e.currentTarget.style.color = v.color; }
          e.currentTarget.style.boxShadow = v.shadow;
        }
      }}
    >{children}</button>
  );
}

// ── Field wrapper (shared for Input/Select/Textarea) ──────────────────────────
function Field({ label, error, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6, letterSpacing: '0.3px' }}>
          {label}
        </label>
      )}
      {children}
      {error && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 3 }}>{error}</p>}
      {hint && !error && <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 3 }}>{hint}</p>}
    </div>
  );
}

const inputBase = (error) => ({
  width: '100%', padding: '10px 13px', fontSize: 13,
  border: `1px solid ${error ? 'var(--red-bd)' : 'var(--border)'}`,
  borderRadius: 8, outline: 'none',
  color: 'var(--t1)', background: 'var(--card)',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  fontFamily: 'inherit',
  boxShadow: error ? '0 0 0 3px rgba(239,68,68,0.08)' : 'none',
});

export function Input({ label, error, hint, ...props }) {
  return (
    <Field label={label} error={error} hint={hint}>
      <input
        {...props}
        style={inputBase(error)}
        onFocus={e => { e.target.style.borderColor = 'var(--navy)'; e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--navy) 10%, transparent)'; }}
        onBlur={e  => { e.target.style.borderColor = error ? 'var(--red-bd)' : 'var(--border)'; e.target.style.boxShadow = 'none'; }}
      />
    </Field>
  );
}
function parseSelectOptions(children, optionsProp) {
  if (optionsProp?.length) {
    return optionsProp.map((o) => ({
      value: String(o.value ?? ''),
      label: String(o.label ?? o.value ?? ''),
      disabled: !!o.disabled,
      group: o.group || null,
    }));
  }
  const parsed = [];
  let currentGroup = null;
  Children.forEach(children, (child) => {
    if (!child || typeof child === 'string') return;
    if (child.type === 'optgroup') {
      currentGroup = child.props?.label || null;
      Children.forEach(child.props?.children, (opt) => {
        if (!opt || opt.type !== 'option') return;
        const p = opt.props ?? {};
        const labelText = typeof p.children === 'string'
          ? p.children
          : Children.toArray(p.children).join('');
        parsed.push({
          value: String(p.value ?? ''),
          label: labelText || String(p.value ?? ''),
          disabled: !!p.disabled,
          group: currentGroup,
        });
      });
      currentGroup = null;
      return;
    }
    const p = child.props ?? {};
    if (p.value === undefined && child.type !== 'option') return;
    const labelText = typeof p.children === 'string'
      ? p.children
      : Children.toArray(p.children).join('');
    parsed.push({
      value: String(p.value ?? ''),
      label: labelText || String(p.value ?? ''),
      disabled: !!p.disabled,
      group: null,
    });
  });
  return parsed;
}

function computeDropdownRect(anchorEl) {
  if (!anchorEl) return null;
  const rect = anchorEl.getBoundingClientRect();
  const gap = 8;
  const preferred = 280;
  const vh = window.innerHeight;
  const visibleTop = Math.min(Math.max(rect.top, 0), vh);
  const visibleBottom = Math.min(Math.max(rect.bottom, 0), vh);
  const spaceBelow = Math.max(0, vh - visibleBottom - gap);
  const spaceAbove = Math.max(0, visibleTop - gap);
  const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
  const available = Math.max(0, (openUp ? spaceAbove : spaceBelow) - 4);
  const maxHeight = Math.min(preferred, available || Math.min(preferred, vh - gap * 2));

  if (openUp) {
    const anchor = Math.min(rect.top, vh - gap);
    return {
      top: undefined,
      bottom: Math.max(gap, vh - anchor + 4),
      left: rect.left,
      width: Math.max(rect.width, 120),
      maxHeight: Math.min(maxHeight, Math.max(0, anchor - gap - 4)),
    };
  }

  const top = Math.min(Math.max(rect.bottom + 4, gap), vh - gap - 48);
  return {
    top,
    bottom: undefined,
    left: rect.left,
    width: Math.max(rect.width, 120),
    maxHeight: Math.min(maxHeight, Math.max(48, vh - gap - top)),
  };
}

function SelectChevron({ color = 'var(--t4)' }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function SelectListbox({
  listRef,
  dropdownRect,
  options,
  value,
  cursor,
  setCursor,
  onPick,
  emptyLabel = 'No options available',
  fontSize = 13,
}) {
  let lastGroup = null;
  return (
    <div
      ref={listRef}
      role="listbox"
      style={{
        position: 'fixed',
        top: dropdownRect.top,
        bottom: dropdownRect.bottom,
        left: dropdownRect.left,
        width: dropdownRect.width,
        zIndex: 1000,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        maxHeight: dropdownRect.maxHeight,
        overflowY: 'auto',
      }}
    >
      {!options.length ? (
        <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--t4)' }}>{emptyLabel}</div>
      ) : options.map((opt, i) => {
        const showGroup = opt.group && opt.group !== lastGroup;
        if (opt.group) lastGroup = opt.group;
        const active = i === cursor;
        const isSelected = opt.value === value;
        return (
          <React.Fragment key={`${opt.value}-${i}`}>
            {showGroup && (
              <div
                style={{
                  padding: '8px 12px 4px',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'var(--t4)',
                  background: 'var(--card)',
                }}
              >
                {opt.group}
              </div>
            )}
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={opt.disabled}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setCursor(i)}
              onClick={() => onPick(opt)}
              style={{
                width: '100%', textAlign: 'left', border: 'none',
                padding: '8px 12px', fontSize, fontFamily: 'inherit',
                cursor: opt.disabled ? 'not-allowed' : 'pointer',
                background: active
                  ? 'color-mix(in srgb, var(--navy) 8%, transparent)'
                  : isSelected
                    ? 'color-mix(in srgb, var(--navy) 6%, transparent)'
                    : 'var(--card)',
                color: opt.disabled ? 'var(--t4)' : isSelected ? 'var(--navy)' : 'var(--t1)',
                fontWeight: isSelected ? 600 : 400,
                borderBottom: i < options.length - 1 ? '1px solid var(--border)' : 'none',
                borderLeft: isSelected ? '2px solid var(--navy)' : 'none',
                opacity: opt.disabled ? 0.5 : 1,
                transition: 'background 0.1s',
              }}
            >
              {opt.label}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function Select({ label, error, hint, children, options: optionsProp, placeholder, initialLimit, ...props }) {
  const options = useMemo(
    () => parseSelectOptions(children, optionsProp),
    [children, optionsProp],
  );

  const emptyOption = options.find((o) => o.value === '');
  const resolvedPlaceholder = placeholder ?? (emptyOption?.label || 'Type to search…');

  return (
    <Field label={label} error={error} hint={hint}>
      <SearchableSelect
        options={options}
        placeholder={resolvedPlaceholder}
        initialLimit={initialLimit}
        error={error}
        {...props}
      />
    </Field>
  );
}

function SearchableSelect({
  options,
  value,
  onChange,
  onBlur,
  onFocus,
  disabled,
  readOnly,
  placeholder = 'Type to search…',
  initialLimit,
  error,
  style,
  name,
  id,
}) {
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [dropdownRect, setDropdownRect] = useState(null);

  const locked = disabled || readOnly;
  const stringValue = String(value ?? '');

  const selected = useMemo(
    () => (stringValue !== '' ? options.find((o) => o.value === stringValue) : null),
    [options, stringValue],
  );

  const hasSelection = stringValue !== '' && !!selected;

  const selectableOptions = useMemo(
    () => options.filter((o) => o.value !== ''),
    [options],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q && !hasSelection) {
      return selectableOptions.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.value.toLowerCase().includes(q),
      );
    }
    if (initialLimit) return selectableOptions.slice(0, initialLimit);
    return selectableOptions;
  }, [selectableOptions, query, initialLimit, hasSelection]);

  const updateDropdownRect = useCallback(() => {
    setDropdownRect(computeDropdownRect(inputRef.current));
  }, []);

  const scrolledForOpen = useRef(false);

  useLayoutEffect(() => {
    if (!open) {
      scrolledForOpen.current = false;
      setDropdownRect(null);
      return;
    }
    updateDropdownRect();
    window.addEventListener('resize', updateDropdownRect);
    window.addEventListener('scroll', updateDropdownRect, true);
    return () => {
      window.removeEventListener('resize', updateDropdownRect);
      window.removeEventListener('scroll', updateDropdownRect, true);
    };
  }, [open, updateDropdownRect, filtered.length]);

  useLayoutEffect(() => {
    if (!open) return;
    if (scrolledForOpen.current || !listRef.current) return;
    const selectedEl = listRef.current.querySelector('[aria-selected="true"]');
    if (selectedEl) {
      const list = listRef.current;
      const top = selectedEl.offsetTop;
      const bottom = top + selectedEl.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    }
    scrolledForOpen.current = true;
  }, [open, dropdownRect]);

  useEffect(() => {
    const close = (e) => {
      const inWrap = wrapRef.current?.contains(e.target);
      const inList = listRef.current?.contains(e.target);
      if (!inWrap && !inList) {
        setOpen(false);
        setQuery('');
        setCursor(-1);
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const fireChange = (val) => {
    onChange?.({ target: { value: val, name } });
  };

  const pick = (opt) => {
    if (!opt || opt.disabled) return;
    fireChange(opt.value);
    setOpen(false);
    setQuery('');
    setCursor(-1);
    setFocused(false);
  };

  const openList = () => {
    if (locked) return;
    setOpen(true);
    setQuery(hasSelection && selected ? selected.label : '');
    setCursor(-1);
  };

  const handleFocus = (e) => {
    if (locked) return;
    setFocused(true);
    setOpen(true);
    setQuery(hasSelection && selected ? selected.label : '');
    setCursor(-1);
    onFocus?.(e);
    e.target.style.borderColor = 'var(--navy)';
    e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--navy) 10%, transparent)';
  };

  const handleBlur = (e) => {
    onBlur?.(e);
    e.target.style.borderColor = error ? 'var(--red-bd)' : 'var(--border)';
    e.target.style.boxShadow = 'none';
  };

  const handleKeyDown = (e) => {
    if (locked) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openList();
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && cursor >= 0 && filtered[cursor]) pick(filtered[cursor]);
      else if (open && filtered.length === 1) pick(filtered[0]);
      else if (!open) openList();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      setCursor(-1);
      inputRef.current?.blur();
    }
  };

  const inputValue = open || focused ? query : (hasSelection ? selected.label : '');
  const showMuted = !open && !focused && !hasSelection;

  const dropdown = open && !locked && dropdownRect ? (
    <SelectListbox
      listRef={listRef}
      dropdownRect={dropdownRect}
      options={filtered}
      value={stringValue}
      cursor={cursor}
      setCursor={setCursor}
      onPick={pick}
      emptyLabel={query.trim() ? 'No matches' : 'No options available'}
    />
  ) : null;

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        value={inputValue}
        readOnly={locked}
        disabled={disabled}
        placeholder={showMuted ? placeholder : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setCursor(-1);
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onClick={() => { if (!locked) openList(); }}
        style={{
          ...inputBase(error),
          paddingRight: 30,
          color: showMuted ? 'var(--t4)' : 'var(--t1)',
          cursor: locked ? 'not-allowed' : 'text',
          opacity: disabled ? 0.6 : 1,
        }}
      />
      <SelectChevron />

      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}

/** Compact themed select (button trigger + portaled list). Drop-in for native <select>. */
export function MenuSelect({
  value,
  onChange,
  onBlur,
  options: optionsProp,
  children,
  disabled = false,
  readOnly = false,
  placeholder = 'Select…',
  tone = 'default',
  size = 'md',
  style,
  name,
  id,
  'aria-label': ariaLabel,
  className,
}) {
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [dropdownRect, setDropdownRect] = useState(null);

  const options = useMemo(
    () => parseSelectOptions(children, optionsProp),
    [children, optionsProp],
  );

  const locked = disabled || readOnly;
  const stringValue = String(value ?? '');
  const selected = useMemo(
    () => options.find((o) => o.value === stringValue),
    [options, stringValue],
  );
  const displayLabel = selected?.label ?? (stringValue !== '' ? stringValue : placeholder);
  const isPlaceholder = !selected && stringValue === '';

  const updateDropdownRect = useCallback(() => {
    setDropdownRect(computeDropdownRect(triggerRef.current));
  }, []);

  const scrolledForOpen = useRef(false);

  useLayoutEffect(() => {
    if (!open) {
      scrolledForOpen.current = false;
      setDropdownRect(null);
      return;
    }
    updateDropdownRect();
    window.addEventListener('resize', updateDropdownRect);
    window.addEventListener('scroll', updateDropdownRect, true);
    return () => {
      window.removeEventListener('resize', updateDropdownRect);
      window.removeEventListener('scroll', updateDropdownRect, true);
    };
  }, [open, updateDropdownRect, options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    if (scrolledForOpen.current || !listRef.current) return;
    const selectedEl = listRef.current.querySelector('[aria-selected="true"]');
    if (selectedEl) {
      const list = listRef.current;
      const top = selectedEl.offsetTop;
      const bottom = top + selectedEl.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    }
    scrolledForOpen.current = true;
  }, [open, dropdownRect]);

  useEffect(() => {
    const close = (e) => {
      const inWrap = wrapRef.current?.contains(e.target);
      const inList = listRef.current?.contains(e.target);
      if (!inWrap && !inList) {
        setOpen(false);
        setCursor(-1);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (opt) => {
    if (!opt || opt.disabled) return;
    onChange?.({ target: { value: opt.value, name } });
    setOpen(false);
    setCursor(-1);
  };

  const toggle = () => {
    if (locked) return;
    setOpen((o) => !o);
    setCursor(-1);
  };

  const handleKeyDown = (e) => {
    if (locked) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setCursor((c) => Math.min(c + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open && cursor >= 0 && options[cursor]) pick(options[cursor]);
      else if (!open) setOpen(true);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setCursor(-1);
    }
  };

  const isNav = tone === 'nav';
  const isSm = size === 'sm';
  const fontSize = isSm ? 12 : 13;
  const {
    width: styleWidth,
    maxWidth: styleMaxWidth,
    minWidth: styleMinWidth,
    flexShrink: styleFlexShrink,
    alignSelf: styleAlignSelf,
    ...triggerExtras
  } = style || {};

  const triggerStyle = isNav
    ? {
        width: '100%',
        height: 36,
        padding: '0 28px 0 10px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.18)',
        background: 'rgba(0,0,0,0.28)',
        color: isPlaceholder ? 'rgba(255,255,255,0.55)' : '#fff',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: locked ? 'not-allowed' : 'pointer',
        outline: 'none',
        textAlign: 'left',
        opacity: disabled ? 0.6 : 1,
        ...triggerExtras,
      }
    : {
        width: '100%',
        padding: isSm ? '2px 28px 2px 8px' : '9px 32px 9px 12px',
        fontSize,
        border: '1px solid var(--border)',
        borderRadius: isSm ? 6 : 8,
        background: 'var(--card)',
        color: isPlaceholder ? 'var(--t4)' : 'var(--t1)',
        outline: 'none',
        cursor: locked ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        opacity: disabled ? 0.6 : 1,
        ...triggerExtras,
      };

  const dropdown = open && !locked && dropdownRect ? (
    <SelectListbox
      listRef={listRef}
      dropdownRect={dropdownRect}
      options={options}
      value={stringValue}
      cursor={cursor}
      setCursor={setCursor}
      onPick={pick}
      fontSize={fontSize}
    />
  ) : null;

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{
        position: 'relative',
        display: 'inline-block',
        minWidth: styleMinWidth ?? 0,
        maxWidth: styleMaxWidth ?? '100%',
        width: styleWidth ?? (isNav ? undefined : '100%'),
        flexShrink: styleFlexShrink,
        alignSelf: styleAlignSelf,
      }}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggle}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        style={triggerStyle}
      >
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayLabel}
        </span>
      </button>
      <SelectChevron color={isNav ? 'rgba(255,255,255,0.85)' : 'var(--t4)'} />
      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
export function Textarea({ label, error, hint, ...props }) {
  return (
    <Field label={label} error={error} hint={hint}>
      <textarea
        {...props}
        style={{ ...inputBase(error), minHeight: 88, resize: 'vertical' }}
        onFocus={e => { e.target.style.borderColor = 'var(--navy)'; e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--navy) 10%, transparent)'; }}
        onBlur={e  => { e.target.style.borderColor = error ? 'var(--red-bd)' : 'var(--border)'; e.target.style.boxShadow = 'none'; }}
      />
    </Field>
  );
}

export function Switch({ label, hint, checked, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
      <div>
        {label && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{label}</div>}
        {hint && <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange?.(!checked)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
          background: checked ? 'var(--navy)' : 'var(--border-md)',
          position: 'relative', transition: 'background 0.2s', flexShrink: 0, opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: checked ? 23 : 3, width: 18, height: 18,
          borderRadius: '50%', background: checked ? '#FFFFFF' : '#9CA3AF', transition: 'left 0.2s',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        }} />
      </button>
    </div>
  );
}

/** Themed checkbox using tenant --navy / --border tokens. */
export function Checkbox({
  label,
  checked = false,
  onChange,
  disabled = false,
  id,
  style,
  ...props
}) {
  const inputId = id || (label ? `cb-${String(label).toLowerCase().replace(/\s+/g, '-')}` : undefined);
  return (
    <label
      htmlFor={inputId}
      style={{
        display: 'inline-flex',
        alignItems: 'flex-start',
        gap: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        userSelect: 'none',
        ...style,
      }}
    >
      <span style={{ position: 'relative', width: 16, height: 16, flexShrink: 0, marginTop: 1 }}>
        <input
          id={inputId}
          type="checkbox"
          className="tenant-checkbox"
          checked={!!checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e)}
          {...props}
        />
      </span>
      {label && (
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', lineHeight: 1.35 }}>{label}</span>
      )}
    </label>
  );
}

/** Themed radio using tenant --navy / --border tokens. */
export function Radio({
  label,
  checked = false,
  onChange,
  disabled = false,
  name,
  value,
  id,
  style,
  ...props
}) {
  const inputId = id || (label ? `radio-${String(label).toLowerCase().replace(/\s+/g, '-')}` : undefined);
  return (
    <label
      htmlFor={inputId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        userSelect: 'none',
        ...style,
      }}
    >
      <input
        id={inputId}
        type="radio"
        className="tenant-radio"
        name={name}
        value={value}
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e)}
        {...props}
      />
      {label && (
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)' }}>{label}</span>
      )}
    </label>
  );
}

// ── Alert ─────────────────────────────────────────────────────────────────────
const AL = {
  error:   { bg: 'var(--red-bg)',   color: 'var(--red)',   border: 'var(--red-bd)',   accent: 'var(--red)'   },
  success: { bg: 'var(--green-bg)', color: 'var(--green)', border: 'var(--green-bd)', accent: 'var(--green)' },
  info:    { bg: 'var(--sky-bg)',   color: 'var(--sky)',   border: 'var(--sky-bd)',   accent: 'var(--sky)'   },
  warning: { bg: 'var(--amber-bg)', color: 'var(--amber)', border: 'var(--amber-bd)', accent: 'var(--amber)' },
};
export function Alert({ type = 'error', children }) {
  const a = AL[type] ?? AL.error;
  return (
    <div role="alert" style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '12px 16px', borderRadius: 10, marginBottom: 14,
      background: a.bg, color: a.color,
      border: `1px solid ${a.border}`,
      borderLeft: `3px solid ${a.accent}`,
      fontSize: 13,
    }}>{children}</div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, style = {}, noPad = false, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: noPad ? 0 : '20px 22px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.06)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
        ...style,
      }}
      onMouseEnter={e => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4),0 8px 32px rgba(0,0,0,0.25)';
        }
      }}
      onMouseLeave={e => {
        if (onClick) {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3),0 4px 16px rgba(0,0,0,0.15)';
        }
      }}
    >{children}</div>
  );
}
export function CardHeader({ title, children }) {
  return (
    <div className="card-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.1px' }}>{title}</h3>
      {children && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
const MW = { sm: 400, md: 540, lg: 720, xl: 920 };
export function Modal({ open = true, onClose, title, children, footer, size = 'md', maxWidth, style }) {
  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true"
        className="fade-up modal-panel"
        style={{
          background: 'var(--card)', borderRadius: 14,
          border: '1px solid var(--border)',
          width: '100%', maxWidth: maxWidth || (MW[size] ?? 540),
          maxHeight: '90svh', overflowY: 'auto',
          boxShadow: '0 4px 20px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.05)',
          display: 'flex', flexDirection: 'column',
          ...style,
        }}
      >
        {/* Mobile bottom-sheet drag indicator */}
        <div style={{ display: 'none', justifyContent: 'center', padding: '8px 0 2px' }} className="modal-drag-indicator">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-md)' }} />
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            width: 32, height: 32, cursor: 'pointer', color: 'var(--t3)',
            fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
            aria-label="Close dialog"
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = 'var(--red)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--t3)'; }}
          ><X size={14} strokeWidth={2.5} /></button>
        </div>
        <div style={{ padding: '18px 20px', flex: 1, overflowY: 'auto' }}>{children}</div>
        {footer && (
          <div style={{
            padding: '12px 20px',
            paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
            borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'flex-end', gap: 8,
            background: 'var(--bg)', flexWrap: 'wrap',
          }}>{footer}</div>
        )}
      </div>
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────
export function Table({ headers, children, loading, skeletonRows = 5 }) {
  return (
    <div className="table-responsive-container" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
        <thead>
          <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
            {headers.map(h => (
              <th key={h} style={{
                padding: '10px 14px', textAlign: 'left', background: 'transparent',
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.8px', color: 'var(--t4)', whiteSpace: 'nowrap',
                borderBottom: '1px solid var(--border)',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, i) => <SkeletonRow key={i} cols={headers.length} />)
            : children}
        </tbody>
      </table>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs-scroll" style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20, gap: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      {tabs.map((t, idx) => {
        const val = t.id !== undefined ? t.id : t.value;
        const isSelected = active === val;
        return (
          <button
            key={val ?? idx}
            onClick={() => onChange(val)}
            style={{
              padding: '10px 16px', background: 'none', border: 'none',
              borderBottom: `2px solid ${isSelected ? 'var(--navy)' : 'transparent'}`,
              marginBottom: -1,
              color: isSelected ? 'var(--t1)' : 'var(--t4)',
              fontSize: 13, fontWeight: isSelected ? 700 : 500,
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
              transition: 'color 0.12s', flexShrink: 0,
            }}
            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.color = 'var(--t2)'; }}
            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.color = 'var(--t4)'; }}
          >{t.label}</button>
        );
      })}
    </div>
  );
}

// ── Filter Tabs ───────────────────────────────────────────────────────────────
export function FilterTabs({ options, active, onChange }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
      paddingBottom: 2, maxWidth: '100%',
    }}>
      {options.map((o, idx) => {
        const val = o.value !== undefined ? o.value : o.id;
        const isSelected = active === val;
        return (
          <button
            key={val ?? idx}
            onClick={() => onChange(val)}
            style={{
              padding: '6px 12px', borderRadius: 20,
              background: isSelected ? 'var(--navy)' : 'var(--card)',
              border: `1px solid ${isSelected ? 'var(--navy)' : 'var(--border)'}`,
              color: isSelected ? '#fff' : 'var(--t2)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 0.12s',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
            onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.borderColor = 'var(--border-md)'; e.currentTarget.style.color = 'var(--t1)'; } }}
            onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t2)'; } }}
          >{o.label}</button>
        );
      })}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
const SC = {
  default: { accent: 'var(--border)',    val: 'var(--t1)' },
  brand:   { accent: 'var(--navy)',      val: 'var(--navy)' },
  blue:    { accent: 'var(--navy)',      val: 'var(--navy)' },
  success: { accent: 'var(--green)',     val: 'var(--green)' },
  warning: { accent: 'var(--amber)',     val: 'var(--amber)' },
  danger:  { accent: 'var(--red)',       val: 'var(--red)' },
  info:    { accent: 'var(--sky)',       val: 'var(--sky)' },
};
export function StatCard({ label, value, color = 'default', sub, onClick }) {
  const c = SC[color] ?? SC.default;
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        borderTop: `3px solid ${c.accent}`,
        padding: '14px 16px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4),0 8px 32px rgba(0,0,0,0.25)'; } }}
      onMouseLeave={e => { if (onClick) { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3),0 4px 16px rgba(0,0,0,0.15)'; } }}
    >
      <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--t4)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 'clamp(20px, 3.5vw, 26px)', fontWeight: 800, color: c.val, letterSpacing: '-0.5px', lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

// ── Page Header ───────────────────────────────────────────────────────────────
export function PageHeader({ title, children, walkthrough }) {
  return (
    <div style={{ padding: '0 0 4px 0' }} data-walkthrough={walkthrough || undefined}>
      <div className="wrap page-header-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48 }}>
        <h1 style={{ fontSize: 16, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.3px', flexShrink: 0 }}>{title}</h1>
        {children && <div className="page-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{children}</div>}
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon = Inbox, message = 'No data', sub }) {
  return (
    <div style={{ padding: '56px 24px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, opacity: 0.45, color: 'var(--icon, var(--navy))' }}>
        {typeof Icon === 'string' ? (
          <span style={{ fontSize: 40, lineHeight: 1 }}>{Icon}</span>
        ) : Icon ? (
          <Icon size={40} strokeWidth={1.5} aria-hidden="true" />
        ) : null}
      </div>
      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>{message}</p>
      {sub && <p style={{ fontSize: 13, color: 'var(--t4)' }}>{sub}</p>}
    </div>
  );
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = false, loading = false }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <Btn variant="ghost" size="sm" onClick={onClose} disabled={loading}>Cancel</Btn>
        <Btn variant={danger ? 'danger' : 'primary'} size="sm" onClick={onConfirm} disabled={loading}>
          {loading ? <Spinner size="sm" /> : confirmLabel}
        </Btn>
      </>}
    >
      <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6 }}>{message}</p>
    </Modal>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────
const AV = { sm: [28, 10], md: [36, 12], lg: [48, 16], xl: [64, 22], profile: [150, 40] };
export function Avatar({ name = '', size = 'md', photo = null, style: ex = {} }) {
  const [sz, fs] = AV[size] ?? AV.md;
  const ini = name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!photo) { setSrc(null); return; }
    let cancelled = false;
    let blobUrl = null;
    fetchProtectedUploadBlobUrl(photo)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        blobUrl = url;
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [photo]);

  return (
    <div style={{
      width: sz, height: sz, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, var(--navy), var(--navy-2))', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: fs, fontWeight: 700, letterSpacing: '0.5px',
      overflow: 'hidden', position: 'relative',
      boxShadow: '0 2px 8px color-mix(in srgb, var(--navy) 20%, transparent)',
      ...ex,
    }}>
      {src ? (
        <img
          src={src}
          alt={name || 'Profile'}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => setSrc(null)}
        />
      ) : ini}
    </div>
  );
}

// ── Page Size Filter Helper (Pure testable logic) ─────────────────────────────
export function parsePageSizeOptionValue(val, currentSize = 10, currentOrder = 'first') {
  if (!val) {
    return { size: currentSize, order: currentOrder, isCustomPrompt: false };
  }
  const strVal = String(val).trim().toLowerCase();
  if (strVal === 'custom' || strVal === 'custom_prompt') {
    return { size: currentSize, order: currentOrder, isCustomPrompt: true };
  }
  if (strVal.startsWith('custom_prompt:') || strVal.startsWith('custom_prompt_')) {
    const sep = strVal.includes(':') ? ':' : '_';
    const targetOrder = strVal.split(sep)[1] === 'last' ? 'last' : 'first';
    return { size: currentSize, order: targetOrder, isCustomPrompt: true };
  }
  if (strVal.startsWith('custom:') || strVal.startsWith('custom_')) {
    const sep = strVal.includes(':') ? ':' : '_';
    const targetOrder = strVal.split(sep)[1] === 'last' ? 'last' : 'first';
    return { size: currentSize, order: targetOrder, isCustomPrompt: true };
  }
  let orderPart = currentOrder;
  let sizePart = strVal;
  if (strVal.includes(':')) {
    [orderPart, sizePart] = strVal.split(':');
  } else if (strVal.includes('_')) {
    [orderPart, sizePart] = strVal.split('_');
  }
  const size = parseInt(sizePart, 10);
  return {
    size: Number.isFinite(size) && size > 0 ? size : currentSize,
    order: (orderPart === 'last' || orderPart === 'desc') ? 'last' : 'first',
    isCustomPrompt: false,
  };
}

// ── Page Size Filter / Templates ──────────────────────────────────────────────
export function PageSizeFilter({
  pageSize = 10,
  order = 'first',
  onChange,
  onPageSizeChange,
  options = [10, 20, 30, 50],
  pageSizeOptions,
  label = 'Show:',
  showOrderOptions = true,
}) {
  const opts = (pageSizeOptions && pageSizeOptions.length)
    ? pageSizeOptions
    : (options && options.length ? options : [10, 20, 30, 50]);

  const currentSize = Number(pageSize) || 10;
  const currentOrder = (order === 'last' || order === 'desc') ? 'last' : 'first';
  const isCustom = !opts.includes(currentSize);

  // Normalize legacy default label "Show first:" if callers or legacy usage passed it
  const resolvedLabel = (label === 'Show first:' && showOrderOptions) ? 'Show:' : label;

  const selectValue = !showOrderOptions
    ? (isCustom ? 'custom' : currentSize)
    : (isCustom ? `custom:${currentOrder}` : `${currentOrder}:${currentSize}`);

  const triggerChange = (newSize, newOrder) => {
    const meta = { pageSize: newSize, order: newOrder };
    if (typeof onChange === 'function') {
      onChange(newSize, newOrder, meta);
    }
    if (typeof onPageSizeChange === 'function' && onPageSizeChange !== onChange) {
      onPageSizeChange(newSize, newOrder, meta);
    }
  };

  const handleSelectChange = (e) => {
    const val = e.target.value;

    if (!showOrderOptions) {
      if (val === 'custom' || val === 'custom_prompt') {
        const input = typeof window !== 'undefined' && window.prompt
          ? window.prompt('Enter number of items per page (1–500):', String(currentSize))
          : null;
        if (input !== null) {
          const parsed = parseInt(input, 10);
          if (Number.isFinite(parsed) && parsed >= 0) {
            triggerChange(Math.min(500, Math.max(1, parsed)), currentOrder);
            return;
          }
        }
        if (e?.target) e.target.value = String(selectValue);
        return;
      }
      triggerChange(Number(val), currentOrder);
      return;
    }

    const parsed = parsePageSizeOptionValue(val, currentSize, currentOrder);
    if (parsed.isCustomPrompt) {
      const promptText = `Enter number of ${parsed.order} items to show (1–500):`;
      const input = typeof window !== 'undefined' && window.prompt
        ? window.prompt(promptText, String(currentSize))
        : null;
      if (input !== null) {
        const parsedNum = parseInt(input, 10);
        if (Number.isFinite(parsedNum) && parsedNum >= 0) {
          const clamped = Math.min(500, Math.max(1, parsedNum));
          triggerChange(clamped, parsed.order);
          return;
        }
      }
      if (e?.target) e.target.value = String(selectValue);
      return;
    }

    triggerChange(parsed.size, parsed.order);
  };

  return (
    <div
      className="page-size-filter"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: 'var(--t3)',
      }}
    >
      {resolvedLabel && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--t3)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {resolvedLabel}
        </span>
      )}
      <MenuSelect
        className="page-size-menu"
        size="sm"
        aria-label={resolvedLabel || 'Page size'}
        value={String(selectValue)}
        onChange={handleSelectChange}
        style={{ width: 'auto', minWidth: 88 }}
        options={
          showOrderOptions
            ? [
                ...opts.map((n) => ({ value: `first:${n}`, label: `First ${n}`, group: 'First' })),
                ...(isCustom && currentOrder === 'first'
                  ? [{ value: 'custom:first', label: `First ${currentSize} (Custom)`, group: 'First' }]
                  : []),
                { value: 'custom_prompt:first', label: 'Custom First…', group: 'First' },
                ...opts.map((n) => ({ value: `last:${n}`, label: `Last ${n}`, group: 'Last' })),
                ...(isCustom && currentOrder === 'last'
                  ? [{ value: 'custom:last', label: `Last ${currentSize} (Custom)`, group: 'Last' }]
                  : []),
                { value: 'custom_prompt:last', label: 'Custom Last…', group: 'Last' },
              ]
            : [
                ...opts.map((n) => ({ value: String(n), label: String(n) })),
                ...(isCustom ? [{ value: 'custom', label: `Custom (${currentSize})` }] : []),
                { value: 'custom_prompt', label: 'Custom…' },
              ]
        }
      />
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  pageSizeOptions = [10, 20, 30, 50],
  onPageChange,
  onPageSizeChange,
}) {
  if (!total || total < 1) return null;

  const pages = Math.max(1, totalPages || 1);
  const size = pageSize || 10;
  const start = ((page - 1) * size) + 1;
  const end = Math.min(page * size, total);

  return (
    <div className="pagination-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--t4)' }}>{start}–{end} of {total}</span>
        {onPageSizeChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t3)' }}>
            <span style={{ color: 'var(--t4)' }}>·</span>
            <span>Per page:</span>
            <MenuSelect
              className="pagination-page-size"
              size="sm"
              aria-label="Items per page"
              value={pageSizeOptions.includes(Number(size)) ? String(size) : 'custom'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'custom') {
                  const input = typeof window !== 'undefined' && window.prompt
                    ? window.prompt('Enter number of items per page (1–500):', String(size))
                    : null;
                  if (input !== null) {
                    const parsed = parseInt(input, 10);
                    if (Number.isFinite(parsed) && parsed >= 0) {
                      onPageSizeChange(Math.min(500, Math.max(1, parsed)));
                    }
                  }
                } else {
                  onPageSizeChange(Number(val));
                }
              }}
              style={{ width: 'auto', minWidth: 64 }}
              options={[
                ...pageSizeOptions.map((opt) => ({ value: String(opt), label: String(opt) })),
                {
                  value: 'custom',
                  label: pageSizeOptions.includes(Number(size)) ? 'Custom…' : `Custom (${size})`,
                },
              ]}
            />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Btn variant="outline" size="xs" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>← Prev</Btn>
        <span style={{ fontSize: 12, color: 'var(--t3)', padding: '0 8px' }}>{page} / {pages}</span>
        <Btn variant="outline" size="xs" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>Next →</Btn>
      </div>
    </div>
  );
}

// ── Search Input ──────────────────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder = 'Search…', width = 220 }) {
  return (
    <div className="search-input-wrap" style={{ position: 'relative', width, maxWidth: '100%' }}>
      <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--t4)', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input
        type="search" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 9, paddingBottom: 9,
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
          fontSize: 13, color: 'var(--t1)', outline: 'none', fontFamily: 'inherit',
          transition: 'border-color 0.12s, box-shadow 0.12s',
        }}
        onFocus={e => { e.target.style.borderColor = 'var(--navy)'; e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--navy) 10%, transparent)'; }}
        onBlur={e  => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
      />
    </div>
  );
}

// ── Info Row ──────────────────────────────────────────────────────────────────
export function InfoRow({ label, value }) {
  return (
    <div className="info-row" style={{
      display: 'grid', gridTemplateColumns: '160px 1fr',
      padding: '10px 0', borderBottom: '1px solid var(--border)', gap: 16, alignItems: 'start',
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t4)', paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--t1)' }}>{value ?? '—'}</span>
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export const CAIRO_ZONE = 'Africa/Cairo';

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    timeZone: CAIRO_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    timeZone: CAIRO_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function fmtTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-US', {
    timeZone: CAIRO_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function fmtTimeWithSeconds(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-US', {
    timeZone: CAIRO_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function initials(name = '') {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

export { formatSystemId } from '../lib/systemId';

export function toLocalDateString(value = new Date()) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: CAIRO_ZONE }).format(d);
  } catch {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

export function parseDateBoundary(dateStr, isEnd = false) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) {
    const fallback = new Date(dateStr);
    return isNaN(fallback.getTime()) ? null : fallback;
  }
  return isEnd ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
}
