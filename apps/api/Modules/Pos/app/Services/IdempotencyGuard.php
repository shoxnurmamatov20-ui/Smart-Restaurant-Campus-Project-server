<?php

declare(strict_types=1);

namespace Modules\Pos\Services;

use App\Support\Errors\ApiException;
use Closure;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Modules\Pos\Models\PosSyncEntry;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Sync\ConflictException;
use RuntimeException;
use Throwable;

/**
 * "Have I already done this one?"
 *
 * Everything a till writes goes through here, because a till cannot tell the
 * difference between these four things and must survive all of them:
 *
 *   - the network dropped and the request is being replayed from a local queue;
 *   - the request arrived, worked, and the response was lost coming back;
 *   - a cashier tapped Pay twice because the screen did not react;
 *   - two terminals genuinely did two different things.
 *
 * The device stamps every write with a uuid it generated *before* it knew
 * whether it was online. That uuid, scoped to the terminal, is the identity of
 * the operation. The second arrival does not redo the work — it returns what
 * the first arrival returned, byte for byte, so the till reconciles to the same
 * bill instead of creating a twin.
 *
 * The row is claimed before the work runs, not after: claiming afterwards would
 * leave a window in which two concurrent copies both find nothing and both
 * charge the guest.
 */
final class IdempotencyGuard
{
    /**
     * @param Closure(): array<string, mixed> $work
     *
     * @return array{result: array<string, mixed>, replayed: bool}
     */
    public function run(
        Terminal $terminal,
        string $localId,
        int $localSeq,
        string $action,
        array $payload,
        Closure $work,
    ): array {
        $existing = $this->find($terminal, $localId);

        if ($existing !== null) {
            return $this->replay($existing);
        }

        try {
            $entry = PosSyncEntry::create([
                'terminal_id' => $terminal->getKey(),
                'local_id' => $localId,
                'local_seq' => $localSeq,
                'action' => $action,
                'payload' => $payload,
                'status' => 'pending',
                'received_at' => now(),
            ]);
        } catch (UniqueConstraintViolationException) {
            // Two copies of the same write arrived at once and the other one
            // claimed it. Whatever it produces is the answer for both.
            $winner = $this->find($terminal, $localId);

            if ($winner === null) {
                throw new RuntimeException('Idempotentlik yozuvi topilmadi — qayta urinib ko\'ring.');
            }

            return $this->replay($winner);
        }

        try {
            $result = $work();
        } catch (Throwable $failure) {
            // A failed attempt must not block the retry that fixes it, so the
            // claim is released rather than left as a tombstone.
            $entry->delete();

            throw $failure;
        }

        $entry->forceFill([
            'status' => 'accepted',
            'result' => $result,
        ])->save();

        return ['result' => $result, 'replayed' => false];
    }

    /**
     * Replay a batch the till queued while it was offline, in the order the
     * cashier actually did it. An entry that fails does not stop the rest —
     * one unsellable line must not strand a night's takings.
     *
     * Sorted by `local_seq` before anything runs, and that sort is the whole
     * ordering guarantee: a queue drained as it arrived would settle a bill
     * before the lines were on it, or move a table that had not been seated. The
     * device numbers its own operations because it is the only thing that was
     * awake for all of them.
     *
     * Five outcomes, because a till has to do five different things with them:
     *
     *   accepted   — done now.
     *   duplicate  — done before; the stored answer comes back verbatim.
     *   conflict   — the world moved and a person has to choose. The row carries
     *                the kind and its ordered options, exactly as the 409 does.
     *   refused    — a named refusal: no permission, a manager's signature
     *                needed. The code is the actionable part, so it travels.
     *   failed     — anything else, with the sentence attached.
     *
     * Only the first two advance the queue. The other three leave the local id
     * unclaimed — `run()` deletes its own row on any throw — so the till can send
     * the same entry again once somebody has decided, signed, or fixed it.
     *
     * `$onApplied` is how a caller learns the ids the server just assigned. A
     * till that opened a bill with no network has no idea what number it got, so
     * the lines behind it in the queue can only point at the entry that opened
     * it — and the answer to "what did that entry produce" has to reach the
     * caller for the entries that were applied JUST NOW and for the ones that
     * were applied on a previous attempt alike, because a half-drained queue is
     * the normal case rather than the exception.
     *
     * @param array<int, array{local_id: string, local_seq: int, action: string, payload: array<string, mixed>}> $entries
     * @param Closure(string, array<string, mixed>): array<string, mixed> $dispatch
     * @param Closure(string, string, array<string, mixed>): void|null $onApplied local id, action, result
     *
     * @return array<int, array<string, mixed>>
     */
    public function replayBatch(Terminal $terminal, array $entries, Closure $dispatch, ?Closure $onApplied = null): array
    {
        usort($entries, static fn (array $a, array $b): int => $a['local_seq'] <=> $b['local_seq']);

        $outcomes = [];

        foreach ($entries as $entry) {
            // Repeated on every row rather than assembled once at the end: a
            // cashier reading a stalled queue matches rows to their screen by the
            // verb and the order they did it in, not by a uuid.
            $of = [
                'local_id' => $entry['local_id'],
                'local_seq' => $entry['local_seq'],
                'action' => $entry['action'],
            ];

            try {
                $applied = $this->run(
                    terminal: $terminal,
                    localId: $entry['local_id'],
                    localSeq: $entry['local_seq'],
                    action: $entry['action'],
                    payload: $entry['payload'],
                    work: fn (): array => $dispatch($entry['action'], $entry['payload']),
                );

                $outcomes[] = [
                    ...$of,
                    'status' => $applied['replayed'] ? 'duplicate' : 'accepted',
                    'result' => $applied['result'],
                ];

                if ($onApplied !== null) {
                    $onApplied($entry['local_id'], $entry['action'], $applied['result']);
                }
            } catch (ConflictException $conflict) {
                // Not a failure. The write was valid when the cashier made it and
                // the world moved underneath — so it goes back as a question with
                // the answers on it, not as a sentence nobody can act on.
                $outcomes[] = [
                    ...$of,
                    'status' => 'conflict',
                    'code' => $conflict->kind->code(),
                    ...$conflict->meta(),
                ];
            } catch (ApiException $named) {
                /*
                 * A refusal that already has a name keeps it.
                 *
                 * `pos.approval_required` carries the id of the request now
                 * sitting in a manager's queue; `finance.variance_needs_approval`
                 * carries the figures. Flattening those into a `failed` row with
                 * one sentence would tell a till to give up on the one thing it
                 * only has to wait for.
                 */
                $outcomes[] = [
                    ...$of,
                    'status' => 'refused',
                    'code' => $named->error->code,
                    'detail' => $named->getMessage(),
                    ...$named->meta,
                ];
            } catch (Throwable $failure) {
                // `detail` and not `error`: every other refusal in this API puts
                // its sentence there, and one screen renders all of them.
                $outcomes[] = [
                    ...$of,
                    'status' => 'failed',
                    'detail' => $failure->getMessage(),
                ];
            }
        }

        return $outcomes;
    }

    private function find(Terminal $terminal, string $localId): ?PosSyncEntry
    {
        return PosSyncEntry::query()
            ->where('terminal_id', $terminal->getKey())
            ->where('local_id', $localId)
            ->first();
    }

    /**
     * @return array{result: array<string, mixed>, replayed: bool}
     */
    private function replay(PosSyncEntry $entry): array
    {
        if ($entry->status === 'pending') {
            // Still in flight elsewhere. Answering "done" would be a lie and
            // answering "not done" would double-charge; the till retries.
            throw new RuntimeException('Bu amal hozir bajarilmoqda — biroz kuting.');
        }

        return ['result' => $entry->result ?? [], 'replayed' => true];
    }

    /** Wrap a closure in a database transaction as well as the guard. */
    public function transactional(Closure $work): Closure
    {
        return static fn (): array => DB::transaction($work);
    }
}
