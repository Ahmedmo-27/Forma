import { useEffect, useMemo, useState } from 'react';
import { HelpCircle, Play, Search, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useWalkthrough } from '../../tutorials/walkthrough-context';
import { sectionsForUser } from '../../tutorials/tutorial-data';

export default function HelpScenariosDialog() {
  const { isHelpModalOpen, closeHelpModal, startTutorial } = useWalkthrough();
  if (!isHelpModalOpen) return null;
  return (
    <HelpDialog
      onClose={closeHelpModal}
      onStart={startTutorial}
    />
  );
}

function HelpDialog({ onClose, onStart }) {
  const { user } = useAuth();
  const { hasFeature } = useTenant();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sections = useMemo(() => {
    const base = sectionsForUser(user, hasFeature);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base
      .map((section) => ({
        ...section,
        scenarios: section.scenarios.filter((scenario) => {
          const haystack = [
            scenario.title,
            scenario.subtitle,
            ...(scenario.keywords || []),
            ...scenario.steps.flatMap((item) => [item.title, item.description]),
          ].join(' ').toLowerCase();
          return haystack.includes(q);
        }),
      }))
      .filter((section) => section.scenarios.length > 0);
  }, [user, hasFeature, query]);

  const total = sections.reduce((sum, section) => sum + section.scenarios.length, 0);

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10070,
        background: 'rgba(8, 6, 16, 0.62)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-dialog-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(880px, 100%)',
          height: 'min(760px, 92dvh)',
          background: 'var(--card)',
          color: 'var(--t1)',
          borderRadius: 16,
          border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'color-mix(in srgb, var(--navy, var(--navy)) 12%, transparent)',
                color: 'var(--navy, var(--navy))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              >
                <HelpCircle size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h2 id="guide-dialog-title" style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
                  Guides
                </h2>
                <p style={{ fontSize: 12, color: 'var(--t3)', margin: '4px 0 0' }}>
                  Walkthroughs for the pages {user?.role || 'your role'} can open.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close guides"
              style={{
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--t3)',
                borderRadius: 8,
                width: 32,
                height: 32,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ position: 'relative', marginTop: 14 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--t4)' }} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search guides, such as check-in, packages, or tasks"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 12px 9px 34px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--t1)',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 18px' }}>
          {sections.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 12px', color: 'var(--t3)' }}>
              <p style={{ fontWeight: 700, marginBottom: 4 }}>No guides match</p>
              <p style={{ fontSize: 12 }}>Try another word, or clear the search.</p>
            </div>
          ) : (
            sections.map((section) => (
              <section key={section.title} style={{ marginBottom: 18 }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: 6,
                  marginBottom: 8,
                }}
                >
                  <h3 style={{
                    margin: 0,
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--t4)',
                  }}
                  >
                    {section.title}
                  </h3>
                  <span style={{ fontSize: 11, color: 'var(--t4)' }}>{section.scenarios.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {section.scenarios.map((scenario) => (
                    <button
                      key={scenario.id}
                      type="button"
                      onClick={() => onStart(scenario.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        textAlign: 'left',
                        width: '100%',
                        padding: '12px 12px',
                        borderRadius: 12,
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{scenario.title}</span>
                          {scenario.badge && (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: 'var(--navy, var(--navy))',
                              background: 'color-mix(in srgb, var(--navy, var(--navy)) 10%, transparent)',
                              borderRadius: 99,
                              padding: '2px 7px',
                            }}
                            >
                              {scenario.badge}
                            </span>
                          )}
                        </span>
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--t3)', marginTop: 3, lineHeight: 1.4 }}>
                          {scenario.subtitle}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--t4)', marginTop: 4 }}>
                          {scenario.steps.length} steps
                        </span>
                      </span>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        flexShrink: 0,
                        background: 'var(--navy, var(--navy))',
                        color: '#fff',
                        borderRadius: 8,
                        padding: '7px 10px',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                      >
                        <Play size={12} fill="currentColor" /> Start
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '10px 18px',
          fontSize: 12,
          color: 'var(--t4)',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
        }}
        >
          <span>{total} {total === 1 ? 'guide' : 'guides'}</span>
          <span>Press Esc during a tour to leave it</span>
        </div>
      </div>
    </div>
  );
}
