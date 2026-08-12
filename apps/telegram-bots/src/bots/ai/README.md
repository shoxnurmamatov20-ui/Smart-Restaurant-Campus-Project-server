# AI bot handlers

Bots that delegate to `apps/ai-services` for ML/LLM work.

## Keys

| Key       | Audience | Backend                                                                 |
| --------- | -------- | ----------------------------------------------------------------------- |
| `menu_ai` | Mehmon   | `apps/ai-services` `/chatbot` — dish recommendations over the live menu |

## Flow

1. Bot receives the guest's message ("yengilroq, achchiq bo'lmagan narsa").
2. Forwards it to Laravel `/api/v1/bots/{key}/ai/...`.
3. Laravel calls `apps/ai-services` over internal HTTP, passing the tenant's
   current orderable menu, the guest's allergens and their past orders.
4. The AI service returns suggestions → Laravel → bot → guest.

Laravel stays in the middle on purpose: it is the only component that knows
which restaurant the chat belongs to and which dishes are actually sellable
right now. Sending a guest a dish that is on the stop-list is worse than not
answering at all.

Keep prompts in `src/bots/ai/<key>.py` (NOT inside ai-services) so the bot's
personality is versioned with the bot, not with the model server.
