# Design: ROADMAP.md + A4/A5 sheet support

- **Date:** 2026-07-07
- **Status:** approved (brainstormed with maintainer; both sections approved)
- **Scope of this session:** deliverables 1 and 2 below, nothing else from v0.2.

## Context

bookletize v0.1.0 is published (saddle + tri-fold, letter/legal, CLI, fold
guides; 25 green tests). A roadmap exists in two places — README `## Roadmap`
and CLAUDE.md `## Roadmap` — and they have drifted: CLAUDE.md lists
"half-legal" as v0.2 work although half-legal saddle shipped in 0.1
(`SHEETS.legalLandscape`). The maintainer wants the roadmap formalized and the
first v0.2 item implemented.

## Deliverable 1 — ROADMAP.md as single source of truth

New top-level `ROADMAP.md` with these sections:

1. **How this roadmap works** — quarterly release cadence; correctness fixes
   ship out-of-band; two acceptance gates stated as policy:
   - every mapping is locked by exact-array golden tests;
   - any **new fold pattern** must pass a physical fold test on real printers
     before it ships in a release. Code may merge earlier — the *release* is
     what blocks.
2. **v0.1 — shipped** (2026-07): saddle (half-letter, half-legal), letter
   tri-fold with narrow-flap allowance, CLI, fold guides, blank padding.
3. **v0.2 — in progress**, items in build order, each with a one/two-line
   scope and gate flag:
   1. **A4/A5 sheets** — named `a4-landscape` / `a3-landscape` sheet specs
      producing A5/A4 booklets. Same fold pattern as letter (print-verified);
      no new-layout gate. Paper spot-check on A4 stock noted as a pre-tag
      checklist item for 0.2.0.
   2. **Crop marks + bleed** — applier-side drawing in `src/pdf.ts`; no new
      fold pattern.
   3. **2-up** — new pure mapping in `src/impose.ts` + golden tests.
   4. **Cut-and-stack** — new pure mapping; ⚠ physical fold test gate.
   5. **Creep/shingling compensation** — progressive spine offset in the
      applier; ⚠ physical verification on a thick booklet before release.
   6. **Printer-quirks doc** — public doc extending PRINTING.md (promoted from
      CLAUDE.md's internal roadmap).
4. **v0.3** — browser build + free in-browser "Booklet this PDF" tool.
   **A4 tri-fold** listed under explicitly-deferred candidates (new fold
   layout → gated; never promised).
5. **v1.0** — API freeze. Freeze covers: exported names, option object
   shapes, CLI commands/flags, and the meaning of existing mappings.
6. **Non-goals** — mirrors the README "doesn't" column (no rendering, no
   layout, no content editing, no compression/encryption/signing) so
   out-of-scope issues have a permanent link target.

**Pointer edits (the drift fix):**

- README `## Roadmap`: keep the four summary bullets, add a link to
  ROADMAP.md for detail.
- CLAUDE.md `## Roadmap`: replace the paragraph with a one-line pointer to
  ROADMAP.md (this deletes the stale "half-legal" claim).

## Deliverable 2 — A4/A5 sheet support (TDD, red-green)

API surface (all in `src/pdf.ts`; `src/impose.ts` is untouched):

- `SHEETS` gains
  - `a4Landscape: { width: 841.89, height: 595.28 }`
  - `a3Landscape: { width: 1190.55, height: 841.89 }`
  (ISO 216 sizes in PDF points, matching pdf-lib's canonical values.)
- `SheetName` union gains `"a4-landscape" | "a3-landscape"`;
  `SHEET_BY_NAME` maps them. The `resolveSheet` error message self-updates
  (built from `Object.keys(SHEET_BY_NAME)`).
- `src/cli.ts`: `SHEET_NAMES` grows to the four names; usage text updated.

Testability note (found during spec self-review): the existing suite asserts
face counts and dimensions only — nothing observes the drawn scale/position
of an embedded page, so a scaling regression is currently invisible to tests.
Rather than parse PDF content streams in tests, extract the slot-fitting
geometry from `drawFace` into an exported pure helper:

- `fitSlot(slotWidth, sheetHeight, pageWidth, pageHeight)` →
  `{ scale, dx, dy }` where `scale = min(slotWidth/pageWidth,
  sheetHeight/pageHeight)`, `dx`/`dy` center the scaled page in the slot.
  `drawFace` calls it; behavior is unchanged (pure refactor guarded by the
  green suite). Exported from `bookletize/pdf` alongside the other
  lower-level entry points.

Tests (written first, must fail before implementation):

- CLI: `parseArgs` accepts `--sheet a4-landscape` and `--sheet a3-landscape`;
  unknown names still rejected with the names list.
- Applier: `applySaddle(bytes, { sheet: "a4-landscape" })` emits faces of
  841.89 × 595.28; `a3-landscape` emits 1190.55 × 841.89 (same
  `toBeCloseTo` style as the existing dimension tests).
- Placement golden via `fitSlot`: a true A5 portrait page (419.53 × 595.28)
  in a half-A4-landscape slot (420.945 wide, 595.28 high) fits at
  **scale exactly 1.0**, dx ≈ 0.7075 pt (float-tolerant assertion), dy 0 —
  ISO rounds each halving down, so real A5 fits half-A4 with a sliver to
  spare. Add one scale-down case (oversized page) locking the min-ratio
  choice.

Docs:

- README: A4/A5 in CLI options and API examples; move A4/A5 from the
  "(v0.2)" row of the does/doesn't table into the shipped "does" wording;
  roadmap marker stays on 0.2 (release flow moves it at publish).

## Non-goals for this session

- No version bump, no npm publish (0.2.0 tags when the whole v0.2 list is
  done).
- No portrait sheet names (saddle needs landscape sheets; YAGNI).
- No A4 tri-fold (new fold layout; deferred to v0.3 candidates).
- No other v0.2 items.

## Error handling

Existing paths already cover the new names: `resolveSheet` throws with the
valid-names list; CLI `--sheet` validation lists `SHEET_NAMES`. Both derive
from the single map/array being extended, so messages stay correct by
construction.

## Git plan

Direct commits to main (repo convention; no branch rule applies to this
repo):

1. spec commit (this file),
2. `ROADMAP.md` + README/CLAUDE.md pointer edits,
3. A4/A5 feature red-green (tests + implementation + README API/CLI edits).

Gate before each code commit: `npm run typecheck && npm test && npm run build`.
