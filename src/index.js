/**
 * Nova Worker — نقطه‌ی ورود
 *
 * قواعد:
 *  - بدون وابستگی خارجی؛ فقط APIهای خود Workers.
 *  - هر مسیر جدید در ROUTES ثبت می‌شود تا روتر قابل پیش‌بینی بماند.
 *  - پاسخ‌ها همیشه content-type مشخص و cache-control: no-store دارند.
 */

const APP_NAME = "Nova Worker";
const VERSION = "0.1.0";

/** @typedef {object} Env */
/** @typedef {{ request: Request, env: Env, ctx: ExecutionContext, url: URL }} RouteContext */

/** @type {Array<{ method: string, path: string, handler: (c: RouteContext) => Response | Promise<Response> }>} */
const ROUTES = [
  {
    method: "GET",
    path: "/health",
    handler: () => json({ ok: true, app: APP_NAME, version: VERSION }),
  },
  {
    method: "GET",
    path: "/",
    handler: () => html(placeholderPage()),
  },
];

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    for (const route of ROUTES) {
      if (route.path === url.pathname && route.method === request.method) {
        return route.handler({ request, env, ctx, url });
      }
    }

    return json({ error: "not_found", method: request.method, path: url.pathname }, 404);
  },
};

/** @param {unknown} body */
function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** @param {string} body */
function html(body) {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function placeholderPage() {
  return `<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${APP_NAME}</title>
  </head>
  <body style="font-family: system-ui, sans-serif; padding: 2rem; line-height: 1.8">
    <main>
      <h1>${APP_NAME}</h1>
      <p>اسکلت پروژه بالا آمد. نسخه ${VERSION}</p>
      <p>پنل هنوز ساخته نشده است؛ این صفحه فقط یک جای‌نگهدار است.</p>
    </main>
  </body>
</html>`;
}
