import React from 'react';

/** Wordmark: LinkedIn-style blue (#0A66C2) + near-black */
const BRAND_BLUE = '#0A66C2';
const SYMBOL_INK = '#191919';

export function BrandMark({ large = false }) {
  const size = large ? '26px' : '22px';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '1px',
        fontWeight: 800,
        letterSpacing: '-0.03em',
        userSelect: 'none',
        lineHeight: 1,
      }}
    >
      <span style={{ fontSize: size, color: BRAND_BLUE }}>linkedln</span>
      <span style={{ fontSize: size, color: SYMBOL_INK }}>DS</span>
    </div>
  );
}
