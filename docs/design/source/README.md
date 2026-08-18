# Handoff: Smart Restaurant OS — POS & Restaurant Management Platform

## Overview

A complete multi-tenant restaurant management SaaS for the Uzbek market, covering
two products:

1. **Smart Restaurant OS** — the product itself. 8 user roles, 5 device surfaces,
   ~30 modules. Everything a restaurant group needs from the first order of the day
   to the monthly VAT return.
2. **Smart Restaurant Cloud — Sayt** — the public marketing site and the sign-in
   surface that feeds into the product.

The system is **trilingual (Uzbek Latin / Russian / English)** and ships a full
**light and dark theme**. Currency is UZS (`so'm`), formatted with thin-space
thousand separators (`18 420 000`).

---

## About the design files

The two `.dc.html` files in this bundle are **design references written in HTML**.
They are prototypes that show intended look, copy, and behaviour — they are **not
production code to copy directly.**

The task is to **recreate these designs in the target codebase's existing
environment** (React, Vue, Next.js, native — whatever the team already runs) using
its established routing, state, data-fetching, and component conventions. If no
environment exists yet, choose the framework that best fits a data-dense B2B
product with an offline-capable tablet client, and implement the designs there.

The HTML files use a small custom runtime and inline styles. **Do not port that
runtime.** Port the *design*: the layouts, the tokens, the copy, the state machine,
the interaction rules.

## Fidelity

**High fidelity.** Colours, typography, spacing, radii, shadows, motion, and copy
are all final and specified below. Recreate the UI pixel-accurately using the
codebase's own component library where one exists; where it doesn't, build to the
token table in §7.

Two caveats:

- Data is hand-authored sample data. Every number, name, and branch is illustrative.
- Charts are hand-built with CSS (flex bars, SVG line/donut). Substitute the team's
  charting library, but keep the restraint: no gridlines, no legends where a label
  will do, no 3D, no gradient fills.

---

## 1. Product architecture

### 1.1 Tenancy

```
Platform (Smart Restaurant Cloud)
└── Tenant / Restaurant          (42 in the sample data)
    └── Branch                    (118 total; 5 for the primary tenant)
        └── Terminal              (POS tablets, KDS screens)
```

The **primary tenant** in the prototype is *Smart Restaurant* — a modern Uzbek
restaurant and fast-casual brand with 5 branches: Chilonzor, Yunusobod, Sergeli,
Mirzo Ulug'bek (Tashkent) and Termiz.

### 1.2 Roles

Eight roles. A user may hold more than one (small restaurants combine
waiter+cashier, kitchen+storekeeper).

| Key | Role | Uz label | Home screen | Scope |
|---|---|---|---|---|
| `superadmin` | Platform operator | Super admin | Platform overview | All tenants |
| `owner` | Restaurant owner | Restoran egasi | Owner dashboard | All branches of one tenant |
| `manager` | Branch manager | Menejer | Shift dashboard | One branch |
| `accountant` | Accountant | Buxgalter | Finance dashboard | All branches, finance only |
| `waiter` | Waiter | Ofitsiant | My shift | Own tables, one branch |
| `cashier` | Cashier | Kassir | Till | One till, one branch |
| `kitchen` | Kitchen / chef | Oshpaz | KDS | One station, one branch |
| `warehouse` | Storekeeper | Omborchi | Stock | One branch |

Switching role in the prototype is a demo affordance (a dropdown in the top bar).
**In production this is not a control** — role comes from the session. Keep it
behind a dev flag or drop it.

### 1.3 Module → role matrix

`●` full access · `○` read only · blank = module hidden from the sidebar entirely.

| Module | owner | manager | accountant | waiter | cashier | kitchen | warehouse |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Dashboard | ● | ● | ● | ● | ● | ● | ● |
| Orders | ● | ● | | ● | ● | | |
| Tables / floor | ● | ● | | ● | ● | | |
| Kitchen (KDS) | ● | ● | | ○ | | ● | |
| Menu | ● | ● | | ○ | | ○ | |
| Inventory | ● | ● | ○ | | | | ● |
| Stock operations | ● | ● | | | | | ● |
| Suppliers | ● | ● | ● | | | | ● |
| Staff | ● | ● | ○ | | | | |
| Rota & bookings | ● | ● | | ○ | | | |
| CRM | ● | ● | | ○ | | | |
| Finance | ● | | ● | | | | |
| Bookkeeping | ● | | ● | | | | |
| Till / cash | ● | ● | ○ | | ● | | |
| Loss prevention | ● | ● | ● | | | | |
| Analytics | ● | ○ | ● | | | | |
| Reports | ● | ○ | ● | | | | |
| Branches | ● | | ○ | | | | |
| Settings | ● | ○ | | | | | |

Hidden ≠ forbidden. **Enforce authorisation server-side**; the sidebar filter is
presentation only.

### 1.4 Permission gates (require manager PIN)

These actions open a manager-approval modal on the POS:

- discount above the role's own ceiling (waiter 0%, senior waiter 5%, manager 20%)
- voiding a line already fired to the kitchen
- voiding a closed ticket
- refunding a payment
- opening the till outside a sale
- editing a price at point of sale

Modal: 4-digit numeric keypad, the reason for the request stated in one line at the
top, `Bekor qilish` / approval. Log every approval with approver, requester,
amount, and timestamp.

---

## 2. Device surfaces

| Surface | Target | Notes |
|---|---|---|
| Back office | Desktop 1440–1920 | Sidebar + top bar + scrolling main |
| POS | Tablet, landscape, 1024–1366 | Touch-first, gloves-on: 44 px minimum hit target, 56 px on the keypad |
| KDS | Wall-mounted TV, 1920×1080 | Read at 2–3 m; no hover states; ticket columns |
| Manager mobile | Phone, 390–430 | Read-mostly; the owner's morning check |
| Till | Countertop, 1024+ | Cashier screen + payment panel |

The prototype exposes a surface switcher in the status bar; production picks the
surface from the device/terminal registration.

---

## 3. Screens

### 3.1 App shell

**Layout** — CSS grid, two columns.

- **Sidebar**: 252 px wide, `--surface` background, 1 px right border
  (`--border`). Sections with `--sp-4` gaps; each section has an overline label
  (11 px, 600, `.08em` tracking, uppercase, `--fg-subtle`). Nav items are 36 px
  tall, 10 px radius, 12 px gap between a 18 px stroke icon and a 14 px/500 label.
  Active item: `--bg-muted` background, `--fg` text, icon `--brand-600`. Hover:
  `--bg-subtle`.
  - **Collapsed rail**: 76 px. Labels get `width:0; opacity:0; overflow:hidden` —
    they must take **zero width**, not just fade, or the rail overflows.
  - Bottom of the sidebar holds Settings and the collapse toggle, pinned.
- **Top bar**: 64 px tall, sticky, 1 px bottom border, `--surface`.
  Left: page title (20 px / 600 / `-.012em`). Right, in order, 14 px gaps:
  branch switcher · notification bell · language segmented control + theme toggle
  (one bordered group, hairline divider between them) · primary CTA · divider ·
  user block (avatar + name + chevron).
  - Progressive disclosure as width shrinks: user name hides at 1400, CTA label at
    1260, branch name at 1140, nav labels collapse at 1200.
- **Status strip** below the top bar: 44 px, `--bg-subtle`, live chips on the left
  (tables occupied, low-stock link), surface switcher on the right, non-scrolling.
- **Main**: `overflow-y:auto`, max content width 1440 px, `--sp-7` (32 px) padding.

**Responsive breakpoints**

| Width | Change |
|---|---|
| ≤1200 | Sidebar → 76 px icon rail |
| ≤1024 | Two-column screens → one column; sticky side panels join the flow |
| ≤820 | Sidebar becomes an off-canvas drawer behind a hamburger; POS stacks vertically; KDS hides stats |
| ≤640 | Surface switcher hides |
| ≤560 | Phone surface renders full-bleed, no device frame |

---

### 3.2 Dashboards (one per role)

Every dashboard follows the same skeleton and differs only in content:

```
greeting line      (eyebrow date · 34 px display headline · one-sentence lede)
period toggle      (Bugun / Hafta / Oy — segmented, top right)
KPI row            (3-up on desktop, own card each, 12 px gap)
two-column body    (1.4fr primary panel + 1fr side panel)
```

**KPI card** — 20 px padding, 1 px `--border`, 14 px radius, `--surface`.
Label 12 px/500 `--fg-subtle` · value 34 px display 700 `-.022em` · unit and delta
on one 12 px line (delta `--success-600` up, `--danger-600` down) · a 3 px progress
rail at the bottom with a caption naming the target. **The rail must carry meaning**
(attainment against a target) — never decoration.

| Role | KPIs | Primary panel | Side panel |
|---|---|---|---|
| Owner | Revenue, orders, average ticket, gross profit, expenses | 12-month revenue line + branch table | Low stock, recent orders |
| Manager | Open orders, average wait, cancellations, covers | Waiter leaderboard, kitchen speed by station | Floor donut (32 tables), who's on shift, approval queue |
| Accountant | MTD revenue, expenses vs budget, net margin, unpaid invoices | 6-month cash-flow bars | Payment-method donut, upcoming payments, taxes |
| Warehouse | Low stock, expiring, deliveries today, waste % | Stock-level donut (142 SKUs), incoming deliveries | Most-consumed items |
| Waiter | My orders, covers, sales, average ticket (all vs shift target) | My active orders, my 6 tables as cards | My top sellers · big **Zalga o'tish** CTA |
| Cashier | Cash in drawer, payments today, refunds, tables awaiting payment | Recent payments | Payment-method donut · **Kassaga o'tish** CTA |
| Super admin | Restaurants, active branches, MRR, failing payments | 12-month growth line, tenant table | Donut by plan, system health |

**Donut spec** — SVG, 132 px, stroke width 18, `stroke-linecap:butt`, rotated −90°.
Centre holds the total (24 px display 700) with a 11 px label under it. Legend sits
below: 8 px colour dot · name · then value and share, **never repeating the same
number twice**.

**Bar chart spec** — flex row, `align-items:flex-end`, fixed container height
(e.g. 74 px or 160 px), each bar `flex:1` with **height in px, not %**
(percentage heights collapse inside a flex row whose height is not resolved).
Radius `3px 3px 0 0`. Past bars `--brand-200`, current `--brand-500`, over-threshold
`--warning-500`.

**Line chart spec** — inline SVG, `preserveAspectRatio="none"`, 2 px
`--brand-500` polyline, `--brand-50` area fill at 40% opacity, a single 4 px circle
on the final point. No axes, no gridlines; the delta is stated in text at the top
right.

---

### 3.3 POS — order entry

Three columns on tablet landscape; stacked on ≤820.

1. **Categories** — 108 px column, or a horizontal scroll strip when stacked.
   Each tile 72 px tall, name + item count.
2. **Items** — responsive grid, `minmax(150px, 1fr)`, 12 px gap. Tile: name
   (15 px/600), price (14 px `--fg-muted`), 88 px tall, 12 px radius.
   **86'd item state**: `opacity .45`, dashed border, a `Tugadi` chip; tapping
   raises a toast rather than adding the line.
3. **Ticket** — 380 px (326 px ≤1200), sticky. Table name and cover count at the
   top, lines in the middle, totals and actions pinned at the bottom.
   - Line: name, modifiers as a 12 px `--fg-subtle` second row, quantity stepper
     (36 px round buttons), line total, swipe/× to remove.
   - Actions: `Oshxonaga yuborish` (primary, full width, 52 px), then a row of
     secondary actions — split, merge, transfer, discount, pay.

**Order lifecycle**

```
draft → sent → accepted → cooking → ready → served → paid
                  └──────── cancelled (needs approval past `sent`) ────┘
```

**Split / merge / transfer**

- *Split*: by line, by cover, or by amount. Show both resulting tickets side by
  side before confirming.
- *Merge*: pick target ticket; warn if either has a payment against it.
- *Transfer*: pick destination table; the source table returns to `available`
  unless lines remain.

---

### 3.4 KDS — kitchen display

Full-bleed, dark by default (kitchens are bright; the screen should not glare).
Station tabs across the top: `Hammasi · Grill · Issiq · Salat · Ichimlik`.
Each station sees only its own lines.

**Ticket card** — 320 px column, 14 px radius, 2 px left border in the state colour.
Header: table + order number (20 px/700), elapsed timer (mono, 18 px).
Body: one row per line — quantity chip, item name (18 px/600), modifiers beneath in
16 px. Footer: the single state-advancing button, full width, 52 px.

**States and colour** — never colour alone; every state also has a label and a
distinct border weight.

| State | Uz | Colour | Border |
|---|---|---|---|
| New | Yangi | `--brand-500` | 2 px solid |
| Accepted | Qabul qilindi | `--accent-500` | 2 px solid |
| Cooking | Tayyorlanmoqda | `--warning-500` | 2 px solid |
| Ready | Tayyor | `--success-500` | 3 px solid |
| Served | Berildi | `--n-400` | 1 px dashed |

Tickets past **10 minutes** turn their timer `--danger-500` and pulse the border
once (no looping animation — one 320 ms pulse on crossing the threshold).

**Stop list (86)** — a `--danger-500` button in the KDS header opens a sheet of the
12 most-used items. Toggling one **must propagate to every POS terminal
immediately** (websocket/broadcast). This is the single most valuable cross-surface
behaviour in the product; do not implement it as a polled refresh.

---

### 3.5 Floor / tables

Grid of table cards, grouped by zone. Card: number (24 px display 700), covers,
occupied duration, current ticket total, server initials.

| Status | Uz | Treatment |
|---|---|---|
| Available | Bo'sh | `--surface`, 1 px `--border`, no fill |
| Occupied | Band | `--brand-50` fill, `--brand-200` border, filled dot |
| Reserved | Bandlangan | `--surface`, dashed `--brand-300` border, clock icon |
| Cleaning | Tozalanmoqda | `--bg-muted` fill, hatched left edge |
| Awaiting payment | To'lov kutmoqda | `--warning-50` fill, `--warning-500` border, ring icon |

Status is carried by **fill + border style + icon + label** — never colour alone.

---

### 3.6 Till (cashier)

- **Closed**: a single card asking for the opening float, one input, one button.
- **Open**: KPI row (cash in drawer, shift sales, tickets, refunds, drops), a cash
  movement log (time, type, amount, who), and four actions —
  `Inkassatsiya` (drop to safe), `X-hisobot` (read without closing),
  `Z-hisobot` (count → variance → close), fiscal module status with a live dot.
- **Z report flow**: enter counted cash → system shows expected, counted, and
  variance with the variance coloured → confirm → till closes and the shift is
  locked.

---

### 3.7 Bookkeeping

Five tabs.

1. **Expenses** — add form (category from 7, note, amount), list with a
   paid/unpaid toggle per row, category breakdown beside it, budget attainment KPI.
2. **Payables** — supplier, amount, days overdue (red past due), pay action.
3. **Payroll** — fund total as a % of revenue, advance paid, remaining; per-employee
   table: salary, bonus, deductions, net.
4. **Period close** — months listed with state (closed / open / in progress);
   closing locks the period. Beside it, **reconciliation**: cash, bank, card, and
   e-wallet each showing system vs actual and the delta.
5. **Documents** — e-invoicing (Didox) queue, VAT return status (soliq.uz), 1C
   export, P&L.

---

### 3.8 Loss prevention

Owner/manager/accountant only.

- Four KPIs: voided tickets, lines deleted after firing, discounts (absolute and
  as a % of revenue), cash variance.
- **Per-employee table** with a risk bar: voids, post-fire deletions, discount
  total, risk score. Bar `--danger-500` above 60, `--warning-500` 30–60,
  `--n-200` below.
- **Suspicious events feed** — time, who, what, amount, severity dot.

Risk score is a heuristic, not an accusation. Label it as such in the UI.

---

### 3.9 Menu profitability

Four quadrant cards — **Yulduzlar** (high margin, high volume), **Ish otlari**
(low margin, high volume), **Jumboqlar** (high margin, low volume), **Itlar**
(low on both) — each with a count and a one-line recommendation.

Below, a table: dish, units sold, price, cost, margin bar, profit, quadrant chip.

---

### 3.10 Stock operations

Five tabs: **Receiving** (ordered vs delivered vs variance, shortfalls in red),
**Stock count** (system quantity beside a field for the counted quantity, live
delta), **Waste** (item, quantity, one of 5 reasons), **Transfer** (branch to
branch with state), **Recipe cards** (per dish: ingredients, quantities, unit costs,
total cost, margin).

Recipe cards are what make automatic depletion and true food cost possible — treat
them as the foundation of the inventory module, not an add-on.

---

### 3.11 Marketing site

Sticky 64 px nav → hero (headline, lede, two CTAs, trial terms, product mock) →
stat strip (4-up) → product (6 cards) → roles (7 rows) → compliance (2-up) →
pricing (3 plans, middle highlighted) → testimonials (3) → FAQ (accordion, one
open at a time) → sign-in → dark contact block → footer.

Sections are 112 px tall vertically (72 px ≤900), max width 1200 px.

**Pricing**: `Start` 2 400 000, `Growth` 6 900 000 (highlighted: `--brand-500`
border + `--shadow-lg` + filled CTA), `Enterprise` custom. Prices must not wrap —
`white-space:nowrap`.

### 3.12 Sign-in

Three tabs in one card:

1. **Email** — owner, manager, accountant. Email, password, remember me, reset link.
   Branch is chosen *after* authentication when the user spans several.
2. **PIN** — waiter, cashier, kitchen. Four 44×52 px cells and a 3×4 keypad of
   56 px keys (`1–9`, `C`, `0`, `⌫`). On the fourth digit, authenticate and open
   the shift. Three failures → lock and require a manager reset.
3. **Platform** — super admin. Email + 6-digit TOTP, dark submit button, an amber
   notice stating every sign-in is logged and visible to the restaurant owner.
   Sessions expire after 30 minutes.

---

## 4. Interactions & behaviour

### 4.1 Motion

| Token | Value | Used for |
|---|---|---|
| `--dur-fast` | 120 ms | Hover, press |
| `--dur-med` | 200 ms | Panels, toggles, accordions |
| `--dur-slow` | 320 ms | Drawers, sheets, page transitions |
| `--ease-standard` | `cubic-bezier(.4,0,.2,1)` | Everything by default |
| `--ease-spring` | `cubic-bezier(.34,1.38,.64,1)` | Success checkmarks only |

No parallax, no entrance animation on scroll, no looping motion anywhere. A KDS
ticket crossing the late threshold pulses **once**.

### 4.2 States

- **Hover** (pointer surfaces only): background darkens ~4%. Never a hue shift.
- **Press**: `scale(.97)` for 100 ms. Required on POS and KDS.
- **Focus**: 3 px `--focus-ring` outside the element, 2 px offset. Never removed.
- **Disabled**: `--fg-disabled` text, no background change, `cursor:not-allowed`.
- **Loading**: skeleton blocks matching the final layout. Spinners only for actions
  under a second.
- **Empty**: one line of plain text stating what would be here and, when there is
  one, a single action. Empty states must not occupy a full panel height.
- **Error**: state what failed and what to do. `"Couldn't load results. Try again."`
  never `"Oops!"`.

### 4.3 Toasts

Fixed, bottom centre, 32 px from the edge. `--n-900` background, white text,
success check in `--success-500`, 12 px radius, `--shadow-xl`. Auto-dismiss at
2.6 s. One at a time — a new toast replaces the current one.

### 4.4 Keyboard

- `⌘K` / `Ctrl+K` — global search (specified, not yet built).
- `Esc` closes the topmost overlay.
- Tab order follows visual order; modals trap focus and restore it on close.
- The KDS is fully operable from a numeric keypad: digit selects a ticket, `Enter`
  advances its state.

### 4.5 Offline

POS and till must keep taking orders and printing receipts with no network:
queue writes locally, reconcile on reconnect, show a persistent but unobtrusive
offline chip in the status strip. The KDS may run read-only while offline.

---

## 5. State model

### 5.1 Session

```
session = {
  user:      { id, name, initials, roles[], pin? },
  activeRole,
  tenantId,
  branchId,
  terminalId,
  locale:    'uz' | 'ru' | 'en',
  theme:     'light' | 'dark',
  shiftId?,          // set for waiter/cashier/kitchen after PIN entry
}
```

`activeRole`, `branchId`, `locale`, and `theme` all persist across reloads.
**Never** clear storage the user did not write.

### 5.2 Core entities

```
Order        { id, branchId, tableId, waiterId, state, lines[], covers,
               discount, payments[], openedAt, closedAt }
OrderLine    { id, itemId, qty, modifiers[], price, state, firedAt }
Table        { id, zone, number, seats, status, orderId?, occupiedSince? }
MenuItem     { id, categoryId, name{uz,ru,en}, price, cost, station, is86 }
RecipeCard   { itemId, ingredients: [{ stockId, qty, unit, unitCost }] }
StockItem    { id, name, unit, qty, reorderPoint, expiresAt? }
Shift        { id, branchId, userId, openedAt, closedAt, openingFloat,
               countedCash, variance }
Expense      { id, branchId, categoryId, note, amount, paid, date }
Payable      { id, supplierId, amount, dueDate, paidAt? }
Approval     { id, requesterId, approverId, action, amount, reason, at }
Notification { id, severity, title, body, module, targetId, readAt? }
```

### 5.3 Real-time channels

| Channel | Producers | Consumers |
|---|---|---|
| `order.*` | POS, KDS | POS, KDS, floor, dashboards |
| `stoplist.*` | KDS | **All POS terminals** |
| `table.*` | POS, floor | Floor, POS, host |
| `call.*` | Table/guest, KDS ready | Waiter surface |
| `notification.*` | Server rules | Manager, owner, accountant |

### 5.4 Derived values

Compute server-side, not in the client: gross margin, food cost %, labour cost %,
menu quadrant assignment, risk score, target attainment, cash variance. The client
displays; it does not decide.

---

## 6. Content rules

- **Sentence case everywhere.** Never Title Case for buttons, nav, or headers.
- **No exclamation marks. No emoji** anywhere in the product UI.
- **Specificity over adjectives** — `"4 pozitsiya o'chirildi"` beats `"suspicious activity"`.
- **Numbers**: UZS with thin-space separators (`18 420 000`); percentages to one
  decimal (`12.4%`); currency unit `so'm` as a separate muted token beside the number.
- **Three locales are equal.** Uzbek is the primary authoring language, Russian is
  neutral-professional, English is the most concise. Never machine-translate.
- **Dates**: `Seshanba, 11-avgust` (uz) · `Вторник, 11 августа` (ru) ·
  `Tuesday, 11 August` (en).

---

## 7. Design tokens

### 7.1 Colour — light

| Token | Hex | Use |
|---|---|---|
| `--brand-50` | `#EEF5FF` | Selected row tint, chart fill |
| `--brand-100` | `#DBE9FE` | |
| `--brand-200` | `#BDD7FC` | Past bars in charts |
| `--brand-300` | `#8DBBF9` | Reserved table border |
| `--brand-400` | `#5897F3` | |
| `--brand-500` | `#2E74EA` | **Primary** — CTAs, active state, current bar |
| `--brand-600` | `#1C5AD1` | Primary hover, links, active icons |
| `--brand-700` | `#1947A8` | Link hover |
| `--brand-800` | `#1A3D85` | |
| `--brand-900` | `#1A3469` | |
| `--accent-50` | `#ECFBF6` | |
| `--accent-100` | `#D1F5E8` | |
| `--accent-500` | `#0FB48A` | Secondary emphasis, accepted state. **Never a primary CTA** |
| `--accent-600` | `#0A8F6C` | |
| `--accent-700` | `#086F54` | |
| `--success-50` | `#ECFDF3` | |
| `--success-500` | `#12B76A` | Ready state, positive delta dot |
| `--success-600` | `#039855` | Positive delta text |
| `--success-700` | `#027A48` | |
| `--warning-50` | `#FFFAEB` | Awaiting-payment fill, notice blocks |
| `--warning-500` | `#F79009` | Cooking state, over-threshold bars |
| `--warning-600` | `#DC6803` | Warning text |
| `--warning-700` | `#B54708` | |
| `--danger-50` | `#FEF3F2` | |
| `--danger-500` | `#F04438` | Late timer, high risk, 86 button |
| `--danger-600` | `#D92D20` | Negative delta text, overdue |
| `--danger-700` | `#B42318` | |
| `--rating-star` | `#FFB020` | Star glyphs only |

**Neutrals** (warm-leaning): `--n-0 #FFFFFF` · `--n-25 #FCFCFD` ·
`--n-50 #F8F9FB` · `--n-100 #F1F3F7` · `--n-150 #E7EAF0` · `--n-200 #D9DEE6` ·
`--n-300 #BFC6D2` · `--n-400 #98A1B0` · `--n-500 #6E7789` · `--n-600 #4C5568` ·
`--n-700 #333B4C` · `--n-800 #1F2533` · `--n-900 #0F1320`

**Semantic layer** — components use these, never the ramp directly:

```
--bg            n-0        --fg            n-900
--bg-subtle     n-50       --fg-muted      n-600
--bg-muted      n-100      --fg-subtle     n-500
--surface       n-0        --fg-disabled   n-400
--border        n-150      --fg-inverse    n-0
--border-strong n-200      --fg-brand      brand-600
--divider       n-100      --fg-link       brand-600
--focus-ring    color-mix(in oklch, brand-500 55%, transparent)
```

### 7.2 Colour — dark

Dark mode is a **re-mapping of the semantic layer, not an inversion**. Only the
semantic tokens change; the brand ramp stays put except where contrast demands a
lighter step.

```
--bg            #0B0E16     --fg            #EDF0F5
--bg-subtle     #12161F     --fg-muted      #9AA3B4
--bg-muted      #1A1F2B     --fg-subtle     #79839A
--surface       #12161F     --fg-disabled   #566073
--surface-raised#1A1F2B     --fg-inverse    #0B0E16
--border        #232A38     --fg-brand      #7FB0FF
--border-strong #2E3648     --fg-link       #7FB0FF
--divider       #1C2230
```

Rules: surfaces are separated by **border and elevation, not tint saturation**;
`--brand-500` stays the CTA fill (white text clears AA on it); semantic tints
(`--success-50` etc.) become 12% alpha of their 500 over `--surface`; shadows are
replaced by borders — a shadow on a dark background reads as dirt.

### 7.3 Typography

- **Display** — Inter Tight (600/700/800). Headlines and any number above 24 px.
- **UI / body** — Inter (400/500/600/700).
- **Mono** — JetBrains Mono. IDs, invoice numbers, verification codes, timers.

The intended target is SF Pro; Inter / Inter Tight are the open-licence stand-ins.
If the team holds an SF Pro webfont licence, swap the families and keep every other
value.

| Token | px | Typical use |
|---|---|---|
| `--text-3xs` | 10 | Dense table meta |
| `--text-2xs` | 11 | Overlines, chart axis |
| `--text-xs` | 12 | Captions, KPI labels |
| `--text-sm` | 13 | Secondary UI, table cells |
| `--text-md` | 15 | **Body default** |
| `--text-lg` | 17 | Lead paragraphs |
| `--text-xl` | 20 | Page titles, card headings |
| `--text-2xl` | 24 | Donut centre, section heads |
| `--text-3xl` | 30 | |
| `--text-4xl` | 38 | Marketing h2 |
| `--text-5xl` | 48 | |
| `--text-6xl` | 60 | Marketing hero |
| `--text-7xl` | 76 | |

Line heights: `--lh-tight 1.12` · `--lh-snug 1.25` · `--lh-normal 1.45` ·
`--lh-relaxed 1.6`
Weights: 400 / 500 / 600 / 700 / 800
Tracking: `--tracking-tight -.022em` (display) · `--tracking-snug -.012em` ·
`--tracking-normal 0` · `--tracking-wide .02em` · `--tracking-caps .08em`

Minimums: **15 px body**, 13 px for dense tables, 12 px captions used sparingly.
KDS never below 16 px; item names 18 px.

### 7.4 Spacing — 4 px base

`--sp-1 4` · `--sp-2 8` · `--sp-3 12` · `--sp-4 16` · `--sp-5 20` · `--sp-6 24` ·
`--sp-7 32` · `--sp-8 40` · `--sp-9 48` · `--sp-10 64` · `--sp-11 80` ·
`--sp-12 96`

Card padding 20 px minimum. Product sections separated by 32 px; marketing sections
by 64 px or more. Mobile gutter 16 px.

### 7.5 Radii

`--radius-xs 4` · `--radius-sm 6` · `--radius-md 10` (inputs, small buttons) ·
`--radius-lg 14` (cards) · `--radius-xl 20` (modals, sheets) ·
`--radius-2xl 28` (hero surfaces) · `--radius-pill 999`

### 7.6 Shadows

```
--shadow-xs  0 1px 2px rgba(16,24,40,.04)
--shadow-sm  0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.06)
--shadow-md  0 4px 8px -2px rgba(16,24,40,.06), 0 2px 4px -2px rgba(16,24,40,.04)
--shadow-lg  0 12px 16px -4px rgba(16,24,40,.06), 0 4px 6px -2px rgba(16,24,40,.03)
--shadow-xl  0 20px 24px -4px rgba(16,24,40,.08), 0 8px 8px -4px rgba(16,24,40,.03)
--shadow-focus 0 0 0 3px var(--focus-ring)
```

**Borders first, shadows second.** Most surfaces get a 1 px hairline. Shadows are
for things that float: dropdowns, modals, toasts, the highlighted price card.
No coloured glows, no neumorphism, no inner shadows.

---

## 8. Component inventory

Buttons (primary / secondary / ghost / danger, 5 sizes) · icon buttons ·
segmented controls · inputs · selects · numeric steppers · numeric keypad ·
search field · filter chips · dropdown menus · tables (sortable, sticky header,
horizontal scroll) · cards · KPI cards · tabs · modals · drawers / off-canvas
sidebar · bottom sheets · toasts · badges and status chips · avatars · progress
rails · donut / bar / line charts · date range picker · pagination · empty states ·
skeletons · error states · confirmation dialogs · notification panel · approval
modal.

---

## 9. Accessibility

- Contrast: 4.5:1 body, 3:1 for 18 px+ and UI boundaries — verified in both themes.
- **Status is never carried by colour alone.** Every state has a label, and most
  also carry an icon or a border-style change (see §3.4, §3.5).
- Focus is always visible; outlines are never removed.
- Semantic landmarks: `header`, `nav`, `main`, `aside`. One `h1` per screen.
- Live regions: toasts `role="status"`; the KDS ticket list `aria-live="polite"`.
- Hit targets: 44 px minimum on POS/KDS, 32 px on desktop back office.
- Every icon-only control needs an accessible name; the collapsed sidebar rail
  needs a `title` and an `aria-label` per item.
- Respect `prefers-reduced-motion`: drop the press-scale and the late-ticket pulse.

---

## 10. What is designed but not built

Carry these into the backlog — they are specified above but have no screen yet:

- Global search (`⌘K`)
- Restaurant-level audit log (the platform-level one exists)
- Payroll disbursement and bonus rules beyond the summary table
- Marketing: SMS campaigns, promotions, birthday triggers
- Purchase orders to suppliers (suppliers are a list only)
- Delivery and courier flow
- Host / reservations as a distinct role
- Fixed assets and depreciation

---

## 11. Assets

- **Fonts** — Inter, Inter Tight, JetBrains Mono (Google Fonts). Self-host in
  production.
- **Icons** — [Lucide](https://lucide.dev), 1.75 px stroke at 24×24, rounded caps.
  Vendor the subset used rather than pulling the CDN bundle.
- **Imagery** — none in the prototype. If photography is added: real kitchens and
  real dishes, daylight, natural colour; no stock "chef with folded arms". Text over
  imagery gets a white→transparent protection gradient.
- **Illustration** — avoided. If unavoidable: line only, single colour,
  `--brand-600`.
- **Logo** — placeholder `SR` monogram, Inter Tight 700 at `-.02em` in a 30 px
  `--brand-500` rounded square. Replace with the real mark.

---

## 12. Files in this bundle

| File | What it is |
|---|---|
| `Smart Restaurant OS.dc.html` | The product. All 8 roles, 5 surfaces, ~30 modules, both themes, all three locales. Use the role switcher in the top bar to move between roles. |
| `Smart Restaurant Cloud — Sayt.dc.html` | Marketing site and the three sign-in paths. |
| `README.md` | This document. |

Both HTML files open directly in a browser with no build step.

---

## 13. Suggested build order

1. Design tokens and the primitive components (§7, §8), both themes.
2. App shell, routing, session, role gating, locale switching.
3. Menu, tables, order model, POS order entry.
4. KDS + the stop-list broadcast — the first real-time surface.
5. Payment, till open/close, X and Z reports.
6. Inventory with recipe cards and automatic depletion.
7. Dashboards, one role at a time, starting with manager.
8. Bookkeeping, payables, payroll, period close.
9. Loss prevention, menu profitability, labour cost.
10. Multi-branch comparison, targets, super admin.
11. Marketing site.

Ship 1–5 before anything else: that is the smallest set a real restaurant can
actually open its doors with.
