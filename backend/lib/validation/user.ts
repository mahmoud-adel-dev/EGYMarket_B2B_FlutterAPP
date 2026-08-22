import { z } from 'zod';

export const UpdateUserProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  phone: z.string().min(8, 'Phone number must be at least 8 digits').optional(),
  location: z
    .object({
      governorate: z.string().min(2, 'Governorate name is required'),
      address: z.string().optional(),
    })
    .optional(),
  isActive: z.boolean().optional(),
});

export type UpdateUserProfileInput = z.infer<typeof UpdateUserProfileSchema>;
