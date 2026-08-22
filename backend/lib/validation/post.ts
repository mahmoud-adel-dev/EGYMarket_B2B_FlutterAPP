import { z } from 'zod';

export const CreatePostSchema = z.object({
  media_url: z.string().url('Invalid media URL format'),
  media_type: z.enum(['video', 'image']),
  caption: z.string().min(1, 'Caption cannot be empty').max(1000, 'Caption is too long'),
});

export const CreateCommentSchema = z.object({
  comment: z.string().min(1, 'Comment cannot be empty').max(500, 'Comment is too long'),
});

export type CreatePostInput = z.infer<typeof CreatePostSchema>;
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;
