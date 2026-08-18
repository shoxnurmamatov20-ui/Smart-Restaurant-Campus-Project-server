<?php

declare(strict_types=1);

namespace App\Support\Errors;

use Illuminate\Http\JsonResponse;

/**
 * The envelope, in one function, so every error in the system has the same
 * shape whether it came from a controller, a middleware or the framework.
 *
 * API.md §1:
 *
 *     { "error": { "code": …, "message_uz": …, "message_ru": …,
 *                  "message_en": …, "field": …, "retryable": … } }
 *
 * Wrapped in `error` rather than returned flat, so a client can tell a failure
 * from a successful body by looking at one key — which matters most on the
 * offline queue, where a response is read long after the request that caused
 * it and there is no status code left to consult.
 */
final class ErrorResponse
{
    /** @param array<string, mixed> $meta */
    public static function make(ApiError $error, ?string $field = null, array $meta = []): JsonResponse
    {
        return response()->json(
            ['error' => $error->toArray($field, $meta)],
            $error->status,
        );
    }

    /** @param array<string, mixed> $meta */
    public static function code(string $code, ?string $field = null, array $meta = []): JsonResponse
    {
        return self::make(ErrorCatalogue::get($code), $field, $meta);
    }
}
