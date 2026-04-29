import { createClient } from "./supabase-browser";
import { ENV } from "./env";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function getAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const supabase = createClient();
  const { data } = await supabase.auth.refreshSession();
  return data.session?.access_token ?? null;
}

function buildHeaders(token: string | null, init?: HeadersInit): Headers {
  const headers = new Headers(init);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function apiFetch<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `${ENV.BACKEND_URL}${path}`;
  const { body, headers: initHeaders, ...rest } = options;

  const send = async (token: string | null): Promise<Response> => {
    return fetch(url, {
      ...rest,
      headers: buildHeaders(token, initHeaders),
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
  };

  let token = await getAccessToken();
  let res = await send(token);

  if (res.status === 401 && token) {
    token = await refreshAccessToken();
    if (token) res = await send(token);
  }

  if (!res.ok) {
    const errBody = await parseBody(res);
    const message =
      (errBody && typeof errBody === "object" && "error" in errBody && typeof (errBody as { error: unknown }).error === "string"
        ? (errBody as { error: string }).error
        : null) || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, errBody);
  }

  return (await parseBody(res)) as T;
}
