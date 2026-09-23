import { ImageResponse } from 'next/og';

// iOS applies its own corner mask, so this is the logo glyph on a full-bleed square.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
        }}
      >
        <svg width="132" height="132" viewBox="8 8 48 48">
          <path
            fill="#fff"
            d="M13 20.5a3.5 3.5 0 0 1 3.5-3.5h9.3l4.2 4.5h17.5a3.5 3.5 0 0 1 3.5 3.5v19.5a3.5 3.5 0 0 1-3.5 3.5h-31a3.5 3.5 0 0 1-3.5-3.5z"
          />
          <path
            fill="none"
            stroke="#1d4ed8"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M32 41V29.5M26 35.5l6-6 6 6"
          />
        </svg>
      </div>
    ),
    size,
  );
}
