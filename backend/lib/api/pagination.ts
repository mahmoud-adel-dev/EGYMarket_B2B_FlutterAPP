import { z } from 'zod';

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const PAGINATION_MAX_LIMIT = 100;
export const PAGINATION_DEFAULT_LIMIT = 20;

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Parse and clamp pagination query params. Non-numeric input falls back to defaults,
 * values are clamped into `1 <= limit <= 100` and `page >= 1`, and `skip` is always
 * >= 0. This replaces the previous NaN-prone `Math.max(Number(...), 1)` pattern that
 * produced negative skips and driver errors.
 */
export function parsePagination(searchParams: URLSearchParams | Record<string, string | undefined>): Pagination {
  const raw = searchParams instanceof URLSearchParams ? Object.fromEntries(searchParams.entries()) : searchParams;
  const pageValue = Number(raw.page);
  const limitValue = Number(raw.limit);
  const page = Number.isFinite(pageValue) && pageValue >= 1 ? Math.floor(pageValue) : 1;
  const limit = Number.isFinite(limitValue) && limitValue >= 1
    ? Math.min(PAGINATION_MAX_LIMIT, Math.floor(limitValue))
    : PAGINATION_DEFAULT_LIMIT;
  return { page, limit, skip: (page - 1) * limit };
}
