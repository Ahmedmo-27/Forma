import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useWalkthrough } from '../../tutorials/walkthrough-context';

export default function WalkthroughOverlay() {
  const {
    isActive,
    activeScenario,
    currentStep,
    stepIndex,
    totalSteps,
    isLastStep,
    targetRect,
    isNavigating,
    nextStep,
    prevStep,
    skipTutorial,
  } = useWalkthrough();

  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  useEffect(() => {
    const onResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const hole = useMemo(() => {
    if (!targetRect) return null;
    const pad = 8;
    const left = Math.max(0, targetRect.left - pad);
    const top = Math.max(0, targetRect.top - pad);
    const width = Math.max(20, targetRect.width + pad * 2);
    const height = Math.max(20, targetRect.height + pad * 2);
    return { left, top, width, height, right: left + width, bottom: top + height };
  }, [targetRect]);

  const cardStyle = useMemo(() => {
    const isMobile = windowSize.width < 640;
    const cardWidth = isMobile ? windowSize.width - 24 : Math.min(420, windowSize.width - 32);
    const estimatedCardHeight = 230;

    if (isMobile) {
      const holeInBottomHalf = hole && hole.top > windowSize.height / 2;
      return {
        position: 'fixed',
        left: 12,
        right: 12,
        width: 'calc(100% - 24px)',
        zIndex: 10060,
        ...(holeInBottomHalf ? { top: 16 } : { bottom: 16 }),
      };
    }

    if (!hole) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: cardWidth,
        zIndex: 10060,
      };
    }

    let top = hole.bottom + 16;
    let left = hole.left;
    if (left + cardWidth > windowSize.width - 16) left = windowSize.width - cardWidth - 16;
    if (left < 16) left = 16;
    if (top + estimatedCardHeight > windowSize.height - 16) {
      if (hole.top - estimatedCardHeight - 16 > 16) {
        top = hole.top - estimatedCardHeight - 16;
      } else {
        top = Math.max(16, windowSize.height - estimatedCardHeight - 24);
      }
    }

    return {
      position: 'fixed',
      top: Math.max(16, Math.min(top, windowSize.height - estimatedCardHeight - 16)),
      left: Math.max(16, left),
      width: cardWidth,
      zIndex: 10060,
    };
  }, [hole, windowSize]);

  if (!isActive || !currentStep || !activeScenario) return null;

  const progress = totalSteps ? ((stepIndex + 1) / totalSteps) * 100 : 0;

  return (
    <div className="walkthrough-root" style={{ position: 'fixed', inset: 0, zIndex: 10050, overflow: 'hidden', pointerEvents: 'none' }}>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'auto' }}>
        <defs>
          <mask id="walkthrough-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {hole && (
              <rect x={hole.left} y={hole.top} width={hole.width} height={hole.height} rx="12" ry="12" fill="black" />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(12, 8, 24, 0.72)" mask="url(#walkthrough-spotlight-mask)" />
        {hole && (
          <rect
            x={hole.left}
            y={hole.top}
            width={hole.width}
            height={hole.height}
            rx="12"
            ry="12"
            fill="none"
            stroke="var(--navy, var(--navy))"
            strokeWidth="2.5"
            strokeDasharray="6 4"
          />
        )}
      </svg>

      <div
        style={{
          ...cardStyle,
          pointerEvents: 'auto',
          background: 'var(--card)',
          color: 'var(--t1)',
          border: '1px solid color-mix(in srgb, var(--navy, var(--navy)) 35%, var(--border))',
          borderRadius: 16,
          padding: '16px 16px 14px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--navy, var(--navy))',
              background: 'color-mix(in srgb, var(--navy, var(--navy)) 12%, transparent)',
              borderRadius: 999,
              padding: '3px 8px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 180,
            }}
            >
              {activeScenario.title}
            </span>
            <span style={{ fontSize: 11, color: 'var(--t4)', flexShrink: 0 }}>
              {stepIndex + 1} / {totalSteps}
            </span>
          </div>
          <button
            type="button"
            onClick={skipTutorial}
            aria-label="Exit tutorial"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--t3)',
              cursor: 'pointer',
              borderRadius: 8,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.2px' }}>
          {currentStep.title}
        </h3>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--t3)', margin: '0 0 12px' }}>
          {isNavigating ? 'Opening that page…' : currentStep.description}
        </p>

        <div style={{ height: 4, borderRadius: 99, background: 'var(--border)', overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ width: `${progress}%`, height: '100%', background: 'var(--navy, var(--navy))', transition: 'width 0.25s ease' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {stepIndex > 0 && (
              <button type="button" onClick={prevStep} style={ghostBtn}>
                <ChevronLeft size={16} /> Back
              </button>
            )}
            <button type="button" onClick={skipTutorial} style={ghostBtn}>Skip</button>
          </div>
          <button type="button" onClick={nextStep} style={primaryBtn}>
            {isLastStep ? (
              <>
                <Check size={16} /> Finish
              </>
            ) : (
              <>
                Next <ChevronRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const ghostBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  border: 'none',
  background: 'transparent',
  color: 'var(--t3)',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  padding: '6px 8px',
  borderRadius: 8,
};

const primaryBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  border: 'none',
  background: 'var(--navy, var(--navy))',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  padding: '8px 14px',
  borderRadius: 8,
};
