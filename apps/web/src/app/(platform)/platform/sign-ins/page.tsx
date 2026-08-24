import { getTranslations } from 'next-intl/server';

import { Chip, Head, Table, Td, Tr } from '../../platform-ui';
import { platformSignIns } from '../platform-server';

export async function generateMetadata() {
  const t = await getTranslations('console.platformNav');
  return { title: t('signIns') };
}

/**
 * Every operator sign-in, and every impersonation.
 *
 * Impersonation gets its own mark rather than being one action among five. It
 * is the most powerful thing this product can do — an operator standing inside
 * a customer's account, seeing their money — and an auditor scanning this page
 * must be able to find those rows without reading the sentences.
 *
 * The page is deliberately unfiltered and unpaged for now. A log with a filter
 * and no endpoint is a filter that lies about what it is filtering.
 */
export default async function SignInsPage() {
  const [t, nav, signIns] = await Promise.all([
    getTranslations('console.platformSignIns'),
    getTranslations('console.platformNav'),
    platformSignIns(),
  ]);

  const impersonations = signIns.filter((entry) => entry.impersonation).length;

  return (
    <>
      <Head title={nav('signIns')} subtitle={t('subtitle')} />

      {impersonations > 0 ? (
        <p className="border-warning-500/30 bg-warning-50 text-warning-700 mb-5 rounded-md border px-3.5 py-3 text-sm leading-normal">
          {t('impersonationNote', { n: impersonations })}
        </p>
      ) : null}

      <Table
        head={[
          { label: t('colWhen') },
          { label: t('colWho') },
          { label: t('colWhat') },
          { label: '', align: 'right' },
        ]}
      >
        {signIns.map((entry) => (
          <Tr key={entry.id}>
            <Td numeric className="text-fg-muted">
              {entry.at}
            </Td>
            <Td className="font-medium">{entry.who}</Td>
            <Td className="text-fg-muted">
              {t(`action_${entry.action}`, {
                tenant: entry.tenant ?? '',
                reference: entry.reference ?? '',
              })}
            </Td>
            <Td align="right">
              {entry.impersonation ? <Chip tone="warning">{t('impersonation')}</Chip> : null}
            </Td>
          </Tr>
        ))}
      </Table>
    </>
  );
}
