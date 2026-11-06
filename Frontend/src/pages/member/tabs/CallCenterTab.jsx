import { useState } from 'react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Btn, Textarea, Spinner, EmptyState, fmtDateTime } from '../../../components/ui';
import { addNote } from '../../../api/endpoints';
import api from '../../../api/axios';

export default function CallCenterTab({ member, user, onRefresh }) {
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(false);

  const isCoachRole = ['Coach', 'Coach Manager'].includes(user?.role);

  // Coach roles see couch_notes, others see regular notes
  const notes = isCoachRole
    ? [...(member.couch_notes ?? [])].reverse()
    : [...(member.notes ?? [])].reverse();

  const canAdd = isCoachRole
    ? ['Coach', 'Coach Manager'].includes(user?.role)
    : ['Sales', 'Sales Manager', 'Owner'].includes(user?.role);

  const handleAdd = async () => {
    const trimmed = text.trim();
    if (!trimmed) { toast.error('Note cannot be empty.'); return; }
    if (trimmed.length > 2000) { toast.error('Note cannot exceed 2000 characters.'); return; }
    setLoading(true);
    try {
      if (isCoachRole) {
        await api.post(`/members/${member.systemId}/couch-notes`, { text: trimmed });
      } else {
        await addNote(member.systemId, trimmed);
      }
      toast.success('Note added.');
      setText('');
      onRefresh();
    } catch (e) { toast.error(e.response?.data?.message ?? 'Failed.'); }
    finally { setLoading(false); }
  };

  const title = isCoachRole ? 'Coach Notes' : 'Call Center';
  const noteCount = isCoachRole ? (member.couch_notes?.length ?? 0) : (member.notes?.length ?? 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {canAdd && (
        <Card>
          <CardHeader title={`Add ${isCoachRole ? 'Coach Note' : 'Note'}`} />
          <Textarea placeholder="Write your note here… (Ctrl+Enter to save)" value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAdd(); }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--t4)' }}>Notes are permanent — no editing or deletion</span>
            <Btn size="sm" onClick={handleAdd} disabled={loading || !text.trim()}>{loading ? <Spinner size="sm" /> : 'Add Note'}</Btn>
          </div>
        </Card>
      )}

      <Card noPad>
        <div style={{ padding: '14px 18px 0' }}>
          <CardHeader title={`${title} (${noteCount})`} />
        </div>
        {!notes.length ? <EmptyState message="No notes yet" /> :
          <div>
            {notes.map(n => (
              <div key={n._id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: isCoachRole ? 'var(--blue)' : 'var(--navy)', display: 'inline-block' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>{n.createdBy?.name ?? 'Unknown'}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--t4)' }}>{fmtDateTime(n.createdAt)}</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{n.text}</p>
              </div>
            ))}
          </div>
        }
      </Card>
    </div>
  );
}
