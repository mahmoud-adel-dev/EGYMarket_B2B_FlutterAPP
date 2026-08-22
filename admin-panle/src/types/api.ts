export interface Paged<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface MeResponse {
  user: SessionUser;
  organization?: AdminOrganization | null;
  membership_role?: string | null;
}

export interface VerificationDocument {
  _id?: string;
  type: string;
  file_url: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  uploaded_at?: string;
  reviewed_at?: string;
}

export interface OrganizationRef {
  _id?: string;
  display_name?: string;
  avatar_url?: string;
  location?: { governorate?: string };
}

export interface AdminOrganization {
  _id: string;
  type: 'wholesaler' | 'buyer' | 'shipper';
  display_name: string;
  legal_name: string;
  phone: string;
  email: string;
  location: { governorate: string; address?: string };
  tax_number?: string;
  commercial_register_number?: string;
  verification_status: 'unsubmitted' | 'pending' | 'verified' | 'rejected' | 'suspended';
  verification_documents: VerificationDocument[];
  is_active: boolean;
  createdAt: string;
  updatedAt?: string;
  stats?: OrganizationStats;
}

export interface OrganizationStats {
  orders_count: number;
  spend_piasters: number;
  sales_piasters: number;
  open_disputes: number;
  last_order_at?: string | null;
}

export interface OrderItemRow {
  product_id?: unknown;
  sku?: string;
  title: string;
  unit?: string;
  quantity: number;
  unit_price_piasters: number;
  subtotal_piasters: number;
}

export interface StatusHistoryRow {
  status: string;
  changed_by_role: string;
  changed_by?: { name?: string } | null;
  timestamp: string;
  note?: string;
}

export interface PaymentObligationRow {
  _id: string;
  kind: 'platform_fee' | 'goods' | 'shipping';
  amount_piasters: number;
  status: 'pending' | 'proof_submitted' | 'confirmed' | 'rejected' | 'disputed';
  payment_method?: string;
  sender_reference?: string;
  proof_url?: string;
  rejection_reason?: string;
  payer_organization_id?: OrganizationRef | string;
  beneficiary_organization_id?: OrganizationRef | string;
  beneficiary_type?: 'platform' | 'organization';
  createdAt: string;
}

export interface TrackingEventRow {
  _id: string;
  event_type: string;
  location: string;
  note?: string;
  occurred_at: string;
}

export interface AdminOrderListItem {
  _id: string;
  order_number: string;
  status: OrderStatusValue;
  fulfillment_method: 'buyer_pickup' | 'third_party_shipping';
  goods_subtotal_piasters: number;
  shipping_cost_piasters: number;
  platform_fee_piasters: number;
  total_payable_piasters: number;
  createdAt: string;
  buyer_organization_id?: (OrganizationRef & { governorate?: string }) | null;
  seller_organization_id?: OrganizationRef | null;
  shipper_organization_id?: OrganizationRef | null;
  payment_summary?: { state: PaymentStateValue; confirmed_count: number; total_count: number };
}

export type OrderStatusValue =
  | 'requested'
  | 'awaiting_payments'
  | 'preparing'
  | 'ready_for_pickup'
  | 'in_transit'
  | 'delivered'
  | 'completed'
  | 'canceled'
  | 'rejected'
  | 'disputed';

export type PaymentStateValue = 'not_issued' | 'pending' | 'partial' | 'paid';

export interface AdminOrderDetail extends AdminOrderListItem {
  items: OrderItemRow[];
  status_history: StatusHistoryRow[];
  shipper_organization_id?: OrganizationRef | null;
  shipping_address?: { governorate?: string; address?: string; contact_name?: string; phone?: string };
  payment_due_at?: string;
  created_by?: { name?: string; email?: string } | null;
}

export interface AdminOrderDetailResponse {
  order: AdminOrderDetail;
  payment_obligations: PaymentObligationRow[];
  payment_summary: { state: PaymentStateValue; confirmed_count: number; total_count: number };
  disputes: AdminDispute[];
  tracking_events: TrackingEventRow[];
}

export interface AdminSubscription {
  _id: string;
  organization_id: { _id: string; display_name: string; type: string };
  plan_id?: { _id: string; code: string; name_ar: string; price_piasters: number; billing_interval: string } | null;
  status: SubscriptionStatusValue;
  starts_at: string;
  current_period_ends_at: string;
  grace_ends_at?: string;
  cancel_at_period_end: boolean;
  createdAt: string;
}

export type SubscriptionStatusValue =
  | 'trialing'
  | 'pending_payment'
  | 'under_review'
  | 'active'
  | 'grace_period'
  | 'expired'
  | 'canceled'
  | 'rejected';

export interface AdminInvoice {
  _id: string;
  invoice_number: string;
  organization_id?: { _id: string; display_name: string } | null;
  subscription_id?: string;
  plan_id?: { code?: string; name_ar?: string } | null;
  amount_piasters: number;
  currency: string;
  status: InvoiceStatusValue;
  payment_method?: string;
  sender_reference?: string;
  proof_url?: string;
  rejection_reason?: string;
  payer_confirmed_at?: string;
  reviewed_at?: string;
  createdAt: string;
}

export type InvoiceStatusValue = 'pending' | 'proof_submitted' | 'paid' | 'rejected' | 'void';

export interface TransactionRow {
  id: string;
  tx_type:
    | 'platform_fee'
    | 'order_goods'
    | 'order_shipping'
    | 'subscription_invoice';
  related_order_id?: string;
  related_order_number?: string;
  related_invoice_number?: string;
  party_name: string;
  party_type: string;
  counterparty_name?: string;
  method?: string;
  reference?: string;
  currency: 'EGP';
  gross_piasters: number;
  status: TransactionStatusValue;
  created_at: string;
  settled_at?: string | null;
  note?: string;
}

export type TransactionStatusValue =
  | 'pending'
  | 'proof_submitted'
  | 'confirmed'
  | 'rejected'
  | 'paid'
  | 'void'
  | 'disputed'
  | 'refund_pending'
  | 'refunded';

export interface FinanceOverview {
  currency: string;
  gross_processed_piasters: number;
  pending_review_piasters: number;
  platform_revenue_piasters: number;
  order_fees_piasters: number;
  subscription_revenue_piasters: number;
  subscriptions_paid_count: number;
  refunds_piasters: number;
  refund_pending_piasters: number;
  refund_pending_count: number;
  refunds_note: string;
}

export interface TransactionsResponse {
  success: boolean;
  overview: FinanceOverview;
  transactions: TransactionRow[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export interface AdminDispute {
  _id: string;
  order_id?:
    | ({ _id: string; order_number: string; status?: string; total_payable_piasters?: number })
    | string
    | null;
  opened_by_user_id?: { _id: string; name: string; email: string } | null;
  reason: string;
  evidence_urls: string[];
  status: 'open' | 'in_review' | 'resolved' | 'rejected';
  resolution?: string;
  resolved_by?: { name?: string } | null;
  resolved_at?: string;
  createdAt: string;
}

export interface AuditLogRow {
  _id: string;
  actor_user_id?: { _id: string; name: string; email: string } | null;
  action: string;
  entity_type: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  createdAt: string;
}

export interface AdminAccount {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  email_verified_at?: string | null;
  last_login_at?: string | null;
  createdAt: string;
}

export interface DashboardResponse {
  success: boolean;
  currency: string;
  revenue: {
    order_fees_piasters: number;
    order_fees_count: number;
    subscriptions_piasters: number;
    subscriptions_count: number;
  };
  queues: {
    pendingProofs: number;
    pendingSubscriptions: number;
    pendingVerification: number;
    openDisputes: number;
  };
  orders_by_status: Record<string, number>;
  organizations_by_status: Record<string, number>;
  subscriptions: {
    active: number;
    trialing: number;
    lapsed: number;
    unpaid_invoices: number;
  };
  organizations_active: {
    buyers: number;
    sellers: number;
    shippers: number;
  };
}

export interface AnalyticsResponse {
  success: boolean;
  range: { from: string; to: string; days: number };
  totals: {
    orders_created: number;
    gmv_piasters: number;
    completed_orders: number;
    canceled_orders: number;
    platform_fees_confirmed_piasters: number;
    subscription_revenue_paid_piasters: number;
    new_organizations: number;
    new_users: number;
  };
  series: Array<{
    date: string;
    label: string;
    orders_created: number;
    gmv_piasters: number;
    platform_fees_confirmed_piasters: number;
    subscription_revenue_piasters: number;
    new_organizations: number;
    new_users: number;
  }>;
  orders_by_status: Record<string, number>;
  payments_by_state: Record<string, number>;
}

export interface PlatformSettingsPayload {
  order_fee_piasters: number;
  trial_days: number;
  subscription_grace_days: number;
  payment_deadline_hours: number;
  support_email?: string;
  support_phone?: string;
  platform_payment_accounts: Array<{
    method: string;
    label: string;
    account_holder: string;
    account_reference: string;
    instructions?: string;
    is_active: boolean;
  }>;
}

export interface SubscriptionPlan {
  _id: string;
  code: string;
  name_ar: string;
  name_en?: string;
  price_piasters: number;
  billing_interval: 'monthly' | 'yearly';
  organization_types: string[];
  features?: string[];
  is_active: boolean;
  sort_order?: number;
}
