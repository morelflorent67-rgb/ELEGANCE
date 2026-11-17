import { GENERIC_ERROR, errorMessage } from "@/lib/errors";

// Client de l'API du salon (`/api/mobile/v1`, D-123). Tout passe par ici : jeton Bearer, corps JSON, refus en
// `ApiError` avec le `code` stable du serveur. Aucune règle métier : l'app affiche et envoie.

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfterSeconds?: number;
  readonly fieldErrors?: Record<string, string>;

  constructor(
    code: string,
    status: number,
    extra: { retryAfterSeconds?: number; fieldErrors?: Record<string, string> } = {},
  ) {
    super(errorMessage(code, extra));
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = extra.retryAfterSeconds;
    this.fieldErrors = extra.fieldErrors;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  /** Appelé quand le serveur répond « pas connecté » alors qu'un jeton était envoyé : la session a expiré. */
  onSessionExpired?: () => void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(options: ApiClientOptions) {
  const base = `${options.baseUrl.replace(/\/$/, "")}/api/mobile/v1`;
  const doFetch = options.fetchImpl ?? fetch;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = options.getToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers: {
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch {
      // Pas de réseau, serveur injoignable ou délai dépassé : un seul message pour le client.
      throw new ApiError("network", 0);
    } finally {
      clearTimeout(timer);
    }

    let json: Record<string, unknown> = {};
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      if (response.ok) return {} as T;
    }
    if (response.ok) return json as T;

    const code = typeof json.code === "string" ? json.code : "failed";
    if (response.status === 401 && code === "not_signed_in" && token) options.onSessionExpired?.();
    throw new ApiError(code, response.status, {
      retryAfterSeconds: typeof json.retryAfterSeconds === "number" ? json.retryAfterSeconds : undefined,
      fieldErrors:
        json.fieldErrors && typeof json.fieldErrors === "object"
          ? (json.fieldErrors as Record<string, string>)
          : undefined,
    });
  }

  return {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
    patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
    delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
  };
}

/** Message à montrer pour n'importe quelle erreur attrapée. */
export function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : GENERIC_ERROR;
}
