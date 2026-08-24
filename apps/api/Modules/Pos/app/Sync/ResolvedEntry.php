<?php

declare(strict_types=1);

namespace Modules\Pos\Sync;

/**
 * A queued write after a person has said what to do with it.
 *
 * The shape is deliberately small, because almost every resolution turns out to
 * be the same entry with one thing changed. "Substitute the dish" is the entry
 * with a different `menu_item_id`; "honour the quoted price" is the entry
 * untouched; "open a separate bill" is the entry untouched with the check that
 * refused it not asked again. Modelling those as fifteen bespoke procedures
 * would have hidden how similar they are and left fifteen places to get the
 * idempotency wrong.
 *
 * The three that are not a rewrite are here as explicit fields rather than as
 * side effects a caller has to remember:
 *
 *   `$discarded` — the person decided the entry should never apply. The queue
 *   still has to record that it was dealt with, or it is offered again forever.
 *
 *   `$shift` — a drawer chosen by hand. See {@see ShiftChoice}.
 *
 *   `$mode` — three of them, because one answer is neither an apply nor a
 *   discard. `refund_duplicate` cannot be dispatched at all: the bill is already
 *   settled, and `TenderService::settle()` refuses a settled bill for the very
 *   good reason that settling twice would close it twice. What that answer
 *   needs is the money recorded against the bill and immediately reversed —
 *   two ledger movements, no change to the bill's state.
 *
 * That third mode was found by a test rather than by design. The first shape
 * here was "apply it, then refund what came back", which reads correctly and
 * cannot work: there is nothing to apply.
 */
final readonly class ResolvedEntry
{
    /**
     * @param  array<string, mixed>  $payload  The entry as it should now apply.
     * @param  string  $note  What was decided, in one line, for the audit trail.
     */
    private function __construct(
        public Mode $mode,
        public string $action,
        public array $payload,
        public string $note,
        public ?ShiftChoice $shift = null,
    ) {}

    /**
     * Apply it, possibly rewritten.
     *
     * @param  array<string, mixed>  $payload
     */
    public static function apply(
        string $action,
        array $payload,
        string $note,
        ?ShiftChoice $shift = null,
    ): self {
        return new self(Mode::Apply, $action, $payload, $note, $shift);
    }

    /**
     * Take the money and give it straight back.
     *
     * Only `payment_duplicate:refund_duplicate`. Not dispatched, because the
     * bill it belongs to is settled and a settlement cannot be applied to a
     * settled bill; the tenders go to the ledger directly and are reversed in
     * the same request.
     *
     * @param  array<string, mixed>  $payload
     */
    public static function recordAndReverse(string $action, array $payload, string $note): self
    {
        return new self(Mode::RecordAndReverse, $action, $payload, $note);
    }

    /**
     * Do not apply it, and stop asking.
     *
     * @param  array<string, mixed>  $payload
     */
    public static function discard(string $action, array $payload, string $note): self
    {
        return new self(Mode::Discard, $action, $payload, $note);
    }

    /** Whether anything at all is written for this entry. */
    public function discarded(): bool
    {
        return $this->mode === Mode::Discard;
    }
}
