import mongoose from 'mongoose';
import AuditLog from '@/models/AuditLog';

export async function writeAuditLog(input: {
  actorUserId?: string;
  actorOrganizationId?: string;
  action: string;
  entityType: string;
  entityId?: string | mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}) {
  return AuditLog.create({
    actor_user_id: input.actorUserId,
    actor_organization_id: input.actorOrganizationId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    metadata: input.metadata,
    ip_address: input.ipAddress,
    user_agent: input.userAgent,
  });
}
