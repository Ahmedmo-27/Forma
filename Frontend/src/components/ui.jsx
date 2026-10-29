// ─── Flame Factory UI — sharp, data-dense design system ────────────────────────

import { useState, useEffect, useLayoutEffect, useRef, useMemo, Children, useCallback } from 'react';
import { createPortal } from 'react-dom';
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

// ── Badge ─────────────────────────────────────────────────────────────────────
const BADGE_MAP = {
  active:   { bg: 'var(--green-bg)',  color: 'var(--green)',  border: 'var(--green-bd)',  dot: '#22c55e' },
  expired:  { bg: 'var(--red-bg)',    color: 'var(--red)',    border: 'var(--red-bd)',    dot: '#ef4444' },
  frozen:   { bg: 'var(--sky-bg)',    color: 'var(--sky)',    border: 'var(--sky-bd)',    dot: '#38bdf8' },
  guest:    { bg: 'var(--slate-bg)',  color: 'var(--slate)',  border: 'var(--slate-bd)', dot: '#A6A0C2' },
  blocked:  { bg: 'rgba(239,68,68,0.12)', color: '#f87171',  border: 'rgba(239,68,68,0.30)', dot: '#ef4444' },
  pending:  { bg: 'var(--amber-bg)', color: 'var(--amber)',  border: 'var(--amber-bd)', dot: '#f59e0b' },
  accepted: { bg: 'var(--green-bg)',  color: 'var(--green)',  border: 'var(--green-bd)',  dot: '#22c55e' },
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
    bg: 'linear-gradient(135deg,#44298C,#5B38BA)',
    color: '#fff',
    border: 'rgba(91,56,186,0.6)',
    hbg: 'linear-gradient(135deg,#5B38BA,#6D47CC)',
    shadow: '0 2px 12px rgba(68,41,140,0.35)',
    hShadow: '0 4px 18px rgba(68,41,140,0.5)',
  },
  blue: {
    bg: 'linear-gradient(135deg,#44298C,#5B38BA)',
    color: '#fff',
    border: '#44298C',
    hbg: 'linear-gradient(135deg,#5B38BA,#6D47CC)',
    shadow: '0 2px 12px rgba(68,41,140,0.30)',
    hShadow: '0 4px 18px rgba(68,41,140,0.45)',
  },
  outline: {
    bg: 'transparent',
    color: 'var(--t2)',
    border: 'var(--border-md)',
    hbg: 'rgba(68,41,140,0.06)',
    hborder: 'rgba(68,41,140,0.4)',
    hcolor: '#44298C',
    shadow: 'none',
    hShadow: 'none',
  },
  ghost: {
    bg: 'transparent',
    color: 'var(--t3)',
    border: 'transparent',
    hbg: 'rgba(68,41,140,0.06)',
    hcolor: 'var(--t1)',
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
          if (variant === 'outline') { e.currentTarget.style.borderColor = 'rgba(68,41,140,0.4)'; e.currentTarget.style.color = '#44298C'; }
          if (variant === 'ghost') { e.currentTarget.style.color = v.hcolor ?? v.color; }
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
        onFocus={e => { e.target.style.borderColor = 'var(--navy)'; e.target.style.boxShadow = '0 0 0 3px rgba(68,41,140,0.10)'; }}
        onBlur={e  => { e.target.style.borderColor = error ? 'var(--red-bd)' : 'var(--border)'; e.target.style.boxShadow = 'none'; }}
      />
    </Field>
  );
}
export function Select({ label, error, hint, children, options: optionsProp, placeholder, initialLimit, ...props }) {
  const options = useMemo(() => {
    if (optionsProp?.length) {
      return optionsProp.map((o) => ({
        value: String(o.value ?? ''),
        label: String(o.label ?? o.value ?? ''),
        disabled: !!o.disabled,
      }));
    }
    const parsed = [];
    Children.forEach(children, (child) => {
      if (!child || typeof child === 'string') return;
      const p = child.props ?? {};
      if (p.value === undefined && child.type !== 'option') return;
      const labelText = typeof p.children === 'string'
        ? p.children
        : Children.toArray(p.children).join('');
      parsed.push({
        value: String(p.value ?? ''),
        label: labelText || String(p.value ?? ''),
        disabled: !!p.disabled,
      });
    });
    return parsed;
  }, [children, optionsProp]);

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
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
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
    e.target.style.boxShadow = '0 0 0 3px rgba(68,41,140,0.10)';
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
    <div
      ref={listRef}
      role="listbox"
      style={{
        position: 'fixed',
        top: dropdownRect.top,
        left: dropdownRect.left,
        width: dropdownRect.width,
        zIndex: 1000,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        maxHeight: 240,
        overflowY: 'auto',
      }}
    >
      {!filtered.length ? (
        <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--t4)' }}>
          {query.trim() ? 'No matches' : 'No options available'}
        </div>
      ) : filtered.map((opt, i) => {
        const active = i === cursor;
        const isSelected = opt.value === stringValue;
        return (
          <button
            key={`${opt.value}-${i}`}
            type="button"
            role="option"
            aria-selected={isSelected}
            disabled={opt.disabled}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setCursor(i)}
            onClick={() => pick(opt)}
            style={{
              width: '100%', textAlign: 'left', border: 'none',
              padding: '8px 12px', fontSize: 13, fontFamily: 'inherit',
              cursor: opt.disabled ? 'not-allowed' : 'pointer',
              background: active ? 'rgba(68,41,140,0.08)' : isSelected ? 'rgba(68,41,140,0.06)' : 'var(--card)',
              color: opt.disabled ? 'var(--t4)' : isSelected ? 'var(--navy)' : 'var(--t1)',
              fontWeight: isSelected ? 600 : 400,
              borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
              borderLeft: isSelected ? '2px solid var(--navy)' : 'none',
              opacity: opt.disabled ? 0.5 : 1,
              transition: 'background 0.1s',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
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
      <svg
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t4)"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>

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
        onFocus={e => { e.target.style.borderColor = 'var(--navy)'; e.target.style.boxShadow = '0 0 0 3px rgba(68,41,140,0.10)'; }}
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
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)',
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
          width: '100%', maxWidth: MW[size] ?? 540,
          maxHeight: '90svh', overflowY: 'auto',
          boxShadow: '0 4px 20px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1,
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{title}</h2>
          <button onClick={onClose} style={{
          background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            width: 28, height: 28, cursor: 'pointer', color: 'var(--t3)',
            fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = 'var(--red)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--t3)'; }}
          >✕</button>
        </div>
        <div style={{ padding: '20px 22px' }}>{children}</div>
        {footer && (
          <div style={{
            padding: '14px 22px', borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'flex-end', gap: 8,
            background: 'var(--bg)',
          }}>{footer}</div>
        )}
      </div>
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────
export function Table({ headers, children, loading, skeletonRows = 5 }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
            {headers.map(h => (
              <th key={h} style={{
                padding: '11px 16px', textAlign: 'left', background: 'transparent',
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
    <div className="tabs-scroll" style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20, gap: 0, overflowX: 'auto' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          padding: '10px 18px', background: 'none', border: 'none',
          borderBottom: `2px solid ${active === t.id ? 'var(--navy)' : 'transparent'}`,
          marginBottom: -1,
          color: active === t.id ? 'var(--t1)' : 'var(--t4)',
          fontSize: 13, fontWeight: active === t.id ? 700 : 400,
          cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
          transition: 'color 0.12s',
        }}
          onMouseEnter={e => { if (active !== t.id) e.currentTarget.style.color = 'var(--t2)'; }}
          onMouseLeave={e => { if (active !== t.id) e.currentTarget.style.color = 'var(--t4)'; }}
        >{t.label}</button>
      ))}
    </div>
  );
}

// ── Filter Tabs ───────────────────────────────────────────────────────────────
export function FilterTabs({ options, active, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          padding: '5px 12px', borderRadius: 20,
          background: active === o.value ? '#44298C' : 'transparent',
          border: `1px solid ${active === o.value ? '#44298C' : 'var(--border)'}`,
          color: active === o.value ? '#fff' : 'var(--t3)',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'inherit', transition: 'all 0.12s',
        }}
          onMouseEnter={e => { if (active !== o.value) { e.currentTarget.style.borderColor = 'var(--border-md)'; e.currentTarget.style.color = 'var(--t2)'; } }}
          onMouseLeave={e => { if (active !== o.value) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t3)'; } }}
        >{o.label}</button>
      ))}
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
        padding: '18px 20px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4),0 8px 32px rgba(0,0,0,0.25)'; } }}
      onMouseLeave={e => { if (onClick) { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3),0 4px 16px rgba(0,0,0,0.15)'; } }}
    >
      <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--t4)', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 800, color: c.val, letterSpacing: '-0.5px', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 5 }}>{sub}</p>}
    </div>
  );
}

// ── Page Header ───────────────────────────────────────────────────────────────
export function PageHeader({ title, children }) {
  return (
    <div style={{ padding: '0 0 4px 0' }}>
      <div className="wrap page-header-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, height: 52 }}>
        <h1 style={{ fontSize: 16, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.3px', flexShrink: 0 }}>{title}</h1>
        {children && <div className="page-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{children}</div>}
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
export function EmptyState({ icon = '—', message = 'No data', sub }) {
  return (
    <div style={{ padding: '56px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 40, opacity: 0.2, marginBottom: 10 }}>{icon}</p>
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
      background: 'linear-gradient(135deg,#44298C,#5B38BA)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: fs, fontWeight: 700, letterSpacing: '0.5px',
      overflow: 'hidden', position: 'relative',
      boxShadow: '0 2px 8px rgba(68,41,140,0.20)',
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

// ── Pagination ────────────────────────────────────────────────────────────────
export function Pagination({ page, totalPages, total, pageSize, onPageChange }) {
  if (!total || total < 1) return null;

  const pages = Math.max(1, totalPages || 1);
  const size = pageSize || 20;
  const start = ((page - 1) * size) + 1;
  const end = Math.min(page * size, total);

  return (
    <div className="pagination-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--t4)' }}>{start}–{end} of {total}</span>
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
        onFocus={e => { e.target.style.borderColor = 'var(--navy)'; e.target.style.boxShadow = '0 0 0 3px rgba(68,41,140,0.10)'; }}
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
export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
export function initials(name = '') {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}
