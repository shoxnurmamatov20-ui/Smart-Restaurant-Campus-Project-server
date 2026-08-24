<?php

declare(strict_types=1);

namespace Modules\Orders\Http\Requests;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Orders\Models\Order;

final class StoreOrderRequest extends FormRequest
{
    /**
     * Route middleware (`permission:orders.create`) enforces authorisation.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $tenantId = app(TenantContext::class)->id();

        return [
            'number' => ['nullable', 'string', 'max:24', Rule::unique('orders', 'number')->where(fn (Builder $query) => $query->where('tenant_id', $tenantId))],
            'channel' => ['nullable', Rule::in(Order::CHANNELS)],
            'status' => ['nullable', Rule::in(Order::STATUSES)],
            'restaurant_table_id' => ['nullable', 'integer', 'min:1'],
            'table_label' => ['nullable', 'string', 'max:32'],
            'waiter_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'customer_id' => ['nullable', 'integer', 'min:1'],
            'guests_count' => ['nullable', 'integer', 'min:1', 'max:200'],
            'discount_total' => ['nullable', 'integer', 'min:0'],
            'service_charge' => ['nullable', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:2000'],

            /*
             * The intake desk's three fields.
             *
             * `operator_user_id` is accepted rather than taken from the token
             * because the console's intake screen is also where a supervisor
             * enters an order somebody else took over a radio — and refusing
             * that would mean the league table credits the supervisor. It is a
             * platform user id like `waiter_user_id` beside it and is checked
             * the same way.
             *
             * `scheduled_for` is what the guest ASKED for, so it may be in the
             * past by minutes when an operator types up a call that came in
             * while they were on another line. `after:-1 hour` is the honest
             * floor: late enough to be typed up, early enough that a typo of the
             * date is refused rather than becoming a pre-order for last March.
             */
            'intake_channel' => ['nullable', Rule::in(Order::INTAKE_CHANNELS)],
            'operator_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'scheduled_for' => ['nullable', 'date', 'after:-1 hour', 'before:+30 days'],

            /*
             * Which software posted it. `pos` for an order typed at the intake
             * desk, which is what this endpoint is: a different axis from
             * `intake_channel` above, which says which CONVERSATION it was.
             * See the resource for why one cannot be derived from the other.
             */
            'source' => ['nullable', Rule::in(['web', 'app', 'telegram', 'qr', 'pos', 'aggregator'])],

            /*
             * Who is on the other end, and where it is going.
             *
             * Every one of these is fillable on the model, collected by the
             * intake screen's compose flow, and validated by nothing until now —
             * so `validated()` dropped the lot and the order reached the kitchen
             * with no address on it and no way to ring the guest back. A
             * delivery with no address is not a degraded order; it is not an
             * order.
             *
             * A SNAPSHOT rather than a link into CRM, for the reason the
             * resource gives: a guest who changes their number next month must
             * not rewrite the address a courier was sent to last night.
             *
             * The phone is checked loosely, exactly as `PublicOrderRequest`
             * checks it and for the same reason — this platform is written for
             * a country and built for several, and an order refused because a
             * Kazakh number has the wrong prefix is a guest who eats elsewhere.
             */
            'customer_name' => ['nullable', 'string', 'max:120'],
            'customer_phone' => ['nullable', 'string', 'min:7', 'max:32'],
            'delivery_address' => ['nullable', 'string', 'max:255'],
            'delivery_note' => ['nullable', 'string', 'max:255'],
            'payment_method' => ['nullable', Rule::in(['cash', 'card_on_delivery', 'online'])],

            /*
             * The fee, and the one place this differs from the public twin.
             *
             * `PublicOrderRequest` refuses it outright — *"a delivery fee a
             * request can set is a free delivery"* — because the sender is a
             * stranger with a phone. Here the sender holds `orders.create`,
             * every write is audited against their name, and they are already
             * trusted with discounts and voids. What an operator needs is the
             * ability to quote what they just told somebody on the telephone.
             *
             * Bounded anyway. A hundred thousand so'm of delivery is a typo,
             * not a decision, and a bound is cheaper than an argument later.
             */
            'delivery_fee' => ['nullable', 'integer', 'min:0', 'max:10000000'],

            /*
             * The basket, in the same request as the order.
             *
             * The intake screen has a cart before it has an order — an operator
             * builds it while the guest is still on the telephone — and the
             * alternative shape is one POST plus a POST per line, each of which
             * can fail on its own. A call that dropped between line two and
             * line three would leave a half-order on a pass.
             *
             * Prices are NOT accepted, here or anywhere: every line is priced
             * from the catalogue inside the transaction. See the controller.
             */
            'items' => ['sometimes', 'array', 'max:40'],
            'items.*.menu_item_id' => ['required', 'integer', 'min:1'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:99'],
            'items.*.note' => ['nullable', 'string', 'max:500'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'guests_count.min' => "Mehmonlar soni kamida 1 bo'lishi kerak.",
            'customer_phone.min' => 'Telefon raqami juda qisqa.',
            'items.max' => "Bitta buyurtmada :max tagacha qator bo'lishi mumkin.",
        ];
    }
}
