---
name: prompt-engineering-root-causes
description: >-
  Fixes LLM behavior by updating prompts, schemas, and config at the source of
  truth in this repo (backend Gemini services, case-generation rules). Prefers
  explicit rules and structure over few-shot examples. Use when the user reports
  bad model output, tuning interrogation/case behavior, edits geminiChat.ts or
  geminiCase.ts, or asks to fix the underlying cause instead of one-off hacks or
  UI-only workarounds.
---

# Prompt engineering — fix root causes

## Default stance

When model behavior is wrong (tone, length, contradictions, game mechanics like aggravation, JSON fields), **fix the underlying instruction or structure** that produced it:

- **Prefer:** Clear rules and definitions in system/user prompt text, response schemas, ordering and separation of context blocks, and what the client sends (full history, attachments, flags). Tighten *what a field means* and *what must not be conflated* rather than illustrating with sample dialogues.
- **Avoid:** **Few-shot or worked examples** in prompts as the main fix — they bloat context, overfit to the sample, and rarely correct systematic mistakes. Also avoid patching a single scenario in the UI, hard-coding string replacements of model output, or special cases that duplicate what explicit rules should solve.

## Workflow

1. **Locate the source** — Suspect chat: `backend/src/services/geminiChat.ts` (`getSuspectResponse`, partner/officer helpers). Case generation and profile rules: `backend/src/services/geminiCase.ts` (`PROMPT_RULES`, `generateCaseFromPrompt`). Models: `backend/src/services/geminiModels.ts`.
2. **Name the failure mode** — e.g. "delta confuses character voice with detective provocation", "model forgets transcript", "schema allows invalid emotion".
3. **Adjust the rule** — Add explicit definitions, decouple concepts the model conflates, give numeric anchors when the game uses numbers, and state prohibitions or invariants in plain language (not sample Q/A or fake transcripts).
4. **Keep one source of truth** — Frontend delegates chat to the backend; do not duplicate prompt logic in the frontend.
5. **Sanity-check** — Ensure JSON/schema fields still match what the client consumes (`aggravationDelta`, `revealedEvidence`, etc.).

## Project-specific reminders

- Interrogation **aggravation** is driven by `aggravationDelta` in the suspect response; it must track **player/partner moves**, not NPC attitude in isolation.
- **Continuity** lives in the transcript block and continuity rules in `getSuspectResponse`; extend those before adding client-side "memory" hacks.
