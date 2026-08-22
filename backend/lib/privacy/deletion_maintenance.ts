import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import DataDeletionRequest from '@/models/DataDeletionRequest';
import Organization from '@/models/Organization';
import OrganizationMember from '@/models/OrganizationMember';
import User from '@/models/User';
import VerificationToken from '@/models/VerificationToken';

/**
 * Pseudonymizes personal data while retaining immutable transaction references
 * needed for disputes, accounting, and fraud prevention.
 */
export async function processDueDeletionRequests(now = new Date()) {
  const requests = await DataDeletionRequest.find({ status: 'scheduled', scheduled_for: { $lte: now } });
  let completed = 0;

  for (const request of requests) {
    const user = await User.findById(request.user_id).select('+passwordHash +session_version');
    if (!user) {
      request.status = 'completed';
      request.completed_at = now;
      await request.save();
      completed += 1;
      continue;
    }

    const suffix = user._id.toString();
    const unusablePassword = await bcrypt.hash(`${suffix}:${randomUUID()}`, 10);
    user.name = 'Deleted User';
    user.email = `deleted+${suffix}@invalid.local`;
    user.phone = 'deleted';
    user.passwordHash = unusablePassword;
    user.location = { governorate: 'Deleted' };
    user.isActive = false;
    user.avatar_url = undefined;
    user.cover_url = undefined;
    user.business_name = undefined;
    user.business_description = undefined;
    user.contact_methods = undefined;
    user.paymentSettings = undefined;
    user.interested_categories = [];
    user.session_version += 1;
    await user.save();

    await Promise.all([
      VerificationToken.deleteMany({ user_id: user._id }),
      OrganizationMember.updateMany({ user_id: user._id }, { $set: { status: 'disabled' } }),
    ]);

    if (request.organization_id) {
      const remainingMembers = await OrganizationMember.countDocuments({
        organization_id: request.organization_id,
        user_id: { $ne: user._id },
        status: 'active',
      });
      if (remainingMembers === 0) {
        await Organization.findByIdAndUpdate(request.organization_id, {
          $set: { is_active: false, payment_accounts: [], verification_documents: [] },
          $unset: { tax_number: 1, commercial_register_number: 1 },
        });
      }
    }

    request.status = 'completed';
    request.completed_at = now;
    await request.save();
    completed += 1;
  }

  return { scanned: requests.length, completed };
}
