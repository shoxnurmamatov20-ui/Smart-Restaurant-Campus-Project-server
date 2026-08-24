<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Modules\Crm\Http\Middleware\RequireCustomerToken;
use Modules\Crm\Http\Requests\StoreCustomerAddressRequest;
use Modules\Crm\Http\Resources\CustomerAddressResource;
use Modules\Crm\Models\CustomerAddress;

/**
 * A guest's address book — the thing the design left out and delivery needs.
 *
 * `SAVED_ADDRESSES` in the surfaces package carries the note: "`GAPS.md §4.2 Y3`
 * — there is no address book in the design: no add, no edit, no map picker, and
 * the 'add an address' control does nothing but say the picker would be a map."
 * The screens were right to draw the gap rather than invent a screen. The
 * server side of it is not a guess, though: a courier needs somewhere to go,
 * and three of the columns are ones no map picker would ever have supplied.
 *
 * ---------------------------------------------------------------------------
 * How many is too many
 *
 * Ten. Not because anybody needs ten, but because this is a write a stranger
 * with a valid token can repeat, and a cap is the difference between a full
 * address book and a table filled one row per second. A guest at the cap is
 * asked to delete one, which is a sentence a person understands.
 */
final class PublicCustomerAddressController extends Controller
{
    /**
     * Ten per guest.
     *
     * "Home, work, my mother's, the office we cater for" is four; anything past
     * ten is somebody's script, not somebody's life.
     */
    private const MAX_ADDRESSES = 10;

    /** GET /api/v1/public/addresses */
    public function index(Request $request): AnonymousResourceCollection
    {
        $guest = RequireCustomerToken::of($request);

        return CustomerAddressResource::collection($guest->addresses()->get());
    }

    /** POST /api/v1/public/addresses */
    public function store(StoreCustomerAddressRequest $request): JsonResponse
    {
        $guest = RequireCustomerToken::of($request);

        if ($guest->addresses()->count() >= self::MAX_ADDRESSES) {
            throw ApiException::of('crm.address_limit_reached', meta: ['limit' => self::MAX_ADDRESSES]);
        }

        $address = DB::transaction(function () use ($guest, $request): CustomerAddress {
            /*
             * The first address is the default whether or not the app said so.
             *
             * A guest with exactly one address and `is_default = false` is a
             * checkout screen with nothing pre-selected, which reads as a bug
             * to the person looking at it and is one.
             */
            $isFirst = ! $guest->addresses()->exists();
            $wantsDefault = $isFirst || $request->boolean('is_default');

            $address = CustomerAddress::create([
                ...$request->validated(),
                'customer_id' => $guest->getKey(),
                'is_default' => false,
            ]);

            if ($wantsDefault) {
                // Inside the transaction, because the database holds a partial
                // unique index on one default per guest: demoting the old one
                // and promoting this one have to be one write or neither.
                $address->makeDefault();
            }

            return $address;
        });

        return response()->json(
            ['data' => (new CustomerAddressResource($address->refresh()))->resolve($request)],
            201,
        );
    }

    /**
     * DELETE /api/v1/public/addresses/{address}
     *
     * No route-model binding. Binding would resolve the address before this
     * controller could ask whose it is, and while `BelongsToTenant` would stop
     * another restaurant's row, it would happily hand over the address of a
     * different guest at the same restaurant. The lookup goes through the
     * guest's own relation, so an id that is not theirs is simply not found.
     */
    public function destroy(Request $request, int $address): JsonResponse
    {
        $guest = RequireCustomerToken::of($request);

        $record = CustomerAddress::query()
            ->where('customer_id', $guest->getKey())
            ->whereKey($address)
            ->first();

        if ($record === null) {
            throw ApiException::of('crm.address_not_found', field: 'address');
        }

        DB::transaction(function () use ($guest, $record): void {
            $wasDefault = $record->is_default;
            $record->delete();

            /*
             * Somebody has to be the default.
             *
             * Deleting the default otherwise leaves a guest whose checkout
             * screen opens on nothing — and the next address they add would
             * silently become the default, which is a different address from
             * the one they were expecting.
             */
            if ($wasDefault) {
                $next = CustomerAddress::query()
                    ->where('customer_id', $guest->getKey())
                    ->orderByDesc('is_default')
                    ->orderBy('id')
                    ->first();

                $next?->makeDefault();
            }
        });

        return response()->json(['data' => ['deleted' => true]]);
    }
}
