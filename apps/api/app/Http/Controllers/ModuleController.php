<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Support\Modules\ModuleDescriptor;
use App\Support\Modules\ModuleRegistry;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

/**
 * The capability manifest — GET /api/v1/modules.
 *
 * This is the first call every client makes after signing in. Rather than each
 * frontend hard-coding a sidebar and hoping the backend agrees, they render
 * exactly what this returns: the modules this restaurant has switched on, and
 * within them, only what this person is allowed to touch. A waiter and an
 * accountant open the same build of the app and see different navigation.
 */
final class ModuleController extends Controller
{
    public function index(Request $request, ModuleRegistry $registry, TenantContext $context): JsonResponse
    {
        $tenant = $context->tenant();
        $user = $request->user();

        $modules = $registry->all()
            ->map(function (ModuleDescriptor $module) use ($registry, $tenant, $user): array {
                $available = $registry->isAvailable($module, $tenant);

                /** @var array<int, string> $granted */
                $granted = $available
                    ? array_values(array_filter(
                        $module->permissions,
                        static fn (string $permission): bool => $user?->can($permission) === true,
                    ))
                    : [];

                return [
                    'key' => $module->key,
                    'name' => $module->name,
                    'title' => $module->title(),
                    'labels' => $module->labels,
                    'description' => $module->description,
                    'icon' => $module->icon,
                    'group' => $module->group,
                    'route' => $module->route,
                    'order' => $module->order,

                    // Why a module is or is not usable, kept separate on purpose:
                    // "the platform turned it off" and "we turned it off" are
                    // different problems with different people to call.
                    'enabled' => $module->enabled,
                    'enabled_for_restaurant' => $registry->enabledForTenant($module, $tenant),
                    'available' => $available,
                    'required' => $module->required,

                    'permissions' => $granted,
                    'can_access' => $granted !== [],
                ];
            })
            ->values();

        return response()->json([
            'data' => $modules,
            'meta' => [
                'total' => $modules->count(),
                'available' => $modules->where('available', true)->count(),
                'accessible' => $modules->where('can_access', true)->count(),
                'locale' => app()->getLocale(),
                'restaurant' => $tenant?->slug,
            ],
        ]);
    }

    /**
     * Switch a module on or off for this restaurant — PATCH /api/v1/modules/{key}.
     *
     * Deliberately per-restaurant: the platform-wide flag is an operator
     * concern and is never reachable over the API.
     */
    public function update(Request $request, string $key, ModuleRegistry $registry, TenantContext $context): JsonResponse
    {
        $validated = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        $module = $registry->find($key);

        if ($module === null) {
            return response()->json([
                'message' => 'Bunday modul mavjud emas.',
                'code' => 'MODULE_NOT_FOUND',
            ], Response::HTTP_NOT_FOUND);
        }

        $tenant = $context->tenant();

        if ($tenant === null) {
            return response()->json([
                'message' => 'Restoran aniqlanmadi.',
                'code' => 'TENANT_REQUIRED',
            ], Response::HTTP_BAD_REQUEST);
        }

        if ($module->required && $validated['enabled'] === false) {
            throw ValidationException::withMessages([
                'enabled' => "\"{$module->title()}\" moduli restoran ishlashi uchun zarur, uni o'chirib bo'lmaydi.",
            ]);
        }

        if (! $module->enabled) {
            throw ValidationException::withMessages([
                'enabled' => "\"{$module->title()}\" moduli platforma darajasida o'chirilgan.",
            ]);
        }

        $registry->setForTenant($module, $tenant, $validated['enabled']);

        return response()->json([
            'data' => [
                'key' => $module->key,
                'title' => $module->title(),
                'enabled_for_restaurant' => $validated['enabled'],
                'available' => $registry->isAvailable($module, $tenant->refresh()),
            ],
        ]);
    }
}
