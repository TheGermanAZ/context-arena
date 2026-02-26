# CTX-10: Add animations for displaying different strategies

## Scope
Add visible, intentional animations when strategy elements are rendered in the dashboard frontend.

## Approach
1. Add shared keyframes/util classes in `dashboard/src/index.css` for staggered strategy reveal.
2. Animate strategy cards in `dashboard/src/pages/Landing.tsx` with per-card delays.
3. Animate strategy rows and progress bars in `dashboard/src/components/Leaderboard.tsx`.
4. Stagger series entry animations in strategy-heavy charts:
   - `dashboard/src/components/TokenCost.tsx`
   - `dashboard/src/components/CodeStrategies.tsx`
5. Validate with `bun run build` in `dashboard`.

## Acceptance Criteria
- Strategy cards on Landing animate in with staggered timing.
- Strategy entries in leaderboard visibly animate when displayed.
- Token/strategy chart lines or bars animate in with staggered timing.
- Dashboard build succeeds after changes.
