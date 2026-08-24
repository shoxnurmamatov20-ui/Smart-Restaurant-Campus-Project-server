<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\Logging\TelegramAlertHandler;
use Illuminate\Support\Facades\Http;
use Monolog\Level;
use Monolog\Logger;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The operations-chat log channel: narrow, and never the thing that fails.
 */
final class TelegramAlertHandlerTest extends TestCase
{
    #[Test]
    public function it_sends_critical_and_ignores_everything_below(): void
    {
        Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);

        $logger = new Logger('t', [new TelegramAlertHandler('tok', '-100', Level::Critical)]);

        $logger->error('not sent');
        $logger->critical('sent');

        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => str_contains((string) $request['text'], 'sent')
            && $request['chat_id'] === '-100');
    }

    #[Test]
    public function it_is_silent_without_a_token(): void
    {
        Http::fake();

        (new Logger('t', [new TelegramAlertHandler(null, null)]))->critical('x');

        Http::assertNothingSent();
    }

    #[Test]
    public function it_swallows_a_failing_network_rather_than_breaking_the_request(): void
    {
        Http::fake(fn () => throw new \RuntimeException('telegram is down'));

        $logger = new Logger('t', [new TelegramAlertHandler('tok', '-100')]);

        // No exception escapes: the log line still reaches the file handlers.
        $logger->critical('x');

        $this->assertTrue(true);
    }
}
