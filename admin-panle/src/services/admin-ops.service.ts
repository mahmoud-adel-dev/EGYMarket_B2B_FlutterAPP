import { api } from '@/lib/api-client';
import type {
  AdminAccount,
  AuditLogRow,
  PlatformSettingsPayload,
} from '@/types/api';

export interface AuditQuery {
  page?: number;
  limit?: number;
  action?: string;
  entity_type?: string;
}

export const adminOpsService = {
  auditLogs: (query: AuditQuery = {}) =>
    api.get<{
      success: boolean;
      logs: AuditLogRow[];
      pagination: { page: number; limit: number; total: number; total_pages: number };
    }>('admin/audit-logs', query),

  admins: () =>
    api.get<{ success: boolean; admins: AdminAccount[] }>('admin/admins'),

  setAdminActive: (adminId: string, isActive: boolean) =>
    api.patch<{ success: boolean }>(`admin/admins/${adminId}`, { is_active: isActive }),

  settings: () =>
    api.get<{ success: boolean; settings: PlatformSettingsPayload }>('admin/platform-settings'),

  updateSettings: (patch: Partial<PlatformSettingsPayload>) =>
    api.patch<{ success: boolean; settings?: PlatformSettingsPayload }>(
      'admin/platform-settings',
      patch,
    ),
};
