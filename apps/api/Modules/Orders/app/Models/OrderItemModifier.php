<?php

declare(strict_types=1);

namespace Modules\Orders\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Models\Concerns\HasTranslations;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Orders\Database\Factories\OrderItemModifierFactory;

/**
 * What was chosen with a line, as it was at the moment of choosing.
 *
 * No soft deletes and no update path on purpose. This is a record, not a
 * setting: correcting what a guest asked for means voiding the line and ringing
 * it again, which leaves both versions in the audit trail — and "the waiter
 * changed the order after it was sent" is precisely the thing a kitchen argues
 * about.
 *
 * @property-read string|null $title The name in the reader's language
 * @property int $id
 * @property int|null $tenant_id
 * @property int $order_item_id
 * @property int|null $modifier_option_id
 * @property array<string, string> $name
 * @property int $price_delta
 * @property-read OrderItem $line
 *
 * @method static OrderItemModifierFactory factory($count = null, $state = [])
 */
final class OrderItemModifier extends Model
{
    use BelongsToTenant;

    /** @use HasFactory<OrderItemModifierFactory> */
    use HasFactory;

    use HasTranslations;

    protected $table = 'orders.order_item_modifiers';

    /** @var list<string> */
    protected array $translatable = ['name', 'group_name'];

    protected $fillable = [
        'tenant_id',
        'order_item_id',
        'modifier_option_id',
        'modifier_group_id',
        'name',
        'group_name',
        'price_delta',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'name' => 'array',
            'group_name' => 'array',
            'price_delta' => 'integer',
        ];
    }

    /**
     * The name in the reader's language.
     *
     * The same accessor MenuItem and MenuCategory carry. `$translatable` tells
     * HasTranslations which columns hold a `{uz,ru,en}` map; it does not create
     * a property to read one through, which is why three new models resolved
     * every name to an empty string until this was added — the API answered
     * correctly shaped questions with no words in them.
     */
    protected function title(): Attribute
    {
        return Attribute::get(fn (): ?string => $this->translate('name'));
    }

    /**
     * The module's own factory, named explicitly.
     *
     * Laravel resolves `Database\Factories\Modules\...\XFactory` by default,
     * which is not where a module keeps its factories. Every model here says so.
     */
    protected static function newFactory(): OrderItemModifierFactory
    {
        return OrderItemModifierFactory::new();
    }

    /** @return BelongsTo<OrderItem, $this> */
    public function line(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class, 'order_item_id');
    }
}
