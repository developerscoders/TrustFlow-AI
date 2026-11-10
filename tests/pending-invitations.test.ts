import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/db';
import { linkPendingInvitations } from '../src/lib/pending-invitations';

test('links invitations with a missing providerId and creates both provider notices', async () => {
  let linked = false;
  const createdNotices: any[] = [];
  const deal = { id: 'deal-1', title: 'Invited deal' };
  const dealMock = {
    findMany: async ({ where }: any) => {
      if (where.providerId === 'provider-1') return linked ? [deal] : [];
      return linked ? [] : [deal];
    },
    updateMany: async ({ where, data }: any) => {
      assert.ok(where.OR.some((item: any) => item.providerId?.isSet === false));
      assert.equal(data.providerId, 'provider-1');
      linked = true;
      return { count: 1 };
    },
  };
  const notificationMock = {
    findMany: async () => [],
    createMany: async ({ data }: any) => { createdNotices.push(...data); return { count: data.length }; },
  };
  Object.defineProperty(db, 'deal', { configurable: true, value: dealMock });
  Object.defineProperty(db, 'notification', { configurable: true, value: notificationMock });

  try {
    const count = await linkPendingInvitations({ id: 'provider-1', email: 'Provider@example.com', name: 'Provider' });
    assert.equal(count, 1);
    assert.deepEqual(createdNotices.map((notice) => notice.type), ['INVITATION', 'AGREEMENT']);
    assert.ok(createdNotices.every((notice) => notice.userId === 'provider-1' && notice.dealId === 'deal-1'));
  } finally {
    delete (db as any).deal;
    delete (db as any).notification;
  }
});

test('repairs missing notices for a deal that is already linked', async () => {
  const createdNotices: any[] = [];
  Object.defineProperty(db, 'deal', {
    configurable: true,
    value: { findMany: async ({ where }: any) => where.providerId === 'provider-1' ? [{ id: 'deal-2', title: 'Previously linked deal' }] : [] },
  });
  Object.defineProperty(db, 'notification', {
    configurable: true,
    value: {
      findMany: async () => [{ dealId: 'deal-2', type: 'INVITATION' }],
      createMany: async ({ data }: any) => { createdNotices.push(...data); return { count: data.length }; },
    },
  });

  try {
    const count = await linkPendingInvitations({ id: 'provider-1', email: 'provider@example.com', name: 'Provider' });
    assert.equal(count, 0);
    assert.deepEqual(createdNotices.map((notice) => notice.type), ['AGREEMENT']);
  } finally {
    delete (db as any).deal;
    delete (db as any).notification;
  }
});
