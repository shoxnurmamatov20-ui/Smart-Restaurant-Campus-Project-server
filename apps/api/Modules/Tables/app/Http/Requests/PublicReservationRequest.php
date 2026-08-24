<?php

declare(strict_types=1);

namespace Modules\Tables\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A guest booking a table from the restaurant's own website.
 *
 * The staff form's public twin, and shorter on purpose. Four of its fields are
 * simply not a guest's to set:
 *
 *   `restaurant_table_id` — a guest does not choose which table. The
 *   restaurant seats them, and a form that let somebody claim table 12 for
 *   Friday would be a form that lets somebody hold every table for Friday.
 *
 *   `status` — every public booking arrives `pending`. Confirming is a person
 *   looking at a diary, and a request that could arrive `confirmed` would be a
 *   booking nobody agreed to.
 *
 *   `source` — stamped `web` by the controller. A field a client fills in is a
 *   field that says whatever the client likes, and the whole value of this
 *   column is telling a manager where a booking came from.
 *
 *   `ends_at` — the restaurant decides how long a table is held.
 *
 * What is left is the four things only the guest knows: who, which number to
 * ring, how many of them, and when.
 */
final class PublicReservationRequest extends FormRequest
{
    /** Anonymous by design — see the route. Tenancy is what scopes it. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'guest_name' => ['required', 'string', 'min:2', 'max:120'],

            /*
             * A phone number, loosely. Not a regex against +998: this platform
             * is written for a country and built for several, and a booking
             * refused because a Kazakh number has the wrong prefix is a guest
             * who eats somewhere else. The restaurant rings it; a person is the
             * validator that matters.
             */
            'guest_phone' => ['required', 'string', 'min:7', 'max:32'],

            /*
             * Twenty, not two hundred.
             *
             * The staff form allows 200 because a manager books a wedding. A
             * party of eighty arriving through a web form with nobody spoken to
             * is not a booking, it is a problem — and the copy on the site says
             * to call for a large group.
             */
            'guests_count' => ['required', 'integer', 'min:1', 'max:20'],

            'starts_at' => ['required', 'date', 'after:now', 'before:+90 days'],

            /*
             * Which venue. Accepted now, and it used to be smuggled in the note.
             *
             * The booking form has drawn a branch chooser since it was designed
             * (`dc.html:536-548`) and had nowhere to send the answer, so it
             * wrote "Filial: Sergeli" into `note` and said why: *"That is not a
             * foreign key and nothing will ever query it; it is the difference
             * between a person reading it and a guest's choice being silently
             * dropped on the way to the diary."*
             *
             * Optional, and that is the same narrow exception the ordering
             * endpoint makes: a restaurant with ONE venue has no choice to make,
             * and requiring the id there would mean the site has to discover a
             * number before it can book. A chain is different, and the controller
             * refuses rather than guessing — a family standing in the wrong
             * doorway is what "the first one" costs.
             *
             * Checked against the restaurant in the controller; an `exists:`
             * rule cannot express "and it is this tenant's, and it is open".
             */
            'branch_id' => ['nullable', 'integer', 'min:1'],

            'note' => ['nullable', 'string', 'max:500'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'starts_at.after' => "Bron vaqti o'tmishda bo'lishi mumkin emas.",
            'starts_at.before' => "Bron uch oydan uzoqqa qo'yilmaydi — telefon qiling.",
            'guest_phone.required' => 'Telefon raqami majburiy — bronni tasdiqlash uchun kerak.',
            'guests_count.max' => "Katta guruh uchun restoranga qo'ng'iroq qiling.",
        ];
    }
}
