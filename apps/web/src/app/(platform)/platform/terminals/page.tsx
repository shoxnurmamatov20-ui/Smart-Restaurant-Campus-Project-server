import { getTranslations } from 'next-intl/server';

import { Chip, Head, Stats, Table, Td, Tr, type ChipTone } from '../../platform-ui';
import { type Device, type DeviceState } from '../platform-data';
import { platformDevices } from '../platform-server';

export async function generateMetadata() {
  const t = await getTranslations('console.platformNav');
  return { title: t('terminals') };
}

/**
 * Every terminal on the platform, and which of them is not answering.
 *
 * Three states, not two. "Offline" and "needs an update" are different problems
 * with different phone calls behind them — one is a router, the other is a
 * version that will start refusing sync — and collapsing them into "not OK"
 * makes the list unactionable.
 *
 * The version column is coloured against what the API reports as current —
 * the highest version anybody is actually running — rather than against a
 * constant in this file, so a release does not turn every till amber until
 * somebody remembers to edit a page.
 */
export default async function TerminalsPage() {
  const [t, nav, { devices, currentVersion }] = await Promise.all([
    getTranslations('console.platformTerminals'),
    getTranslations('console.platformNav'),
    platformDevices(),
  ]);

  /*
   * Counted from the list on screen rather than from a helper over the
   * fixtures. `deviceCount()` reads DEVICES, so a live wall of forty terminals
   * would have drawn three KPIs about twelve demo ones.
   */
  const count = (state: DeviceState): number =>
    devices.filter((device: Device) => device.state === state).length;

  const TONE: Record<DeviceState, ChipTone> = {
    online: 'success',
    offline: 'danger',
    needsUpdate: 'warning',
  };

  /** Minutes into the coarsest true phrase. Precision here is noise. */
  const ago = (minutes: number): string => {
    if (minutes < 60) return t('minutesAgo', { n: minutes });
    if (minutes < 60 * 24) return t('hoursAgo', { n: Math.round(minutes / 60) });
    return t('daysAgo', { n: Math.round(minutes / (60 * 24)) });
  };

  return (
    <>
      <Head title={nav('terminals')} subtitle={t('subtitle', { n: devices.length })} />

      <Stats
        items={[
          { label: t('online'), value: String(count('online')), tone: 'success' },
          { label: t('needsUpdate'), value: String(count('needsUpdate')), tone: 'warning' },
          { label: t('offline'), value: String(count('offline')), tone: 'danger' },
          { label: t('current'), value: currentVersion, note: t('currentNote') },
        ]}
      />

      <Table
        head={[
          { label: t('colDevice') },
          { label: t('colTenant') },
          { label: t('colKind') },
          { label: t('colVersion') },
          { label: t('colSync'), align: 'right' },
          { label: t('colState'), align: 'right' },
        ]}
      >
        {devices.map((device) => (
          <Tr key={device.id}>
            <Td numeric className="font-semibold">
              {device.id}
            </Td>
            <Td>
              <span className="font-medium">{device.tenant}</span>
              <span className="text-fg-subtle block text-xs">{device.branch}</span>
            </Td>
            <Td className="text-fg-muted">{device.kind}</Td>
            <Td
              numeric
              className={
                device.version === currentVersion
                  ? 'text-fg-muted'
                  : 'text-warning-700 font-semibold'
              }
            >
              {device.version}
            </Td>
            <Td align="right" numeric className="text-fg-muted">
              {ago(device.syncedMinutesAgo)}
            </Td>
            <Td align="right">
              <Chip tone={TONE[device.state]}>{t(`state_${device.state}`)}</Chip>
            </Td>
          </Tr>
        ))}
      </Table>
    </>
  );
}
