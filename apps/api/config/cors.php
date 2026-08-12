<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Cross-Origin Resource Sharing
|--------------------------------------------------------------------------
| Laravel ships `HandleCors` in the global middleware stack but no config
| file, and with no config it matches no paths — so every browser request from
| a front end on a different port was being blocked before it reached a route.
| That affected both clients (web on 3000, admin on 3001); it only became
| visible when a browser was first pointed at the API.
|
| Origins come from CORS_ALLOWED_ORIGINS so production never has to ship a
| code change to add a domain. A wildcard is deliberately not the default:
| these endpoints carry bearer tokens.
*/

$origins = array_values(array_filter(array_map(
    'trim',
    explode(',', (string) env('CORS_ALLOWED_ORIGINS', 'http://localhost:3000,http://localhost:3001')),
)));

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie', 'up'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $origins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    /*
     * The till reads its own idempotency key back out of a response when it
     * reconciles a replay, and every client reads the pagination headers.
     */
    'exposed_headers' => ['X-Pos-Local-Id', 'X-Request-Id'],

    'max_age' => 3600,

    /*
     * Cookies are needed for the Sanctum SPA session the web and admin
     * consoles use. The till authenticates with a bearer token and does not
     * rely on this, but the same API serves all three.
     */
    'supports_credentials' => true,

];
