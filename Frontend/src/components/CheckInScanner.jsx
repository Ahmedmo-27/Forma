import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Spinner, Badge } from './ui';
import { parseScannedIdentifier } from '../lib/scannerParser';
import { formatSystemId } from '../lib/systemId';
import { playCheckInSound } from '../lib/audioFeedback';

export default function CheckInScanner({
  onScan,
  autoStart = false,
  lastScannedResult = null,
  embedded = true,
  onClose = null,
}) {
  const containerId = useRef(`checkin-scanner-${Math.random().toString(36).substring(2, 9)}`).current;
  const scannerRef = useRef(null);
  const lastCodeRef = useRef({ code: '', time: 0 });

  const [isScanning, setIsScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [scanMode, setScanMode] = useState('auto'); // 'auto' | 'systemId' | 'memberId'
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' | 'user'
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
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  // Handle a detected scan — NEVER closes the camera automatically
  const handleDecoded = useCallback(async (rawText) => {
    const raw = String(rawText || '').trim();
    if (!raw) return;

    const now = Date.now();
    // 2.5s anti-duplicate spam cooldown for the identical string
    if (lastCodeRef.current.code === raw && (now - lastCodeRef.current.time) < 2500) {
      return;
    }
    lastCodeRef.current = { code: raw, time: now };

    const identifier = parseScannedIdentifier(raw, scanMode);
    if (!identifier) return;

    // Visual pulse & audio chime
    setFlashSuccess(true);
    setTimeout(() => setFlashSuccess(false), 900);
    playCheckInSound('success');

    if (onScan) {
      try {
        await onScan(identifier, raw, scanMode);
      } catch {
        playCheckInSound('error');
      }
    }
  }, [onScan, scanMode]);

  // Start the scanner — accessible by all camera types (laptop webcams, phone rear/front cameras, USB cams)
  const startScanner = useCallback(async (desiredFacing = facingMode) => {
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
      }
      scannerRef.current?.clear();
    } catch {
      // ignore
    }

    try {
      region.replaceChildren();

      if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        throw new Error('SECURE_CONTEXT_REQUIRED');
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('NO_MEDIA_DEVICES');
      }

      // 1. Detect all available camera devices
      const devices = await Html5Qrcode.getCameras().catch(() => []);

      // 2. Build prioritized candidate list for all camera types
      const candidates = [];

      if (devices && devices.length > 0) {
        if (desiredFacing === 'environment') {
          // On mobile: prioritize standard main rear camera (avoiding ultra-wide/telephoto/depth)
          const backCameras = devices.filter(d => /back|rear|environment/i.test(d.label));
          if (backCameras.length > 0) {
            const mainBack = backCameras.find(d => !/ultra|tele|depth|wide\s*camera/i.test(d.label)) || backCameras[0];
            candidates.push(mainBack.id);
          }
        } else {
          // If user requested front / laptop webcam
          const frontCameras = devices.filter(d => /front|user|facetime|integrated/i.test(d.label));
          if (frontCameras.length > 0) {
            candidates.push(frontCameras[0].id);
          }
        }

        // Add any remaining physical devices (laptop built-in camera, USB webcam, etc.)
        for (const d of devices) {
          if (!candidates.includes(d.id)) {
            candidates.push(d.id);
          }
        }
      }

      // Add generic WebRTC constraints as universal fallbacks
      candidates.push({ facingMode: desiredFacing });
      candidates.push({ facingMode: desiredFacing === 'environment' ? 'user' : 'environment' });

      const qrConfig = {
        fps: 10,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.max(150, Math.min(Math.floor(minEdge * 0.75), 280));
          return { width: size, height: size };
        },
      };

      // 3. Try each candidate in sequence until camera opens
      let success = false;
      let lastErr = null;

      for (const cam of candidates) {
        try {
          region.replaceChildren();
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
            cam,
            qrConfig,
            (decodedText) => handleDecoded(decodedText),
            () => {}
          );
          success = true;
          setFacingMode(desiredFacing);
          break;
        } catch (err) {
          lastErr = err;
          try {
            if (scannerRef.current?.isScanning) {
              await scannerRef.current.stop().catch(() => {});
            }
            scannerRef.current?.clear();
          } catch {}
        }
      }

      if (!success) {
        throw lastErr || new Error('CAMERA_START_FAILED');
      }

      setIsScanning(true);
    } catch (err) {
      console.error('Failed to start camera scanner:', err);
      if (err.message === 'SECURE_CONTEXT_REQUIRED') {
        setError('Camera requires a secure connection (HTTPS). Please open this app via HTTPS or localhost.');
      } else if (err.message === 'NO_MEDIA_DEVICES') {
        setError('Camera API is not supported in this browser. Please use Chrome or Safari.');
      } else if (err?.name === 'NotAllowedError' || /permission/i.test(err?.message || '')) {
        setError('Camera permission was denied. Please allow camera access in your browser address bar settings.');
      } else if (err?.name === 'NotFoundError') {
        setError('No camera detected on this device.');
      } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        setError('Camera is currently in use by another app. Please close other camera apps and retry.');
      } else {
        setError('Could not open camera. Please check camera permissions and tap retry.');
      }
      setIsScanning(false);
    } finally {
      setStarting(false);
    }
  }, [containerId, facingMode, handleDecoded]);

  // Flip camera between front (laptop/selfie) and rear (main camera)
  const handleFlipCamera = async () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    await stopScanner();
    await startScanner(nextFacing);
  };

  // Clean up on unmount
  useEffect(() => {
    if (autoStart) {
      startScanner();
    }
    return () => {
      stopScanner();
    };
  }, [autoStart, startScanner, stopScanner]);

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    const trimmed = manualCode.trim();
    if (!trimmed) return;
    setManualLoading(true);
    try {
      const identifier = parseScannedIdentifier(trimmed, scanMode);
      playCheckInSound('success');
      if (onScan) {
        await onScan(identifier, trimmed, scanMode);
      }
      setManualCode('');
    } catch {
      playCheckInSound('error');
    } finally {
      setManualLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Top Scanner Controls: Mode Selector & Open/Close ──── */}
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

        {/* Action Buttons: Open Camera vs Close Camera & Flip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          {isScanning && (
            <button
              type="button"
              onClick={handleFlipCamera}
              title="Switch between front and back camera"
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--t2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              🔄 Flip Camera
            </button>
          )}

          {!isScanning ? (
            <button
              type="button"
              onClick={() => startScanner()}
              disabled={starting}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                fontSize: 13,
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
              {starting ? <><Spinner size="sm" /> Opening Camera…</> : <>📷 Open Camera</>}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopScanner}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                border: '1.5px solid var(--red)',
                background: 'var(--red-bg)',
                color: 'var(--red)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 8px rgba(239,68,68,0.15)',
              }}
            >
              ⏹ Close Camera
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
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              border: '1px solid var(--red-bd)',
              background: '#fff',
              color: 'var(--red)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
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
        minHeight: 280,
        borderRadius: 14,
        overflow: 'hidden',
        background: '#0f172a',
        border: flashSuccess ? '2px solid #22c55e' : '2px solid var(--border)',
        boxShadow: flashSuccess ? '0 0 24px rgba(34,197,94,0.40)' : 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}>
        {/*
          Live scanner DOM container rendered by html5-qrcode.
          Must ALWAYS be in the DOM with real dimensions so video calculations never fail.
        */}
        <div
          id={containerId}
          style={{
            width: '100%',
            minHeight: 280,
          }}
        />

        {/* Floating Close Button inside viewport when active */}
        {isScanning && (
          <button
            type="button"
            onClick={stopScanner}
            title="Close Camera"
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              zIndex: 30,
              background: 'rgba(0,0,0,0.72)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              backdropFilter: 'blur(6px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            ✕ Close Camera
          </button>
        )}

        {/* Placeholder overlay when camera is stopped */}
        {!isScanning && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            background: '#0f172a',
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
              QR Code Scanner Ready
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', maxWidth: 340, lineHeight: 1.4, marginBottom: 14 }}>
              Works with all cameras (laptop webcams, phone cameras, and USB cameras). The camera stays open so you can scan multiple codes continuously.
            </div>
            <button
              type="button"
              onClick={() => startScanner()}
              disabled={starting}
              style={{
                padding: '10px 24px',
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
              {starting ? <><Spinner size="sm" /> Opening Camera…</> : <>▶ Open Camera</>}
            </button>
          </div>
        )}

        {/* Viewfinder Target Guide Overlay when scanning */}
        {isScanning && (
          <div style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
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
              Camera Active · Stays Open For Multiple Scans
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
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--t1)',
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
        #${containerId} video {
          width: 100% !important;
          height: 100% !important;
          min-height: 280px !important;
          max-height: 380px !important;
          object-fit: cover !important;
          border-radius: 12px !important;
          display: block !important;
        }
        #${containerId} {
          border: none !important;
        }
        #${containerId} img[alt="Info icon"] {
          display: none !important;
        }
        @keyframes scannerLaser {
          0% { top: 10px; }
          100% { top: 200px; }
        }
      `}</style>
    </div>
  );
}
