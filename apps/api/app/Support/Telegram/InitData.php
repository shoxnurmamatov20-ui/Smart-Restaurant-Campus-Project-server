<?php

declare(strict_types=1);

namespace App\Support\Telegram;

/**
 * Telegram's signed `initData`, checked.
 *
 * The mini app runs inside Telegram's own WebView and is handed a query
 * string signed with the bot's token: the parameters, sorted, joined by
 * newlines, HMAC-SHA256'd under a key derived from the token. Anyone can put
 * a Telegram URL in a browser and type any user id they like into it — the
 * signature is the only thing that says the person holding the phone is the
 * person the payload names, and this is where it is checked.
 *
 * Nothing here reaches out: verification is arithmetic over the string and
 * the restaurant's own bot token, which the platform already stores encrypted
 * (`telegram.bots.encrypted_token`). No Telegram API call, no network, no key
 * from anybody's contract.
 *
 * `auth_date` is checked too. A signature does not expire on its own, so a
 * screenshot of somebody's initData would be a permanent credential without
 * this — the window is deliberately short and the reason is that a mini app
 * opens with a fresh one every time.
 */
final readonly class InitData
{
    /** How old a payload may be. Telegram's own guidance is "a day at most". */
    public const MAX_AGE_SECONDS = 86400;

    private function __construct(
        public int $userId,
        public ?string $firstName,
        public ?string $lastName,
        public ?string $username,
        public ?string $languageCode,
        public int $authDate,
    ) {}

    /**
     * Verify and parse, or null when the payload is not from this bot.
     *
     * Null rather than an exception for every failure the caller answers the
     * same way — a forged, stale or malformed payload is one refusal to the
     * screen, and telling the difference in the response would tell a forger
     * which half they got right.
     */
    public static function verify(string $initData, string $botToken, ?int $now = null): ?self
    {
        parse_str($initData, $fields);

        $hash = $fields['hash'] ?? null;
        unset($fields['hash'], $fields['signature']);

        if (! is_string($hash) || $hash === '' || $fields === []) {
            return null;
        }

        ksort($fields);

        $checkString = implode("\n", array_map(
            static fn (string $key): string => $key.'='.(is_string($fields[$key]) ? $fields[$key] : json_encode($fields[$key])),
            array_keys($fields),
        ));

        // The secret is derived from the token, not the token itself — this
        // is the step Telegram's spec is explicit about and the one an
        // implementation gets wrong quietly.
        $secret = hash_hmac('sha256', $botToken, 'WebAppData', true);
        $expected = hash_hmac('sha256', $checkString, $secret);

        if (! hash_equals($expected, $hash)) {
            return null;
        }

        $authDate = (int) ($fields['auth_date'] ?? 0);
        $now ??= time();

        if ($authDate <= 0 || $now - $authDate > self::MAX_AGE_SECONDS) {
            return null;
        }

        $user = json_decode(is_string($fields['user'] ?? null) ? $fields['user'] : '', true);

        if (! is_array($user) || ! isset($user['id']) || ! is_numeric($user['id'])) {
            return null;
        }

        $text = static fn (string $key): ?string => isset($user[$key]) && is_string($user[$key]) && $user[$key] !== ''
            ? $user[$key]
            : null;

        return new self(
            userId: (int) $user['id'],
            firstName: $text('first_name'),
            lastName: $text('last_name'),
            username: $text('username'),
            languageCode: $text('language_code'),
            authDate: $authDate,
        );
    }

    /** The name to greet them by, or null when Telegram sent none. */
    public function displayName(): ?string
    {
        $parts = array_filter([$this->firstName, $this->lastName]);

        return $parts === [] ? ($this->username === null ? null : '@'.$this->username) : implode(' ', $parts);
    }
}
