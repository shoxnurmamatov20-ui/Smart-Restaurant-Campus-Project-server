/**
 * User shapes shared by web, admin and the SDK.
 *
 * `UserRole` must stay in sync with
 * apps/api/database/seeders/RolesAndPermissionsSeeder.php.
 */

export type UserRole =
  | 'super-admin'
  | 'owner'
  | 'brand-manager'
  | 'branch-manager'
  | 'chef'
  | 'cook'
  | 'waiter'
  | 'bartender'
  | 'cashier'
  | 'host'
  | 'courier'
  | 'storekeeper'
  | 'accountant'
  | 'marketer'
  | 'guest';

export type UserStatus = 'active' | 'inactive' | 'pending' | 'suspended' | 'archived';

/**
 * A user, as `App\Http\Resources\UserResource` actually returns one.
 *
 * This type used to describe a different, richer user than the API has:
 * `first_name`/`last_name`/`full_name` where the server sends one `name`, a
 * `status` enum where it sends `is_active`, plus `username`, `avatar_url`,
 * `two_factor_enabled`, `timezone` and `updated_at` that it does not send at
 * all. `id` was a string; it is an integer.
 *
 * None of that failed a build, because a type nobody compares against the wire
 * is just a document — and a wrong one is worse than none, since code written
 * against it compiles and then reads `undefined` at runtime. Reading
 * `user.name` was a type error while `user.full_name` would have compiled and
 * been empty.
 *
 * So this now mirrors UserResource field for field. If the resource grows a
 * field, add it here; if this grows one the resource does not send, the next
 * person will trust it.
 */
export type User = {
  id: number;
  /** One field. Uzbek names are not reliably first/last, and the API agrees. */
  name: string;
  email: string;
  phone: string | null;
  locale: 'uz' | 'ru' | 'en';
  is_active: boolean;
  /** `null` for the platform operator, who belongs to no restaurant. */
  tenant_id: number | null;
  /** Only present when the API eager-loaded it — `whenLoaded('tenant')`. */
  tenant?: {
    id: number;
    name: string;
    slug: string;
    locale: string;
    timezone: string;
  } | null;
  /** Spatie role names. The platform's fifteen, not the design's eight. */
  roles: UserRole[];
  last_login_at?: string | null;
  created_at?: string | null;
};

export type AuthSession = {
  user: User;
  token?: string;
  expires_at: string;
};

export type LoginPayload = {
  email: string;
  password: string;
  remember?: boolean;
  two_factor_code?: string;
};

export type RegisterPayload = {
  email: string;
  password: string;
  password_confirmation: string;
  first_name: string;
  last_name: string;
  locale?: 'uz' | 'ru' | 'en';
};
