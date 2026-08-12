<?php

declare(strict_types=1);

return [
    'name' => 'TelegramBots',
    'alias' => 'telegrambots',

    // Registry metadata — GET /api/v1/modules reads these.
    'icon' => 'send',
    'group' => 'growth',
    'order' => 11,  // sidebar position, independent of module.json load priority
    'route' => 'v1/bots',
    'permission_prefix' => 'telegram',

    // Display names (uz / ru / en)
    'labels' => [
        'uz' => 'Telegram botlar',
        'ru' => 'Telegram-боты',
        'en' => 'Telegram bots',
    ],

    'description' => '50 tagacha Telegram bot: buyurtma qabul qilish, xabarnomalar, WebApp menyu.',

    /*
    |--------------------------------------------------------------------------
    | Shared internal token
    |--------------------------------------------------------------------------
    | Used to authenticate calls between Laravel and the Python telegram-bots
    | service. The same value must appear in apps/telegram-bots/.env
    | (LARAVEL_INTERNAL_TOKEN) and apps/api/.env (TELEGRAM_INTERNAL_TOKEN).
    */
    'internal_token' => env('TELEGRAM_INTERNAL_TOKEN'),

    /*
    |--------------------------------------------------------------------------
    | Python telegram-bots service URL
    |--------------------------------------------------------------------------
    | Laravel queues outbound messages to this URL via SendTelegramMessage job.
    | Must include scheme + host + port. NO trailing slash.
    */
    'bots_service_url' => env('TELEGRAM_BOTS_SERVICE_URL', 'http://localhost:8002'),

    /*
    |--------------------------------------------------------------------------
    | Default opt-in channels
    |--------------------------------------------------------------------------
    | Names of notification channels users can opt into (stored in
    | tg_subscriptions.channel). Add new keys here — existing subscriptions
    | keep working since storage is just a string.
    */
    'channels' => [
        'orders.placed' => 'Yangi buyurtma qabul qilindi',
        'orders.ready' => 'Taom tayyor',
        'orders.delayed' => 'Buyurtma kechikmoqda',
        'orders.cancelled' => 'Buyurtma bekor qilindi',
        'delivery.assigned' => 'Yetkazish topshirildi',
        'reservation.confirmed' => 'Bron tasdiqlandi',
        'reservation.reminder' => 'Bron eslatmasi',
        'menu.stopped' => 'Taom stop-listga tushdi',
        'stock.low' => 'Ombor qoldig\'i kam',
        'shift.opened' => 'Smena ochildi',
        'shift.closed' => 'Smena yopildi (Z-hisobot)',
        'cash.anomaly' => 'Kassada anomaliya',
        'loyalty.bonus' => 'Bonus hisoblandi',
        'feedback.negative' => 'Salbiy fikr bildirildi',
        'supplier.delivery' => 'Yetkazib beruvchi keldi',
        'emergency' => 'Favqulodda xabar',
    ],

    /*
    |--------------------------------------------------------------------------
    | Outbound message defaults
    |--------------------------------------------------------------------------
    */
    'outbound' => [
        'parse_mode' => 'HTML',
        'disable_web_page_preview' => true,
        'timeout_sec' => 15,
    ],

    /*
    |--------------------------------------------------------------------------
    | Mock domain data flag
    |--------------------------------------------------------------------------
    | The bot endpoints that read from modules which are still skeletons
    | (Orders, Kitchen, Tables, Crm, Finance) return placeholder data so the bot
    | UI can be built and demoed. In production set TELEGRAM_MOCK_DATA=false so
    | they return HTTP 501 instead — a guest seeing "tez orada" is fine, a guest
    | seeing an invented bonus balance is not.
    */
    'mock_data' => (bool) env('TELEGRAM_MOCK_DATA', true),

    // Platform-wide default; per-restaurant overrides live in tenants.settings.
    'enabled' => env('MODULE_TELEGRAMBOTS_ENABLED', true),
];
