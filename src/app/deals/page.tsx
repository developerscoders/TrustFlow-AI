'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';

type DealSummary = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  status: string;
  buyerName: string;
  providerName: string;
  milestones: { id: string; status: string }[];
  agreement: { buyerApprovedAt: string | null; providerApprovedAt: string | null } | null;
};

export default function DealsPage() {
  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/deals', { credentials: 'include' })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign('/login');
          return [];
        }
        if (!response.ok) throw new Error('Could not load your deals. Please try again.');
        return response.json() as Promise<DealSummary[]>;
      })
      .then((items) => { if (active) setDeals(items); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load your deals.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <Link href="/dashboard" className="textlink"><ArrowLeft size={14} /> Workspace</Link>
        <div className="brand"><div className="brandmark">t</div>trustflow<span style={{ color: '#2F5BEA' }}>.</span></div>
        <span />
      </header>
      <section style={{ marginTop: 42 }}>
        <div className="eyebrow">Workspace</div>
        <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 42, fontWeight: 400, margin: '8px 0 24px' }}>All deals</h1>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="card">
          {loading ? <div className="empty">Loading your deals…</div> : deals.length === 0 ? <div className="empty">No deals yet. Create your first deal from your workspace.</div> : deals.map((deal) => (
            <Link key={deal.id} href={`/deals/${encodeURIComponent(deal.id)}`} className="dealrow" style={{ color: 'inherit', textDecoration: 'none' }}>
              <div><div className="dealtitle">{deal.title}</div><div className="dealmeta">{deal.buyerName} → {deal.providerName}</div></div>
              <span className={'badge ' + (deal.status === 'ACTIVE' ? 'green' : '')}>{deal.status.toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</span>
              <div className="dealmeta">{deal.milestones.length} milestones · {deal.agreement?.buyerApprovedAt && deal.agreement.providerApprovedAt ? 'Agreed' : 'Awaiting approval'}</div>
              <div className="amount">${(deal.amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} {deal.currency}</div>
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
