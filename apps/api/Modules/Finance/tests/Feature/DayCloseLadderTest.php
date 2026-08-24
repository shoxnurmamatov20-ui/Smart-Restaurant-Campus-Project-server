<?php

declare(strict_types=1);

namespace Modules\Finance\Tests\Feature;

use App\Contracts\Finance\Tender;
use App\Contracts\Finance\TillLedger;
use App\Models\StoredDomainEvent;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Errors\ApiException;
use App\Support\Finance\CashRounding;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Finance\Models\CashCount;
use Modules\Finance\Models\CashShift;
use Modules\Finance\Services\EloquentTillLedger;
use Modules\Finance\Services\ShiftCloser;
use Modules\Finance\Services\ShiftReporter;
use Modules\Finance\Support\CashDenominations;
use RuntimeException;
use Tests\TestCase;

/**
 * Closing the day: counting the drawer, and what a gap costs.
 *
 * The plan states the rule as "a difference that is not zero does not close" and
 * then names two thresholds — a manager's PIN at 20 000 so'm, the owner told at
 * 50 000. Read literally the first sentence locks a till over a hundred so'm and
 * teaches a cashier to type a figure that balances instead of the one they
 * counted, which throws away the only signal counting produces. So it is read as:
 * a difference never closes SILENTLY, and the ladder below is what "silently"
 * means at each size.
 *
 * The other half of this file is the count itself. A drawer typed as a total is a
 * number anybody can produce without opening it, and it is the number every Z is
 * reconciled against — so it has to come from the notes.
 */
final class DayCloseLadderTest extends TestCase
{
    use RefreshDatabase;

    /** Uzbekistan's notes, in tiyin. 1 so'm = 100 tiyin. */
    private const NOTE_100K = 100_000 * 100;

    private const NOTE_50K = 50_000 * 100;

    private const NOTE_20K = 20_000 * 100;

    private const NOTE_1K = 1_000 * 100;

    /** 20 000 so'm: the rung where a manager has to sign. */
    private const APPROVAL_RUNG = 20_000 * 100;

    /** 50 000 so'm: the rung where the owner hears about it tonight. */
    private const OWNER_RUNG = 50_000 * 100;

    private TillLedger $till;

    private ShiftCloser $closer;

    private User $cashier;

    private User $manager;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);

        app(TenantContext::class)->set($this->tenant);

        $this->cashier = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->cashier->assignRole('cashier');

        // `finance.manage`: held by the owner, the managers and the accountant,
        // and pointedly not by a cashier. The permission already draws the line
        // the plan asks for, so no new one had to be invented.
        $this->manager = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->manager->assignRole('branch-manager');

        $this->till = app(TillLedger::class);
        $this->closer = app(ShiftCloser::class);
    }

    /** A shift with a 200 000 so'm float and a 300 000 so'm cash bill in it. */
    private function anEvening(): CashShift
    {
        $shiftId = $this->till->openShift($this->cashier->id, 20_000_000);
        $this->till->capture($shiftId, 1, 'A-0001', new Tender('cash', 30_000_000));

        return CashShift::query()->findOrFail($shiftId);
    }

    // ============ Counting by note ============

    /**
     * Nine 50 000 so'm notes are 450 000 so'm, not nine.
     *
     * The mistake this guards against is one line of plausible code —
     * `array_sum($breakdown)` adds the QUANTITIES — and its result does not look
     * like a bug. It looks like a catastrophic shortfall, on the one report a
     * person is held to.
     */
    public function test_a_counted_drawer_totals_its_notes_and_not_the_number_of_them(): void
    {
        $total = CashDenominations::total([self::NOTE_50K => 9]);

        $this->assertSame(45_000_000, $total);
        $this->assertNotSame(9, $total);
    }

    public function test_a_denomination_that_is_not_a_note_is_refused(): void
    {
        // 2 500 so'm. Plausible as a typo, and worth a quarter of a million tiyin
        // in a Z-report if it were quietly accepted.
        $this->expectException(ApiException::class);
        CashDenominations::total([250_000 => 4]);
    }

    public function test_a_negative_note_count_is_refused(): void
    {
        // A negative "count" is the shape a theft would take: it reduces the
        // counted total without removing anything from the drawer.
        $this->expectException(ApiException::class);
        CashDenominations::total([self::NOTE_100K => -3]);
    }

    /**
     * Cash is rounded to something the drawer can actually pay.
     *
     * The two constants live apart — the step in App\Support\Finance\CashRounding,
     * the notes in this module's config — and nothing but this test connects them.
     * If the step ever became smaller than the smallest note, every cash bill
     * would round to a figure no cashier could hand over, and the drawer would be
     * out by a few hundred so'm on every single sale.
     */
    public function test_the_cash_rounding_step_is_payable_in_notes(): void
    {
        $smallest = CashDenominations::smallest();

        $this->assertGreaterThan(0, $smallest);
        $this->assertSame(
            0,
            CashRounding::STEP_TIYIN % $smallest,
            'Cash rounds to a figure the smallest note cannot make up.',
        );
    }

    /**
     * A tablet that sends both a breakdown and a total, and they disagree.
     *
     * Refused rather than resolved. Picking one of the two would make the Z depend
     * on which branch of an if-statement ran, and the disagreement itself is the
     * useful signal: somebody typed over the count, or the client is a version
     * behind on the note ladder.
     */
    public function test_a_total_that_disagrees_with_the_notes_refuses_the_close(): void
    {
        $shift = $this->anEvening();

        $this->expectException(ApiException::class);
        $this->closer->close(
            shift: $shift,
            // Five 100 000 so'm notes are 500 000 so'm. The total says 450 000 —
            // a note miscounted, or a field the tablet forgot to recompute.
            countedCash: 45_000_000,
            denominations: [self::NOTE_100K => 5],
        );
    }

    public function test_closing_by_note_stores_the_breakdown_that_produced_the_total(): void
    {
        $shift = $this->anEvening();

        // 200 000 float + 300 000 taken = 500 000 so'm: five 100 000 notes.
        $this->closer->close(
            shift: $shift,
            denominations: [self::NOTE_100K => 5],
            countedByUserId: $this->cashier->id,
        );

        $count = CashCount::query()->where('cash_shift_id', $shift->id)->where('kind', 'close')->firstOrFail();

        $this->assertSame(50_000_000, $count->total);
        $this->assertSame([self::NOTE_100K => 5], $count->breakdown);
        $this->assertSame(5, $count->note_count);
        $this->assertSame(0, (int) $shift->refresh()->difference);
    }

    // ============ The shift lock ============

    /**
     * Counting a till that is still selling gives a figure that is stale before
     * it is finished — and the person holding the notes is the one asked about it.
     */
    public function test_counting_stops_the_drawer_selling(): void
    {
        $shift = $this->anEvening();

        $this->closer->lock($shift);

        $this->assertSame('counting', $shift->refresh()->status);

        $this->expectException(RuntimeException::class);
        $this->till->capture((int) $shift->id, 2, 'A-0002', new Tender('cash', 1_000_000));
    }

    public function test_a_locked_drawer_pays_nothing_out_either(): void
    {
        $shift = $this->anEvening();
        $this->closer->lock($shift);

        $this->expectException(RuntimeException::class);
        $this->till->recordCashOut((int) $shift->id, 1_000_000, 'Inkassatsiya');
    }

    /**
     * A shift being counted is still this cashier's shift.
     *
     * The check that says "do you already have a till" read `open()`, so the
     * moment `counting` existed it would have handed out a second drawer — and
     * every sale afterwards would have landed in whichever of the two the session
     * happened to be holding.
     */
    public function test_a_cashier_counting_one_drawer_is_not_given_another(): void
    {
        $shift = $this->anEvening();
        $this->closer->lock($shift);

        $this->assertSame((int) $shift->id, $this->till->openShiftFor($this->cashier->id));

        $this->expectException(RuntimeException::class);
        $this->till->openShift($this->cashier->id, 0);
    }

    /**
     * A mis-tap has to have a way back, or the answer is "close the shift and
     * open a new one" — a Z-report nobody wanted and a float counted twice.
     */
    public function test_a_locked_drawer_can_be_put_back_to_work(): void
    {
        $shift = $this->anEvening();
        $this->closer->lock($shift);

        $this->closer->unlock($shift);

        $this->assertSame('open', $shift->refresh()->status);
        $this->assertNull($shift->locked_at);

        // And it sells again.
        $this->till->capture((int) $shift->id, 2, 'A-0002', new Tender('cash', 1_000_000));
        $this->assertSame(31_000_000, $shift->refresh()->expectedCashTerms()['cash_in']);
    }

    // ============ The ladder ============

    public function test_a_drawer_that_agrees_to_the_tiyin_closes_without_ceremony(): void
    {
        $shift = $this->anEvening();

        $closed = $this->closer->close(shift: $shift, countedCash: 50_000_000);

        $this->assertSame('closed', $closed->status);
        $this->assertSame(0, (int) $closed->difference);
        $this->assertNull($closed->difference_reason);
        $this->assertNull($closed->approved_by_user_id);
    }

    public function test_a_small_gap_needs_a_reason_and_nothing_more(): void
    {
        $shift = $this->anEvening();

        // 1 000 so'm short: well under the manager's rung.
        $closed = $this->closer->close(
            shift: $shift,
            countedCash: 50_000_000 - self::NOTE_1K,
            reason: 'Mehmonga ortiqcha qaytim berilgan',
            countedByUserId: $this->cashier->id,
        );

        $this->assertSame(-self::NOTE_1K, (int) $closed->difference);
        $this->assertSame('Mehmonga ortiqcha qaytim berilgan', $closed->difference_reason);
        $this->assertNull($closed->approved_by_user_id, 'A small gap must not need a manager.');
    }

    public function test_the_same_gap_with_nothing_said_about_it_does_not_close(): void
    {
        $shift = $this->anEvening();

        try {
            $this->closer->close(shift: $shift, countedCash: 50_000_000 - self::NOTE_1K);
            $this->fail('An unexplained difference closed the till.');
        } catch (ApiException $refusal) {
            $this->assertSame('finance.variance_needs_reason', $refusal->error->code);
        }

        // The refusal leaves the till selling. A drawer left locked by a rejected
        // close is a queue at the counter and a cashier who cannot undo it.
        $this->assertSame('open', $shift->refresh()->status);
    }

    /**
     * A surplus is judged exactly like a shortfall.
     *
     * The ordinary cause of one is a sale that was taken and never rung up, so a
     * policy that only looked at shortfalls would wave through the half of the
     * problem that is actually theft.
     */
    public function test_a_drawer_that_is_over_is_judged_like_one_that_is_short(): void
    {
        $shift = $this->anEvening();

        $this->expectException(ApiException::class);
        $this->closer->close(shift: $shift, countedCash: 50_000_000 + self::NOTE_20K);
    }

    public function test_a_gap_past_twenty_thousand_som_needs_a_manager(): void
    {
        $shift = $this->anEvening();

        try {
            $this->closer->close(
                shift: $shift,
                countedCash: 50_000_000 - self::APPROVAL_RUNG,
                reason: 'Sabab yozildi, lekin imzo yo\'q',
                countedByUserId: $this->cashier->id,
            );
            $this->fail('A 20 000 so\'m gap closed without an authorisation.');
        } catch (ApiException $refusal) {
            $this->assertSame('finance.variance_needs_approval', $refusal->error->code);
        }

        $closed = $this->closer->close(
            shift: $shift,
            countedCash: 50_000_000 - self::APPROVAL_RUNG,
            reason: 'Kassa qutisi ortidan topilmadi',
            countedByUserId: $this->cashier->id,
            approvedByUserId: $this->manager->id,
        );

        $this->assertSame($this->manager->id, (int) $closed->approved_by_user_id);
        $this->assertSame($this->cashier->id, (int) $closed->closed_by_user_id);
    }

    /**
     * An approver who is the person closing the till is not a second pair of
     * eyes; it is the same pair, and allowing it makes the whole rung decorative.
     */
    public function test_a_cashier_cannot_sign_for_their_own_gap(): void
    {
        $shift = $this->anEvening();

        try {
            $this->closer->close(
                shift: $shift,
                countedCash: 50_000_000 - self::APPROVAL_RUNG,
                reason: 'O\'zim tasdiqlayman',
                countedByUserId: $this->cashier->id,
                approvedByUserId: $this->cashier->id,
            );
            $this->fail('A cashier signed for their own difference.');
        } catch (ApiException $refusal) {
            $this->assertSame('finance.variance_self_approved', $refusal->error->code);
        }
    }

    /**
     * The POS authenticates the manager; Finance checks the manager anyway.
     *
     * A till that sent an arbitrary user id would otherwise write "authorised by"
     * against somebody who never saw the drawer.
     */
    public function test_an_approver_without_finance_manage_is_refused(): void
    {
        $shift = $this->anEvening();
        $waiter = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $waiter->assignRole('waiter');

        try {
            $this->closer->close(
                shift: $shift,
                countedCash: 50_000_000 - self::APPROVAL_RUNG,
                reason: 'Ofitsiant imzoladi',
                countedByUserId: $this->cashier->id,
                approvedByUserId: $waiter->id,
            );
            $this->fail('A waiter authorised a till difference.');
        } catch (ApiException $refusal) {
            $this->assertSame('finance.variance_approver_not_permitted', $refusal->error->code);
        }
    }

    public function test_an_approver_from_another_restaurant_is_refused(): void
    {
        $shift = $this->anEvening();

        $other = Tenant::query()->create([
            'name' => 'City Cafe', 'slug' => 'city-cafe', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('branch-manager');

        try {
            $this->closer->close(
                shift: $shift,
                countedCash: 50_000_000 - self::APPROVAL_RUNG,
                reason: 'Boshqa restoran menejeri',
                countedByUserId: $this->cashier->id,
                approvedByUserId: $stranger->id,
            );
            $this->fail('Another restaurant\'s manager authorised this till.');
        } catch (ApiException $refusal) {
            $this->assertSame('finance.variance_approver_unknown', $refusal->error->code);
        }
    }

    /**
     * Past 50 000 so'm the owner is told the same evening.
     *
     * Published rather than notified: Finance does not know whether this owner
     * reads Telegram, email or a dashboard, and must not have to.
     */
    public function test_a_gap_past_fifty_thousand_som_tells_the_owner(): void
    {
        $shift = $this->anEvening();

        $this->closer->close(
            shift: $shift,
            countedCash: 50_000_000 - self::OWNER_RUNG,
            reason: 'Kamomad — tekshiruv kerak',
            countedByUserId: $this->cashier->id,
            approvedByUserId: $this->manager->id,
        );

        $flagged = StoredDomainEvent::query()->where('name', 'finance.shift_variance_flagged')->first();

        $this->assertNotNull($flagged, 'A 50 000 so\'m shortfall passed without telling anybody.');
        $this->assertSame(-self::OWNER_RUNG, $flagged->payload['difference']);
        $this->assertSame(self::OWNER_RUNG, $flagged->payload['shortfall']);
        $this->assertSame(0, $flagged->payload['surplus']);
    }

    public function test_a_gap_below_the_owner_rung_is_not_escalated(): void
    {
        $shift = $this->anEvening();

        $this->closer->close(
            shift: $shift,
            countedCash: 50_000_000 - self::APPROVAL_RUNG,
            reason: 'Menejer tasdiqladi',
            countedByUserId: $this->cashier->id,
            approvedByUserId: $this->manager->id,
        );

        $this->assertSame(
            0,
            StoredDomainEvent::query()->where('name', 'finance.shift_variance_flagged')->count(),
            'An owner told about every 20 000 so\'m stops reading the messages.',
        );

        // The close itself is still announced — analytics and the owner's
        // dashboard care about every shift, not only the bad ones.
        $this->assertSame(1, StoredDomainEvent::query()->where('name', 'finance.shift_closed')->count());
    }

    // ============ The Z is a document ============

    /**
     * Once it is signed it does not move.
     *
     * The takings, the split by method and the bill count were recomputed from
     * the payment rows every time anybody opened a closed shift. Refund one of
     * yesterday's bills this afternoon and yesterday's Z quietly reported
     * different figures from the sheet in the folder, with nothing to say it had
     * changed or when.
     */
    public function test_the_z_report_does_not_change_after_it_is_signed(): void
    {
        $shift = $this->anEvening();
        $paymentId = (int) $shift->payments()->firstOrFail()->getKey();

        $closed = $this->closer->close(shift: $shift, countedCash: 50_000_000);
        $signed = $closed->z_report;

        $this->assertIsArray($signed);
        $this->assertSame(30_000_000, $signed['turnover']['takings']);

        // A refund tomorrow, out of tomorrow's drawer.
        $tomorrow = $this->till->openShift($this->manager->id, 0);
        app(EloquentTillLedger::class)->refundPayment($paymentId, 'Mehmon shikoyat qildi', $tomorrow);

        $reread = app(EloquentTillLedger::class)->shiftTotals((int) $closed->id);

        $this->assertSame(30_000_000, $reread->totalTakings, 'Last night\'s Z moved.');
        $this->assertSame(50_000_000, $reread->expectedCash);
        $this->assertSame(0, $reread->difference);
    }

    /**
     * The four sections, in the order the plan names them.
     *
     * Turnover, then how it was paid, then the drawer, then the adjustments. Each
     * one explains the next — this is what we sold, this is which of it came in
     * notes, this is therefore what should be in the box, and these are the
     * reasons it is not exactly that. Put the adjustments first and the same
     * figures read as a defence.
     */
    public function test_the_report_reads_turnover_then_methods_then_drawer_then_adjustments(): void
    {
        $shift = $this->anEvening();
        $this->till->capture((int) $shift->id, 2, 'A-0002', new Tender('uzcard', 12_000_000, 'RRN-1', 1_000_000));

        $document = app(ShiftReporter::class)->document($shift->refresh());

        $this->assertSame(
            ['shift', 'turnover', 'methods', 'drawer', 'adjustments', 'variance', 'fiscal', 'signatures'],
            array_keys($document),
        );

        $this->assertSame(42_000_000, $document['turnover']['takings']);
        $this->assertSame(2, $document['turnover']['bills']);

        // Card money is takings and is not in the box; the acquirer's cut is
        // neither. Both have to be visible or a gap gets blamed on a person.
        $methods = [];

        foreach ($document['methods'] as $row) {
            $methods[$row['method']] = $row;
        }

        $this->assertSame(30_000_000, $methods['cash']['amount']);
        $this->assertGreaterThan(0, $methods['uzcard']['fees']);
        $this->assertSame(
            $methods['uzcard']['amount'] - $methods['uzcard']['fees'],
            $methods['uzcard']['net'],
        );

        $this->assertSame(50_000_000, $document['drawer']['expected_cash']);
        $this->assertNull($document['drawer']['counted_cash'], 'An X-report has counted nothing.');

        // The tip was left on a card, so it is owed to the waiter and is not in
        // the drawer. Counting all tips into the box would show a surplus every
        // night a guest tipped on a card.
        $this->assertSame(1_000_000, $document['adjustments']['tips']['total']);
        $this->assertSame(0, $document['adjustments']['tips']['cash']);
        $this->assertSame(1_000_000, $document['adjustments']['tips']['non_cash']);
    }

    /**
     * Who opened the drawer, by name.
     *
     * The console prints "opened at 09:00 by …" over the till screen, and the
     * name came from the message catalogue — one demo cashier on every
     * restaurant's till, whoever had actually started the shift. An id cannot
     * be shown to a person, so the document resolves the name the same way the
     * signatures block already does.
     */
    public function test_the_document_names_who_opened_the_shift(): void
    {
        $document = app(ShiftReporter::class)->document($this->anEvening());

        $this->assertSame($this->cashier->id, $document['shift']['opened_by_user_id']);
        $this->assertSame($this->cashier->name, $document['shift']['opened_by']);
    }

    // ============ Handing the till over ============

    /**
     * The notes never move, which is the entire point.
     */
    public function test_a_handover_floats_the_next_person_with_the_same_notes(): void
    {
        $shift = $this->anEvening();
        $nextCashier = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $nextCashier->assignRole('cashier');

        $result = $this->closer->handOver(
            shift: $shift,
            toUserId: $nextCashier->id,
            denominations: [self::NOTE_100K => 5],
            countedByUserId: $this->cashier->id,
        );

        $this->assertSame('closed', $result['shift']->status);
        $this->assertSame(0, (int) $result['shift']->difference);

        // Her float IS his closing count, and the link says so rather than
        // leaving two matching numbers to be taken on trust.
        $this->assertSame(50_000_000, (int) $result['next']->opening_cash);
        $this->assertSame((int) $result['next']->id, (int) $result['shift']->handed_over_to_shift_id);
        $this->assertSame($nextCashier->id, (int) $result['next']->opened_by_user_id);

        // Two counts of the same notes: the one that ended a shift and the one
        // that started the next.
        $this->assertSame('handover', CashCount::query()
            ->where('cash_shift_id', $result['shift']->id)->value('kind'));
        $this->assertSame(50_000_000, (int) CashCount::query()
            ->where('cash_shift_id', $result['next']->id)->value('total'));
    }

    public function test_a_handover_refuses_a_cashier_who_already_holds_a_till(): void
    {
        $shift = $this->anEvening();
        $busy = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $this->till->openShift($busy->id, 0);

        try {
            $this->closer->handOver(shift: $shift, toUserId: $busy->id, countedCash: 50_000_000);
            $this->fail('One cashier was handed a second drawer.');
        } catch (ApiException $refusal) {
            $this->assertSame('finance.handover_cashier_busy', $refusal->error->code);
        }

        // And the shift being handed over is untouched: a refused handover must
        // not leave the first till closed and the second one never opened.
        $this->assertSame('open', $shift->refresh()->status);
    }

    // ============ Money that is not a sale ============

    /**
     * Change fetched from the safe so the till can break a 200 000 note.
     *
     * The term was missing from the expected-cash arithmetic entirely, so every
     * one of these came back at closing as a drawer mysteriously over — which
     * reads as a cashier who cannot count or, worse, one holding the difference
     * back for later.
     */
    public function test_money_brought_to_the_till_is_expected_in_the_drawer(): void
    {
        $shift = $this->anEvening();

        app(EloquentTillLedger::class)->recordCashIn((int) $shift->id, self::NOTE_50K, 'Maydalash uchun');

        $this->assertSame(50_000_000 + self::NOTE_50K, $shift->refresh()->computeExpectedCash());

        // It is not takings. Nothing was sold.
        $this->assertSame(30_000_000, $this->till->shiftTotals((int) $shift->id)->totalTakings);

        $closed = $this->closer->close(shift: $shift, countedCash: 50_000_000 + self::NOTE_50K);
        $this->assertSame(0, (int) $closed->difference, 'Change brought in read as a surplus.');
    }

    /**
     * Money to the safe is not money missing.
     */
    public function test_a_counted_collection_does_not_read_as_a_shortfall(): void
    {
        $shift = $this->anEvening();

        $this->actingAs($this->cashier)
            ->postJson("/api/v1/finance/shifts/{$shift->id}/collection", [
                'denominations' => [self::NOTE_100K => 2],
                'reason' => 'Inkassatsiya #1',
            ])
            ->assertCreated()
            ->assertJsonPath('data.amount', 20_000_000)
            ->assertJsonPath('data.expected_cash', 30_000_000);

        $closed = $this->closer->close(shift: $shift->refresh(), countedCash: 30_000_000);

        $this->assertSame(0, (int) $closed->difference, 'A collection must never be blamed on the cashier.');
        $this->assertSame(20_000_000, (int) CashCount::query()
            ->where('cash_shift_id', $shift->id)->where('kind', 'collection')->value('total'));
    }

    // ============ The note ladder is served, not guessed ============

    /**
     * Eight notes, not six.
     *
     * The tablet's opening screen shipped with 20 000 and 2 000 so'm missing, so a
     * cashier holding either had nowhere to count them — and a float that is short
     * is a drawer that is short all evening. The server is the source of the list
     * so a client can stop guessing.
     */
    public function test_the_api_serves_every_note_in_circulation(): void
    {
        $this->actingAs($this->cashier)
            ->getJson('/api/v1/finance/denominations')
            ->assertOk()
            ->assertJsonPath('data.currency', 'UZS')
            ->assertJsonPath('data.tiyin_per_unit', 100)
            ->assertJsonPath('data.rounding_step', CashRounding::STEP_TIYIN)
            ->assertJsonPath('data.denominations', [
                200_000 * 100, 100_000 * 100, 50_000 * 100, 20_000 * 100,
                10_000 * 100, 5_000 * 100, 2_000 * 100, 1_000 * 100,
            ]);
    }
}
