export async function captureApprovedPayPalOrder<T extends { status?: string }>(
  approvedOrder: T,
  orderId: string,
  requestId: string,
  deps: {
    captureOrder: (orderId: string, requestId: string) => Promise<T>;
    getOrder: (orderId: string) => Promise<T>;
  },
): Promise<T> {
  if (approvedOrder.status !== 'APPROVED') return approvedOrder;
  try {
    return await deps.captureOrder(orderId, requestId);
  } catch {
    // Capture may have succeeded even if the response was lost. Reconcile the
    // PayPal order instead of issuing a new capture request.
    return deps.getOrder(orderId);
  }
}
