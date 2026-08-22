import { api } from '@/lib/api-client';
import type { AdminSubscription, SubscriptionPlan } from '@/types/api';

export interface SubscriptionsQuery {
  page?: number;
  limit?: number;
  status?: string;
  q?: string;
}

export const subscriptionsService = {
  list: (query: SubscriptionsQuery = {}) =>
    api.get<{
      success: boolean;
      subscriptions: AdminSubscription[];
      pagination: { page: number; limit: number; total: number; total_pages: number };
    }>('admin/subscriptions', query),
  plans: () =>
    api.get<{ success: boolean; plans: SubscriptionPlan[] }>('admin/subscription-plans'),
  createPlan: (
    payload: Omit<SubscriptionPlan, '_id'>,
  ) => api.post<{ success: boolean }>('admin/subscription-plans', payload),
};
