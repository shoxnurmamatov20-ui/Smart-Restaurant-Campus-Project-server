# Telegram WebApp / Mini App integration

> Smart Restaurant Campus web va admin ilovalari Telegram ichida **Mini App** sifatida ham ochiladi.
> Foydalanuvchi botda tugmani bossa, Next.js sahifa Telegram chat ichida ochiladi va
> avtomatik avtorizatsiyalanadi — alohida parol kerak emas.

## Foydalanuvchi safari (UX)

```
[Mehmon telegramda /menu yozadi]
         │
         ▼
[Bot "📅 Dars jadvali" tugmasini ko'rsatadi (web_app type)]
         │
         ▼
[Mehmon tugmani bossa, Telegram chat ichida iframe ochiladi]
   → https://restaurant-campus.uz/tg-app/schedule
         │
         ▼
[Next.js sahifa window.Telegram.WebApp.initData o'qiydi]
         │
         ▼
[POST /api/v1/auth/telegram initData bilan]
         │
         ▼
[Laravel HMAC verify → Sanctum cookie o'rnatadi → user logged in]
         │
         ▼
[To'liq Next.js UI — mehmon menyuni ko'radi va buyurtma beradi]
```

## Bot tomonidagi WebApp tugma

Python (aiogram 3) bot kodida:

```python
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

keyboard = InlineKeyboardMarkup(inline_keyboard=[
    [InlineKeyboardButton(
        text="📅 Dars jadvali",
        web_app=WebAppInfo(url="https://restaurant-campus.uz/tg-app/schedule"),
    )]
])
await message.answer("Tanlang:", reply_markup=keyboard)
```

## Next.js tomonida (apps/web)

`apps/web/src/app/tg-app/[module]/page.tsx`:

```typescript
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TelegramAppGate({ params }: { params: { module: string } }) {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'authed' | 'error'>('loading');

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) {
      setStatus('error');
      return;
    }
    tg.ready();
    tg.expand();

    fetch('/api/v1/auth/telegram', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData: tg.initData,
        module: params.module,
      }),
    })
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then(() => {
        setStatus('authed');
        router.replace(`/${params.module}`);
      })
      .catch(() => setStatus('error'));
  }, [params.module, router]);

  if (status === 'loading') return <p>Telegram orqali kirilmoqda…</p>;
  if (status === 'error') return <p>❌ Xatolik. Iltimos, qayta urinib ko‘ring.</p>;
  return <p>Yuklanmoqda…</p>;
}
```

Asosiy `apps/web/src/app/layout.tsx` ga Telegram skriptni qo'shing:

```html
<script src="https://telegram.org/js/telegram-web-app.js" />
```

## Laravel tomonida (apps/api)

Yangi endpoint: `POST /api/v1/auth/telegram`

```php
// Modules/TelegramBots/Http/Controllers/WebAppAuthController.php
final class WebAppAuthController extends Controller
{
    public function authenticate(Request $request)
    {
        $data = $request->validate([
            'initData' => 'required|string',
            'module' => 'nullable|string',
        ]);

        // Telegram HMAC verification per docs:
        // https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
        $parsed = $this->parseInitData($data['initData']);
        $botToken = $this->resolveBotToken($parsed['bot_id'] ?? null);
        if (! $this->verifyHmac($data['initData'], $botToken)) {
            abort(401, 'Bad HMAC');
        }

        // Find or create user
        $tgUser = json_decode($parsed['user'], true);
        $telegramId = $tgUser['id'];
        $botUser = BotUser::with('user')->where('telegram_id', $telegramId)->first();
        if (! $botUser?->user) abort(403, 'Not linked to platform user');

        // Issue Sanctum session
        Auth::login($botUser->user);
        $request->session()->regenerate();

        return response()->json([
            'user' => [
                'id' => $botUser->user->id,
                'name' => $botUser->user->name,
                'email' => $botUser->user->email,
            ],
        ]);
    }

    private function verifyHmac(string $initData, string $botToken): bool
    {
        // Per Telegram spec:
        // 1. Parse initData as URL-encoded pairs
        // 2. Sort keys alphabetically (except `hash`)
        // 3. Build data_check_string = joined "key=value\n" (without hash)
        // 4. secret_key = hash_hmac('sha256', $botToken, 'WebAppData', true)
        // 5. expected = hash_hmac('sha256', $data_check_string, $secret_key)
        // 6. Compare with hash from initData

        parse_str($initData, $pairs);
        $hash = $pairs['hash'] ?? '';
        unset($pairs['hash']);
        ksort($pairs);
        $dataCheckString = implode("\n", array_map(fn ($k, $v) => "$k=$v", array_keys($pairs), $pairs));

        $secret = hash_hmac('sha256', $botToken, 'WebAppData', true);
        $expected = hash_hmac('sha256', $dataCheckString, $secret);

        return hash_equals($expected, $hash);
    }
}
```

Route:

```php
// routes/api.php
Route::post('/auth/telegram', [WebAppAuthController::class, 'authenticate']);
```

## Avantajlar

- **Bitta UI code** — apps/web/admin Next.js komponentlari Telegram ichida ham, brauzerda ham bir xil ishlaydi.
- **One-tap login** — mehmon parol kiritmaydi, Telegram HMAC yetarli.
- **Rich UX** — Telegram menyusi taqsimotiga sig'masa, WebApp orqali butun Next.js komponent (chart, form, calendar) ko'rsatish mumkin.
- **Native Telegram features** — `tg.BackButton`, `tg.MainButton`, haptic feedback, theme params (light/dark sync).

## Cheklovlar

- WebApp **HTTPS** talab qiladi (Telegram self-signed cert qabul qilmaydi).
- WebApp ichida `window.open(...)` ishlamaydi — barcha link `tg.openLink(url)` orqali ochilishi kerak.
- Telegram cache agressiv — release uchun versiya parametri qo'shish foydali (`?v=4`).

## Bog'liq

- ADR-0006: [Telegram multi-bot architecture](../decisions/0006-telegram-multibot-architecture.md)
- apps/telegram-bots/README.md: Python bot service to'liq qo'llanmasi
