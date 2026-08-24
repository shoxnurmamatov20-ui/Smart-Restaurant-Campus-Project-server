<?php

declare(strict_types=1);

/*
 * The words that leave the platform on somebody's phone.
 *
 * Here rather than in the frontend catalogue for the same reason Kitchen's
 * print strings are: nothing in the browser is involved. The server composes
 * this text and hands it to a gateway, so the three languages have to be
 * resolvable from PHP — and the language is the guest's own (`crm.customers.locale`),
 * not the language of whatever request triggered the message.
 *
 * `:code` and `:minutes` are the only placeholders. The restaurant's name is
 * deliberately absent: an Uzbek SMS is 70 characters per part in Cyrillic and
 * 160 in Latin, every part is charged, and a sender id already says who it is
 * from.
 */

return [
    'otp' => 'Kirish kodi: :code. :minutes daqiqa amal qiladi. Hech kimga aytmang.',
];
