<?php

declare(strict_types=1);

namespace Modules\Orders\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A guest ordering food from their own phone.
 *
 * The staff form's public twin, and — like the booking form next door — much
 * shorter, because most of what an order carries is not a guest's to set.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately absent, and what would happen if it were not
 *
 * **Every price.** Not the unit price, not the line total, not the bill total.
 * The catalogue is asked, per line, inside the transaction. A client that can
 * name its own price is a client that can name zero, and the first person to
 * open the network tab finds out.
 *
 * **`discount_total` and `delivery_fee`.** Same rule, one step up: a discount
 * a request can set is a hundred percent discount, and a delivery fee a request
 * can set is a free delivery. Both are derived — the fee from the branch's own
 * setting, the discount from `App\Contracts\Crm\Promotions` against the code
 * below.
 *
 * **`status`.** Every public order is opened and fired by the server, in that
 * order and in one transaction. A request that arrived `ready` would be a guest
 * telling the kitchen the food is cooked.
 *
 * **`restaurant_table_id` and `waiter_user_id`.** This is delivery and takeaway.
 * A guest sitting at a table orders through the QR endpoint, where the table is
 * proved by a token rather than claimed by an id.
 *
 * ---------------------------------------------------------------------------
 * The vocabulary difference, stated once
 *
 * The guest surfaces say `pickup`; `orders.channel` has always stored
 * `takeaway`. Both are accepted here and both mean the same row — mapping in
 * the controller rather than renaming a live column with a public API field on
 * it. `dine_in` and `aggregator` are refused: neither is something a stranger
 * with a phone can truthfully claim to be.
 */
final class PublicOrderRequest extends FormRequest
{
    /** How many distinct lines one basket may hold. */
    public const MAX_LINES = 40;

    /** Anonymous by design — see the route. Tenancy is what scopes it. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'channel' => ['required', 'string', Rule::in(['delivery', 'pickup', 'takeaway'])],

            /*
             * Which venue is cooking it.
             *
             * Optional, and that is a narrow exception rather than a default.
             * A restaurant with ONE venue has no choice to make, and requiring
             * the id there would mean a guest app has to discover a number
             * before it can order — from an endpoint that does not exist, since
             * `GET /api/v1/branches` needs a session. A single-venue restaurant
             * is most of them.
             *
             * A chain is different and the controller refuses rather than
             * guessing: an order that silently landed at the wrong venue is
             * forty minutes of somebody's evening, and "the first one" is not a
             * choice a guest made. See `branchOrFail()`.
             *
             * Checked against the restaurant in the controller — an `exists:`
             * rule cannot express "and it is this tenant's".
             */
            'branch_id' => ['nullable', 'integer', 'min:1'],

            'items' => ['required', 'array', 'min:1', 'max:'.self::MAX_LINES],
            /*
             * Existence goes through App\Contracts\Menu\MenuCatalog rather than
             * an `exists:` rule, for the same reason the staff endpoint does it:
             * Orders must not name another module's table, and the contract
             * already answers per restaurant.
             */
            'items.*.menu_item_id' => ['required', 'integer', 'min:1'],
            // Ninety-nine of one dish is a catering order somebody should ring
            // about; it is also the ceiling the staff endpoint uses, and two
            // ceilings for one column is one too many.
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:99'],
            'items.*.modifier_choice_ids' => ['sometimes', 'array', 'max:12'],
            'items.*.modifier_choice_ids.*' => ['integer', 'min:1'],
            'items.*.note' => ['nullable', 'string', 'max:200'],

            'customer.name' => ['required', 'string', 'min:2', 'max:120'],
            /*
             * A phone number, loosely — the same decision the booking form made
             * and for the same reason. This platform is written for a country
             * and built for several, and an order refused because a Kazakh
             * number has the wrong prefix is a guest who eats somewhere else.
             * The courier rings it; a person is the validator that matters.
             */
            'customer.phone' => ['required', 'string', 'min:7', 'max:32'],

            /*
             * Where to carry it, when it is being carried.
             *
             * One line plus a landmark rather than a street/house/flat triple:
             * Tashkent addresses are routinely a mahalla and "opposite the
             * pharmacy", and a form demanding a house number gets a dash typed
             * into it.
             */
            'address.line' => ['required_if:channel,delivery', 'nullable', 'string', 'min:4', 'max:255'],
            'address.note' => ['nullable', 'string', 'max:255'],
            'address.lat' => ['nullable', 'numeric', 'between:-90,90'],
            'address.lng' => ['nullable', 'numeric', 'between:-180,180'],

            /*
             * The word, never the money.
             *
             * The cart still checks it as the guest types — `POST
             * /public/promo-codes/check` — but that check is a preview, and a
             * preview a client makes is not a discount a server may apply. The
             * code is re-priced on this request through
             * `App\Contracts\Crm\Promotions`, against the basket the server
             * built, and the figure that comes back is the only one that
             * reaches `discount_total`. See the controller.
             */
            'promo_code' => ['nullable', 'string', 'max:32', 'regex:/^[A-Za-z0-9_-]+$/'],

            'payment_method' => ['required', 'string', Rule::in(['cash', 'card_on_delivery', 'online'])],

            /*
             * Which door it came through. Accepted from the client because only
             * the client knows, and harmless if it lies: it feeds a report, not
             * a decision. `pos` and `aggregator` are not offered — those are
             * written by the server on paths that are not this one.
             */
            'source' => ['nullable', 'string', Rule::in(['web', 'app', 'telegram'])],

            /*
             * A pre-order: the sitting the guest chose instead of "as soon as
             * you can".
             *
             * The checkout has collected this since it was drawn and had
             * nowhere to send it — `placed-order.ts` said so and put the answer
             * in the free-text note, "where the person who rings the guest back
             * actually reads it". There is a column now.
             *
             * Bounded here and checked against the venue's own hours in the
             * controller, which is the only place the branch is known. Seven
             * days rather than the booking form's ninety: a table booked three
             * months out is a diary entry a manager confirms, and a kebab
             * ordered three months out is a mistake.
             */
            'scheduled_for' => ['nullable', 'date', 'after:now', 'before:+7 days'],

            'note' => ['nullable', 'string', 'max:500'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'items.required' => "Savat bo'sh — avval taom tanlang.",
            'items.max' => 'Bitta buyurtmada :max tagacha qator bo\'lishi mumkin.',
            'address.line.required_if' => 'Yetkazib berish uchun manzil kerak.',
            'customer.phone.required' => 'Telefon raqami majburiy — buyurtmani tasdiqlash uchun kerak.',
            'payment_method.in' => "To'lov usuli noto'g'ri.",
            'scheduled_for.after' => "O'tgan vaqtga buyurtma berib bo'lmaydi.",
            'scheduled_for.before' => 'Oldindan buyurtma bir haftadan uzoqqa berilmaydi.',
        ];
    }
}
