/**
 * Stop a double-click from selecting text.
 *
 * `user-select: none` on the tile is not enough: when Chrome double-clicks a
 * non-selectable element it walks up to the nearest selectable ancestor and
 * selects a range there instead, which is how double-clicking a file ends up
 * highlighting half the page.
 *
 * The selection is started by the *default action of the second mousedown*, so
 * cancelling only that one kills it at the source. `click` and `dblclick` still
 * fire normally, and because the first mousedown is untouched, HTML5 drag still
 * initiates.
 */
export function preventDoubleClickSelection(event) {
  if (event.detail > 1) event.preventDefault();
}

/** Drop any stray selection left over from a rapid click sequence. */
export function clearSelection() {
  const selection = window.getSelection?.();
  if (selection && !selection.isCollapsed) selection.removeAllRanges();
}
