import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Avatar, Btn, Modal, Spinner } from './ui';
import { deleteMemberPhoto, uploadMemberPhoto } from '../api/endpoints';

const CAN_UPLOAD = ['Accountant'];

function CameraIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export default function ProfilePhotoUpload({ member, user, onUploaded }) {
  const canUpload = CAN_UPLOAD.includes(user?.role);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [streamReady, setStreamReady] = useState(false);
  const [captured, setCaptured] = useState(null); // { blob, url }

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const captureRef = useRef(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStreamReady(false);
  }, []);

  const clearCaptured = useCallback(() => {
    setCaptured((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const closeModal = useCallback(() => {
    stopCamera();
    clearCaptured();
    setCameraError(null);
    setOpen(false);
  }, [stopCamera, clearCaptured]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setStreamReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera is not supported in this browser. Use “Choose file” instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreamReady(true);
      }
    } catch {
      setCameraError('Could not access the camera. Check permissions or choose a file instead.');
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    startCamera();
    return () => { stopCamera(); };
  }, [open, startCamera, stopCamera]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !streamReady) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error('Failed to capture photo.');
        return;
      }
      clearCaptured();
      const url = URL.createObjectURL(blob);
      setCaptured({ blob, url });
      stopCamera();
    }, 'image/jpeg', 0.9);
  };

  const uploadBlob = async (blob, filename = 'photo.jpg') => {
    const formData = new FormData();
    formData.append('photoFile', blob, filename);
    setUploading(true);
    try {
      await uploadMemberPhoto(member.systemId, formData);
      toast.success('Profile photo updated');
      closeModal();
      onUploaded?.();
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      e.target.value = '';
      return;
    }
    await uploadBlob(file, file.name || 'photo.jpg');
    e.target.value = '';
  };

  const handleRetake = () => {
    clearCaptured();
    startCamera();
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this profile picture?')) return;
    setDeleting(true);
    try {
      await deleteMemberPhoto(member.systemId);
      toast.success('Profile photo deleted');
      onUploaded?.();
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Could not delete profile photo');
    } finally {
      setDeleting(false);
    }
  };

  if (!canUpload) {
    return <Avatar name={member.name} size="profile" photo={member.photo} />;
  }

  const PHOTO_SIZE = 120;

  return (
    <>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={deleting}
          title={member.photo ? 'Change profile photo' : 'Click here to add a new profile picture'}
          aria-label={member.photo ? 'Change profile photo' : 'Click here to add a new profile picture'}
          style={{
            position: 'relative',
            padding: 0,
            border: 'none',
            background: 'none',
            cursor: deleting ? 'wait' : 'pointer',
            borderRadius: '50%',
            display: 'block',
          }}
        >
          {member.photo ? (
            <Avatar
              name={member.name}
              size="profile"
              photo={member.photo}
              style={{ opacity: deleting ? 0.55 : 1 }}
            />
          ) : (
            <div style={{
              width: PHOTO_SIZE,
              height: PHOTO_SIZE,
              borderRadius: '50%',
              border: '2px dashed var(--border-md)',
              background: 'var(--bg)',
              color: 'var(--t3)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 14,
              boxSizing: 'border-box',
              transition: 'border-color 0.12s, background 0.12s, color 0.12s',
            }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--navy)';
                e.currentTarget.style.background = 'var(--card)';
                e.currentTarget.style.color = 'var(--navy)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border-md)';
                e.currentTarget.style.background = 'var(--bg)';
                e.currentTarget.style.color = 'var(--t3)';
              }}
            >
              <CameraIcon size={28} />
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                lineHeight: 1.3,
                textAlign: 'center',
                maxWidth: 90,
              }}>
                Click here to add a new profile picture
              </span>
            </div>
          )}
          <span style={{
            position: 'absolute', right: 2, bottom: 2,
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--navy)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--card)',
            boxShadow: '0 1px 4px rgba(15,23,42,0.2)',
          }}>
            <CameraIcon size={14} />
          </span>
        </button>

        {member.photo && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            title="Delete profile picture"
            aria-label="Delete profile picture"
            style={{
              position: 'absolute',
              top: 0,
              right: -8,
              width: 24,
              height: 24,
              padding: 0,
              borderRadius: '50%',
              border: '2px solid var(--card)',
              background: 'var(--red)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: deleting ? 'wait' : 'pointer',
              boxShadow: '0 1px 4px rgba(15,23,42,0.2)',
            }}
          >
            {deleting ? <Spinner size="sm" /> : '×'}
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <Modal
        open={open}
        onClose={() => { if (!uploading) closeModal(); }}
        title={member.photo ? 'Update Profile Photo' : 'Add Profile Photo'}
        size="sm"
        footer={
          <>
            <Btn variant="ghost" size="sm" onClick={closeModal} disabled={uploading}>Cancel</Btn>
            {!captured && (
              <Btn variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                Choose file
              </Btn>
            )}
            {captured ? (
              <>
                <Btn variant="outline" size="sm" onClick={handleRetake} disabled={uploading}>Retake</Btn>
                <Btn size="sm" onClick={() => uploadBlob(captured.blob)} disabled={uploading}>
                  {uploading ? <><Spinner size="sm" /> Uploading…</> : 'Use photo'}
                </Btn>
              </>
            ) : (
              <Btn size="sm" onClick={handleCapture} disabled={uploading || !streamReady}>
                Capture
              </Btn>
            )}
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: '100%',
            maxWidth: 320,
            aspectRatio: '4 / 3',
            borderRadius: 8,
            overflow: 'hidden',
            background: 'var(--bg)',
            position: 'relative',
          }}>
            {captured ? (
              <img
                src={captured.url}
                alt="Captured preview"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  display: streamReady ? 'block' : 'none',
                  transform: 'scaleX(-1)',
                }}
              />
            )}
            {!captured && !streamReady && !cameraError && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(255,255,255,0.7)', fontSize: 13, gap: 8,
              }}>
                <Spinner size="sm" /> Starting camera…
              </div>
            )}
            {uploading && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(15,23,42,0.55)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 13, gap: 8,
              }}>
                <Spinner size="sm" /> Uploading…
              </div>
            )}
          </div>

          {cameraError && (
            <p style={{ fontSize: 12, color: 'var(--amber)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
              {cameraError}
            </p>
          )}

          <p style={{ fontSize: 12, color: 'var(--t4)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
            Take a photo with the camera, or choose an image from your device.
            On phones, “Choose file” can open the camera directly.
          </p>

          {/* Extra mobile-friendly capture input */}
          <input
            ref={captureRef}
            type="file"
            accept="image/*"
            capture="user"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
      </Modal>
    </>
  );
}
