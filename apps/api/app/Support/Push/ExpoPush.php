<?php

declare(strict_types=1);

namespace App\Support\Push;

use App\Models\PushToken;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Sends through Expo's push service, which fans out to APNs and FCM.
 *
 * One HTTP API for both platforms is the reason the app registers Expo tokens
 * rather than raw device tokens: there is no APNs certificate to rotate and no
 * FCM server key to guard, only the access token Expo issues for the project
 * (`EXPO_ACCESS_TOKEN`), and sending works without even that for a project
 * that has not enabled enhanced security.
 *
 * Batched at a hundred — Expo's limit per request — and every receipt is
 * read: a `DeviceNotRegistered` answer marks the token invalid so the next
 * send skips it, instead of retrying an uninstalled app forever.
 */
final class ExpoPush
{
    private const ENDPOINT = 'https://exp.host/--/api/v2/push/send';

    private const BATCH = 100;

    /**
     * @param  Collection<int, PushToken>  $tokens
     * @param  array<string, mixed>  $data  Rides along to the app; `url` is what the tap opens.
     * @return int how many messages Expo accepted
     */
    public function send(Collection $tokens, string $title, string $body, array $data = []): int
    {
        $live = $tokens->filter(fn (PushToken $token) => $token->invalidated_at === null)->values();

        if ($live->isEmpty()) {
            return 0;
        }

        $accepted = 0;

        foreach ($live->chunk(self::BATCH) as $chunk) {
            $messages = $chunk->map(fn (PushToken $token) => [
                'to' => $token->token,
                'title' => $title,
                'body' => $body,
                'data' => $data,
                'sound' => 'default',
                'priority' => 'high',
            ])->values()->all();

            $request = Http::timeout(10)->acceptJson()->asJson();

            if (($accessToken = config('services.expo.access_token')) !== null && $accessToken !== '') {
                $request = $request->withToken((string) $accessToken);
            }

            $response = $request->post(self::ENDPOINT, $messages);

            if (! $response->ok()) {
                Log::warning('expo push refused a batch', ['status' => $response->status()]);

                continue;
            }

            /** @var list<array{status: string, message?: string, details?: array{error?: string}}> $tickets */
            $tickets = $response->json('data', []);

            foreach ($tickets as $index => $ticket) {
                $token = $chunk->values()->get($index);

                if ($token === null) {
                    continue;
                }

                if ($ticket['status'] === 'ok') {
                    $accepted++;

                    continue;
                }

                // The one error worth acting on. The others — rate limits, a
                // malformed message — are ours to fix, not the phone's.
                if (($ticket['details']['error'] ?? '') === 'DeviceNotRegistered') {
                    $token->forceFill(['invalidated_at' => now()])->save();
                }
            }
        }

        return $accepted;
    }
}
