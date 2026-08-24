<?php

declare(strict_types=1);

namespace Modules\Finance\Console;

use App\Support\Tenancy\DatabaseTenancy;
use Illuminate\Console\Command;
use Modules\Finance\Models\FiscalReceipt;
use Modules\Finance\Services\FiscalRegistrar;

/**
 * Files whatever the fiscal queue is still holding.
 *
 * `FiscalRegistrar` already tries to file straight after the sale commits, so on
 * a healthy evening this finds nothing. It exists for the unhealthy ones: the
 * tax service down for an hour, a worker killed mid-request, a restaurant that
 * traded all day before its OFD was configured. Without it the queue would be a
 * log rather than a guarantee — the same reason `events:relay` exists.
 *
 * It also closes windows. A document whose deadline passed while it was waiting
 * for its next retry would otherwise sit un-expired for hours after it became a
 * liability, and the whole point of the window is that somebody finds out.
 *
 * Cross-tenant by nature: it sweeps every restaurant on the node, so it runs
 * inside `withoutTenancy()` — with row-level security live, a command that
 * claimed no tenant would see nothing at all and report a beautifully empty
 * queue no matter how large the backlog.
 */
final class RelayFiscalReceipts extends Command
{
    protected $signature = 'fiscal:relay
                            {--limit=200 : How many documents to attempt in one pass}';

    protected $description = 'File pending fiscal receipts and close expired windows';

    public function handle(FiscalRegistrar $registrar, DatabaseTenancy $tenancy): int
    {
        $limit = max(1, (int) $this->option('limit'));

        $result = $tenancy->withoutTenancy(fn (): array => $registrar->relayPending($limit));

        if ($result['filed'] > 0) {
            $this->info("Fiskallashtirildi: {$result['filed']} ta hujjat.");
        }

        if ($result['pending'] > 0) {
            $this->line("Navbatda: {$result['pending']} ta hujjat qayta urinishni kutmoqda.");
        }

        $expired = $tenancy->withoutTenancy(
            static fn (): int => FiscalReceipt::query()->where('status', 'expired')->count(),
        );

        if ($expired > 0) {
            /*
             * Loud, and a non-zero exit.
             *
             * These are meals that were sold and never declared. Everything else
             * in this module is arranged so a dead fiscal service never blocks a
             * sale; the price of that is that an expired document has to be
             * impossible to miss, or the deferral becomes a quiet way of never
             * filing anything.
             */
            $this->error("Diqqat: {$expired} ta chek fiskallashtirilmadi va oyna yopildi.");

            $this->table(
                ['id', 'hisob', 'summa', 'urinish', 'xato'],
                $tenancy->withoutTenancy(static fn (): array => FiscalReceipt::query()
                    ->where('status', 'expired')->orderByDesc('id')->limit(20)->get()
                    ->map(static fn (FiscalReceipt $r): array => [
                        $r->id,
                        $r->order_number ?? '—',
                        number_format($r->total / 100, 0, '.', ' ').' so\'m',
                        $r->attempts,
                        mb_strimwidth((string) $r->last_error, 0, 60, '…'),
                    ])->all()),
            );

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
