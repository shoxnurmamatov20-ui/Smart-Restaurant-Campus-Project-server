import { SignInForm } from './sign-in-form';

/**
 * The platform console's sign-in.
 *
 * Everything around the card — the mark, the measure, the language, the
 * `noindex` — belongs to the (auth) layout, so this file says only which card.
 */
export default function AdminLoginPage() {
  return <SignInForm />;
}
