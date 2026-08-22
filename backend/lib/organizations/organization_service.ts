import Organization, { OrganizationType } from '@/models/Organization';
import OrganizationMember from '@/models/OrganizationMember';
import User, { IUser } from '@/models/User';
import Subscription from '@/models/Subscription';
import { getPlatformSettings } from '@/models/PlatformSettings';

function slugBase(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 48) || 'business';
}

export function roleToOrganizationType(role: string): OrganizationType {
  if (role === 'Wholesaler') return 'wholesaler';
  if (role === 'Shipper') return 'shipper';
  return 'buyer';
}

export async function createOrganizationForUser(user: IUser, businessName?: string) {
  const base = slugBase(businessName || user.name);
  const suffix = user._id.toString().slice(-8);
  const organization = await Organization.create({
    type: roleToOrganizationType(user.role),
    legal_name: businessName || user.name,
    display_name: businessName || user.name,
    slug: `${base}-${suffix}`,
    phone: user.phone,
    email: user.email,
    location: user.location,
  });

  await OrganizationMember.create({
    organization_id: organization._id,
    user_id: user._id,
    role: 'owner',
    permissions: ['*'],
    status: 'active',
  });

  const settings = await getPlatformSettings();
  const trialEndsAt = new Date(Date.now() + settings.trial_days * 24 * 60 * 60 * 1000);
  await Subscription.create({
    organization_id: organization._id,
    status: 'trialing',
    starts_at: new Date(),
    current_period_ends_at: trialEndsAt,
  });

  user.organization_id = organization._id;
  await user.save();
  return organization;
}

export async function ensureOrganizationForUser(user: IUser) {
  if (user.organization_id) {
    const existing = await Organization.findById(user.organization_id);
    if (existing) return existing;
  }
  if (user.role === 'Admin') return null;
  return createOrganizationForUser(user, user.business_name);
}
