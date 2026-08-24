<?php

declare(strict_types=1);

namespace App\Http\Requests\Platform;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * The owner's own details, as an operator corrects them on a call.
 *
 * Three fields and no more. Not the role, not the tenant, not `is_active` — a
 * screen that can change which restaurant an account belongs to is one mistake
 * away from moving somebody's login into another business.
 *
 * **The email is the login, which is why it is here at all.** A restaurant is
 * onboarded with the address the operator heard on the phone, and a typo in it
 * is not a cosmetic defect: nobody can sign in, `/forgot-password` cannot help
 * because this deployment runs `MAIL_MAILER=log`, and until now the only fix
 * was to create the restaurant again.
 *
 * Unique across the whole platform, ignoring this account. The column's own
 * constraint is `unique(tenant_id, email)`, which permits the same address in
 * two businesses — and `AuthController::login` has already had to be taught to
 * weigh a password against every candidate because of exactly that. Letting an
 * operator create a second one deliberately would make that worse, not better.
 */
final class UpdateOwnerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:160'],
            'email' => [
                'sometimes',
                'required',
                'email',
                'max:190',
                Rule::unique('users', 'email')->ignore($this->ownerId()),
            ],
            // Nullable rather than absent: clearing a wrong number is a thing an
            // operator has to be able to do, and `''` from a form field means
            // "empty" rather than "leave it alone".
            'phone' => ['sometimes', 'nullable', 'string', 'max:32', 'regex:/^\+?[0-9]{9,15}$/'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'email.unique' => __('Bu pochta manzili platformada allaqachon band.'),
            'phone.regex' => __('Telefon raqami +998901234567 shaklida bo\'lishi kerak.'),
        ];
    }

    /**
     * The account being edited, so `unique` does not refuse its own address.
     *
     * Resolved from the route's tenant rather than taken from the body: an id in
     * the body would be an operator-supplied key deciding which row the
     * uniqueness check steps over, which is the whole check.
     */
    private function ownerId(): ?int
    {
        $tenant = $this->route('tenant');

        /*
         * `instanceof`, not `property_exists`.
         *
         * An Eloquent attribute is not a declared property — it lives in
         * `$attributes` and arrives through `__get` — so `property_exists($tenant,
         * 'id')` is false on a model that plainly has an id. Written that way
         * first, this returned null for every request: `unique` then stepped over
         * nobody, and an operator correcting a phone number while leaving the
         * address alone was refused for colliding with their own row. The test
         * named it before production ever saw it.
         */
        if (! $tenant instanceof Tenant) {
            return null;
        }

        return User::query()
            ->where('tenant_id', $tenant->id)
            ->whereHas('roles', fn ($roles) => $roles->where('name', 'owner'))
            ->orderBy('id')
            ->value('id');
    }
}
