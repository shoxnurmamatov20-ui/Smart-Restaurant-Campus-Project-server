# Changelog

All notable changes to Smart Restaurant Campus will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 🔓 Added — The operator can read back the password the platform issued (2026-08-24)

Two hundred calls a day, all the same one: "what was my password?" The console
had no answer, so an operator went to the database — where there is nothing to
find, because `users.password` is bcrypt and a hash does not go backwards. The
same password hashes differently every time; that is the point of it.

So a second, narrower fact is stored on purpose: **the value this platform handed
over**. Not a decryption of the hash, which remains impossible — a record of what
was issued, which the platform is entitled to keep about a credential it issued
itself.

- `users.issued_password`, cast `encrypted`, written by `TenantProvisioner` when
  a restaurant is created and by `resetOwnerPassword` when one is reissued.
  `issued_password_at` rides alongside so the card can print the age.
- `GET /platform/tenants/{tenant}/owner-password` reads it back, behind
  `super-admin`, and **every read is logged with the operator's identity**. Who
  looked at which restaurant's password, and when, is answerable.
- The card gets a "Show password" button, the value in the same large monospace
  the issued one gets, and the age beneath it. Four months old is a password the
  owner has probably changed, and an operator should hear that before reading it
  down a phone line.

**What keeps it honest is the clearing rule.** `User::booted()` nulls both
columns on any password change that did not come from the platform — the owner's
own, a reset from anywhere else. A stale credential shown as current is worse
than none: the operator reads it out, it does not work, and the screen loses its
credibility for every restaurant, including the ones where it was right. Proved
by mutation: delete the guard and
`test_an_owner_changing_their_own_password_clears_the_stored_copy` fails.

**What keeps it contained** is three things, none optional: encrypted at rest, so
a database dump is worth nothing without `APP_KEY`; `super-admin` only; and
`#[Hidden]` on the model, asserted against the tenant list, the owner PATCH and
the owner's own `/auth/me` — because the danger is never the endpoint that means
to return it, it is every other serialisation quietly carrying it along.

**It only knows about passwords issued from here on.** Restaurants onboarded
before this migration have nothing stored, and the panel says so in a sentence
rather than drawing an empty box: issue a new one, and from then on it is
readable.

_This does not reduce the two hundred calls — it makes each one shorter. What
removes them is letting an owner reset their own password, which needs either the
Eskiz key (SMS), an SMTP host (email), or the Telegram bot that is already live
and needs no key at all._

### 🔑 Added — The operator can set the owner's credentials, not only mint them (2026-08-24)

Restaurant owners ring the platform and ask two things: "send me my email and
password", and "change it to this one". Neither had an answer on this screen.

- **The address a restaurant signs in with is editable.**
  `PATCH /platform/tenants/{tenant}/owner`, and the tenant card edits it in
  place. It was previously a copy button and nothing else, which meant a typo
  taken down on a phone call was a business that could not sign in at all —
  `/forgot-password` needs a mailer and this deployment runs `MAIL_MAILER=log`,
  so the only repair was to onboard the restaurant a second time and leave the
  first one sitting there. Unique across the whole platform, ignoring the row
  being edited.
- **Deliberately not the same door as the password.** Issuing a credential ends
  every session that account has open; correcting an address does not, and the
  test asserts the surviving token rather than trusting the split. An operator
  fixing a phone number must not sign the owner out of the till they are
  standing at.
- **A password may now be chosen.** `POST .../owner-password` takes an optional
  one, and the new-restaurant sheet has a field for the first one. This reverses
  a decision, so the reasoning is worth stating: it used to generate and only
  generate, on the argument that an operator who _can_ choose will reuse one weak
  string across every restaurant. Right about the risk, wrong about the remedy —
  the case it blocked is the ordinary one, and the alternative was an operator
  reading sixteen random characters down a phone line, which is how a password
  ends up on a sticky note on the till. `Password::min(12)->letters()->numbers()`
  refuses the weak repeat without refusing the request, and three data-provider
  cases prove it: too short, letters only, digits only — none of them stored.
  `uncompromised()` is deliberately absent: it calls haveibeenpwned over the
  network, and a credential screen that hangs when an outside service is down is
  worse than the leak it screens for.
- **Empty still generates**, and the console still offers that first. The
  distinction is load-bearing at the proxy: an untouched field must reach the API
  as an _absent_ key rather than `""`, or `nullable` reads it as a chosen blank
  and refuses it for being under twelve characters — so the generator would never
  run. There is a test for exactly that, on both handlers.
- **What is still impossible, and why the screen says so.** There is no "show me
  the password": `users.password` is a bcrypt hash, so the honest answers are a
  new one or none. The panel keeps the sentence explaining that, in the place
  somebody looks for the button — now beside a field that does the thing they
  actually wanted.

Both password fields are `type="text"` on purpose. The operator is reading the
value out to somebody as they type it, and a field of dots is a field they cannot
check first; it is printed in full on the next line regardless.

**A bug the tests caught before production did.** `UpdateOwnerRequest` first
resolved the row for `unique(...)->ignore()` with `property_exists($tenant, 'id')`
— and an Eloquent attribute is not a declared property. It lives in `$attributes`
and arrives through `__get`, so that is false on a model that plainly has an id;
`unique` then stepped over nobody and an operator correcting a phone number while
leaving the address alone was refused for colliding with their own row.

### 🔐 Fixed — The owner's login, when nobody wrote the password down (2026-08-23)

A restaurant was opened from the platform console and handed over with no
credentials, because the one screen that shows them shows them once. Three
things were wrong, and the third had been silently breaking sign-ins.

- **The owner's address is on the card now.** `Platform\OverviewController`
  sends `owner: {name, email, phone}` with every restaurant, in one query for
  the whole list. Until now the tenant card read its owner out of
  `TENANT_DETAIL` — a console fixture keyed by the demo slugs — so every
  restaurant actually onboarded here drew an em dash where its contact
  belonged, and the single field an operator is asked for on a call ("what
  address do they sign in with?") was on no screen at all. The list searches
  it too.
- **On the row, not only inside the card.** The first version put both the
  address and the reissue button on the tenant card, one click in — and the
  first operator to go looking for them did not find them. The question that
  brings somebody to this screen is asked of the _list_; a detail view they
  have no reason to suspect is not where it gets answered. The row now carries
  the address, copyable, and a "sign-in details" link that opens the card with
  the panel already showing.
- **A lost password can be reissued, never read.**
  `POST /platform/tenants/{tenant}/owner-password` generates one, answers it
  once and ends every session that account had. Not "show the password" —
  `users.password` is a bcrypt hash, so a new one is the only honest answer,
  and a password an operator could _choose_ would be the same one on every
  restaurant they open. The console draws it the way `pair-phone.tsx` draws a
  PIN: large, monospaced, copyable, and held on screen until the panel is
  closed rather than flashed in a 2.8s toast.
- **One address on two accounts no longer signs in the wrong person.**
  `StorePlatformTenantRequest` and `InviteOperatorRequest` both refuse an
  address already on the platform, but the column's own constraint is
  `unique(tenant_id, email)` — so a row written from a console or a seeder can
  share one, and Postgres counts a null `tenant_id` as distinct from every
  other null besides. This deployment has exactly that pair: a restaurant
  owner and the platform operator who onboarded them, on one gmail. With a
  bare `->first()` and no `ORDER BY`, which of them answered was whichever the
  heap handed back — and that moved the moment either row was UPDATED, because
  the new tuple version goes to the end of the table. So issuing a password to
  one account silently handed the address to the other identity, and the
  restaurant owner's correct password came back "wrong". `AuthController::login`
  now weighs the password against each candidate, oldest first and capped at
  four, and signs in the one it opens. The regression test was deliberately
  run against the old code and failed there — the first version of it did not,
  because a successful sign-in updates `last_login_at` and reorders the very
  rows it was testing.

### 👁 Added — An eye on the password field (2026-08-23)

`/login`, both doors. Not in the design handoff and here because the owner
asked for it, with the same standing as the crew app's day/night switch. It
earns the place on this screen in particular: the password an operator reads
out when a restaurant is opened is sixteen generated characters, and somebody
typing that on a phone has no other way to tell whether they got it right —
the only feedback without it is "wrong email or password", which is also what
a mistyped _address_ says. `type="button"` so it does not submit the form, the
input's `type` flips so a password manager still knows the field, `aria-pressed`
carries the state, and the control is 44px because `/login` is one of the
surfaces the design never drew for a phone.

### 🆕 Added — A dish has a photograph, at the size the screen needs (2026-08-23)

What the owner saw on the Zim-Zim till the restaurant used before: a picture
beside every dish, and the POS here had only the name. The picture now runs
through the whole platform, and what was built for it is sized for every
restaurant in the country rather than for one.

- **One pipeline, three files, nothing kept as it arrived.**
  `App\Support\Media\ImagePipeline` decodes every upload, turns it upright
  from its EXIF tag (a third of phone photographs lie on their side without
  this), scales it to `thumb` 160 · `card` 640 · `full` 1600 on the long edge,
  never upscales, re-encodes as WebP, and makes a 16px blur placeholder that
  travels inside the JSON. A 4 000×3 000 camera original — six megabytes —
  is about 160 KB in the bucket. Dimensions are read from the header before
  anything is decoded and a 25-megapixel ceiling is enforced there, because
  a decoded image costs four bytes per pixel whatever it weighed on disk.
- **Keys built for a million restaurants.** `App\Support\Media\MediaStore`
  writes `dish/{xx}/{yy}/{tenant}/{dish}/{hash}-{size}.webp`: two shard levels
  from a hash of the tenant id (65 536 buckets, so neither an ext4 directory
  nor an S3 prefix ever concentrates), and a content hash in the name so an
  address never changes meaning and nginx, a CDN and a phone may all keep
  the file for a year, `immutable`. The previous store used
  `menu/items/{tenant}/{id}.jpg?v=…`.
- **The row carries facts, never addresses.** `menu.menu_items.image` (jsonb)
  records hash, dimensions, renditions and placeholder; URLs are built at read
  time from whichever disk holds the files, so local disk → MinIO → CDN is a
  config change rather than an `UPDATE` across every menu. `image_url` stays
  as the one-address answer and still takes a typed-in external URL.
- **Every reader sees the set.** `MenuItemResource`, the `Dish` contract
  (till board, Telegram bot, offline bundle) and the marketplace storefront
  carry `image: {src, width, height, placeholder, sizes}` beside `image_url`.
  `@restaurant/surfaces/media/image` is the one place both products turn it
  into a `srcset` (web) or pick a rendition for a box at a pixel density
  (phone).
- **Drawn where it was missing.** The till's dish tile has the design's
  header row at last — a 44px photograph, or the design's two-letter monogram
  tinted by section when there is none — and the modifier sheet shows the
  plate beside its questions. The console menu list shows a 40px thumbnail per
  row; its editor has a drop zone, shrinks a phone photograph in the browser
  before it is sent (six megabytes become a few hundred kilobytes), and can
  take a photograph off again (`DELETE /v1/menu/items/{item}/image`). The
  guest QR menu, the restaurant site, the customer app, the Telegram mini
  app, the marketplace store and the native app draw the right size for
  their boxes with the blur underneath.
- **Crop and turn, in the console.** Every new photograph opens in a cropper
  before it is sent — drag the picture under the frame, pinch or scroll or
  slide to zoom, quarter-turn buttons, three shapes (as shot · 4:3 · 1:1) —
  and a photograph already on a dish can be re-cropped from its `full`
  rendition without finding the original again. The export is drawn on a
  canvas from the same `crop-math.ts` the preview uses, so what was framed
  is what leaves; the arithmetic has unit tests and the control was driven
  in a real browser with marked test images to prove the turn goes the way
  the button points.
- **Served from disk.** `/storage/dish/` is answered by nginx straight from
  `shared/storage/app/public` with a year of cache; every photograph used to
  be a php-fpm request answered `no-store`. `MENU_IMAGE_DISK` defaults to
  `public` — a dish photograph is on a public menu by definition and the
  application's default disk is private.
- **Refusals are 422 with a reason.** A corrupt file that passed the MIME
  check used to be a 500; it is `menu.image_unreadable` now, beside
  `menu.image_unsupported_format`, `menu.image_too_many_pixels` and
  `menu.image_missing`. The upload ceiling went from 2 MB to 12, because the
  platform does the shrinking and the honest limit is "what a phone makes".

### 🐛 Fixed — The public site's header (2026-08-23)

- **"Kim uchun" was on two lines in the middle of the desktop bar.** Measured:
  the row wanted 1214px (Uzbek) and 1235 (Russian) inside a 1200px wrap, and
  at a viewport of exactly 1200 the whole document scrolled sideways. The
  links are `nowrap` from the design's own rule and the rhythm is 18px where
  the design says 30, which is what the arithmetic allows; the current page
  is underlined, which the design draws and the header never had.
- **The phone header said "SR".** The wordmark was hidden below 600px and the
  brand square stood alone. The owner's call: the square is gone from the bar
  and the words stay at every width — stacked into a two-line lockup on a
  phone, 104px wide, 44px tall.

### 🆕 Added — The last eight, by hand (2026-08-22, late)

What the backlog had left as "external" or "a screen of its own". Two remain
and both need a contract with somebody else; everything below is built.

- **The Telegram mini app knows who is holding the phone.** Telegram signs
  `initData` with the restaurant's own bot token — which the platform has
  stored encrypted since the Telegram module was built, and which nobody had
  read. `App\Support\Telegram\InitData` verifies the HMAC and the age;
  `POST /v1/public/telegram/session` mints the same customer token an SMS
  code does, through `App\Contracts\Messaging\BotDirectory` so CRM does not
  import TelegramBots. A guest is now identified by whichever credential they
  arrived with: `crm.customers.telegram_user_id`, and `phone` became nullable
  because a Telegram guest has none until they share it. The points screen
  and the order tracker read their own rows; a page opened outside Telegram
  says so instead of drawing somebody else's balance.
- **A merchant's commission is the platform's arithmetic.** Three screens
  multiplied the design's nine per cent themselves — a store on any other
  rate read a fee it had never agreed to on the screen where it checks it was
  paid. `feeOf()` takes the API's own per-order figures; the constant
  survives only for the demo board.
- **The till's tip sheet is real.** A tip is a column on `finance.payments`
  and the server who earned it is on the order, which Finance may not read —
  so `BillRegistry::servedBy()` carries the names across and
  `GET /finance/shifts/{shift}/tips` splits the evening by waiter and by
  rail: cash is already in the apron, card is what the restaurant owes out
  tonight, and covers ride along because a tip per cover is how a section is
  read.
- **Two reports that needed another module.** Stock movement goes through
  `StockReport` (consumption per ingredient, waste as its own line rather
  than folded in); labour and attendance through a new
  `Roster::hoursBetween()` — the rota beside what actually happened, per
  person, with overtime read the honest way round.
- **The website screen's last two blocks.** Opening hours are the venue's
  own (`branch.settings.hours`, newly declared in the settings schema — an
  undeclared path was being dropped silently, which is why the screen wrote
  them for a year and read the design's back); the booking switches write
  `booking.auto_confirm`, `remind_hours_before`, `deposit_from_party` and
  `waitlist` instead of React state that a reload forgot.
- **Site visits are per page.** Each `(site)` route names its own path on the
  read it already makes, so the traffic panel lists pages rather than one
  number — and it stays one request per render.
- **Found on the way:** seven catalogue keys built from a list at render time
  (`t(\`channel_${key}\`)`) were missing, so the orders screen threw
MISSING_MESSAGE on every render. `keys-in-use.test.ts` now expands the
  dynamic families too.

**Still external, and only these two:** Didox e-filing (the tax panel and the
filings list) and PBX telephony (the operator's answer-time card). Neither
can be written without a contract with a third party — `docs/GO-LIVE.md`.

### 🆕 Added — The backlog the audit named, built (2026-08-22, night)

The audit left 45 screens honestly empty with the endpoint each would need.
Four builders built them: ~30 endpoints, 10 migrations, 50 items wired.

- **The venue switcher switches.** A branch cookie, read by `api-server.ts`
  and `api-proxy.ts`, sent as `X-Branch` on every read and every write; a
  pinned reader is refused with 409 rather than shown another venue. It had
  been a control that announced a switch and changed nothing.
- **The order desk's rules are the restaurant's** — `orders.intake_policies`
  (`GET`/`PUT /v1/orders/intake-rules`): auto-accept, auto-print, the peak
  ceiling and the prep promise, enforced where they are read. A kitchen at
  its ceiling now refuses a public order with `order.kitchen_at_capacity`
  rather than accepting one it cannot cook.
- **The dashboards' last fixture panels are live**: kitchen speed by station
  (through a new `KitchenLoad::stations()`), the waiter's own tables,
  incoming deliveries (a new Suppliers contract), the accountant's payables
  and unpaid/overdue counts, and the owner chart's weekday-average line.
- **Finance and analytics gained the reads the screens had been drawing**:
  month filters and totals on payments, shifts and expenses; an expense
  `paid_at`; a six-month cash-flow series; labour by hour; four new report
  kinds (Z, items, VAT, branches) and their CSV export; receivables ageing
  on CRM accounts; a permission-cell editor on `PUT /v1/roles/{role}`; the
  monthly target on `PATCH /v1/branches/{branch}`.
- **The catalogue screens read their own tables**: modifier groups, recipe
  cards costed through a new `ShelfCosts` contract (`menu.recipe_lines`),
  prep-item creation, received-vs-ordered on receiving
  (`purchase_order_items.received_quantity`), a table's place on the plan
  (`restaurant_tables.position`), the opening checklist as a table with who
  ticked what (`staff.opening_checklist_ticks`), and a first-party site-visit
  counter (`public.site_visits`) so `/web` reports traffic without anybody
  else's analytics.
- **The crew app's forms post**: cash hand-in and the close-of-shift
  checklist as new `staff.actions` verbs, a purchase request as a draft
  purchase order, a swap request against a real shift id.
- Fourteen items remain and each names its blocker —
  `docs/AUDIT-2026-08-22.md`. Four are external (Didox e-filing ×2, PBX
  telephony, Telegram `initData` verification); the rest are screen-sized
  builds (a bank-statement import, a drag-and-drop floor editor) that the
  audit did not ask for.
- **Found walking behind the builders:** the opening-checklist endpoint
  refused the `today` its own router allows, so every screen asking for it
  got a 422 on a live till. Fixed with the business-day boundary and pinned
  by a test.

### 🔧 Fixed — The demo that followed every restaurant around (2026-08-22, evening)

The first real restaurant's console said "service open · 11:24 · 14 of 32
tables seated · 7 dockets in the kitchen" over every screen, wore "Orders 12 ·
Kitchen 7 · Stock 4 · Complaints 3" in its sidebar, and listed the demo
restaurant's five venues in its header — on a tenant with no tables, no
dockets and one venue. None of it was a query: the strip and the badges were
catalogue strings and constants, and an empty live answer fell back to the
demo's rows.

- **`GET /v1/dashboard/pulse`** — what is true right now, for every role with a
  home screen: whether a till is open and since when (`DayBook::openSince()`,
  new), tables taken and free (`FloorBoard::tally()`), dockets open and the
  longest wait (`KitchenLoad::pressure()`, new contract with its Kitchen
  implementation and `Unavailable` fallback), lines below par
  (`StockReport::snapshot()`), bills open, complaints open
  (`CaseDesk::openCount()`, new). Four contracts, no lists, fifteen seconds of
  cache per venue. The status strip (`strip.ts`) and the sidebar badges
  (`navGroupsFor(role, counts)`) read it; a zero is no badge, a quiet kitchen
  says so, and a till left open since yesterday names the day.
- **An audit of every surface — 180 findings** across the console, the POS,
  the KDS, the crew app and the public surfaces — and four fixers, one per
  area, closed 205 of them: every `*-server.ts` that kept sample rows on an
  empty live answer now returns an honest empty state; every role dashboard
  carries `live` and `placeName` and draws a dash where the server would not
  vouch; every `ActionButton` is either wired (twelve new route handlers
  under `src/app/api/**`, forwarding to endpoints that already existed —
  banners, printers, reservations, marketplace orders and promotions,
  customer addresses, the platform invite) or gone. Forty-five were left with
  a named endpoint they would need; they are listed in
  `docs/AUDIT-2026-08-22.md`.
- **Walking behind the fixers found nine more**, all of them the kind a test
  suite does not see: a client component importing a server seam for one
  pure function (`next/headers` in the browser bundle — the build failed);
  two tab constants exported from `'use client'` files, which reach a server
  page as client _references_ (`BOOKS_TABS.filter is not a function`, the
  whole books and operations screens answering 500); three catalogue keys
  added to the wrong block or the wrong namespace (`MISSING_MESSAGE`);
  `Intl` weekdays in a client form that hydrated differently from the server
  (#418 on every booking page); a zero-revenue chart dividing by its own
  peak (NaN paths on every new restaurant's home); the phone surface reading
  the fixture overview; the public about page telling every restaurant the
  demo's 2014 story; the marketplace header offering "Chilonzor 24" to
  every visitor. `keys-in-use.test.ts` now resolves every literal
  `t('key')` against the catalogue, so the third class is a red test from
  here on.

### 🔧 Fixed — The release that built, booted and could not go live (2026-08-22)

- **The first real restaurant could not hire anybody.** Three faults, found
  together on its first morning:
  - **A restaurant was provisioned without a venue.** `branch_id` is on every
    table, staff member, till shift and kitchen ticket, so a tenant with no
    branch opens a console where nothing can be saved.
    `TenantProvisioner::create()` now opens one — named after the business, in
    the city the operator took on the call, which is the only place that city
    had to go. `restaurant:create-owner` gets it too, through the same
    provisioner.
  - **An empty venue list borrowed the demo's.** `shellState()` treated "the
    API answered none" the same as "the API did not answer", so the new
    restaurant's owner read `Chilonzor · 6.2M` in their own header, on every
    screen. Live and empty is now empty.
  - **"Add an employee" flashed a message.** It was an `ActionButton` — a
    control with no form and no request behind it — while
    `POST /v1/staff/members` had existed all along, requiring an
    `employee_code` the console had no field for. The code is now allocated
    off the tenant's counter (`EMP-0001`, atomic, stepping over any a
    restaurant typed itself), the sheet asks for a name, a job, a phone and a
    venue, and a restaurant with no venue yet gets a link to open one instead
    of a form that could only fail. The staff header's "19 people in
    Chilonzor" now counts the people on the screen.
- **The platform operator's every page answered 500.** The dashboard's new
  `placeName` read `context.tenant.name`; a super-admin belongs to no
  restaurant and the API says so with `tenant: null` — which the `AuthContext`
  type had declared impossible. React #441 on `/platform` for the one account
  that creates restaurants. `placeNameOf()` now falls back to the product's
  name, the type says `| null`, and `place-name.test.ts` holds the case.
- **The dashboard greeted every reader with the eleventh of August.** The
  design's mock date was in the catalogue as copy, under every role's
  greeting and on the platform console; the line beneath it claimed "12.4%
  ahead of yesterday, two things need you" whatever the day held; and the
  recent-bills panel kept its sample rows although the endpoint had been
  answering `recent_orders` for a week. Now `todayLabel()` writes the day in
  the reader's language (Intl, with the capital the design sets), the lede is
  worded from facts — the revenue KPI's delta against the period it is
  measured against and the count of attention cards, with ICU plurals — and
  the panel draws the last eight bills through the Orders screen's own status
  map. The session carries `placeName` for the sentence: the pinned venue, or
  the restaurant when the reader sees the whole business.
- **"90 933,33 so'm" and a gross profit bigger than the revenue.** The
  shared formatter printed fractional so'm for a derived average, and the
  owner's gross-profit card — which the server answers with `null` until
  every dish is costed — fell back to the fixture's month-sized figure beside
  five live ones. `formatTiyin*` now renders whole so'm (no tiyin has
  circulated for years), a KPI the server would not vouch for draws a dash
  rather than a sample, and the gross-profit caption is the ratio of the two
  cards beside it — which is where the design's "61.1% marja" had come from
  before it was written down as copy.
- **A 92% margin beside a 31% food cost.** The projection's gross profit is
  revenue minus the cost of the dishes that have a recipe — exact for them,
  silent about the rest — and on a quarter-costed demo menu it drew a margin
  no restaurant has ever had, on the same row as the food-cost card it
  contradicted. `RoleDashboards::grossProfitEstimate()` applies the measured
  food-cost ratio to all the revenue (the estimate every owner makes on
  paper, and it agrees with the card beside it by construction; on a fully
  costed menu it is the exact figure). The accountant's net margin follows
  it. The deeper cause — the nightly projection had one day of a demo week
  written back in time — is closed by `DemoFactsSeeder`, which re-rolls the
  window at the end of every `demo:seed`.
- **Two APKs talked to the phone itself.** `src/lib/api.ts` reads
  `extra.apiBase`; nothing in the build set it, so a release fell back to
  `http://localhost:8000`. `app.config.js` now writes `SRCP_API_BASE` into the
  config, `srcp-apk --api` supplies it (production by default), and the tool
  reads the embedded config back out of the APK and refuses to publish one
  without it. Live: `0.1.0 · 335727`, `apiBase = https://mypos.tashmedunitf.uz`.
- **The operator's order desk showed the design's tiles.** `/calls` asked for
  `filter[available]`, a key no controller allows; `apiGet()` returned null on
  the 400 and the screen fell back to fixtures that cannot be posted. Fixed to
  `filter[orderable]`, and `ConsoleQueriesTest` now scrapes every `apiGet()`
  the console can send and sends it to the real router with the exception
  handler off — an unknown filter, sort or include fails the suite.
- **A demo that dies of old age.** Trading was seeded once on the 12th; by the
  22nd "this week" was zero on the dashboard, the waiter leaderboard and the
  P&L. `DemoTradingSeeder` (Orders) keeps the last seven days stocked with
  paid, waited, dated bills and `DemoTakingsSeeder` (Finance) with a sealed
  till per day and a payment per bill; both are deterministic and keyed, the
  rota seeder joined the demo set, and the scheduler runs `demo:seed` at
  04:10 on any box with a demo tenant. `SeedDemoTenantTest` proves the week
  is paid, waited and balanced to the tiyin, and that a second run grows
  nothing.
- **The APK that took three builds to publish.** The first rebuild after
  waves 4–5 died in D8 at Gradle's 1 GB heap, the second in the Kotlin daemon
  at its 512 MB, the third built in full and failed on the last line — a glob
  over two `build-tools` releases handed `apksigner` a second path as its
  command. Now: one 3 GB JVM with Kotlin in-process (`with-release-signing.js`),
  the newest build-tools chosen by `sort -V`, the version read back out of the
  APK with `aapt2` so the manifest says what the file says, `--publish-only`
  to ship an APK Gradle already built, and the one root step split into
  `srcp-apk-publish` on the NOPASSWD list — so a session with no terminal can
  publish without anyone typing a password. Live: `0.1.0` · `335713`.
- **The kitchen screen did not move behind the edge.** The public name goes
  through a proxy that speaks HTTP/1.0 to the box and drops `Upgrade`; the
  socket handshake answered 500 and the boards, written for events, sat still.
  `usePollWhileOffline()` re-reads the page while the socket is not connected
  (10 s kitchen, 15 s floor and till) and stops when it is; each board adopts
  the fresh server snapshot during render. The proxy setting the network team
  needs is row 14 of `docs/GO-LIVE.md`.
- **`Modules/Board` extended nwidart's raw `ModuleServiceProvider`.** The base
  calls `loadViewsFrom()` unconditionally; the module has no `resources/views`;
  `php artisan optimize` died in the deploy's step 5 with "directory does not
  exist" and the release was never activated — the database was untouched
  because migrations come after the caches, which is the order that saved the
  evening. The provider now extends `ApiModuleServiceProvider` (whose
  `registerViews()` guards exactly this), the `restaurant:make-module` template
  was the source of the wrong base class and emits the right one, and
  `ModuleBoundaryTest::test_every_module_provider_extends_the_api_base` refuses
  the next one.
- **Permissions are code, and `--migrate` did not carry them.** Board and
  Marketplace went live with their schema and without their `{module}.*`
  permissions: the owner got 403 on every screen of both. `srcp-deploy
--migrate` now runs `RolesAndPermissionsSeeder` after the migrations —
  `firstOrCreate` + `syncPermissions`, so once is the same as twice.
- **`demo:seed` knew two modules.** The other nine seeders written in waves 4–5
  were reachable only by `db:seed --class`, which writes `tenant_id IS NULL`
  rows that RLS hides from everyone. Every module now declares its demo
  seeders and the tables they own in `config('{key}.demo')`, and
  `SeedDemoTenantTest` runs the whole set on a fresh database — every declared
  class must exist, every declared table must exist, and nothing may be left
  tenantless. The live demo restaurant was seeded from it: 3 modifier groups,
  6 bookings, 4 prep cards, 77 stock movements, 8 purchase orders, the
  ledger's reference rows, 6 reviews, 4 complaints, 4 promotions, 4 triggers,
  5 campaigns, the board.

### 🆕 Added — Everything that was "missing a table" (2026-08-22, waves 4–5)

After the first three waves, 64 markers remained that called themselves
integrations. Most were not: they were tables, endpoints and modules the
screens had been drawn for and nobody had built. Two more waves built them.

- **Finance.** `payment_methods` (no card requisites, ever), `expense_categories`,
  `accounting_periods` with a lock that every door respects — and in making
  `amendClosedShift()` respect it, the discovery that it posted to _today_ and
  double-counted a sealed shift's banknotes. `fixed_assets` with straight-line
  depreciation derived on read, `cash_accounts` with two-legged transfers, a
  cash book, a calendar-month P&L, paying a supplier's invoice.
- **Payroll.** `staff.payroll_periods` / `payroll_lines`, built from attendance
  not rota, rate snapshotted at finalisation.
- **CRM.** Segments derived nightly, campaigns (queued, quiet hours, delivery
  rows written before the gateway is called), promotions as basket rules,
  triggers that write their own campaigns, a complaints desk whose refund is a
  named credit on the guest's tab rather than a flag.
- **Board** — a fourteenth module: the menu board above the counter, three
  lists and a banner, 17 endpoints.
- **A notification feed** — `public.notifications`, four real producers, the
  bell in the console.
- **Inventory.** Per-venue stock levels, transfers that dip the total while a
  van is on the road, prep items with recipes, delivery acceptance.
- **Analytics.** Scheduled reports by mail or Telegram, custom reports over a
  whitelist, branch performance from `daily_facts`, export in CSV / 1C /
  printable sheet, delivered by download, mail or chat.
- **Orders.** The intake layer (`source`, `intake_channel`, operator, promised
  and scheduled times), an operator placing a whole order from the console,
  money splits minting sibling bills with one rounding rule, the manager's
  discount and transfer from the back office, a waiter asking for approval
  from a phone, paused channels, a courier's own round, `orders.moved` and a
  listener that tells the guest by SMS and push.
- **Tables.** Booking windows with a cover ceiling, a guest's booking code
  with confirm and cancel, the waiter-call list that had been written to for
  a day and never read.
- **Settings.** Ten restaurant policies declared in `config/settings.php` and
  **enforced** where each belongs — `BillRegistry`, `ApprovalGate`, the KDS
  timers, the stop list — with an on/off test pair for every one. A site that
  publishes a snapshot so a draft is never the shop window.
- **Marketplace.** Payout details (verified by the platform), weekly
  settlements with a printable statement, Plus subscriptions, paid placements,
  delivery zones by radius — and the finding that "nearest zone" on
  concentric circles meant "whichever the merchant typed first".
- **Push** for guests, not only staff: polymorphic tokens, registered from the
  customer app and MyPOS.
- **Data export** for a tenant, zipped and signed.

### 🟢 Fixed — Found along the way (2026-08-22)

- `console-post.ts` read a top-level `meta` the API never sends — every
  refusal's baggage (approval ids, queue days) was `null` on every console
  screen. The POS approval loop had been broken from the floor and correct
  from the server.
- `demo:seed`: a module seeder run alone has no tenant context and wrote
  promo codes and storefronts under no restaurant; the command now sets the
  context, deletes the orphans, and the core no longer names a module to do it.
- `PurchaseOrder::outstanding()` shadowed its own scope; `ImportMenuRequest`
  rejected `"false"` from `FormData`; two tests that failed for one hour in
  every twenty-four because they mixed `now()` with a 06:00 trading day.

### 📋 `docs/GO-LIVE.md`

The thirteen keys the code is waiting for, what each unblocks, where it
comes from, and what the product does until then. Nothing on it needs code.

### 🆕 Added — The backend the screens were waiting for (2026-08-22)

The largest single day in the repository: twelve agents, three waves, 207
`TODO(api)` markers to zero. Before it the product was a prototype that
looked finished — a waiter saw tables but the kitchen never heard, a guest
pressed "pay" and no money moved, a till printed a receipt that reached no tax
authority. After it:

- **The public order chain.** `POST /public/orders` (delivery, pickup) and
  `POST /public/tables/{token}/order|call|pay` (QR) price on the server, fire
  the kitchen in one transaction, and are tracked by number + last four digits
  of the phone. `GET /public/branches` and `GET /public/site` for a stranger.
- **A customer identity.** OTP over SMS (`App\Contracts\Messaging\SmsSender`,
  Eskiz driver, `log` driver for local), a `customer` token that is _not_
  `auth:sanctum` — `crm.customers` holds every guest's name and phone and must
  not join the three RLS exemptions — addresses, feedback, promo codes applied
  **server-side** through a new `App\Contracts\Crm\Promotions`, loyalty coupons,
  the marketing site's lead form.
- **Money.** `App\Contracts\Finance\PaymentGateway` with Payme (JSON-RPC),
  Click (prepare/complete), Uzum (field names assumed, disabled) and a sandbox;
  `payment_invoices` under RLS; provider callbacks verified and idempotent. An
  OFD HTTP driver and a `plu` column threaded from the dish to the fiscal line.
- **Analytics.** Summary, menu engineering, loss control, five reports with CSV
  export, and seven role dashboards — plus `analytics.daily_facts`, a read
  model fed nightly so labour and food cost can cross module boundaries
  without a module importing another.
- **Marketplace.** A thirteenth module, above tenancy: eight tables, 22 routes
  across consumer and merchant, a deterministic seeder from the design's eight
  storefronts, RLS exemptions argued for `consumers` and `couriers`.
- **Staff.** `POST /staff/actions` drains the phone's offline queue — eight
  verbs, per-entry idempotency, each reaching its owning module through a
  contract (`FloorPlan`, `Receiving`, `StockLedger`, `BillRegistry::markDelivery`)
  — and nothing from a phone is ever dropped. Shift swaps, rota publishing,
  `GET /staff/me/today`.
- **Suppliers · Inventory.** Purchase orders with a state machine, supplier
  figures as subqueries rather than stored, stores and purchase units on the
  shelf, barcode lookup, count sheets that post variances.
- **Settings · Platform.** A declared settings schema, per-restaurant role
  overrides applied in `User::checkPermissionTo()`, the discount ceiling moved
  to one server-side source, the site's configuration, and the twelve
  platform screens — tenants, plans, billing, impersonation with a mandatory
  reason and an audit row, health, releases read from `srcp-deploy`'s own
  manifests.
- **Push.** `public.push_tokens`, an Expo sender that retires dead tokens, an
  `expo` notification channel, and the first page: a cashier asks for an
  approval and the manager's phone — only the manager's — buzzes.
- **Dispatch.** `orders.deliveries`, courier assignment, the tracking payload's
  `courier` no longer `null`.
- **Forgot / reset password**, answering 204 either way.

### 🟢 Fixed — What the integration wave found (2026-08-22)

Joining modules that each stopped at the other's edge surfaced defects no
module's own tests could see:

- **An order paid online was never cooked.** The ledger called `close()` on a
  `draft`, the ladder refused, the refusal was logged, the invoice read
  `paid`, and no docket was printed. `BillRegistry::markPrepaid()` now fires
  the kitchen and sets the branch the tickets are filtered by.
- **Every permission-guarded route answered 500** for the hour a
  `parent::checkPermissionTo()` call into a trait was live. Caught by a
  sibling agent's test run.
- **Four roles got 403 on their own home screen** — the dashboard was guarded
  by `analytics.view`; it now sits on `dashboard.view`, which every console
  role holds.
- **The platform console and the whole restaurant site rendered fixtures** —
  `/api/v1/v1/…`, a doubled prefix, 404, silent fallback. Four files carried
  it; `api-paths.test.ts` refuses the pattern repo-wide.
- **A remote approval could never be applied** — the proxy dropped
  `error.meta.approval_id`.
- **The open shift's drawer showed 0** — `expected_cash` was written only at
  close. **`top_up` was written without being a known kind.** A clock-in from
  the crew app landed on the wrong venue — `branch_id` missing from
  `Attendance::$fillable`.
- **Two seeder bugs killed the order chain on every seeded database** with all
  tests green: hand-written bill numbers left `branch_counters` at zero, and
  the POS seeder cleared the tenant context the CRM seeder then wrote under.
- A module generator that produced invalid SQL from an Uzbek apostrophe.

### 🔒 Security — Demo accounts locked (2026-08-22)

`owner@demo.uz` / `password` — twelve accounts seeded "for local only" — were
live on the public API. `demo:lock` rotated every one to a 24-character
random password and revoked their sessions; the set was printed once.

### 🧰 Infrastructure (2026-08-22)

`srcp-backup` nightly at 03:30 with a `--verify` that actually restores
(74 tables, proven); a `telegram` log channel for `critical`; the abandoned
domain-event path escalated to it; Playwright end-to-end in CI against the
real build (21 tests, phone and desktop); a dependency-free load test with a
written budget (101 rps, p95 587 ms on the 8 GB box); a `deploy.yml` that runs
`srcp-deploy` over SSH after a green CI, behind a manual gate; 6 GB of swap,
persisted.

### 🆕 Added — The app is handed out from the site (2026-08-21)

`/download`, and the two black badges every restaurant site carries. The
Google Play badge is the APK straight from `/downloads/` — the store's shape,
our file, and a line under it saying so. The App Store badge goes to the iPhone
steps, because Apple allows no install from a website; the line under it says
that too. Badges sit in four places for four audiences: the marketing home and
`/download` (owners), a restaurant's own site footer (its guests — the
screenshot that asked for this was a competitor's footer), the MyPOS home
(consumers), and a plain button on the console's staff page (managers enrolling
a phone).

The APK is built on the server by `srcp-apk` — JDK 17 and the Android SDK in
the developer's home, never `/opt`, never root — signed with a key that lives
beside them and is checked against the APK's certificate before anything is
published. Android identifies an app by package _and_ key, so that key is the
identity of every installed copy; `apps/mobile/README.md` says where to back it
up. `versionCode` is the UTC minute, so it only rises.

Eight attempts to get the first build out, and each one taught the tool
something: RN pinned to Expo's own version list (Metro would not start on the
latest); one clang at a time and a 1 GB JVM, because each RN translation unit
peaks near 700 MB and the 8 GB box runs a site, an API and an editor beside it;
6 GB of swap, after the kernel's OOM killer took the Gradle daemon five times
and the developer's own session once; `babel-preset-expo` declared directly,
because pnpm's isolation hides it from the Gradle-spawned bundler. `srcp-apk`
now refuses to start without 5 GB of headroom rather than dying at minute
twenty.

nginx serves `/downloads/` from `/srv/srcp/shared/` — outside every release,
so a deploy cannot take the file down — with the one header that matters:
`application/vnd.android.package-archive`. Without it Chrome on Android saves
the file and never offers to install it, which to a restaurant owner reads as
"the download did not work".

### 🆕 Added — The native shell, and the package that makes it possible (2026-08-21)

**`apps/mobile`** — Expo SDK 57, React Native 0.87, expo-router. One binary
carrying the four phone surfaces the design draws as separate apps: customer,
marketplace, staff, QR guest. Routes mirror the web build segment for segment so
`srcp://mp/track` from a push lands where `/mp/track` does in a browser;
`routes.test.ts` asserts the parity. Telegram stays web — its mini app runs
inside Telegram's own WebView. Credentials live in `expo-secure-store`.

`src/theme.ts` is generated from `packages/ui/src/styles/tokens.css` by
`pnpm theme`, and `theme.test.ts` regenerates into memory and compares. Writing
that test found a real defect on the first run: the generator matched
`[data-theme='dark']` as a substring of the `@custom-variant` line and read the
light block twice, so all 87 colours were identical between themes and nothing
errored. 52 now remap.

**`packages/surfaces`** — the five consumer surfaces' shapes, fixtures,
arithmetic and copy, moved out of `apps/web` so the phone and the browser read
one source. Fifteen pure-TS files, 111 import sites rewritten, web's 447 tests
unchanged. `purity.test.ts` rejects React, `next/*`, DOM and `fetch` — Metro
cannot resolve `next/headers`, and one stray import would break whichever build
the author was not running.

### 🆕 Added — 02 · Hujjatlar, the last unbuilt design file (2026-08-21)

Seven printable documents on one route, selected by `?d=`: the cover, guest
receipt and kitchen ticket (80 mm), Z report, purchase order, count sheet,
payslip, P&L (A4). Two `@page` boxes; a dark console still prints black on
white. Every figure is transcribed from the design file and
`documents-fidelity.test.ts` reads that file back to assert each is still in the
data.

The surface shipped without a session guard: it was in neither `SURFACE_PATHS`
nor `MODULE_PATHS`, and `isAllowed()` passes a path in neither — a restaurant's
turnover, a supplier's prices and a named employee's pay on an open route.
Closed with `SURFACE_ACCESS.documents` for the door and `DOCUMENT_ACCESS` for
`?d=`, transcribed from `specs/02-documents.md §7`; the two deviations (payslip
to the accountant, receipts to the manager as reprint approver) are written down
as deviations rather than folded into the spec table.

One departure from the file's output, by following the file's data: its P&L
colour rule `good = isTot ? up : !up` printed a restaurant's four growing revenue
lines in red. The build reads the sign of the row's own figure instead — which
the design's data already carries — and the fidelity test pins that exactly four
rows differ and which.

### 🟢 Fixed — Three phone docks sat under the iPhone home indicator (2026-08-21)

The marketplace tab bar, the Telegram mini app's tab bar and the pill the guest
menu floats over the fold were all pinned to `bottom-0` with no
`env(safe-area-inset-bottom)`. Correct in every desktop browser, every
screenshot and the design file; on the device their labels sat in the 34px strip
the indicator draws over. The customer dock had always handled it, which is why
nothing looked wrong in review. `design-rules.test.ts` now holds the rule over
all six phone surfaces.

### 🟢 Fixed — Inventory, the three things the agent could not reach (2026-08-21)

Store chips above the tab strip (`ivStoreChips`), filtering the shelf by
`?store=` — in the URL rather than in state, because the tab strip is a client
island whose panels are server-rendered and a chip cannot reach across that
boundary; `ivPoCount` now grows as orders are placed, through a two-line
`useSyncExternalStore` that the table writes and the KPI strip reads; and the
Uzbek stock tab reads `Qoldiqlar`, as the design's `ivTab1` does.

### 🟢 Fixed — Static analysis had not run since August 20 (2026-08-21)

`phpstan-baseline.neon` still named `Modules/Pos/app/Models/PosPin.php`, deleted
when PINs moved to `public.user_pins`. PHPStan refuses to start on a baseline
entry it cannot resolve, so it exited 1 without analysing anything and CI's PHP
job was red on every push. Removing the block let it run and it found nine
errors that had been hidden behind the failure — all fixed, none behavioural:

- `$hidden` on `UserPin` and `StaffDevice` declared `array<int, string>` where
  Eloquent's is `list<string>`.
- `PublicReservationController` read a required `datetime` column through `?->`,
  which told a reader some reservations have no start time.
- `FiscalRegistrar` guarded a division with `$rate > 0` against a constant 12.
  The arithmetic is its own guard: at a rate of zero the numerator is zero.
- `StaffAuthController::logout()` checked `method_exists($token, 'delete')` on a
  type that always has it.
- `StaffAuthController::device()` — the real find. `Request::user()` is annotated
  as `App\Models\User`, and on that route it is not one: a phone authenticates
  as itself, so Sanctum resolves the token to a `StaffDevice`. Static analysis
  therefore proved the `instanceof` always false, the throw always taken and the
  return unreachable. The code was right and the annotation was wrong.

`vendor/bin/phpstan` now reports **no errors**; `pint --test` passes and the 953
tests still pass.

### 🎨 Fixed — One design again (2026-08-21)

The console had two designs in it and neither the code nor the tests could tell
you which was current. **`docs/design/source/` held the superseded v1.0 export**
— `NAV_ALL` with nineteen modules, no ninth role — while the current fourteen
files sat in the `.gitignore`d handoff directory with twenty-four. `GAPS.md`
says of v1 in as many words: _"That package is superseded. Discard any copy of
it."_ Two docblocks named the stale copy as their source, and
`design-coverage.test.ts` read the ignored directory, so on CI it **skipped**:
the whole "1:1 with the design" claim went unchecked wherever changes are merged.

- **The design is in the repository now.** All fourteen `.dc.html` files plus
  their three runtime scripts live in `docs/design/source/`, and
  `design-coverage.test.ts` reads them — a fresh export beside the repo still
  wins when one is checked out, so a designer's workflow is unchanged. The
  `.gitignore` comment that called the two stale files "the two files the build
  actually reads" is corrected; it was wrong on both counts.
- **The token layer is checked by machine.** `design-tokens.test.ts` parses
  `:root` and `[data-theme="dark"]` out of the design file and asserts every one
  of the 115 light and 36 dark custom properties exists in `tokens.css` at the
  same value. It found three defects on its first run: `--pos-idle` was missing
  (so the till held the _light_ gradient as a literal and a dark room got the
  wrong one), `--danger-400` was invented and resolved to nothing — the sixth
  slice of the analytics donut was a gap in the ring — and `--text-7xl` was
  declared but never mapped, so `text-7xl` fell through to Tailwind's 72px.
- **The motion layer existed only in the design.** `tokens.css` declared
  `--dur-*` and `--ease-*` and nothing consumed them for entrances: the build
  had **zero** `@keyframes` against the design's eleven, applied thirty-eight
  times. `packages/ui/src/styles/motion.css` carries them now — sheets, toasts,
  KPI cards, bars, donuts, lines, skeletons, the KDS late pulse — with the
  design's `prefers-reduced-motion` fallbacks.
- **The toast was mounted and never called.** The design fires `flash()` **445
  times** across the fourteen files; the build called `toast()` three times, all
  in `/design`. It is the design's own panel now — bottom centre, `--bg-inverse`,
  `--radius-md`, one at a time, 2.8s — and every surface says what it just did.
- **Interaction states were scoped to the console.** `[data-seg]`, `[data-row]`,
  `[data-tile]`, the press-scale, tabular figures and the scroll chrome lived in
  `(dashboard)/app-shell.css`, so the segmented control on the till and the
  kitchen display drew **no selected state at all**. They are unscoped now.
- **Breakpoints followed the document instead of the file.** `FOUNDATIONS §9`
  lists 1320 / 1260 / 1140; the file draws 1280 / 1180 / 1080 / 900. The file
  wins, and this was the only place in the repo where it had not.
- **The KPI card lost half its design.** The label is 10px uppercase at `.07em`,
  not 12px sentence case, and every card carries a tinted glyph badge —
  `KpiCard` takes `icon`/`iconTone`, and `dashboard/kpi-icons.tsx` holds the
  design's fifteen.
- **The state ladder gained its colours.** `order-state.ts` carried the labels
  for all thirteen states and none of the tones, so each surface picked its own
  and `cooking` came out three different ambers. The design's `STATES` table is
  the source, and a test parses it.

### 🔒 Fixed — Two open doors and a price (2026-08-21)

- **The platform admin console had no guard.** `apps/admin` shipped a careful
  sign-in — password, TOTP, `super-admin` only, a thirty-minute token — and
  nothing that made anyone use it: no `middleware.ts`, no session check in the
  layout, no `getSession` anywhere in the app. Anything that reached the port
  got the console that suspends tenants, holds API keys and offers
  impersonation. Damage was bounded only because all forty-seven screens are
  fixtures. `middleware.ts` + nine tests.
- **`/pricing` advertised the plans at a hundredth of their price.**
  `PAGE_PLANS` held the design's figures, which are so'm, and
  `formatTiyinAmount` divides by a hundred — so Start read **24 000 so'm a
  month** against the design's 2 400 000, the yearly note promised a year for
  240 000, and the ROI calculator subtracted a plan cost a hundred times too
  small. The home page's copy of the same three prices was correct, so one site
  quoted two prices. `pages-fidelity.test.ts` counted three plans and checked no
  figure; it checks them now, and that the two screens agree.
- **The marketplace commission said fifteen per cent.** The design says nine in
  all three files and the site's third reason to join is literally _"Komissiya
  9%, 27% emas"_. Worse, `merchant-copy.ts` already said nine, so one product
  showed a merchant 15% on the catalogue screen and 9% on settlement.

### 📱 Added — The phone surfaces are apps (2026-08-21)

- **Manifests for the staff app and the marketplace.** Both inherited the
  platform manifest, which starts at `/dashboard` — a waiter who installed the
  staff app opened the back-office console.
- **iOS standalone.** `appleWebApp.capable` and a translucent status bar:
  Safari ignores `display: standalone` in a manifest entirely, so an iPhone that
  followed the instructions still opened inside Safari with an address bar.
- **An install prompt that knows the difference.** Chrome's
  `beforeinstallprompt` is captured and offered at a moment the guest chose; iOS
  gets the three-step _Share → Add to Home Screen_ instruction, because
  `Sayt va PWA.dc.html` names "iOS da o'rnatish qo'lda" as this channel's first
  limitation and no button can do it.
- **`apps/mobile` says why it is empty.** The design argues against a native
  shell on five of six rows — no store commission, thirty-second publishing, one
  template for 42 restaurants — so the README records the three conditions that
  would change that and a nine-step plan for when one does.

### 🧹 Changed — The tree now says what is real (2026-08-16)

A structural audit found three places where two generations lived side by side
and nothing said which one was current. All quality gates green after each step
(pint, phpstan, type-check, 118 frontend tests, lint, format; live API and both
consoles answering throughout).

- **Design prototypes moved to `docs/design/source/`.** Two near-identical
  handoff bundles sat at the repo root under space-laden names, one a "(1)"
  copy of the other, each duplicating its own files again in a nested folder.
  One canonical copy of each artefact survives (`Smart Restaurant OS.dc.html`,
  the marketing prototype, `support.js`, uploads); everything else — 2.3 MB of
  byte-identical duplicates — is gone. The docblocks in `roles.ts`,
  `(dashboard)/layout.tsx` and `(marketing)/page.tsx` now name the path.
- **nwidart scaffold leftovers removed from all 12 modules**: per-module
  `package.json` + `vite.config.js` (never installed — modules are not pnpm
  workspace members), `resources/views/` blade files and `resources/assets/`
  (no provider registers views; zero `view()` calls). Module `README.md`s are
  real documentation and stay; `routes/web.php` stays because its emptiness is
  deliberate and explained in the file.
- **The dead client chain deleted, `packages/sdk` with it.** Two API clients
  existed: the live one (`app/api/auth/session` route handler → httpOnly
  cookie → `lib/api-server.ts`) and a scaffold-era one
  (`lib/auth.ts` → `lib/api.ts` → `@restaurant/sdk`; in admin,
  `lib/auth/index.ts` → `lib/api/client.ts`) that no page had called since
  server sessions shipped. A newcomer could not tell which was real. The dead
  chain is gone; the one thing still referenced from it — the `AuthContext`
  type — moved into `server-session.ts`, narrowed to the fields the console
  actually reads. The SDK returns when it is generated from OpenAPI
  (`docs/api/README.md`), not before.
- **Compose-era deploy files marked as history**: `infrastructure/nginx/` (a
  site for a domain that never existed) and `infrastructure/scripts/` moved to
  `infrastructure/legacy/` with a README naming what replaced them —
  `docs/deployment/pos26-uzcloud.md` for the live box,
  `infrastructure/server/` for the systemd path.
- **The `*-data.ts` / `*-server.ts` rule now holds everywhere.** The rule said
  types and fixtures live in `*-data.ts` and server calls in a sibling only
  server components import; only `tables` obeyed it, and six wired screens
  kept `apiGet` inside their data files — a landmine that would detonate the
  first time a client component imported one (`next/headers` cannot be
  bundled for the browser; `tables` was split for exactly that reason).
  `menu`, `orders`, `kitchen`, `inventory` and `finance/till` each gained a
  `*-server.ts`; `staff/shifts`'s file was pure server code with no fixtures,
  so it was renamed `shifts-server.ts` rather than split.

### ⚡ Fixed — Queries that would have stalled a busy restaurant (2026-08-11)

**403 tests, 1383 assertions, all green on PostgreSQL.**

- **Every "today" query defeated its own index.** `whereDate('paid_at', …)`
  compiles to `date(paid_at) = ?`, and PostgreSQL cannot use an index on a column
  it must transform first — so today's takings, today's orders, today's
  attendance and five more all became sequential scans on the tables that grow
  fastest. Replaced with half-open ranges on the raw column.
- **…and they were computing the wrong day.** Every tenant carries a `timezone`
  and a `business_day_starts_at`; **neither was ever read**. "Today" meant a UTC
  calendar day, so a bill settled at 02:00 in Tashkent landed on the previous
  day's Z-report and the 06:00 trading boundary was ignored entirely. New
  `App\Support\Tenancy\BusinessDay` computes the window in the restaurant's own
  time, and every scope goes through it.
- **The database and the application disagreed about what time it was.**
  PostgreSQL's session timezone defaulted to the server's — `Asia/Tashkent` here
  — while Laravel writes naive UTC. Any SQL comparing a column against `now()`
  was five hours out, and would be out by a different amount on a different
  server. The connection now pins `UTC`, and an architecture test asserts the two
  clocks agree.
- **The QR menu hit the database for every guest.** The busiest endpoint on the
  platform, with no login in front of it, rebuilt the whole menu per request. Now
  cached per restaurant × channel × language with version-counter invalidation, so
  a repricing still reaches the table instantly, and served with an ETag so a
  returning phone gets `304` instead of the payload again.
- **Two dashboards counted in PHP what the database could count.** Stock value
  hydrated every ingredient to sum an accessor; the kitchen display loaded every
  open ticket to filter on `is_late`. Both are now single queries.
- Architecture tests now refuse `whereDate`, raw SQL using `now()`, and any
  connection that is not PostgreSQL.

### 🧱 Added — `restaurant:make-module` (2026-08-11)

`php artisan module:make` produces a module that fails this codebase's
architecture suite immediately: no schema, no tenant scoping, no permission
middleware, no registry metadata, no tests — and it says nothing about the six
files that must be edited _outside_ the module folder.

`php artisan restaurant:make-module Delivery --icon=truck --uz=… --ru=… --en=…`
scaffolds a module that passes, and registers it in all six: its own schema
migration, `search_path`, `ModuleBoundaryTest::MODULE_SCHEMAS`, the RBAC seeder,
`modules_statuses.json`, and the Composer autoloader. Verified end to end by
generating a module, migrating, and running the full suite against it.

Also: the module registry tests no longer hard-code "11 modules" — they count
from the registry, so a twelfth module does not break three unrelated tests.

### ⬆️ Changed — Frontend on the latest stable (2026-08-11)

Next.js 16.3.0, React 19.2.8, **Tailwind CSS 4.3.3**, ESLint 10.8.1,
TanStack Query 5.101.4, next-intl 4.13.6, typescript-eslint 8.67.0.

TypeScript 7.0.2 was tried and **reverted**: it type-checks 3.5× faster (18.5s →
5.3s) but `typescript-eslint` has no release that supports it, so linting stops
working entirely. Revisit when typescript-eslint ships TS 7 support.

### 💥 Changed — One PostgreSQL schema per module, PostgreSQL everywhere (2026-08-11)

Fifty-four tables lived in one flat `public` schema. Now each module owns a
schema of its own, and PostgreSQL is the only supported engine — development,
tests, CI and production alike. See
[ADR-0010](docs/decisions/0010-schema-per-module.md). **362 tests, 1101
assertions, all green on PostgreSQL.**

| Schema      | Tables                                            | Schema      | Tables                                         |
| ----------- | ------------------------------------------------- | ----------- | ---------------------------------------------- |
| `public`    | Core: identity, tenancy, outbox, audit, framework | `suppliers` | suppliers, purchase orders and their lines     |
| `menu`      | categories, items                                 | `staff`     | staff members, shifts, attendance              |
| `orders`    | orders, order items                               | `finance`   | cash shifts, payments, expenses                |
| `kitchen`   | stations, tickets                                 | `crm`       | customers, loyalty, feedback                   |
| `tables`    | halls, tables, reservations                       | `telegram`  | bots, bot users, subscriptions, messages, logs |
| `inventory` | ingredients, stock movements                      | `analytics` | _reserved for projections_                     |

- **Migrations and models name their schema outright** — `Schema::create('menu.menu_items')`,
  `protected $table = 'menu.menu_items'`. `search_path` lists `public` first and
  every module schema after it, so `exists:menu_items,id` in a validation rule
  and `assertDatabaseHas('orders', …)` in a test keep working unqualified.
- **Existing databases relocate in place.** `ALTER TABLE … SET SCHEMA` moves each
  table with its indexes, constraints and sequences without copying a row. The
  migration is idempotent, so a fresh database passes straight through it.
- **The architecture tests enforce the layout**: a module creating a table
  outside its own schema, a model with no `$table`, a schema missing from
  `search_path`, or a connection that is not PostgreSQL all fail the build.
- **`php artisan db:setup`** creates the working and test databases, so a fresh
  clone gets a usable error path instead of a connection failure.
- **`php artisan db:annotate`** now reports module → schema → tables and writes
  the owner onto each table as a PostgreSQL comment.

### 🐛 Fixed — A CRM query that could only ever work on SQLite (2026-08-11)

`Customer::scopeBirthdayToday()` called `strftime('%m-%d', birthday)` — a SQLite
function that does not exist in PostgreSQL. Every birthday-marketing query would
have failed in production with `undefined function`. It never showed up because
the suite ran on SQLite and production ran on PostgreSQL.

Rewritten with `extract(month …)` / `extract(day …)`, which PostgreSQL can also
answer from the existing `(tenant_id, birthday)` index instead of formatting a
string per guest. Moving the tests to PostgreSQL is what surfaced it, and is why
the engines are now the same everywhere.

### Added — The foundation the 10 modules stand on (2026-08-11)

Ten modules existed with no way to sign in, no way to know what a person could
do, no way to read the audit trail they were all writing, and no way for one to
talk to another without importing its models. **349 backend tests, 1050
assertions, all green.**

| Piece                  | What it does                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| **Auth**               | Register (restaurant + owner in one transaction), login by email or phone, logout, `me`, `context` |
| **Locale**             | `X-Locale` → the user's saved language → `Accept-Language` → the restaurant → the app default      |
| **Module registry**    | `GET /api/v1/modules` — every client builds its navigation from this instead of hard-coding one    |
| **Audit trail**        | `GET /api/v1/audit` — read-only, tenant-scoped, filterable by module, event, person and date       |
| **Event bus**          | Transactional outbox: `orders.paid` reaches CRM without either module knowing the other exists     |
| **Core contracts**     | `App\Contracts\Menu\MenuCatalog` — Orders and the bots read the menu without importing it          |
| **Architecture tests** | Module boundaries, `tenant_id` coverage, event naming and strict types, all enforced in CI         |
| **Health**             | `/api/health`, `/health/live`, `/health/ready` and `php artisan health:check` for FPM pods         |
| **Installation**       | `db:seed` now produces 11 signed-in-able accounts; `restaurant:create-owner` onboards a real venue |

### 🔒 Fixed — Cross-tenant reads through route-model binding (2026-08-11)

Laravel runs `SubstituteBindings` before route middleware by default, so
`/api/v1/menu/items/{item}` loaded the dish **before any restaurant had been
resolved**. With no tenant in context the `BelongsToTenant` global scope
filtered nothing, and any signed-in user could read — and with a `PATCH`,
rewrite or delete — a competitor's row by guessing an integer. List endpoints
were always filtered, which is why this looked isolated and was not.

`bootstrap/app.php` now states the middleware priority explicitly, with
`ResolveTenant` above `SubstituteBindings`. `tests/Feature/TenantIsolationTest`
covers reads, writes, deletes and the ordering itself.

Also fixed in the same pass:

- **`ResolveTenant` accepted any `X-Tenant`.** A user of restaurant A could ask
  for restaurant B's data and get it. A user is now pinned to their own
  restaurant; a mismatched header is `403 TENANT_MISMATCH`.
- **`tg_subscriptions` had no `tenant_id`** — the one Telegram table the
  original tenancy migration missed. A broadcast to "everyone subscribed to
  orders.ready" would have reached a competitor's guests.
- **`migrate --seed` produced data nobody could see.** `WithoutModelEvents`
  muted `BelongsToTenant`, so all 34 dishes, 25 bills and 24 tables landed with
  `tenant_id = null`. Seeding now establishes the tenant context and suppresses
  only activity logging, which is what the trait was really wanted for.
- **`migrate --seed` produced no users at all** — a fully stocked demo
  restaurant with no way to log into it.
- **The bot menu endpoint never checked its bot key**, so a misconfigured key
  served whichever restaurant the `X-Tenant` header named.

### Added — All 10 Phase-1 modules implemented (2026-08-10)

The nine remaining skeletons became working modules, each following the shape
`Modules/Menu` established. **190 backend tests, 591 assertions, all green.**

| Module        | Tables                                                 | Notable behaviour                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tables**    | `halls`, `restaurant_tables`, `reservations`           | Seating a reservation flips the table to occupied in the same call, so the floor map cannot be left lying                                                                                                 |
| **Orders**    | `orders`, `order_items`                                | Prices, names and stations are **snapshotted** onto the line — repricing the menu tomorrow never rewrites a bill from today. Paid bills are immutable                                                     |
| **Kitchen**   | `kitchen_stations`, `kitchen_tickets`                  | One ticket per station (grill and bar work in parallel); re-dispatching an edited order updates the ticket in place instead of printing a duplicate; a ticket that is already out is never flagged "late" |
| **Inventory** | `ingredients`, `stock_movements`                       | The running balance moves only through a movement row, in one transaction — balance and history can never diverge. Stock cannot go negative; a write-off must carry a reason                              |
| **Suppliers** | `suppliers`, `purchase_orders`, `purchase_order_items` | Receiving a delivery is the single place a purchase becomes stock and debt, and it refuses to run twice                                                                                                   |
| **Staff**     | `staff_members`, `shifts`, `attendances`               | Minutes worked are frozen at check-out, so a later rate change cannot rewrite past pay. A second check-in is refused                                                                                      |
| **Finance**   | `cash_shifts`, `payments`, `expenses`                  | The Z-report derives expected cash server-side and compares it to the count; payments are refunded, never deleted; only one till may be open                                                              |
| **CRM**       | `customers`, `loyalty_transactions`, `feedbacks`       | Points cannot be overdrawn; the ledger always equals the balance; tier follows lifetime spend                                                                                                             |
| **Analytics** | — (read-only)                                          | Dashboard, daily sales (closed days as explicit zeros), ABC classes, food cost (uncosted dishes report `null`, not a fake 100% margin), channels, peak hours                                              |

- **Money stays an integer in tiyin everywhere**; stock quantities are integers
  in grams / millilitres / pieces for the same reason.
- Cross-module references are **plain IDs without foreign keys** — modules own
  their own schema — with denormalised snapshots where history matters.
- `DatabaseSeeder` now boots a complete demo restaurant (menu, floor plan,
  stations, store, suppliers, team, guests, till, a day of orders), and
  `SeedingSmokeTest` runs it end to end so `migrate --seed` can never silently
  break.
- **`packages/sdk`**: one typed client per module plus `createApi()`; module
  clients never import each other, mirroring the backend boundary.

### Fixed — toolchain and lint (2026-08-10)

- `pnpm lint` crashed on every run: `eslint-plugin-react` defaults to
  `version: "detect"`, and its detection calls `context.getFilename()`, removed
  in ESLint 10. Pinned the React version in the flat configs — **config-only,
  no dependency change** — which surfaced 26 real lint errors that were then
  fixed (23 unescaped apostrophes in Uzbek JSX text, an `<a>` where a `<Link>`
  belonged, and `setState` inside an effect in both theme providers, replaced
  with a lazy initialiser that also removes the theme flash on load).
- Stale `.next` build caches still referenced the deleted university routes and
  broke `tsc`; build artifacts are now cleared as part of verification.

### 💥 Changed — Domain conversion: Smart Campus → Smart Restaurant Campus (2026-08-10)

The platform is no longer a university product. Every layer was rewritten for
restaurants, cafés and canteens. This is a breaking change to _everything_:
module names, roles, routes, database schema, bots and branding.

**Backend (`apps/api/`)**

- **Removed** the 10 university modules: `HR`, `Students`, `Online`, `EDMS`,
  `RTTM`, `Psychology`, `Exams`, `Library`, `Media`, `KPI`
- **Added** the 10 restaurant modules: `Menu`, `Orders`, `Kitchen`, `Tables`,
  `Inventory`, `Suppliers`, `Staff`, `Finance`, `Crm`, `Analytics`
- **`Modules/Menu` fully implemented** as the canonical pattern every other
  module copies: `MenuCategory` + `MenuItem` models, migrations with `tenant_id`,
  factories with real Uzbek dishes, form requests, API resources, controllers
  with Spatie QueryBuilder, RBAC routes, a guest-facing QR-menu endpoint, a
  seeder with a real 8-category / 32-dish menu, and 37 feature tests
- **RBAC rewritten** — 15 restaurant roles (`owner`, `brand-manager`,
  `branch-manager`, `chef`, `cook`, `waiter`, `bartender`, `cashier`, `host`,
  `courier`, `storekeeper`, `accountant`, `marketer`, `super-admin`, `guest`)
- **Money is now an integer in tiyin** (1 UZS = 100 tiyin) — no floats anywhere
  near a bill
- **Multilingual content** via jsonb `{uz, ru, en}` + new
  `App\Models\Concerns\HasTranslations`
- Broadcast channels rewritten: `tenant.{id}.{kitchen,floor,cashdesk,management}`
- `Tenant` no longer references a module model; a tenant is one restaurant
  business, and `settings` carries currency, service charge, VAT and the
  business-day boundary

**Fixed (pre-existing defects found during the conversion)**

- `bootstrap/app.php` called `throttleApi()` but no `api` rate limiter was ever
  registered — **every API request died** with "Rate limiter [api] is not
  defined". Registered `api`, `public` and `auth` limiters in `AppServiceProvider`
- `phpunit.xml` had no suite covering `Modules/*/tests`, so per-module tests were
  collected by nobody and "passed" by never running. Added a `Modules` suite
- `apps/telegram-bots` `normalize_e164()` prefixed every input with `+` before
  parsing, so a national number like `901234567` became `+901234567` instead of
  `+998901234567` — staff could never be linked by phone. `mask_phone()` sliced
  at a hard-coded offset and produced `+998901 *** ** 67`
- `lint-staged` pointed at a PHP binary too old for the locked dependencies

**Frontend**

- `apps/web` — 10 university pages replaced with the restaurant module pages;
  sidebar regrouped by how a shift actually runs (Xizmat / Taomnoma / Boshqaruv);
  dashboard now shows revenue, orders, average cheque, occupied tables,
  stop-list and low stock
- `apps/admin` — tenants page is now "Restoranlar", module registry and
  integrations list rewritten (fiscal module, Payme/Click/Uzum, aggregators)
- Brand colour moved from a university blue to a warm terracotta
- npm scope renamed `@campus/*` → `@restaurant/*`

**Telegram (50 bots)**

- Registry rewritten: 10 live bots (`guest`, `waiter`, `kitchen`, `courier`,
  `manager`, `owner`, `loyalty`, `reservation`, `feedback`, `supplier`) and 40
  planned across operations, marketing, delivery, finance, per-branch and
  per-concept groups
- `student.py` / `parent.py` replaced by `guest.py` / `waiter.py`
- Bot folders `faculty/` → `branch/`, `department/` → `concept/`
- Guest-facing bots no longer demand a phone number before showing the menu

**AI services**

- Removed `antiplagiat` and `dropout`; added `demand_forecast` (with prep-list),
  `food_vision` (dish recognition, plating and hygiene checks) and
  `review_sentiment`
- `chatbot` retargeted to an AI menu assistant that can only recommend dishes
  that are actually sellable; `face_recognition` narrowed to staff attendance

**Infrastructure & docs**

- All identifiers renamed: DB `restaurant_campus`, network `restaurant-net`,
  containers `restaurant-*`, bucket `restaurant-campus`, domain
  `restaurant-campus.uz`
- `HEMIS` integration replaced with the fiscal module (O'zbekiston online cash
  register) and delivery aggregators; E-IMZO kept for supplier contracts
- `docs/CAMPUS_30_MODULLAR.md` → `docs/RESTAURANT_30_MODULLAR.md` (fully
  rewritten 30-module restaurant specification)
- `docs/modules/01-hr.md` → `docs/modules/01-menu.md` (canonical module spec)

### Added — Telegram subsystem refactor (2026-05-25)

- **Python (`apps/telegram-bots/`)**:
  - Split monolithic `keyboards/__init__.py` and `states/__init__.py` into per-bot files (`keyboards/{common,student,parent}.py`, `states/onboarding.py`); `__init__.py` files now do re-exports only — scales cleanly to 50 bots
  - New shared layers: `core/exceptions.py` (CampusBotError hierarchy), `core/fsm_storage.py` (Redis FSM builder), `handlers/common.py` (`/help`, `/cancel` builders), `handlers/errors.py` (global error handler), `services/{notifications,analytics}.py`, `filters/{role,linked}.py`, `models/{dto,enums}.py`, `utils/{phone,format,webapp}.py`, `middlewares/{auth,feature_flags}.py`, `bots/_base.py` (`build_base_router`)
  - New `bots/{phase1,phase2,ai,faculty,department}/` subdirectories with `__init__.py` + `README.md` for future bot handlers — `bot_manager._load_router` auto-discovers any of the 5 paths
  - `core/bot_manager.py` rewired: 5-path import lookup, AuthMiddleware + FeatureFlagMiddleware wired, global error handler registered, `bot._campus_bot_key` tag set for middleware lookups
  - `locales/` placeholder for future Babel-based aiogram-i18n migration
  - 3 new test files: `test_utils_phone.py`, `test_utils_format.py`, `test_bot_manager.py` (path discovery)
- **Laravel (`apps/api/Modules/TelegramBots/`)**:
  - `config/config.php` now exposes `internal_token`, `bots_service_url`, `channels` (9 default opt-ins), `outbound` defaults — previously a config gap caused 500s
- **Admin UI (`apps/admin/src/app/(admin)/telegram/`)**:
  - New per-bot dynamic route `[botKey]/{page,settings,users,messages,commands,broadcast}` (6 pages)
  - New global subroutes: `settings`, `audit`, `users`, `users/[id]`, `messages`, `subscriptions` (6 pages)

### Added — Real HR module (2026-05-25)

- Replaced HR scaffold with production-grade implementation:
  - `Employee` model (LogsActivity + SoftDeletes + encrypted face_descriptor + accessors + scopes)
  - `EmployeeController` with Spatie QueryBuilder (filter[search/department/faculty/status/contract_type], sort, include=user, paginate)
  - `StoreEmployeeRequest` / `UpdateEmployeeRequest` with Uzbek validation messages
  - `EmployeeResource` (hides sensitive fields, conditional user include)
  - Migration: `employees` table (18 columns, 3 indexes, soft deletes, encrypted face_descriptor TEXT)
  - Factory + 3 states (`onLeave`, `terminated`, `withLinkedUser`)
  - `HRDatabaseSeeder` — 33 sample employees (25 active + 5 on leave + 3 terminated)
  - `HRController` rewritten as module info endpoint (counts + endpoint discovery)
  - Routes: `/api/v1/hr` + `/api/v1/hr/employees` (REST) — each gated by Spatie `PermissionMiddleware::using('hr.{action}')`
  - **13 feature tests** in `EmployeeControllerTest` covering auth/RBAC/CRUD/validation/search/pagination/soft-delete
- New module spec: `docs/modules/01-hr.md` (full spec per template — first real `docs/modules/NN-name.md` doc)

### Added — Frontend polish (2026-05-25)

- `apps/web/src/app/page.tsx` and `apps/admin/src/app/page.tsx` no longer the create-next-app default — both redirect to `/dashboard`
- Real login form at `apps/web/src/app/(auth)/login/page.tsx` — react-hook-form + zod + Sanctum SPA flow, toast feedback, disabled state while submitting

### Added — Initial scaffold

- Monorepo: `apps/{web,admin,api,ai-services,mobile,telegram-bots}` and `packages/{ui,types,config,i18n,utils,sdk}`
- Root configuration: `.gitignore`, `.editorconfig`, `.prettierrc.json`, `.env.example`, `tsconfig`, Turborepo, pnpm catalog
- Docker Compose for local dev (Postgres 16, Redis 7, ClickHouse, MinIO, Keycloak 26, Mailpit, Meilisearch, +3 monitoring)
- Documentation skeleton (`docs/`) with architecture, modules, decisions, deployment folders
- Infrastructure folder with 4 multi-stage Dockerfiles, Nginx config with rate limits + admin subdomain, Prometheus, backup/deploy/setup-server scripts
- CI workflow (`.github/workflows/ci.yml`) — 3-stack matrix (TS lint/test/build, Laravel migrate/test, Python ruff/mypy/pytest)
- 6 ADRs covering: ADR culture, Laravel choice, hybrid monorepo, modular monolith, separate super admin, telegram multi-bot

### Phase 1 modules

- ✅ **HR** — Employee model + REST API + 13 tests (real implementation)
- ⏳ Students, Online Platform, EDMS, RTTM, Psychology, Exams, Library, Media, KPI (scaffolds; HR template applies)

---

[Unreleased]: https://github.com/<owner>/smart-restaurant-campus/compare/v0.0.0...HEAD
