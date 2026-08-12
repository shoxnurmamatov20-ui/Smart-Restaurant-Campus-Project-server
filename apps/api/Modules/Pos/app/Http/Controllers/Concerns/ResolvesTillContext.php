<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers\Concerns;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Modules\Pos\Http\Middleware\RequireTerminalSession;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Models\TerminalSession;

/**
 * Where a till request's identity comes from.
 *
 * Never the request body. The terminal and the person are derived from the
 * bearer token the PIN login minted; the idempotency key comes from a header
 * the device generated before it knew whether it was online. A controller that
 * read any of these from JSON would let a client attribute a void to another
 * cashier, or replay a payment as if it were new.
 */
trait ResolvesTillContext
{
    protected function session(Request $request): TerminalSession
    {
        /** @var TerminalSession $session */
        $session = $request->attributes->get(RequireTerminalSession::ATTRIBUTE_SESSION);

        return $session;
    }

    protected function terminal(Request $request): Terminal
    {
        /** @var Terminal $terminal */
        $terminal = $request->attributes->get(RequireTerminalSession::ATTRIBUTE_TERMINAL);

        return $terminal;
    }

    protected function actor(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();

        return $user;
    }

    /**
     * The device-generated id that makes this write replay-safe.
     *
     * Required, not optional: a write without one cannot be told apart from its
     * own retry, and the till's whole offline story rests on being able to.
     *
     * @throws ValidationException
     */
    protected function localId(Request $request): string
    {
        $localId = trim((string) $request->header('X-Pos-Local-Id'));

        if ($localId === '') {
            throw ValidationException::withMessages([
                'X-Pos-Local-Id' => 'Har bir yozuv qurilma yaratgan X-Pos-Local-Id bilan yuborilishi shart.',
            ]);
        }

        if (preg_match('/^[0-9a-fA-F-]{16,64}$/', $localId) !== 1) {
            throw ValidationException::withMessages([
                'X-Pos-Local-Id' => 'X-Pos-Local-Id uuid ko\'rinishida bo\'lishi kerak.',
            ]);
        }

        return $localId;
    }

    protected function localSeq(Request $request): int
    {
        return max(0, (int) $request->header('X-Pos-Seq', '0'));
    }
}
