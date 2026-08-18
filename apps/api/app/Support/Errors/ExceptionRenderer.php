<?php

declare(strict_types=1);

namespace App\Support\Errors;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;
use Throwable;

/**
 * Turn anything thrown into the one envelope.
 *
 * The framework's own exceptions are the reason this exists. Laravel answers
 * a failed validation with `{"message": …, "errors": {"email": [...]}}`, an
 * unauthenticated request with `{"message": "Unauthenticated."}`, and a
 * missing model with `{"message": ""}` — three shapes, all in English, none
 * carrying a code. A client written against API.md would have to special-case
 * every one of them.
 *
 * Mapping happens here rather than at each throw site so that code nobody
 * wrote — a route-model binding that misses, a rate limiter that trips — still
 * answers in the documented shape.
 */
final class ExceptionRenderer
{
    /**
     * Returns null when the exception is not ours to render, which leaves
     * Laravel's own handling in place — the HTML dashboards for Horizon and
     * Telescope keep their error pages.
     */
    public static function render(Throwable $e, Request $request): ?JsonResponse
    {
        if (! self::wantsEnvelope($request)) {
            return null;
        }

        return match (true) {
            $e instanceof ApiException => $e->render(),

            // Validation is the only place `field` is populated from the
            // framework: the first failing key, in the dotted form the client
            // sent it, so a POS can highlight `lines.2.menu_item_id`.
            $e instanceof ValidationException => ErrorResponse::code(
                'request.validation_failed',
                field: array_key_first($e->errors()),
                meta: ['errors' => $e->errors()],
            ),

            $e instanceof AuthenticationException => ErrorResponse::code('auth.unauthenticated'),

            $e instanceof AuthorizationException,
            $e instanceof AccessDeniedHttpException => ErrorResponse::code('auth.forbidden'),

            $e instanceof ModelNotFoundException,
            $e instanceof NotFoundHttpException => ErrorResponse::code('request.not_found'),

            $e instanceof MethodNotAllowedHttpException => ErrorResponse::code('request.method_not_allowed'),

            $e instanceof TooManyRequestsHttpException => self::rateLimited($e),

            default => self::fallback($e),
        };
    }

    private static function rateLimited(TooManyRequestsHttpException $e): JsonResponse
    {
        $response = ErrorResponse::code('request.rate_limited');

        // Retry-After is the only way a client can back off correctly rather
        // than guessing; API.md §18 requires it on every 429.
        $after = $e->getHeaders()['Retry-After'] ?? null;

        if ($after !== null) {
            $response->headers->set('Retry-After', (string) $after);
        }

        return $response;
    }

    private static function fallback(Throwable $e): ?JsonResponse
    {
        // An HttpException carrying a status we have no code for — abort(418)
        // and friends. Answer in the envelope with a generic code rather than
        // leaking Laravel's shape, but keep the status the thrower chose.
        if ($e instanceof HttpExceptionInterface) {
            $status = $e->getStatusCode();
            $code = $status >= 500 ? 'server.unexpected' : 'request.validation_failed';
            $base = ErrorCatalogue::get($code);

            return ErrorResponse::make(new ApiError(
                $base->code,
                $status,
                $base->uz,
                $base->ru,
                $base->en,
                $base->retryable,
            ));
        }

        // Anything else is a bug. Let Laravel handle it in local and testing,
        // where the stack trace is the point; in production answer with the
        // envelope so a till never has to parse an HTML error page.
        return app()->hasDebugModeEnabled() ? null : ErrorResponse::code('server.unexpected');
    }

    private static function wantsEnvelope(Request $request): bool
    {
        return $request->is('api/*', 'sanctum/*', 'broadcasting/*') || $request->expectsJson();
    }
}
