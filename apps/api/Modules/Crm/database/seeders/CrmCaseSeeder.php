<?php

declare(strict_types=1);

namespace Modules\Crm\Database\Seeders;

use App\Models\Branch;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Modules\Crm\Models\CaseEvent;
use Modules\Crm\Models\ComplaintCase;
use Modules\Crm\Models\Customer;

/**
 * The complaints desk, with one row of each kind the screen has to draw.
 *
 * The rows are the design's own — `cases-data.ts` carries them with the same
 * channels, the same amounts and the same words, including the quotes, which
 * are copied rather than paraphrased for the reason the file gives: the wording
 * is evidence.
 *
 * Four states, on purpose. One below the auto-refund ceiling (the sentence
 * saying nobody needs to be asked), one above it (the manager path), one
 * already answered (so the settled card renders), and one overdue (so the late
 * marker has something to mark). A queue seeded entirely with open complaints
 * of the same size exercises one card and hides three.
 *
 * Deterministic: the ages below are offsets from now, so the overdue row is
 * overdue on Tuesday and on Thursday alike.
 */
final class CrmCaseSeeder extends Seeder
{
    /** 1 so'm = 100 tiyin. */
    private const SOM = 100;

    public function run(): void
    {
        $branchId = Branch::query()->orderBy('id')->value('id');

        /*
         * Two of the four are attached to a real guest and two are not, which is
         * the split the desk actually sees. An anonymous complaint has nowhere
         * to put a refund, and that path has to be reachable in a demo or it is
         * only ever met in production.
         */
        $known = Customer::query()->orderBy('id')->pluck('id')->all();

        $rows = [
            [
                'number' => 'SH-2418',
                'channel' => 'web',
                'kind' => 'missing',
                'customer_id' => $known[0] ?? null,
                'guest_name' => 'Nilufar Yusupova',
                'guest_phone' => '+998901234567',
                'amount' => 24_000,
                'amount_note' => "3 × Ko'k choy",
                'quote' => 'Uch choy buyurtma qildim, ikkitasi keldi. Kuryer "shunday berildi" dedi.',
                'minutes' => 8,
                'status' => 'open',
                'outcome' => null,
            ],
            [
                'number' => 'SH-2417',
                'channel' => 'aggregator',
                'kind' => 'late',
                'customer_id' => null,
                'guest_name' => null,
                'guest_phone' => null,
                // Above the ceiling: the answer that needs somebody senior.
                'amount' => 88_000,
                'amount_note' => "To'liq buyurtma",
                'quote' => 'Bir yarim soat kutdim, ovqat sovuq keldi.',
                'minutes' => 46,
                'status' => 'in_progress',
                'outcome' => null,
            ],
            [
                'number' => 'SH-2416',
                'channel' => 'phone',
                'kind' => 'wrong',
                'customer_id' => $known[2] ?? null,
                'guest_name' => 'Bekzod Tursunov',
                'guest_phone' => '+998903334455',
                'amount' => 46_000,
                'amount_note' => "1 × Shashlik, qo'y",
                'quote' => "Qo'y so'radim, mol keldi.",
                'minutes' => 180,
                'status' => 'resolved',
                'outcome' => 'partly',
            ],
            [
                'number' => 'SH-2415',
                'channel' => 'courier',
                'kind' => 'courier',
                'customer_id' => null,
                'guest_name' => 'Anonim',
                'guest_phone' => null,
                'amount' => 12_000,
                'amount_note' => 'Yetkazish haqi',
                'quote' => 'Kuryer telefon qilmadi, pastda 20 daqiqa turdi.',
                // Older than the four-hour service level, and unanswered: the
                // overdue marker's one row.
                'minutes' => 400,
                'status' => 'open',
                'outcome' => null,
            ],
        ];

        foreach ($rows as $row) {
            $opened = now()->subMinutes((int) $row['minutes']);

            $case = ComplaintCase::query()->updateOrCreate(
                ['number' => $row['number']],
                [
                    'branch_id' => $branchId,
                    'channel' => $row['channel'],
                    'kind' => $row['kind'],
                    'customer_id' => $row['customer_id'],
                    'guest_name' => $row['guest_name'],
                    'guest_phone' => $row['guest_phone'],
                    'amount_tiyin' => (int) $row['amount'] * self::SOM,
                    'amount_note' => $row['amount_note'],
                    'quote' => $row['quote'],
                    'status' => $row['status'],
                    'due_at' => $opened->copy()->addHours((int) config('crm.cases.sla_hours')),
                ],
            );

            // `created_at` is the age the queue sorts and the overdue marker
            // reads, so it has to be moved off the seeding moment.
            $case->forceFill(['created_at' => $opened])->save();

            if ($row['outcome'] !== null) {
                $case->forceFill([
                    'outcome' => $row['outcome'],
                    'outcome_tiyin' => $case->halfOfAmount(),
                    'decided_at' => $opened->copy()->addMinutes(22),
                ])->save();
            }

            $this->history($case, $opened, is_string($row['outcome']) ? $row['outcome'] : null);
        }

        $this->command?->info(sprintf('✅ CRM: %d shikoyat yaratildi.', count($rows)));
    }

    /**
     * The two or three lines every case has, so the history panel is never
     * empty on a demo.
     */
    private function history(ComplaintCase $case, Carbon $opened, ?string $outcome): void
    {
        if ($case->events()->exists()) {
            return;
        }

        CaseEvent::query()->create([
            'tenant_id' => $case->tenant_id,
            'case_id' => $case->id,
            'kind' => 'opened',
            'to_value' => $case->channel,
            'created_at' => $opened,
        ]);

        if ($outcome !== null) {
            CaseEvent::query()->create([
                'tenant_id' => $case->tenant_id,
                'case_id' => $case->id,
                'kind' => 'decided',
                'to_value' => $outcome,
                'note' => 'Mijoz bilan gaplashildi, yarmi qaytarildi.',
                'created_at' => $opened->copy()->addMinutes(22),
            ]);
        }
    }
}
