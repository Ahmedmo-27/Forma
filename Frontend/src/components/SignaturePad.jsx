import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useI18n } from '../i18n/useI18n';

const WIDTH = 600;
const HEIGHT = 200;

/**
 * Finger / stylus / mouse signature box. Exposes `clear()`, `isEmpty()` and
 * `toDataURL()` (a PNG cropped to the strokes) through the ref.
 */
const SignaturePad = forwardRef(function SignaturePad({ onChange, disabled = false }, ref) {
  const { t } = useI18n();
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const bounds = useRef(null);
  const [empty, setEmpty] = useState(true);

  const context = () => canvasRef.current?.getContext('2d');

  useEffect(() => {
    const ctx = context();
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
  }, []);

  const pointFrom = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  };

  const grow = (p) => {
    const b = bounds.current || { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
    bounds.current = {
      minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y),
      maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y),
    };
  };

  const start = (event) => {
    if (disabled) return;
    event.preventDefault();
    canvasRef.current.setPointerCapture?.(event.pointerId);
    drawing.current = true;
    const p = pointFrom(event);
    last.current = p;
    grow(p);
    const ctx = context();
    ctx.beginPath();
    ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  };

  const move = (event) => {
    if (!drawing.current || disabled) return;
    event.preventDefault();
    const p = pointFrom(event);
    const ctx = context();
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    grow(p);
    if (empty) {
      setEmpty(false);
      onChange?.(false);
    }
  };

  const end = () => {
    drawing.current = false;
    last.current = null;
  };

  const clear = useCallback(() => {
    context()?.clearRect(0, 0, WIDTH, HEIGHT);
    bounds.current = null;
    setEmpty(true);
    onChange?.(true);
  }, [onChange]);

  useImperativeHandle(ref, () => ({
    clear,
    isEmpty: () => empty,
    toDataURL: () => {
      const b = bounds.current;
      if (!b || empty) return null;
      const pad = 8;
      const x = Math.max(0, Math.floor(b.minX - pad));
      const y = Math.max(0, Math.floor(b.minY - pad));
      const w = Math.min(WIDTH, Math.ceil(b.maxX + pad)) - x;
      const h = Math.min(HEIGHT, Math.ceil(b.maxY + pad)) - y;
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      out.getContext('2d').drawImage(canvasRef.current, x, y, w, h, 0, 0, w, h);
      return out.toDataURL('image/png');
    },
  }), [clear, empty]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        dir="ltr"
        width={WIDTH}
        height={HEIGHT}
        aria-label={t('Signature area. Sign with your finger, stylus, or mouse.')}
        role="img"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        style={{
          width: '100%', aspectRatio: `${WIDTH} / ${HEIGHT}`, touchAction: 'none',
          background: '#fff', border: '1px dashed var(--border-strong, #9CA3AF)', borderRadius: 8,
          cursor: disabled ? 'not-allowed' : 'crosshair', display: 'block',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--t4)' }}>
        <span>{t('Sign inside the box')}</span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || empty}
          style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: empty ? 'default' : 'pointer', fontWeight: 600, fontSize: 11 }}
        >
          {t('Clear')}
        </button>
      </div>
    </div>
  );
});

export default SignaturePad;
