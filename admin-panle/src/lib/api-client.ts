export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ApiEnvelope {
  success?: boolean;
  error?: string;
  message?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/bff/${path.replace(/^\//, '')}`, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'content-type': 'application/json' }
        : {}),
      ...init?.headers,
    },
    credentials: 'same-origin',
    cache: 'no-store',
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const envelope = (payload ?? {}) as ApiEnvelope;
    throw new ApiError(
      response.status,
      envelope.message || fallbackMessage(response.status),
      envelope.error,
    );
  }

  return payload as T;
}

function fallbackMessage(status: number): string {
  switch (status) {
    case 401:
      return 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول من جديد.';
    case 403:
      return 'لا تملك صلاحية تنفيذ هذا الإجراء.';
    case 404:
      return 'العنصر المطلوب غير موجود.';
    case 429:
      return 'عدد كبير من الطلبات، حاول بعد قليل.';
    case 502:
      return 'خدمة المنصة غير متاحة حاليًا.';
    default:
      return status >= 500
        ? 'حدث خطأ في الخدمة، حاول مرة أخرى.'
        : 'تعذر إكمال العملية.';
  }
}

export const api = {
  get<T>(path: string, params?: object) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== null && `${value}` !== '') {
        search.set(key, `${value}`);
      }
    }
    const query = search.toString();
    return request<T>(`${path}${query ? `?${query}` : ''}`);
  },
  post<T>(path: string, body?: unknown) {
    return request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
  },
  patch<T>(path: string, body?: unknown) {
    return request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) });
  },
};

/* ---- Authentication helpers that speak NextAuth's protocol through the proxy ---- */

export async function loginWithCredentials(email: string, password: string): Promise<void> {
  const csrfResponse = await fetch('/api/bff/auth/csrf', { cache: 'no-store' });
  if (!csrfResponse.ok) throw new ApiError(502, 'تعذر بدء تسجيل الدخول، حاول مجددًا.');
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

  const form = new URLSearchParams({
    csrfToken,
    email,
    password,
    json: 'true',
  });
  const response = await fetch('/api/bff/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    credentials: 'same-origin',
  });

  if (!response.ok) {
    let message = 'بيانات الدخول غير صحيحة.';
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) message = payload.message;
    } catch {
      /* keep default */
    }
    throw new ApiError(response.status, message);
  }
}

export async function signOutSession(): Promise<void> {
  try {
    const csrfResponse = await fetch('/api/bff/auth/csrf', { cache: 'no-store' });
    if (!csrfResponse.ok) return;
    const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
    const form = new URLSearchParams({ csrfToken, json: 'true' });
    await fetch('/api/bff/auth/signout', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      credentials: 'same-origin',
    });
  } catch {
    /* best-effort: cookie cleared server-side anyway */
  }
}
