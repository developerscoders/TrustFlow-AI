export type PayPalCheckoutConfiguration =
  | { ok: true; mode: 'standard'; merchantEmail: string; merchantId: string }
  | { ok: false; code: 'PAYPAL_CHECKOUT_MODE_REQUIRED' | 'PAYPAL_MULTIPARTY_NOT_CONFIGURED' | 'PAYPAL_STANDARD_MERCHANT_REQUIRED' | 'PAYPAL_SELLER_MISMATCH'; message: string };

export function paypalClientIdsMatch(browserClientId: string | null | undefined, serverClientId: string | null | undefined): boolean {
  return Boolean(browserClientId?.trim() && serverClientId?.trim() && browserClientId.trim() === serverClientId.trim());
}

/**
 * This application currently has Standard Checkout credentials, not a PayPal
 * partner integration. Standard checkout can receive funds only for the
 * merchant that owns the REST app; a provider-entered email cannot redirect it.
 */
export function resolvePayPalCheckoutConfiguration(
  providerEmail: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): PayPalCheckoutConfiguration {
  const mode = env.PAYPAL_INTEGRATION_MODE?.trim().toLowerCase();
  if (mode === 'multiparty') {
    return {
      ok: false,
      code: 'PAYPAL_MULTIPARTY_NOT_CONFIGURED',
      message: 'PayPal marketplace checkout is unavailable: TrustFlow is not onboarded as a PayPal Multiparty partner. A seller email alone cannot route marketplace payments.',
    };
  }
  if (mode !== 'standard') {
    return {
      ok: false,
      code: 'PAYPAL_CHECKOUT_MODE_REQUIRED',
      message: 'PayPal checkout is disabled until PAYPAL_INTEGRATION_MODE is set to standard and the REST app owner is verified in PayPal Sandbox.',
    };
  }

  const merchantEmail = env.PAYPAL_STANDARD_MERCHANT_EMAIL?.trim().toLowerCase();
  const merchantId = env.PAYPAL_STANDARD_MERCHANT_ID?.trim();
  if (!merchantEmail) {
    return {
      ok: false,
      code: 'PAYPAL_STANDARD_MERCHANT_REQUIRED',
      message: 'Set PAYPAL_STANDARD_MERCHANT_EMAIL to the Business account that owns the Sandbox REST app. Confirm the app owner in PayPal Developer before enabling checkout.',
    };
  }
  if (!merchantId || !/^[2-9A-HJ-NP-Z]{13}$/.test(merchantId)) {
    return {
      ok: false,
      code: 'PAYPAL_STANDARD_MERCHANT_REQUIRED',
      message: 'Set PAYPAL_STANDARD_MERCHANT_ID to the 13-character merchant ID shown for the same Sandbox Business account that owns the REST app.',
    };
  }
  if (!providerEmail || providerEmail.trim().toLowerCase() !== merchantEmail) {
    return {
      ok: false,
      code: 'PAYPAL_SELLER_MISMATCH',
      message: 'This single-merchant PayPal app can only receive payments for its configured Business account. This provider must complete PayPal Multiparty seller onboarding to receive payments to a separate account.',
    };
  }
  return { ok: true, mode: 'standard', merchantEmail, merchantId };
}

/** The buyer is selected by PayPal during approval; it is never the payee. */
export function paypalPayeeMatchesConfiguredMerchant(
  payee: { email_address?: unknown; merchant_id?: unknown } | null | undefined,
  merchantEmail: string,
  merchantId?: string,
): boolean {
  if (!payee || typeof payee.email_address !== 'string') return false;
  if (payee.email_address.trim().toLowerCase() !== merchantEmail.trim().toLowerCase()) return false;
  if (!merchantId || typeof payee.merchant_id !== 'string' || payee.merchant_id !== merchantId) return false;
  return true;
}
