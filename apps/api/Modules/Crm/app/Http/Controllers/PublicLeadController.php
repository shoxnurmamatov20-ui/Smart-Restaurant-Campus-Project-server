<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Events\EventBus;
use Illuminate\Http\JsonResponse;
use Modules\Crm\Events\LeadCaptured;
use Modules\Crm\Http\Requests\StoreLeadRequest;
use Modules\Crm\Models\Lead;

/**
 * "Biz bilan bog'laning" — POST public/leads.
 *
 * The third thing this platform lets a stranger write, after a table booking
 * and a review. CLAUDE.md is explicit that this is not a decorative form:
 * "restoran `#contact` orqali keladi, tenant'ni operator ochadi" — a restaurant
 * joins by filling this in and an operator opens the tenant afterwards. Until
 * now the form flashed a thank-you and forgot everything typed into it, which
 * made it a funnel with no top.
 *
 * ---------------------------------------------------------------------------
 * What stops it being a spam cannon
 *
 * The same three belts `PublicReservationController` uses on the same kind of
 * door, and for the same reasons.
 *
 * **Throttled at the route** — five a minute per address, more than a person
 * needs and fewer than a script wants.
 *
 * **Powerless.** It creates a `new` lead. There is no automation behind it, no
 * account, no trial, no email to a customer: a flood costs a list to clear
 * rather than anything real.
 *
 * **One live enquiry per number per day.** Somebody who submits twice because
 * the first tap did not look like it worked gets their own enquiry back rather
 * than a second one, and somebody filling the list has to bring a new number
 * for each row. The window is the calendar day of capture, compared as a `date`
 * column rather than through `whereDate()` — which `ModuleBoundaryTest` refuses
 * by name, because wrapping a column in a function throws away its index on an
 * endpoint anybody may call.
 *
 * ---------------------------------------------------------------------------
 * What comes back, and what does not
 *
 * That it landed. Not the lead's id in any useful sense, not how many others
 * there are, not whether this restaurant is already a customer. A public
 * endpoint that answered the last one would be a competitor's client list.
 */
final class PublicLeadController extends Controller
{
    public function __invoke(StoreLeadRequest $request, EventBus $bus): JsonResponse
    {
        $phone = $this->normalise((string) $request->string('phone'));
        $today = now()->startOfDay()->toDateString();

        /*
         * The same number, the same day, still live.
         *
         * Returned rather than refused, exactly as a duplicate booking is: the
         * person has not done anything wrong, and an error would send them to
         * submit a third time when the outcome they wanted has already
         * happened.
         */
        $existing = Lead::query()
            ->where('phone', $phone)
            ->where('captured_on', $today)
            ->first();

        if ($existing !== null) {
            return $this->answer($existing, duplicate: true);
        }

        $lead = Lead::create([
            'name' => trim((string) $request->string('name')),
            'phone' => $phone,
            'email' => $request->filled('email') ? mb_strtolower(trim((string) $request->string('email'))) : null,
            'restaurant' => $request->filled('restaurant') ? trim((string) $request->string('restaurant')) : null,
            'city' => $request->filled('city') ? trim((string) $request->string('city')) : null,
            'message' => $request->filled('message') ? trim((string) $request->string('message')) : null,
            // Never from the request — see StoreLeadRequest.
            'source' => 'site',
            'status' => 'new',
            'captured_on' => $today,
        ]);

        /*
         * Published rather than notified. Who hears about a new enquiry — an
         * operator's screen, a Telegram message, an email — is a decision that
         * changes, and none of it belongs in the controller that receives a
         * form. See LeadCaptured.
         */
        $bus->publish(new LeadCaptured($lead));

        return $this->answer($lead, duplicate: false);
    }

    /**
     * Digits and a leading plus, and nothing else.
     *
     * `+998 90 123 45 67`, `998901234567` and `+998-90-123-45-67` are one
     * person ringing one number, and stored as written they are three rows the
     * duplicate check above cannot see. Not `Customer::normalisePhone()`,
     * because that assumes an Uzbek number and a lead may be a chain calling
     * from anywhere.
     */
    private function normalise(string $phone): string
    {
        $digits = preg_replace('/[^0-9+]/', '', $phone) ?? '';

        // A plus is only a plus at the front. `998+90` is a typo, not a country.
        return str_starts_with($digits, '+')
            ? '+'.str_replace('+', '', mb_substr($digits, 1))
            : str_replace('+', '', $digits);
    }

    private function answer(Lead $lead, bool $duplicate): JsonResponse
    {
        return response()->json([
            'data' => [
                'id' => $lead->getKey(),
                'status' => $lead->status,
                /*
                 * Says the enquiry landed rather than that anybody has read it.
                 * The site prints "we will ring you back", and this is what
                 * keeps that promise honest.
                 */
                'received' => true,
                'duplicate' => $duplicate,
            ],
        ], $duplicate ? 200 : 201);
    }
}
