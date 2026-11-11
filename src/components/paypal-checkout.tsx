'use client';
import { useEffect, useRef, useState } from 'react';
declare global { interface Window { paypal?: { Buttons: (config: Record<string, any>) => { render: (node: HTMLElement) => Promise<void> | void } } } }
type CheckoutState = 'loading' | 'ready' | 'processing' | 'missing' | 'error';
export function PayPalCheckout({ dealId, onVerified }: { dealId: string; onVerified: () => void }) {
    const host = useRef<HTMLDivElement>(null), mounted = useRef(true), onVerifiedRef = useRef(onVerified); onVerifiedRef.current = onVerified;
    const [state, setState] = useState<CheckoutState>('loading'), [message, setMessage] = useState('');
    useEffect(() => {
        mounted.current = true;
        // PayPal's browser SDK requires the public client ID. The server-only
        // PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET remain in the API routes.
        const client = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
        if (!client) { setState('missing'); return () => { mounted.current = false } }
        const boot = async () => {
            if (!host.current || !window.paypal) return;
            host.current.replaceChildren();
            try {
                await window.paypal.Buttons({
                    style: { layout: 'vertical', shape: 'rect', label: 'paypal' },
                    createOrder: async () => {
                        const response = await fetch('/api/payments/create-order', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ dealId }) });
                        const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not create a PayPal order.');
                        return data.id;
                    },
                    onApprove: async (data: { orderID: string }) => {
                        if (!mounted.current) return;
                        setState('processing'); setMessage('Verifying capture with PayPal…');
                        try {
                            const response = await fetch('/api/payments/capture-order', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ orderId: data.orderID }) });
                            const result = await response.json();
                            if (response.status === 202 && result.status === 'CAPTURE_PENDING') { if (mounted.current) { setState('ready'); setMessage('PayPal is still processing the capture. TrustFlow will show completion only after verification.'); onVerifiedRef.current() } return }
                            if (!response.ok || result.status !== 'COMPLETED' || result.verified !== true) throw new Error(result.error || 'Payment could not be verified.');
                            if (mounted.current) { setMessage('Payment verified by PayPal.'); setState('ready'); onVerifiedRef.current() }
                        } catch (error) { if (mounted.current) { setState('error'); setMessage(error instanceof Error ? error.message : 'Payment verification failed. Retry from the checkout button.') } }
                    },
                    onCancel: () => { if (mounted.current) { setState('ready'); setMessage('Checkout was cancelled. No payment was recorded as completed.') } },
                    onError: (error: unknown) => { if (mounted.current) { setState('error'); setMessage(error instanceof Error ? error.message : 'PayPal checkout failed. Please retry.') } }
                }).render(host.current);
                if (mounted.current) setState('ready');
            } catch (error) { if (mounted.current) { setState('error'); setMessage(error instanceof Error ? error.message : 'PayPal checkout could not initialize.') } }
        };
        const existing = document.querySelector<HTMLScriptElement>('script[data-paypal-sdk]');
        if (window.paypal) { void boot() }
        else if (existing) { existing.addEventListener('load', boot, { once: true }); existing.addEventListener('error', () => { if (mounted.current) { setState('error'); setMessage('PayPal SDK failed to load.') } }, { once: true }) }
        else {
            const script = document.createElement('script'); script.dataset.paypalSdk = 'true'; script.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(client) + '&currency=USD&intent=capture'; script.onload = () => void boot(); script.onerror = () => { if (mounted.current) { setState('error'); setMessage('PayPal SDK failed to load.') } }; document.head.appendChild(script);
        }
        return () => { mounted.current = false };
    }, [dealId]);
    if (state === 'missing') return <p className="dealmeta">PayPal checkout is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET for the server, plus NEXT_PUBLIC_PAYPAL_CLIENT_ID for the browser. Use matching Sandbox credentials and redeploy after changing Vercel environment variables.</p>;
    return <div><div ref={host} />{state === 'loading' && <p className="dealmeta">Loading PayPal Sandbox checkout…</p>}{state === 'processing' && <p className="dealmeta">{message || 'Verifying payment…'}</p>}{message && state !== 'processing' && <p className={state === 'error' ? 'error' : 'dealmeta'}>{message}</p>}{state === 'error' && <button type="button" className="secondary" onClick={() => { setMessage('Reload the deal page to restart checkout.'); }}>Checkout help</button>}</div>;
}
