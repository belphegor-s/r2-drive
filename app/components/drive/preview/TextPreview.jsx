'use client';

import { useEffect, useState } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import { langForExt } from '@/app/lib/fileTypes';

const MAX_BYTES = 2 * 1024 * 1024;

export default function TextPreview({ url, name }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(url, { headers: { Range: `bytes=0-${MAX_BYTES - 1}` } })
      .then(async (r) => {
        if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}`);
        const buf = await r.arrayBuffer();
        if (!alive) return;
        if (buf.byteLength >= MAX_BYTES) setTruncated(true);
        setText(new TextDecoder('utf-8', { fatal: false }).decode(buf));
      })
      .catch((e) => { if (alive) setError(e); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [url]);

  const lang = langForExt(name);

  if (loading) return <div className="p-6 text-sm text-ink-faint">Loading…</div>;
  if (error) return <div className="p-6 text-sm text-red-400">Failed to load: {error.message}</div>;

  return (
    <div className="overflow-auto custom-scrollbar h-full">
      <Highlight code={text} language={lang} theme={themes.nightOwl}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className={`${className} text-xs sm:text-sm m-0 p-4`} style={{ ...style, background: 'transparent', minHeight: '100%' }}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })} className="flex">
                <span className="select-none text-ink-faint pr-4 text-right inline-block min-w-[2.5rem]">{i + 1}</span>
                <span>{line.map((token, k) => <span key={k} {...getTokenProps({ token })} />)}</span>
              </div>
            ))}
          </pre>
        )}
      </Highlight>
      {truncated && <div className="p-3 text-xs text-amber-400 border-t border-line">File truncated at 2 MB.</div>}
    </div>
  );
}
