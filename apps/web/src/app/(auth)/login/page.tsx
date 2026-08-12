import { SignInPanel } from '@/components/sign-in-panel';

/**
 * The real sign-in.
 *
 * The same card the marketing site shows, in `live` mode: three tabs, and the
 * email door actually calls Sanctum. See src/components/sign-in-panel.tsx for
 * why one component serves both and why only that door is wired.
 *
 * Everything around it — the mark, the measure, the language — is the (auth)
 * layout's, so this file stays what it should be: the statement that /login is
 * the sign-in panel and nothing else.
 */
export default function LoginPage() {
  return <SignInPanel live />;
}
