import { z } from 'zod';

export const LocalPaymentAccountSchema = z.object({
  method: z.enum(['instapay', 'mobile_wallet', 'bank_transfer', 'cash']),
  label: z.string().trim().min(2).max(120),
  account_holder: z.string().trim().min(2).max(160),
  account_reference: z.string().trim().min(3).max(200),
  instructions: z.string().trim().max(1000).optional(),
  is_active: z.boolean().default(true),
});

export const SubmitPaymentProofSchema = z.object({
  payment_method: z.enum(['instapay', 'mobile_wallet', 'bank_transfer', 'cash']),
  sender_reference: z.string().trim().min(3).max(200),
  proof_url: z.string().url(),
  note: z.string().trim().max(1000).optional(),
});
