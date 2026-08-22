import { api } from '@/lib/api-client';
import type { AdminOrderDetailResponse, AdminOrderListItem, Paged } from '@/types/api';

export interface OrderListQuery {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  payment_state?: string;
  from?: string;
  to?: string;
  min_total_piasters?: number;
  max_total_piasters?: number;
  sort?: 'createdAt' | 'total_payable_piasters';
  dir?: 'asc' | 'desc';
}

function toQuery(query: OrderListQuery) {
  return {
    ...query,
    sort: query.sort === 'total_payable_piasters' ? 'total' : query.sort,
  };
}

export const ordersService = {
  list: (query: OrderListQuery = {}) =>
    api.get<{ success: boolean; orders: AdminOrderListItem[]; pagination: { page: number; limit: number; total: number; total_pages: number } }>(
      'admin/orders',
      toQuery(query),
    ),
  detail: (orderId: string) =>
    api.get<AdminOrderDetailResponse>(`admin/orders/${orderId}`),
};

export type { Paged };
