import Subscription from '@/models/Subscription';
import { getPlatformSettings } from '@/models/PlatformSettings';

export async function updateExpiredSubscriptions(now = new Date()) {
  const settings = await getPlatformSettings();
  const graceMs = settings.subscription_grace_days * 24 * 60 * 60 * 1000;
  const subscriptions = await Subscription.find({
    status: { $in: ['trialing', 'active', 'grace_period'] },
    $or: [
      { current_period_ends_at: { $lte: now } },
      { grace_ends_at: { $lte: now } },
    ],
  });

  let movedToGrace = 0;
  let expired = 0;
  for (const subscription of subscriptions) {
    if (subscription.status === 'active' && !subscription.cancel_at_period_end) {
      const graceEndsAt = subscription.grace_ends_at ||
        new Date(subscription.current_period_ends_at.getTime() + graceMs);
      if (graceEndsAt > now) {
        subscription.status = 'grace_period';
        subscription.grace_ends_at = graceEndsAt;
        movedToGrace += 1;
      } else {
        subscription.status = 'expired';
        expired += 1;
      }
    } else {
      subscription.status = 'expired';
      expired += 1;
    }
    await subscription.save();
  }

  return { scanned: subscriptions.length, moved_to_grace: movedToGrace, expired };
}
