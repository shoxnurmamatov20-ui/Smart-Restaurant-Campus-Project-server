<?php

declare(strict_types=1);

namespace Modules\Crm\Http\Controllers;

use App\Contracts\Tables\FloorBoard;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\Crm\Http\Middleware\RequireCustomerToken;
use Modules\Crm\Http\Requests\PublicFeedbackRequest;
use Modules\Crm\Models\Customer;
use Modules\Crm\Models\Feedback;

/**
 * "Nimadir noto'g'ri bo'ldimi?" — the review a guest leaves, from anywhere.
 *
 * Three screens post here and none of them can be made to sign in first: the QR
 * rating screen at a table (`(guest)/qr/{restaurant}/{table}/rating`), the
 * customer app's problem sheet, and the same sheet in the mobile app. All three
 * had `TODO(api)` against them and all three flashed a thank-you and forgot
 * everything typed into them.
 *
 * ---------------------------------------------------------------------------
 * Signing in is optional and that is the whole design
 *
 * A guest at a table has no account, and a complaint form that asks for one
 * collects fewer complaints — which shows up on a dashboard as a better week.
 * So the token is read if it is offered and ignored if it is not: a signed-in
 * guest's review lands on their record, an anonymous one lands beside it, and
 * both reach the manager's screen.
 *
 * ---------------------------------------------------------------------------
 * Urgent is decided here, never sent
 *
 * `is_urgent` is what a manager's screen sorts on. A client that could set it
 * would be a client that could jump the queue, so it is derived: a one-star, or
 * a comment containing one of the words that mean somebody may be hurt. The
 * word list is short and deliberately blunt — a false positive costs a manager
 * thirty seconds, and a false negative is the allergy complaint in
 * `CrmFeedbackSeeder` sitting unread until Monday.
 */
final class PublicFeedbackController extends Controller
{
    /**
     * Words that mean "somebody has to read this today", in three languages.
     *
     * Matched as substrings on a lower-cased comment, which is crude on
     * purpose: `allergiya`, `allergiyam` and `allergiyaga` are one word to a
     * guest and three to a stemmer nobody has written for Uzbek.
     */
    private const URGENT_WORDS = [
        'allerg', 'zaharlan', 'otravlen', 'poison', 'kasal bo', 'tez yordam',
        'skoraya', 'ambulance', 'shisha', 'steklo', 'glass', 'hasharot',
        'nasekom', 'insect', 'qon', 'krov',
    ];

    /** POST /api/v1/public/feedback */
    public function __invoke(PublicFeedbackRequest $request, FloorBoard $floor): JsonResponse
    {
        $guest = RequireCustomerToken::optional($request);
        $comment = $request->filled('comment') ? trim((string) $request->string('comment')) : null;
        $score = $request->integer('score');
        $tableId = $this->tableFor($request, $floor);

        $feedback = Feedback::create([
            'customer_id' => $guest?->getKey(),
            'table_id' => $tableId,
            'order_number' => $request->filled('order_number')
                ? trim((string) $request->string('order_number'))
                : null,
            'score' => $score,
            'comment' => $comment,
            'aspect' => $request->filled('aspect') ? (string) $request->string('aspect') : null,

            /*
             * Where it came from, decided by what the request carried rather
             * than by what it claimed. A review with a table on it was left at
             * a table; anything else came through a browser. A `source` a
             * client could set would make the console's channel breakdown a
             * chart of what people typed.
             */
            'source' => $tableId === null ? 'web' : 'qr',
            'is_urgent' => $this->isUrgent($score, $comment),

            // A signed-in guest's own details, so a manager ringing back does
            // not have to open a second screen. An anonymous review keeps
            // whatever the form offered, which is usually nothing.
            'guest_name' => $this->nameFor($request, $guest),
            'guest_phone' => $this->phoneFor($request, $guest),

            // Never from the request — see PublicFeedbackRequest.
            'status' => 'new',
        ]);

        /*
         * The id and the flag, and nothing else.
         *
         * Not the comment back, not the restaurant's average, not how many
         * other one-stars there are this week. A public endpoint that echoed
         * the room's ratings back would be a competitor's research tool with a
         * feedback form attached.
         */
        return response()->json([
            'data' => [
                'id' => $feedback->getKey(),
                'score' => $feedback->score,
                /*
                 * So the screen can say "a manager will call you" instead of
                 * "thank you". A guest who has just reported an allergic
                 * reaction and reads "thank you for your feedback" concludes
                 * nobody is coming.
                 */
                'urgent' => $feedback->is_urgent,
            ],
        ], 201);
    }

    private function nameFor(PublicFeedbackRequest $request, ?Customer $guest): ?string
    {
        if ($guest !== null) {
            return $guest->name;
        }

        return $request->filled('guest_name') ? trim((string) $request->string('guest_name')) : null;
    }

    private function phoneFor(PublicFeedbackRequest $request, ?Customer $guest): ?string
    {
        if ($guest !== null) {
            return $guest->phone;
        }

        return $request->filled('guest_phone')
            ? Customer::normalisePhone((string) $request->string('guest_phone'))
            : null;
    }

    /**
     * Which table this was left at, from whichever of the two fields arrived.
     *
     * The token wins when both are present, and that ordering is the security
     * of the thing: a token is proof — 22 characters off a laminated sticker
     * that only somebody sitting there has read — while an id is a claim, and a
     * request carrying both is a request trying to overwrite the proof.
     *
     * Resolved through `App\Contracts\Tables\FloorBoard` because CRM may not
     * import the floor plan. A token that resolves to nothing loses the table
     * and keeps the review: the guest still said the soup was cold, and losing
     * that because a sticker was reprinted would lose the only part worth
     * having.
     */
    private function tableFor(PublicFeedbackRequest $request, FloorBoard $floor): ?int
    {
        if ($request->filled('table_token')) {
            return $floor->tableIdForToken(trim((string) $request->string('table_token')));
        }

        return $request->filled('table_id') ? $request->integer('table_id') : null;
    }

    private function isUrgent(int $score, ?string $comment): bool
    {
        if ($score <= 1) {
            return true;
        }

        if ($comment === null) {
            return false;
        }

        $haystack = mb_strtolower($comment);

        foreach (self::URGENT_WORDS as $word) {
            if (str_contains($haystack, $word)) {
                return true;
            }
        }

        return false;
    }
}
