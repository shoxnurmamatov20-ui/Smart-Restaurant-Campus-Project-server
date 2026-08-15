# Deployment: `pos26` (40.47.1.225)

The live install, as it actually is on 2026-08-14. `README.md` in this folder
describes how the project is _meant_ to be deployed; this file describes the one
box it _is_ deployed on, including the parts that are unusual. Where the two
disagree, this file is the one that was checked against the running system.

This install replaced MyPOS, which used to hold the same nginx site and the same
database. Its configuration and a `pg_dump` are kept at
`~/mypos-backup-before-srcp/`.

## The one thing to know first

**This host does not terminate TLS, and port 80 must serve rather than redirect.**

```
browser --https--> edge proxy --http/1.0--> this box :80 --> app ports
          mypos.tashmedunitf.uz            40.47.1.200
          87.237.235.107 (public)          (LAN)
```

The certificate for `mypos.tashmedunitf.uz` lives on the edge box. Adding a
`return 301 https://$host$request_uri` to the port 80 server here sends the edge
straight back to itself and the request loops until something gives up.

A public certificate cannot be issued _on this box_ either, and not because of a
missing tool: `40.47.1.225` sits inside Microsoft's `40.47.0.0/16` and is used
here as a private LAN address, outbound traffic leaves through an unrelated
address, and port 80 on that address reaches somebody else's nginx. Every
public CA validates by connecting to the name from the internet. If TLS terms
ever need to change, they change on the edge.

## Ports

| What                                                    | Port | Unit               |
| ------------------------------------------------------- | ---- | ------------------ |
| staff console (Next.js, `/`)                            | 3000 | `mypos-srcp-web`   |
| platform console (Next.js, `/admin`)                    | 3010 | `mypos-srcp-admin` |
| Laravel (`/api/v1`, `/sanctum`, `/broadcasting`, `/up`) | 8010 | `mypos-srcp-api`   |
| queue worker                                            | —    | `mypos-srcp-queue` |
| PostgreSQL 18                                           | 5432 | system             |
| Redis (db 2 cache, db 3 default, prefix `srcp_`)        | 6379 | system             |

The repo defaults (3001, 8000, 8001, 8080) were all taken when this went in, so
everything is shifted. The unit names begin with `mypos-` because the sudoers
drop-in grants passwordless `systemctl` for `mypos-*` only, and `mypos-apply`
installs exactly that glob — renaming them is a root job, not a cosmetic one.

## Why Laravel is on `/api/v1` and not `/api`

The staff console owns `/api/auth/session` — its own Next route handler, the one
that exchanges credentials for an httpOnly cookie. Giving Laravel all of `/api`
shadows it and breaks signing in with a 404 that looks like nothing at all.

## Applying configuration

`sudo -n /usr/local/sbin/mypos-apply` installs everything from
`~/mypos-setup/render/`: the nginx site, any `mypos-*.service` / `mypos-*.timer`,
then `daemon-reload`, `enable --now`, `nginx -t`, `reload nginx`. It is the only
privileged path available without a password, so configuration is edited in
`render/` and applied, never edited under `/etc` directly.

`nginx-mypos.conf` pulls in `srcp-routes.conf` and `srcp-proxy.conf` from that
same directory by absolute path. nginx reads them as root at parse time;
`mypos-apply` has no rule for `/etc/nginx/snippets`, so this is how shared
fragments work here.

To check a change before applying it, `nginx -t` can be run unprivileged against
a wrapper config that includes the site file — it will get as far as binding
port 80 and stop, which is after everything worth validating, certificates
included.

## `X-Forwarded-Proto`

`srcp-proxy.conf` forwards what the edge said and falls back to `$scheme` only
when nothing was forwarded. The stock snippet set it from `$scheme`
unconditionally, which labelled every request "http" no matter what the reader
was on — the shape of bug that ends with http:// URLs emitted into an https page.

Laravel already trusts it: `bootstrap/app.php` sets `trustProxies(at: '*')`.

## Direct LAN access (port 443)

For a terminal that cannot resolve `mypos.tashmedunitf.uz`, `https://40.47.1.225`
works using an internal CA in `~/mypos-setup/tls` (CA valid to 2036, leaf to
2031, SANs cover the IP, `localhost`, `*.sslip.io`/`nip.io` forms of the address
and `srcp.local`). Install `~/mypos-setup/tls/ca.crt` on the device and the
warning goes away.

Plain `http://40.47.1.225` will _serve_ pages but **cannot sign anyone in**: the
session cookie is marked `Secure`, and a browser discards a `Secure` cookie that
arrives over plain http without saying so — the request answers 200 and the login
form reappears with nothing in any log to explain it. Use the domain, or the
https form of the IP.

There is deliberately no HSTS. Against a certificate the browser has not been
told to trust, HSTS turns the one-time warning into a wall with no way past it.
If HSTS is wanted for the public name it belongs on the edge.

## Database

PostgreSQL 18, database `mypos`, role `mypos`. The name is MyPOS's and stays
that way because creating a new database needs a superuser and this role has no
`CREATEDB`. The schema layout is SRCP's own: `0000_01_01_000000_create_module_schemas`
gives each module a PostgreSQL schema and leaves `public` for identity, tenancy,
the event outbox, the audit trail and everything the framework creates. That
last part is exactly why MyPOS and SRCP could not have shared one database —
both write `users`, `tenants`, `migrations`, `sessions`, `cache`, `jobs` into
`public`.

## Not deployed

- **`ai-services`** and **`telegram-bots`** — both need credentials that were
  never supplied (an OpenAI/Anthropic key; a BotFather token). The Python 3.13 +
  `uv` toolchain is installed and ready for them.
- **Reverb** — configured (`BROADCAST_CONNECTION=reverb`, port 8020) but not
  running, and correctly so: there are zero `ShouldBroadcast` events in the
  backend today and no `laravel-echo`/`pusher-js` in either frontend. The
  references in the kitchen and tables screens are `TODO(api)` comments. Start a
  unit for it when the first event ships, not before.
- **PHP-FPM in front of Laravel** — `php artisan serve` is a development server
  and single-threaded. It is what runs today because a pool file has to be
  written under `/etc` and nginx cannot traverse `/home/pos` to reach the socket.
  Both are root-side fixes; do them before this carries real service traffic.

## The cutover that is written but not yet run

`infrastructure/server/` holds a complete replacement for everything described
above: `/srv/srcp/releases/…` with an atomic `current` symlink, php-fpm instead
of `artisan serve`, a `srcp` service account that is not `pos`, Horizon instead
of a bare `queue:work`, systemd sandboxing, journald limits and log rotation.
Nothing in it has been applied — it needs root, and the box has no passwordless
path to it. `infrastructure/server/README.md` is the description; the order is

```
sudo bash infrastructure/server/provision.sh   # one privileged step, changes nothing live
sudo srcp-deploy                               # builds a release and cuts over
sudo srcp-health                               # confirms, or srcp-rollback
```

Measured on 2026-08-15, before any of that: `artisan serve` serialises
completely — ten concurrent requests to `/api/v1/orders` took 0.27s, which is
ten times the 27ms a single one takes, for a ceiling near **37 requests per
second across the whole platform**. `opcache.enable_cli` is 0, so every request
recompiles the framework from source. Both disappear with the pool.

### Two faults found while checking it, and fixed

- **`StartLimitIntervalSec` in `[Service]`** in three of the new unit files.
  systemd moved that key to `[Unit]` in v229 and this box runs 249, so it was
  parsed as an unknown key and ignored — the same silent-typo class as
  `StopSignal=` in the units these replace. `systemd-analyze verify` is what
  catches it, and it is worth running against any unit before it is installed.

- **500 instead of 401 for every unauthenticated non-JSON request.** Laravel
  installs `redirectGuestsTo(fn () => route('login'))` by default and this API
  has no route named `login`, so `Authenticate` threw `RouteNotFoundException`
  from inside the middleware. The consoles always send
  `Accept: application/json` and were answered 401 correctly, which hid it; a
  browser, an uptime probe or curl got a 500 and a logged stack trace — 27 in
  one day. Fixed in `bootstrap/app.php` and it needed both halves:
  `redirectGuestsTo('/login')` so the middleware stops throwing, and
  `shouldRenderJsonWhen()` so API paths are answered in JSON rather than
  redirected. Fixing either one alone leaves the 500 in place.
