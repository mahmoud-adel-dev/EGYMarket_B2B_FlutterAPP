import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IAuditLog extends Document {
  actor_user_id?: Types.ObjectId;
  actor_organization_id?: Types.ObjectId;
  action: string;
  entity_type: string;
  entity_id?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actor_user_id: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actor_organization_id: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    action: { type: String, required: true, index: true },
    entity_type: { type: String, required: true, index: true },
    entity_id: { type: Schema.Types.ObjectId, index: true },
    metadata: Schema.Types.Mixed,
    ip_address: String,
    user_agent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ entity_type: 1, entity_id: 1, createdAt: -1 });
const AuditLog: Model<IAuditLog> = mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
export default AuditLog;
