# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A single-user file manager for Cloudflare R2, personal to Ayush. Next.js 15 (App
Router, JavaScript — **no TypeScript**), React 19, Tailwind v4, framer-motion.
Deployed on Vercel.

Two independent "scopes", each backed by its own R2 bucket:

| Scope     | Bucket env                | Root prefix | Public URL                          |
| --------- | ------------------------- | ----------- | ----------------------------------- |
| `public`  | `R2_BUCKET_NAME`          | `uploads`   | `R2_PUBLIC_BASE_URL` (storage.procd.cc) |
| `private` | `R2_PRIVATE_BUCKET_NAME`  | `private`   | none — pre-signed URLs only         |

Everything routes through `/upload/public` and `/upload/private`, which both
render the same `DrivePage` component with a different `scope` prop.

**The free plan is a hard design constraint.** 10 GB storage, 1M Class A ops
(writes + LISTs) and 10M Class B ops (reads) per month. Prefer caching over
re-listing; see "Operation budget" below.

## Commands

```bash
npm run dev      # next dev --turbopack, port 3000
npm run build    # must pass clean before shipping
npm run lint
node scripts/generate-totp.mjs   # re-provision the 2FA secret
```

## Auth

NextAuth credentials provider: username + password + TOTP, all from env. There
is exactly one user. Server routes accept **either** a session **or** an
`x-api-key` header matching `INTERNAL_API_KEY` — the latter exists for scripts
and is the easiest way to exercise the API locally:

```bash
KEY=$(grep '^INTERNAL_API_KEY' .env | cut -d= -f2-)
curl -H "x-api-key: $KEY" localhost:3000/api/drive/public/list
```

Every route guards with `requireAuthAndScope(req, scopeName)` (or `requireAuth`
for scope-less routes like `/api/drive/usage`). Never add a route without one.

## Key layout

```
lib/r2/          server-only R2 primitives — no React, no 'use client'
  client.js      shared S3Client (checksums disabled; R2 rejects them on presign)
  scope.js       SCOPES map: bucket + rootPrefix + publicBase per scope
  keys.js        ALL key/prefix math + the reserved-path guards
  listing.js     paginated LIST helpers, batched delete
  transfer.js    copy/move/rename for keys and folders
  trash.js       soft delete
  usage.js       storage accounting + quota snapshot (cached)
  guard.js       auth + scope resolution for routes
  mime.js, zip.js
lib/cloudflare.js  optional Cloudflare REST/GraphQL client (billing numbers)

app/api/drive/[scope]/*   per-scope routes
app/api/drive/usage       cross-scope quota snapshot

app/lib/         client-side helpers
  driveClient.js   every fetch to /api/drive lives here — add new calls here
  shortcuts.js     THE keyboard shortcut catalogue (see below)
  fileTypes.js     category detection (client copy; server uses lib/r2/mime.js)
  dnd.js           drag-and-drop MIME constant
app/hooks/       useDriveData, useSelection, useClipboard, useStarred, useUsage,
                 usePersistentState, useKeyboardShortcuts, useContextMenu, useLongPress
app/components/drive/*    all drive UI; DrivePage.jsx is the orchestrator
```

### Object key format

`<rootPrefix>/<folders…>/<uuid>-<filename>`

The UUID prefix is stripped for display by `basenameFromKey`. Renames keep the
UUID and swap only the readable half, so **an object's key is not stable across
renames or moves** — anything caching a key (stars, in-flight previews) must
tolerate it going away.

Folders are virtual. An empty one is materialised by a `.keep` marker object;
`isFolderMarker` filters those from listings and object counts.

## Things that will bite you

**`.trash` is reserved.** Soft-deleted items live at
`<root>/.trash/<token>/<originalRelPath>`. `token` is base64url JSON carrying
display metadata only — restore works purely by stripping the token segment, so
there is no database. Any route that lists, searches, or walks the bucket must
exclude it via `isTrashKey` / `isReservedRelPath`. Both are in `lib/r2/keys.js`.

**Trash still costs storage.** It counts toward the 10 GB. The usage endpoint
reports `trashBytes` separately and the UI says so.

**framer-motion swallows `onDragStart`.** `motion.div` claims that prop for its
own gesture system and never forwards it to the DOM. HTML5 drag sources must use
`onDragStartCapture` instead — see `FileGrid.jsx` / `FileList.jsx`.

**CSS layer order.** Component classes in `app/globals.css` live inside
`@layer components` on purpose. Unlayered CSS beats every layer, so an unlayered
`.custom-input { padding }` would silently defeat `class="custom-input pl-9"`.
Keep new component classes inside that layer.

**Presigned PUTs must be signed with `content-type`** and the client must send
the identical header, or R2 returns 403. Flexible checksums are disabled in
`client.js` for the same reason.

**`usePersistentState` adopts localStorage in an effect**, not during render —
reading storage during render desyncs SSR markup and trips hydration errors.

## Keyboard shortcuts

`app/lib/shortcuts.js` is the single source of truth. The hook
(`useKeyboardShortcuts`) and the help sheet (`ShortcutsModal`) both read it, so
they cannot drift. To add a shortcut: append to `SHORTCUTS`, then supply a
handler keyed by its `id` in `DrivePage`. A binding with no handler is inert.

- `mod` resolves to ⌘ on Apple, Ctrl elsewhere.
- Single-key bindings are suppressed while focus is in an input unless the entry
  sets `allowInInput`.
- Punctuation keys skip the Shift comparison (`?` *is* Shift+/), except when the
  combo names `shift` explicitly. That is why `helpAlt` (`shift+/`) is listed
  before `search` (`/`) — order decides the match.

## Responsive rules

The app is used on a phone as much as a desktop. Verify changes at **390×844
with device emulation** — Chrome refuses to size a window below 500px, so a
plain window resize will not reveal mobile bugs.

- **Nothing may scroll horizontally.** Assert `documentElement.scrollWidth ===
  clientWidth`. The selection bar in particular must never gain `overflow-x`;
  when actions do not fit, they fold into its `⋯` menu (below `xl`) instead.
- **Z-order:** selection bar 40 · upload toasts 50 · mobile sidebar drawer 55 ·
  preview 60 / details sheet 60 · trash 65 · palette and shortcuts 70. The
  drawer must outrank the bar, or it paints underneath.
- **Details panel** is a side column at `lg+` and a bottom sheet below it, from
  one shared body. On touch it is opened from the context menu or the palette —
  the toolbar toggle is desktop-only.
- **Command palette** must stay reachable without a keyboard; the toolbar button
  is its only entry point on touch, and it is also how the shortcuts sheet is
  reached there.
- **Folder upload is desktop-only** — mobile Safari and Android Chrome do not
  implement `webkitdirectory`. Both the toolbar button and the palette command
  are gated (`useMediaQuery('(min-width: 640px)')`).
- Grid thumbs are `aspect-[4/3]` below `sm` and square above; two columns of
  square tiles leave barely two rows on a phone.
- An `xs` breakpoint (26rem) exists for rows that are dense on small phones.

## Operation budget

Class A operations are the scarce resource; a LIST costs one per 1000 objects.

- `getUsage()` caches for 5 min and serves stale-while-revalidate for an hour.
  Mutating routes call `invalidateUsageCache()` — **do this in any new route
  that writes to R2.**
- `/recent` caches per scope for 3 min (it needs a full LIST; R2 cannot sort by
  mtime).
- Search is a full prefix LIST, capped at 500 results. The command palette
  debounces 220 ms and refuses queries shorter than 2 characters.
- Thumbnails in the grid reuse the public URL. Private-scope thumbnails would
  need one presign each, so they are deliberately not rendered.

## Cloudflare API token (optional)

`lib/cloudflare.js` upgrades the storage meter from "counted from listings" to
Cloudflare's actual billed numbers plus month-to-date Class A/B operation
counts. Without it everything still works — the meter just falls back to the S3
scan and says so.

Token resolution: `CF_API_TOKEN` env, else `./.cf_token` in dev only (gitignored,
never deployed).

Required permissions — **the current `.cf_token` has neither**, it only carries
zone read, so `usage.source` is `"s3"` today:

- Account › Workers R2 Storage › Read
- Account › Account Analytics › Read

## Conventions

- JavaScript only. Match the surrounding style; no TypeScript, no new build steps.
- All client→server calls go through `app/lib/driveClient.js`.
- Colours come from the `@theme` tokens in `globals.css` (`bg-surface`,
  `text-ink-muted`, `border-line`, `bg-accent`, …). Do not add raw hex.
- The app is dark-only. Tokens make a light theme feasible later, but components
  are not yet audited for it.
- Destructive actions default to reversible: delete means trash, with an Undo
  toast. Permanent delete is a separate, confirmed path.
- Verify against the real bucket with the `x-api-key` curl flow, and clean up any
  test objects you create.
