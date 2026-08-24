<?php

declare(strict_types=1);

namespace Modules\Kitchen\Tests\Feature;

use App\Contracts\Finance\Tender;
use App\Contracts\Orders\Bill;
use App\Contracts\Orders\BillRegistry;
use App\Contracts\Printing\PrintSpooler;
use App\Models\Branch;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Finance\TenderPlan;
use App\Support\Tenancy\BranchContext;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Kitchen\Models\KitchenStation;
use Modules\Kitchen\Models\KitchenTicket;
use Modules\Kitchen\Models\Printer;
use Modules\Kitchen\Models\PrintJob;
use Modules\Kitchen\Printing\Document;
use Modules\Kitchen\Printing\EloquentPrintSpooler;
use Modules\Kitchen\Printing\EscPos;
use Modules\Kitchen\Printing\PrintQueue;
use Modules\Menu\Models\MenuItem;
use Modules\Menu\Models\ModifierGroup;
use Modules\Menu\Models\ModifierOption;
use Tests\TestCase;

/**
 * Paper, and what happens when there is none.
 *
 * The plan's acceptance test for P8 is three sentences: the cook works from
 * paper, the guest leaves with a receipt, and when a printer dies the waiter
 * learns it from the status strip rather than from the kitchen. Most of what is
 * below is the third one, because it is the only one that is hard — printing
 * when everything works is easy, and a restaurant does not need a queue for it.
 */
final class PrintQueueTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Branch $chilonzor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->tenant = Tenant::query()->create([
            'name' => 'Osh Markazi', 'slug' => 'osh-markazi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(TenantContext::class)->set($this->tenant);

        $this->chilonzor = Branch::query()->create([
            'tenant_id' => $this->tenant->id, 'name' => 'Chilonzor', 'slug' => 'chilonzor',
            'city' => 'Toshkent', 'address' => 'Bunyodkor 12', 'phone' => '+998 71 200 00 00',
            'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        app(BranchContext::class)->set($this->chilonzor);

        $chef = User::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Aziz Karimov']);
        $chef->assignRole('chef');
        $this->actingAs($chef);
    }

    // ============ Firing a bill puts paper on the pass ============

    public function test_firing_a_bill_queues_a_docket_for_the_stations_printer(): void
    {
        $grill = $this->printer('grill-1', 'kitchen');
        KitchenStation::factory()->create(['code' => 'grill', 'name' => 'Mangal', 'printer_id' => $grill->id]);

        $this->fireBill('grill');

        $job = PrintJob::query()->firstOrFail();

        $this->assertSame('docket', $job->kind);
        $this->assertSame('queued', $job->status);
        $this->assertSame($grill->id, $job->printer_id);
        $this->assertSame($this->chilonzor->id, $job->branch_id);
    }

    public function test_a_station_with_no_printer_of_its_own_uses_the_branch_default(): void
    {
        // Most restaurants have one machine at the pass and five stations
        // pointing at it. Requiring each to be configured before anything
        // prints means a venue that opens on a Friday night prints nothing.
        $pass = $this->printer('pass', 'kitchen', ['is_default' => true]);
        KitchenStation::factory()->create(['code' => 'grill', 'name' => 'Mangal', 'printer_id' => null]);

        $this->fireBill('grill');

        $this->assertSame($pass->id, PrintJob::query()->firstOrFail()->printer_id);
    }

    public function test_a_station_pointed_at_a_deactivated_printer_falls_back_rather_than_printing_nowhere(): void
    {
        $broken = $this->printer('grill-1', 'kitchen', ['is_active' => false]);
        $pass = $this->printer('pass', 'kitchen', ['is_default' => true]);
        KitchenStation::factory()->create(['code' => 'grill', 'name' => 'Mangal', 'printer_id' => $broken->id]);

        $this->fireBill('grill');

        $this->assertSame($pass->id, PrintJob::query()->firstOrFail()->printer_id);
    }

    public function test_a_venue_with_no_printers_still_sells(): void
    {
        // The rule that separates paper from money: a printer that is out,
        // unplugged or never installed must never stop a restaurant serving.
        $bill = $this->fireBill('grill');

        $this->assertSame(0, PrintJob::query()->count());
        $this->assertSame('placed', $bill->status);
        $this->assertSame(1, KitchenTicket::query()->count());
    }

    public function test_nothing_configured_and_nothing_routed_are_different_answers(): void
    {
        // Two different jobs for whoever reads the status strip: one is a box
        // still in a cupboard, the other is hardware on the wall wired wrong.
        $ticket = $this->fireBillAndTicket('grill');

        $this->assertSame('no_printer', $this->spooler()->docket($ticket)->reason);

        $this->printer('receipt-1', 'receipt');

        $this->assertSame('no_route', $this->spooler()->docket($ticket)->reason);
    }

    // ============ What is on the paper ============

    public function test_the_docket_carries_the_modifiers_and_the_seat(): void
    {
        // The single most consequential assertion in this file. "No onion" is an
        // allergy until proven otherwise, and a docket that drops it is the one
        // failure here that can put somebody in hospital. The seat number is how
        // four plates reach four people without the runner asking.
        $printer = $this->printer('pass', 'kitchen', ['is_default' => true]);
        KitchenStation::factory()->create(['code' => 'grill', 'name' => 'Mangal']);

        $dish = $this->dish('grill');
        $group = ModifierGroup::factory()->create(['is_multi' => true, 'min_choices' => 0, 'max_choices' => 2]);
        $option = ModifierOption::factory()->free()->create([
            'modifier_group_id' => $group->id,
            'name' => ['uz' => 'Piyozsiz', 'ru' => 'Без лука', 'en' => 'No onion'],
        ]);
        $dish->modifierGroups()->attach($group->id, ['tenant_id' => $dish->tenant_id]);

        $bill = $this->bills()->open('dine_in', tableLabel: 'A-7');
        $this->bills()->addLine($bill->id, $dish->id, 2, seatNo: 3, modifierChoiceIds: [$option->id]);
        $this->bills()->send($bill->id);

        $paper = $this->paperFor(PrintJob::query()->where('kind', 'docket')->firstOrFail(), $printer);

        $this->assertStringContainsString('Piyozsiz', $paper);
        $this->assertStringContainsString("o'rindiq 3", $paper);
        $this->assertStringContainsString('2 x '.$dish->title, $paper);
        // A pass has no use for money, and a docket showing it invites the wrong
        // conversation at the wrong end of the kitchen.
        $this->assertStringNotContainsString('45 000', $paper);
    }

    public function test_the_docket_shouts_the_table_and_the_channel(): void
    {
        $printer = $this->printer('pass', 'kitchen', ['is_default' => true]);
        KitchenStation::factory()->create(['code' => 'grill', 'name' => 'Mangal']);

        $this->fireBill('grill', channel: 'takeaway', tableLabel: null);

        $paper = $this->paperFor(PrintJob::query()->firstOrFail(), $printer);

        // A takeaway plated onto china is the same half-second of not looking
        // as a dine-in packed into a box, and both come back.
        $this->assertStringContainsString('OLIB KETISH', $paper);
        $this->assertStringContainsString('MANGAL', $paper);
    }

    public function test_the_receipt_explains_every_adjustment_including_the_rounding(): void
    {
        // Q7 rounds cash to the nearest 1 000 so'm. A slip that shows 45 000
        // against a bill of 45 240 with nothing naming the difference reads, to
        // a guest, as the till having got their order wrong.
        $printer = $this->printer('kassa', 'receipt', ['is_default' => true, 'opens_drawer' => true]);

        $bill = $this->openBillWorth(4_524_000);
        $plan = TenderPlan::of($bill->total, [['method' => 'cash', 'amount' => 5_000_000]], 100_000);

        $outcome = app(PrintSpooler::class)->receipt($bill, $plan, [
            new Tender('cash', 5_000_000),
        ]);

        $this->assertTrue($outcome->queued);

        $paper = $this->paperFor(PrintJob::query()->where('kind', 'receipt')->firstOrFail(), $printer);

        $this->assertStringContainsString('Osh Markazi', $paper);
        $this->assertStringContainsString('Chilonzor', $paper);
        $this->assertStringContainsString('Naqd', $paper);
        $this->assertStringContainsString('Yaxlitlash', $paper);
        $this->assertStringContainsString('Qaytim', $paper);
        $this->assertStringContainsString('Aziz Karimov', $paper);
    }

    // ============ Not printing the same thing twice ============

    public function test_re_firing_an_unchanged_bill_does_not_put_a_second_docket_on_the_rail(): void
    {
        // A cook holding two dockets for one table has to reconcile them by
        // hand, mid-service, and will get it wrong.
        $this->printer('pass', 'kitchen', ['is_default' => true]);
        KitchenStation::factory()->create(['code' => 'grill', 'name' => 'Mangal']);

        $bill = $this->fireBill('grill');
        $this->bills()->send($bill->id);

        $this->assertSame(1, PrintJob::query()->where('kind', 'docket')->count());
    }

    public function test_re_firing_an_edited_bill_prints_the_change(): void
    {
        $this->printer('pass', 'kitchen', ['is_default' => true]);
        KitchenStation::factory()->create(['code' => 'grill', 'name' => 'Mangal']);

        $bill = $this->fireBill('grill');
        $this->bills()->addLine($bill->id, $this->dish('grill')->id, 1);
        $this->bills()->send($bill->id);

        $this->assertSame(2, PrintJob::query()->where('kind', 'docket')->count());
    }

    public function test_an_explicit_reprint_is_never_swallowed_as_a_duplicate(): void
    {
        $printer = $this->printer('pass', 'kitchen', ['is_default' => true]);
        KitchenStation::factory()->create(['code' => 'grill', 'name' => 'Mangal']);

        $ticket = $this->fireBillAndTicket('grill');

        $this->postJson("/api/v1/kitchen/tickets/{$ticket->id}/print")->assertStatus(202);

        $this->assertSame(2, PrintJob::query()->where('kind', 'docket')->count());

        $reprint = PrintJob::query()->where('kind', 'docket')->latest('id')->firstOrFail();

        // Marked, because a cook who plates a reprint a second time has thrown
        // a dish away and the guest is still waiting.
        $this->assertStringContainsString('QAYTA CHOP ETILDI', $this->paperFor($reprint, $printer));
    }

    public function test_a_retried_settlement_does_not_put_two_receipts_on_the_counter(): void
    {
        $this->printer('kassa', 'receipt', ['is_default' => true]);

        $bill = $this->openBillWorth(4_500_000);
        $plan = TenderPlan::of($bill->total, [['method' => 'cash', 'amount' => 4_500_000]], 100_000);

        $first = app(PrintSpooler::class)->receipt($bill, $plan, [], null, 'settle-abc');
        $second = app(PrintSpooler::class)->receipt($bill, $plan, [], null, 'settle-abc');

        $this->assertTrue($first->queued);
        $this->assertFalse($second->queued);
        $this->assertSame('already_queued', $second->reason);
        $this->assertSame(1, PrintJob::query()->where('kind', 'receipt')->count());
    }

    public function test_two_drawer_opens_in_a_row_are_two_drawer_opens(): void
    {
        // Hashing the document would silently refuse the second, and the drawer
        // would not open for the next guest.
        $this->printer('kassa', 'receipt', ['is_default' => true, 'opens_drawer' => true]);

        app(PrintSpooler::class)->openDrawer();
        app(PrintSpooler::class)->openDrawer();

        $this->assertSame(2, PrintJob::query()->where('kind', 'drawer')->count());
    }

    public function test_the_drawer_job_carries_the_pulse_and_no_paper(): void
    {
        $printer = $this->printer('kassa', 'receipt', ['is_default' => true, 'opens_drawer' => true]);

        $this->assertTrue(app(PrintSpooler::class)->openDrawer()->queued);

        $job = PrintJob::query()->where('kind', 'drawer')->firstOrFail();
        $bytes = (new EscPos)->render(Document::fromArray($job->document), $printer->codepage);

        $this->assertStringContainsString("\x1bp\x00\x19\xfa", $bytes);
        // No cut: paper that came out for a drawer kick is paper thrown away on
        // every cash sale in the building.
        $this->assertStringNotContainsString("\x1dV\x01", $bytes);
    }

    public function test_the_drawer_needs_a_printer_that_has_one_under_it(): void
    {
        // A cash drawer is a solenoid on pin 2 of a receipt printer, and a till
        // whose receipt printer is not the one with the drawer is a real
        // configuration.
        $this->printer('kassa', 'receipt', ['is_default' => true, 'opens_drawer' => false]);

        $outcome = app(PrintSpooler::class)->openDrawer();

        $this->assertFalse($outcome->queued);
        $this->assertSame('no_route', $outcome->reason);
    }

    // ============ The agent, and the printer dying ============

    public function test_a_docket_fired_at_a_dead_printer_survives_and_prints_when_it_comes_back(): void
    {
        /*
         * The whole reason P8 exists.
         *
         * Printing straight to the device from the request that fired the bill
         * has one failure mode and it is the bad one: the printer is out of
         * paper, the socket times out, and the docket is gone. Not delayed —
         * gone, with the bill reading `placed` and a kitchen that never heard
         * about the table.
         */
        $printer = $this->printer('pass', 'kitchen', ['is_default' => true]);
        KitchenStation::factory()->create(['code' => 'grill', 'name' => 'Mangal']);

        $this->fireBill('grill');
        $job = PrintJob::query()->firstOrFail();

        $queue = app(PrintQueue::class);

        // The agent takes it and the printer refuses, four times over.
        for ($attempt = 1; $attempt <= 4; $attempt++) {
            $claimed = $queue->claim($this->chilonzor->id, 'agent-1');
            $this->assertCount(1, $claimed, "Attempt {$attempt} found nothing to claim.");

            $queue->reject($claimed->first(), "Qog'oz tugadi");

            // Back in the queue with a later due time, not thrown away.
            $this->travelTo(now()->addMinutes(10));
        }

        $this->assertSame('queued', $job->refresh()->status);
        $this->assertSame(4, $job->attempts);
        $this->assertSame('error', $printer->refresh()->state);

        // Somebody changes the roll.
        $claimed = $queue->claim($this->chilonzor->id, 'agent-1');
        $queue->acknowledge($claimed->first());

        $this->assertSame('printed', $job->refresh()->status);
        $this->assertNull($printer->refresh()->failing_since);
        $this->assertSame('ready', $printer->refresh()->state);
    }

    public function test_a_job_that_will_never_print_is_given_up_on_and_still_kept(): void
    {
        // It gives up because a document refused eight times is not going to
        // print. It keeps the row because "what did not print tonight" is the
        // first question after a bad service.
        $printer = $this->printer('pass', 'kitchen', ['is_default' => true]);
        $job = PrintJob::factory()->for($printer)->create([
            'branch_id' => $this->chilonzor->id,
            'attempts' => PrintJob::maxAttempts() - 1,
        ]);

        app(PrintQueue::class)->reject($job, 'Printer javob bermadi');

        $this->assertSame('failed', $job->refresh()->status);
        $this->assertDatabaseHas('kitchen.print_jobs', ['id' => $job->id, 'status' => 'failed']);

        // Only a human gets it out of there.
        $job->requeue();
        $this->assertSame('queued', $job->refresh()->status);
        $this->assertSame(0, $job->attempts);
    }

    public function test_a_second_agent_does_not_get_a_job_the_first_is_holding(): void
    {
        $printer = $this->printer('pass', 'kitchen', ['is_default' => true]);
        PrintJob::factory()->for($printer)->create(['branch_id' => $this->chilonzor->id]);

        $first = app(PrintQueue::class)->claim($this->chilonzor->id, 'agent-1');
        $second = app(PrintQueue::class)->claim($this->chilonzor->id, 'agent-2');

        $this->assertCount(1, $first);
        $this->assertCount(0, $second);
    }

    public function test_a_job_held_by_an_agent_that_died_goes_back_to_the_queue(): void
    {
        // Without the claim expiry the job sits in `claimed` forever and the
        // docket never prints — the same outcome as having no spool at all,
        // just slower to notice.
        $printer = $this->printer('pass', 'kitchen', ['is_default' => true]);
        PrintJob::factory()->for($printer)->abandoned()->create(['branch_id' => $this->chilonzor->id]);

        $claimed = app(PrintQueue::class)->claim($this->chilonzor->id, 'agent-2');

        $this->assertCount(1, $claimed);
        $this->assertSame('agent-2', $claimed->first()->claimed_by);
    }

    public function test_a_job_waiting_out_its_backoff_is_not_handed_out_early(): void
    {
        $printer = $this->printer('pass', 'kitchen', ['is_default' => true]);
        PrintJob::factory()->for($printer)->backedOff()->create(['branch_id' => $this->chilonzor->id]);

        $this->assertCount(0, app(PrintQueue::class)->claim($this->chilonzor->id, 'agent-1'));

        $this->travelTo(now()->addMinutes(6));

        $this->assertCount(1, app(PrintQueue::class)->claim($this->chilonzor->id, 'agent-1'));
    }

    public function test_the_oldest_docket_is_handed_out_first(): void
    {
        // A pass that printed the newest docket first would cook the table that
        // just sat down before the one that has been waiting.
        $printer = $this->printer('pass', 'kitchen', ['is_default' => true]);
        $old = PrintJob::factory()->for($printer)->create([
            'branch_id' => $this->chilonzor->id, 'available_at' => now()->subMinutes(5),
        ]);
        PrintJob::factory()->for($printer)->create(['branch_id' => $this->chilonzor->id]);

        $claimed = app(PrintQueue::class)->claim($this->chilonzor->id, 'agent-1', 1);

        $this->assertSame($old->id, $claimed->first()->id);
    }

    // ============ The status strip ============

    public function test_the_status_strip_tells_a_waiter_the_printer_is_dead(): void
    {
        /*
         * The plan's acceptance test, in one method: the waiter learns it from
         * here and not from a cook walking out of the kitchen twenty minutes
         * into a service.
         */
        $this->printer('pass', 'kitchen', ['is_default' => true], failing: true);

        $waiter = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $waiter->assignRole('waiter');

        $response = $this->actingAs($waiter)
            ->getJson('/api/v1/kitchen/printers/health?branch_id='.$this->chilonzor->id)
            ->assertOk();

        $response->assertJsonPath('state', 'down')
            ->assertJsonPath('printers.0.state', 'error')
            ->assertJsonPath('printers.0.last_error', "Qog'oz tugadi");
    }

    public function test_the_strip_separates_nothing_installed_from_everything_broken(): void
    {
        $this->getJson('/api/v1/kitchen/printers/health')->assertOk()->assertJsonPath('state', 'none');

        $this->printer('pass', 'kitchen', ['is_default' => true], online: true);

        $this->getJson('/api/v1/kitchen/printers/health')->assertOk()->assertJsonPath('state', 'ok');
    }

    public function test_one_printer_down_out_of_two_is_degraded_and_not_a_stoppage(): void
    {
        $this->printer('pass', 'kitchen', ['is_default' => true], online: true);
        $this->printer('bar', 'kitchen', [], failing: true);

        $this->getJson('/api/v1/kitchen/printers/health')->assertOk()->assertJsonPath('state', 'degraded');
    }

    public function test_a_printer_that_has_not_been_heard_from_is_offline(): void
    {
        // A heartbeat, not a ping: the application never opens a socket to a
        // printer, so "alive" can only mean "the agent checked in".
        $printer = $this->printer('pass', 'kitchen', ['is_default' => true], online: true);

        $this->assertSame('ready', $printer->refresh()->state);

        $this->travelTo(now()->addSeconds(Printer::heartbeatSeconds() + 5));

        $this->assertSame('offline', $printer->refresh()->state);
    }

    public function test_a_heartbeat_does_not_clear_a_jam(): void
    {
        // An agent whose printer is jammed keeps checking in perfectly happily.
        // A strip that went green on a heartbeat would clear the warning while
        // the paper was still stuck.
        $printer = $this->printer('pass', 'kitchen', [], failing: true);

        $this->postJson("/api/v1/kitchen/printers/{$printer->id}/heartbeat")->assertOk();

        $this->assertSame('error', $printer->refresh()->state);
        $this->assertNotNull($printer->failing_since);
    }

    // ============ The agent's protocol ============

    public function test_the_agent_is_handed_bytes_and_not_asked_to_render_anything(): void
    {
        $printer = $this->printer('pass', 'kitchen', ['is_default' => true]);
        PrintJob::factory()->for($printer)->create(['branch_id' => $this->chilonzor->id]);

        $response = $this->postJson('/api/v1/kitchen/print-jobs/claim', [
            'branch_id' => $this->chilonzor->id,
            'agent' => 'till-1',
        ])->assertOk();

        $job = $response->json('jobs.0');

        $this->assertSame('pass', $job['printer']['code']);
        $this->assertArrayHasKey('document', $job);
        // Base64, because ESC/POS is control characters in a single-byte
        // codepage and would not survive being a JSON string.
        $this->assertStringStartsWith("\x1b@", base64_decode($job['escpos'], true));
    }

    public function test_the_agent_reports_back_and_the_queue_believes_it(): void
    {
        $printer = $this->printer('pass', 'kitchen', ['is_default' => true]);
        $job = PrintJob::factory()->for($printer)->create(['branch_id' => $this->chilonzor->id]);

        $this->postJson('/api/v1/kitchen/print-jobs/claim', [
            'branch_id' => $this->chilonzor->id, 'agent' => 'till-1',
        ])->assertOk();

        $this->postJson("/api/v1/kitchen/print-jobs/{$job->id}/printed")->assertOk();

        $this->assertSame('printed', $job->refresh()->status);
        $this->assertNotNull($job->printed_at);
    }

    public function test_a_failure_report_needs_a_reason(): void
    {
        $printer = $this->printer('pass', 'kitchen', ['is_default' => true]);
        $job = PrintJob::factory()->for($printer)->create(['branch_id' => $this->chilonzor->id]);

        $this->postJson("/api/v1/kitchen/print-jobs/{$job->id}/failed")->assertStatus(422);
        $this->postJson("/api/v1/kitchen/print-jobs/{$job->id}/failed", ['error' => 'Offline'])->assertOk();

        $this->assertSame('Offline', $job->refresh()->last_error);
    }

    // ============ Who may ask for paper ============

    public function test_a_receipt_is_gated_on_selling_and_not_on_the_kitchen(): void
    {
        /*
         * A receipt is a money document, and this endpoint lives under
         * /api/v1/kitchen only because that is where the printers are. A cook
         * holds `kitchen.view` and `kitchen.update` — every right the dockets on
         * this same prefix need — and must not be able to produce a receipt.
         *
         * `pos.sell` is the line. Note that it does *not* mean "cashier and
         * above": waiters hold it too, because a waiter who takes payment at the
         * table is who prints the slip. The control on duplicates is that a
         * reprint is stamped as a copy, not that the till refuses it.
         */
        $this->printer('kassa', 'receipt', ['is_default' => true]);
        $bill = $this->openBillWorth(4_500_000);

        $cook = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $cook->assignRole('cook');

        $this->actingAs($cook)
            ->postJson('/api/v1/kitchen/receipts', ['order_id' => $bill->id])
            ->assertStatus(403);
    }

    public function test_a_cashier_can_reprint_a_receipt_and_it_is_marked_a_copy(): void
    {
        $printer = $this->printer('kassa', 'receipt', ['is_default' => true]);
        $bill = $this->openBillWorth(4_500_000);

        $cashier = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $cashier->assignRole('cashier');

        $this->actingAs($cashier)
            ->postJson('/api/v1/kitchen/receipts', ['order_id' => $bill->id])
            ->assertStatus(202)
            ->assertJsonPath('queued', true);

        $paper = $this->paperFor(PrintJob::query()->where('kind', 'receipt')->firstOrFail(), $printer);

        // Two unmarked identical receipts for one bill is how the same refund
        // gets claimed twice.
        $this->assertStringContainsString('N U S X A', $paper);
    }

    public function test_a_cook_cannot_configure_the_hardware(): void
    {
        $cook = User::factory()->create(['tenant_id' => $this->tenant->id]);
        $cook->assignRole('cook');

        $this->actingAs($cook)->postJson('/api/v1/kitchen/printers', [
            'code' => 'rogue', 'name' => 'Rogue', 'role' => 'kitchen',
        ])->assertStatus(403);
    }

    public function test_one_restaurant_never_sees_anothers_printers(): void
    {
        $this->printer('pass', 'kitchen', ['is_default' => true]);

        $other = Tenant::query()->create([
            'name' => 'Lagmon Uyi', 'slug' => 'lagmon-uyi', 'country_code' => 'UZ',
            'locale' => 'uz', 'timezone' => 'Asia/Tashkent', 'status' => 'active',
        ]);
        $stranger = User::factory()->create(['tenant_id' => $other->id]);
        $stranger->assignRole('chef');

        $this->actingAs($stranger)
            ->getJson('/api/v1/kitchen/printers')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    // ============ Helpers ============

    private function bills(): BillRegistry
    {
        return app(BillRegistry::class);
    }

    private function spooler(): EloquentPrintSpooler
    {
        return app(EloquentPrintSpooler::class);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function printer(
        string $code,
        string $role,
        array $attributes = [],
        bool $online = false,
        bool $failing = false,
    ): Printer {
        $factory = Printer::factory();

        if ($online) {
            $factory = $factory->online();
        }

        if ($failing) {
            $factory = $factory->failing();
        }

        return $factory->create([
            'tenant_id' => $this->tenant->id,
            'branch_id' => $this->chilonzor->id,
            'code' => $code,
            'role' => $role,
            ...$attributes,
        ]);
    }

    private function dish(string $station): MenuItem
    {
        static $n = 0;

        return MenuItem::factory()->create([
            'sku' => 'PQ-'.$station.'-'.(++$n), 'station' => $station, 'price' => 4_500_000,
        ]);
    }

    private function fireBill(
        string $station,
        string $channel = 'dine_in',
        ?string $tableLabel = 'A-7',
    ): Bill {
        $bill = $this->bills()->open($channel, tableLabel: $tableLabel);
        $this->bills()->addLine($bill->id, $this->dish($station)->id, 2);

        return $this->bills()->send($bill->id);
    }

    private function fireBillAndTicket(string $station): KitchenTicket
    {
        $this->fireBill($station);

        return KitchenTicket::query()->firstOrFail();
    }

    private function openBillWorth(int $tiyin): Bill
    {
        $dish = MenuItem::factory()->create(['sku' => 'PQ-R-'.uniqid(), 'station' => 'hot', 'price' => $tiyin]);
        // A named waiter: somebody a guest can attach a complaint or a
        // compliment to, and one of the lines the receipt has to carry.
        $bill = $this->bills()->open('takeaway', waiterUserId: (int) auth()->id());

        return $this->bills()->addLine($bill->id, $dish->id, 1);
    }

    /** What the job would actually look like on the roll. */
    private function paperFor(PrintJob $job, Printer $printer): string
    {
        return (new EscPos)->preview(Document::fromArray($job->document), $printer->columns);
    }
}
