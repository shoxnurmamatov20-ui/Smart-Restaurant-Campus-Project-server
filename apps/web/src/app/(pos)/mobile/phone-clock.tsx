'use client';

import { useSyncExternalStore } from 'react';

/**
 * The clock in the phone frame's status bar.
 *
 * It was `11:24`, printed on the server, so an owner opening the screen at
 * half past six saw a mock that disagreed with the device it was drawn on —
 * and the same wrong minute all day.
 *
 * `useSyncExternalStore` rather than an effect that writes state: the server
 * snapshot is `null`, which is what keeps the first paint identical on both
 * sides of hydration. The server has no clock the browser can agree with, so it
 * draws nothing and the real time arrives a moment later.
 *
 * Ticks on the minute rather than the second — it is a status bar, and a
 * re-render a second for a digit that changes sixty times less often is battery
 * for nothing.
 */
const MINUTE = 60_000;

function subscribe(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, 1_000);

  return () => window.clearInterval(timer);
}

const currentMinute = (): number => Math.floor(Date.now() / MINUTE);

export function PhoneClock() {
  const minute = useSyncExternalStore(subscribe, currentMinute, () => null);

  return (
    <span data-num>
      {minute === null
        ? ''
        : new Date(minute * MINUTE).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}
    </span>
  );
}
