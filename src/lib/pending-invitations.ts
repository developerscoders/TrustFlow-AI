import { db } from './db';

export async function linkPendingInvitations(user: { id: string; email: string; name: string }) {
  const pending = await db.deal.findMany({
    where: { providerEmail: user.email, providerId: null },
    select: { id: true, title: true },
  });
  if (!pending.length) return 0;

  const linked = await db.deal.updateMany({
    where: { id: { in: pending.map((deal) => deal.id) }, providerEmail: user.email, providerId: null },
    data: { providerId: user.id, providerName: user.name },
  });
  if (!linked.count) return 0;

  await db.notification.createMany({
    data: pending.flatMap((deal) => [
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
    ]),
  });

  return linked.count;
}
