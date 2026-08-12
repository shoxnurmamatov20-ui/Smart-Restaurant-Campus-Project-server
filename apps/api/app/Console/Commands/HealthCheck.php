<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Http\Controllers\HealthController;
use Illuminate\Console\Command;
use Symfony\Component\HttpFoundation\Response;

/**
 * The health endpoints, reachable from a shell.
 *
 * The API pod runs php-fpm on port 9000, which speaks FastCGI, not HTTP — an
 * `httpGet` probe cannot reach it, and the TCP probe it used instead only ever
 * proved that a socket was open. That went green while the database was down.
 *
 *   php artisan health:check --readiness   → exit 1 when this node cannot serve
 *   php artisan health:check               → exit 1 only on a critical failure
 *
 * Used by the Kubernetes exec probes in infrastructure/kubernetes/base/api.yaml.
 */
final class HealthCheck extends Command
{
    protected $signature = 'health:check
                            {--readiness : Check only what a request cannot be served without}
                            {--json : Print the raw payload}';

    protected $description = 'Probe this node\'s dependencies and exit non-zero when unhealthy';

    public function handle(HealthController $health): int
    {
        $response = $this->option('readiness') ? $health->ready() : $health->show();

        /** @var array<string, mixed> $body */
        $body = json_decode((string) $response->getContent(), true, 512, JSON_THROW_ON_ERROR);

        if ($this->option('json')) {
            $this->line((string) $response->getContent());
        } else {
            $this->line('status: '.$body['status']);

            /** @var array<string, array{ok: bool, detail: string, ms: float}> $checks */
            $checks = $body['checks'] ?? [];

            foreach ($checks as $name => $check) {
                $this->line(sprintf(
                    '  %s %-12s %s (%sms)',
                    $check['ok'] ? '✅' : '❌',
                    $name,
                    $check['detail'],
                    $check['ms'],
                ));
            }
        }

        // Only a critical failure is a non-zero exit. A degraded node still
        // serves requests correctly; failing the probe would take it out of
        // rotation and turn a background problem into an outage.
        return $response->getStatusCode() === Response::HTTP_OK ? self::SUCCESS : self::FAILURE;
    }
}
