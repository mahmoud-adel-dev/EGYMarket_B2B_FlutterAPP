import { api } from '@/lib/api-client';
import type { AnalyticsResponse, DashboardResponse } from '@/types/api';

export const dashboardService = {
  overview: () => api.get<DashboardResponse>('admin/dashboard'),
  analytics: (from?: string, to?: string) =>
    api.get<AnalyticsResponse>('admin/analytics', { from, to }),
};
