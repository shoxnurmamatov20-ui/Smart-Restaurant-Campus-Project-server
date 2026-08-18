<?php

declare(strict_types=1);

namespace App\Support\Idempotency;

use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * "Have I already done this one?"
 *
 * Lifted from Modules/Pos, which got the hard part right and kept it to
 * itself. Twelve till routes were replay-safe while every other write in the
 * system — a manager approving from a phone, a Telegram bot placing an order,
 * an intake operator, the entire back office — was not.
 *
 * The claim goes in before the work runs. Claiming afterwards leaves a window
 * where two concurrent copies both look, both find nothing, and both charge
 * the guest. The unique constraint on the primary key is what makes the race
 * resolvable: the loser reads the winner's answer instead of doing the work.
 */
final class IdempotencyStore
{
    public const TABLE = 'public.idempotency_keys';

    /** DATABASE.md §6.4 — long enough for a night offline, short enough to stay small. */
    public const RETENTION_HOURS = 48;

    /**
     * Claim the key, or return what the first arrival answered.
     *
     * @return array{claimed: bool, response: array{status: int, body: mixed}|null, conflict: bool}
     */
    public function claim(string $key, ?int $tenantId, string $method, string $endpoint, string $hash): array
    {
        $existing = $this->find($key);

        if ($existing !== null) {
            // Same key, different body: a client bug. Replaying the first
            // response would hide it and answer for the wrong amount.
            if ($existing->request_hash !== $hash) {
                return ['claimed' => false, 'response' => null, 'conflict' => true];
            }

            return [
                'claimed' => false,
                'response' => $this->replay($existing),
                'conflict' => false,
            ];
        }

        try {
            DB::table(self::TABLE)->insert([
                'key' => $key,
                'tenant_id' => $tenantId,
                'endpoint' => $endpoint,
                'method' => $method,
                'request_hash' => $hash,
                'created_at' => now(),
            ]);
        } catch (UniqueConstraintViolationException) {
            // Two copies arrived at once and the other claimed it. Whatever it
            // produces is the answer for both.
            $winner = $this->find($key);

            if ($winner === null) {
                // Claimed and then released — the winner failed. Let this one
                // through to try the work itself.
                return ['claimed' => true, 'response' => null, 'conflict' => false];
            }

            return [
                'claimed' => false,
                'response' => $this->replay($winner),
                'conflict' => $winner->request_hash !== $hash,
            ];
        }

        return ['claimed' => true, 'response' => null, 'conflict' => false];
    }

    /** Remember what was answered, so the next arrival gets the same thing. */
    public function complete(string $key, int $status, mixed $body): void
    {
        DB::table(self::TABLE)->where('key', $key)->update([
            'status_code' => $status,
            'response_body' => json_encode($body, JSON_UNESCAPED_UNICODE),
        ]);
    }

    /**
     * Let go of a claim whose work threw.
     *
     * A failed attempt must not block the retry that fixes it — otherwise one
     * transient database error poisons that operation for 48 hours.
     */
    public function release(string $key): void
    {
        DB::table(self::TABLE)->where('key', $key)->whereNull('status_code')->delete();
    }

    /** @return int rows removed */
    public function prune(): int
    {
        return DB::table(self::TABLE)
            ->where('created_at', '<', now()->subHours(self::RETENTION_HOURS))
            ->delete();
    }

    public static function hash(string $method, string $path, string $body): string
    {
        return hash('sha256', $method.'|'.$path.'|'.$body);
    }

    private function find(string $key): ?object
    {
        /** @var object|null $row */
        $row = DB::table(self::TABLE)->where('key', $key)->first();

        return $row;
    }

    /** @return array{status: int, body: mixed}|null */
    private function replay(object $row): ?array
    {
        // A claim with no response yet: the first request is still running.
        // Null here makes the middleware answer 409 rather than 200-with-
        // nothing, so the client retries instead of believing it succeeded.
        if ($row->status_code === null) {
            return null;
        }

        try {
            $body = json_decode((string) $row->response_body, true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            return null;
        }

        return ['status' => (int) $row->status_code, 'body' => $body];
    }
}
