<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Support\Errors\ErrorCatalogue;
use Illuminate\Console\Command;
use Illuminate\Routing\Route as CompiledRoute;
use Illuminate\Support\Facades\Route;

/**
 * The API contract, born from the router — not written next to it.
 *
 * A hand-maintained OpenAPI file is a second implementation of the API, and
 * two implementations drift. This one is generated from the only two places
 * the truth already lives: the route table (paths, verbs, auth, tenancy,
 * permissions, idempotency) and the error catalogue (every code, its status,
 * its retryability, its three languages). What the generator cannot know —
 * request body shapes scattered across inline validate() calls — it does not
 * invent; a wrong schema is worse than an absent one, because a client
 * generator believes it.
 *
 * OpenApiDocumentTest regenerates the document and diffs it against the
 * committed file, exactly the way OrderStateLadderTest keeps the PHP and
 * TypeScript ladders honest: change a route and forget the document, and CI
 * says so.
 */
final class GenerateOpenApiDocument extends Command
{
    protected $signature = 'api:openapi
        {--check : Compare against the committed document instead of writing it}';

    protected $description = 'Generate openapi.json from the route table and the error catalogue';

    public function handle(): int
    {
        $document = json_encode($this->document(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n";
        $path = base_path('openapi.json');

        if ($this->option('check')) {
            $committed = is_file($path) ? (string) file_get_contents($path) : '';

            if ($committed !== $document) {
                $this->error('openapi.json is stale — a route or an error code changed without it. Run: php artisan api:openapi');

                return self::FAILURE;
            }

            $this->info('openapi.json matches the router.');

            return self::SUCCESS;
        }

        file_put_contents($path, $document);
        $this->info("Written: {$path}");

        return self::SUCCESS;
    }

    /** @return array<string, mixed> */
    public function document(): array
    {
        return [
            'openapi' => '3.1.0',
            'info' => [
                'title' => 'Smart Restaurant Campus API',
                'description' => 'Multi-tenant restaurant platform. Every business object'
                    .' belongs to one restaurant (tenant) and optionally one branch;'
                    .' money is an integer in tiyin (1 so\'m = 100 tiyin); every'
                    .' failure is the one error envelope in three languages.',
                'version' => '1.0.0',
            ],
            'servers' => [
                ['url' => 'https://mypos.tashmedunitf.uz/api'],
            ],
            'paths' => $this->paths(),
            'components' => [
                'securitySchemes' => [
                    'sanctum' => [
                        'type' => 'http',
                        'scheme' => 'bearer',
                        'description' => 'Personal access token from POST /v1/auth/login.',
                    ],
                ],
                'parameters' => $this->sharedParameters(),
                'schemas' => [
                    'Error' => $this->errorSchema(),
                ],
            ],
            // The whole catalogue, machine-readable: code → status, retryable,
            // and the sentence in all three languages. This block is what lets
            // a client map any failure to its own UI without a lookup table of
            // its own — the lookup table IS the contract.
            'x-error-catalogue' => $this->errorCatalogue(),
        ];
    }

    /** @return array<string, mixed> */
    private function paths(): array
    {
        $paths = [];

        // getRoutes() types as RouteCollectionInterface, which does not extend
        // Traversable even though every implementation is iterable — so the
        // concrete list is asked for instead of foreach'ing the interface.
        foreach (Route::getRoutes()->getRoutes() as $route) {
            /** @var CompiledRoute $route */
            $uri = $route->uri();

            if (! str_starts_with($uri, 'api/')) {
                continue;
            }

            $openApiPath = '/'.substr($uri, strlen('api/'));
            $middleware = $route->gatherMiddleware();

            foreach ($route->methods() as $method) {
                if (in_array($method, ['HEAD', 'OPTIONS'], true)) {
                    continue;
                }

                $paths[$openApiPath][strtolower($method)] = $this->operation($route, $method, $middleware);
            }
        }

        ksort($paths);

        foreach ($paths as &$operations) {
            ksort($operations);
        }

        return $paths;
    }

    /**
     * @param  list<string>  $middleware
     * @return array<string, mixed>
     */
    private function operation(CompiledRoute $route, string $method, array $middleware): array
    {
        $authenticated = in_array('auth:sanctum', $middleware, true);
        $tenanted = in_array('tenant', $middleware, true);
        $mutating = ! in_array($method, ['GET', 'HEAD', 'OPTIONS'], true);

        $operation = [
            'operationId' => $route->getName() ?? strtolower($method).':'.$route->uri(),
            'tags' => [$this->tag($route->uri())],
        ];

        $parameters = array_map(
            static fn (string $name): array => [
                'name' => $name,
                'in' => 'path',
                'required' => true,
                'schema' => ['type' => 'string'],
            ],
            $route->parameterNames(),
        );

        if ($tenanted) {
            $parameters[] = ['$ref' => '#/components/parameters/XTenant'];
            $parameters[] = ['$ref' => '#/components/parameters/XBranch'];
            $parameters[] = ['$ref' => '#/components/parameters/XLocale'];
        }

        if ($mutating && $tenanted) {
            $parameters[] = ['$ref' => '#/components/parameters/IdempotencyKey'];
        }

        if ($parameters !== []) {
            $operation['parameters'] = $parameters;
        }

        if ($authenticated) {
            $operation['security'] = [['sanctum' => []]];
        }

        foreach ($middleware as $entry) {
            if (str_contains($entry, 'PermissionMiddleware')) {
                $operation['x-required-permission'] = substr($entry, strrpos($entry, ':') + 1);
            }

            if (str_starts_with($entry, 'role:')) {
                $operation['x-required-role'] = substr($entry, strlen('role:'));
            }
        }

        $operation['responses'] = [
            'default' => [
                'description' => 'Success shapes are resource-specific; every'
                    .' failure is the Error envelope with a code from'
                    .' x-error-catalogue.',
                'content' => [
                    'application/json' => [
                        'schema' => ['$ref' => '#/components/schemas/Error'],
                    ],
                ],
            ],
        ];

        return $operation;
    }

    private function tag(string $uri): string
    {
        // api/v1/menu/items → menu; api/health/live → health.
        $segments = explode('/', $uri);

        if (($segments[1] ?? '') === 'v1') {
            return $segments[2] ?? 'core';
        }

        return $segments[1] ?? 'core';
    }

    /** @return array<string, mixed> */
    private function sharedParameters(): array
    {
        return [
            'XTenant' => [
                'name' => 'X-Tenant',
                'in' => 'header',
                'required' => false,
                'schema' => ['type' => 'string'],
                'description' => 'Restaurant slug. Optional when the token'
                    .' already belongs to a restaurant — the token wins, and a'
                    .' header naming a different restaurant is tenant.mismatch.'
                    .' Required in production for tokens that belong to none.',
            ],
            'XBranch' => [
                'name' => 'X-Branch',
                'in' => 'header',
                'required' => false,
                'schema' => ['type' => 'string'],
                'description' => 'Branch slug. Absent means every branch of the'
                    .' restaurant — an owner reading totals — not a missing value.',
            ],
            'XLocale' => [
                'name' => 'X-Locale',
                'in' => 'header',
                'required' => false,
                'schema' => ['type' => 'string', 'enum' => ['uz', 'ru', 'en']],
                'description' => 'Wins over the user preference and Accept-Language.',
            ],
            'IdempotencyKey' => [
                'name' => 'Idempotency-Key',
                'in' => 'header',
                'required' => true,
                'schema' => ['type' => 'string', 'maxLength' => 64],
                'description' => 'Client-generated key, one per operation.'
                    .' The same key replays the stored response verbatim'
                    .' (Idempotent-Replay: true); the same key with a different'
                    .' body is request.idempotency_key_reused.',
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function errorSchema(): array
    {
        return [
            'type' => 'object',
            'required' => ['error'],
            'properties' => [
                'error' => [
                    'type' => 'object',
                    'required' => ['code', 'message_uz', 'message_ru', 'message_en', 'retryable'],
                    'properties' => [
                        'code' => ['type' => 'string', 'description' => 'Stable machine key — see x-error-catalogue.'],
                        'message_uz' => ['type' => 'string'],
                        'message_ru' => ['type' => 'string'],
                        'message_en' => ['type' => 'string'],
                        'field' => ['type' => 'string', 'description' => 'Present when one input field is to blame.'],
                        'retryable' => ['type' => 'boolean', 'description' => 'True: same request may succeed later. False: change something first.'],
                    ],
                    'additionalProperties' => true,
                ],
            ],
        ];
    }

    /** @return array<string, array<string, mixed>> */
    private function errorCatalogue(): array
    {
        $catalogue = [];

        foreach (ErrorCatalogue::all() as $error) {
            $catalogue[$error->code] = [
                'status' => $error->status,
                'retryable' => $error->retryable,
                'message_uz' => $error->uz,
                'message_ru' => $error->ru,
                'message_en' => $error->en,
            ];
        }

        ksort($catalogue);

        return $catalogue;
    }
}
