<?php

declare(strict_types=1);

namespace Modules\Crm\Events;

use App\Support\Events\DomainEvent;
use Illuminate\Database\Eloquent\Model;
use Modules\Crm\Models\Lead;

/**
 * Somebody filled in the contact form and is waiting for a call.
 *
 * On the event bus rather than a direct notification, and the reason is the
 * list of things that eventually want to hear about it: an operator's screen, a
 * Telegram message to whoever is on sales this week, a row in the platform
 * console, an email. Wiring the form to any one of those makes the form's
 * controller know about it; publishing means the form's controller knows about
 * nothing and every one of them can be added later without touching this
 * module.
 *
 * ---------------------------------------------------------------------------
 * The message is not in the payload
 *
 * Ids and the two facts a subscriber needs to decide urgency — the name and the
 * restaurant. Whoever acts on this reads the row. The enquiry text is free-form
 * input from a stranger, it can be two thousand characters, and it would travel
 * into every subscriber's log and every Telegram message body.
 */
final class LeadCaptured extends DomainEvent
{
    public function __construct(private readonly Lead $lead) {}

    public function name(): string
    {
        return 'crm.lead_captured';
    }

    /**
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        return [
            'lead_id' => $this->lead->getKey(),
            'name' => $this->lead->name,
            'phone' => $this->lead->phone,
            'restaurant' => $this->lead->restaurant,
            'city' => $this->lead->city,
            'source' => $this->lead->source,
        ];
    }

    public function aggregate(): Model
    {
        return $this->lead;
    }

    public function tenantId(): ?int
    {
        return $this->lead->tenant_id;
    }
}
