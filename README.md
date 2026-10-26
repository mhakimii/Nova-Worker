# Nova Worker Beta

پنل مدیریت وورکر کلودفلر با رابط فارسی.

## نصب یک‌کلیکی

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/mhakimii/Nova-Worker">Deploy to Cloudflare</a>

Cloudflare خودش مخزن را کپی می‌کند، فضای KV را می‌سازد، رمز مدیر را می‌پرسد و ورکر را منتشر می‌کند. نه توکن API لازم است، نه کامند.

راهنمای کامل: [`install/index.html`](install/index.html)

بعد از نصب:

| مسیر | کار |
| --- | --- |
| `/login` | ورود مدیر |
| `/admin` | پنل مدیریت |

رمز ورود همان مقدار Secret با نام `ADMIN` است.

## نصب با GitHub Actions

اگر می‌خواهی دیپلوی از داخل ریپو انجام شود:

1. سه Secret اضافه کن: `CLOUDFLARE_API_TOKEN`، `CLOUDFLARE_ACCOUNT_ID`، `ADMIN_PASSWORD`
2. اکشن **deploy** را اجرا کن

اکشن، فضای KV را می‌سازد، `_worker.js` را منتشر می‌کند و `ADMIN` را روی ورکر تنظیم می‌کند.

## ساختار

| مسیر | کار |
| --- | --- |
| `_worker.js` | ورکر پنل (تک‌فایل) |
| `wrangler.toml` | کانفیگ استقرار و بایندینگ KV |
| `.dev.vars.example` | الگوی Secretها (در نصب یک‌کلیکی پرسیده می‌شوند) |
| `install/index.html` | صفحه‌ی نصب |
| `.github/workflows/deploy.yml` | مسیر جایگزین نصب با اکشن |

## امنیت

- هیچ توکن API در این ریپو یا در صفحه‌ی نصب ذخیره نمی‌شود.
- رمز مدیر فقط به‌صورت Secret رمزنگاری‌شده روی Cloudflare می‌ماند.
- `.dev.vars` و `.env` در `.gitignore` هستند و هرگز کامیت نمی‌شوند.
- رمز مدیر باید بلند و یکتا باشد؛ بعداً از Workers → Settings → Variables and Secrets قابل تغییر است.

## لایسنس

این پروژه بر پایه‌ی [cmliu/edgetunnel](https://github.com/cmliu/edgetunnel) است و تحت **GPL-2.0** منتشر می‌شود. متن کامل در [`LICENSE`](LICENSE) و منبع و تغییرات در [`NOTICE`](NOTICE) آمده است.
