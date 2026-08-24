<?php

declare(strict_types=1);

namespace Modules\Pos\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\UserPin;
use App\Support\Errors\ErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Modules\Pos\Http\Middleware\RequireTerminalSession;
use Modules\Pos\Http\Requests\PinLoginRequest;
use Modules\Pos\Http\Requests\RotatePinRequest;
use Modules\Pos\Http\Resources\TerminalSessionResource;
use Modules\Pos\Models\Terminal;
use Modules\Pos\Models\TerminalSession;
use Modules\Pos\Services\PinAuthenticator;

/**
 * Signing in and out of a till.
 *
 * Two different credentials meet here. The device token proves *which till*
 * this is and is issued once at pairing; the PIN proves *who* is standing at it
 * and is exchanged for a short-lived user token. Keeping them separate is what
 * lets a shift change take one second and a lost tablet be revoked without
 * touching anyone's password.
 */
final class PosAuthController extends Controller
{
    public function __construct(private readonly PinAuthenticator $pins) {}

    /**
     * The staff grid the till shows before anyone has signed in.
     *
     * Only names and roles — never anything that would make the tablet worth
     * stealing for what is on the login screen.
     */
    public function staff(Request $request): JsonResponse
    {
        if (! $this->terminalFrom($request) instanceof Terminal) {
            return $this->terminalTokenRequired();
        }

        $staff = UserPin::query()
            ->with('user')
            ->get()
            ->filter(static fn (UserPin $pin): bool => $pin->user !== null)
            ->map(static fn (UserPin $pin): array => [
                'user_id' => $pin->user_id,
                'name' => $pin->user->name,
                'roles' => $pin->user->getRoleNames(),
                'is_locked' => $pin->is_locked,
            ])
            ->sortBy('name')
            ->values();

        return response()->json(['data' => $staff]);
    }

    /**
     * Four digits in, a session out.
     */
    public function login(PinLoginRequest $request): JsonResponse
    {
        $terminal = $this->terminalFrom($request);

        if (! $terminal instanceof Terminal) {
            return $this->terminalTokenRequired();
        }

        ['session' => $session, 'token' => $token] = $this->pins->attempt(
            terminal: $terminal,
            userId: $request->integer('user_id'),
            pin: (string) $request->string('pin'),
            ip: $request->ip(),
        );

        return response()->json([
            'token' => $token,
            // `terminal.branch`, not just `terminal`: every screen that names
            // a till writes it as "Chilonzor · POS-3", and TerminalResource
            // only emits the branch when it has been loaded. Without this the
            // POS header read "POS-3" alone — which is ambiguous the moment a
            // chain has a POS-3 in two districts, and that is the normal case.
            'session' => (new TerminalSessionResource($session->load(['user', 'terminal.branch'])))->resolve($request),
        ], Response::HTTP_CREATED);
    }

    /**
     * Who is signed in on this till right now.
     */
    public function current(Request $request): TerminalSessionResource
    {
        /** @var TerminalSession $session */
        $session = $request->attributes->get(RequireTerminalSession::ATTRIBUTE_SESSION);

        return new TerminalSessionResource($session->load(['user', 'terminal.branch']));
    }

    /**
     * Sign out. Closing the session deletes the token that carried it, so this
     * is a real logout rather than a flag.
     */
    public function logout(Request $request): JsonResponse
    {
        /** @var TerminalSession $session */
        $session = $request->attributes->get(RequireTerminalSession::ATTRIBUTE_SESSION);

        $session->close('logout');

        return response()->json(['message' => 'Sessiya yopildi.']);
    }

    /**
     * Set or change a PIN.
     *
     * Your own needs the current one; somebody else's needs `pos.approve`,
     * because resetting a PIN is how a manager gets a forgotten cashier back on
     * the floor — and also how an attacker would take over an account.
     */
    public function rotatePin(RotatePinRequest $request): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();

        $targetId = $request->integer('user_id') ?: (int) $actor->getKey();
        $isSelf = $targetId === (int) $actor->getKey();

        if (! $isSelf && ! $actor->can('pos.approve')) {
            return ErrorResponse::code('pos.pin_forbidden');
        }

        /** @var User|null $target */
        $target = User::query()->whereKey($targetId)->first();

        if ($target === null || $target->tenant_id !== $actor->tenant_id) {
            return ErrorResponse::code('pos.user_not_found');
        }

        if ($isSelf) {
            $existing = UserPin::query()->where('user_id', $targetId)->first();

            if ($existing !== null && ! $this->currentPinMatches($request, $existing)) {
                return ErrorResponse::code('pos.pin_mismatch');
            }
        }

        $this->pins->setPin($target, (string) $request->string('pin'));

        return response()->json(['message' => 'PIN yangilandi.']);
    }

    private function currentPinMatches(RotatePinRequest $request, UserPin $existing): bool
    {
        return $request->filled('current_pin')
            && Hash::check((string) $request->string('current_pin'), $existing->pin_hash);
    }

    private function terminalFrom(Request $request): ?Terminal
    {
        /*
         * Either identity can hold a token on these routes: a till is a
         * Terminal, a person is a User. See TerminalController::heartbeat for
         * why the annotation is needed — what Sanctum returns is wider than
         * what the container's provider model implies.
         *
         * @var \Modules\Pos\Models\Terminal|\App\Models\User|null $authenticated
         */
        $authenticated = $request->user();

        return $authenticated instanceof Terminal ? $authenticated : null;
    }

    private function terminalTokenRequired(): JsonResponse
    {
        return ErrorResponse::code('pos.terminal_token_required');
    }
}
