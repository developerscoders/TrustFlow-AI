import Link from 'next/link';
import {ArrowRight,CheckCircle2,FileCheck2,Handshake,LockKeyhole,Sparkles,WalletCards,Workflow} from 'lucide-react';

const steps=[
  {number:'01',title:'Describe the work',body:'Start with a plain-language brief. TrustFlow AI helps identify scope, assumptions, deadlines, and missing details.'},
  {number:'02',title:'Agree on the terms',body:'Turn the brief into a versioned agreement with milestones and acceptance criteria both parties can review.'},
  {number:'03',title:'Pay and deliver',body:'PayPal processes the payment directly. The provider shares milestone evidence in the deal workspace.'},
  {number:'04',title:'Review with evidence',body:'AI compares submitted evidence with the agreed criteria and highlights gaps for people to review.'}
];

export default function LandingPage(){
  return <main className="landing">
    <header className="landing-nav">
      <Link href="/" className="brand"><span className="brandmark">t</span>trustflow<span style={{color:'#2F5BEA'}}>.</span></Link>
      <nav><a href="#how-it-works">How it works</a><a href="#features">Features</a><a href="#payments">Payments</a></nav>
      <div className="landing-nav-actions"><Link className="landing-login" href="/login">Sign in</Link><Link className="primary" href="/register">Get started <ArrowRight size={14}/></Link></div>
    </header>

    <section className="landing-hero">
      <div className="landing-copy">
        <div className="landing-kicker"><span className="pulse-dot"/> A better way to work together</div>
        <h1>Make a deal.<br/><span>Build trust.</span></h1>
        <p>Turn scattered conversations into clear agreements, trackable milestones, and evidence-led reviews — with AI helping both sides stay aligned.</p>
        <div className="landing-cta"><Link className="primary" href="/register">Create your free workspace <ArrowRight size={15}/></Link><Link className="landing-secondary" href="/login">I already have an account</Link></div>
        <div className="landing-proof"><span><CheckCircle2 size={14}/> Clear shared terms</span><span><CheckCircle2 size={14}/> Evidence-led delivery</span></div>
      </div>
      <div className="landing-visual" aria-label="Agreement to evidence workflow illustration">
        <div className="beam-orb orb-one"/><div className="beam-orb orb-two"/>
        <div className="visual-top"><span className="visual-dot"/> TRUSTFLOW WORKFLOW <span className="visual-live">LIVE FLOW</span></div>
        <div className="visual-line"><div className="visual-line-fill"/></div>
        <div className="visual-steps">
          <div className="visual-step"><span><Handshake size={19}/></span><b>Agree</b><small>Shared scope</small></div>
          <div className="visual-step"><span><FileCheck2 size={19}/></span><b>Define</b><small>Clear criteria</small></div>
          <div className="visual-step"><span><WalletCards size={19}/></span><b>Pay</b><small>PayPal checkout</small></div>
          <div className="visual-step"><span><Workflow size={19}/></span><b>Deliver</b><small>Submit proof</small></div>
          <div className="visual-step"><span><Sparkles size={19}/></span><b>Review</b><small>AI assistance</small></div>
        </div>
        <div className="visual-note"><span className="visual-check"><CheckCircle2 size={15}/></span><div><b>Every step stays connected</b><small>Terms · Milestones · Evidence · Activity</small></div></div>
        <div className="visual-caption">A shared record of what was agreed and what was delivered.</div>
      </div>
    </section>

    <section className="landing-trust-strip"><div><b>Clarity before commitment</b><span>Agree on scope before work begins.</span></div><div><b>Evidence over assumptions</b><span>Review work against agreed criteria.</span></div><div><b>People stay in control</b><span>AI assists. Parties make decisions.</span></div></section>

    <section className="landing-section" id="how-it-works">
      <div className="landing-section-heading"><div className="eyebrow">A simple shared process</div><h2>From the first brief<br/>to the final proof.</h2><p>Keep the conversation, commitments, and delivery record in one place.</p></div>
      <div className="landing-steps">{steps.map(step=><article className="landing-step" key={step.number}><span>{step.number}</span><h3>{step.title}</h3><p>{step.body}</p></article>)}</div>
    </section>

    <section className="landing-feature" id="features"><div><div className="eyebrow">Designed for both sides</div><h2>Less ambiguity.<br/><span>More confidence.</span></h2><p>Freelancers, clients, agencies, and independent teams can work from the same approved agreement instead of relying on scattered messages and memory.</p><Link className="landing-secondary" href="/register">Start a workspace <ArrowRight size={14}/></Link></div><div className="feature-list"><article><span><Sparkles size={17}/></span><div><b>AI-assisted deal setup</b><p>Surface missing details and draft milestones from a plain-language description.</p></div></article><article><span><FileCheck2 size={17}/></span><div><b>Versioned agreements</b><p>Keep approvals attached to the exact terms each party reviewed.</p></div></article><article><span><CheckCircle2 size={17}/></span><div><b>Evidence-based review</b><p>Compare submissions with acceptance criteria and highlight what needs attention.</p></div></article><article><span><LockKeyhole size={17}/></span><div><b>Participant-scoped workspace</b><p>Keep deal records and discussions available to the people involved.</p></div></article></div></section>

    <section className="landing-payments" id="payments"><div className="payment-icon"><WalletCards size={22}/></div><div><div className="eyebrow">Transparent payment flow</div><h2>Payments are processed by PayPal.</h2><p>TrustFlow does not hold funds, operate escrow, guarantee delivery, or make automatic payouts. Payment availability depends on PayPal account eligibility, region, and configuration.</p></div><Link className="landing-secondary" href="/register">Explore TrustFlow <ArrowRight size={14}/></Link></section>
    <footer className="landing-footer"><Link href="/" className="brand"><span className="brandmark">t</span>trustflow.</Link><span>© 2026 TrustFlow AI · Make a deal. Build trust.</span><div><Link href="/login">Sign in</Link><Link href="/register">Create account</Link></div></footer>
  </main>;
}
