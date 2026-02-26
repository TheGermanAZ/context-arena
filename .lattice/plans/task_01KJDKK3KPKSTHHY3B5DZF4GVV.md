# CTX-7: Shared Chart Primitives

## Scope
Create 7 reusable chart primitive components + barrel export in `dashboard/src/components/charts/`.

## Files
1. `StyledTooltip.tsx` - Custom Recharts tooltip with dark glass-morphism
2. `GradientDefs.tsx` - SVG gradient definitions for chart fills
3. `AnimatedNumber.tsx` - Count-up animation using requestAnimationFrame
4. `Skeleton.tsx` - Pulsing placeholder for loading states
5. `KPICard.tsx` - Hero metric card with animated number
6. `Panel.tsx` - Card wrapper with title bar, badge, expand, export
7. `ExportButton.tsx` - PNG (html2canvas) and CSV export
8. `index.ts` - Barrel export

## Acceptance Criteria
- All files compile with `bunx tsc --noEmit`
- Components follow the exact interfaces specified in the task description
