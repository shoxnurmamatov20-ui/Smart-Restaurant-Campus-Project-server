<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| What comes out of a printer, in words
|--------------------------------------------------------------------------
|
| Paper is a user interface, and this is its copy. It lives in the module's own
| lang directory rather than in the console's i18n catalogue because nothing on
| a web screen ever says "Qaytim" — these strings exist only on a roll of till
| paper, and putting them in the same file as the navigation would mean two
| audiences editing one list.
|
| Rendered in the locale the request resolved, which for a till is the
| restaurant's own (X-Locale -> user -> Accept-Language -> restaurant). A guest
| in Tashkent gets an Uzbek receipt because the restaurant is Uzbek, not because
| the cashier's tablet happens to be.
|
| Kept short on purpose: at 48 columns a label and a figure share one line, and
| a label that needs 30 of them pushes the price into the wrap.
*/

return [

    // ---- Kitchen docket ----
    'docket' => [
        'order' => 'Buyurtma',
        'table' => 'STOL',
        'fired' => 'Yuborildi',
        'seat' => "o'rindiq",
        'reprint' => 'QAYTA CHOP ETILDI',
        'items' => 'Taomlar',
    ],

    // ---- Sales channel, shouted rather than mentioned ----
    // A takeaway plated onto china and a dine-in packed into a box are the same
    // mistake twice, and the cook has half a second to notice which this is.
    'channel' => [
        'dine_in' => 'ZALDA',
        'takeaway' => 'OLIB KETISH',
        'delivery' => 'YETKAZIB BERISH',
        'aggregator' => 'AGREGATOR',
    ],

    // ---- Customer receipt ----
    'receipt' => [
        'title' => 'CHEK',
        'number' => 'Chek',
        'date' => 'Sana',
        'table' => 'Stol',
        'waiter' => 'Ofitsiant',
        'cashier' => 'Kassir',
        'guests' => 'Mehmonlar',
        'subtotal' => 'Oraliq jami',
        'discount' => 'Chegirma',
        'service' => 'Xizmat haqi',
        'delivery' => 'Yetkazib berish',
        'total' => 'JAMI',
        'vat' => 'shu jumladan QQS',
        'rounding' => 'Yaxlitlash',
        'tip' => 'Choychaqa',
        'change' => 'Qaytim',
        'due' => "Qoldi to'lash",
        'thanks' => 'Rahmat! Yana kutamiz',
        'copy' => 'N U S X A',
    ],

    // ---- How the money arrived ----
    'method' => [
        'cash' => 'Naqd',
        'card' => 'Karta',
        'uzcard' => 'UzCard',
        'humo' => 'Humo',
        'visa' => 'Visa',
        'mastercard' => 'Mastercard',
        'payme' => 'Payme',
        'click' => 'Click',
        'uzum' => 'Uzum',
        'corporate' => 'Korporativ',
    ],

    // ---- The self-test a technician prints after wiring a printer ----
    'test' => [
        'title' => 'SINOV CHOP ETISH',
        'ok' => "Agar buni o'qiyotgan bo'lsangiz, printer ishlayapti.",
    ],
];
