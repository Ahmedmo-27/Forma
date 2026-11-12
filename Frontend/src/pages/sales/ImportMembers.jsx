import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import { PageHeader, Card, Btn, Spinner } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import { bulkImportMembers, getMemberImportJob } from '../../api/endpoints';
import { validateFile, SPREADSHEET_EXTENSIONS } from '../../lib/validation';

const STEPS = [
  { key: 'received', label: 'File received' },
  { key: 'divided', label: 'Split into parts' },
  { key: 'importing', label: 'Importing' },
  { key: 'done', label: 'Finished' },
];

function stepState(job, key) {
  if (!job) return key === 'received' ? 'active' : 'waiting';
  const finished = job.status === 'completed' || job.status === 'failed';
  if (key === 'received') return 'done';
  if (key === 'divided') return 'done';
  if (key === 'importing') return finished ? 'done' : 'active';
  return finished ? (job.status === 'failed' ? 'failed' : 'done') : 'waiting';
}

export default function ImportMembers() {
  usePageTitle('Import Members');
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const pollRef = useRef(null);
  const toldRef = useRef(false);
  const sawRunningRef = useRef(false);

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [job, setJob] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem('ff_member_import_job');
    if (saved) watchJob(saved);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const watchJob = (jobId) => {
    const tick = async () => {
      try {
        const res = await getMemberImportJob(jobId);
        setJob(res.data);
        if (res.data.status === 'processing') sawRunningRef.current = true;
        if (res.data.status === 'completed' || res.data.status === 'failed') {
          if (sawRunningRef.current && !toldRef.current) {
            toldRef.current = true;
            if (res.data.status === 'completed' && res.data.summary.created > 0) {
              toast.success(`${res.data.summary.created} member${res.data.summary.created === 1 ? '' : 's'} imported`);
            } else if (res.data.status === 'failed') {
              toast.error(res.data.errorMessage || 'Import stopped');
            } else {
              toast.error('No new members were imported');
            }
          }
          return;
        }
        pollRef.current = setTimeout(tick, 800);
      } catch (err) {
        if (err.response?.status === 404) {
          sessionStorage.removeItem('ff_member_import_job');
          return;
        }
        setJob((current) => current && ({
          ...current,
          pollError: err.response?.data?.message || 'Could not refresh the import status',
        }));
        pollRef.current = setTimeout(tick, 2000);
      }
    };
    tick();
  };

  const handleFile = (nextFile) => {
    if (!nextFile) return;
    const check = validateFile(nextFile, { maxSizeMB: 5, allowedExtensions: SPREADSHEET_EXTENSIONS });
    if (!check.valid) { toast.error(check.error); return; }
    setFile(nextFile);
      setJob(null);
      toldRef.current = false;
      sawRunningRef.current = false;
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragOver(false);
    handleFile(event.dataTransfer.files[0]);
  };

  const handleImport = async () => {
    if (!file) { toast.error('Please select a file first'); return; }
    setUploading(true);
    toldRef.current = false;
    sawRunningRef.current = true;
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await bulkImportMembers(body);
      setJob(res.data);
      sessionStorage.setItem('ff_member_import_job', res.data.jobId);
      setUploading(false);
      watchJob(res.data.jobId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed');
      setUploading(false);
    }
  };

  const reset = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setFile(null);
    setJob(null);
    setUploading(false);
    toldRef.current = false;
    sawRunningRef.current = false;
    sessionStorage.removeItem('ff_member_import_job');
    if (fileRef.current) fileRef.current.value = '';
  };

  const running = uploading || (job && job.status === 'processing');
  const showPicker = !uploading && !job;

  return (
    <Layout>
      <PageHeader walkthrough="import-header" title="Import Members">
        <Btn variant="outline" size="sm" onClick={() => navigate(-1)}>← Back</Btn>
      </PageHeader>

      <div className="page-wrap" data-walkthrough="import-board" style={{ paddingTop: 20, paddingBottom: 40 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'color-mix(in srgb, var(--navy) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--navy) 20%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📥</div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 6 }}>How to use</h3>
              <p style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.6, marginBottom: 8 }}>
                Upload an Excel file (<code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>.xlsx</code> / <code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>.xls</code> / <code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>.csv</code>) with at least two columns. Large sheets are split into parts and imported in the background.
              </p>
              <div data-walkthrough="import-columns" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { col: 'name', desc: 'Full name of the person' },
                  { col: 'phone', desc: 'Phone number (also accepts "number", "mobile")' },
                ].map(({ col, desc }) => (
                  <div key={col} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: 'var(--navy)', fontFamily: 'monospace' }}>{col}</span>
                    <span style={{ color: 'var(--t3)', marginLeft: 8 }}>{desc}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'var(--t4)', marginTop: 10 }}>
                Imported records are added as <strong>guest members assigned to the sales manager</strong> with source "data entry". Duplicate phone numbers are skipped.
              </p>
            </div>
          </div>
        </Card>

        {showPicker && (
          <Card>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
              onChange={(event) => handleFile(event.target.files[0])} />
            <div
              data-walkthrough="import-drop"
              onClick={() => !file && fileRef.current?.click()}
              onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${dragOver ? 'var(--navy)' : file ? 'var(--green)' : 'var(--border-md)'}`,
                borderRadius: 12, padding: '40px 24px', textAlign: 'center',
                background: dragOver ? 'color-mix(in srgb, var(--navy) 4%, transparent)' : file ? 'rgba(34,197,94,0.04)' : 'var(--bg)',
                cursor: file ? 'default' : 'pointer',
              }}
            >
              {file ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 40 }}>📊</div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{file.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--t4)' }}>{(file.size / 1024).toFixed(1)} KB</p>
                  <button type="button" onClick={(event) => { event.stopPropagation(); reset(); }}
                    style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                    ✕ Remove
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 40, opacity: 0.3 }}>📁</div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--t2)' }}>Drop your Excel file here</p>
                  <p style={{ fontSize: 12, color: 'var(--t4)' }}>or click to browse</p>
                  <p style={{ fontSize: 11, color: 'var(--t4)' }}>.xlsx · .xls · .csv — max 5 MB</p>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              {!file && <Btn variant="outline" size="md" onClick={() => fileRef.current?.click()}>Browse File</Btn>}
              {file && <Btn size="md" onClick={handleImport}>📥 Import Now</Btn>}
            </div>
          </Card>
        )}

        {(uploading || job) && (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--t1)', marginBottom: 4 }}>
                  {uploading ? 'Uploading the file' : job.stage}
                </h3>
                <p style={{ fontSize: 12, color: 'var(--t4)' }}>
                  {job?.fileName || file?.name}
                  {running ? ' · You can leave this page. The import keeps going.' : ''}
                </p>
              </div>
              {running && <Spinner size="sm" />}
            </div>

            <ol style={{ listStyle: 'none', display: 'grid', gap: 8, marginBottom: 18 }}>
              {STEPS.map((step) => {
                const state = stepState(uploading ? null : job, step.key);
                const color = state === 'failed' ? 'var(--red)' : state === 'waiting' ? 'var(--t4)' : 'var(--navy)';
                const detail = step.key === 'divided' && job
                  ? `${job.chunkCount} ${job.chunkCount === 1 ? 'part' : 'parts'}`
                  : step.key === 'importing' && job
                    ? `Part ${Math.max(job.chunkIndex, running ? 1 : job.chunkIndex)} of ${job.chunkCount}`
                    : null;
                return (
                  <li key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color }}>
                    <span aria-hidden="true" style={{ width: 18, textAlign: 'center', fontWeight: 800 }}>
                      {state === 'done' ? '✓' : state === 'failed' ? '!' : state === 'active' ? '●' : '○'}
                    </span>
                    <span style={{ fontWeight: state === 'active' ? 700 : 500 }}>{step.label}</span>
                    {detail && <span style={{ color: 'var(--t4)', fontWeight: 500 }}>{detail}</span>}
                  </li>
                );
              })}
            </ol>

            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={job?.totalRows || 0}
              aria-valuenow={job?.processedRows || 0}
              aria-label={uploading ? 'Uploading the file' : job?.stage}
              style={{ height: 8, borderRadius: 99, background: 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden' }}
            >
              <div style={{
                width: `${uploading ? 8 : job?.percent || 0}%`,
                height: '100%',
                background: job?.status === 'failed' ? 'var(--red)' : 'var(--navy)',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <p aria-live="polite" style={{ fontSize: 12, color: 'var(--t3)', marginTop: 8 }}>
              {uploading
                ? 'Sending the spreadsheet…'
                : `${job.processedRows.toLocaleString()} of ${job.totalRows.toLocaleString()} rows · ${job.percent}%`}
            </p>
            {job?.pollError && <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 6 }}>{job.pollError}</p>}
            {job?.status === 'failed' && job.errorMessage && (
              <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{job.errorMessage}</p>
            )}
          </Card>
        )}

        {job && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              {[
                { label: 'Total Rows', value: job.summary.total, accent: 'var(--navy)' },
                { label: 'Created', value: job.summary.created, accent: 'var(--green)' },
                { label: 'Skipped', value: job.summary.skipped, accent: 'var(--amber)' },
                { label: 'Errors', value: job.summary.errors, accent: 'var(--red)' },
              ].map(({ label, value, accent }) => (
                <div key={label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `3px solid ${accent}`, borderRadius: 12, padding: '16px 18px' }}>
                  <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--t4)', marginBottom: 4 }}>{label}</p>
                  <p style={{ fontSize: 28, fontWeight: 800, color: accent }}>{value}</p>
                </div>
              ))}
            </div>

            {job.errors?.length > 0 && (
              <Card noPad>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>
                    Errors ({job.summary.errors})
                  </span>
                  {job.summary.errors > job.errors.length && (
                    <span style={{ fontSize: 12, color: 'var(--t4)', marginLeft: 8 }}>Showing the first {job.errors.length}</span>
                  )}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                        {['Row', 'Name', 'Phone', 'Reason'].map((heading) => (
                          <th key={heading} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--t4)' }}>{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {job.errors.map((entry, index) => (
                        <tr key={`${entry.line}-${index}`} style={{ borderBottom: '1px solid var(--border)', background: 'var(--red-bg)' }}>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 12 }}>{entry.line}</td>
                          <td style={{ padding: '9px 14px' }}>{entry.name || '—'}</td>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 12 }}>{entry.phone || '—'}</td>
                          <td style={{ padding: '9px 14px', color: 'var(--red)', fontWeight: 600 }}>{entry.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {!running && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Btn onClick={reset} variant="outline">Import Another File</Btn>
                {job.summary.created > 0 && (
                  <Btn onClick={() => navigate('/members?status=guest')}>View Imported Members →</Btn>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
