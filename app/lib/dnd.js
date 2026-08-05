// Custom MIME type for internal drag-and-drop (grid → folder, grid → tree,
// grid → breadcrumb). Kept in its own module so drop targets do not have to
// import the component that happens to define it.
//
// Payload shape: { keys: string[], prefixes: string[], count: number }
export const DRAG_MIME = 'application/x-r2drive-items';
