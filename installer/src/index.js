// Nova Installer — سرور واسط نصب.
//
// چرا لازم است: مرورگر اجازه‌ی تماس مستقیم با api.cloudflare.com را ندارد
// (هیچ هدر CORS برنمی‌گردد). پس تبادل کد OAuth و فراخوانی‌های API اینجا انجام
// می‌شود و توکن هرگز به مرورگر برنمی‌گردد.
//
// امنیت:
//  - Authorization Code + PKCE (S256)، بدون client secret.
//  - نشست ۱۰ دقیقه‌ای با شناسه‌ی تصادفی ۲۵۶ بیتی، ذخیره در KV با TTL.
//  - توکن دسترسی فقط داخل KV می‌ماند و هرگز در پاسخ‌ها برنمی‌گردد.
//  - CORS فقط برای مبدأهای فهرست‌شده در INSTALL_ORIGIN.
//  - هیچ لاگ یا ذخیره‌سازی دائمی از توکن و رمز مدیر وجود ندارد.

import {
  allowedOrigins,
  authorizeUrl,
  corsHeaders,
  jsonResponse,
  normalizeOrigin,
  parseList,
  pkceChallenge,
  randomToken,
  validKvName,
  validPassword,
  validWorkerName,
  workerUrl,
  API_BASE,
  SESSION_TTL,
  STATE_TTL,
  TOKEN_ENDPOINT,
} from "./lib.js";
import PAYLOAD from "../payload.js.txt";

const DEFAULT_COMPAT_DATE = "2026-10-08";
const CF_TIMEOUT_MS = 30000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = allowedOrigins(env);
    const headers = corsHeaders(origin, allowed);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    try {
      switch (url.pathname) {
        case "/":
          return await handleIndex(request, env, allowed);
        case "/health":
          return jsonResponse(
            {
              ok: true,
              configured: Boolean(env.OAUTH_CLIENT_ID),
              payload_bytes: PAYLOAD ? PAYLOAD.length : 0,
              callback: `${url.origin}/callback`,
              origins: allowed,
            },
            200,
            { ...headers, "Access-Control-Allow-Origin": "*" },
          );
        case "/login":
          return await handleLogin(url, env, allowed);
        case "/callback":
          return await handleCallback(url, env, allowed);
        case "/api/session":
          return await handleSession(url, env, headers);
        case "/api/install":
          return await handleInstall(request, env, allowed, headers);
        default:
          return jsonResponse({ ok: false, error: "not_found" }, 404, headers);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonResponse({ ok: false, error: message }, 500, headers);
    }
  },
};

/* ------------------------------- helpers -------------------------------- */

async function kvGet(env, key) {
  const raw = await env.SESSIONS.get(key);
  return raw ? JSON.parse(raw) : null;
}

async function kvPut(env, key, value, ttl) {
  await env.SESSIONS.put(key, JSON.stringify(value), { expirationTtl: ttl });
}

async function cf(env, token, path, init = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
    signal: AbortSignal.timeout(CF_TIMEOUT_MS),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { response, data, text };
}

function cfError(result) {
  const errors = result?.data?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.map((e) => `${e.code}: ${e.message}`).join(" | ");
  }
  return `HTTP ${result?.response?.status ?? "?"}`;
}

function redirect(location) {
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

/* -------------------------------- routes -------------------------------- */

async function handleLogin(url, env, allowed) {
  if (!env.OAUTH_CLIENT_ID) {
    return jsonResponse({ ok: false, error: "installer_not_configured" }, 503);
  }

  const origin = normalizeOrigin(url.searchParams.get("origin") || "");
  if (!origin || !allowed.includes(origin)) {
    return jsonResponse({ ok: false, error: "origin_not_allowed" }, 403);
  }

  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = await pkceChallenge(verifier);

  await kvPut(
    env,
    `oauth:${state}`,
    { verifier, origin, created: Date.now() },
    STATE_TTL,
  );

  return redirect(
    authorizeUrl({
      clientId: env.OAUTH_CLIENT_ID,
      redirectUri: `${url.origin}/callback`,
      state,
      challenge,
      scope: env.OAUTH_SCOPE || "",
    }),
  );
}

async function handleCallback(url, env, allowed) {
  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    const description = url.searchParams.get("error_description") || errorParam;
    return jsonResponse({ ok: false, error: "authorization_failed", detail: description }, 400);
  }

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !state) {
    return jsonResponse({ ok: false, error: "missing_code_or_state" }, 400);
  }

  const pending = await kvGet(env, `oauth:${state}`);
  if (!pending) {
    return jsonResponse({ ok: false, error: "state_expired" }, 400);
  }
  await env.SESSIONS.delete(`oauth:${state}`);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.OAUTH_CLIENT_ID,
    redirect_uri: `${url.origin}/callback`,
    code,
    code_verifier: pending.verifier,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(CF_TIMEOUT_MS),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || !payload.access_token) {
    const detail = payload?.error_description || payload?.error || `HTTP ${response.status}`;
    return jsonResponse({ ok: false, error: "token_exchange_failed", detail }, 400);
  }

  const origin = normalizeOrigin(pending.origin);
  if (!allowed.includes(origin)) {
    return jsonResponse({ ok: false, error: "origin_not_allowed" }, 403);
  }

  const session = randomToken(32);
  await kvPut(
    env,
    `sess:${session}`,
    { token: payload.access_token, origin, created: Date.now() },
    SESSION_TTL,
  );

  const target = new URL(origin);
  target.searchParams.set("session", session);
  target.searchParams.set("installer", url.origin);
  return redirect(target.toString());
}

async function handleSession(url, env, headers) {
  const id = url.searchParams.get("id") || "";
  if (!id) return jsonResponse({ ok: false, error: "missing_session" }, 400, headers);

  const session = await kvGet(env, `sess:${id}`);
  if (!session) return jsonResponse({ ok: true, valid: false, reason: "expired" }, 200, headers);

  const accountsResult = await cf(env, session.token, "/accounts?per_page=50");
  if (!accountsResult.data?.success) {
    return jsonResponse(
      { ok: false, error: "accounts_failed", detail: cfError(accountsResult) },
      502,
      headers,
    );
  }

  const accounts = (accountsResult.data.result || []).map((account) => ({
    id: account.id,
    name: account.name,
  }));

  const remaining = Math.max(0, SESSION_TTL - Math.floor((Date.now() - session.created) / 1000));

  return jsonResponse(
    {
      ok: true,
      valid: remaining > 0,
      expires_in: remaining,
      accounts,
    },
    200,
    headers,
  );
}

async function handleInstall(request, env, allowed, headers) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, headers);
  }

  const origin = normalizeOrigin(request.headers.get("Origin") || "");
  if (!origin || !allowed.includes(origin)) {
    return jsonResponse({ ok: false, error: "origin_not_allowed" }, 403, headers);
  }

  let body = null;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400, headers);
  }

  const sessionId = String(body?.session || "");
  const accountId = String(body?.account_id || "");
  const workerName = String(body?.worker_name || "").trim();
  const kvName = String(body?.kv_name || "").trim();
  const adminPassword = typeof body?.admin_password === "string" ? body.admin_password : "";

  const session = await kvGet(env, `sess:${sessionId}`);
  if (!session) {
    return jsonResponse({ ok: false, error: "session_expired" }, 401, headers);
  }
  if (session.origin !== origin) {
    return jsonResponse({ ok: false, error: "origin_mismatch" }, 403, headers);
  }
  if (!validWorkerName(workerName)) {
    return jsonResponse({ ok: false, error: "invalid_worker_name" }, 400, headers);
  }
  if (!validKvName(kvName)) {
    return jsonResponse({ ok: false, error: "invalid_kv_name" }, 400, headers);
  }
  if (!validPassword(adminPassword)) {
    return jsonResponse({ ok: false, error: "weak_password" }, 400, headers);
  }
  if (!PAYLOAD) {
    return jsonResponse({ ok: false, error: "payload_missing" }, 500, headers);
  }

  const token = session.token;
  const steps = [];

  const runStep = async (id, title, action) => {
    const startedAt = Date.now();
    try {
      const detail = await action();
      steps.push({ id, title, ok: true, detail, ms: Date.now() - startedAt });
      return detail;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({ id, title, ok: false, detail: message, ms: Date.now() - startedAt });
      throw Object.assign(new Error(message), { steps });
    }
  };

  try {
    const account = await runStep("account", "بررسی حساب کلودفلر", async () => {
      const result = await cf(env, token, "/accounts?per_page=50");
      if (!result.data?.success) throw new Error(cfError(result));
      const found = (result.data.result || []).find((item) => item.id === accountId);
      if (!found) throw new Error("این حساب در دسترس توکن نیست");
      return found.name;
    });

    const namespaceId = await runStep("kv", "ساخت فضای KV", async () => {
      const list = await cf(env, token, `/accounts/${accountId}/storage/kv/namespaces?per_page=100`);
      if (!list.data?.success) throw new Error(cfError(list));
      const existing = (list.data.result || []).find((item) => item.title === kvName);
      if (existing) return existing.id;

      const created = await cf(env, token, `/accounts/${accountId}/storage/kv/namespaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: kvName }),
      });
      if (!created.data?.success) throw new Error(cfError(created));
      return created.data.result.id;
    });

    const subdomain = await runStep("subdomain", "خواندن زیردامنه‌ی workers.dev", async () => {
      const result = await cf(env, token, `/accounts/${accountId}/workers/subdomain`);
      if (!result.data?.success) throw new Error(cfError(result));
      const value = result.data.result?.subdomain;
      if (!value) {
        throw new Error("workers.dev برای این حساب فعال نیست؛ از داشبورد کلودفلر یک‌بار فعالش کن");
      }
      return value;
    });

    await runStep("upload", "آپلود اسکریپت ورکر", async () => {
      const metadata = {
        main_module: "worker.js",
        compatibility_date: env.COMPATIBILITY_DATE || DEFAULT_COMPAT_DATE,
        bindings: [
          { type: "kv_namespace", name: "KV", namespace_id: namespaceId },
          { type: "secret_text", name: "ADMIN", text: adminPassword },
        ],
        observability: { enabled: true },
      };
      if (env.COMPATIBILITY_FLAGS) {
        metadata.compatibility_flags = parseList(env.COMPATIBILITY_FLAGS);
      }

      const form = new FormData();
      form.set("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
      form.set(
        "worker.js",
        new Blob([PAYLOAD], { type: "application/javascript+module" }),
        "worker.js",
      );

      const result = await cf(env, token, `/accounts/${accountId}/workers/scripts/${workerName}`, {
        method: "PUT",
        body: form,
      });
      if (!result.data?.success) throw new Error(cfError(result));
      return `${Math.round(PAYLOAD.length / 1024)} کیلوبایت`;
    });

    await runStep("route", "فعال‌سازی workers.dev", async () => {
      const result = await cf(
        env,
        token,
        `/accounts/${accountId}/workers/scripts/${workerName}/subdomain`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: true, previews_enabled: false }),
        },
      );
      if (!result.data?.success) throw new Error(cfError(result));
      return "فعال";
    });

    await env.SESSIONS.delete(`sess:${sessionId}`);

    const baseUrl = workerUrl(workerName, subdomain);
    return jsonResponse(
      {
        ok: true,
        worker: { name: workerName, account, kv: kvName, namespace_id: namespaceId },
        url: baseUrl,
        login_url: `${baseUrl}/login`,
        admin_url: `${baseUrl}/admin`,
        steps,
      },
      200,
      headers,
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        steps,
      },
      502,
      headers,
    );
  }
}

/* ------------------------------ setup page ------------------------------- */

async function handleIndex(request, env, allowed) {
  const url = new URL(request.url);
  const callback = `${url.origin}/callback`;
  const configured = Boolean(env.OAUTH_CLIENT_ID);
  const installPage = allowed[0] || "";
  const payloadKb = Math.round((PAYLOAD ? PAYLOAD.length : 0) / 1024);

  const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Nova Installer</title>
<style>
  body{margin:0;background:#0b1020;color:#e8ecf8;font-family:system-ui,Tahoma,sans-serif;line-height:1.9}
  main{max-width:720px;margin:0 auto;padding:40px 20px}
  h1{font-size:24px;margin:0 0 4px}
  p.sub{color:#9aa6c4;margin:0 0 24px;font-size:14px}
  .card{background:#141b30;border:1px solid #263152;border-radius:14px;padding:18px 20px;margin:14px 0}
  .row{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;padding:7px 0;border-bottom:1px solid #1e2740}
  .row:last-child{border:0}
  .k{color:#9aa6c4;font-size:13.5px}
  code{background:#0e1528;border:1px solid #263152;border-radius:7px;padding:3px 8px;font-family:ui-monospace,Consolas,monospace;font-size:13px;direction:ltr;display:inline-block;word-break:break-all}
  .ok{color:#38d39f}.bad{color:#f0b429}
  ol{padding-inline-start:20px;font-size:14px;color:#c9d3ea}
  li{margin:6px 0}
  a.btn{display:inline-block;margin-top:10px;background:#6ea8fe;color:#06122a;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:10px}
</style>
</head>
<body>
<main>
  <h1>Nova Installer</h1>
  <p class="sub">سرور واسط نصب Nova Worker Beta — برای ورود موقت، نصب و اتصال به Cloudflare.</p>

  <div class="card">
    <div class="row"><span class="k">وضعیت</span><span class="${configured ? "ok" : "bad"}">${configured ? "آماده" : "تنظیم نشده — OAUTH_CLIENT_ID خالی است"}</span></div>
    <div class="row"><span class="k">Callback (باید در OAuth client ثبت شود)</span><code>${callback}</code></div>
    <div class="row"><span class="k">مبدأهای مجاز صفحه‌ی نصب</span><code>${allowed.length ? allowed.join(" , ") : "—"}</code></div>
    <div class="row"><span class="k">حجم اسکریپت آماده</span><code>${payloadKb} KB</code></div>
  </div>

  <div class="card">
    <p style="margin-top:0"><b>راه‌اندازی یک‌باره</b></p>
    <ol>
      <li>در داشبورد Cloudflare به <b>Manage Account → OAuth clients</b> برو و یک کلاینت بساز.</li>
      <li>نوع: Authorization Code، روش احراز هویت توکن: <code>none</code>، PKCE: <b>S256</b>.</li>
      <li>Redirect URL را دقیقاً همان مقدار Callback بالا بگذار.</li>
      <li>دسترسی‌ها: Workers Scripts (Edit)، Workers KV Storage (Edit)، Account Settings (Read).</li>
      <li>Client ID را در متغیر <code>OAUTH_CLIENT_ID</code> همین ورکر بگذار.</li>
    </ol>
    ${installPage ? `<a class="btn" href="${installPage}">بازگشت به صفحه‌ی نصب</a>` : ""}
  </div>
</main>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    },
  });
}
