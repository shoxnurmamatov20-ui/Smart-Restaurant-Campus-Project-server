<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers\Concerns;

use App\Models\User;
use App\Support\Finance\CashRounding;
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

    /**
     * What a cashier should ask for, computed here so the till never has to.
     *
     * The payment screen needs the ROUNDED cash figure before it takes any money —
     * a cashier cannot ask for 45 240 so'm and then discover the system wanted
     * 45 000. The obvious shortcut is to let the tablet round it: the step is a
     * terminal setting the client already receives, and the arithmetic is one line.
     *
     * It is refused for the reason every derived number in this platform is
     * refused. A client that can compute a total can disagree with the receipt,
     * and the disagreement surfaces in front of a guest with money on the counter.
     * So the figure comes down from the same rule the settlement charges — one
     * step, read off the terminal — and the screen displays rather than derives.
     *
     * `cash_rounding` is signed and shown separately, because "45 240 emas, 45 000"
     * needs a visible reason on the screen and on the receipt — otherwise it reads
     * as the till having got the bill wrong.
     *
     * @return array<string, int>
     */
    protected function payable(Request $request, int $total): array
    {
        $step = $this->terminal($request)->cashRoundingStep();

        return [
            'total' => $total,
            // What cash settles this bill for. Equal to the total when the total
            // already lands on a note boundary, which is the common case for a
            // menu priced in whole thousands.
            'cash_total' => CashRounding::round($total, $step),
            'cash_rounding' => CashRounding::difference($total, $step),
            // Sent so a screen can label the rule it is showing ("1000 gacha")
            // rather than hard-coding a number that is a per-terminal setting.
            'cash_rounding_step' => $step,
        ];
    }
}
