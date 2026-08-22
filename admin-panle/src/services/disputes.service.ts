import { api } from '@/lib/api-client';
import type { AdminDispute } from '@/types/api';

export interface DisputesQuery {
  status?: string;
  q?: string;
}

export const disputesService = {
  list: (query: DisputesQuery = {}) =>
    api.get<{ success: boolean; disputes: AdminDispute[] }>('disputes', query),
  review: (
    disputeId: string,
    payload:
      | { decision: 'in_review' }
      | { decision: 'resolved' | 'rejected'; outcome: 'complete' | 'cancel'; resolution: string },
  ) => api.post<{ success: boolean; message?: string }>(`admin/disputes/${disputeId}/review`, payload),
};
