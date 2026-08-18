#!/usr/bin/env bash
# ============================================================
# Smart Restaurant Campus — Production server bootstrap (Ubuntu 24.04 LTS)
# Run once on fresh server: bash setup-server.sh
# ============================================================
set -euo pipefail

# ============ Config ============
APP_USER="restaurant"
APP_DIR="/srv/restaurant-campus"
TIMEZONE="Asia/Tashkent"

log() { echo -e "\033[1;34m[setup]\033[0m $*"; }
err() { echo -e "\033[1;31m[error]\033[0m $*" >&2; }

if [[ "$EUID" -ne 0 ]]; then
    err "Bu skript root sifatida ishlatilishi kerak: sudo bash $0"
    exit 1
fi

# ============ 1. System update ============
log "Tizimni yangilash..."
apt-get update -y
apt-get upgrade -y
apt-get autoremove -y

# ============ 2. Set timezone ============
log "Vaqt zonasini sozlash: $TIMEZONE"
timedatectl set-timezone "$TIMEZONE"

# ============ 3. Install essential packages ============
log "Asosiy paketlarni o'rnatish..."
apt-get install -y \
    curl \
    wget \
    git \
    vim \
    htop \
    ufw \
    fail2ban \
    unattended-upgrades \
    ca-certificates \
    gnupg \
    lsb-release \
    apt-transport-https \
    software-properties-common \
    build-essential

# ============ 4. Configure firewall (UFW) ============
log "Firewallni sozlash..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP'
ufw allow 443/tcp  comment 'HTTPS'
ufw --force enable

# ============ 5. Install Docker ============
log "Docker o'rnatish..."
if ! command -v docker >/dev/null 2>&1; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
fi

# ============ 6. Create application user ============
log "Loyiha foydalanuvchisi: $APP_USER"
if ! id "$APP_USER" >/dev/null 2>&1; then
    useradd -m -s /bin/bash "$APP_USER"
    usermod -aG docker "$APP_USER"
fi

# ============ 7. Create app directory ============
log "Loyiha papkasi: $APP_DIR"
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ============ 8. Configure automatic security updates ============
log "Avtomatik xavfsizlik yangilanishi..."
dpkg-reconfigure -plow unattended-upgrades

# ============ 9. Configure fail2ban ============
log "Fail2ban (brute force himoyasi)..."
systemctl enable --now fail2ban

# ============ 10. System tuning ============
log "Sistema parametrlarini sozlash..."
cat > /etc/sysctl.d/99-restaurant-campus.conf <<EOF
# Network performance
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 30

# Memory
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5

# File descriptors
fs.file-max = 2097152
EOF
sysctl -p /etc/sysctl.d/99-restaurant-campus.conf

cat > /etc/security/limits.d/99-restaurant-campus.conf <<EOF
* soft nofile 65535
* hard nofile 65535
* soft nproc 65535
* hard nproc 65535
EOF

# ============ 11. Done ============
log "============================================================"
log "Server tayyor!"
log "============================================================"
log "Keyingi qadamlar:"
log "  1. su - $APP_USER"
log "  2. cd $APP_DIR"
log "  3. git clone <repo-url> ."
log "  4. cp .env.example .env && nano .env"
log "  5. docker compose up -d"
log "============================================================"
