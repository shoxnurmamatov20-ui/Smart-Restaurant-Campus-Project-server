<?php

declare(strict_types=1);

namespace Modules\Marketplace\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Marketplace\Http\Middleware\RequireConsumerToken;
use Modules\Marketplace\Http\Requests\SaveAddressBookRequest;
use Modules\Marketplace\Http\Requests\UpdateConsumerRequest;
use Modules\Marketplace\Http\Resources\ConsumerResource;
use Modules\Marketplace\Models\ConsumerAddress;

/**
 * A marketplace customer's own account.
 *
 * Every method reads the consumer from the TOKEN — `RequireConsumerToken::of()`
 * — and never from a URL or a body. That is not a style choice here the way it
 * might be elsewhere: `marketplace.consumers` carries no `tenant_id` and
 * therefore no row-level-security policy, so the token is the only thing
 * standing between one customer and the whole platform's address book. One
 * `find($request->id)` in this file would be the entire hole.
 */
final class ConsumerProfileController extends Controller
{
    /** GET /api/v1/mp/me */
    public function show(Request $request): ConsumerResource
    {
        return new ConsumerResource(RequireConsumerToken::of($request)->load('addresses'));
    }

    /**
     * PATCH /api/v1/mp/me — name and language.
     *
     * Nothing else is editable here on purpose. The phone is the identity and
     * changing it is a sign-in, not an edit; the points balance and the
     * subscription are the platform's to write.
     */
    public function update(UpdateConsumerRequest $request): ConsumerResource
    {
        $consumer = RequireConsumerToken::of($request);

        $changes = $request->validated();

        /*
         * The switches are MERGED, never replaced.
         *
         * A client sending `{"promos": false}` means "stop sending me offers"
         * and nothing at all about the other three. Assigning the jsonb column
         * whole would drop the keys it did not mention back to their defaults —
         * so a guest who had turned order notices off would find them back on
         * the next time they touched anything else on the screen.
         */
        if (array_key_exists('notification_prefs', $changes) && is_array($changes['notification_prefs'])) {
            $changes['notification_prefs'] = [
                ...$consumer->notificationPrefs(),
                ...$changes['notification_prefs'],
            ];
        }

        $consumer->fill($changes)->save();

        return new ConsumerResource($consumer->load('addresses'));
    }

    /**
     * PUT /api/v1/mp/me/addresses — the whole address book, as it should be.
     *
     * One endpoint that replaces the list rather than four that add, edit,
     * reorder and delete, and the reason is idempotency rather than tidiness.
     * A marketplace consumer has no tenant, `idempotency_keys` sits behind
     * row-level security, and a claim with a null tenant on a fail-closed
     * connection is refused by the policy — so `EnsureIdempotency` cannot run
     * on these routes at all. See `IdempotencyCoverageTest`.
     *
     * A PUT of the whole list needs no key: sending it twice leaves the same
     * three addresses. A POST would leave six, and a guest on a flaky phone
     * pressing "save" again is exactly the case the header exists for.
     *
     * It is also how the screen behaves. The profile sheet is a list a person
     * edits and then saves, not four separate conversations with a server.
     */
    public function saveAddresses(SaveAddressBookRequest $request): ConsumerResource
    {
        $consumer = RequireConsumerToken::of($request);

        /** @var array<int, array<string, mixed>> $rows */
        $rows = $request->validated('addresses');

        DB::transaction(function () use ($consumer, $rows): void {
            /*
             * Replaced wholesale rather than diffed. An address is four short
             * strings and a person has three of them; matching them up by id to
             * save two DELETEs would be a merge algorithm nobody can test,
             * guarding a table that never has more than a handful of rows.
             *
             * Orders keep their own copy of the address they were delivered to
             * — see the migration — so nothing historical is lost by this.
             */
            $consumer->addresses()->delete();

            foreach ($rows as $index => $row) {
                $consumer->addresses()->create([
                    'label' => $row['label'],
                    'address' => $row['address'],
                    'note' => $row['note'] ?? null,
                    'latitude_e6' => isset($row['latitude']) ? (int) round(((float) $row['latitude']) * 1_000_000) : null,
                    'longitude_e6' => isset($row['longitude']) ? (int) round(((float) $row['longitude']) * 1_000_000) : null,
                    // Exactly one default, and it is the first one marked or
                    // the first one sent. Two defaults is a checkout that picks
                    // whichever row the planner returned first.
                    'is_default' => false,
                    'sort_order' => $index,
                ]);
            }

            $default = $consumer->addresses()->orderBy('sort_order')->first();

            if ($default instanceof ConsumerAddress) {
                $chosen = collect($rows)->search(static fn (array $row): bool => (bool) ($row['is_default'] ?? false));

                $target = $chosen === false
                    ? $default
                    : $consumer->addresses()->where('sort_order', $chosen)->first() ?? $default;

                $target->forceFill(['is_default' => true])->save();
            }
        });

        return new ConsumerResource($consumer->load('addresses'));
    }
}
