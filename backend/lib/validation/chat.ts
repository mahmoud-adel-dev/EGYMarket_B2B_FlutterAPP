import mongoose from 'mongoose';
import { z } from 'zod';

export const ClientMessageIdSchema = z.string().uuid();

export const SendChatMessageSchema = z.object({
  body: z.string().trim().min(1).max(3000),
  client_message_id: ClientMessageIdSchema,
});

export const StartConversationSchema = z
  .object({
    order_id: z.string().refine(mongoose.Types.ObjectId.isValid).optional(),
    product_id: z.string().refine(mongoose.Types.ObjectId.isValid).optional(),
    initial_message: z.string().trim().min(1).max(3000).optional(),
    initial_message_client_id: ClientMessageIdSchema.optional(),
  })
  .superRefine((data, context) => {
    if (Number(Boolean(data.order_id)) + Number(Boolean(data.product_id)) !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either order_id or product_id',
      });
    }
    if (data.initial_message && !data.initial_message_client_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['initial_message_client_id'],
        message: 'initial_message_client_id is required with initial_message',
      });
    }
    if (!data.initial_message && data.initial_message_client_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['initial_message'],
        message: 'initial_message is required with initial_message_client_id',
      });
    }
  });

export interface ChatMessageCursor {
  createdAt: Date;
  id: mongoose.Types.ObjectId;
}

export function parseChatMessageCursor(
  dateValue: string | null,
  idValue: string | null
): ChatMessageCursor | null {
  if (!dateValue || !idValue || !mongoose.Types.ObjectId.isValid(idValue)) return null;
  const timestamp = Date.parse(dateValue);
  if (Number.isNaN(timestamp)) return null;
  return {
    createdAt: new Date(timestamp),
    id: new mongoose.Types.ObjectId(idValue),
  };
}
