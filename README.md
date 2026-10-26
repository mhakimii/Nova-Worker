# Nova Worker Beta

پنل مدیریت ورکر کلودفلر با رابط فارسی.

## نصب

صفحه‌ی نصب: [`install/index.html`](install/index.html) — نسخه‌ی منتشرشده:
<https://mhakimii.github.io/Nova-Worker/>

با یک ورود موقت به Cloudflare، نصب انجام می‌شود:

1. **ورود موقت** — Authorization Code + PKCE؛ نه توکن API، نه دسترسی به حساب گیت‌هاب.
2. **تنظیمات** — نام ورکر، نام فضای KV و رمز پنل با مقدار پیش‌فرض و قابل تغییر.
3. **نصب خودکار** — ساخت KV، آپلود اسکریپت، ست‌کردن `ADMIN` و فعال‌سازی `workers.dev`.
4. **لینک ورود** — آدرس `/login` و `/admin` همان‌جا نمایش داده می‌شود.

دسترسی داده‌شده فقط ۱۰ دقیقه زنده است، فقط روی سرور نصب نگه داشته می‌شود و هرگز به
مرورگر برنمی‌گردد.

بعد از نصب:

| مسیر | کار |
| --- | --- |
| `/login` | ورود مدیر |
| `/admin` | پنل مدیریت |

رمز ورود همان چیزی است که در مرحله‌ی تنظیمات گذاشتی (Secret با نام `ADMIN`).

## سرور نصب (یک‌بار)

نصب از داخل صفحه انجام می‌شود، پس یک سرور واسط لازم است: مرورگر اجازه‌ی تماس مستقیم
با `api.cloudflare.com` را ندارد (پاسخ‌ها هدر CORS ندارند).

راه‌اندازی یک‌باره در [`installer/README.md`](installer/README.md) توضیح داده شده:
ساخت OAuth client در Cloudflare، سپس اجرای اکشن **deploy-installer**.

## نصب دستی با GitHub Actions (جایگزین)

اگر ترجیح می‌دهی از داخل ریپو دیپلوی کنی:

1. سه Secret اضافه کن: `CLOUDFLARE_API_TOKEN`، `CLOUDFLARE_ACCOUNT_ID`، `ADMIN_PASSWORD`
2. اکشن **deploy** را اجرا کن

## ساختار

| مسیر | کار |
| --- | --- |
| `_worker.js` | ورکر پنل (تک‌فایل) |
| `wrangler.toml` | کانفیگ استقرار و بایندینگ KV |
| `.dev.vars.example` | الگوی Secretها |
| `install/index.html` | صفحه‌ی نصب |
| `installer/` | سرور واسط نصب (OAuth + اجرای مراحل) |
| `.github/workflows/deploy-installer.yml` | دیپلوی یک‌باره‌ی نصب‌کننده |
| `.github/workflows/deploy.yml` | مسیر جایگزین نصب با توکن |
| `.github/workflows/publish-install-page.yml` | انتشار صفحه روی GitHub Pages |

## امنیت

- هیچ توکن API در مرورگر، در صفحه‌ی نصب یا در ریپو ذخیره نمی‌شود.
- نشست کلودفلر با شناسه‌ی تصادفی و TTL ۶۰۰ ثانیه در KV سرور نصب نگه داشته می‌شود.
- رمز مدیر فقط به‌صورت Secret رمزنگاری‌شده روی Cloudflare می‌ماند.
- `.dev.vars` و `.env` در `.gitignore` هستند و هرگز کامیت نمی‌شوند.
- رمز مدیر باید بلند و یکتا باشد؛ بعداً از Workers → Settings → Variables and Secrets قابل تغییر است.

## لایسنس

این پروژه بر پایه‌ی [cmliu/edgetunnel](https://github.com/cmliu/edgetunnel) است و تحت **GPL-2.0** منتشر می‌شود. متن کامل در [`LICENSE`](LICENSE) و منبع و تغییرات در [`NOTICE`](NOTICE) آمده است.
