<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Support\Errors\ApiError;
use App\Support\Errors\ErrorResponse;
use App\Support\Modules\ModuleRegistry;
use App\Support\Tenancy\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Makes the module switch mean something.
 *
 * A flag that only hides a sidebar entry is decoration — anyone with the URL
 * still reaches the data. This closes every route belonging to a module the
 * restaurant has switched off, or that the operator has disabled platform-wide.
 *
 * Which module a route belongs to is read from its controller's namespace
 * (`Modules\Menu\...` → Menu), so a new module is covered the moment it exists
 * and no route file has to declare anything.
 */
final readonly class EnsureModuleEnabled
{
    public function __construct(
        private ModuleRegistry $registry,
        private TenantContext $tenants,
    ) {}

    /**
     * @param Closure(Request): Response $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $module = $this->registry->findByClass($this->controllerClass($request));

        if ($module !== null && ! $this->registry->isAvailable($module, $this->tenants->tenant())) {
            // The module's own title makes the sentence specific — a
            // manager reads which module, not that "a module" is off.
            return ErrorResponse::make(
                new ApiError(
                    'module.disabled',
                    Response::HTTP_FORBIDDEN,
                    "\"{$module->title()}\" moduli bu restoran uchun yoqilmagan.",
                    "Модуль \"{$module->title()}\" не подключён для этого ресторана.",
                    "The \"{$module->title()}\" module is not enabled for this restaurant.",
                ),
                meta: ['module' => $module->key],
            );
        }

        return $next($request);
    }

    /**
     * The controller behind this route, whether written as `Class@method`, as an
     * invokable class, or not at all (a closure route).
     */
    private function controllerClass(Request $request): string
    {
        $action = $request->route()?->getAction('controller');

        if (! is_string($action)) {
            return '';
        }

        return explode('@', $action)[0];
    }
}
