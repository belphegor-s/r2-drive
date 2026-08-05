'use client';

import { useEffect, useRef } from 'react';
import { SHORTCUTS, getShortcut, matches } from '@/app/lib/shortcuts';

function isEditingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Binds the shortcut catalogue to handlers.
 *
 * @param handlers  { [shortcutId]: (event) => void }  — only ids present here are live.
 * @param options.enabled  false parks every binding (used while a modal owns the keyboard).
 * @param options.allowWhileEditing  ids that still fire inside inputs, on top of
 *        the ones the catalogue already marks `allowInInput`.
 */
export default function useKeyboardShortcuts(handlers, { enabled = true, allowWhileEditing = [] } = {}) {
  // Handlers are re-created every render; a ref keeps the listener stable so we
  // are not tearing down and re-adding a window listener on each keystroke.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const allowRef = useRef(allowWhileEditing);
  allowRef.current = allowWhileEditing;

  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (event) => {
      const editing = isEditingTarget(event.target);

      for (const shortcut of SHORTCUTS) {
        const handler = handlersRef.current?.[shortcut.id];
        if (!handler) continue;

        if (editing && !shortcut.allowInInput && !allowRef.current.includes(shortcut.id)) continue;

        const parsed = getShortcut(shortcut.id)?.parsed;
        if (!parsed || !matches(event, parsed)) continue;

        // Escape inside an input should blur, not run drive actions.
        if (editing && shortcut.id === 'clear') {
          event.target.blur?.();
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        handler(event);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
