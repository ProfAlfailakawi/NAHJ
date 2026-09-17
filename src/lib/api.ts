export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

/** رمز CSRF يضعه الخادم في كوكي مقروء عمداً ليُعاد في ترويسة كل طلب مُعدِّل. */
export function csrfToken(): string {
  const match = document.cookie.split(";").map(part => part.trim().split("=")).find(([key]) => key === "nahj_csrf");
  return match ? decodeURIComponent(match.slice(1).join("=")) : "";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(["GET", "HEAD"].includes(method) ? {} : { "X-CSRF-Token": csrfToken() }),
      ...(init?.headers || {}),
    },
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message || "API request failed")
        : `API request failed (${response.status})`;
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

/*
 * الارتداد الصامت مقبول لأخطاء عابرة، لكن 401 ليست خطأً عابراً: تعني أن الجلسة انتهت.
 * ابتلاعها كان سيُظهر بيانات بذرة للمستخدم وكأنها سجلّه، فنُعيد رميها ليتعامل معها
 * التطبيق بإعادة عرض شاشة الدخول.
 */
export class UnauthorizedError extends Error {
  constructor() { super("SESSION_EXPIRED"); this.name = "UnauthorizedError"; }
}

export async function apiOrNull<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    return await api<T>(path, init);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) throw new UnauthorizedError();
    console.warn(`[NAHJ] API fallback for ${path}`, error);
    return null;
  }
}

export const authApi = {
  status: () => api<{ needsSetup: boolean }>("/auth/status"),
  setup: (name: string, email: string, password: string) =>
    api<{ account: { id: string; email: string; name: string; role: string }; csrfToken: string }>(
      "/auth/setup", { method: "POST", body: JSON.stringify({ name, email, password }) }
    ),
  me: () => api<{ account: { id: string; email: string; name: string; role: string } }>("/auth/me"),
  login: (email: string, password: string) =>
    api<{ account: { id: string; email: string; name: string; role: string }; csrfToken: string }>(
      "/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }
    ),
  logout: () => api<void>("/auth/logout", { method: "POST" }),
};
