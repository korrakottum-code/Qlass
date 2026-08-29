# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start dev server (Vite, usually port 5173–5175)
npm run build      # production build → dist/
npm run preview    # serve the dist/ build locally
npm run lint       # ESLint check
```

`npm test` runs `node --test` over `test/` and `tests/` (unit tests for pure utils + text-regex guards over App.jsx/migrations). Run it before proposing changes.

## Architecture

**Qlass** is a clinic queue-management SPA for a Thai beauty clinic chain. Stack: React 19 + Vite + Supabase (Postgres + Realtime + Edge Functions).

### State management — everything lives in `App.jsx`

There is no router library and no global state manager. All master data (branches, procedures, rooms, promos, staff, queues, tickets) is fetched from Supabase on mount, held in `useState` at the top of `App.jsx`, and passed down as props to every page. Navigation is a `page` string in state (persisted to `localStorage`).

The pattern for every entity:
1. Load once on mount via `supabaseService.js`
2. CRUD actions defined in `App.jsx` as `useCallback` handlers
3. Handlers call `supabaseService.js`, then update local state optimistically
4. Pages receive data + handlers as props — they contain no data-fetching logic themselves

Queues additionally have a Supabase Realtime subscription (INSERT/UPDATE/DELETE on `queues` table) that keeps state in sync across devices. On save, state is also updated immediately (without waiting for Realtime) to avoid perceived lag.

### Time block system

All time scheduling uses **blocks** where **1 block = 5 minutes**, counted from midnight:
- Block 108 = 09:00, Block 132 = 11:00, Block 144 = 12:00, Block 240 = 20:00
- `blockToTime(block)` in `helpers.js` converts blocks to `HH:MM` strings
- `room.openBlock` / `room.closeBlock` define room hours
- `procedure.blocks` = duration in 5-min blocks

### DB ↔ JS naming

Supabase columns are `snake_case`; JS objects are `camelCase`. All mapping lives in `supabaseService.js`. When adding a new field, update both the DB migration AND the map in `supabaseService.js`.

### Role-based access

Defined in `src/utils/constants.js` → `ROLES`. Six roles: `ceo`, `superadmin`, `head_admin`, `admin`, `branch_manager`, `cashier`. Each role has an explicit `pages` array that controls sidebar visibility and navigation. Login is PIN-based (no Supabase Auth); the current user is stored in `localStorage` as `qlass_user` (PIN excluded).

Branch filtering is applied in `App.jsx` via `filterByUserBranch()`: admin-level roles see all branches; `branch_manager` and `cashier` only see their own branch. All "filtered" variants of queues/rooms/schedules are computed with `useMemo` and passed to pages.

### Hidden page: AI chat

`ai-chat` is not in the sidebar. It's accessible only via URL hash `#ai-chat`. Admin+ roles can access it when logged in; it's also publicly accessible (no login) at `/#ai-chat` for demo use.

### Key utility files

| File | Purpose |
|---|---|
| `src/utils/supabaseService.js` | All Supabase queries; exports `getAllX` aliases for backward-compat |
| `src/utils/supabaseClient.js` | Supabase client singleton (reads env vars) |
| `src/utils/constants.js` | ROLES, QUEUE_STATUSES, ROOM_TYPES, NAV_ITEMS, block constants |
| `src/utils/helpers.js` | `blockToTime`, `formatThaiDate`, `filterByUserBranch`, `calcCommission` |
| `src/utils/smartParser.js` | Natural-language booking text → structured fields; learns aliases from corrections |
| `src/utils/exportService.js` | CSV export with Thai character support (xlsx library) |
| `src/utils/queueHistoryPagination.js` | Pure keyset-pagination helpers (uuid ranges, partial-safe walk, count check) used by `fetchQueues` for the full-history load |
| `src/utils/queueRanges.js` | Pure date-range helpers (`findUncoveredRanges`, `mergeRanges`, `addDays`) backing on-demand queue loading in App.jsx |

### Conflict detection

Before saving a queue, `App.jsx` fetches **fresh data from DB** (`fetchQueuesForRoomDate`) rather than trusting local state, to prevent race conditions when multiple devices book the same room simultaneously.

### Large table pagination

`fetchRoomSchedules` paginates in chunks of 1 000 rows via parallel OFFSET queries to work around Supabase's default row limit. Queues are **not** loaded in full on app open: Phase 2a loads only the last 30 days (`fetchQueues({ sinceDate })`, date-indexed OFFSET pages + `id` tiebreaker + dedupe), and `App.jsx` tracks `loadedRanges`. Pages that read older data (Commission, Export, CEO Dashboard, Summary, Capacity, or a date picker set to an old day) call the `onRangeNeeded(from, to)` prop; `ensureQueueRange` in App.jsx fetches only the uncovered gap via `fetchQueues({ sinceDate, untilDate })` and merges it (skipping ids deleted mid-load). Only the Export "Backup" button loads the whole table, on click, via keyset pagination (`src/utils/queueHistoryPagination.js`). Range helpers live in `src/utils/queueRanges.js`. A banner at the top of `.content` shows only while a range is loading or after one failed (with retry).

### Environment variables

Must be set in `.env` (or Vercel/Netlify dashboard):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Supabase Edge Function secrets (`supabase secrets set`):
- `QLASS_SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`)
- `QLASS_ALLOWED_ORIGIN` / `QLASS_ALLOWED_ORIGINS` — browser-called functions only
- `QLASS_EXTERNAL_API_KEY` — server-to-server key for `external-queue-stats`; must be ≥32 chars or the function fails closed

### External read-only API

`supabase/functions/external-queue-stats` exposes **aggregated queue counts** to other systems (e.g. an executive dashboard) without granting database access. It authenticates with `QLASS_EXTERNAL_API_KEY` (separate from staff login), aggregates inside SQL via the `public.external_queue_stats` RPC, and returns **no customer data and no `price`** — only counts per branch and per day. Deploy with `--no-verify-jwt` because the function checks the API key itself. See [`docs/EXTERNAL_QUEUE_STATS_API.md`](./docs/EXTERNAL_QUEUE_STATS_API.md).
