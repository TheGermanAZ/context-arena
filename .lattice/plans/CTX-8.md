# Plan: Dashboard & Demo Content Expansion

## Scope
Add 3 new dashboard panels (ScenarioHeatmap, CostAccuracy, ScenarioDifficulty) + 3 new Demo sections + methodology block. All follow existing findBest→API→useQuery→component pipeline.

## Steps
1. **Backend**: Add 3 API routes to server.ts (scenario-heatmap, cost-accuracy, scenario-difficulty)
2. **Frontend plumbing**: Add types, api methods, hooks, and SCENARIO_COLORS to lib/
3. **Components**: Create ScenarioHeatmap.tsx, CostAccuracy.tsx, ScenarioDifficulty.tsx
4. **Dashboard registration**: Add to PANEL_MAP + Sidebar groups/presets
5. **Demo page**: Add methodology section, heatmap narrative, efficiency narrative + enrich leaderboard KPIs

## Acceptance Criteria
- All 3 new API endpoints return valid data
- Dashboard sidebar shows "Cross-Strategy Analysis" group with 3 new panels
- Demo page has 9 sections (3 new + 6 existing) with dynamic insights
- Window(10) missing cells handled gracefully (gray, not crash)
- All components support focus/filter interactions
