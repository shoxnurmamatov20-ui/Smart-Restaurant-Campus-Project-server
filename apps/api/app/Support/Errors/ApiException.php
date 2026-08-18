<?php

declare(strict_types=1);

namespace App\Support\Errors;

use Illuminate\Http\JsonResponse;
use RuntimeException;
use Throwable;

/**
 * The one way this application says no.
 *
 * `abort(422, "Yopilgan buyurtmaga taom qo'shib bo'lmaydi.")` produced a
 * sentence in one language, no code, and a status chosen at the throw site.
 * A Russian cashier read Uzbek, a client could not branch on the reason, and
 * the same condition answered 422 in one controller and 409 in the next.
 *
 * This carries a catalogue code instead. The status, the three sentences and
 * whether a retry could help all come from the catalogue, so they are the
 * same wherever the condition is detected.
 *
 *     throw ApiException::of('order.invalid_transition', meta: [
 *         'from' => $order->status,
 *         'to'   => $target,
 *     ]);
 */
final class ApiException extends RuntimeException
{
    /** @param array<string, mixed> $meta */
    private function __construct(
        public readonly ApiError $error,
        public readonly ?string $field = null,
        public readonly array $meta = [],
        ?Throwable $previous = null,
    ) {
        // The English sentence is the exception message: it is what reaches
        // the log and the stack trace, where a mixed-language team reads it.
        parent::__construct($error->en, $error->status, $previous);
    }

    /** @param array<string, mixed> $meta */
    public static function of(
        string $code,
        ?string $field = null,
        array $meta = [],
        ?Throwable $previous = null,
    ): self {
        return new self(ErrorCatalogue::get($code), $field, $meta, $previous);
    }

    /**
     * A code with a sentence this one throw site needs to make specific —
     * naming the dish that is sold out, the branch that is closed. Everything
     * else still comes from the catalogue, so the code and status stay stable.
     *
     * @param array<string, mixed> $meta
     */
    public static function detailed(
        string $code,
        string $uz,
        string $ru,
        string $en,
        ?string $field = null,
        array $meta = [],
    ): self {
        $base = ErrorCatalogue::get($code);

        return new self(
            new ApiError($base->code, $base->status, $uz, $ru, $en, $base->retryable),
            $field,
            $meta,
        );
    }

    public function render(): JsonResponse
    {
        return ErrorResponse::make($this->error, $this->field, $this->meta);
    }
}
