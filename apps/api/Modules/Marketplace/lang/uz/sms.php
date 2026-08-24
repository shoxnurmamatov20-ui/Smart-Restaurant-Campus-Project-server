<?php

declare(strict_types=1);

/*
 * The words that leave the platform on somebody's phone.
 *
 * Here rather than in the frontend catalogue because nothing in a browser is
 * involved: the server composes this text and hands it to a gateway, so all
 * three languages have to be resolvable from PHP.
 *
 * The brand is named in the message on purpose. Somebody who orders from four
 * apps gets four six-digit codes in an evening, and a code with no sender in it
 * is a code typed into the wrong box — which burns one of the five guesses the
 * other app is counting.
 */

return [
    'otp' => 'MyPOS kirish kodi: :code. :minutes daqiqa amal qiladi. Hech kimga aytmang.',
];
