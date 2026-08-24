<?php

declare(strict_types=1);

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Http\Requests\Platform\IssueInvoiceRequest;
use App\Models\Branch;
use App\Models\PlatformInvoice;
use App\Models\PlatformPlan;
use App\Models\Tenant;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;

/**
 * What the platform is owed, and who says it has been paid.
 *
 * There is no automatic collection and that is a decision, not a gap. Nobody's
 * card is on file; an operator reconciles the bank statement and marks the row.
 * A product that pretended to charge would show "failing" for a restaurant that
 * paid last week, which is worse than a screen that says plainly that a person
 * does this.
 */
final class BillingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $invoices = PlatformInvoice::query()
            ->with('tenant:id,name,slug')
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->string('status')))
            ->orderByDesc('period')
            ->orderBy('number')
            ->limit(500)
            ->get();

        $outstanding = $invoices
            ->whereIn('status', ['due', 'overdue'])
            ->sum('amount_tiyin');

        return response()->json([
            'data' => $invoices->map(static fn (PlatformInvoice $invoice): array => [
                'id' => $invoice->number,
                'invoice_id' => $invoice->id,
                'tenant' => $invoice->tenant?->slug,
                'tenant_name' => $invoice->tenant?->name,
                'amount_tiyin' => (int) $invoice->amount_tiyin,
                'period' => $invoice->period->toDateString(),
                'issued_on' => $invoice->issued_on->toDateString(),
                'due_on' => $invoice->due_on->toDateString(),
                'paid_at' => $invoice->paid_at?->toIso8601String(),
                'status' => $invoice->status,
                'attempts' => (int) $invoice->attempts,
            ])->values()->all(),
            'meta' => [
                'outstanding_tiyin' => (int) $outstanding,
                'collected_tiyin' => (int) $invoices->where('status', 'paid')->sum('amount_tiyin'),
            ],
        ]);
    }

    /**
     * Raise this month's invoice for one restaurant.
     *
     * Plan price × active venues, which is the same arithmetic the overview's
     * MRR uses. The unique index on (tenant_id, period) is the dedupe: a
     * retried "issue this month" gets a 409 rather than billing twice.
     */
    public function store(IssueInvoiceRequest $request, Tenant $tenant): JsonResponse
    {
        $plan = PlatformPlan::query()->where('key', $tenant->plan_key)->first();

        if ($plan === null) {
            throw ApiException::detailed(
                'request.validation_failed',
                'Bu restoranga tarif biriktirilmagan.',
                'Этому ресторану не назначен тариф.',
                'This restaurant is not on a plan.',
                field: 'plan_key',
            );
        }

        $period = $request->filled('period')
            ? Carbon::parse((string) $request->string('period'))->startOfMonth()
            : now()->startOfMonth();

        $branches = max(1, Branch::query()
            ->where('tenant_id', $tenant->id)
            ->where('status', 'active')
            ->count());

        $existing = PlatformInvoice::query()
            ->where('tenant_id', $tenant->id)
            // `where`, never `whereDate`: the column IS a date, and wrapping it
            // in a function would throw away the unique index that makes this
            // lookup the dedupe. `ModuleBoundaryTest` refuses `whereDate` by name.
            ->where('period', $period->toDateString())
            ->first();

        if ($existing !== null) {
            // Not an error the operator caused — it is the answer to "has this
            // month been billed", so it comes back as the row rather than a
            // refusal they have to interpret.
            return response()->json(['data' => $this->row($existing), 'created' => false]);
        }

        $invoice = PlatformInvoice::query()->create([
            'tenant_id' => $tenant->id,
            'number' => $this->nextNumber($period->year),
            'period' => $period,
            'amount_tiyin' => (int) $plan->price_tiyin * $branches,
            'status' => 'due',
            'issued_on' => now()->toDateString(),
            'due_on' => now()->addDays(14)->toDateString(),
            'plan_key' => $plan->key,
            'branches' => $branches,
        ]);

        activity('platform.invoice')
            ->performedOn($invoice)
            ->causedBy($request->user())
            ->log('platform.invoice.issued');

        return response()->json(['data' => $this->row($invoice), 'created' => true], Response::HTTP_CREATED);
    }

    /**
     * The bank statement says it landed.
     *
     * A person, not a webhook. `paid_at` is stamped from the server clock
     * rather than accepted from the request: the date on an invoice is what an
     * accountant will read back in a year, and a client-supplied one is a
     * client-supplied fact about money.
     */
    public function markPaid(Request $request, PlatformInvoice $invoice): JsonResponse
    {
        if ($invoice->status === 'paid') {
            return response()->json(['data' => $this->row($invoice)]);
        }

        $invoice->forceFill(['status' => 'paid', 'paid_at' => now()])->save();

        activity('platform.invoice')
            ->performedOn($invoice)
            ->causedBy($request->user())
            ->withProperties(['number' => $invoice->number])
            ->log('platform.invoice.paid');

        return response()->json(['data' => $this->row($invoice->refresh())]);
    }

    /**
     * Try again, and count the try.
     *
     * The count is the whole point of the button: a first failure is usually a
     * bank, a fourth is a customer who has left. Three failures move the row to
     * `overdue`, which is what the dashboard's "failing" figure counts.
     */
    public function retry(Request $request, PlatformInvoice $invoice): JsonResponse
    {
        $attempts = (int) $invoice->attempts + 1;

        $invoice->forceFill([
            'attempts' => $attempts,
            'status' => $attempts >= 3 ? 'overdue' : $invoice->status,
        ])->save();

        activity('platform.invoice')
            ->performedOn($invoice)
            ->causedBy($request->user())
            ->withProperties(['attempts' => $attempts])
            ->log('platform.invoice.retried');

        return response()->json(['data' => $this->row($invoice->refresh())]);
    }

    /**
     * @return array<string, mixed>
     */
    private function row(PlatformInvoice $invoice): array
    {
        return [
            'id' => $invoice->number,
            'invoice_id' => $invoice->id,
            'tenant' => $invoice->tenant?->slug,
            'amount_tiyin' => (int) $invoice->amount_tiyin,
            'period' => $invoice->period->toDateString(),
            'issued_on' => $invoice->issued_on->toDateString(),
            'due_on' => $invoice->due_on->toDateString(),
            'paid_at' => $invoice->paid_at?->toIso8601String(),
            'status' => $invoice->status,
            'attempts' => (int) $invoice->attempts,
        ];
    }

    /**
     * The next invoice number of the year.
     *
     * Sequential and human — both sides quote it on the telephone — and taken
     * from the highest one already issued rather than from a count, so a
     * deleted row cannot make two invoices share a number.
     */
    private function nextNumber(int $year): string
    {
        $last = PlatformInvoice::query()
            ->where('number', 'like', "INV-{$year}-%")
            ->orderByDesc('number')
            ->value('number');

        $next = $last === null ? 1 : ((int) substr((string) $last, -3)) + 1;

        return sprintf('INV-%d-%03d', $year, $next);
    }
}
