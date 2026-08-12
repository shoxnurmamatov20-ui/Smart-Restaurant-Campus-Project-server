'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { formatNumber } from '@restaurant/utils';

import { DEVICES, DEVICE_LABEL } from '../platform-data';

/**
 * Every terminal on the platform.
 *
 * A till that has not synced in two days is not a support ticket somebody will
 * file — the restaurant may not know. This table is how the platform notices,
 * so "Muammoli" is a first-class filter rather than something to sort for.
 */
type Filter = 'all' | 'POS' | 'KDS' | 'issues';

/** POS and KDS are product names; the two ends are catalogue keys. */
const CHIPS: readonly { id: Filter; key?: string }[] = [
  { id: 'all', key: 'all' },
  { id: 'POS' },
  { id: 'KDS' },
  { id: 'issues', key: 'issues' },
];

const COLUMNS =
  '[grid-template-columns:130px_minmax(0,1.3fr)_minmax(0,1fr)_90px_110px_170px_150px] gap-4 px-5';

const CHIP_ON = 'border-brand-500 bg-brand-50 text-brand-700';
const CHIP_OFF = 'bg-surface text-fg-muted';

export function DeviceTable() {
  const t = useTranslations('platform.tenants');
  const col = useTranslations('platform.columns');
  const state = useTranslations('platform.state');
  const devices = useTranslations('platform.devices');

  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(
    () =>
      DEVICES.filter((device) => {
        if (filter === 'all') return true;
        if (filter === 'issues') return device.state !== 1;
        return device.kind === filter;
      }),
    [filter],
  );

  const counts = {
    total: DEVICES.length,
    online: DEVICES.filter((device) => device.state === 1).length,
    offline: DEVICES.filter((device) => device.state === 0).length,
    stale: DEVICES.filter((device) => device.state === 2).length,
  };

  return (
    <>
      <div className="bg-surface mb-[18px] grid [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))] overflow-hidden rounded-lg border">
        {[
          { label: devices('total'), value: counts.total },
          { label: state('online'), value: counts.online, tone: 'text-success-700' },
          { label: state('offline'), value: counts.offline, tone: 'text-danger-700' },
          { label: state('updateNeeded'), value: counts.stale, tone: 'text-warning-700' },
        ].map((cell) => (
          <div
            key={cell.label}
            className="border-divider border-r px-[22px] py-[18px] last:border-r-0"
          >
            <div className="text-fg-subtle mb-2 text-xs">{cell.label}</div>
            <div
              data-num
              className={`font-display text-2xl font-semibold tracking-tight ${cell.tone ?? ''}`}
            >
              {formatNumber(cell.value)}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilter(chip.id)}
            aria-pressed={filter === chip.id}
            className={`rounded-pill h-[34px] border px-3.5 text-sm font-medium ${
              filter === chip.id ? CHIP_ON : CHIP_OFF
            }`}
          >
            {chip.key ? t(chip.key) : chip.id}
          </button>
        ))}
      </div>

      <div className="bg-surface overflow-hidden rounded-lg border" data-table>
        <div
          className={`bg-bg-subtle text-fg-subtle grid ${COLUMNS} border-b py-[11px] text-xs font-semibold tracking-wide`}
        >
          <span>{col('device')}</span>
          <span>{col('restaurant')}</span>
          <span>{col('branch')}</span>
          <span>{col('type')}</span>
          <span>{col('version')}</span>
          <span>{col('sync')}</span>
          <span>{col('status')}</span>
        </div>

        {rows.map((device) => {
          const deviceState = DEVICE_LABEL[device.state];

          return (
            <div
              key={device.id}
              data-row
              className={`border-divider grid ${COLUMNS} items-center border-b py-[13px]`}
            >
              <span className="text-fg-muted font-mono text-xs">{device.id}</span>
              <span className="truncate text-sm font-semibold">{device.tenant}</span>
              <span className="text-fg-muted truncate text-sm">{device.branch}</span>
              <span className="text-fg-muted text-sm">{device.kind}</span>
              <span data-num className="text-fg-muted text-sm">
                {device.version}
              </span>
              <span className="text-fg-muted text-sm">{device.sync}</span>
              <span>
                <span
                  className={`rounded-pill text-2xs inline-flex items-center gap-1.5 px-[9px] py-1 font-semibold whitespace-nowrap ${deviceState.tone}`}
                >
                  <span aria-hidden className={`rounded-pill size-[5px] ${deviceState.dot}`} />
                  {state(deviceState.key)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
