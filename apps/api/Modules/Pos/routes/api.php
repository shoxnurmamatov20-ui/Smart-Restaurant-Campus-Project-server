<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Pos\Http\Controllers\ApprovalController;
use Modules\Pos\Http\Controllers\BillController;
use Modules\Pos\Http\Controllers\DrawerController;
use Modules\Pos\Http\Controllers\IdleController;
use Modules\Pos\Http\Controllers\OfflineController;
use Modules\Pos\Http\Controllers\PosAuthController;
use Modules\Pos\Http\Controllers\PosController;
use Modules\Pos\Http\Controllers\PosMenuController;
use Modules\Pos\Http\Controllers\PrintQueueController;
use Modules\Pos\Http\Controllers\ShiftController;
use Modules\Pos\Http\Controllers\SyncController;
use Modules\Pos\Http\Controllers\TenderController;
use Modules\Pos\Http\Controllers\TerminalController;
use Modules\Pos\Http\Middleware\RequirePerson;
use Spatie\Permission\Middleware\PermissionMiddleware;

/*
|--------------------------------------------------------------------------
| Pos module API routes
|--------------------------------------------------------------------------
| Mounted at /api/v1/pos/* by RouteServiceProvider.
|
| Three kinds of caller live here, and they authenticate differently:
|
|   1. Back office (manager, owner, accountant) — a user token, `auth:sanctum`.
|   2. The till itself — a device token issued at pairing, also `auth:sanctum`
|      but the tokenable is a Terminal, not a User.
|   3. A tablet that has never paired — no credentials at all. Exactly one
|      route serves it, and the code is what identifies the restaurant.
*/

// ---- 3. Unauthenticated: pairing ----
// Throttled hard: this is the only endpoint where guessing has any value, and
// the code lives for ten minutes.
Route::middleware('throttle:10,1')
    ->prefix('v1/pos')
    ->name('api.v1.pos.')
    ->group(function (): void {
        Route::post('terminals/pair', [TerminalController::class, 'pair'])->name('terminals.pair');
    });

// ---- 1 & 2. Everything else ----
Route::middleware(['auth:sanctum', 'tenant'])
    ->prefix('v1/pos')
    ->name('api.v1.pos.')
    ->group(function (): void {
        Route::get('/', [PosController::class, 'index'])->name('info');

        // ---- Terminals ----
        Route::get('terminals', [TerminalController::class, 'index'])
            ->middleware(PermissionMiddleware::using('pos.view'))->name('terminals.index');
        Route::post('terminals', [TerminalController::class, 'store'])
            ->middleware(PermissionMiddleware::using('pos.terminal'))->name('terminals.store');

        // ---- Device-only endpoints ----
        // Both answer before anybody has typed a PIN, so `pos.device` is the
        // guard: a paired, active terminal and no person. The heartbeat is
        // declared before `terminals/{terminal}` so the literal segment wins.
        Route::middleware('pos.device')->group(function (): void {
            Route::post('terminals/heartbeat', [TerminalController::class, 'heartbeat'])
                ->name('terminals.heartbeat');

            // What a till shows all day when nobody is signed in: its identity,
            // the room's two counts, who is on shift, today's takings.
            Route::get('idle', IdleController::class)->name('idle');
        });

        Route::get('terminals/{terminal}', [TerminalController::class, 'show'])
            ->middleware(PermissionMiddleware::using('pos.view'))->name('terminals.show');
        Route::patch('terminals/{terminal}', [TerminalController::class, 'update'])
            ->middleware(PermissionMiddleware::using('pos.terminal'))->name('terminals.update');
        Route::post('terminals/{terminal}/pairing-code', [TerminalController::class, 'issueCode'])
            ->middleware(PermissionMiddleware::using('pos.terminal'))->name('terminals.pairing-code');

        /*
         * Push an unsaved idle-screen draft at one till.
         *
         * `pos.terminal` like the settings it previews — the same person, the
         * same screen. It writes nothing, but it does put a message on a screen
         * a room full of guests can read, which is exactly the reason it is not
         * open to everybody who can see a terminal list.
         */
        Route::post('terminals/{terminal}/preview', [TerminalController::class, 'preview'])
            ->middleware(PermissionMiddleware::using('pos.terminal'))->name('terminals.preview');

        // ---- Signing in at a till (device token) ----
        // No permission middleware: nobody is signed in yet, and the device
        // token is the authorisation.
        Route::get('auth/staff', [PosAuthController::class, 'staff'])->name('auth.staff');
        Route::post('auth/pin', [PosAuthController::class, 'login'])
            ->middleware('throttle:20,1')->name('auth.pin');

        // ---- Signed in at a till (session token) ----
        Route::middleware('pos.session')->group(function (): void {
            Route::get('auth/session', [PosAuthController::class, 'current'])->name('auth.session');
            Route::delete('auth/session', [PosAuthController::class, 'logout'])->name('auth.logout');

            /*
             * The menu, read from the catalogue.
             *
             * `pos.view` and not `pos.sell`: a manager checking a price and a
             * cashier settling somebody else's table both need to read the
             * board, and neither is selling. The stop list is already folded in
             * by the catalogue, so a dish the kitchen pulled is simply absent.
             */
            Route::get('menu', [PosMenuController::class, 'index'])
                ->middleware(PermissionMiddleware::using('pos.view'))->name('menu.index');
            Route::get('menu/{menuItem}/questions', [PosMenuController::class, 'questions'])
                ->middleware(PermissionMiddleware::using('pos.view'))->name('menu.questions');

            /*
             * Selling.
             *
             * `pos.sell` throughout, because taking an order and changing one
             * are the same act to a waiter. The operations that take money back
             * off a bill — voiding a line, discounting — carry their own
             * permission on top, and above a role's limit they also need a
             * manager's approval, which the ApprovalGate enforces.
             */
            Route::post('bills', [BillController::class, 'open'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.open');
            Route::get('bills/{bill}', [BillController::class, 'show'])
                ->middleware(PermissionMiddleware::using('pos.view'))->name('bills.show');

            Route::post('bills/{bill}/lines', [BillController::class, 'addLine'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.lines.add');
            Route::delete('bills/{bill}/lines/{line}', [BillController::class, 'voidLine'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.lines.void');

            Route::post('bills/{bill}/discount', [BillController::class, 'discount'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.discount');

            Route::post('bills/{bill}/send', [BillController::class, 'send'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.send');
            Route::post('bills/{bill}/split', [BillController::class, 'split'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.split');
            Route::post('bills/{bill}/merge', [BillController::class, 'merge'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.merge');
            Route::post('bills/{bill}/transfer', [BillController::class, 'transfer'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.transfer');
            Route::post('bills/{bill}/cancel', [BillController::class, 'cancel'])
                ->middleware(PermissionMiddleware::using('pos.void'))->name('bills.cancel');

            /*
             * A comp is not a void, and it is not a 100% discount either.
             *
             * `pos.sell` and not `pos.void`, on purpose: the person who raises
             * this is the waiter apologising for a forty-minute wait, and a
             * waiter holds neither `pos.void` nor `pos.discount`. Nothing is
             * given away by opening the door that wide — `comp` is in the gate's
             * always-approved list, so whoever asks, a manager signs.
             */
            Route::post('bills/{bill}/comp', [BillController::class, 'comp'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.comp');

            // ---- Money ----
            /*
             * A quote before the money. Writes nothing, so it carries no idempotency
             * key and needs only the right to sell — the same person who will take
             * the payment is the one asking what it comes to.
             */
            Route::post('bills/{bill}/tender-quote', [TenderController::class, 'quote'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.tender-quote');
            Route::post('bills/{bill}/tenders', [TenderController::class, 'settle'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('bills.tenders');
            Route::post('payments/{payment}/refund', [TenderController::class, 'refund'])
                ->middleware(PermissionMiddleware::using('pos.refund'))->name('payments.refund');

            /*
             * ---- Paper ----
             *
             * The status strip's "Qayta urinish". `pos.sell`, because the person
             * pressing it is the cashier standing in front of a printer that has
             * just come back — see PrintQueueController for why it is a till-side
             * door rather than a call to Kitchen's own retry route.
             */
            Route::post('print-queue/requeue', PrintQueueController::class)
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('print-queue.requeue');

            // ---- Shift: open, X-report, Z-report ----
            Route::post('shifts/open', [ShiftController::class, 'open'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('shifts.open');
            Route::get('shifts/current', [ShiftController::class, 'current'])
                ->middleware(PermissionMiddleware::using('pos.view'))->name('shifts.current');
            Route::post('shifts/close', [ShiftController::class, 'close'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('shifts.close');

            // ---- Drawer ----
            Route::get('drawer/movements', [DrawerController::class, 'index'])
                ->middleware(PermissionMiddleware::using('pos.view'))->name('drawer.index');
            Route::post('drawer/movements', [DrawerController::class, 'store'])
                ->middleware(PermissionMiddleware::using('pos.drawer'))->name('drawer.store');

            /*
             * ---- Offline ----
             *
             * `pos.sell` on the batch because draining a queue IS selling — the
             * bills in it were opened, fired and paid for while the router was
             * down. It is the floor of what a queued entry may cost, not the
             * ceiling: the controller re-checks the permission each verb would
             * have needed on its own route, or a batch would be one door around
             * every other guard in this file.
             *
             * The bootstrap is `pos.view` for the same reason the menu is — a
             * manager checking a price and a cashier taking a shift's local store
             * both need to read the board, and neither is selling.
             */
            Route::post('sync/batch', [SyncController::class, 'batch'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('sync.batch');

            /*
             * The answer to a conflict `sync/batch` raised.
             *
             * `pos.sell` and not something stronger, because resolving is not a
             * power of its own: it finishes a write the person was already
             * entitled to make. The verb inside the entry is checked again
             * against them by `refuseWithoutPermission`, and the two answers a
             * manager has to sign for — reopening a settled bill, amending a
             * sealed shift — go through `ApprovalGate` like every other one.
             * Gating the route itself on `pos.manage` would instead mean a
             * cashier could not clear their own queue.
             */
            Route::post('sync/resolve', [SyncController::class, 'resolve'])
                ->middleware(PermissionMiddleware::using('pos.sell'))->name('sync.resolve');
            Route::get('offline/bootstrap', OfflineController::class)
                ->middleware(PermissionMiddleware::using('pos.view'))->name('offline.bootstrap');

            // ---- Asking for an approval ----
            // Open to anyone at a till, and inside the session group because a
            // request is raised against the terminal and the person standing at
            // it. Answering one is not here — see below.
            Route::post('approvals', [ApprovalController::class, 'store'])->name('approvals.store');

            /*
             * ---- Answering one *at* the till ----
             *
             * The manager who walked over. Inside the session group and not with
             * its sibling below, because the credential that carries it is the
             * cashier's session — the manager is not signed in here and must not
             * have to be. `pos.sell` is therefore the caller's permission;
             * `pos.approve` is checked in the controller against the person whose
             * PIN was typed, which is the only place it can be checked.
             *
             * Throttled like `auth/pin`, and for the same reason: four digits is
             * a small space and this is the second door into it.
             */
            Route::post('approvals/{approval}/pin', [ApprovalController::class, 'decideWithPin'])
                ->middleware([PermissionMiddleware::using('pos.sell'), 'throttle:20,1'])
                ->name('approvals.pin');
        });

        /*
         * ---- Answering an approval ----
         *
         * Deliberately outside `pos.session`, and that placement is the feature.
         *
         * A manager is not at the till. They are in the office, in the car park,
         * or at the other branch, and the thing they are being asked about is a
         * waiter holding a tablet in front of a guest. Requiring a PIN session
         * meant the manager had to walk to a terminal, sign in on it, answer, and
         * sign out again — during which the waiter cannot use their own till,
         * because a session is per-terminal. In practice that is not what happens
         * in a restaurant: the manager's PIN gets told to the cashier, and the
         * approval table then records a lie for the rest of the year.
         *
         * So the queue answers to an ordinary user token from any device, guarded
         * by `pos.approve`. `RequirePerson` runs first and keeps the terminal's
         * own device token out — see that class for why the order matters.
         */
        Route::middleware(RequirePerson::class)->group(function (): void {
            Route::get('approvals', [ApprovalController::class, 'index'])
                ->middleware(PermissionMiddleware::using('pos.view'))->name('approvals.index');
            Route::get('approvals/{approval}', [ApprovalController::class, 'show'])
                ->middleware(PermissionMiddleware::using('pos.view'))->name('approvals.show');
            Route::post('approvals/{approval}/decide', [ApprovalController::class, 'decide'])
                ->middleware(PermissionMiddleware::using('pos.approve'))->name('approvals.decide');
        });

        // Changing a PIN happens in the back office as often as at a till, so it
        // sits outside the session requirement.
        Route::post('auth/pin/rotate', [PosAuthController::class, 'rotatePin'])
            ->middleware(PermissionMiddleware::using('pos.view'))->name('auth.pin.rotate');
    });
