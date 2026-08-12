import { getTranslations } from 'next-intl/server';
import { formatTiyinAmount } from '@restaurant/utils';

import { moduleMetadata } from '../../module-page';
import { ACTION, ACTION_PRIMARY, PageHead, Pill, Row, TableCard } from '../../screen';

export const generateMetadata = () => moduleMetadata('books');

/**
 * The books.
 *
 * Built to the design's Bookkeeping screen: four tabs — expenses, payables,
 * payroll, period close — with expenses open, which is where an accountant
 * spends the day.
 *
 * Overdue is the only row that gets red. A payable that is merely due is not a
 * problem, and colouring it like one is how a screen teaches people to ignore
 * its colours.
 *
 * TODO — Phase 1 · finance/books, once the module is built:
 *   - Entering an expense, with its document attached
 *   - Payables against received purchase orders, and the payment run
 *   - Payroll: rates, hours from Attendance, deductions
 *   - The period close, which locks everything above it
 *   - E-invoices through Didox, VAT, and the 1C export
 */
const COLUMNS = '[grid-template-columns:110px_minmax(0,1fr)_minmax(0,1.2fr)_140px_130px_120px]';

const TABS = ['tabExpenses', 'tabPayables', 'tabPayroll', 'tabClose'] as const;

/** 1 UZS = 100 tiyin. */
const som = (value: number): number => value * 100;

/**
 * The month's entries.
 *
 * TODO(api): GET /api/v1/finance/expenses?period= — the Finance module owns
 * these, and the period close locks them.
 */
const ENTRIES = [
  {
    id: 'e1',
    date: '01.08',
    category: 'catRent',
    payee: 'Chilonzor Invest MChJ',
    amount: som(38_000_000),
    state: 'statePaid',
    due: '01.08',
  },
  {
    id: 'e2',
    date: '03.08',
    category: 'catSupplies',
    payee: "Farg'ona Meat",
    amount: som(12_400_000),
    state: 'statePaid',
    due: '10.08',
  },
  {
    id: 'e3',
    date: '05.08',
    category: 'catUtilities',
    payee: 'Hududgaz',
    amount: som(3_100_000),
    state: 'stateDue',
    due: '15.08',
  },
  {
    id: 'e4',
    date: '06.08',
    category: 'catSupplies',
    payee: 'Osiyo Savdo',
    amount: som(8_900_000),
    state: 'stateOverdue',
    due: '09.08',
  },
  {
    id: 'e5',
    date: '07.08',
    category: 'catMarketing',
    payee: 'Instagram Ads',
    amount: som(2_600_000),
    state: 'statePaid',
    due: '07.08',
  },
  {
    id: 'e6',
    date: '08.08',
    category: 'catRepairs',
    payee: 'Sovutgich Servis',
    amount: som(1_450_000),
    state: 'stateDue',
    due: '18.08',
  },
  {
    id: 'e7',
    date: '09.08',
    category: 'catSupplies',
    payee: 'Milko',
    amount: som(4_320_000),
    state: 'stateOverdue',
    due: '08.08',
  },
  {
    id: 'e8',
    date: '10.08',
    category: 'catUtilities',
    payee: 'Toshkent Elektr',
    amount: som(5_780_000),
    state: 'stateDue',
    due: '20.08',
  },
] as const;

const STATE_TONE = {
  statePaid: 'success',
  stateDue: 'neutral',
  stateOverdue: 'danger',
} as const;

export default async function BooksPage() {
  const [nav, t] = await Promise.all([
    getTranslations('console.nav'),
    getTranslations('console.books'),
  ]);

  return (
    <>
      <PageHead title={nav('books')} subtitle={t('subtitle')}>
        <button type="button" className={ACTION}>
          {t('exportLedger')}
        </button>
        <button type="button" className={ACTION_PRIMARY}>
          {t('addExpense')}
        </button>
      </PageHead>

      <div className="bg-bg-muted mb-5 flex w-fit flex-wrap gap-0.5 rounded-md p-[3px]">
        {TABS.map((tab, index) => (
          <button
            key={tab}
            type="button"
            data-seg
            data-active={index === 0 ? 'true' : undefined}
            className="text-fg-muted h-8 rounded-[7px] border-0 bg-transparent px-3.5 text-sm font-medium"
          >
            {t(tab)}
          </button>
        ))}
      </div>

      <TableCard
        columns={COLUMNS}
        head={[
          t('colDate'),
          t('colCategory'),
          t('colSupplier'),
          { label: t('colAmount'), align: 'right' },
          t('colState'),
          { label: t('colDue'), align: 'right' },
        ]}
      >
        {ENTRIES.map((entry) => (
          <Row key={entry.id} columns={COLUMNS} className="py-3">
            <span data-num className="text-fg-muted font-mono text-sm">
              {entry.date}
            </span>
            <span className="min-w-0 truncate text-sm font-medium">{t(entry.category)}</span>
            <span className="text-fg-muted min-w-0 truncate text-sm">{entry.payee}</span>

            <span data-num className="text-right text-sm font-semibold">
              {formatTiyinAmount(entry.amount)}
            </span>

            <span>
              <Pill tone={STATE_TONE[entry.state]}>{t(entry.state)}</Pill>
            </span>

            <span
              data-num
              className={`text-right text-sm ${
                entry.state === 'stateOverdue' ? 'text-danger-700 font-semibold' : 'text-fg-muted'
              }`}
            >
              {entry.due}
            </span>
          </Row>
        ))}
      </TableCard>
    </>
  );
}
