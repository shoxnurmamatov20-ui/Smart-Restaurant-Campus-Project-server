# @restaurant/mobile — the native shell

Expo SDK 57 · React Native 0.87 · expo-router. One binary carrying the four
phone surfaces the design draws as separate apps.

## Why this exists, and why it did not before

`Smart Restaurant Sayt va PWA.dc.html` puts a PWA and a native app side by side
and the PWA wins five of six rows — release in thirty seconds, update everyone at
once, one template for forty-two restaurants, no store commission, no download
between a guest and a menu. That argument is still true, the five PWA surfaces
are still shipped, and this shell does not replace them.

What it adds is the row the PWA loses, plus the three things §3 of the old plan
named: push on iOS below 16.4, presence in the stores for a consumer product
(MyPOS competes with apps that are there), and access to the device — the camera
that reads a table's QR code without leaving for a browser.

## What is inside

| Route group         | Surface                                                  | Design file                                 |
| ------------------- | -------------------------------------------------------- | ------------------------------------------- |
| `app/(customer)`    | The customer app — menu, cart, pay, tracking, loyalty    | `Smart Restaurant Mijoz ilovasi.dc.html`    |
| `app/(marketplace)` | MyPOS — stores, cart, tracking, orders                   | `MyPOS Marketplace - Ilova.dc.html`         |
| `app/(staff)`       | The staff app — five roles, their tabs, approvals        | `Smart Restaurant Xodimlar ilovasi.dc.html` |
| `app/(guest)`       | The QR guest — scan a table, order, split the bill, rate | `Smart Restaurant Mehmon.dc.html`           |

`app/index.tsx` asks which of the four. Nothing in the handoff draws that screen
— it is what a single binary costs, where four manifests cost nothing — so it is
four tiles carrying the web manifests' own names and no chrome of its own.

**Telegram is not here.** Its mini app runs inside Telegram's WebView by
definition; a native copy would duplicate something the person already has open.
`(telegram)` stays a web surface.

**The console, the till and the KDS are not here either.** They are desktop and
tablet products, and none of the three reasons above applies to them.

## The rules this app is built to

- **Routes mirror the web, segment for segment.** `/mp/track` here and `/mp/track`
  there are the same screen, so `srcp://mp/track` from a push notification lands
  where the browser would. That is the only reason the two trees look alike.
- **Data and words come from `@restaurant/surfaces`.** No fixture is written
  twice. A dish name, a price, an order-state word and the VAT rate have one
  home, and both builds read it — see that package's README for why.
- **`packages/ui` is never imported.** Those primitives are DOM and Tailwind.
  `src/ui/primitives.tsx` is the native set, and it is deliberately small.
- **`src/theme.ts` is generated** from `packages/ui/src/styles/tokens.css` by
  `pnpm theme`. Never edit it. `theme.test.ts` regenerates into memory and fails
  if the file has fallen behind — a second palette is how a design splits in two,
  and this repo has already paid for that once.
- **Credentials live in `expo-secure-store`**, not `AsyncStorage`: the Keychain
  and the Keystore, because a phone is a device that gets stolen and the web's
  httpOnly cookie has no equivalent here.
- **The API client throws.** `apps/web` returns `null` and falls back to fixtures,
  which is right for a server render mid-restart. A person holding a phone is
  owed "could not reach the restaurant, retry" instead.

## Running it

```bash
pnpm install                 # from the repo root
cd apps/mobile
pnpm theme                   # regenerate src/theme.ts from tokens.css
pnpm start                   # Expo dev server; press i / a, or scan
```

The API is found automatically: `extra.apiBase` from `app.json` in a build, and
in development the Expo host's own address on port 8000 — so a phone on the same
Wi-Fi reaches the Laravel on the laptop without an IP address in a config file.

## Building the APK, and where it goes

The app is handed out from the website — `/download` — not from a store, for
now. A store listing is two to six weeks of review per surface; a link on the
owner's own site is a restaurant owner installing the app during the onboarding
call. Stores can come later and nothing here prevents it.

```bash
srcp-apk            # build, sign, publish to /srv/srcp/shared/downloads/
srcp-apk --no-publish
```

What it needs, once, in the developer's home (never in `/opt`, never as root):

| Path                                               | What                                      | Why here                                                 |
| -------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| `~/.srcp-android/jdk`                              | JDK 17 (Adoptium)                         | AGP 8.12 wants 17; the box has no system Java            |
| `~/.srcp-android/sdk`                              | platform 36, build-tools 36.0.0, NDK 27.1 | the versions RN 0.86's `libs.versions.toml` names        |
| `~/.srcp-android/release.keystore` + `signing.env` | the signing key and its password          | **the one thing that cannot be regenerated** — see below |

The tool regenerates `android/` from `app.json` (`expo prebuild --clean`), so
the native project is never edited by hand; what must survive a regeneration
lives in `plugins/with-release-signing.js`, a config plugin that points the
release build at the key from the environment and lets `srcp-apk` pass a
`versionCode`.

**The key.** Android identifies an app by package name _and_ signing
certificate. A phone that installed an APK signed with key A refuses an update
signed with key B — it is not a warning, the install fails. So the key in
`~/.srcp-android/` is the identity of every copy ever installed from the site,
and the tool refuses to publish an APK not signed with it (it compares the
certificate digest). Back it up somewhere that is not this machine. Losing it
means every installed phone has to uninstall and start over.

**The version code** is the UTC minute since 2026-01-01, so it only ever
increases and two machines cannot collide on the same value within a minute.
The human `version` stays in `app.json`.

**iOS** cannot be done this way: Apple does not allow installing from a website.
iPhone users get the PWA (`/customer`, `/mp`, `/crew` with their own manifests)
until there is a TestFlight or App Store build, and `/download` says exactly
that rather than pretending.

## What is still open

- **Push** needs a device-token table on the Laravel side. The client half is
  installed (`expo-notifications`); the server half is backend work.
- **JetBrains Mono.** Inter and Inter Tight are bundled (`assets/fonts/`,
  `src/fonts.ts`); the mono face `FOUNDATIONS §2` names is not. The design
  applies it 26 times — 22 of them on the guest bill's order number — and the
  figures render in Inter's tabular numerals meanwhile, which is what
  `[data-num]` asks for everywhere else.
- **EAS Build and the two store listings.** Nothing here blocks it; it is a
  release step, and the first review is two to six weeks.

### Five payloads the design draws and the API does not send

Found by auditing the four design files against the app (2026-08-23). Each is a
line the drawing has, the screen leaves out, and no amount of client work can
fill — they need a column, a resource field or an endpoint. The screens say
nothing rather than guessing, which is why none of them is a visible defect
today.

- **A loyalty tier.** `GET /mp/me` answers a points balance and nothing else, so
  the marketplace profile card cannot draw the tier chip the design puts beside
  it.
- **When a stopped dish comes back.** `GET /public/menu` sends `is_stopped` as a
  boolean; the design's menu row says "again at 19:30". The 86 sheet knows the
  answer — `pos.stop_list` carries it — and the public resource does not publish
  it.
- **What is in a dish.** `menu.menu_items` has one `description` column and no
  ingredient list, so the dish sheet draws the design's paragraph and not its
  ingredients card.
- **Where the courier is.** The tracking screen's "3.2 km away" needs
  `courier.position` against the delivery address; `MarketOrderResource`
  publishes neither.
- **One search across everything.** The staff app's search pill wants order,
  table, guest and item in one answer. There is no such endpoint, and the field
  says so rather than opening onto nothing.
