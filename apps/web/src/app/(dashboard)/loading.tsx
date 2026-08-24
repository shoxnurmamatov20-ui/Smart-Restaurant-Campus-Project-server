/**
 * What a module looks like while it is arriving.
 *
 * Next nests this under the layout, so the sidebar, the top bar and the status
 * strip stay on screen and only the page area changes — which is the whole
 * point. The console fell through to `app/loading.tsx`, a centred spinner that
 * replaced the *entire* shell: navigation vanished, the branch and the language
 * vanished, and the screen a manager was reading was replaced by a dot. On a
 * slow connection that reads as the app crashing.
 *
 * `Smart Restaurant OS.dc.html:490-546` verbatim, down to the block widths:
 * a page head with two action buttons, four KPI cards each with a label, a
 * figure, a caption and a rail, then the 1.4/1 split — six rows on the left,
 * a donut and four legend lines on the right.
 *
 * **`data-sk`, not `animate-pulse`.** The design's loading block is a band
 * travelling left to right across a muted fill, and `packages/ui/motion.css`
 * binds that shimmer to this attribute. A pulsing opacity is a different
 * animation with a different feel, and it reads as *something is broken here*
 * where the sweep reads as *something is coming*. The attribute also carries
 * the reduced-motion fallback, which the pulse did not.
 *
 * The widths are uneven on purpose. A column of identical grey bars looks like
 * a rendering artefact; ragged ones look like text.
 *
 * `aria-hidden` on the blocks and one live region for the sentence. A screen
 * reader announcing thirty grey rectangles is worse than a spinner.
 */

/** The design's own four card widths, and its six row pairs. */
const KPI_WIDTHS = ['72%', '58%', '66%', '50%'];

const ROWS = [
  { a: '46%', b: '62%' },
  { a: '58%', b: '40%' },
  { a: '38%', b: '55%' },
  { a: '52%', b: '34%' },
  { a: '44%', b: '60%' },
  { a: '60%', b: '42%' },
];

export default function DashboardLoading() {
  return (
    <div data-loading aria-busy="true">
      <span className="sr-only" role="status">
        …
      </span>

      <div aria-hidden className="mx-auto max-w-[1440px]">
        {/* The page head: heading, lede, and the actions opposite. */}
        <div className="mb-[22px] flex items-end justify-between gap-6">
          <div className="max-w-[420px] flex-1">
            <div data-sk className="h-[26px] w-[56%] rounded-[7px]" />
            <div data-sk className="mt-[11px] h-3.5 w-[82%] rounded-md" />
          </div>
          <div className="flex flex-none gap-2.5">
            <div data-sk className="h-9 w-[104px] rounded-md" />
            <div data-sk className="h-9 w-[132px] rounded-md" />
          </div>
        </div>

        {/* The KPI row, at the design's auto-fit floor. */}
        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3">
          {KPI_WIDTHS.map((width, slot) => (
            <div key={slot} className="bg-surface rounded-lg border p-5">
              <div data-sk className="h-3 w-[48%] rounded-[5px]" />
              <div data-sk className="mt-3.5 h-[30px] rounded-[7px]" style={{ width }} />
              <div data-sk className="mt-3 h-[11px] w-[62%] rounded-[5px]" />
              <div data-sk className="mt-4 h-[3px] w-full rounded-[2px]" />
            </div>
          ))}
        </div>

        {/* The 1.4/1 split every module body uses. */}
        <div data-split className="mt-4 grid [grid-template-columns:1.4fr_1fr] gap-4">
          <div className="bg-surface rounded-lg border px-[22px] py-5">
            <div data-sk className="h-3.5 w-[34%] rounded-md" />
            <div className="mt-[18px] flex flex-col">
              {ROWS.map((row, index) => (
                <div
                  key={index}
                  className="border-divider flex items-center gap-3.5 border-b py-[13px]"
                >
                  <div data-sk className="size-[30px] flex-none rounded-[9px]" />
                  <div className="min-w-0 flex-1">
                    <div data-sk className="h-[13px] rounded-[5px]" style={{ width: row.a }} />
                    <div
                      data-sk
                      className="mt-[7px] h-[11px] rounded-[5px]"
                      style={{ width: row.b }}
                    />
                  </div>
                  <div data-sk className="h-[13px] w-[72px] flex-none rounded-[5px]" />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface rounded-lg border px-[22px] py-5">
            <div data-sk className="h-3.5 w-[46%] rounded-md" />
            <div className="mt-[22px] grid place-items-center">
              <div data-sk className="rounded-pill size-[132px]" />
            </div>
            <div className="mt-[22px] flex flex-col gap-[11px]">
              {ROWS.slice(0, 4).map((row, index) => (
                <div key={index} className="flex items-center gap-2.5">
                  <div data-sk className="rounded-pill size-2 flex-none" />
                  <div data-sk className="h-[11px] flex-1 rounded-[5px]" style={{ width: row.a }} />
                  <div data-sk className="h-[11px] w-[52px] flex-none rounded-[5px]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
