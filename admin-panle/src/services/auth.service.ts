import { api } from '@/lib/api-client';
import type { MeResponse } from '@/types/api';

export const authService = {
  me: () => api.get<MeResponse>('auth/me'),
};
