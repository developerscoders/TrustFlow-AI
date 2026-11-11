'use client';
import { useEffect, useRef, useState } from 'react';
declare global { interface Window { paypal?: { Buttons: (config: Record<string, any>) => { render: (node: HTMLElement) => Promise<void> | void } } } }
type CheckoutState = 'loading' | 'ready' | 'processing' | 'missing' | 'error';
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
export function PayPalCheckout({ dealId, pendingOrderId, onVerified }: { dealId: string; pendingOrderId?: string; onVerified: () => void }) {
    const host = useRef<HTMLDivElement>(null), mounted = useRef(true), onVerifiedRef = useRef(onVerified); onVerifiedRef.current = onVerified;
    const orderIdRef = useRef<string | undefined>(pendingOrderId), verifyingOrderRef = useRef<string | null>(null);
    const [state, setState] = useState<CheckoutState>('loading'), [message, setMessage] = useState('');
    orderIdRef.current = pendingOrderId || orderIdRef.current;

    async function verifyOrder(orderId: string) {
        if (verifyingOrderRef.current === orderId) return;
        verifyingOrderRef.current = orderId;
        setState('processing');
        setMessage('Checking the PayPal order and capture with TrustFlow…');
        host.current?.replaceChildren();
        try {
            for (let attempt = 0; attempt < 5; attempt++) {
                const response = await fetch('/api/payments/capture-order', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ orderId }) });
                const result = await response.json();
                if (response.ok && result.status === 'COMPLETED' && result.verified === true) {
                    if (mounted.current) { setMessage('Payment verified by PayPal.'); setState('ready'); onVerifiedRef.current() }
                    return;
                }
                const retryable = (response.status === 202 && result.status === 'CAPTURE_PENDING') || (response.status === 502 && /not completed the capture|still processing/i.test(String(result.error || '')));
                if (!retryable) throw new Error(result.error || 'TrustFlow could not verify the PayPal payment.');
                if (mounted.current) setMessage('PayPal has not returned final capture confirmation yet. TrustFlow is checking again…');
                onVerifiedRef.current();
                if (attempt < 4) await wait(2000);
            }
            if (mounted.current) { setState('ready'); setMessage('PayPal still has not confirmed the capture. Use “Check payment status” shortly; the deal will show paid only after PayPal confirms it.') }
        } catch (error) {
            if (mounted.current) { setState('error'); setMessage(error instanceof Error ? error.message : 'TrustFlow could not verify the PayPal payment. Check the status again shortly.') }
        } finally {
            if (verifyingOrderRef.current === orderId) verifyingOrderRef.current = null;
        }
    }

    useEffect(() => {
        if (pendingOrderId) void verifyOrder(pendingOrderId);
        // A pending payment is reconciled on entry; its order ID is stable for retries.
    }, [pendingOrderId]);

    useEffect(() => {
        mounted.current = true;
        // Existing approved or pending orders use server-side reconciliation;
        // never offer a second PayPal approval button for the same order.
        if (pendingOrderId) return () => { mounted.current = false };
        // PayPal's browser SDK requires the public client ID. The server-only
        // PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET remain in the API routes.
        const client = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
        if (!client) { setState('missing'); return () => { mounted.current = false } }
        const loadedSdk = document.querySelector<HTMLScriptElement>('script[data-paypal-sdk]');
        if (loadedSdk?.dataset.paypalClientId && loadedSdk.dataset.paypalClientId !== client) {
            setState('error'); setMessage('The PayPal SDK is loaded with a different Sandbox app than this deployment. Reload after setting matching Vercel PayPal client IDs.');
            return () => { mounted.current = false };
        }
        const boot = async () => {
            if (!host.current || !window.paypal) return;
            host.current.replaceChildren();
            try {
                await window.paypal.Buttons({
                    style: { layout: 'vertical', shape: 'rect', label: 'paypal' },
                    createOrder: async () => {
                        const response = await fetch('/api/payments/create-order', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ dealId, clientId: client }) });
                        const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not create a PayPal order.');
                        orderIdRef.current = data.id;
                        return data.id;
                    },
                    onApprove: async (data: { orderID: string }) => {
                        if (!mounted.current) return;
                        orderIdRef.current = data.orderID;
                        await verifyOrder(data.orderID);
                    },
                    onCancel: () => { if (mounted.current) { setState('ready'); setMessage('Checkout was cancelled. No payment was recorded as completed.') } },
                    onError: (error: unknown) => {
                        const errorMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : 'PayPal checkout failed. Please retry.';
                        if (/PAYMENT_ALREADY_DONE/i.test(errorMessage) && orderIdRef.current) {
                            void verifyOrder(orderIdRef.current);
                            return;
                        }
                        if (mounted.current) { setState('error'); setMessage(errorMessage) }
                    }
                }).render(host.current);
                if (mounted.current) setState('ready');
            } catch (error) { if (mounted.current) { setState('error'); setMessage(error instanceof Error ? error.message : 'PayPal checkout could not initialize.') } }
        };
        const existing = document.querySelector<HTMLScriptElement>('script[data-paypal-sdk]');
        if (window.paypal) { void boot() }
        else if (existing) { existing.addEventListener('load', boot, { once: true }); existing.addEventListener('error', () => { if (mounted.current) { setState('error'); setMessage('PayPal SDK failed to load.') } }, { once: true }) }
        else {
            const script = document.createElement('script'); script.dataset.paypalSdk = 'true'; script.dataset.paypalClientId = client; script.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(client) + '&currency=USD&intent=capture'; script.onload = () => void boot(); script.onerror = () => { if (mounted.current) { setState('error'); setMessage('PayPal SDK failed to load.') } }; document.head.appendChild(script);
        }
        return () => { mounted.current = false };
    }, [dealId, pendingOrderId]);
    if (state === 'missing') return <p className="dealmeta">PayPal checkout is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET for the server, plus NEXT_PUBLIC_PAYPAL_CLIENT_ID for the browser. Use matching Sandbox credentials and redeploy after changing Vercel environment variables.</p>;
    return <div>{state !== 'processing' && <div ref={host} />}{state === 'loading' && <p className="dealmeta">Loading PayPal Sandbox checkout…</p>}{state === 'processing' && <p className="dealmeta" role="status" aria-live="polite">{message || 'Verifying payment…'}</p>}{message && state !== 'processing' && <p className={state === 'error' ? 'error' : 'dealmeta'} role={state === 'error' ? 'alert' : 'status'}>{message}</p>}{(state === 'error' || pendingOrderId) && <button type="button" className="secondary" disabled={state === 'processing'} onClick={() => { const orderId = orderIdRef.current; if (orderId) void verifyOrder(orderId); else { setMessage('Reload the deal page to restart checkout.'); setState('error') } }}>{state === 'processing' ? 'Checking…' : 'Check payment status'}</button>}</div>;
}
