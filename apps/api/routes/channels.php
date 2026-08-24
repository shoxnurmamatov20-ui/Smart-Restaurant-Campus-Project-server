<?php

declare(strict_types=1);

use App\Models\Branch;
use Illuminate\Support\Facades\Broadcast;

/*
|--------------------------------------------------------------------------
| Broadcast Channels — Smart Restaurant Campus
|--------------------------------------------------------------------------
| WebSocket channels served by Laravel Reverb. A restaurant lives or dies on
| these being instant: the kitchen display, the waiter's "order is ready"
| buzz, the table map, the live revenue tile.
|
| Channel names are always tenant-prefixed so two restaurants can never end up
| on the same channel.
*/

// Private per-user channel
Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

/*
 * Kitchen display, per BRANCH.
 *
 * This was `tenant.{id}.kitchen`, which is the wrong grain by one level: a
 * chain of fifty venues would push every docket to every pass, and the cook in
 * Chilonzor would watch Termiz's tickets scroll past their own. A kitchen
 * screen is a physical object standing in one room.
 *
 * Authorised on the RESTAURANT that owns the branch, plus a kitchen role. A
 * tighter rule — this cook works at this branch — needs a user-to-branch link
 * that does not exist yet (attendance has one, identity does not), and
 * inventing one here would be a guess enforced in the one place nobody looks.
 * What this does stop is the thing that matters: another restaurant's kitchen.
 */
Broadcast::channel('branch.{branchId}.kitchen', function ($user, $branchId) {
    return Branch::query()->whereKey($branchId)->where('tenant_id', $user->tenant_id)->exists()
        && $user->hasAnyRole(['cook', 'chef', 'bartender', 'branch-manager', 'owner', 'super-admin']);
});

/*
 * The floor's view of the kitchen: a waiter's chip turning amber when the
 * kitchen accepts and green when it is ready.
 *
 * Separate from the kitchen channel because the audiences are different and so
 * are the volumes — a pass sees every line of every docket, a waiter needs to
 * know when one of theirs moved.
 */
Broadcast::channel('branch.{branchId}.orders', function ($user, $branchId) {
    return Branch::query()->whereKey($branchId)->where('tenant_id', $user->tenant_id)->exists()
        && $user->hasAnyRole([
            'waiter', 'host', 'cashier', 'bartender',
            'branch-manager', 'owner', 'super-admin',
        ]);
});

/*
 * The stop-list, per branch.
 *
 * The widest audience of the three branch channels, and deliberately so: a stop
 * changes what every screen in the building may sell, so a waiter, a cashier and
 * a host all need it. What it is not is public — a guest's QR menu re-reads the
 * cached menu instead, which is a page load rather than a socket, and there is no
 * version of "let every guest in the room subscribe to a private channel" that
 * ends well.
 */
Broadcast::channel('branch.{branchId}.stoplist', function ($user, $branchId) {
    return Branch::query()->whereKey($branchId)->where('tenant_id', $user->tenant_id)->exists()
        && $user->hasAnyRole([
            'waiter', 'host', 'cashier', 'bartender', 'cook', 'chef',
            'storekeeper', 'branch-manager', 'owner', 'super-admin',
        ]);
});

/*
 * The floor plan, per branch.
 *
 * The one screen in a restaurant more than one person is looking at at the same
 * moment: the console on the manager's desk, the host at the door, two waiters
 * on handsets, all reading the same twenty-four squares. Without a channel they
 * each work from whatever the floor looked like when their screen last loaded,
 * and a second party gets walked to an occupied table.
 *
 * There is a `tenant.{id}.floor` above and this is not a duplicate of it: that
 * one is the wrong grain by a level, exactly as the kitchen channel was before
 * it moved. A floor plan is a room, and a chain of fifty venues pushing every
 * table state to every venue is fifty rooms redrawing because one host in
 * Termiz seated a table.
 *
 * Same audience as the orders channel, plus the host: seating and clearing is
 * what these roles do all shift, and the payload is a table's name and its
 * colour — nothing a person standing in the room cannot already see.
 */
Broadcast::channel('branch.{branchId}.floor', function ($user, $branchId) {
    return Branch::query()->whereKey($branchId)->where('tenant_id', $user->tenant_id)->exists()
        && $user->hasAnyRole([
            'waiter', 'host', 'cashier', 'bartender',
            'branch-manager', 'owner', 'super-admin',
        ]);
});

/*
 * Approvals, per branch.
 *
 * The channel P9 was built for: a waiter asks for a discount, and the manager who
 * grants it is in the car park. Without this the tablet has to poll — which works,
 * and which turns "the manager said yes" into "the manager said yes, up to five
 * seconds ago", with a guest standing at the till while it catches up.
 *
 * Deliberately narrow. A discount request names a bill, a person and an amount,
 * and everyone who can hear it can read all three — so this carries the people who
 * ask and the people who decide, and nobody else. A cook has no business knowing
 * what a table was let off.
 */
Broadcast::channel('branch.{branchId}.approvals', function ($user, $branchId) {
    return Branch::query()->whereKey($branchId)->where('tenant_id', $user->tenant_id)->exists()
        && $user->hasAnyRole([
            'waiter', 'cashier', 'bartender', 'host',
            'branch-manager', 'brand-manager', 'owner', 'super-admin',
        ]);
});

/*
 * The menu board above the counter, per branch.
 *
 * The one channel on this list whose subscriber is not a person. Nobody stands
 * at a menu board: a television that only picked up a new price on its next
 * reload is a television advertising last week's price to the queue, and there
 * is no one to press F5. `POST board/push` sends `board.pushed` down here and
 * the screen re-reads `GET board/preview`.
 *
 * Per branch for the same reason as its five siblings, and this one is visible
 * from the pavement: a chain pushing one venue's board to every wall would put
 * Chilonzor's combo deal on the Termiz counter, at a price Termiz does not
 * charge.
 *
 * The audience is the counter and the people who write for it. The screen
 * itself signs in as whoever is on the till — this platform pairs terminals and
 * printers and nothing for signage, so a wall screen has no identity of its own
 * yet (see `board.screens` in the module config) — which is why the cashier and
 * the host are here alongside the managers who edit it. A cook is not: the one
 * thing the board tells a kitchen is the stop list, and that arrives on
 * `.stoplist`, in the other direction.
 */
Broadcast::channel('branch.{branchId}.board', function ($user, $branchId) {
    return Branch::query()->whereKey($branchId)->where('tenant_id', $user->tenant_id)->exists()
        && $user->hasAnyRole([
            'cashier', 'host',
            'branch-manager', 'brand-manager', 'owner', 'super-admin',
        ]);
});

// Floor — waiters and hosts: table state, "order ready", guest calls
Broadcast::channel('tenant.{tenantId}.floor', function ($user, $tenantId) {
    return (int) $user->tenant_id === (int) $tenantId
        && $user->hasAnyRole(['waiter', 'host', 'branch-manager', 'owner', 'super-admin']);
});

// Cash desk — payments, shift open/close
Broadcast::channel('tenant.{tenantId}.cashdesk', function ($user, $tenantId) {
    return (int) $user->tenant_id === (int) $tenantId
        && $user->hasAnyRole(['cashier', 'branch-manager', 'accountant', 'owner', 'super-admin']);
});

// Management dashboard — live revenue, alerts, stop-list changes
Broadcast::channel('tenant.{tenantId}.management', function ($user, $tenantId) {
    return (int) $user->tenant_id === (int) $tenantId
        && $user->hasAnyRole(['branch-manager', 'brand-manager', 'owner', 'super-admin']);
});
