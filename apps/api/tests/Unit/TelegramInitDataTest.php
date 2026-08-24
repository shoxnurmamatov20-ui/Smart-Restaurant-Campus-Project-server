<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\Telegram\InitData;
use PHPUnit\Framework\TestCase;

/**
 * The only thing standing between "the person holding the phone" and "any id
 * somebody typed into a URL" is this signature.
 */
final class TelegramInitDataTest extends TestCase
{
    private const TOKEN = '123456:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';

    /** Sign a payload the way Telegram does, so the test proves the algorithm. */
    private function sign(array $fields, string $token = self::TOKEN): string
    {
        ksort($fields);

        $check = implode("\n", array_map(
            static fn (string $key): string => $key.'='.$fields[$key],
            array_keys($fields),
        ));

        $secret = hash_hmac('sha256', $token, 'WebAppData', true);
        $fields['hash'] = hash_hmac('sha256', $check, $secret);

        return http_build_query($fields);
    }

    private function payload(array $over = []): array
    {
        return array_merge([
            'auth_date' => (string) time(),
            'query_id' => 'AAF_test',
            'user' => json_encode([
                'id' => 8_123_456,
                'first_name' => 'Dilnoza',
                'last_name' => 'Yusupova',
                'username' => 'dilnoza',
                'language_code' => 'uz',
            ]),
        ], $over);
    }

    public function test_it_accepts_what_the_bot_signed(): void
    {
        $data = InitData::verify($this->sign($this->payload()), self::TOKEN);

        $this->assertNotNull($data);
        $this->assertSame(8_123_456, $data->userId);
        $this->assertSame('Dilnoza Yusupova', $data->displayName());
        $this->assertSame('uz', $data->languageCode);
    }

    public function test_it_refuses_a_payload_signed_by_another_bot(): void
    {
        // The forger's own bot: a real Telegram signature, wrong restaurant.
        $forged = $this->sign($this->payload(), '999999:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');

        $this->assertNull(InitData::verify($forged, self::TOKEN));
    }

    public function test_it_refuses_a_payload_edited_after_signing(): void
    {
        $signed = $this->sign($this->payload());
        parse_str($signed, $fields);
        $fields['user'] = json_encode(['id' => 1, 'first_name' => 'Somebody Else']);

        $this->assertNull(InitData::verify(http_build_query($fields), self::TOKEN));
    }

    public function test_it_refuses_yesterdays_screenshot(): void
    {
        $stale = $this->sign($this->payload(['auth_date' => (string) (time() - InitData::MAX_AGE_SECONDS - 60)]));

        $this->assertNull(InitData::verify($stale, self::TOKEN));
    }

    public function test_it_refuses_a_payload_with_no_signature_or_no_user(): void
    {
        $this->assertNull(InitData::verify('auth_date=1&user=%7B%22id%22%3A1%7D', self::TOKEN));
        $this->assertNull(InitData::verify($this->sign(['auth_date' => (string) time()]), self::TOKEN));
        $this->assertNull(InitData::verify('', self::TOKEN));
    }
}
