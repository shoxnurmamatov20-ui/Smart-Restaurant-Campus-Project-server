# ============================================================
# CAMPUS — Laravel API (PHP-FPM 8.3)
# Multi-stage production build
# ============================================================

# ============ STAGE 1: composer dependencies ============
FROM composer:2 AS vendor
WORKDIR /app
COPY apps/api/composer.json apps/api/composer.lock ./
RUN composer install \
    --no-dev \
    --no-scripts \
    --no-autoloader \
    --prefer-dist \
    --no-interaction \
    --no-progress

# ============ STAGE 2: app build ============
FROM php:8.3-fpm-alpine AS app

# System deps
RUN apk add --no-cache \
    bash \
    curl \
    git \
    libpng-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    libzip-dev \
    icu-dev \
    oniguruma-dev \
    postgresql-dev \
    libxml2-dev \
    libwebp-dev \
    autoconf \
    g++ \
    make \
    linux-headers \
    supervisor

# PHP extensions
RUN docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
    && docker-php-ext-install -j$(nproc) \
        bcmath \
        exif \
        gd \
        intl \
        mbstring \
        opcache \
        pcntl \
        pdo \
        pdo_pgsql \
        zip \
    && pecl install redis \
    && docker-php-ext-enable redis

# OPcache config (production)
RUN { \
    echo 'opcache.enable=1'; \
    echo 'opcache.enable_cli=1'; \
    echo 'opcache.memory_consumption=256'; \
    echo 'opcache.interned_strings_buffer=16'; \
    echo 'opcache.max_accelerated_files=20000'; \
    echo 'opcache.validate_timestamps=0'; \
    echo 'opcache.save_comments=1'; \
    echo 'opcache.jit_buffer_size=128M'; \
    echo 'opcache.jit=1255'; \
} > /usr/local/etc/php/conf.d/opcache.ini

# Install Composer (for runtime use)
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Working directory
WORKDIR /var/www/html

# Copy app code
COPY apps/api/ ./

# Copy installed vendor from stage 1
COPY --from=vendor /app/vendor ./vendor

# Final autoload dump
RUN composer dump-autoload --optimize --classmap-authoritative

# Permissions
RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache \
    && chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache

USER www-data

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD php -r "echo 'ok';" || exit 1

CMD ["php-fpm"]
