<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

/**
 * The service root.
 *
 * This is the one route in routes/web.php, and it is what a load balancer, an
 * uptime monitor or a confused developer hits first. It has to answer without
 * a tenant header, without a session, and without touching the database —
 * anything else turns a liveness check into a dependency check.
 *
 * (This replaces the generated ExampleTest, which asserted only that the same
 * URL returned 200 and never checked what came back.)
 */
class StatusEndpointTest extends TestCase
{
    public function test_it_identifies_the_service_without_authentication(): void
    {
        $response = $this->getJson('/');

        $response->assertOk();
        $response->assertJsonStructure(['service', 'version', 'env', 'time']);
        $response->assertJsonPath('service', 'Smart Restaurant Campus API');
    }

    public function test_it_answers_without_a_tenant_header(): void
    {
        // Every /api/v1 route resolves a tenant first. The status route sits
        // outside that, so a monitor does not need to know a restaurant exists.
        $this->getJson('/')->assertOk();
    }
}
