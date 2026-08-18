<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Support\Errors\ErrorResponse;
use App\Support\Idempotency\IdempotencyStore;
use App\Support\Tenancy\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Every write carries a one-time key, or it does not happen.
 *
 * API.md §1: "Never let a mutating endpoint succeed without an idempotency
 * key. One double-tap on a slow tablet is the whole reason this rule exists."
 *
 * Header, not body: the key identifies the request, not the thing being
 * created, and putting it in the body means every payload schema has to carry
 * it and every validator has to ignore it.
 *
 * X-Terminal-Id is deliberately NOT read as authority. API.md §1 lists it
 * beside the key, but §19's own rule — never accept a computed value from a
 * client — applies to it too: the terminal is derived from the paired device
 * token, and a header claiming otherwise is an assertion to check, not a fact.
 */
final class EnsureIdempotency
{
    public const HEADER = 'Idempotency-Key';

    /** Reads change nothing, so they need no key. */
    private const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

    public function __construct(
        private readonly IdempotencyStore $store,
        private readonly TenantContext $tenants,
    ) {}

    /** @param Closure(Request): Response $next */
    public function handle(Request $request, Closure $next): Response
    {
        if (in_array($request->method(), self::SAFE_METHODS, true)) {
            return $next($request);
        }

        /*
         * The till has its own guard, and a better one: `pos.sync_entries`
         * scopes the key to the terminal and carries `local_seq`, which is
         * what drains an offline queue in the order the cashier actually
         * worked. Running both would store the same operation twice and buy
         * nothing, so this stands aside where that one already stands.
         */
        if ($request->hasHeader('X-Pos-Local-Id')) {
            return $next($request);
        }

        $key = trim((string) $request->header(self::HEADER, ''));

        if ($key === '') {
            return ErrorResponse::code('request.idempotency_key_missing');
        }

        if (mb_strlen($key) > 64) {
            return ErrorResponse::code('request.idempotency_key_missing', field: self::HEADER);
        }

        $endpoint = $request->route()?->uri() ?? $request->path();
        $hash = IdempotencyStore::hash($request->method(), $endpoint, $request->getContent());

        $claim = $this->store->claim(
            key: $key,
            tenantId: $this->tenants->tenant()?->getKey(),
            method: $request->method(),
            endpoint: $endpoint,
            hash: $hash,
        );

        if ($claim['conflict']) {
            return ErrorResponse::code('request.idempotency_key_reused', field: self::HEADER);
        }

        if (! $claim['claimed']) {
            $replay = $claim['response'];

            if ($replay === null) {
                // The first copy is still in flight. Telling this one to retry
                // is honest; telling it "ok" with no body is not.
                return ErrorResponse::code('request.idempotency_key_reused', field: self::HEADER);
            }

            // The stored bytes go back untouched — json'ing them again would
            // re-escape and reorder, which is the diff this column's type was
            // chosen to prevent.
            return response($replay['body'], $replay['status'])
                ->header('Content-Type', 'application/json')
                ->header('Idempotent-Replay', 'true');
        }

        try {
            $response = $next($request);
        } catch (Throwable $failure) {
            // A failed attempt must not poison the retry that fixes it.
            $this->store->release($key);

            throw $failure;
        }

        $this->remember($key, $response);

        return $response;
    }

    private function remember(string $key, Response $response): void
    {
        // Only successful writes are remembered. Replaying a 422 would mean a
        // client that fixed its payload got its old rejection back forever.
        if ($response->getStatusCode() >= 400) {
            $this->store->release($key);

            return;
        }

        $content = $response->getContent();

        $this->store->complete(
            $key,
            $response->getStatusCode(),
            $content === false ? '' : $content,
        );
    }
}
