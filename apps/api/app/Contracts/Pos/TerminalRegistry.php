<?php

declare(strict_types=1);

namespace App\Contracts\Pos;

/**
 * Every till on the platform, for the operator's console.
 *
 * `(platform)/platform/terminals` lists devices across all restaurants: which
 * version each is on, when it last synced, whether it is answering. That is a
 * cross-tenant read by definition, and the core cannot import `Modules\Pos` to
 * do it — hence a contract, implemented inside the module that owns the table.
 *
 * Deliberately not a general terminal API. One method, one screen: a support
 * person looking at a wall of devices and asking which one is stuck.
 */
interface TerminalRegistry
{
    /**
     * Every till, newest silence first.
     *
     * The caller is the platform operator, whose connection bypasses row-level
     * security; a tenant-scoped caller gets their own and nothing else, which
     * is the correct degradation rather than a leak.
     *
     * `tenant_id` rides beside `tenant` because the overview counts tills per
     * restaurant and the name is not a key: it is a string a customer chose,
     * and two of them may choose the same one.
     *
     * @return list<array{
     *     id: int,
     *     code: string,
     *     name: string,
     *     tenant_id: int,
     *     tenant: string|null,
     *     branch: string|null,
     *     mode: string,
     *     status: string,
     *     version: string|null,
     *     online: bool,
     *     seen_minutes: int|null,
     * }>
     */
    public function across(): array;
}
