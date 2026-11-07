import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import { PageHeader, Card, Btn, Spinner, Badge, fmtDate } from '../../components/ui';
import usePageTitle from '../../hooks/usePageTitle';
import { bulkImportMembers } from '../../api/endpoints';
import { validateFile, SPREADSHEET_EXTENSIONS } from '../../lib/validation';

export default function ImportMembers() {
  usePageTitle('Import Members');
  const navigate   = useNavigate();
  const fileRef    = useRef(null);

  const [file,      setFile]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null); // import result
  const [dragOver,  setDragOver]  = useState(false);

  const handleFile = (f) => {
    if (!f) return;
    const check = validateFile(f, { maxSizeMB: 5, allowedExtensions: SPREADSHEET_EXTENSIONS });
    if (!check.valid) { toast.error(check.error); return; }
    setFile(f);
    setResult(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleImport = async () => {
    if (!file) { toast.error('Please select a file first'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await bulkImportMembers(fd);
      setResult(res.data);
      if (res.data.summary.created > 0) {
        toast.success(`${res.data.summary.created} member${res.data.summary.created !== 1 ? 's' : ''} imported successfully`);
      } else {
        toast.error('No new members were imported');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setFile(null); setResult(null); if (fileRef.current) fileRef.current.value = ''; };

  return (
    <Layout>
      <PageHeader title="Import Members">
        <Btn variant="outline" size="sm" onClick={() => navigate(-1)}>← Back</Btn>
      </PageHeader>

      <div className="page-wrap" style={{ paddingTop: 20, paddingBottom: 40 }}>

        {/* ── Instructions ────────────────────────────────────── */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(68,41,140,0.10)', border: '1px solid rgba(68,41,140,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📥</div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 6 }}>How to use</h3>
              <p style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.6, marginBottom: 8 }}>
                Upload an Excel file (<code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>.xlsx</code> / <code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>.xls</code> / <code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>.csv</code>) with at least two columns:
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { col: 'name', desc: 'Full name of the person' },
                  { col: 'phone', desc: 'Phone number (also accepts "number", "mobile")' },
                ].map(({ col, desc }) => (
                  <div key={col} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: '#44298C', fontFamily: 'monospace' }}>{col}</span>
                    <span style={{ color: 'var(--t3)', marginLeft: 8 }}>{desc}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'var(--t4)', marginTop: 10 }}>
                All imported records are added as <strong>unassigned guest members</strong> with source "data entry". Duplicate phone numbers are skipped automatically.
              </p>
            </div>
          </div>
        </Card>

        {/* ── Upload zone ──────────────────────────────────────── */}
        {!result && (
          <Card>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])} />

            {/* Drop zone */}
            <div
              onClick={() => !file && fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${dragOver ? '#44298C' : file ? 'var(--green)' : 'var(--border-md)'}`,
                borderRadius: 12, padding: '40px 24px', textAlign: 'center',
                background: dragOver ? 'rgba(68,41,140,0.04)' : file ? 'rgba(34,197,94,0.04)' : 'var(--bg)',
                cursor: file ? 'default' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {file ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 40 }}>📊</div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{file.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--t4)' }}>{(file.size / 1024).toFixed(1)} KB</p>
                  <button onClick={e => { e.stopPropagation(); reset(); }}
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

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              {!file && (
                <Btn variant="outline" size="md" onClick={() => fileRef.current?.click()}>
                  Browse File
                </Btn>
              )}
              {file && (
                <Btn size="md" onClick={handleImport} disabled={loading}>
                  {loading ? <><Spinner size="sm" /> Importing…</> : '📥 Import Now'}
                </Btn>
              )}
            </div>
          </Card>
        )}

        {/* ── Results ──────────────────────────────────────────── */}
        {result && (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              {[
                { label: 'Total Rows',  value: result.summary.total,   accent: '#44298C' },
                { label: 'Created',     value: result.summary.created,  accent: 'var(--green)' },
                { label: 'Skipped',     value: result.summary.skipped,  accent: 'var(--amber)' },
                { label: 'Errors',      value: result.summary.errors,   accent: 'var(--red)' },
              ].map(({ label, value, accent }) => (
                <div key={label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderTop: `3px solid ${accent}`, borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--t4)', marginBottom: 4 }}>{label}</p>
                  <p style={{ fontSize: 28, fontWeight: 800, color: accent }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Created list */}
            {result.created.length > 0 && (
              <Card noPad>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>✅ Created ({result.created.length})</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                        {['System ID', 'Name', 'Phone'].map(h => (
                          <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--t4)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.created.map((m, i) => (
                        <tr key={i} className="tbl-row" style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                          onClick={() => navigate(`/members/${m.systemId}`)}>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--t4)' }}>#{m.systemId}</td>
                          <td style={{ padding: '9px 14px', fontWeight: 600, color: 'var(--t1)' }}>{m.name}</td>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--t2)' }}>{m.phone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Skipped list */}
            {result.skipped.length > 0 && (
              <Card noPad>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)' }}>⚠ Skipped — Already Exist ({result.skipped.length})</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                        {['Name', 'Phone', 'Reason', 'Existing ID'].map(h => (
                          <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--t4)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.skipped.map((m, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: 'var(--amber-bg)' }}>
                          <td style={{ padding: '9px 14px', fontWeight: 600, color: 'var(--t1)' }}>{m.name}</td>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--t2)' }}>{m.phone}</td>
                          <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--amber)' }}>{m.reason}</td>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--t4)' }}>#{m.systemId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Errors list */}
            {result.errors.length > 0 && (
              <Card noPad>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>❌ Errors ({result.errors.length})</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                        {['Row Data', 'Reason'].map(h => (
                          <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--t4)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((e, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: 'var(--red-bg)' }}>
                          <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--t2)', fontFamily: 'monospace' }}>{JSON.stringify(e.row)}</td>
                          <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Actions after import */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Btn onClick={reset} variant="outline">Import Another File</Btn>
              {result.summary.created > 0 && (
                <Btn onClick={() => navigate('/members?status=guest&unassigned=true')}>
                  View Imported Members →
                </Btn>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
