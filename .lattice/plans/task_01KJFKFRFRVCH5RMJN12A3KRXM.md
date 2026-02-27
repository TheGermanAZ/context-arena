# CTX-44: EXP-02 Intent Framing Preservation

## Problem
RLM compression strips conversational framing from benign incident-response scenarios, causing the compressed output to trigger safety refusals. In Memory-to-Action Micro (Incident Rollback), RLM(8) returned "I'm sorry, but I cannot assist" — 0/8 checks.

## Approach
Create a QPB variant that adds an explicit benign-context frame to the sub-LLM delegation prompt AND to the final system prompt. The frame preserves the intent: "This is a planning/logistics/incident-response conversation."

Two variants:
- V1: QPB + benign-context frame in delegation prompt
- V2: QPB + benign-context frame + action-plan constraint template

Run both against Memory-to-Action Micro (both scenarios) with 3 reps each.

## Acceptance Criteria
- 0 refusals on benign tasks across all reps
- No correctness drop vs QPB baseline on Conference Logistics
- Results JSON + findings update
