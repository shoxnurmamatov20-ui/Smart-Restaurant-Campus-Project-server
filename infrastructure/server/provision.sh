#!/usr/bin/env bash
#=============================================================================
# provision.sh — the one privileged step.
#
#   sudo bash /home/pos/srcp/infrastructure/server/provision.sh
#
# Everything a deployment needs that only root can create: a service account,
# a directory under /srv, the four tools in /usr/local/sbin and the sudoers rule
# that lets them be run without a password afterwards. Run once. Running it
# again is safe — every step checks before it acts — and is the intended way to
# repair a box whose /usr/local/sbin or sudoers drop-in has been lost.
#
# It deliberately does NOT touch anything that is serving traffic. No live
# service is stopped, no traffic moves, no configuration under /etc/nginx
# changes. The platform serves from /home/pos/srcp exactly as it did before,
# until `srcp-deploy` is run. If this script fails halfway, the live system is
# unaffected.
#
# It does retire units that are already dead — the MyPOS ones, which crash-loop
# against a directory that no longer exists. Those serve nothing; leaving them
# is the risk, not removing them. See step 10.
#
# What it changes, in full:
#   + group and user `srcp` (system, no login, no password)
#   + www-data and pos added to the srcp group
#   + /srv/srcp/{releases,shared,backups}
#   + /usr/local/lib/node24        (moved from /home/pos/.local, symlink left behind)
#   + /usr/local/sbin/srcp-{deploy,rollback,apply,health}
#   + /etc/sudoers.d/91-srcp       (validated with visudo before installing)
#   + /etc/srcp/deploy.conf
#   + /etc/ssl/srcp/               (copy of the internal CA and leaf)
#   + /var/log/srcp/
#   ~ redis: maxmemory, eviction policy, appendonly  (CONFIG SET + REWRITE, no restart)
#   - the 13 crash-looping MyPOS units: disabled, and their files moved aside
#   - meilisearch: disabled (SCOUT_DRIVER=database — nothing queries it)
#=============================================================================
set -euo pipefail

readonly PROG=provision
readonly SRCP_USER=srcp
readonly SRCP_HOME=/srv/srcp

log()  { printf '\033[0;36m[%s]\033[0m %s\n' "$PROG" "$*"; }
ok()   { printf '\033[0;32m[%s] ✓\033[0m %s\n' "$PROG" "$*"; }
skip() { printf '\033[0;90m[%s] ·\033[0m %s\n' "$PROG" "$*"; }
warn() { printf '\033[0;33m[%s] WARN\033[0m %s\n' "$PROG" "$*" >&2; }
die()  { printf '\033[0;31m[%s] ERROR\033[0m %s\n' "$PROG" "$*" >&2; exit 1; }
step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || die "must run as root: sudo bash $0"

# The repository this script came from — the tools and configuration are copied
# out of it, so it has to be the real tree and not a stray copy.
SRC_REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
[[ -f $SRC_REPO/pnpm-workspace.yaml && -f $SRC_REPO/apps/api/artisan ]] \
    || die "$SRC_REPO does not look like the SRCP monorepo"
readonly SRC=$SRC_REPO/infrastructure/server
log "repository: $SRC_REPO"

#=============================================================================
step "1/10  Preflight"
#=============================================================================
for bin in nginx php psql redis-cli rsync runuser install visudo systemctl; do
    command -v "$bin" >/dev/null 2>&1 || die "required command not found: $bin"
done
PHPV=$(find /etc/php -maxdepth 1 -mindepth 1 -type d -printf '%f\n' 2>/dev/null | sort -V | tail -1)
[[ -n $PHPV && -d /etc/php/$PHPV/fpm ]] || die "no php-fpm installation found under /etc/php"
ok "php $PHPV, nginx $(nginx -v 2>&1 | sed 's/.*\///'), $(free -g | awk '/^Mem:/{print $2}')GB RAM, $(nproc) CPUs"

#=============================================================================
step "2/10  Service account"
#=============================================================================
# A system account with no login shell and no password. The application has run
# as `pos` until now, which holds passwordless sudo and this machine's SSH keys:
# a remote-code bug in any of 236 routes was a bug that owned the box. This is
# the single highest-value change in the whole migration.
if getent group "$SRCP_USER" >/dev/null; then
    skip "group $SRCP_USER exists"
else
    groupadd --system "$SRCP_USER"
    ok "group $SRCP_USER created"
fi

if id -u "$SRCP_USER" >/dev/null 2>&1; then
    skip "user $SRCP_USER exists"
else
    useradd --system --gid "$SRCP_USER" --home-dir "$SRCP_HOME" \
            --shell /usr/sbin/nologin \
            --comment 'Smart Restaurant Campus service account' "$SRCP_USER"
    ok "user $SRCP_USER created (system, nologin)"
fi

# nginx reads public/vendor straight from the release, so www-data needs to
# traverse a tree that is deliberately not world-readable. Group membership is
# how, rather than loosening the mode to o+rx and letting every account on the
# box read the application's source.
for member in www-data pos; do
    if id -nG "$member" 2>/dev/null | tr ' ' '\n' | grep -qx "$SRCP_USER"; then
        skip "$member already in group $SRCP_USER"
    else
        usermod -aG "$SRCP_USER" "$member"
        ok "$member added to group $SRCP_USER"
        [[ $member == www-data ]] && NGINX_NEEDS_RESTART=1
    fi
done

#=============================================================================
step "3/10  /srv/srcp"
#=============================================================================
# /srv, not /var/www. The FHS reserves /srv for "data for services provided by
# this system", which is exactly what a deployed application is; /var/www is
# Debian's convention for a document root, meaning a directory a web server
# reads files out of. nginx reads exactly one directory here — apps/api/public,
# which is four files — and proxies everything else. Putting a 1.4 GB monorepo,
# its vendor tree and its .env under a document root buys nothing and puts every
# secret one nginx misconfiguration away from being served as a static file.
#
# It is also what this project's own docs/deployment/README.md already specified.
install -d -o "$SRCP_USER" -g "$SRCP_USER" -m 0750 "$SRCP_HOME"
install -d -o "$SRCP_USER" -g "$SRCP_USER" -m 0750 "$SRCP_HOME"/{releases,shared,backups}
install -d -o "$SRCP_USER" -g "$SRCP_USER" -m 0750 "$SRCP_HOME"/shared/{env,storage,home}
install -d -o "$SRCP_USER" -g "$SRCP_USER" -m 0750 "$SRCP_HOME"/shared/next-cache/{web,admin}
install -d -o root -g adm -m 0750 /var/log/srcp
ok "$SRCP_HOME laid out, owned by $SRCP_USER"

#=============================================================================
step "4/10  Node runtime out of a user's home"
#=============================================================================
# The consoles run on Node 24, which was installed under /home/pos/.local — a
# directory mode 0700 that only `pos` can enter. A service account cannot read
# it, so the runtime has to move before anything can run as srcp.
#
# Moved rather than copied, with a symlink left behind: two copies of a runtime
# is how a box ends up patching one of them. The move is a rename on the same
# filesystem, so processes currently executing from the old path keep running.
if [[ -d /usr/local/lib/node24 && ! -L /usr/local/lib/node24 ]]; then
    skip "/usr/local/lib/node24 already present"
elif [[ -d /home/pos/.local/lib/node24 && ! -L /home/pos/.local/lib/node24 ]]; then
    mv /home/pos/.local/lib/node24 /usr/local/lib/node24
    ln -sfn /usr/local/lib/node24 /home/pos/.local/lib/node24
    chown -R root:root /usr/local/lib/node24
    chmod -R go-w /usr/local/lib/node24
    ok "node24 moved to /usr/local/lib/node24 (old path is now a symlink)"
else
    die "cannot find a node24 installation to move; expected /home/pos/.local/lib/node24"
fi
for b in node npm npx; do
    [[ -x /usr/local/lib/node24/bin/$b ]] && ln -sfn "/usr/local/lib/node24/bin/$b" "/usr/local/bin/$b-24"
done
ok "node $(/usr/local/lib/node24/bin/node -v) readable by every account"

#=============================================================================
step "5/10  TLS material out of a user's home"
#=============================================================================
# Same reasoning as the node runtime and the nginx snippets: nginx reads the
# private key as root at parse time, and it was sitting in a directory `pos`
# could rewrite. The originals are left in place — this is a copy, so a mistake
# here costs nothing.
if [[ -d /home/pos/mypos-setup/tls ]]; then
    install -d -o root -g root -m 0755 /etc/ssl/srcp
    for f in ca.crt server.crt fullchain.crt; do
        [[ -f /home/pos/mypos-setup/tls/$f ]] \
            && install -o root -g root -m 0644 "/home/pos/mypos-setup/tls/$f" "/etc/ssl/srcp/$f" || true
    done
    for f in server.key ca.key; do
        [[ -f /home/pos/mypos-setup/tls/$f ]] \
            && install -o root -g root -m 0600 "/home/pos/mypos-setup/tls/$f" "/etc/ssl/srcp/$f" || true
    done
    [[ -f /etc/ssl/srcp/fullchain.crt && -f /etc/ssl/srcp/server.key ]] \
        || die "the TLS copy is incomplete — port 443 would fail to start"
    ok "internal CA and leaf copied to /etc/ssl/srcp (key mode 0600)"
else
    warn "no /home/pos/mypos-setup/tls — port 443 will not start until /etc/ssl/srcp is populated"
fi

#=============================================================================
step "6/10  Tools"
#=============================================================================
for tool in srcp-deploy srcp-rollback srcp-apply srcp-health; do
    install -o root -g root -m 0755 "$SRC/bin/$tool" "/usr/local/sbin/$tool"
    printf '  → /usr/local/sbin/%s\n' "$tool"
done
ok "tools installed"

#=============================================================================
step "7/10  Deployment configuration"
#=============================================================================
install -d -o root -g root -m 0755 /etc/srcp
if [[ -f /etc/srcp/deploy.conf ]]; then
    skip "/etc/srcp/deploy.conf exists — left alone"
else
    cat > /etc/srcp/deploy.conf <<EOF
# Read by srcp-deploy. Shell syntax; every value can be overridden on the
# command line, and the command line wins.

# The working tree a release is built from. Today this is the developer's
# checkout on this box; when the project has CI, point it at whatever that
# leaves behind and nothing else about the deployment has to change.
SRCP_SOURCE=$SRC_REPO

SRCP_ROOT=$SRCP_HOME
SRCP_USER=$SRCP_USER

# Releases are hardlinked against their predecessor, so each one after the first
# costs only what changed. Five is roughly a week of deploys and a fortnight of
# rollback range.
KEEP_RELEASES=5
EOF
    chmod 0644 /etc/srcp/deploy.conf
    ok "/etc/srcp/deploy.conf written"
fi

#=============================================================================
step "8/10  Passwordless deploys"
#=============================================================================
# Validated before it is installed, and installed atomically. A syntax error in
# any file under /etc/sudoers.d breaks sudo for the entire machine — including
# the sudo that would be needed to remove the broken file.
tmp_sudo=$(mktemp)
cp "$SRC/system/sudoers-srcp" "$tmp_sudo"
chmod 0440 "$tmp_sudo"
if visudo -c -f "$tmp_sudo" >/dev/null 2>&1; then
    install -o root -g root -m 0440 "$tmp_sudo" /etc/sudoers.d/91-srcp
    rm -f "$tmp_sudo"
    ok "/etc/sudoers.d/91-srcp installed and validated"
else
    visudo -c -f "$tmp_sudo" || true
    rm -f "$tmp_sudo"
    die "the sudoers drop-in does not parse — nothing installed"
fi

#=============================================================================
step "9/10  Redis limits"
#=============================================================================
# Redis holds the cache, the sessions and the queue for this application and had
# no memory ceiling and no eviction policy: `maxmemory 0` with `noeviction`
# means it grows until the kernel kills it, and the kernel picks the largest
# process, which is Redis. Every session and every queued job goes with it.
#
# volatile-lru rather than allkeys-lru is the important detail. Cache entries and
# sessions carry a TTL and are safe to evict; queued jobs do not and must not be.
# allkeys-lru would quietly drop a payment callback under memory pressure.
#
# appendonly turns an up-to-60-second window of lost queue state on an unclean
# shutdown into a one-second one. At this dataset size it costs nothing.
#
# CONFIG SET + CONFIG REWRITE rather than editing redis.conf and restarting:
# a restart drops every session on the floor and loses anything written since
# the last RDB save, which is the exact failure this is meant to prevent.
redis_pw=$(sed -nE "s/^REDIS_PASSWORD=[\"']?([^\"']*)[\"']?[[:space:]]*$/\1/p" \
    "$SRC_REPO/apps/api/.env" 2>/dev/null | head -1)
rcli() { redis-cli ${redis_pw:+-a "$redis_pw"} --no-auth-warning "$@" 2>/dev/null; }

if [[ $(rcli ping) == PONG ]]; then
    rcli config set maxmemory 512mb           >/dev/null
    rcli config set maxmemory-policy volatile-lru >/dev/null
    rcli config set appendonly yes            >/dev/null
    if [[ $(rcli config rewrite) == OK ]]; then
        ok "redis: 512MB ceiling, volatile-lru, appendonly — persisted to redis.conf"
    else
        warn "redis settings applied but CONFIG REWRITE failed — they will not survive a restart"
    fi
else
    warn "redis is not answering; skipped. Re-run this script once it is up."
fi

#=============================================================================
step "10/10  Disarm the superseded apply path"
#=============================================================================
# `mypos-apply` still exists, still has its own NOPASSWD rule, and still
# installs whatever it finds in ~/mypos-setup/render — the old nginx site and
# the four mypos-srcp-* units. Running it after the cutover would reinstall a
# site that proxies /api/v1 to a port nothing listens on any more, re-enable
# four retired units, and take the platform down in one command with no hint
# that it had done so.
#
# The render files are moved aside rather than deleted. mypos-apply is left in
# place: with nothing to install it becomes a no-op, and removing a root-owned
# tool that a sudoers rule still names is somebody else's decision.
# CAREFUL: srcp-routes.conf and srcp-proxy.conf in that directory are NOT moved.
# The nginx site that is live right now includes both of them by absolute path,
# so moving them breaks the next `nginx -t` — including the nginx restart at the
# end of this very script, which would take the platform down before anything
# had been deployed to replace it. They stop being read the moment srcp-apply
# retires sites-enabled/mypos, and an unread file costs nothing.
RENDER=/home/pos/mypos-setup/render
if [[ -d $RENDER ]] && compgen -G "$RENDER/mypos-srcp-*.service" >/dev/null 2>&1; then
    SUPERSEDED=$RENDER/superseded-$(date -u +%Y%m%dT%H%M%SZ)
    mkdir -p "$SUPERSEDED"
    for f in "$RENDER"/mypos-srcp-*.service "$RENDER"/nginx-mypos.conf; do
        [[ -f $f ]] && mv "$f" "$SUPERSEDED/" || true
    done
    chown -R pos:pos "$SUPERSEDED"
    ok "superseded unit files and site template moved to $SUPERSEDED"
    log "mypos-apply can no longer reinstall the old units or the old site"
else
    skip "nothing left in $RENDER for mypos-apply to install"
fi

# ---------------------------------------------------------------------
# The MyPOS units themselves.
#
# Twelve services and a timer belonging to the deployment this one replaced.
# Their WorkingDirectory is /var/www/mypos, which no longer exists, so each
# fails at CHDIR and `Restart=always` brings it straight back: 21,524 restarts
# on one of them by the time this was written, 145,847 journal lines in a single
# day, and a 4 GB journal to show for it. Stopping them is not enough — they are
# still `enabled`, and a reboot starts the whole loop again.
#
# Named one by one rather than matched with `mypos-*`. That glob also catches
# the four mypos-srcp-* units, which belong to THIS platform and are still
# serving every request until srcp-deploy retires them; disabling those here
# would take the site down in the middle of provisioning it.
#
# The files are moved, not deleted. Their ExecStart lines are the only surviving
# record of how MyPOS was run.
DEAD_UNITS=(
    mypos-horizon.service        mypos-kds.service
    mypos-reverb.service         mypos-scheduler.service
    mypos-scheduler.timer        mypos-web-cashier.service
    mypos-web-ceo.service        mypos-web-consumer.service
    mypos-web-dashboard.service  mypos-web-marketing.service
    mypos-web-portal.service     mypos-web-qr.service
    mypos-web-superadmin.service
)
RETIRED_DIR=/var/backups/srcp/retired-units-$(date -u +%Y%m%dT%H%M%SZ)
retired=0
for unit in "${DEAD_UNITS[@]}"; do
    [[ -f /etc/systemd/system/$unit ]] || continue
    install -d -m 0750 "$RETIRED_DIR"
    systemctl disable --now "$unit" >/dev/null 2>&1 || true
    mv "/etc/systemd/system/$unit" "$RETIRED_DIR/" 2>/dev/null || true
    retired=$((retired + 1))
done
if (( retired > 0 )); then
    systemctl daemon-reload
    systemctl reset-failed >/dev/null 2>&1 || true
    ok "$retired dead MyPOS unit(s) disabled; files kept in $RETIRED_DIR"
    log "the restart loop that was filling the journal is over"
else
    skip "no MyPOS unit files left to retire"
fi

# Meilisearch. apps/api/.env sets SCOUT_DRIVER=database, so nothing in this
# application has ever queried it — it is an idle daemon holding a port open.
# Disabled rather than removed: switching SCOUT_DRIVER back is one line, and
# `systemctl enable --now meilisearch` undoes this completely.
if systemctl is-enabled meilisearch.service >/dev/null 2>&1; then
    scout=$(sed -nE 's/^SCOUT_DRIVER=([^[:space:]]*).*/\1/p' "$SRC_REPO/apps/api/.env" 2>/dev/null | head -1)
    if [[ ${scout:-database} == database ]]; then
        systemctl disable --now meilisearch.service >/dev/null 2>&1 || true
        ok "meilisearch disabled (SCOUT_DRIVER=$scout — nothing queries it)"
    else
        skip "meilisearch left running (SCOUT_DRIVER=$scout)"
    fi
fi

#=============================================================================
step "Bootstrap cleanup"
#=============================================================================
# This script can be invoked two ways: directly with sudo, or once through a
# throwaway systemd unit (mypos-srcp-provision.service) installed by mypos-apply
# — which is this box's documented passwordless-root path, and the only way to
# provision without a human at the keyboard to type a password.
#
# Either way it must not run twice by accident and must not survive a reboot as
# a unit that fires on every boot. The marker file is what the unit's
# ConditionPathExists tests; removing the unit file as well means even a
# daemon-reload cannot resurrect it.
touch /etc/srcp/.provisioned
chmod 0644 /etc/srcp/.provisioned

if [[ -f /etc/systemd/system/mypos-srcp-provision.service ]]; then
    rm -f /etc/systemd/system/mypos-srcp-provision.service \
          /etc/systemd/system/multi-user.target.wants/mypos-srcp-provision.service
    rm -f /home/pos/mypos-setup/render/mypos-srcp-provision.service
    ok "one-shot provisioning unit removed"
fi

#=============================================================================
step "Done"
#=============================================================================
if [[ ${NGINX_NEEDS_RESTART:-0} -eq 1 ]]; then
    # A reload does not re-evaluate group membership; the worker processes keep
    # the supplementary groups they were started with. Without this, nginx gets
    # 403 on every file under the release and the cause is invisible.
    systemctl restart nginx
    ok "nginx restarted so its workers pick up the srcp group"
fi

cat <<EOF

$(printf '\033[1m%s\033[0m' 'Provisioned. Nothing has moved yet — the platform is still serving from')
$(printf '\033[1m%s\033[0m' "$SRC_REPO, exactly as before.")

Next, in order:

  1. Cut over to /srv/srcp — builds a release, swaps php-fpm in for
     \`artisan serve\`, starts Horizon and the scheduler, checks it works and
     rolls back by itself if it does not:

         sudo srcp-deploy

  2. Confirm:

         sudo srcp-health

  3. If anything is wrong:

         sudo srcp-rollback --list
         sudo srcp-rollback

  Note: \`pos\` was added to the srcp group. That takes effect on the next
  login — log out and back in, or use \`sg srcp\` for this session, if you want
  to read /srv/srcp directly without sudo.

EOF
