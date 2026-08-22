import Subscription from '@/models/Subscription';

export async function hasTradingEntitlement(organizationId: string): Promise<boolean> {
  const now = new Date();
  const entitled = await Subscription.exists({
    organization_id: organizationId,
    $or: [
      { status: { $in: ['trialing', 'active'] }, current_period_ends_at: { $gt: now } },
      { status: 'grace_period', grace_ends_at: { $gt: now } },
    ],
  });
  return Boolean(entitled);
}
