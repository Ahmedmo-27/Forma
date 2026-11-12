import { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { IdCard } from 'lucide-react';
import { Card, CardHeader, Btn, Spinner, EmptyState } from '../../../components/ui';
import { uploadNationalId } from '../../../api/endpoints';
import { fetchProtectedUploadBlobUrl } from '../../../api/axios';
import { validateFile, DOCUMENT_EXTENSIONS, DOCUMENT_ACCEPT, UPLOAD_INTAKE_MB } from '../../../lib/validation';

export default function FilesTab({ member, user, onRefresh }) {
  const isAccountant = user?.role === 'Accountant';
  const [uploading, setUploading] = useState(false);
  const [nationalIdUrl, setNationalIdUrl] = useState(null);
  const fileRef = useRef(null);

  const nationalIdFile = member.nationalId;

  useEffect(() => {
    if (!nationalIdFile) {
      setNationalIdUrl(null);
      return undefined;
    }

    let active = true;
    let objectUrl = null;

    fetchProtectedUploadBlobUrl(nationalIdFile)
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setNationalIdUrl(url);
      })
      .catch(() => {
        if (active) setNationalIdUrl(null);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [nationalIdFile]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const check = validateFile(file, { maxSizeMB: UPLOAD_INTAKE_MB, allowedExtensions: DOCUMENT_EXTENSIONS });
    if (!check.valid) {
      toast.error(check.error);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('nationalIdFile', file);

    setUploading(true);
    try {
      await uploadNationalId(member.systemId, formData);
      toast.success('National ID uploaded');
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── National ID ────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="National ID">
          {isAccountant && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={DOCUMENT_ACCEPT}
                onChange={handleUpload}
                style={{ display: 'none' }}
              />
              <Btn
                variant={nationalIdUrl ? 'outline' : 'blue'}
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading
                  ? <><Spinner size="sm" /> Uploading…</>
                  : nationalIdUrl ? 'Replace' : 'Upload'
                }
              </Btn>
            </>
          )}
        </CardHeader>

        {nationalIdUrl ? (
          <div>
            <a href={nationalIdUrl} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                border: '1px solid var(--border)',
                borderRadius: 8,
                overflow: 'hidden',
                transition: 'box-shadow 0.12s',
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(15,23,42,0.1)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
            >
              <img
                src={nationalIdUrl}
                alt="National ID"
                style={{ maxWidth: '100%', maxHeight: 360, display: 'block' }}
                onError={e => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div style={{
                display: 'none', padding: '16px 20px', alignItems: 'center', gap: 8,
                fontSize: 13, fontWeight: 600, color: 'var(--blue)',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                View / Download File
              </div>
            </a>
            <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 8 }}>
              Click to view full size. {isAccountant ? 'Use the Replace button to update.' : 'Only the Accountant can update this file.'}
            </p>
          </div>
        ) : (
          <EmptyState
            icon={IdCard}
            message="No national ID uploaded"
            sub={isAccountant ? 'Click Upload to add the scanned national ID.' : 'The Accountant has not uploaded this file yet.'}
          />
        )}
      </Card>
    </div>
  );
}
