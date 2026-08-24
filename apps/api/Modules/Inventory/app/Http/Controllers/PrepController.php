<?php

declare(strict_types=1);

namespace Modules\Inventory\Http\Controllers;

use App\Contracts\Suppliers\Receiving;
use App\Http\Controllers\Controller;
use App\Support\Errors\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\ResourceCollection;
use Illuminate\Support\Facades\DB;
use Modules\Inventory\Http\Requests\StorePrepBatchRequest;
use Modules\Inventory\Http\Requests\StorePrepItemRequest;
use Modules\Inventory\Http\Resources\PrepItemResource;
use Modules\Inventory\Models\PrepComponent;
use Modules\Inventory\Models\PrepItem;

/**
 * The half-made goods: what a kitchen produces before service and consumes
 * during it, and the delivery door that fills the shelf they come off.
 *
 * Two things that read as unrelated live here because a storekeeper does both
 * from the same screen and neither owns a controller of its own. Accepting a
 * delivery is Suppliers' verb — reached through `App\Contracts\Suppliers\
 * Receiving`, which is a core contract rather than an import, so no module
 * boundary moves.
 */
final class PrepController extends Controller
{
    /**
     * Every prep card, costed.
     *
     * `components.ingredient` is eager loaded because the cost accessors walk
     * it: without the load, a page of eight cards is thirty-two queries, and
     * `batch_cost` on an unloaded relation answers zero rather than slowly —
     * which is the failure that puts a food cost of nought on a screen.
     */
    public function index(Request $request): ResourceCollection
    {
        $query = PrepItem::query()
            ->with('components.ingredient')
            ->when(
                ! $request->boolean('include_inactive'),
                fn ($inner) => $inner->active(),
            )
            ->orderBy('code');

        return PrepItemResource::collection($query->get());
    }

    /**
     * A new card: what the kitchen makes, out of what, and how much survives.
     *
     * The act `POST prep` is not. That one is production — a card and a number
     * of batches — and the route said so in as many words while the console's
     * "new prep item" button flashed a hint and opened nothing.
     *
     * One transaction, card and components together. A card written without its
     * components is a card `produce()` refuses with `stock.prep_card_empty`:
     * a row whose only possible future is an error message, created by a form
     * that reported success.
     *
     * `on_hand` starts at zero and is not settable. Stock arrives by being
     * received or by being produced, both of which write a movement; a starting
     * balance typed into a form is stock the ledger has never heard of, and the
     * first stock-take is where it surfaces as an unexplained gain.
     */
    public function storeItem(StorePrepItemRequest $request): JsonResponse
    {
        $data = $request->validated();

        $item = DB::transaction(function () use ($data): PrepItem {
            $item = PrepItem::query()->create([
                'code' => $data['code'],
                'name' => $data['name'],
                'unit' => $data['unit'],
                'batch_quantity' => $data['batch_quantity'],
                'loss_percent' => $data['loss_percent'] ?? 0,
                'shelf_life_days' => $data['shelf_life_days'] ?? 1,
                'on_hand' => 0,
                'is_active' => true,
            ]);

            /*
             * Summed rather than inserted line by line.
             *
             * `prep_components` is unique on (card, ingredient) — listing beef
             * twice is two lines a cook has to add up — and a form that sent it
             * twice would otherwise get a constraint violation as a 500. Adding
             * the two quantities is what the person filling the form meant.
             */
            $quantities = [];

            foreach ($data['components'] as $line) {
                $id = (int) $line['ingredient_id'];
                $quantities[$id] = ($quantities[$id] ?? 0) + (int) $line['quantity'];
            }

            foreach ($quantities as $ingredientId => $quantity) {
                PrepComponent::query()->create([
                    'prep_item_id' => $item->id,
                    'ingredient_id' => $ingredientId,
                    'quantity' => $quantity,
                ]);
            }

            return $item;
        });

        return response()->json(
            ['data' => new PrepItemResource($item->load('components.ingredient'))],
            201,
        );
    }

    /**
     * The kitchen made some. Take the ingredients off the shelf and put the
     * result on it.
     *
     * One transaction, and it has to be: a batch that took the beef and did not
     * raise the zirvak is a loss the storekeeper would find at the stock-take
     * and never be able to explain.
     *
     * The ingredient legs are `consumption`, not `write_off`. A write-off is
     * something that was lost; this beef became dinner, and putting it in the
     * loss report would tell an owner the kitchen was throwing away four
     * hundred grams every morning.
     *
     * Deliberately no stock check. `Ingredient::move()` will take a shelf
     * negative here, unlike the direct movement route which refuses — and that
     * is the honest answer: the beef IS in the pot. Refusing would leave the
     * ledger claiming stock that is physically gone, which is the state a count
     * cannot reconcile. A negative balance is visible, actionable and true.
     */
    public function produce(StorePrepBatchRequest $request): JsonResponse
    {
        $data = $request->validated();

        /** @var PrepItem|null $item */
        $item = PrepItem::query()->with('components.ingredient')->find($data['prep_item_id']);

        if ($item === null) {
            throw ApiException::of('request.not_found');
        }

        if ($item->components->isEmpty()) {
            throw ApiException::of('stock.prep_card_empty', field: 'prep_item_id');
        }

        $batches = (int) $data['batches'];
        $reference = $data['reference'] ?? 'PREP-'.$item->code;

        $made = DB::transaction(function () use ($item, $batches, $reference): int {
            foreach ($item->components as $line) {
                $line->ingredient?->move(
                    'consumption',
                    -($line->quantity * $batches),
                    null,
                    $reference,
                );
            }

            // The yield, not the batch size. Eight litres of stock reduced to
            // six and a half is six and a half litres of usable broth, and
            // raising the balance by eight would put two litres that do not
            // exist into every dish costed against it.
            $made = $item->usable_yield * $batches;

            $item->forceFill(['on_hand' => $item->on_hand + $made])->save();

            return $made;
        });

        return response()->json([
            'data' => [
                'produced' => $made,
                'batches' => $batches,
                'item' => new PrepItemResource($item->refresh()->load('components.ingredient')),
            ],
        ], 201);
    }

    /**
     * The van came — raise the shelf, close the order, grow the supplier's debt.
     *
     * The storekeeper's door onto a purchase order, and it is a thin one on
     * purpose: everything it does is `Receiving::confirm()`, which is also what
     * the purchasing screen and the phone's offline queue call. Three doors, one
     * implementation, because "receive twice" is the mistake that doubles a
     * delivery on the shelf AND doubles the debt, and it can only be refused
     * once — inside the row lock that contract takes.
     *
     * The stock now lands on a venue's shelf as well as the restaurant's total,
     * because `Ingredient::move()` reads the branch in context. A storekeeper
     * signing for a van at Chilonzor is a request carrying `X-Branch`.
     */
    public function accept(Request $request, Receiving $receiving, int $delivery): JsonResponse
    {
        if (! $receiving->confirm($delivery, $request->user()?->getAuthIdentifier())) {
            // One refusal for three causes — no such order in this restaurant,
            // already received, already cancelled — and that is deliberate. The
            // contract answers a boolean because its other caller is a batch of
            // twelve queued entries; distinguishing them here would mean asking
            // Suppliers a second question this module may not ask.
            throw ApiException::of('purchase_order.already_received');
        }

        return response()->json(['data' => ['id' => $delivery, 'status' => 'received']]);
    }
}
