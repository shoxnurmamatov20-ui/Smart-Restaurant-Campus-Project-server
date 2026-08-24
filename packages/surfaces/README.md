# @restaurant/surfaces — the phone surfaces' data and words

Five consumer-facing surfaces are drawn twice: once as a route in `apps/web`,
once as a screen in `apps/mobile`. Their **shapes, fixtures, arithmetic and
copy** live here so there is one of each.

That is not tidiness. `apps/web/src/lib/pricing.ts` already carries a warning
about what happens when the same sum is written twice — _«Telefon bitta raqamni,
chek boshqasini ko'rsatsa — kassir aybdor bo'ladi»_ — and a native app is a
second place for exactly that to happen, to every price, every dish name and
every order-state word at once.

## What belongs here

Pure TypeScript. No React, no `next/*`, no DOM, no `fetch`. The rule is
mechanical and `purity.test.ts` enforces it: React Native has no DOM and Metro
does not resolve `next/headers`, so one such import breaks the phone build.

One subpath per file rather than a barrel per surface, on purpose: `crew/data`
and `crew/copy` both export a `TODAY`, and a barrel would have to rename one.
The import a screen writes is the file it means.

| Subpath                                                                        | What                                                                                                                     |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `money`                                                                        | Bill arithmetic — VAT, service, rounding, tips. The mirror of `App\Support\Orders\BillTotals`.                           |
| `customer/data` · `customer/copy`                                              | The customer app: dishes, branches, modifiers, payment rails, the tracking ladder; and its words.                        |
| `mp/data` · `mp/copy`                                                          | MyPOS marketplace: stores, cuisines, commission, delivery windows.                                                       |
| `crew/data` · `crew/copy` · `crew/guard` · `crew/more-data` · `crew/more-copy` | The staff app: five roles, their tabs, the approval queue, the "more" screens, and the role guard both builds consult.   |
| `guest/copy` · `guest/menu-data` · `guest/table-data`                          | The QR guest: the menu board, the table session, the words.                                                              |
| `tg/data` · `tg/copy`                                                          | The Telegram mini app. Web only — Telegram is its own shell — but it shares the customer's dishes and lives beside them. |

## What does not

Anything that renders, fetches, or reads a cookie. Those stay beside their
screens: `*-server.ts` in `apps/web`, the API client in `apps/mobile`. A screen
is allowed to differ between a browser and a phone — a total is not.
