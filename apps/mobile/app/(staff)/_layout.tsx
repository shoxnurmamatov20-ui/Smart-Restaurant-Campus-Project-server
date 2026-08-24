import { Stack } from 'expo-router';

import { FlashHost } from '@/crew/flash';
import { useTheme } from '@/lib/theme-context';

/**
 * The staff app's stack, and the one place its toast lives.
 *
 * A stack rather than tabs, even though the app is navigated by a dock: the four
 * slots differ per role — an owner has `branches`, a courier has `route` — so a
 * fixed `<Tabs>` would have to declare the union of all five docks and hide
 * fourteen of them. The dock is drawn by the tab screen itself
 * (`crew/[role]/[tab].tsx`) from `tabsFor(role)`, which is the same table the
 * guard and the web build read.
 *
 * That also keeps the URLs the web build's, segment for segment, so
 * `srcp://crew/manager/approvals` from a push lands where the browser would.
 *
 * `FlashHost` sits above the stack rather than inside a screen, because a
 * confirmation has to outlive the screen that raised it: marking a call done
 * navigates, and the sentence saying so must not leave with the page.
 */
export default function StaffLayout() {
  const c = useTheme();

  return (
    <FlashHost>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          animation: 'slide_from_right',
        }}
      />
    </FlashHost>
  );
}
