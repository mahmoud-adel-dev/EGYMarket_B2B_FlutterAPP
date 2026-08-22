import { api } from '@/lib/api-client';
import type {
  AdminInvoice,
  InvoiceStatusValue,
  TransactionsResponse,
  TransactionStatusValue,
} from '@/types/api';

export interface InvoicesQuery {
  page?: number;
  limit?: number;
  status?: string;
  q?: string;
}

export interface TransactionsQuery {
  page?: number;
  limit?: number;
  tx_type?: string;
  status?: string;
  from?: string;
  to?: string;
  q?: string;
}

function normalizeStatus(status: TransactionStatusValue | InvoiceStatusValue | undefined) {
  return status;
}

export const financeService = {
  transactions: (query: TransactionsQuery = {}) =>
    api.get<TransactionsResponse>('admin/transactions', query),
  invoices: (query: InvoicesQuery = {}) =>
    api.get<{
      success: boolean;
      invoices: AdminInvoice[];
      pagination: { page: number; limit: number; total: number; total_pages: number };
    }>('admin/invoices', query),
  reviewInvoice: (
    invoiceId: string,
    decision: 'approve' | 'reject',
    rejection_reason?: string,
  ) =>
    api.post<{ success: boolean; message?: string }>(
      `admin/subscriptions/invoices/${invoiceId}/review`,
      { decision, ...(rejection_reason ? { rejection_reason } : {}) },
    ),
  markRefundCompleted: (obligationId: string) =>
    api.patch<{ success: boolean }>(`admin/refunds/${obligationId}`, {
      decision: 'mark_refunded',
    }),
};

export { normalizeStatus };
