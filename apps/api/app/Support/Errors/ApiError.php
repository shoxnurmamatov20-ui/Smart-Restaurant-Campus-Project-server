<?php

declare(strict_types=1);

namespace App\Support\Errors;

/**
 * One entry in the error catalogue: a stable code, the HTTP status it answers
 * with, the same sentence in three languages, and whether trying again could
 * possibly help.
 *
 * Three languages rather than one, in the same response, because fourteen
 * surfaces read this API and none of them can translate a hardcoded Uzbek
 * string. The client picks the locale it is rendering; the server does not
 * have to be told which one that is, and a cached response stays correct for
 * every reader.
 *
 * `retryable` is a promise to the client, not a hint. False means the same
 * request will fail the same way forever — a sold-out dish stays sold out —
 * so an offline queue must drop the operation and surface it rather than
 * spinning. True means the failure was transient and replay is safe, which is
 * only ever the case for operations that are idempotent.
 */
final readonly class ApiError
{
    public function __construct(
        public string $code,
        public int $status,
        public string $uz,
        public string $ru,
        public string $en,
        public bool $retryable = false,
    ) {}

    /**
     * The envelope body, without the wrapper.
     *
     * @param array<string, mixed> $meta
     *
     * @return array<string, mixed>
     */
    public function toArray(?string $field = null, array $meta = []): array
    {
        $body = [
            'code' => $this->code,
            'message_uz' => $this->uz,
            'message_ru' => $this->ru,
            'message_en' => $this->en,
        ];

        if ($field !== null) {
            $body['field'] = $field;
        }

        $body['retryable'] = $this->retryable;

        // Context the client needs to act: `from`/`to` on a rejected
        // transition, `attempts_left` on a bad PIN, `balance` on negative
        // stock. It rides alongside the four fixed keys rather than inside
        // them, so a client that does not know a particular code can still
        // render the message.
        return $meta === [] ? $body : [...$body, ...$meta];
    }
}
