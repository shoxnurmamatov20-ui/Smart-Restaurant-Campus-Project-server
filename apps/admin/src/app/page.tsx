import { redirect } from 'next/navigation';

/**
 * Root URL — redirect to the admin dashboard. The (admin) layout enforces
 * super-admin role (will bounce to /login if missing).
 */
export default function RootPage(): never {
  redirect('/dashboard');
}
