import { cookies, headers } from 'next/headers';

import { customerLang, langCookie } from '../../customer-session';
import { SignInBoard } from './sign-in-board';

/** Never indexed: a sign-in form is not something to find in a search result. */
export const metadata = { robots: { index: false, follow: false } };

export default async function CustomerSignInPage() {
  const lang = customerLang((await headers()).get('accept-language'), langCookie(await cookies()));

  return <SignInBoard lang={lang} />;
}
