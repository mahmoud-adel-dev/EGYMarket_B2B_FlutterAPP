import { z } from 'zod';

export const LoginCredentialsSchema = z.object({
  email: z.string().email('A valid email address is required').transform((value) => value.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const RegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address format'),
  phone: z.string().min(8, 'Phone number must be at least 8 digits'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long')
    .regex(/[A-Za-z]/, 'Password must include a letter')
    .regex(/[0-9]/, 'Password must include a number'),
  business_name: z.string().trim().min(2).max(160),
  location: z.object({
    governorate: z.string().min(2, 'Governorate name is required'),
    address: z.string().optional(),
  }),
  interested_categories: z.array(z.string().trim().min(2).max(80)).max(20).optional().default([]),
  role: z
    .string()
    .transform((val) => val.charAt(0).toUpperCase() + val.slice(1).toLowerCase())
    .pipe(z.enum(['Wholesaler', 'Retailer', 'Shipper']))
    .default('Retailer'),
  accepted_terms: z.literal(true, {
    errorMap: () => ({ message: 'Terms and privacy policy must be accepted' }),
  }),
});

export type LoginCredentials = z.infer<typeof LoginCredentialsSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
