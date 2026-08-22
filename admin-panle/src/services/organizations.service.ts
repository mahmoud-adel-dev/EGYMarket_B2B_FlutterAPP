import { api } from '@/lib/api-client';
import type { AdminOrganization, Paged } from '@/types/api';

export interface OrganizationsQuery {
  page?: number;
  limit?: number;
  q?: string;
  type?: string;
  verification_status?: string;
  is_active?: string;
  include_stats?: boolean;
}

export interface OrganizationStats {
  orders_count: number;
  spend_piasters: number;
  sales_piasters: number;
  open_disputes: number;
  last_order_at?: string | null;
}

export const organizationsService = {
  list: (query: OrganizationsQuery = {}) =>
    api.get<{
      success: boolean;
      organizations: (AdminOrganization & { stats?: OrganizationStats })[];
      pagination: { page: number; limit: number; total: number; total_pages: number };
    }>('admin/organizations', query as Record<string, string | number | boolean | undefined>),
  verify: (
    organizationId: string,
    decision: 'approve' | 'reject' | 'suspend',
    rejection_reason?: string,
  ) =>
    api.post<{ success: boolean; message?: string }>(
      `admin/organizations/${organizationId}/verification`,
      { decision, ...(rejection_reason ? { rejection_reason } : {}) },
    ),
};

export type { Paged };
