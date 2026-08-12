<?php

declare(strict_types=1);

namespace Modules\Pos\Services;

use Closure;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Modules\Pos\Models\PosSyncEntry;
use Modules\Pos\Models\Terminal;
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
     * @param array<int, array{local_id: string, local_seq: int, action: string, payload: array<string, mixed>}> $entries
     * @param Closure(string, array<string, mixed>): array<string, mixed> $dispatch
     *
     * @return array<int, array<string, mixed>>
     */
    public function replayBatch(Terminal $terminal, array $entries, Closure $dispatch): array
    {
        usort($entries, static fn (array $a, array $b): int => $a['local_seq'] <=> $b['local_seq']);

        $outcomes = [];

        foreach ($entries as $entry) {
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
                    'local_id' => $entry['local_id'],
                    'status' => $applied['replayed'] ? 'duplicate' : 'accepted',
                    'result' => $applied['result'],
                ];
            } catch (Throwable $failure) {
                $outcomes[] = [
                    'local_id' => $entry['local_id'],
                    'status' => 'failed',
                    'error' => $failure->getMessage(),
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
