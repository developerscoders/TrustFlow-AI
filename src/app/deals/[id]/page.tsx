'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowDown, ArrowLeft, ArrowUp, FileText, Send, WalletCards, MessageCircle } from 'lucide-react';
import { PayPalCheckout } from '@/components/paypal-checkout';
import { ActivityTimeline } from '@/components/activity-timeline';
import { DisputeSummary } from '@/components/dispute-summary';
import { NegotiationPanel } from '@/components/negotiation-panel';

type Sub = {
    id: string;
    milestoneId: string;
    content: string;
    notes?: string | null;
    assessment: string | null;
    createdAt: string;
    revisionOfId?: string | null;
    urls?: string[];
    fileMetadata?: {
        id: string;
        filename: string;
        url: string;
        contentType: string;
        size: number;
    }[];
    status?: string;
};

type Mile = { id: string; title: string; description: string; amount: number; status: string };

type Deal = {
    id: string;
    title: string;
    description: string;
    amount: number;
    currency: string;
    status: string;
    providerPaypalEmail: string | null;
    providerEmail: string | null;
    viewerRole: 'BUYER' | 'PROVIDER';
    agreement: {
        body: string;
        version: number;
        buyerApprovedAt: string | null;
        providerApprovedAt: string | null;
    } | null;
    milestones: Mile[];
    submissions: Sub[];
    payments: { id: string; paypalOrderId: string; status: string; captureId: string | null; failureReason: string | null; amount: number; currency: string }[];
      emailLogs: {
          id: string;
          type: string;
          status: string;
          messageId: string | null;
          sentAt: string | null;
          lastError: string | null;
          createdAt: string;
      }[];
    activities: { id: string; message: string; actor: string; createdAt: string }[];
};

type DraftFile = { name: string; type: string; base64: string };

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'];
const JSON_HEADERS = { 'content-type': 'application/json' };

export default function DealPage() {
    const { id } = useParams<{ id: string }>();
    const [deal, setDeal] = useState<Deal | null>(null);
    const [draggedMilestone, setDraggedMilestone] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState('');
    const [draft, setDraft] = useState<Record<string, string>>({});
    const [urlDraft, setUrlDraft] = useState<Record<string, string>>({});
    const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
    const [fileDraft, setFileDraft] = useState<Record<string, DraftFile[]>>({});
    const [agreement, setAgreement] = useState('');
    const [editing, setEditing] = useState(false);
    const [question, setQuestion] = useState('');
    const [paypalEmail, setPaypalEmail] = useState('');
    const [answer, setAnswer] = useState('');
    const loadSequence = useRef(0);

    useEffect(() => {
        setDeal(null);
        setError('');
        setNotice('');
        setAgreement('');
        setPaypalEmail('');
        setEditing(false);
        setDraft({});
        setUrlDraft({});
        setNoteDraft({});
        setFileDraft({});
        setQuestion('');
        setAnswer('');
        setBusy('');
    }, [id]);

    async function load() {
        const requestId = id;
        const sequence = ++loadSequence.current;
        const r = await fetch(`/api/deals/${encodeURIComponent(requestId)}`, { credentials: 'include', cache: 'no-store' });
        const d = await r.json();
        if (sequence !== loadSequence.current) return;
        if (r.ok) {
            if (d.id !== requestId) {
                setError('The deal response did not match the selected deal. Please reload.');
                return;
            }
            setDeal(d);
            setAgreement(d.agreement?.body || '');
            setPaypalEmail(d.providerPaypalEmail || '');
        } else {
            setError(d.error || 'Could not load deal.');
        }
    }

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    async function approve() {
        setBusy('approve');
        const r = await fetch(`/api/deals/${id}/agreements/approve`, { method: 'POST', credentials: 'include' });
        if (!r.ok) setError((await r.json()).error);
        await load();
        setBusy('');
    }

    async function sendInvitation() {
        setBusy('invite');
        setError('');
        setNotice('');
        try {
            const response = await fetch(`/api/deals/${encodeURIComponent(id)}/invite`, {
                method: 'POST',
                credentials: 'include',
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Could not send the invitation.');
            setNotice('Invitation submitted. The provider should check their email and create or sign in to the account using the invited address.');
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not send the invitation.');
        } finally {
            setBusy('');
        }
    }

    async function saveAgreement() {
        setBusy('agreement');
        const r = await fetch(`/api/deals/${id}/agreements`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            credentials: 'include',
            body: JSON.stringify({ body: agreement }),
        });
        if (!r.ok) setError((await r.json()).error);
        else setEditing(false);
        await load();
        setBusy('');
    }

    async function saveOrder(ids: string[]) {
        setBusy('order');
        const r = await fetch(`/api/deals/${id}`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            credentials: 'include',
            body: JSON.stringify({ milestoneIds: ids }),
        });
        if (!r.ok) setError((await r.json()).error || 'Could not reorder milestones.');
        await load();
        setBusy('');
    }

    async function moveMilestone(draggedId: string, targetId: string) {
        if (!deal || draggedId === targetId) return;
        const ids = deal.milestones.map((m) => m.id);
        const from = ids.indexOf(draggedId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(from, 1);
        ids.splice(to, 0, draggedId);
        await saveOrder(ids);
        setDraggedMilestone(null);
    }

    async function reorder(index: number, delta: number) {
        if (!deal) return;
        const ids = deal.milestones.map((m) => m.id);
        const target = index + delta;
        if (target < 0 || target >= ids.length) return;
        [ids[index], ids[target]] = [ids[target], ids[index]];
        await saveOrder(ids);
    }

    async function selectFiles(milestoneId: string, list: FileList | null) {
        if (!list) return;
        const chosen = Array.from(list).slice(0, 3);
        const encoded = await Promise.all(
            chosen.map(
                (file) =>
                    new Promise<DraftFile>((resolve, reject) => {
                        if (file.size > 4 * 1024 * 1024 || !ALLOWED_TYPES.includes(file.type)) {
                            reject(new Error('Only JPG, PNG, WebP, PDF and TXT files up to 4 MB are supported.'));
                            return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => resolve({ name: file.name, type: file.type, base64: String(reader.result) });
                        reader.onerror = () => reject(new Error('Could not read selected file.'));
                        reader.readAsDataURL(file);
                    }),
            ),
        );
        setFileDraft((x) => ({ ...x, [milestoneId]: encoded }));
    }

    async function submit(m: Mile, revisionOfId?: string) {
        const content = draft[m.id]?.trim() || '';
        const urls = (urlDraft[m.id] || '')
            .split(/\r?\n/)
            .map((x) => x.trim())
            .filter(Boolean);
        const files = fileDraft[m.id] || [];
        if (content.length < 10 && !urls.length && !files.length) {
            return setError('Add a description, public URL, or supported file.');
        }
        setBusy(m.id);
        const r = await fetch(`/api/milestones/${m.id}/submissions`, {
            method: 'POST',
            headers: JSON_HEADERS,
            credentials: 'include',
            body: JSON.stringify({ content, notes: noteDraft[m.id] || '', urls, files, revisionOfId }),
        });
        const d = await r.json();
        if (!r.ok) {
            setError(d.error);
        } else {
            setDraft((x) => ({ ...x, [m.id]: '' }));
            setUrlDraft((x) => ({ ...x, [m.id]: '' }));
            setNoteDraft((x) => ({ ...x, [m.id]: '' }));
            setFileDraft((x) => ({ ...x, [m.id]: [] }));
            if (d.assessmentState === 'CONFIGURATION_REQUIRED' || d.assessmentState === 'FAILED') {
                setError(d.assessmentMessage);
            }
            await load();
        }
        setBusy('');
    }

    async function savePaypalEmail() {
        setBusy('paypal-email');
        const r = await fetch('/api/profile/paypal', {
            method: 'PATCH',
            headers: JSON_HEADERS,
            credentials: 'include',
            body: JSON.stringify({ paypalMerchantEmail: paypalEmail }),
        });
        const d = await r.json();
        if (!r.ok) {
            setError(d.error || 'Could not save PayPal receiving account.');
        } else {
            setPaypalEmail(d.paypalMerchantEmail);
            await load();
        }
        setBusy('');
    }

    async function reviewSubmission(submissionId: string, action: 'REQUEST_REVISION' | 'HUMAN_REVIEW') {
        setBusy('review:' + submissionId);
        const r = await fetch(`/api/submissions/${submissionId}/review`, {
            method: 'POST',
            headers: JSON_HEADERS,
            credentials: 'include',
            body: JSON.stringify({ action }),
        });
        const d = await r.json();
        if (!r.ok) setError(d.error || 'Could not submit review request.');
        else await load();
        setBusy('');
    }

    async function retryAssessment(submissionId: string) {
        setBusy('assessment:' + submissionId);
        const r = await fetch(`/api/submissions/${submissionId}/assess`, { method: 'POST', credentials: 'include' });
        const d = await r.json();
        if (!r.ok) setError(d.error || 'Assessment retry failed.');
        await load();
        setBusy('');
    }

    async function ask() {
        setBusy('ask');
        const r = await fetch('/api/ai/ask', {
            method: 'POST',
            headers: JSON_HEADERS,
            credentials: 'include',
            body: JSON.stringify({ dealId: id, question }),
        });
        const d = await r.json();
        setAnswer(r.ok ? d.answer : d.error);
        setBusy('');
    }

    if (!deal) return <main className="shell">{error || 'Loading…'}</main>;

    const isBuyer = deal.viewerRole === 'BUYER';
    const isProvider = deal.viewerRole === 'PROVIDER';
    const approved = isBuyer ? deal.agreement?.buyerApprovedAt : deal.agreement?.providerApprovedAt;
    const paid = deal.payments.some((p) => p.status === 'COMPLETED');
    const paymentStatus = deal.payments[0]?.status;

    const paymentMessage = paid
        ? 'Payment verified server-side.'
        : paymentStatus === 'FAILED'
            ? 'Payment failed. Review the status and agreement before trying again.'
            : paymentStatus === 'CANCELLED'
                ? 'PayPal checkout was cancelled.'
                : paymentStatus === 'CAPTURE_PENDING'
                    ? (deal.payments[0]?.failureReason === 'PAYPAL_CAPTURE_PENDING:PENDING_REVIEW' ? 'Payment is under PayPal review. The capture is saved as pending; it is not marked successful until PayPal confirms it.' : 'PayPal returned a pending capture. TrustFlow saved it and is checking for final confirmation.')
                    : paymentStatus === 'APPROVED'
                        ? 'PayPal order approved; awaiting capture.'
                        : 'No verified payment yet.';

    return (
        <main className="shell">
            <header className="topbar">
                <Link href="/dashboard" className="textlink">
                    <ArrowLeft size={14} /> Workspace
                </Link>
                <div className="brand">
                    <div className="brandmark">t</div>trustflow.
                </div>
                <a className="textlink" href="/notifications">
                    Notifications
                </a>
            </header>

            <section style={{ padding: '30px 0 16px' }}>
                <div className="eyebrow">
                    {deal.viewerRole.toLowerCase()} workspace · {deal.status}
                </div>
                <h1 className="display" style={{ fontSize: 42, fontWeight: 500, margin: '10px 0' }}>
                    {deal.title}
                </h1>
                <p style={{ color: '#64748B' }}>{deal.description}</p>
            </section>

            {error && <p className="error">{error}</p>}
            {notice && <p className="dealmeta" role="status">{notice}</p>}

            <div className="deal-layout">
                <div style={{ display: 'grid', gap: 18 }}>
                    <section id="agreement" className="card" style={{ padding: 22 }}>
                        <div className="cardhead">
                            <strong>
                                <FileText size={15} /> Agreement
                            </strong>
                            <span className="badge">v{deal.agreement?.version || 1}</span>
                        </div>
                        {editing ? (
                            <textarea
                                value={agreement}
                                onChange={(e) => setAgreement(e.target.value)}
                                style={{ width: '100%', minHeight: 240 }}
                            />
                        ) : (
                            <pre style={{ whiteSpace: 'pre-wrap', font: '13px/1.65 Arial', color: '#475569' }}>
                                {deal.agreement?.body}
                            </pre>
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="primary" disabled={busy === 'approve' || !!approved} onClick={approve}>
                                {approved ? 'Approved' : 'Approve current version'}
                            </button>
                            {isBuyer && (
                                <button className="secondary" onClick={() => (editing ? void saveAgreement() : setEditing(true))}>
                                    {editing ? (busy === 'agreement' ? 'Saving…' : 'Save new version') : 'Edit agreement'}
                                </button>
                            )}
                        </div>
                    </section>

                    <section id="milestones" className="card" style={{ padding: 22 }}>
                        <div className="cardhead">
                            <strong>Milestones &amp; evidence</strong>
                            <span className="dealmeta">Keyboard reordering enabled</span>
                        </div>

                        {deal.milestones.map((m, index) => {
                            const subs = deal.submissions.filter((s) => s.milestoneId === m.id);
                            return (
                                <article
                                    key={m.id}
                                    draggable={isBuyer}
                                    onDragStart={() => setDraggedMilestone(m.id)}
                                    onDragOver={(e) => {
                                        if (draggedMilestone) e.preventDefault();
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        if (draggedMilestone) void moveMilestone(draggedMilestone, m.id);
                                    }}
                                    onDragEnd={() => setDraggedMilestone(null)}
                                    style={{
                                        borderTop: '1px solid #f0e9dc',
                                        padding: '16px 0',
                                        opacity: draggedMilestone === m.id ? 0.55 : 1,
                                        cursor: isBuyer ? 'grab' : 'default',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                        <div>
                                            <strong>
                                                {m.title} · ${(m.amount / 100).toFixed(2)}
                                            </strong>
                                            <p className="dealmeta">{m.description}</p>
                                        </div>
                                        <div>
                                            {isBuyer && (
                                                <>
                                                    <button
                                                        className="secondary"
                                                        disabled={index === 0 || busy === 'order'}
                                                        aria-label="Move milestone up"
                                                        onClick={() => reorder(index, -1)}
                                                    >
                                                        <ArrowUp size={14} />
                                                    </button>
                                                    <button
                                                        className="secondary"
                                                        disabled={index === deal.milestones.length - 1 || busy === 'order'}
                                                        aria-label="Move milestone down"
                                                        onClick={() => reorder(index, 1)}
                                                    >
                                                        <ArrowDown size={14} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {subs.map((s) => {
                                        let a: any = null;
                                        try {
                                            a = s.assessment ? JSON.parse(s.assessment) : null;
                                        } catch {
                                            a = null;
                                        }
                                        return (
                                            <div
                                                id={'submission-' + s.id}
                                                key={s.id}
                                                style={{ padding: 10, margin: '8px 0', background: '#f8f5ee', borderRadius: 8, fontSize: 12 }}
                                            >
                                                <strong>{s.revisionOfId ? 'Revision' : 'Evidence'}</strong>
                                                <p>{s.content}</p>
                                                {s.notes && <p className="dealmeta">Notes: {s.notes}</p>}

                                                {a ? (
                                                    <>
                                                        <b>
                                                            {a.status || a.overall} ·{' '}
                                                            {a.overallScore !== undefined ? a.overallScore + '/100' : a.recommendedAction}
                                                        </b>
                                                        <p>{a.explanation || a.summary}</p>
                                                        {(a.criteriaResults || a.criteria || []).map((item: any, i: number) => (
                                                            <div key={i}>
                                                                • {item.criterion}: {item.status} — {item.reason}
                                                            </div>
                                                        ))}
                                                        {a.missingEvidence?.length > 0 && <p>Missing evidence: {a.missingEvidence.join('; ')}</p>}
                                                        {a.concerns?.length > 0 && <p>Concerns: {a.concerns.join('; ')}</p>}
                                                        {a.recommendation && <p>Recommendation: {a.recommendation}</p>}
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="dealmeta">
                                                            {s.status === 'ASSESSMENT_FAILED'
                                                                ? 'Assessment unavailable; evidence is saved.'
                                                                : 'Assessment pending.'}
                                                        </span>
                                                        <button
                                                            className="secondary"
                                                            disabled={busy === 'assessment:' + s.id}
                                                            onClick={() => retryAssessment(s.id)}
                                                        >
                                                            {busy === 'assessment:' + s.id ? 'Retrying…' : 'Retry AI assessment'}
                                                        </button>
                                                    </>
                                                )}

                                                {isBuyer && (
                                                    <button
                                                        className="secondary"
                                                        disabled={busy === 'review:' + s.id}
                                                        onClick={() => reviewSubmission(s.id, 'REQUEST_REVISION')}
                                                    >
                                                        Request revision
                                                    </button>
                                                )}
                                                <button
                                                    className="secondary"
                                                    disabled={busy === 'review:' + s.id}
                                                    onClick={() => reviewSubmission(s.id, 'HUMAN_REVIEW')}
                                                >
                                                    Request human review
                                                </button>

                                                {(s.urls || []).map((url) => (
                                                    <p key={url}>
                                                        <a className="textlink" href={url} target="_blank" rel="noreferrer">
                                                            {url}
                                                        </a>
                                                    </p>
                                                ))}
                                                {(s.fileMetadata || []).map((file) => (
                                                    <p key={file.id}>
                                                        <a className="textlink" href={file.url}>
                                                            {file.filename} · {(file.size / 1024).toFixed(0)} KB
                                                        </a>
                                                    </p>
                                                ))}
                                            </div>
                                        );
                                    })}

                                    {isProvider && (
                                        <div className="field">
                                            <textarea
                                                value={draft[m.id] || ''}
                                                onChange={(e) => setDraft((x) => ({ ...x, [m.id]: e.target.value }))}
                                                placeholder="Describe completed work and test results"
                                            />
                                            <textarea
                                                value={noteDraft[m.id] || ''}
                                                onChange={(e) => setNoteDraft((x) => ({ ...x, [m.id]: e.target.value }))}
                                                placeholder="Additional submission notes (optional)"
                                                rows={2}
                                            />
                                            <textarea
                                                value={urlDraft[m.id] || ''}
                                                onChange={(e) => setUrlDraft((x) => ({ ...x, [m.id]: e.target.value }))}
                                                placeholder="Evidence URLs (one per line; public HTTP/HTTPS only)"
                                                rows={2}
                                            />
                                            <input
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
                                                multiple
                                                onChange={(e) => void selectFiles(m.id, e.target.files).catch((err) => setError(err.message))}
                                            />
                                            {(fileDraft[m.id] || []).map((file) => (
                                                <span className="dealmeta" key={file.name}>
                                                    {file.name}
                                                </span>
                                            ))}
                                            <button className="secondary" disabled={busy === m.id} onClick={() => submit(m, subs[0]?.id)}>
                                                <Send size={13} /> {busy === m.id ? 'Submitting…' : subs.length ? 'Submit revision' : 'Submit evidence'}
                                            </button>
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </section>
                </div>

                <aside style={{ display: 'grid', alignContent: 'start', gap: 18 }}>
                    <DisputeSummary dealId={id} />
                    <NegotiationPanel dealId={id} />

                    {isProvider && (
                        <section id="payment" className="card" style={{ padding: 21 }}>
                            <div className="eyebrow">
                                <WalletCards size={13} /> PayPal receiving account
                            </div>
                            <p className="dealmeta">
                                Enter the PayPal merchant email that should receive this deal payment directly. TrustFlow does not
                                receive or hold the funds.
                            </p>
                            <input
                                type="email"
                                value={paypalEmail}
                                onChange={(e) => setPaypalEmail(e.target.value)}
                                placeholder="merchant@example.com"
                            />
                            <button
                                className="secondary"
                                disabled={busy === 'paypal-email' || !paypalEmail.trim()}
                                onClick={savePaypalEmail}
                            >
                                {busy === 'paypal-email' ? 'Saving…' : 'Save receiving account'}
                            </button>
                        </section>
                    )}

                    <section className="card" style={{ padding: 21 }}>
                        <div className="eyebrow">
                            <WalletCards size={13} /> PayPal Sandbox
                        </div>
                        <p>
                            Deal total: {(deal.amount / 100).toFixed(2)} {deal.currency}
                        </p>
                        <p>{paymentMessage}</p>
                        {deal.payments[0]?.captureId && <p className="dealmeta">PayPal capture ID: {deal.payments[0].captureId}</p>}
                        {deal.payments[0]?.failureReason?.startsWith('PAYPAL_CAPTURE_PENDING:') && <p className="dealmeta">PayPal capture reason: {deal.payments[0].failureReason.replace('PAYPAL_CAPTURE_PENDING:', '').replaceAll('_', ' ').toLowerCase()}</p>}
                        <p className="dealmeta">
                            PayPal processes payment directly. TrustFlow does not hold funds or guarantee delivery.
                        </p>
                        {!deal.agreement?.buyerApprovedAt || !deal.agreement?.providerApprovedAt ? (
                            <div className="dealmeta" style={{ color: '#B42318', margin: '12px 0' }}>
                                <strong>Both parties must approve the current agreement before payment.</strong>
                                <div style={{ marginTop: 6 }}>
                                    Buyer: {deal.agreement?.buyerApprovedAt ? 'approved' : 'approval needed'} · Provider: {deal.agreement?.providerApprovedAt ? 'approved' : 'approval needed'}
                                </div>
                                {!deal.providerPaypalEmail && isBuyer && (
                                    <div style={{ marginTop: 6 }}>
                                        The provider must create an account with {deal.providerEmail || 'the invited email'} and open this deal to review and approve it.
                                    </div>
                                )}
                                {isBuyer && deal.providerEmail && (
                                    <button className="secondary" type="button" disabled={busy === 'invite'} onClick={() => void sendInvitation()} style={{ marginTop: 10 }}>
                                        {busy === 'invite' ? 'Sending invitation…' : 'Send invitation to provider'}
                                    </button>
                                )}
                            </div>
                        ) : null}
                        {isBuyer && !paid && <PayPalCheckout dealId={id} pendingOrderId={paymentStatus === 'CAPTURE_PENDING' || paymentStatus === 'APPROVED' ? deal.payments[0]?.paypalOrderId : undefined} onVerified={() => void load()} />}
                    </section>

                    <section className="card" style={{ padding: 21 }}>
                        <div className="eyebrow">
                            <MessageCircle size={13} /> Ask AI
                        </div>
                        <textarea
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="Ask about this agreement"
                        />
                        <button className="secondary" disabled={busy === 'ask' || question.trim().length < 3} onClick={ask}>
                            Ask about this deal
                        </button>
                        {answer && <p style={{ fontSize: 12, lineHeight: 1.6 }}>{answer}</p>}
                    </section>

                    <section className="card" style={{ padding: 21 }}>
                        <div className="eyebrow">Email delivery</div>
                        {deal.emailLogs.length ? (
                            deal.emailLogs.map((log) => (
                                <div key={log.id} className="dealmeta" style={{ borderTop: '1px solid #f0e9dc', padding: '9px 0' }}>
                                    <strong>{log.type.replaceAll('_', ' ').toLowerCase()}</strong>
                                      <span style={{ float: 'right' }}>{log.status === 'SENT' ? 'Accepted by SMTP' : log.status.toLowerCase()}</span>
                                    <div>{new Date(log.createdAt).toLocaleString()}</div>
                                      {log.sentAt && <div>Accepted by SMTP · {new Date(log.sentAt).toLocaleString()}</div>}
                                      {log.messageId && <div>Message ID · {log.messageId}</div>}
                                      {log.lastError?.startsWith('SMTP configuration required.') && (
                                        <div style={{ color: '#B45309' }}>
                                              Email configuration required: set the SMTP environment variables.
                                        </div>
                                    )}
                                      {log.status === 'FAILED' && !log.lastError?.startsWith('SMTP configuration required.') && (
                                        <div style={{ color: '#B45309' }}>Delivery failed. The email can be retried.</div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p className="dealmeta">No email notifications have been logged for this deal yet.</p>
                        )}
                        <p className="dealmeta">
                              “Accepted by SMTP” means Gmail accepted the message for sending; inbox delivery is not confirmed.
                        </p>
                    </section>

                    <ActivityTimeline dealId={id} />
                </aside>
            </div>
        </main>
    );
}
