export type PayPalCheckoutConfiguration =
  | { ok: true; mode: 'standard' }
  | { ok: false; code: 'PAYPAL_MULTIPARTY_NOT_CONFIGURED'; message: string };

export function paypalClientIdsMatch(browserClientId: string | null | undefined, serverClientId: string | null | undefined): boolean {
  return Boolean(browserClientId?.trim() && serverClientId?.trim() && browserClientId.trim() === serverClientId.trim());
}

/**
 * Standard Checkout sends funds to the merchant account associated with the
 * REST app credentials. It does not support choosing a different provider as
 * the payee. No merchant email or merchant ID needs to be copied into env.
 */
export function resolvePayPalCheckoutConfiguration(
  _providerEmail?: string | null,
  env: Record<string, string | undefined> = process.env,
): PayPalCheckoutConfiguration {
  if (env.PAYPAL_INTEGRATION_MODE?.trim().toLowerCase() === 'multiparty') {
    return {
      ok: false,
      code: 'PAYPAL_MULTIPARTY_NOT_CONFIGURED',
      message: 'PayPal Multiparty checkout is unavailable until TrustFlow completes PayPal partner onboarding.',
    };
  }
  return { ok: true, mode: 'standard' };
}
