# Events, Queues, and Analytics Architecture

**Status:** implemented (event bus), accepted baseline (analytics)
**Applies to:** Laravel API, AI services, Telegram bots, KPI, Big Data

## Why an event bus at all

Eleven modules today, thirty planned. Without a bus, "the bill was settled" has
to be handled by Orders calling Kitchen, then Analytics, then CRM, then the
Telegram module — and every new module makes that method longer and Orders
harder to change. With one, Orders states what happened and stops caring.

## The transactional outbox

Implemented in `app/Support/Events/`, table `domain_events`.

```
Orders:   $bus->publish(new OrderPaid($order));   // row written in the same transaction
Kitchen:  Event::listen('orders.paid', OpenTicket::class);
```

1. `EventBus::publish()` writes an outbox row **inside whatever transaction is
   open**. A rolled-back sale takes its event with it, and a process that dies
   after commit cannot lose the notification.
2. Delivery is attempted as soon as the transaction commits — never inside it,
   or a subscriber would query rows that do not exist yet.
3. `php artisan events:relay` (scheduled every minute) sweeps up anything that
   failed or that a crash left behind.

Delivery is **at-least-once**. Marking an event delivered before running the
subscriber would be at-most-once, and would lose side effects whenever a process
died mid-handler. Subscribers make themselves idempotent through
`ProcessedEvents::once()`, backed by a unique index on
`(event_id, listener)`.

Failures back off (10s, 1m, 5m, 15m, 1h) and are abandoned after five attempts.
An abandoned event is never deleted — it is a side effect that silently did not
happen, and `GET /api/health` reports the node as `degraded` while any exist.

### Subscribing without coupling

A subscriber listens by **name** and receives `App\Support\Events\ReceivedEvent`,
a core type. It never imports the publishing module's event class — otherwise
the decoupling the outbox buys would be handed straight back.

```php
// Modules/Crm/app/Providers/EventServiceProvider.php
private const DOMAIN_EVENTS = [
    'orders.paid' => [RecordGuestVisit::class],
];
```

## Standard event envelope

```json
{
  "event_id": "uuid",
  "event_name": "orders.paid",
  "schema_version": 1,
  "tenant_id": 1,
  "actor_id": 10,
  "module": "Orders",
  "occurred_at": "2026-08-11T20:14:00+05:00",
  "payload": {
    "order_id": 1042,
    "number": "A-1042",
    "channel": "dine_in",
    "customer_id": 77,
    "total": 18400000,
    "currency": "UZS"
  }
}
```

Payloads carry **ids and values, never models**. A subscriber that received an
`Order` would be coupled to Orders' schema.

## Naming

Dotted, lowercase, past tense: `module.thing_happened`. The string is the wire
contract — renaming a class is safe, renaming this breaks every subscriber.
Enforced by `tests/Architecture/ModuleBoundaryTest`.

| Event                                     | Published when                |
| ----------------------------------------- | ----------------------------- |
| `orders.paid`                             | a bill is settled             |
| `orders.confirmed` _(planned)_            | a bill is sent to the kitchen |
| `kitchen.ticket_ready` _(planned)_        | a station finishes a dish     |
| `suppliers.delivery_received` _(planned)_ | a purchase order is received  |

## Money and quantities

Money is **integer tiyin** (1 UZS = 100 tiyin) everywhere, including payloads.
Stock is integer grams, millilitres or pieces. Never a float — a rounding error
in a payload becomes a rounding error in a Z-report.

## Queue classes

| Queue           | Purpose                             |
| --------------- | ----------------------------------- |
| `default`       | short business jobs                 |
| `notifications` | Telegram, email, SMS, push          |
| `analytics`     | ClickHouse/KPI projections          |
| `media`         | image/video processing              |
| `ai`            | AI calls and long-running inference |
| `imports`       | CSV/Excel/aggregator imports        |

## Reliability rules

- Every external call must be queued unless it must block the request.
- Subscribers must be idempotent — use `ProcessedEvents::once()`.
- Failed jobs must preserve `tenant_id`, `module`, and correlation ID.
- The relay restores the event's tenant context before calling a subscriber; a
  subscriber running from cron would otherwise see nothing, or see everyone.
- Exactly one scheduler replica. Two would deliver every event twice.

## Scheduled work

`routes/console.php`. Production runs `php artisan schedule:work` in its own
deployment (`infrastructure/kubernetes/base/api.yaml`).

| Command                 | Cadence | Why                                |
| ----------------------- | ------- | ---------------------------------- |
| `events:relay`          | minute  | outbox safety net                  |
| `activitylog:clean`     | daily   | audit retention (two years)        |
| `sanctum:prune-expired` | daily   | a token nobody revoked is a way in |

## Future Kafka migration

The outbox already exists, so the move is one worker away:

1. The business row and the outbox row are already written in one transaction.
2. Replace the relay's `Event::dispatch` with a producer publishing to Kafka.
3. Consumers update ClickHouse, notifications, search, and read models.

The public envelope stays the same, so no module needs a rewrite.
