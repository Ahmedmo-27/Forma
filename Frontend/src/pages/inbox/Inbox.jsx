import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageSquare, Send } from 'lucide-react';
import Layout from '../../components/Layout';
import usePageTitle from '../../hooks/usePageTitle';
import { useAuth } from '../../context/AuthContext';
import { hasAccess } from '../../lib/access';
import { PageHeader, Card, Btn, Spinner, EmptyState, FilterTabs, SearchInput, Avatar, CAIRO_ZONE } from '../../components/ui';
import {
  getInboxConversations,
  getInboxMessages,
  sendInboxReply,
  updateInboxConversation,
} from '../../api/endpoints';
import { useI18n } from '../../i18n/useI18n';
import { useFormat } from '../../i18n/useFormat';
import { tr } from '../../i18n/translate';

const LIST_POLL_MS = 10000;
const THREAD_POLL_MS = 5000;
const PAGE = 50;
const DATE_TIME_OPTIONS = {
  timeZone: CAIRO_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
};

const CHANNEL_LABELS = { whatsapp: 'WhatsApp' };
const CHANNEL_COLORS = { whatsapp: '#16a34a' };

const STATUS_OPTIONS = [
  { value: 'open', label: tr('Open') },
  { value: 'snoozed', label: tr('Snoozed') },
  { value: 'done', label: tr('Done') },
];
const CHANNEL_OPTIONS = [
  { value: '', label: tr('All channels') },
  { value: 'whatsapp', label: 'WhatsApp' },
];
const ASSIGNEE_OPTIONS = [
  { value: '', label: tr('Everyone') },
  { value: 'me', label: tr('Mine') },
  { value: 'unassigned', label: tr('Unassigned') },
];

function translateOptions(options, t) {
  return options.map((opt) => ({ ...opt, label: t(opt.label) }));
}

function ChannelTag({ type }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase',
      color: CHANNEL_COLORS[type] || 'var(--t3)',
      border: `1px solid ${CHANNEL_COLORS[type] || 'var(--border)'}`,
      borderRadius: 10, padding: '1px 7px', whiteSpace: 'nowrap',
    }}>
      {CHANNEL_LABELS[type] || type}
    </span>
  );
}

function contactLabel(conversation) {
  return conversation.contactName || conversation.memberId?.name || conversation.contactExternalId;
}

function ConversationRow({ conversation, active, onSelect }) {
  const { t } = useI18n();
  const { fmtDateTime } = useFormat();
  const unread = conversation.unreadCount > 0;
  return (
    <button
      type="button"
      onClick={() => onSelect(conversation._id)}
      style={{
        display: 'flex', gap: 10, width: '100%', textAlign: 'start', cursor: 'pointer',
        padding: '12px 14px', border: 'none', borderBottom: '1px solid var(--border)',
        background: active ? 'var(--bg, rgba(0,0,0,0.04))' : 'transparent',
        fontFamily: 'inherit', color: 'inherit',
      }}
    >
      <Avatar name={contactLabel(conversation)} size="sm" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
          <span dir="auto" style={{ fontSize: 14, fontWeight: unread ? 800 : 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {contactLabel(conversation)}
          </span>
          <span style={{ fontSize: 11, color: 'var(--t4)', flexShrink: 0 }}>
            {conversation.lastMessageAt ? fmtDateTime(conversation.lastMessageAt, DATE_TIME_OPTIONS, 'en-US') : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <ChannelTag type={conversation.channelType} />
          <span style={{ flex: 1, fontSize: 13, color: unread ? 'var(--t1)' : 'var(--t3)', fontWeight: unread ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conversation.lastMessageDirection === 'outbound'
              ? t('You: {text}', { text: conversation.lastMessageText || '' })
              : conversation.lastMessageText || ''}
          </span>
          {unread && (
            <span style={{ background: 'var(--navy)', color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: 700, padding: '1px 7px' }}>
              {conversation.unreadCount}
            </span>
          )}
        </div>
        {conversation.assignedTo?.name && (
          <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 3 }}>{t('Assigned to {name}', { name: conversation.assignedTo.name })}</div>
        )}
      </div>
    </button>
  );
}

function MessageBubble({ message }) {
  const { t } = useI18n();
  const { fmtDateTime } = useFormat();
  const out = message.direction === 'outbound';
  return (
    <div style={{ display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '78%', padding: '8px 12px', borderRadius: 12,
        background: out ? 'var(--navy)' : 'var(--card)',
        color: out ? '#fff' : 'var(--t1)',
        border: out ? 'none' : '1px solid var(--border)',
        fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
      }}>
        {message.text ? <div dir="auto">{message.text}</div> : null}
        {(message.attachments || []).map((att, i) => (
          <div key={`${att.url || att.name || i}`} style={{ marginTop: message.text ? 6 : 0 }}>
            {att.type === 'image' && att.url ? (
              <a href={att.url} target="_blank" rel="noreferrer">
                <img src={att.url} alt={att.name || t('Attachment')} style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }} />
              </a>
            ) : att.url ? (
              <a href={att.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline', fontSize: 13 }}>
                {att.name || att.type || t('Attachment')}
              </a>
            ) : (
              <span style={{ fontSize: 13, opacity: 0.85 }}>[{att.type || t('attachment')}]</span>
            )}
          </div>
        ))}
        <div style={{ fontSize: 10, opacity: 0.65, marginTop: 4, textAlign: 'end' }}>
          {out && message.sentBy?.name ? `${message.sentBy.name} · ` : ''}
          {message.timestamp ? fmtDateTime(message.timestamp, DATE_TIME_OPTIONS, 'en-US') : '—'}
          {out && message.status === 'failed' ? <> · {t('failed')}</> : ''}
        </div>
      </div>
    </div>
  );
}

function Thread({ conversation, canReply, currentUserId, onBack }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState(PAGE);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef(null);
  const lastCount = useRef(0);
  const id = conversation._id;

  const messagesQuery = useQuery({
    queryKey: ['inbox', 'messages', id, limit],
    queryFn: async () => (await getInboxMessages(id, { limit })).data,
    refetchInterval: THREAD_POLL_MS,
    staleTime: 0,
  });
  const messages = messagesQuery.data?.messages || [];

  useEffect(() => {
    if (messages.length > lastCount.current && limit === PAGE) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
    lastCount.current = messages.length;
  }, [messages.length, limit]);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations'] });
    queryClient.invalidateQueries({ queryKey: ['inbox', 'messages', id] });
  };

  const patch = useMutation({
    mutationFn: (data) => updateInboxConversation(id, data),
    onSuccess: refreshAll,
  });
  const send = useMutation({
    mutationFn: (text) => sendInboxReply(id, text),
    onSuccess: () => {
      setDraft('');
      refreshAll();
    },
  });

  const unread = conversation.unreadCount;
  const markRead = patch.mutate;
  useEffect(() => {
    if (unread > 0 && canReply) markRead({ markRead: true });
  // Clear unread once per opened thread or when new inbound arrives.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, unread, canReply]);

  const mine = conversation.assignedTo && String(conversation.assignedTo._id) === String(currentUserId);
  const text = draft.trim();

  const submit = () => {
    if (!text || send.isPending) return;
    send.mutate(text);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {onBack && (
          <button type="button" onClick={onBack} aria-label={t('Back to conversations')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--t2)' }}>
            <ArrowLeft size={18} className="rtl-flip" />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span dir="auto" style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>{contactLabel(conversation)}</span>
            <ChannelTag type={conversation.channelType} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--t4)', marginTop: 2 }}>
            {conversation.memberId ? (
              <>{t('Member:')} <Link to={`/members/${conversation.memberId._id}`} style={{ fontWeight: 600 }}><bdi>{conversation.memberId.name}</bdi></Link></>
            ) : t('Not linked to a member')}
            {' · '}
            {conversation.assignedTo?.name ? t('Assigned to {name}', { name: conversation.assignedTo.name }) : t('Unassigned')}
          </div>
        </div>
        {canReply && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {mine ? (
              <Btn size="sm" variant="outline" disabled={patch.isPending} onClick={() => patch.mutate({ assignedTo: null })}>{t('Unassign')}</Btn>
            ) : (
              <Btn size="sm" variant="outline" disabled={patch.isPending} onClick={() => patch.mutate({ assignedTo: currentUserId })}>{t('Assign to me')}</Btn>
            )}
            {conversation.status === 'open' ? (
              <>
                <Btn size="sm" variant="outline" disabled={patch.isPending} onClick={() => patch.mutate({ status: 'snoozed', snoozedUntil: new Date(Date.now() + 24 * 3600 * 1000).toISOString() })}>{t('Snooze 1 day')}</Btn>
                <Btn size="sm" variant="success" disabled={patch.isPending} onClick={() => patch.mutate({ status: 'done' })}>{t('Mark done')}</Btn>
              </>
            ) : (
              <Btn size="sm" variant="outline" disabled={patch.isPending} onClick={() => patch.mutate({ status: 'open' })}>{t('Reopen')}</Btn>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
        {messagesQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner /></div>
        ) : (
          <>
            {messagesQuery.data?.hasMore && (
              <div style={{ textAlign: 'center' }}>
                <Btn size="sm" variant="outline" onClick={() => setLimit((n) => n + PAGE)}>{t('Load earlier messages')}</Btn>
              </div>
            )}
            {messages.map((m) => <MessageBubble key={m._id} message={m} />)}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {canReply ? (
        <div style={{ borderTop: '1px solid var(--border)', padding: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              dir="auto"
              rows={2}
              maxLength={4000}
              placeholder={t('Write a reply. Enter sends, Shift+Enter adds a line.')}
              style={{ flex: 1, resize: 'none', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 14, background: 'var(--card)', color: 'var(--t1)' }}
            />
            <Btn variant="primary" onClick={submit} disabled={!text || send.isPending}>
              <Send size={14} className="rtl-flip" style={{ marginInlineEnd: 6, verticalAlign: 'text-bottom' }} />
              {send.isPending ? t('Sending…') : t('Send')}
            </Btn>
          </div>
        </div>
      ) : (
        <div style={{ borderTop: '1px solid var(--border)', padding: 12, fontSize: 13, color: 'var(--t4)' }}>
          {t('You can read this conversation but not reply.')}
        </div>
      )}
    </div>
  );
}

export default function Inbox() {
  const { t } = useI18n();
  usePageTitle(t('Inbox'));
  const { user } = useAuth();
  const canReply = hasAccess(user, 'inbox_reply');
  const [status, setStatus] = useState('open');
  const [channelType, setChannelType] = useState('');
  const [assignee, setAssignee] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params = useMemo(() => {
    const p = { status, limit: 50 };
    if (channelType) p.channelType = channelType;
    if (assignee) p.assignedTo = assignee;
    if (debouncedSearch) p.search = debouncedSearch;
    return p;
  }, [status, channelType, assignee, debouncedSearch]);

  const listQuery = useQuery({
    queryKey: ['inbox', 'conversations', params],
    queryFn: async () => (await getInboxConversations(params)).data,
    refetchInterval: LIST_POLL_MS,
    staleTime: 0,
  });
  const conversations = listQuery.data?.conversations || [];
  const selected = conversations.find((c) => c._id === selectedId) || null;

  return (
    <Layout>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 12px' }}>
        <PageHeader title={t('Inbox')}>
          <Link to="/account/channels" style={{ fontSize: 13, fontWeight: 600 }}>{t('Connected channels')}</Link>
        </PageHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0 12px' }}>
          <FilterTabs options={translateOptions(STATUS_OPTIONS, t)} active={status} onChange={(v) => { setStatus(v); setSelectedId(null); }} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <FilterTabs options={translateOptions(CHANNEL_OPTIONS, t)} active={channelType} onChange={setChannelType} />
            <FilterTabs options={translateOptions(ASSIGNEE_OPTIONS, t)} active={assignee} onChange={setAssignee} />
            <SearchInput value={search} onChange={setSearch} placeholder={t('Search name or message…')} />
          </div>
        </div>

        <Card noPad>
          <div className="inbox-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', height: 'calc(100vh - 290px)', minHeight: 420 }}>
            <div
              className={selected ? 'inbox-list inbox-hide-mobile' : 'inbox-list'}
              style={{ borderInlineEnd: '1px solid var(--border)', overflowY: 'auto', minHeight: 0 }}
            >
              {listQuery.isLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
              ) : conversations.length === 0 ? (
                <EmptyState icon={MessageSquare} message={t('No conversations')} sub={t('New WhatsApp messages appear here.')} />
              ) : (
                conversations.map((c) => (
                  <ConversationRow key={c._id} conversation={c} active={c._id === selectedId} onSelect={setSelectedId} />
                ))
              )}
            </div>
            <div className={selected ? 'inbox-thread' : 'inbox-thread inbox-hide-mobile'} style={{ minHeight: 0, minWidth: 0 }}>
              {selected ? (
                <Thread
                  key={selected._id}
                  conversation={selected}
                  canReply={canReply}
                  currentUserId={user?._id}
                  onBack={() => setSelectedId(null)}
                />
              ) : (
                <EmptyState icon={MessageSquare} message={t('Select a conversation')} />
              )}
            </div>
          </div>
        </Card>
      </div>
      {/* i18n-ignore */}
      <style>{`
        @media (max-width: 800px) {
          .inbox-grid { grid-template-columns: 1fr !important; }
          .inbox-hide-mobile { display: none !important; }
        }
      `}</style>
    </Layout>
  );
}
