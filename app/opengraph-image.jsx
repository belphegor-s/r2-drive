import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

// Rendered once at build time; shared by twitter-image.jsx.
export const alt = 'R2 Drive — a personal file drive on Cloudflare R2';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Mirrors the @theme tokens in globals.css (ImageResponse cannot read CSS vars).
const C = {
  canvas: '#101113',
  surface: '#17181b',
  raised: '#1d1f23',
  sunken: '#0b0c0e',
  line: '#26292f',
  lineStrong: '#343841',
  ink: '#e8eaed',
  muted: '#9aa0a6',
  faint: '#6b7280',
  accent: '#3b82f6',
};

// Same category colours as StorageMeter.
const FILES = [
  { name: 'IMG_2291.jpg', ext: 'JPG', color: '#34d399' },
  { name: 'lease-2026.pdf', ext: 'PDF', color: '#f87171' },
  { name: 'reel-final.mp4', ext: 'MP4', color: '#f472b6' },
  { name: 'notes.md', ext: 'MD', color: '#38bdf8' },
  { name: 'backup.zip', ext: 'ZIP', color: '#fbbf24', selected: true },
  { name: 'voice-memo.m4a', ext: 'M4A', color: '#c084fc' },
  { name: 'invoice-09.pdf', ext: 'PDF', color: '#f87171' },
  { name: 'budget.xlsx', ext: 'XLSX', color: '#60a5fa' },
  { name: 'DSC_0412.jpg', ext: 'JPG', color: '#34d399' },
];

const METER = [
  { color: '#34d399', w: 34 },
  { color: '#f472b6', w: 22 },
  { color: '#f87171', w: 12 },
  { color: '#60a5fa', w: 8 },
  { color: '#fbbf24', w: 6 },
];

const asset = (p) => readFile(join(process.cwd(), 'assets', p));

function Tile({ file }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 184,
        height: 150,
        borderRadius: 14,
        background: C.raised,
        border: `1.5px solid ${file.selected ? C.accent : C.line}`,
        boxShadow: file.selected ? `0 0 0 4px ${C.accent}33` : 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          background: `${file.color}14`,
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            padding: '5px 10px',
            borderRadius: 7,
            background: `${file.color}26`,
            color: file.color,
            fontFamily: 'Mono',
            fontSize: 15,
            letterSpacing: 1,
          }}
        >
          {file.ext}
        </div>
      </div>
      <div style={{ display: 'flex', padding: '10px 12px', fontFamily: 'Mono', fontSize: 14, color: C.muted }}>{file.name}</div>
    </div>
  );
}

function Pill({ label, active }) {
  return (
    <div
      style={{
        display: 'flex',
        padding: '10px 22px',
        borderRadius: 999,
        background: active ? C.accent : 'transparent',
        color: active ? '#fff' : C.muted,
        fontSize: 22,
      }}
    >
      {label}
    </div>
  );
}

export default async function OpengraphImage() {
  const [regular, semibold, mono, logo] = await Promise.all([
    asset('fonts/Inter-Regular.woff'),
    asset('fonts/Inter-SemiBold.woff'),
    asset('fonts/JetBrainsMono-Medium.woff'),
    asset('logo/logo.svg'),
  ]);
  const logoSrc = `data:image/svg+xml;base64,${logo.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          position: 'relative',
          background: C.canvas,
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1.5px, transparent 1.5px)',
          backgroundSize: '28px 28px',
          fontFamily: 'Inter',
          color: C.ink,
        }}
      >
        {/* Left: identity */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: 600,
            padding: '72px 0 72px 80px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <img src={logoSrc} width={64} height={64} alt="" />
            <div style={{ display: 'flex', fontFamily: 'Mono', fontSize: 18, letterSpacing: 3, color: C.faint }}>
              CLOUDFLARE R2
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 104, fontWeight: 600, letterSpacing: -4.5, lineHeight: 1 }}>R2 Drive</div>
            <div style={{ display: 'flex', marginTop: 26, fontSize: 30, lineHeight: 1.4, color: C.muted, maxWidth: 480 }}>
              Public files on the edge. Private ones behind signed links.
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              padding: 6,
              borderRadius: 999,
              background: C.sunken,
              border: `1.5px solid ${C.line}`,
            }}
          >
            <Pill label="Private" active />
            <Pill label="Public" />
          </div>
        </div>

        {/* Right: the drive itself, bleeding off the frame */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            left: 640,
            top: 88,
            width: 660,
            height: 620,
            borderRadius: 22,
            background: C.surface,
            border: `1.5px solid ${C.lineStrong}`,
            boxShadow: '0 40px 80px -30px rgba(0,0,0,0.9)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px 26px',
              borderBottom: `1px solid ${C.line}`,
            }}
          >
            <div style={{ display: 'flex', gap: 10, fontFamily: 'Mono', fontSize: 16, color: C.faint }}>
              <span>private</span>
              <span>/</span>
              <span>archive</span>
              <span>/</span>
              <span style={{ color: C.ink }}>2026</span>
            </div>
            <div style={{ display: 'flex', width: 180, height: 8, borderRadius: 99, background: C.sunken, overflow: 'hidden', marginRight: 60 }}>
              {METER.map((m) => (
                <div key={m.color} style={{ display: 'flex', width: `${m.w}%`, height: '100%', background: m.color }} />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, padding: 26 }}>
            {FILES.map((f) => (
              <Tile key={f.name} file={f} />
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Inter', data: regular, weight: 400, style: 'normal' },
        { name: 'Inter', data: semibold, weight: 600, style: 'normal' },
        { name: 'Mono', data: mono, weight: 500, style: 'normal' },
      ],
    },
  );
}
