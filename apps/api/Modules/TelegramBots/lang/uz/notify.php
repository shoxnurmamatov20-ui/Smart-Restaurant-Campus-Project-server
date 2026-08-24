<?php

declare(strict_types=1);

/*
 * What a restaurant's own chat reads.
 *
 * Short lines on purpose: this arrives on a manager's phone during service,
 * often while they are carrying something. The number and the thing that
 * happened, and nothing else — anybody who needs more opens the console.
 */
return [
    'order_placed' => '🧾 Yangi buyurtma :number (:channel)',
    'order_paid' => "💰 Buyurtma :number to'landi — :amount",
    'approval' => "✋ Tasdiq so'ralmoqda: :kind — :amount",
    'void' => '⚠️ Hisob bekor qilindi — :amount',
    'shift_closed' => '🔒 Smena yopildi — :amount',
    'test' => '✅ Sinov xabari: Smart Restaurant Campus ulanishi ishlayapti.',
];
