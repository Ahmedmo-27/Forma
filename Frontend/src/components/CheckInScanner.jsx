import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Spinner, Badge, Avatar } from './ui';
import { parseScannedIdentifier } from '../lib/scannerParser';
import { formatSystemId } from '../lib/systemId';

function playBeep(type = 'success') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880.00, now + 0.1); // A5
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now); // A3
      osc.frequency.setValueAtTime(164.81, now + 0.12); // E3
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    }
  } catch {
    // Ignore audio restriction errors
  }
}

export default function CheckInScanner({
  onScan,
  autoStart = false,
  lastScannedResult = null,
  embedded = true,
}) {
  const containerId = useRef(`checkin-scanner-${Math.random().toString(36).substring(2, 9)}`).current;
  const scannerRef = useRef(null);
  const lastCodeRef = useRef({ code: '', time: 0 });

  const [isScanning, setIsScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [error, setError] = useState('');
  const [scanMode, setScanMode] = useState('auto'); // 'auto' | 'systemId' | 'memberId'
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualLoading, setManualLoading] = useState(false);

  // Stop scanner safely
  const stopScanner = useCallback(async () => {
    const sc = scannerRef.current;
    if (sc) {
      try {
        if (sc.isScanning) {
          await sc.stop();
        }
      } catch (err) {
        console.warn('Failed stopping scanner:', err);
      }
      try {
        sc.clear();
      } catch {
        // ignore
      }
    }
    setIsScanning(false);
    setStarting(false);
  }, []);

  // Handle a detected scan
  const handleDecoded = useCallback(async (rawText) => {
    const raw = String(rawText || '').trim();
    if (!raw) return;

    const now = Date.now();
    // 3 second anti-duplicate spam cooldown for the identical string
    if (lastCodeRef.current.code === raw && (now - lastCodeRef.current.time) < 3000) {
      return;
    }
    lastCodeRef.current = { code: raw, time: now };

    const identifier = parseScannedIdentifier(raw, scanMode);
    if (!identifier) return;

    // Visual pulse & audio chime
    setFlashSuccess(true);
    setTimeout(() => setFlashSuccess(false), 900);
    playBeep('success');

    if (onScan) {
      try {
        await onScan(identifier, raw, scanMode);
      } catch {
        playBeep('error');
      }
    }
  }, [onScan, scanMode]);

  // Start the scanner
  const startScanner = useCallback(async (targetCameraId = selectedCamera) => {
    setError('');
    setStarting(true);

    const region = document.getElementById(containerId);
    if (!region) {
      setStarting(false);
      return;
    }

    try {
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
      }
    } catch {
      // ignore
    }

    try {
      const available = await Html5Qrcode.getCameras().catch(() => []);
      setCameras(available || []);

      let cameraConfig;
      if (targetCameraId) {
        cameraConfig = targetCameraId;
      } else if (available && available.length > 0) {
        const backCam = available.find(c => /back|rear|environment/i.test(c.label));
        cameraConfig = backCam ? backCam.id : available[0].id;
        setSelectedCamera(cameraConfig);
      } else {
        cameraConfig = { facingMode: 'environment' };
      }

      const scanner = new Html5Qrcode(containerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
        ],
        verbose: false,
      });
      scannerRef.current = scanner;

      await scanner.start(
        cameraConfig,
        {
          fps: 12,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(minEdge * 0.78);
            return {
              width: Math.max(200, Math.min(size, 340)),
              height: Math.max(200, Math.min(size, 340)),
            };
          },
        },
        (decodedText) => handleDecoded(decodedText),
        () => {
          // Frame rejected (no code in this frame) — ignore
        }
      );

      setIsScanning(true);
    } catch (err) {
      console.warn('Failed to start camera scanner:', err);
      setError('Unable to access camera. Check browser camera permissions or choose another camera device.');
      setIsScanning(false);
    } finally {
      setStarting(false);
    }
  }, [containerId, handleDecoded, selectedCamera]);

  // Clean up on unmount
  useEffect(() => {
    if (autoStart) {
      startScanner();
    }
    return () => {
      stopScanner();
    };
  }, [autoStart, startScanner, stopScanner]);

  const handleCameraChange = async (e) => {
    const newId = e.target.value;
    setSelectedCamera(newId);
    if (isScanning) {
      await stopScanner();
      startScanner(newId);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    const trimmed = manualCode.trim();
    if (!trimmed) return;
    setManualLoading(true);
    try {
      const identifier = parseScannedIdentifier(trimmed, scanMode);
      playBeep('success');
      if (onScan) {
        await onScan(identifier, trimmed, scanMode);
      }
      setManualCode('');
    } catch {
      playBeep('error');
    } finally {
      setManualLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Top Scanner Controls ─────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        paddingBottom: 10,
        borderBottom: '1px solid var(--border)',
      }}>
        {/* Mode Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t4)', textTransform: 'uppercase', marginRight: 4 }}>
            Scan As:
          </span>
          {[
            { id: 'auto', label: '⚡ Auto (All)' },
            { id: 'systemId', label: '🆔 System ID' },
            { id: 'memberId', label: '🎟️ Member ID' },
          ].map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setScanMode(m.id)}
              style={{
                padding: '4px 9px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                border: '1px solid',
                borderColor: scanMode === m.id ? '#44298C' : 'var(--border)',
                background: scanMode === m.id ? 'rgba(68,41,140,0.10)' : 'var(--bg)',
                color: scanMode === m.id ? '#44298C' : 'var(--t3)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Camera Selector & Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          {cameras.length > 1 && (
            <select
              value={selectedCamera}
              onChange={handleCameraChange}
              style={{
                fontSize: 11,
                padding: '5px 8px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--t2)',
                outline: 'none',
                maxWidth: 150,
              }}
            >
              {cameras.map((c, i) => (
                <option key={c.id || i} value={c.id}>
                  {c.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          )}

          {!isScanning ? (
            <button
              type="button"
              onClick={() => startScanner()}
              disabled={starting}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                background: 'linear-gradient(135deg,#16a34a,#22c55e)',
                color: '#fff',
                cursor: starting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 8px rgba(34,197,94,0.30)',
              }}
            >
              {starting ? <Spinner size="sm" /> : <>📷 Open Camera</>}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopScanner}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--red)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              ⏹ Stop Camera
            </button>
          )}
        </div>
      </div>

      {/* ── Error Banner ─────────────────────────────────────── */}
      {error && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: 'var(--red-bg)',
          border: '1px solid var(--red-bd)',
          color: 'var(--red)',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => startScanner()}
            style={{
              padding: '3px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 700,
              border: '1px solid var(--red-bd)',
              background: '#fff',
              color: 'var(--red)',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Viewport Area ────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        width: '100%',
        minHeight: isScanning ? 280 : 180,
        borderRadius: 14,
        overflow: 'hidden',
        background: '#0f172a',
        border: flashSuccess ? '2px solid #22c55e' : '2px solid var(--border)',
        boxShadow: flashSuccess ? '0 0 24px rgba(34,197,94,0.40)' : 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* Placeholder when camera is stopped */}
        {!isScanning && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '28px 20px',
            textAlign: 'center',
            color: '#94a3b8',
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              marginBottom: 12,
            }}>
              📷
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', marginBottom: 4 }}>
              Camera Scanner Ready
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', maxWidth: 320, lineHeight: 1.4, marginBottom: 14 }}>
              Click Open Camera to scan members or non-members with their QR code or barcode (System ID or Member ID).
            </div>
            <button
              type="button"
              onClick={() => startScanner()}
              disabled={starting}
              style={{
                padding: '9px 20px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg,#44298C,#5B38BA)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: starting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 14px rgba(68,41,140,0.40)',
              }}
            >
              {starting ? <><Spinner size="sm" /> Starting Camera…</> : <>▶ Open Camera Scanner</>}
            </button>
          </div>
        )}

        {/* Live scanner container rendered by html5-qrcode */}
        <div
          id={containerId}
          style={{
            width: '100%',
            height: '100%',
            display: isScanning ? 'block' : 'none',
          }}
        />

        {/* Viewfinder Target Guide Overlay when scanning */}
        {isScanning && (
          <div style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {/* Viewfinder box */}
            <div style={{
              width: 220,
              height: 220,
              position: 'relative',
              borderRadius: 16,
              boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.45)',
            }}>
              {/* Corner brackets */}
              <div style={{ position: 'absolute', top: 0, left: 0, width: 24, height: 24, borderTop: '3px solid #22c55e', borderLeft: '3px solid #22c55e', borderTopLeftRadius: 10 }} />
              <div style={{ position: 'absolute', top: 0, right: 0, width: 24, height: 24, borderTop: '3px solid #22c55e', borderRight: '3px solid #22c55e', borderTopRightRadius: 10 }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, width: 24, height: 24, borderBottom: '3px solid #22c55e', borderLeft: '3px solid #22c55e', borderBottomLeftRadius: 10 }} />
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderBottom: '3px solid #22c55e', borderRight: '3px solid #22c55e', borderBottomRightRadius: 10 }} />

              {/* Animated scan line */}
              <div style={{
                position: 'absolute',
                left: 6,
                right: 6,
                height: 2,
                background: 'linear-gradient(90deg, transparent, #22c55e, transparent)',
                boxShadow: '0 0 8px #22c55e',
                animation: 'scannerLaser 2s ease-in-out infinite alternate',
              }} />
            </div>

            {/* Live scanning pill */}
            <div style={{
              position: 'absolute',
              bottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(4px)',
              padding: '4px 12px',
              borderRadius: 20,
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
              Point at Member or Non-Member QR ({scanMode === 'auto' ? 'Auto ID' : scanMode === 'systemId' ? 'System ID' : 'Member ID'})
            </div>
          </div>
        )}
      </div>

      {/* ── Quick Manual Lookup within Scanner ───────────────── */}
      <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: 6 }}>
        <input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder={`Enter code manually (e.g. S100, M100, or ${scanMode === 'systemId' ? 'system ID' : 'member ID'})…`}
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: 12,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--bg)',
            color: 'var(--t1)',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={manualLoading || !manualCode.trim()}
          style={{
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 8,
            border: 'none',
            background: 'var(--bg)',
            color: 'var(--t1)',
            border: '1px solid var(--border)',
            cursor: manualLoading || !manualCode.trim() ? 'not-allowed' : 'pointer',
            opacity: !manualCode.trim() ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {manualLoading ? <Spinner size="sm" /> : 'Scan / Check In'}
        </button>
      </form>

      {/* ── Last Scanned Instant Confirmation Banner ─────────── */}
      {lastScannedResult && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 10,
          background: lastScannedResult.ok ? 'var(--green-bg)' : 'var(--red-bg)',
          border: `1px solid ${lastScannedResult.ok ? 'var(--green-bd)' : 'var(--red-bd)'}`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            fontSize: 20,
            lineHeight: 1,
          }}>
            {lastScannedResult.ok ? '✅' : '❌'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13,
              fontWeight: 700,
              color: lastScannedResult.ok ? 'var(--green)' : 'var(--red)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
            }}>
              <span>{lastScannedResult.name || lastScannedResult.identifier || 'Checked In'}</span>
              {lastScannedResult.status && (
                <Badge status={lastScannedResult.status === 'guest' ? 'guest' : lastScannedResult.status} />
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
              {lastScannedResult.msg || (lastScannedResult.ok ? 'Check-in recorded' : 'Check-in failed')}
              {lastScannedResult.systemId && ` · System ID: ${formatSystemId(lastScannedResult.systemId)}`}
              {lastScannedResult.memberId && ` · Member ID: ${lastScannedResult.memberId}`}
            </div>
          </div>
          {lastScannedResult.time && (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)' }}>
              {new Date(lastScannedResult.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      )}

      <style>{`
        @keyframes scannerLaser {
          0% { top: 10px; }
          100% { top: 200px; }
        }
      `}</style>
    </div>
  );
}
