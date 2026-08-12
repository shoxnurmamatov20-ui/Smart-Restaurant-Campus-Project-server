<?php

declare(strict_types=1);

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

// Kitchen display — every cook and the chef of that restaurant
Broadcast::channel('tenant.{tenantId}.kitchen', function ($user, $tenantId) {
    return (int) $user->tenant_id === (int) $tenantId
        && $user->hasAnyRole(['cook', 'chef', 'bartender', 'branch-manager', 'owner', 'super-admin']);
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
