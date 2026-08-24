import { ImageResponse } from 'next/og';

import { uz } from '@/i18n/uz';

/**
 * The card the platform's own link becomes when it is shared.
 *
 * The same argument as the restaurant site's, aimed at a different reader: this
 * one is forwarded into a chat between two restaurant owners, and the card is
 * the entire pitch most of them will ever see. Without it a link to a B2B
 * platform is a grey rectangle beside a URL.
 *
 * Generated rather than uploaded so it cannot go stale: the pill on the hero
 * and this image read the same catalogue, so what a shared card says is what
 * the page says. It mattered the day the pill stopped claiming a customer count
 * — "42 restoran, 118 filial" for a platform with none — and this image would
 * otherwise have gone on repeating it in every chat the link was pasted into.
 */
export const runtime = 'nodejs';

export const alt = 'Smart Restaurant Cloud';

export const size = { width: 1200, height: 630 };

export const contentType = 'image/png';

export default function OpenGraphImage() {
  const m = uz.marketing;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 76,
        background: '#0b0b0c',
        color: '#ffffff',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            border: '1px solid #3a3a3d',
            borderRadius: 999,
            padding: '10px 22px',
            fontSize: 26,
            color: '#c9c9cd',
          }}
        >
          {m.hero.pill}
        </div>

        <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05, maxWidth: 900 }}>
          {m.hero.title}
        </div>

        <div style={{ fontSize: 32, color: '#a8a8ad', lineHeight: 1.35, maxWidth: 880 }}>
          {m.hero.body}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 26,
          color: '#8b8b90',
        }}
      >
        <div style={{ display: 'flex' }}>{m.hero.note}</div>
        <div style={{ display: 'flex', color: '#ffffff', fontWeight: 600 }}>
          Smart Restaurant Cloud
        </div>
      </div>
    </div>,
    size,
  );
}
