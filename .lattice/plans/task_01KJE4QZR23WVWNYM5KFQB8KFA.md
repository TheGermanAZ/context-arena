# CTX-36: Surface parallel benchmark experiments on the website

Add /api/parallel-benchmarks endpoint, ParallelBenchmarks component, integrate into Findings and Dashboard pages. Covers all 7 CTX-26 benchmark tracks.

## Steps
1. Add server endpoint `/api/parallel-benchmarks` reading 8 result prefixes
2. Add types, schema, api call, and hook in frontend lib
3. Create `ParallelBenchmarks.tsx` component
4. Replace hardcoded Findings Section 8 table with live component
5. Add to Dashboard PANEL_MAP and Sidebar

## Acceptance Criteria
- `GET /api/parallel-benchmarks` returns unified scoreboard rows
- Component renders with loading/error states
- Findings page Section 8 uses live data
- Dashboard has new panel available
