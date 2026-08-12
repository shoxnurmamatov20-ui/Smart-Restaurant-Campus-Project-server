<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">

    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">

        <title>Menu — {{ config('app.name', 'Smart Restaurant Campus') }}</title>

        <meta name="description" content="{{ $description ?? '' }}">

        {{-- Vite CSS --}}
        {{-- {{ module_vite('build-menu', 'resources/assets/sass/app.scss') }} --}}
    </head>

    <body>
        {{ $slot }}

        {{-- Vite JS --}}
        {{-- {{ module_vite('build-menu', 'resources/assets/js/app.js') }} --}}
    </body>
</html>
