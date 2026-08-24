<?php

declare(strict_types=1);

namespace Modules\Orders\Listeners;

use App\Contracts\Messaging\SmsSender;
use App\Models\PushToken;
use App\Models\Tenant;
use App\Support\Events\ProcessedEvents;
use App\Support\Events\ReceivedEvent;
use App\Support\Push\ExpoPush;

/**
 * Telling the person who ordered that something happened to their food.
 *
 * The intake screen's oldest hole, in its own words: *"Nothing here notifies
 * them, because the notification depends on where the order came from."* An
 * operator declined an order and the guest found out by ringing back, twenty
 * minutes later, to ask where dinner was.
 *
 * ---------------------------------------------------------------------------
 * Four rungs, and why not the others
 *
 * `accepted`, `ready`, `enroute` and `handed` are the four a guest can act on
 * or is waiting for. `cooking` is the kitchen's business — nobody needs a text
 * saying a pan went on — and `placed` is redundant: they placed it. `voided` is
 * the one deliberate omission on the sad side, and it is deliberate because a
 * decline is a conversation: the operator is on the telephone with the guest
 * while they tap it, and a text arriving mid-sentence saying "your order was
 * cancelled" reads as a second, colder refusal.
 *
 * ---------------------------------------------------------------------------
 * Two channels, and neither is guaranteed
 *
 * A push if the guest has the app and let it notify them; an SMS if there is a
 * number on the bill. Both are attempted — a guest with the app installed still
 * gets the text, because a phone in a pocket with notifications muted is the
 * normal case and a delivery arriving unannounced is the failure this exists to
 * prevent.
 *
 * Neither throws. This runs on the relay behind a queue of other people's
 * events, and a dead SMS gateway must not stop the eleven behind it. The
 * gateway carries its own marker for the account it still needs (see
 * `App\Contracts\Messaging\SmsSender` and its Eskiz driver); with the log
 * driver the whole message is written to the log, which is a real delivery for
 * a deployment that has not been given an account yet.
 *
 * ---------------------------------------------------------------------------
 * Which language
 *
 * The restaurant's. The guest's own locale is in CRM, and Orders may not read
 * CRM — `ModuleBoundaryTest` records no such edge and adding one to look up a
 * language would make the two modules one program. A venue in Termiz texting in
 * Uzbek is right far more often than a platform default would be, and the push
 * carries the same sentence so the two cannot disagree.
 */
final readonly class TellTheGuest
{
    /**
     * What each rung says, in the three languages this platform speaks.
     *
     * Short on purpose: an SMS is billed per 70 characters in Cyrillic and this
     * is a restaurant paying for every one of them. The bill number leads,
     * because it is what a guest reads back down the telephone.
     *
     * @var array<string, array<string, string>>
     */
    private const LINES = [
        'accepted' => [
            'uz' => '%s — buyurtmangiz qabul qilindi, tayyorlanmoqda.',
            'ru' => '%s — заказ принят, готовим.',
            'en' => '%s — your order is accepted and being prepared.',
        ],
        'ready' => [
            'uz' => '%s — buyurtmangiz tayyor.',
            'ru' => '%s — заказ готов.',
            'en' => '%s — your order is ready.',
        ],
        'enroute' => [
            'uz' => "%s — kuryer yo'lga chiqdi.",
            'ru' => '%s — курьер выехал.',
            'en' => '%s — the courier is on the way.',
        ],
        'handed' => [
            'uz' => '%s — buyurtmangiz yetkazildi. Yoqimli ishtaha!',
            'ru' => '%s — заказ доставлен. Приятного аппетита!',
            'en' => '%s — your order has been delivered. Enjoy!',
        ],
    ];

    /** The title on the push. The body is the same sentence the SMS carries. */
    private const TITLE = ['uz' => 'Buyurtma', 'ru' => 'Заказ', 'en' => 'Order'];

    public function __construct(
        private ProcessedEvents $processed,
        private SmsSender $sms,
        private ExpoPush $push,
    ) {}

    public function handle(ReceivedEvent $event): void
    {
        $to = (string) $event->get('to');
        $line = self::LINES[$to] ?? null;

        if ($line === null) {
            return;
        }

        /*
         * Only an order somebody is waiting for AWAY from the building.
         *
         * `intake_channel` is null on every bill that started at a table, and a
         * guest sitting in the room does not want a text saying their food is
         * ready — the waiter is carrying it. This is the column that finally
         * makes that distinction possible; `channel` never could.
         */
        if ($event->get('intake_channel') === null) {
            return;
        }

        // Delivery is at-least-once, and "your order is ready" arriving twice
        // an hour apart is worse than not arriving.
        $this->processed->once($event, self::class, function () use ($event, $line): void {
            $number = (string) $event->get('number');
            $locale = $this->localeOf($event);
            $text = sprintf($line[$locale] ?? $line['uz'], $number);

            $this->text((string) ($event->get('customer_phone') ?? ''), $text);
            $this->notify($event, $text, $locale);
        });
    }

    /**
     * The restaurant's own language, defaulting to Uzbek.
     *
     * Read from the tenant on the event rather than from the request: the relay
     * runs on a worker with no request behind it, which is the same reason
     * `OrderPaid::tenantId()` takes its answer off the order.
     */
    private function localeOf(ReceivedEvent $event): string
    {
        $tenantId = $event->tenantId;

        if ($tenantId === null) {
            return 'uz';
        }

        $locale = Tenant::query()->withoutGlobalScopes()->find($tenantId)?->locale;

        return in_array($locale, ['uz', 'ru', 'en'], true) ? $locale : 'uz';
    }

    /** One text, if there is a number to send it to. */
    private function text(string $phone, string $body): void
    {
        // Seven digits is the floor `PublicOrderRequest` accepts, and a bill
        // rung up at a till carries no number at all.
        if (mb_strlen(trim($phone)) < 7) {
            return;
        }

        $this->sms->send($phone, $body);
    }

    /** And a push, to whichever handsets that guest has registered. */
    private function notify(ReceivedEvent $event, string $body, string $locale): void
    {
        $customerId = $event->get('customer_id');

        // A stranger who ordered by telephone has no CRM row and therefore no
        // registered handset. The text above is the whole of what they get, and
        // it is enough.
        if (! is_int($customerId)) {
            return;
        }

        $tokens = PushToken::reaching(PushToken::OF_CUSTOMER, $customerId)->get();

        if ($tokens->isEmpty()) {
            return;
        }

        $this->push->send(
            $tokens,
            self::TITLE[$locale] ?? self::TITLE['uz'],
            $body,
            // What the tap opens. The same address the customer app's own
            // tracking screen lives at, so a notification lands on the screen
            // that answers the question it just raised.
            ['url' => '/app/track', 'order_id' => $event->get('order_id')],
        );
    }
}
