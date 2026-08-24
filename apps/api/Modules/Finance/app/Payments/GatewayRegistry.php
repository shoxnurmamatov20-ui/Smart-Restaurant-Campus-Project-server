<?php

declare(strict_types=1);

namespace Modules\Finance\Payments;

use App\Contracts\Finance\PaymentGateway;
use App\Contracts\Finance\PaymentGateways;
use Illuminate\Contracts\Container\Container;
use Modules\Finance\Services\OnlinePaymentLedger;
use RuntimeException;

/**
 * Which rails this installation can actually take money through.
 *
 * Built once per request and cached in the container, because `available()` is
 * asked on every checkout render for every provider and it reads configuration
 * that cannot change mid-request.
 *
 * ---------------------------------------------------------------------------
 * Order is a product decision, not an implementation detail
 *
 * `ORDER` is the order the buttons are drawn in, and it matches the design's own
 * rail list (`(site)/venue-data.ts`: card · click · payme · cash). A registry
 * that returned providers in whatever order `config()` happened to hash them
 * would reshuffle a checkout between deploys, and the button a guest reaches for
 * without looking would move.
 *
 * ---------------------------------------------------------------------------
 * A provider with no keys is listed by `all()` and hidden by `enabled()`
 *
 * That split is the entire reason both methods exist. A guest must never see a
 * button that fails after they have committed; an owner asking "why is Payme not
 * on my site" must see it listed and switched off, with a reason. The console
 * reads `all()`, every guest surface reads `enabled()`, and nothing reads the
 * container directly.
 */
final class GatewayRegistry implements PaymentGateways
{
    /**
     * Drawn in this order, and unknown names are appended after them.
     *
     * `sandbox` is last on purpose: on the one machine where it exists it is a
     * development affordance, not the rail a person should reach for first.
     *
     * @var array<int, string>
     */
    private const ORDER = ['click', 'payme', 'uzum', 'sandbox'];

    /** @var array<string, PaymentGateway>|null */
    private ?array $drivers = null;

    public function __construct(private readonly Container $container) {}

    /** @return array<int, PaymentGateway> */
    public function enabled(): array
    {
        return array_values(array_filter(
            $this->all(),
            static fn (PaymentGateway $gateway): bool => $gateway->available(),
        ));
    }

    /** @return array<int, PaymentGateway> */
    public function all(): array
    {
        return array_values($this->resolved());
    }

    public function driver(string $provider): PaymentGateway
    {
        $drivers = $this->resolved();

        if (! isset($drivers[$provider])) {
            throw new RuntimeException("Noma'lum to'lov provayderi: {$provider}");
        }

        return $drivers[$provider];
    }

    public function isEnabled(string $provider): bool
    {
        $drivers = $this->resolved();

        return isset($drivers[$provider]) && $drivers[$provider]->available();
    }

    /**
     * Build every driver this build knows about.
     *
     * Including the ones with no credentials, and that is deliberate: a callback
     * from a provider whose keys were rotated out an hour ago still has to be
     * answered in that provider's own protocol, and a registry that refused to
     * construct the driver would answer a bank with an HTML error page.
     *
     * @return array<string, PaymentGateway>
     */
    private function resolved(): array
    {
        if ($this->drivers !== null) {
            return $this->drivers;
        }

        $drivers = [];

        foreach (self::ORDER as $name) {
            $driver = $this->make($name);

            if ($driver !== null) {
                $drivers[$name] = $driver;
            }
        }

        return $this->drivers = $drivers;
    }

    private function make(string $name): ?PaymentGateway
    {
        $config = (array) config("services.payments.{$name}", []);
        $ledger = $this->container->make(OnlinePaymentLedger::class);

        return match ($name) {
            'payme' => new PaymeGateway(
                ledger: $ledger,
                merchantId: $this->string($config, 'merchant_id'),
                key: $this->string($config, 'key'),
                checkoutUrl: (string) ($config['checkout_url'] ?? 'https://checkout.paycom.uz'),
                accountField: (string) ($config['account_field'] ?? 'order_id'),
                enabled: (bool) ($config['enabled'] ?? true),
            ),
            'click' => new ClickGateway(
                ledger: $ledger,
                serviceId: $this->string($config, 'service_id'),
                merchantId: $this->string($config, 'merchant_id'),
                merchantUserId: $this->string($config, 'merchant_user_id'),
                secretKey: $this->string($config, 'secret_key'),
                checkoutUrl: (string) ($config['checkout_url'] ?? 'https://my.click.uz/services/pay'),
                apiUrl: (string) ($config['api_url'] ?? 'https://api.click.uz/v2/merchant'),
                enabled: (bool) ($config['enabled'] ?? true),
            ),
            'uzum' => new UzumGateway(
                ledger: $ledger,
                merchantId: $this->string($config, 'merchant_id'),
                serviceId: $this->string($config, 'service_id'),
                secretKey: $this->string($config, 'secret_key'),
                checkoutUrl: (string) ($config['checkout_url'] ?? 'https://www.uzumbank.uz/open-service'),
                enabled: (bool) ($config['enabled'] ?? false),
            ),
            /*
             * The sandbox is not built at all outside development.
             *
             * Its constructor throws in production — a rail that marks bills paid
             * with no money behind it is the worst failure this subsystem has —
             * and a registry that constructed it anyway would take the whole
             * application down at boot rather than simply not offering it. The
             * refusal belongs at the switch, not at the boot.
             */
            'sandbox' => app()->environment('production') ? null : new SandboxGateway(
                ledger: $ledger,
                enabled: (bool) ($config['enabled'] ?? false),
                production: false,
            ),
            default => null,
        };
    }

    /**
     * A configuration value that is only useful when it is a non-empty string.
     *
     * `env()` returns `''` for a variable that is present and blank, and an empty
     * merchant id is exactly as unusable as a missing one — but it is truthy
     * enough to pass a careless check and produce a checkout URL with `m=` in it.
     *
     * @param array<string, mixed> $config
     */
    private function string(array $config, string $key): ?string
    {
        $value = $config[$key] ?? null;

        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }
}
