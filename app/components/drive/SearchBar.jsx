'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

// Focus is driven by the global shortcut registry (see app/lib/shortcuts.js),
// so this component deliberately registers no key listener of its own.
const SearchBar = forwardRef(function SearchBar({ scope, onSubmit, onClearActive, activeQuery, autoFocus = false }, ref) {
  const [q, setQ] = useState(activeQuery || '');
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
    blur: () => inputRef.current?.blur(),
    select: () => inputRef.current?.select(),
    clear: () => onClearActive?.(),
  }));

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    setQ(activeQuery || '');
  }, [activeQuery]);

  const handleSubmit = useCallback(() => {
    const query = q.trim();
    if (!query) return;
    onSubmit?.({ q: query });
  }, [q, onSubmit]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (q) {
        setQ('');
        onClearActive?.();
      } else {
        inputRef.current?.blur();
      }
    }
  };

  return (
    <div className="relative w-full max-w-md">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />

      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDownCapture={onKeyDown}
        placeholder={`Search the ${scope} drive…`}
        aria-label={`Search the ${scope} drive`}
        className="custom-input pl-9 pr-16"
      />

      {!q && <kbd className="kbd absolute right-2 top-1/2 -translate-y-1/2">/</kbd>}

      {q && (
        <button
          type="button"
          onClick={() => {
            setQ('');
            onClearActive?.();
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint transition-colors hover:text-ink"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
});

export default SearchBar;
