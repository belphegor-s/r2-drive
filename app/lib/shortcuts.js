// Single source of truth for keyboard shortcuts.
//
// Every binding lives here so the handler wiring (useKeyboardShortcuts) and the
// help sheet (ShortcutsModal) can never drift apart. A shortcut is only real if
// it appears in this list.

const IS_APPLE =
  typeof navigator !== 'undefined' &&
  /mac|iphone|ipad|ipod/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);

export const MOD_LABEL = IS_APPLE ? '⌘' : 'Ctrl';

/**
 * combo grammar: parts joined by "+", modifiers first.
 *   mod   → ⌘ on Apple, Ctrl elsewhere
 *   ctrl / meta / shift / alt
 *   key   → a KeyboardEvent.key value, lowercased (e.g. "a", "enter", "arrowup", "?")
 */
export const SHORTCUTS = [
  // ─── General ─────────────────────────────────────────────────────────────
  { id: 'palette',      combo: 'mod+k',        group: 'General',   label: 'Command palette', allowInInput: true },
  { id: 'help',         combo: '?',            group: 'General',   label: 'Keyboard shortcuts' },
  // Some layouts report Shift+/ as "/" rather than "?"; this alias must be
  // listed before the bare "/" binding so it wins the match.
  { id: 'helpAlt',      combo: 'shift+/',      group: 'General',   label: 'Keyboard shortcuts', hidden: true },
  { id: 'search',       combo: '/',            group: 'General',   label: 'Search this drive' },
  { id: 'searchAlt',    combo: 'mod+f',        group: 'General',   label: 'Search this drive', hidden: true },
  { id: 'refresh',      combo: 'r',            group: 'General',   label: 'Refresh listing' },
  { id: 'toggleSidebar',combo: 'b',            group: 'General',   label: 'Toggle sidebar' },
  { id: 'toggleView',   combo: 'v',            group: 'General',   label: 'Switch grid / list' },
  { id: 'toggleDetails',combo: 'i',            group: 'General',   label: 'Toggle details panel' },

  // ─── Navigation ──────────────────────────────────────────────────────────
  { id: 'cursorDown',   combo: 'arrowdown',    group: 'Navigation', label: 'Move down' },
  { id: 'cursorUp',     combo: 'arrowup',      group: 'Navigation', label: 'Move up' },
  { id: 'cursorRight',  combo: 'arrowright',   group: 'Navigation', label: 'Move right (grid)' },
  { id: 'cursorLeft',   combo: 'arrowleft',    group: 'Navigation', label: 'Move left (grid)' },
  { id: 'cursorFirst',  combo: 'home',         group: 'Navigation', label: 'Jump to first item' },
  { id: 'cursorLast',   combo: 'end',          group: 'Navigation', label: 'Jump to last item' },
  { id: 'open',         combo: 'enter',        group: 'Navigation', label: 'Open folder / preview file' },
  { id: 'goUp',         combo: 'backspace',    group: 'Navigation', label: 'Go to parent folder' },
  { id: 'goHome',       combo: 'mod+shift+h',  group: 'Navigation', label: 'Go to drive root' },

  // ─── Selection ───────────────────────────────────────────────────────────
  { id: 'selectAll',    combo: 'mod+a',        group: 'Selection', label: 'Select everything here' },
  { id: 'toggleSelect', combo: ' ',            group: 'Selection', label: 'Select / deselect item', keyLabel: 'Space' },
  { id: 'extendDown',   combo: 'shift+arrowdown', group: 'Selection', label: 'Extend selection down' },
  { id: 'extendUp',     combo: 'shift+arrowup',   group: 'Selection', label: 'Extend selection up' },
  { id: 'clear',        combo: 'escape',       group: 'Selection', label: 'Clear selection / close', allowInInput: true },

  // ─── File actions ────────────────────────────────────────────────────────
  { id: 'newFolder',    combo: 'n',            group: 'Files', label: 'New folder' },
  { id: 'uploadFiles',  combo: 'u',            group: 'Files', label: 'Upload files' },
  { id: 'uploadFolder', combo: 'shift+u',      group: 'Files', label: 'Upload folder' },
  { id: 'rename',       combo: 'f2',           group: 'Files', label: 'Rename' },
  { id: 'download',     combo: 'd',            group: 'Files', label: 'Download' },
  { id: 'star',         combo: 's',            group: 'Files', label: 'Star / unstar' },
  { id: 'copyLink',     combo: 'mod+shift+c',  group: 'Files', label: 'Copy link' },
  { id: 'clipCopy',     combo: 'mod+c',        group: 'Files', label: 'Copy' },
  { id: 'clipCut',      combo: 'mod+x',        group: 'Files', label: 'Cut' },
  { id: 'clipPaste',    combo: 'mod+v',        group: 'Files', label: 'Paste here' },
  { id: 'trash',        combo: 'delete',       group: 'Files', label: 'Move to trash' },
  { id: 'trashAlt',     combo: 'mod+backspace',group: 'Files', label: 'Move to trash', hidden: true },
  { id: 'purge',        combo: 'shift+delete', group: 'Files', label: 'Delete permanently' },
];

export const SHORTCUT_GROUPS = ['General', 'Navigation', 'Selection', 'Files'];

const KEY_LABELS = {
  arrowdown: '↓',
  arrowup: '↑',
  arrowleft: '←',
  arrowright: '→',
  enter: '↵',
  escape: 'Esc',
  backspace: '⌫',
  delete: 'Del',
  home: 'Home',
  end: 'End',
  ' ': 'Space',
};

/** Human-readable form of a combo, e.g. "mod+shift+c" → "⌘ Shift C". */
export function formatCombo(combo, keyLabel) {
  return combo
    .split('+')
    .map((part) => {
      if (part === 'mod') return MOD_LABEL;
      if (part === 'shift') return IS_APPLE ? '⇧' : 'Shift';
      if (part === 'alt') return IS_APPLE ? '⌥' : 'Alt';
      if (part === 'ctrl') return IS_APPLE ? '⌃' : 'Ctrl';
      if (part === 'meta') return '⌘';
      if (keyLabel) return keyLabel;
      return KEY_LABELS[part] || part.toUpperCase();
    })
    .join(' ');
}

function parseCombo(combo) {
  const parts = combo.split('+');
  const key = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  return {
    key,
    mod: mods.has('mod'),
    ctrl: mods.has('ctrl'),
    meta: mods.has('meta'),
    shift: mods.has('shift'),
    alt: mods.has('alt'),
  };
}

const PARSED = new Map(SHORTCUTS.map((s) => [s.id, { ...s, parsed: parseCombo(s.combo) }]));

export function getShortcut(id) {
  return PARSED.get(id);
}

/** Does this keyboard event match the given parsed combo? */
export function matches(event, parsed) {
  const key = event.key === '+' ? '+' : event.key.toLowerCase();
  if (key !== parsed.key) return false;

  const modDown = IS_APPLE ? event.metaKey : event.ctrlKey;
  const otherMod = IS_APPLE ? event.ctrlKey : event.metaKey;

  if (parsed.mod) {
    if (!modDown) return false;
  } else if (parsed.ctrl) {
    if (!event.ctrlKey) return false;
  } else if (parsed.meta) {
    if (!event.metaKey) return false;
  } else if (modDown || otherMod) {
    // An unmodified binding must not swallow ⌘/Ctrl combos.
    return false;
  }

  // Punctuation keys already encode Shift in the character itself ("?" is
  // Shift+/ on most layouts), so comparing shiftKey there would never match.
  // A combo that names `shift` explicitly still has to see it pressed.
  const shiftIsImplicit = !parsed.shift && parsed.key.length === 1 && !/[a-z0-9 ]/.test(parsed.key);
  if (!shiftIsImplicit && parsed.shift !== event.shiftKey) return false;
  if (parsed.alt !== event.altKey) return false;

  return true;
}

/** All bindings in display order, minus the hidden aliases. */
export function visibleShortcuts() {
  return SHORTCUTS.filter((s) => !s.hidden);
}
