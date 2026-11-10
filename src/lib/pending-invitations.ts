import { db } from './db';

export async function linkPendingInvitations(user: { id: string; email: string; name: string }) {
  const email = user.email.trim().toLowerCase();
  const unlinkedProvider = {
    providerEmail: email,
    OR: [{ providerId: null }, { providerId: { isSet: false } }],
  };
  const pending = await db.deal.findMany({
    where: unlinkedProvider,
    select: { id: true, title: true },
  });

  const linked = pending.length
    ? await db.deal.updateMany({
        where: {
          id: { in: pending.map((deal) => deal.id) },
          ...unlinkedProvider,
        },
        data: { providerId: user.id, providerName: user.name },
      })
    : { count: 0 };

  // Repair notifications too if an earlier linking attempt updated the deal
  // but failed before it could create the notices.
  const linkedDeals = await db.deal.findMany({
    where: { providerId: user.id, providerEmail: email },
    select: { id: true, title: true },
  });
  if (!linkedDeals.length) return linked.count;

  const existing = await db.notification.findMany({
    where: {
      userId: user.id,
      dealId: { in: linkedDeals.map((deal) => deal.id) },
      type: { in: ['INVITATION', 'AGREEMENT'] },
    },
    select: { dealId: true, type: true },
  });
  const existingKeys = new Set(existing.map((notice) => `${notice.dealId}:${notice.type}`));
  const notifications = linkedDeals.flatMap((deal) => [
      {
        userId: user.id,
        dealId: deal.id,
        title: 'Deal invitation',
        message: `You were invited to ${deal.title}.`,
        type: 'INVITATION',
      },
      {
        userId: user.id,
        dealId: deal.id,
        title: 'Agreement approval required',
        message: `Review and approve agreement version 1 for ${deal.title}.`,
        type: 'AGREEMENT',
      },
    ]).filter((notice) => !existingKeys.has(`${notice.dealId}:${notice.type}`));

  if (notifications.length) await db.notification.createMany({ data: notifications });

  return linked.count;
}
