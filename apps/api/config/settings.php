<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Restoran sozlamalari — the schema for `tenants.settings`
|--------------------------------------------------------------------------
|
| `tenants.settings` is a jsonb column, which means it accepts anything and
| therefore means nothing. The console writes to it from eight panels, the
| receipt renderer reads `legal.*` off it, and the till reads `vat_percent` —
| and until this file existed a typo'd key was accepted, stored forever and
| silently read back as the default by everything downstream.
|
| So the column has a declared shape. Every writable path is listed below with
| the rule it has to pass; `UpdateSettingsRequest` builds Laravel rules from
| this map and REFUSES a path that is not in it. A misspelled `vat_precent`
| now comes back 422 instead of becoming a permanent orphan in the document.
|
| Two groups, because two audiences write them:
|
|   `restaurant` — what the business is: its legal identity, its brand, its
|                  hours, its tax rates. Written from `settings/`.
|   `site`       — the public website at `/r/{slug}`: which sections are on,
|                  what they say, the PWA's name and colour. Written from
|                  `settings/site`, read by a stranger with no session.
|
| A `*` in a path is one level of wildcard, exactly as Laravel reads it:
| `hours.*.open` covers all seven days without naming them, because a
| restaurant that trades on a public holiday should not need a migration.
|
| Money stays an integer in tiyin (CLAUDE.md, binding convention 1). Percents
| are the one deliberate exception — VAT is 12, not 1200 — because they are
| ratios rather than amounts and nothing multiplies two of them together.
*/

return [

    /*
     * Which key each group lives under inside `tenants.settings`.
     *
     * `restaurant` is deliberately the document root rather than a nested
     * object: `currency`, `vat_percent` and `business_day_starts_at` were
     * already at the top level before this file existed (see
     * `restaurant:create-owner`), and moving them would have silently rebased
     * every reading in the platform to a default.
     */
    'root' => [
        'restaurant' => null,
        'site' => 'site',
        // A branch's document has its own column (`branches.settings`), so its
        // group is that column's root rather than a key inside the tenant's.
        'branch' => null,
    ],

    /**
     * Path => validation rules. The whole contract.
     *
     * @var array<string, array<string, list<string>>>
     */
    'schema' => [

        'restaurant' => [
            /*
             * ---- Rekvizitlar: what goes on a receipt, an invoice and the offer ----
             *
             * These are not preferences. A fiscal receipt without a STIR is not
             * a receipt, and an invoice without the bank line cannot be paid —
             * which is why every one of them is length- and shape-checked here
             * rather than trusted to the person typing at midnight.
             */
            'legal.name' => ['string', 'max:200'],
            // STIR is nine digits in Uzbekistan — never eight, never ten. The
            // console shows it spaced (302 458 719); the digits are what is stored.
            'legal.tax_id' => ['string', 'digits:9'],
            'legal.address' => ['string', 'max:300'],
            'legal.bank' => ['string', 'max:200'],
            // MFO — the bank's five-digit code. Same reasoning as the STIR.
            'legal.mfo' => ['string', 'digits:5'],
            // A UZS settlement account is twenty digits. Kept as a string:
            // it is an identifier that happens to be numeric, and the leading
            // digits are significant.
            'legal.account' => ['string', 'digits_between:16,24'],
            'legal.director' => ['string', 'max:160'],
            'legal.vat_registered' => ['boolean'],

            // ---- Brend ----
            'brand.name' => ['string', 'max:120'],
            'brand.logo_url' => ['string', 'max:500', 'url'],
            'brand.color' => ['string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            /*
             * The other two the public site endpoint publishes.
             *
             * `PublicSiteController::brand()` allows five keys through and this
             * schema declared three, so a restaurant could set a colour and not
             * an accent — and the tagline under its own name on its own website
             * was unwritable. Same regex as the colour: an accent is a colour.
             */
            'brand.accent' => ['string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'brand.tagline' => ['string', 'max:160'],
            'brand.accent' => ['string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'brand.tagline' => ['string', 'max:200'],

            /*
             * ---- Ish vaqti ----
             *
             * `closed` rather than a missing row, because "we do not open on
             * Monday" and "nobody has filled Monday in yet" are different
             * facts and the website has to say the first one out loud.
             */
            'hours.*.open' => ['string', 'date_format:H:i'],
            'hours.*.close' => ['string', 'date_format:H:i'],
            'hours.*.closed' => ['boolean'],

            // ---- Pul ----
            'currency' => ['string', 'size:3', 'regex:/^[A-Z]{3}$/'],
            // The smallest note a drawer can actually give back. 1000 so'm =
            // 100 000 tiyin, which is the note P7 rounds cash to.
            'cash_rounding_tiyin' => ['integer', 'min:1', 'max:1000000'],

            // ---- Soliq ----
            'vat_percent' => ['numeric', 'min:0', 'max:100'],
            'service_charge_percent' => ['numeric', 'min:0', 'max:100'],
            'service_charge_auto' => ['boolean'],

            /*
             * ---- Rejalar: what somebody MEANT to spend ----
             *
             * A target is not a ledger figure and this is the only group in the
             * document that holds one. The accountant's dashboard draws monthly
             * expenses against a budget, and until this path existed there was
             * nowhere on the platform a budget could live — so the card drew a
             * dash and the bar beside it was not drawn at all.
             *
             * Restaurant-wide rather than per venue, matching the expenses it
             * is measured against: `finance.expenses` is a business ledger and
             * a per-branch budget would be measured against a total that
             * includes the other four.
             *
             * Integer tiyin (binding convention 1). Zero is the same statement
             * as absent — nobody has set one — and `RoleDashboards` reads both
             * as null so the screen draws a dash rather than a bar reporting
             * every som as an overspend.
             */
            'targets.expense_monthly_tiyin' => ['integer', 'min:0'],

            /*
             * ---- Qoidalar: the rules the console's policy switches set ----
             *
             * The settings screen draws ten switches under its eight panels and
             * exactly one of them — `service_charge_auto` above — had a home.
             * The other nine moved a switch, said so with a toast, and changed
             * nothing anywhere: a screen whose whole job is to state the rules,
             * stating rules nobody enforces.
             *
             * Every path below is read at ONE enforcement point, named beside
             * it. That is the rule for adding a tenth: a setting with no reader
             * is worse than no setting, because the switch fires and the
             * restaurant believes it.
             *
             * Three of them are booleans and six are numbers, and the numbers
             * mostly share a convention: **zero means "no rule"**, not "zero of
             * the thing". A restaurant that has never opened this screen must
             * behave exactly as this platform behaved before the screen existed,
             * and a ceiling of zero bills or a reopen window of zero minutes
             * would lock every till on the platform the day the column landed.
             */

            // Freeing the table when the bill is settled — EloquentBillRegistry
            // ::close(), through App\Contracts\Tables\FloorPlan. Off for a
            // venue where a table is cleared by hand, which is most bars.
            'policies.auto_close_table_after_payment' => ['boolean'],

            // A manager's signature to strike a line the kitchen already has —
            // ApprovalGate::requires(). Above the role ladder rather than
            // inside it: the food exists, so the amount is not the question.
            'policies.void_sent_needs_manager_pin' => ['boolean'],

            // A refund with nothing written on it — EloquentBillRegistry
            // ::refund(). A loss report of blank reasons is a loss report
            // nobody reads.
            'policies.refund_needs_reason' => ['boolean'],

            /*
             * How many bills one waiter may have open at once — 0 = no ceiling,
             * EloquentBillRegistry::open().
             *
             * A ceiling rather than a warning, because the failure it prevents
             * is a waiter with fourteen open tables and two of them forgotten
             * until the Z report finds them.
             */
            'policies.max_open_bills_per_waiter' => ['integer', 'min:0', 'max:200'],

            /*
             * When a docket turns red — 0 = the station's own `sla_minutes`,
             * KitchenTicket::isLate() and its `late()` scope.
             *
             * A restaurant-wide override rather than a replacement: a grill and
             * a bar have genuinely different clocks, so the station's figure is
             * the default and this is the house rule when a venue wants one.
             */
            'policies.kds_late_minutes' => ['integer', 'min:0', 'max:240'],

            /*
             * The paper docket beside the screen — EloquentTicketWriter::fire().
             *
             * On by default, which is what this platform already did
             * unconditionally: a KDS goes dark when a tablet's battery dies or
             * the wifi drops, and paper does not. Off for a kitchen that has no
             * printer and does not want a queue filling up with jobs nothing
             * will ever collect.
             */
            'policies.kds_paper_docket' => ['boolean'],

            /*
             * The tip chip the till pre-selects — 0 = none offered,
             * TerminalSessionResource.
             *
             * A SUGGESTION, and deliberately not applied in the ledger: a tip
             * that appears on a bill because of a setting is a charge nobody
             * agreed to. DECISIONS Q6 — a tip is money the guest handed over,
             * never revenue, and never something a config file decides.
             */
            'policies.tip_default_percent' => ['integer', 'min:0', 'max:100'],

            /*
             * The most ways one bill may be divided — EloquentBillRegistry
             * ::splitEvenly().
             *
             * Bounded by App\Support\Orders\BillSplit::WAYS_MAX whatever is
             * stored here: twelve is the guest app's own stepper and the till's
             * copy, and a restaurant cannot raise a ceiling two surfaces draw.
             */
            'policies.split_max_ways' => ['integer', 'min:2', 'max:12'],

            /*
             * How long after settling a bill may still be reopened — 0 = no
             * window, EloquentBillRegistry::reopen().
             *
             * Minutes, because the honest number is under an hour: a bill
             * reopened the next morning is a correction to a closed trading day,
             * and that is `amendClosedShift`'s job, not this one's.
             */
            'policies.reopen_window_minutes' => ['integer', 'min:0', 'max:1440'],

            /*
             * How long a dish stays off the menu when a cook names no time —
             * 0 = until somebody puts it back, EloquentStopList::stop().
             *
             * Hours. The 86 sheet's oldest failure is a dish stopped on Friday
             * night that is still off on Tuesday because the person who stopped
             * it went home.
             */
            'policies.stoplist_auto_unstop_hours' => ['integer', 'min:0', 'max:168'],

            // ---- Til ----
            'locale' => ['string', 'in:uz,ru,en'],
            // A day's takings belong to the day the shift opened, not to
            // midnight — see App\Support\Orders\BusinessDay.
            'business_day_starts_at' => ['string', 'date_format:H:i'],
            'channels' => ['array'],
            'channels.*' => ['string', 'in:dine_in,takeaway,delivery,aggregator'],
        ],

        /*
         * ---- Filial sozlamalari: `branches.settings` ----
         *
         * A venue overrides the business, and `Branch::setting()` already falls
         * through to the tenant when a key is absent. So this group is short by
         * design: only what genuinely differs one address to the next.
         */
        'branch' => [
            // This month's target, in tiyin — the console's ± stepper moves it
            // in 1 000 000 so'm steps. Money is an integer in tiyin, always.
            'target_monthly_tiyin' => ['integer', 'min:0', 'max:100000000000'],
            'hours.*.open' => ['string', 'date_format:H:i'],
            'hours.*.close' => ['string', 'date_format:H:i'],
            'hours.*.closed' => ['boolean'],
            // A mall branch closes when the mall does, and a terrace charges a
            // different service percentage than the hall. Both override.
            'service_charge_percent' => ['numeric', 'min:0', 'max:100'],
            'business_day_starts_at' => ['string', 'date_format:H:i'],
            'seats' => ['integer', 'min:0', 'max:5000'],
            'delivery_radius_km' => ['numeric', 'min:0', 'max:200'],
            'bookable' => ['boolean'],

            /*
             * When this venue is open, per weekday.
             *
             * `{"mon": ["10:00", "23:00"], ...}` — a pair per day, and a day
             * that is missing is a day the venue is shut. Declared here
             * because `settings` is validated against this schema and an
             * undeclared path is dropped silently: the website screen wrote
             * hours for a year and the public page kept reading `[]`.
             *
             * On the branch rather than the restaurant: a chain's Termiz
             * venue closes at ten and its Chilonzor one at midnight, and the
             * guest reading the site is reading about one of them.
             */
            'hours' => ['array'],
            'hours.*' => ['array', 'size:2'],
            'hours.*.*' => ['string', 'date_format:H:i'],

            /*
             * ---- What a delivery costs, and the floor under it ----
             *
             * Declared because `settings` is validated against this schema and
             * an undeclared path is dropped on write — the same trap the hours
             * fell into. These three were undeclared and read by two different
             * endpoints under two different names, so a restaurant could not
             * set a delivery fee at all: the console's write was discarded, the
             * storefront quoted zero, and `PublicOrderController` charged
             * whatever a migration or a seeder had left on the row.
             *
             * The names here are the ones the order endpoint enforces —
             * `deliveryFee()` and the minimum check — because that side takes
             * the money and the quote has to follow it, never the other way
             * round.
             */
            'delivery_enabled' => ['boolean'],
            'delivery_fee_tiyin' => ['integer', 'min:0', 'max:10000000'],

            /*
             * ---- What this venue promises a guest, in minutes ----
             *
             * `PublicOrderController::etaMinutes()` adds three numbers: the
             * slowest dish, how far the pass is running behind, and the trip.
             * The last two are per venue and were read from paths this schema
             * did not declare, so an undeclared write was dropped and every
             * kitchen in the country promised the same 10 + 25 minutes — the
             * defaults in that method. A venue two streets from its customers
             * and one across a city cannot honestly quote the same number.
             *
             * The ceilings are deliberate rather than generous: an ETA longer
             * than two hours is a typo, and a guest reads it as a mistake
             * whether or not it was one.
             */
            'kitchen_queue_minutes' => ['integer', 'min:0', 'max:120'],
            'delivery_travel_minutes' => ['integer', 'min:0', 'max:120'],
            'pickup_wait_minutes' => ['integer', 'min:0', 'max:120'],

            /*
             * Where the venue is, for a map pin and a distance.
             *
             * Published by `PublicBranchController` and read from a path
             * nothing could write, so every venue answered `null` and the
             * consumer app's "1.8 km" stayed a fixture. Ordinary WGS-84
             * bounds; a swapped pair puts a Tashkent restaurant in the Indian
             * Ocean and the range is what catches it.
             */
            'geo.lat' => ['numeric', 'min:-90', 'max:90'],
            'geo.lng' => ['numeric', 'min:-180', 'max:180'],
            // Zero means "never free", which is the default that cannot
            // surprise a guest with a fee they were not quoted.
            'free_delivery_over_tiyin' => ['integer', 'min:0', 'max:1000000000'],
            'min_order_tiyin' => ['integer', 'min:0', 'max:1000000000'],
        ],

        'site' => [
            /*
             * ---- Which sections the site draws ----
             *
             * Eight, and the keys are the design's own (`(site)/r/[restaurant]`).
             * A section that is off is not rendered and not linked; there is no
             * third state, because "drawn but empty" is how a restaurant's
             * website ends up advertising an empty menu.
             */
            'sections.home' => ['boolean'],
            'sections.menu' => ['boolean'],
            'sections.about' => ['boolean'],
            'sections.branches' => ['boolean'],
            'sections.booking' => ['boolean'],
            'sections.gallery' => ['boolean'],
            'sections.reviews' => ['boolean'],
            'sections.contact' => ['boolean'],

            // ---- What it says ----
            'headline' => ['string', 'max:160'],
            'subheadline' => ['string', 'max:300'],
            'about' => ['string', 'max:2000'],
            'address' => ['string', 'max:300'],
            'phone' => ['string', 'max:32'],
            'instagram' => ['string', 'max:120'],
            'telegram' => ['string', 'max:120'],

            /*
             * The subdomain the site answers on.
             *
             * Lowercase, hyphenated, and checked for uniqueness in the request
             * rather than here — a rule can say what a name may look like, it
             * cannot say whether somebody else already took it.
             */
            'subdomain' => ['string', 'min:3', 'max:63', 'regex:/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/'],
            /*
             * One of the design's four, not a free colour.
             *
             * `(site)/layout.tsx` writes it to the DOM as `data-acc`, and the
             * stylesheet defines exactly a0..a3. A hex here would render as no
             * accent at all — the attribute would match no rule — which is the
             * worst kind of wrong: saved, acknowledged, and invisible.
             */
            'accent' => ['string', 'in:a0,a1,a2,a3'],
            // The hero's one paragraph. 160 is the design's own counter, and a
            // longer one silently overflows the card rather than wrapping.
            'blurb' => ['string', 'max:160'],
            'langs.uz' => ['boolean'],
            'langs.ru' => ['boolean'],
            'langs.en' => ['boolean'],

            /*
             * ---- Which doors the website itself offers ----
             *
             * NOT the same list as `restaurant.channels`, and the difference is
             * the one `calls-panels.tsx` spent a paragraph on: that list holds
             * FULFILMENT channels an order row can carry (`dine_in`,
             * `takeaway`, `delivery`, `aggregator`), and this one is what the
             * website's own order form offers a stranger. A restaurant that
             * delivers but does not want its website taking delivery orders —
             * because the phone is how they take them — is a real arrangement
             * and neither list can express it alone.
             *
             * Whether an intake door is OPEN RIGHT NOW is a third thing again
             * and is not here: it has a clock and a reason, so it lives in
             * `orders.channel_settings`. This says what the site advertises; that
             * says whether it is currently taking any.
             */
            'channels' => ['array'],
            'channels.*' => ['string', 'in:delivery,pickup,dine_in'],

            /*
             * ---- Oldindan buyurtma: pre-order windows ----
             *
             * How far ahead the site's order form lets somebody choose a time,
             * and in what steps. A kitchen that accepts "in fifteen minutes"
             * from a website is a kitchen that has not read the docket yet, so
             * `lead_minutes` is the floor rather than a default — the same
             * argument `PublicOrderController::MINIMUM_ETA_MINUTES` makes about
             * never promising four minutes.
             *
             * `slot_minutes` is what turns a free-text time into a picker: 15
             * gives quarter-hours, 30 gives half-hours, and a restaurant that
             * sets 60 is saying "tell us the hour and we will fit you in".
             */
            'preorder.enabled' => ['boolean'],
            'preorder.lead_minutes' => ['integer', 'min:0', 'max:1440'],
            'preorder.horizon_days' => ['integer', 'min:0', 'max:30'],
            'preorder.slot_minutes' => ['integer', 'min:5', 'max:180'],

            // ---- Bron qoidalari ----
            'booking.enabled' => ['boolean'],
            'booking.min_party' => ['integer', 'min:1', 'max:100'],
            'booking.max_party' => ['integer', 'min:1', 'max:500'],
            // How far ahead a stranger may book. Days, because a diary that
            // accepts a booking for next year is a diary nobody trusts.
            'booking.horizon_days' => ['integer', 'min:1', 'max:365'],
            'booking.notice_minutes' => ['integer', 'min:0', 'max:10080'],

            /*
             * The four switches the website screen draws, declared so they can
             * be saved at all: `settings` is validated against this schema and
             * an undeclared path is dropped without a word, so the screen wrote
             * them for a year and read the design's defaults back every time.
             *
             * Each is a promise to a guest, which is why they are settings and
             * not code: auto-confirm decides whether a booking is a booking or
             * a request; the reminder is what halves the no-show rate; the
             * deposit is what a large party is asked for; and the waitlist is
             * whether a full evening turns people away or keeps them.
             */
            'booking.auto_confirm' => ['boolean'],
            'booking.remind_hours_before' => ['integer', 'min:0', 'max:72'],
            'booking.deposit_from_party' => ['integer', 'min:0', 'max:100'],
            'booking.deposit_tiyin' => ['integer', 'min:0'],
            'booking.waitlist' => ['boolean'],

            /*
             * ---- PWA ----
             *
             * Its own name and colour, not the platform's: a guest who installs
             * a restaurant's site should get that restaurant on their home
             * screen. CLAUDE.md's "Har yuzaning o'z manifesti" is this field.
             */
            'pwa.name' => ['string', 'max:60'],
            'pwa.short_name' => ['string', 'max:12'],
            'pwa.theme_color' => ['string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'pwa.background_color' => ['string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'pwa.icon_url' => ['string', 'max:500', 'url'],
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Defaults — what a restaurant that has never opened the screen behaves like
    |--------------------------------------------------------------------------
    |
    | Read by App\Support\Settings\Policies when the document says nothing.
    | Here rather than at the enforcement points because there are eight of
    | those, in five modules, and a default written twice is a default that has
    | already drifted once.
    |
    | Only the `policies.*` group needs this. Everything else in the schema is
    | either read with a default at its one call site (`vat_percent`) or is
    | genuinely absent until somebody fills it in (a restaurant's bank details).
    |
    | The values are the platform's behaviour BEFORE these switches existed,
    | with one deliberate exception: `void_sent_needs_manager_pin` ships on,
    | because the design draws it on and because the alternative — a cashier
    | striking food the kitchen has already cooked, unsupervised — is the rule
    | every restaurant already runs by hand.
    */
    'defaults' => [
        'policies.auto_close_table_after_payment' => false,
        'policies.void_sent_needs_manager_pin' => true,
        'policies.refund_needs_reason' => true,
        'policies.max_open_bills_per_waiter' => 0,
        'policies.kds_late_minutes' => 0,
        'policies.kds_paper_docket' => true,
        'policies.tip_default_percent' => 0,
        'policies.split_max_ways' => 12,
        'policies.reopen_window_minutes' => 0,
        'policies.stoplist_auto_unstop_hours' => 0,
    ],
];
