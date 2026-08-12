<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\Feedback;

/**
 * What guests said.
 *
 * CrmDatabaseSeeder creates four customers and no feedback, which leaves the
 * CRM screen's second half empty — and that half is the one a manager acts on.
 * A loyalty list without complaints attached to it is an address book.
 *
 * The mix is deliberately unflattering. Two fives, a four, a three and a one:
 * roughly what a real week produces, and enough that the screen has to prove it
 * can show a bad review as clearly as a good one. A demo full of fives teaches
 * nothing about the flow that matters — the urgent complaint that has to reach
 * a manager before the guest leaves.
 *
 * Scores and comments are attached to orders that exist, so a manager clicking
 * through from a review reaches a real bill.
 */
final class CrmFeedbackSeeder extends Seeder
{
    /**
     * @var array<int, array{score: int, aspect: string, source: string, urgent: bool, status: string, comment: string}>
     */
    private const ENTRIES = [
        [
            'score' => 5, 'aspect' => 'food', 'source' => 'qr', 'urgent' => false, 'status' => 'resolved',
            'comment' => "Osh a'lo darajada edi, go'shti yumshoq. Rahmat!",
        ],
        [
            'score' => 5, 'aspect' => 'service', 'source' => 'bot', 'urgent' => false, 'status' => 'resolved',
            'comment' => 'Ofitsiant juda xushmuomala, hamma narsani tushuntirdi.',
        ],
        [
            'score' => 4, 'aspect' => 'speed', 'source' => 'qr', 'urgent' => false, 'status' => 'in_review',
            'comment' => "Taom mazali, lekin 25 daqiqa kutdik. Tushlik payti bo'lsa kerak.",
        ],
        [
            'score' => 3, 'aspect' => 'cleanliness', 'source' => 'web', 'urgent' => false, 'status' => 'new',
            'comment' => 'Stol ustida oldingi mehmonlardan qolgan izlar bor edi.',
        ],
        [
            // The one that has to reach someone today. `is_urgent` is what the
            // screen sorts on, and a one-star with an allergy in it is the
            // reason the flag exists at all.
            'score' => 1, 'aspect' => 'food', 'source' => 'aggregator', 'urgent' => true, 'status' => 'new',
            'comment' => "Yong'oqqa allergiyam borligini aytgan edim, salatda yong'oq chiqdi. Bu jiddiy.",
        ],
        [
            'score' => 2, 'aspect' => 'price', 'source' => 'web', 'urgent' => false, 'status' => 'in_review',
            'comment' => 'Xizmat haqi 10% ekanini chek berilgandan keyin bildik.',
        ],
    ];

    public function run(): void
    {
        $customers = Customer::query()->orderBy('id')->get();

        if ($customers->isEmpty()) {
            $this->command?->warn('⏭  CRM: mijoz yo\'q — avval CrmDatabaseSeeder.');

            return;
        }

        // Query builder, not the Orders models: a module never imports another
        // module's classes — see tests/Architecture/ModuleBoundaryTest.
        $orders = DB::table('orders.orders')
            ->whereIn('status', ['paid', 'closed'])
            ->orderBy('id')
            ->pluck('id');

        foreach (self::ENTRIES as $index => $entry) {
            $customer = $customers[$index % $customers->count()];

            Feedback::query()->updateOrCreate(
                ['customer_id' => $customer->id, 'comment' => $entry['comment']],
                [
                    'tenant_id' => $customer->tenant_id,
                    'order_id' => $orders[$index % max($orders->count(), 1)] ?? null,
                    'score' => $entry['score'],
                    'aspect' => $entry['aspect'],
                    'source' => $entry['source'],
                    'is_urgent' => $entry['urgent'],
                    'status' => $entry['status'],
                    // Only a resolved review has a resolution date. A `new` one
                    // carrying a timestamp would make the screen's "how long has
                    // this been waiting" column meaningless.
                    'resolved_at' => $entry['status'] === 'resolved' ? now()->subDays(2) : null,
                    'created_at' => now()->subDays(6 - $index)->addHours(13),
                ],
            );
        }

        $this->command?->info(sprintf(
            '✅ CRM: %d ta fikr-mulohaza yozildi (1 tasi shoshilinch).',
            count(self::ENTRIES),
        ));
    }
}
