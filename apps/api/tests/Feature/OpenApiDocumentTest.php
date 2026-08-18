<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Console\Commands\GenerateOpenApiDocument;
use Tests\TestCase;

/**
 * The committed openapi.json must be the one the router would generate today.
 *
 * Same pattern as OrderStateLadderTest: two artefacts describing one truth,
 * and a test that fails the moment they disagree. Add a route, rename a
 * permission, register an error code — and this fails until
 * `php artisan api:openapi` is run, so the contract a client reads is never
 * older than the API it calls.
 */
final class OpenApiDocumentTest extends TestCase
{
    public function test_the_committed_document_matches_the_router(): void
    {
        $current = json_encode(
            app(GenerateOpenApiDocument::class)->document(),
            JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
        )."\n";

        $committed = (string) file_get_contents(base_path('openapi.json'));

        $this->assertSame(
            $committed,
            $current,
            'openapi.json is stale — a route or an error code changed without it. Run: php artisan api:openapi',
        );
    }

    public function test_the_document_covers_the_whole_surface(): void
    {
        $document = app(GenerateOpenApiDocument::class)->document();

        // Coarse but honest floor: the v1 surface today is 142 paths and 47
        // catalogued errors. Shrinking below the floor means routes silently
        // fell out of the document — a generator bug, not a smaller API.
        $this->assertGreaterThanOrEqual(100, count($document['paths']));
        $this->assertGreaterThanOrEqual(45, count($document['x-error-catalogue']));

        // Every mutating tenant operation must carry the Idempotency-Key
        // parameter — the document has to say what the middleware enforces.
        $tenders = $document['paths']['/v1/pos/bills/{bill}/tenders']['post'];
        $refs = array_column($tenders['parameters'], '$ref');
        $this->assertContains('#/components/parameters/IdempotencyKey', $refs);
    }
}
