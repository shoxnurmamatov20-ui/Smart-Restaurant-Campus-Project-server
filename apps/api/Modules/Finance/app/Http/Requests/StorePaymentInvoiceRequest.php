<?php

declare(strict_types=1);

namespace Modules\Finance\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A guest asking for somewhere to pay.
 *
 * Note what is NOT here: the amount. API.md §19 — never accept a computed value
 * from a client — and this is the sharpest case of it on the platform. A payload
 * that could name its own figure is a guest who pays 1 000 so'm for a 400 000
 * so'm dinner, and the provider would confirm it happily because from a bank's
 * side that is a perfectly valid payment. The amount comes off the bill.
 *
 * Both `order_id` and `order_number` are required, and the pair is the point.
 * The id alone is a counter a stranger can walk — and the response carries the
 * total, so walking it would read every table's bill in the restaurant. The
 * number is printed on the guest's own receipt and known to nobody else, so
 * requiring both turns an enumerable endpoint into one that answers only to
 * somebody holding the paper.
 */
final class StorePaymentInvoiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        // A stranger on the restaurant's own site. There is no permission a guest
        // could hold; what scopes this is the tenant, the order/number pair and
        // the throttle on the route.
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'order_id' => ['required', 'integer', 'min:1'],
            'order_number' => ['required', 'string', 'max:24'],
            'provider' => ['required', 'string', 'max:16'],
            /*
             * Where the provider sends the browser back.
             *
             * `url` rather than `string`, and http/https only: this value is put
             * into a redirect the guest's phone follows, so a `javascript:` or a
             * `data:` scheme here would be a stored redirect the restaurant's own
             * checkout hands out. The host is not restricted — a venue may run its
             * ordering on its own domain — but the scheme is.
             */
            'return_url' => ['nullable', 'url:http,https', 'max:500'],
        ];
    }
}
