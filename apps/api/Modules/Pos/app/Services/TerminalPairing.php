<?php

declare(strict_types=1);

namespace Modules\Pos\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\NewAccessToken;
use Modules\Pos\Models\Terminal;

/**
 * The one moment a till has no credentials.
 *
 * A manager creates the terminal in the back office and reads an eight-character
 * code off the screen; someone types it into the tablet once; the tablet walks
 * away with a device token and the code is destroyed. Everything about the
 * design follows from that being the only unauthenticated write in the module:
 *
 *  - the alphabet drops I, O, 0 and 1, because the code is read aloud across a
 *    dining room;
 *  - only a hash is stored, and the code is long enough that an unsalted hash
 *    is still not worth attacking — it has to be unsalted, because the lookup
 *    happens before we know which restaurant is pairing;
 *  - redemption is a single transaction that clears the code, so a code that
 *    two people race to use pairs exactly one device.
 */
final class TerminalPairing
{
    /** No I, O, 0 or 1 — this code gets read out loud and typed on a tablet. */
    private const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    /**
     * Issue a fresh code, invalidating any previous one.
     *
     * Returned in plain text exactly once; after this call the server can only
     * ever check a candidate against it, never show it again.
     */
    public function issueCode(Terminal $terminal): string
    {
        $code = $this->generateCode((int) config('pos.pairing.code_length', 8));

        // Written with the query builder rather than `save()` on purpose. A
        // caller can easily hold a Terminal loaded before the last pairing, and
        // `save()` only writes what it considers dirty: re-issuing a code inside
        // the same minute leaves `pairing_expires_at` numerically unchanged
        // against a stale original, so the column silently keeps whatever the
        // database has — which after a redemption is NULL, and a NULL expiry
        // means the fresh code is refused. Both columns, every time.
        $expiresAt = now()->addMinutes((int) config('pos.pairing.ttl_minutes', 10));

        Terminal::query()
            ->withoutGlobalScope('tenant')
            ->whereKey($terminal->getKey())
            ->update([
                'pairing_code_hash' => $this->hash($code),
                'pairing_expires_at' => $expiresAt,
                'updated_at' => now(),
            ]);

        $terminal->forceFill([
            'pairing_code_hash' => $this->hash($code),
            'pairing_expires_at' => $expiresAt,
        ])->syncOriginal();

        return $code;
    }

    /**
     * Exchange a code for a device token.
     *
     * @return array{terminal: Terminal, token: NewAccessToken}
     *
     * @throws ValidationException when the code is unknown, expired or already used
     */
    public function redeem(string $code, string $deviceFingerprint, ?string $appVersion = null): array
    {
        return DB::transaction(function () use ($code, $deviceFingerprint, $appVersion): array {
            /** @var Terminal|null $terminal */
            $terminal = Terminal::query()
                ->withoutGlobalScope('tenant')   // nobody is signed in yet
                ->where('pairing_code_hash', $this->hash($code))
                ->lockForUpdate()
                ->first();

            if ($terminal === null || $terminal->pairing_expires_at === null) {
                $this->refuse();
            }

            if ($terminal->pairing_expires_at->isPast()) {
                $this->refuse('Ulash kodining muddati tugagan. Menejerdan yangi kod so\'rang.');
            }

            if ($terminal->status !== 'active') {
                $this->refuse('Bu terminal o\'chirilgan.');
            }

            // Pairing a device replaces the previous one: a till that is being
            // re-paired is usually a till that was lost or reimaged, and the old
            // token must stop working at that moment, not at its expiry.
            $terminal->tokens()->delete();

            $terminal->forceFill([
                'pairing_code_hash' => null,
                'pairing_expires_at' => null,
                'paired_at' => now(),
                'device_fingerprint' => $deviceFingerprint,
                'app_version' => $appVersion,
                'last_seen_at' => now(),
            ])->save();

            $token = $terminal->createToken(
                name: 'pos-terminal-'.$terminal->code,
                abilities: ['pos:terminal'],
            );

            return ['terminal' => $terminal, 'token' => $token];
        });
    }

    /** Deterministic on purpose — see the class docblock. */
    private function hash(string $code): string
    {
        return hash('sha256', mb_strtoupper(trim($code)));
    }

    private function generateCode(int $length): string
    {
        $alphabet = self::ALPHABET;
        $max = mb_strlen($alphabet) - 1;
        $code = '';

        for ($i = 0; $i < $length; $i++) {
            $code .= $alphabet[random_int(0, $max)];
        }

        return $code;
    }

    /**
     * One message for "no such code" and "wrong restaurant".
     *
     * Telling a caller that a code exists but belongs elsewhere would turn this
     * endpoint into an oracle for enumerating other restaurants' terminals.
     *
     * @throws ValidationException
     */
    private function refuse(string $message = 'Ulash kodi noto\'g\'ri yoki ishlatib bo\'lingan.'): never
    {
        throw ValidationException::withMessages(['code' => $message]);
    }
}
