'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ContextMenu({ menu, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x: 0, y: 0, ready: false });

  useEffect(() => {
    if (!menu) { setPos({ x: 0, y: 0, ready: false }); return; }
    // Defer to next frame to measure
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pad = 8;
      const x = Math.min(menu.x, window.innerWidth - rect.width - pad);
      const y = Math.min(menu.y, window.innerHeight - rect.height - pad);
      setPos({ x: Math.max(pad, x), y: Math.max(pad, y), ready: true });
    });
  }, [menu]);

  return (
    <AnimatePresence>
      {menu && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.12 }}
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            zIndex: 60,
            visibility: pos.ready ? 'visible' : 'hidden',
          }}
          className="glass min-w-[216px] rounded-xl py-1"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {items.map((it, i) =>
            it.divider ? (
              <div key={`d-${i}`} className="my-1 border-t border-line" />
            ) : (
              <button
                key={it.label}
                disabled={it.disabled}
                onClick={() => { it.onClick(); onClose(); }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                  it.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-ink-muted hover:bg-hover hover:text-ink'
                } ${it.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                {it.icon && <span className={it.danger ? '' : 'text-ink-faint'}>{it.icon}</span>}
                <span className="flex-1 truncate">{it.label}</span>
                {it.shortcut && <kbd className="kbd shrink-0">{it.shortcut}</kbd>}
              </button>
            ),
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
