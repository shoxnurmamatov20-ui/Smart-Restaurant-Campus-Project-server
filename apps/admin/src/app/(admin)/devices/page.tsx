import { DeviceTable } from './device-table';

export const metadata = { title: 'Terminallar' };

/**
 * Every till and kitchen screen the platform runs.
 *
 * TODO — once the platform API lands:
 *   - Live sync status off the device heartbeat rather than a stored timestamp
 *   - Pushing an update to a named terminal, and the rollout it belongs to
 *   - Deregistering a terminal that has left the estate
 */
export default function DevicesPage() {
  return <DeviceTable />;
}
