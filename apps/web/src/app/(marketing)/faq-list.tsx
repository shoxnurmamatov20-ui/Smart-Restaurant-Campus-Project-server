'use client';

import { useState } from 'react';
import { useMessages } from 'next-intl';

import type { Messages } from '@/i18n';

import { FAQ } from './site-data';

/**
 * The FAQ, one answer open at a time.
 *
 * Written out rather than reached for from the component library: the design
 * gives this accordion its own geometry — a top hairline, a 20px row, a 22px
 * sign column, an answer inset 40px on the right — and the shared Accordion
 * primitive carries a chevron and its own padding that would have to be
 * overridden away one property at a time.
 *
 * The first entry starts open, as the prototype does. Clicking the open one
 * closes it. Questions come from the provider the page sets up, so switching
 * language re-renders this list with the open row intact.
 */
export function FaqList() {
  const items = (useMessages() as Messages).marketing.faq.items;
  const [open, setOpen] = useState(0);

  return (
    <div className="border-t">
      {FAQ.map((key, index) => {
        const entry = items[key];
        const isOpen = open === index;
        const panelId = `faq-panel-${index}`;
        const buttonId = `faq-button-${index}`;

        return (
          <div key={key} className="border-b">
            <button
              id={buttonId}
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpen(isOpen ? -1 : index)}
              className="text-fg flex w-full cursor-pointer items-center justify-between gap-5 border-0 bg-transparent px-1 py-5 text-left"
            >
              <span className="text-[16px] font-semibold tracking-[-.01em]">{entry.question}</span>
              <span
                aria-hidden
                className="text-fg-subtle grid size-[22px] flex-none place-items-center text-[19px] leading-none font-normal"
              >
                {isOpen ? '−' : '+'}
              </span>
            </button>

            {isOpen ? (
              <p
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                className="text-fg-muted text-md m-0 pt-0 pr-10 pb-[22px] pl-1 leading-[1.65] text-pretty"
              >
                {entry.answer}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
