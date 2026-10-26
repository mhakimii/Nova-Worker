// توابع خالص و بدون وابستگی — در Node هم قابل تست است.
const encoder = new TextEncoder();

export const AUTHORIZE_ENDPOINT = "https://dash.cloudflare.com/oauth2/auth";
export const TOKEN_ENDPOINT = "https://dash.cloudflare.com/oauth2/token";
export const API_BASE = "https://api.cloudflare.com/client/v4";

/** عمر نشست نصب: ۱۰ دقیقه */
export const SESSION_TTL = 600;
/** عمر وضعیت ورود (state) — همان ۱۰ دقیقه */
export const STATE_TTL = 600;

export function b64url(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

export async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return b64url(new Uint8Array(digest));
}

export function authorizeUrl({ clientId, redirectUri, state, challenge, scope }) {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (scope) url.searchParams.set("scope", scope);
  return url.toString();
}

export function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** فهرست مبدأهای مجاز، بدون مسیر و بدون اسلش انتهایی */
export function normalizeOrigin(value) {
  try {
    const url = new URL(String(value));
    return url.origin;
  } catch {
    return "";
  }
}

export function allowedOrigins(env) {
  return parseList(env.INSTALL_ORIGIN).map(normalizeOrigin).filter(Boolean);
}

export function corsHeaders(origin, allowed) {
  const headers = {
    "Cache-Control": "no-store",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export const WORKER_NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const KV_NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

export function validWorkerName(value) {
  return typeof value === "string" && WORKER_NAME_RE.test(value);
}

export function validKvName(value) {
  return typeof value === "string" && KV_NAME_RE.test(value);
}

export function validPassword(value) {
  if (typeof value !== "string") return false;
  if (value.length < 12 || value.length > 128) return false;
  return value.trim().length > 0;
}

/** آدرس نهایی ورکر روی دامنه‌ی workers.dev — برای نمایش لینک ورود */
export function workerUrl(name, subdomain) {
  if (!name || !subdomain) return "";
  const base = String(subdomain).replace(/\.workers\.dev$/i, "");
  return `https://${name}.${base}.workers.dev`;
}
