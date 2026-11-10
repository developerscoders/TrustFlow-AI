import test from 'node:test';
import assert from 'node:assert/strict';
import { emailTemplate } from '../src/lib/email-templates';

test('all transactional email types render branded content and escape user-controlled text', async () => {
  const types = [
    'DEAL_INVITATION',
    'AGREEMENT_APPROVED',
    'PAYMENT_VERIFIED',
    'EVIDENCE_SUBMITTED',
    'ASSESSMENT_RESULT',
    'REVISION_REQUESTED',
    'DISPUTE_OPENED',
  ] as const;

  for (const type of types) {
    const view = await emailTemplate(
      type,
      '<script>alert(1)</script>',
      'Hello <img src=x onerror=alert(1)>',
      'https://example.com/deals/123',
    );
    assert.match(view.subject, /TrustFlow|Deal|Agreement|Payment|Evidence|AI|Revision|Dispute/);
    assert.match(view.html, /trustflow\./);
    assert.doesNotMatch(view.html, /<script>|<img/);
    assert.match(view.html, /&lt;script&gt;/);
    assert.match(view.html, /Open deal/);
  }
});
