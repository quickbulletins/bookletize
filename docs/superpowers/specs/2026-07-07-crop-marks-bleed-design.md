# Design: crop marks + bleed (v0.2 item 2)

- **Date:** 2026-07-07
- **Status:** approved in sections (workflow, geometry, drawing, API/CLI, tests/docs);
  one post-approval correction to the fit rule, flagged at the spec review gate —
  see "Fit rule" below.
- **Scope:** saddle only. Trifold bleed is explicitly deferred (narrow-flap trim
  is a different geometry problem; ROADMAP notes it).

## Context

bookletize imposes logical pages onto printer-sheet faces. v0.2 item 2 adds the
trim workflow print shops expect: pages exported at finished-size-plus-bleed,
imposed on oversized stock (half-letter on tabloid, A5 on A3), cut back to
finished size after folding. Crop marks show where to cut; bleed guarantees ink
to the cut edge. Both only exist when trim < slot, so this feature targets
oversized-stock workflows and adds the missing US stock name (tabloid).

## Deliverable — bleed mode in the saddle applier

### Geometry: `bleedLayout` (pure, exported from `bookletize/pdf`)

```ts
export interface MarkSegment { x1: number; y1: number; x2: number; y2: number }
export interface BleedLayoutResult {
  dx: number;                 // page offset from slot's left edge
  dy: number;                 // page offset from sheet bottom
  trim: { x: number; y: number; width: number; height: number }; // slot coords
  marks: MarkSegment[];       // crop-mark hairlines, slot coords
}
export function bleedLayout(
  slotWidth: number, sheetHeight: number,
  pageWidth: number, pageHeight: number,
  bleed: number,
): BleedLayoutResult
```

Rules (all thrown errors, never silent adjustment):

- `bleed` must be a finite number ≥ 0.
- Trim is derived: `trimW = pageW − 2·bleed`, `trimH = pageH − 2·bleed`;
  both must be > 0 (else "bleed consumes the whole page").
- **Fit rule (corrected post-approval):** the full page must fit —
  `pageW ≤ slotWidth && pageH ≤ sheetHeight`, else
  "sheet too small for trim + bleed — use larger stock". The originally
  approved wording ("trim larger than the slot" errors) would NOT reject
  A5-with-bleed on A4 stock (A5 trim fits the half-A4 slot exactly; only
  bleed overhangs, silently falling off-sheet). The approved example behavior
  (that case errors, telling the caller to use A3) requires the stricter
  page-fits rule, so the spec adopts it. Consequence: bleed never overhangs
  slots or sheet edges; clipping (below) becomes defense-in-depth.
- Placement is scale-1, centered: `dx = (slotWidth − pageW)/2`,
  `dy = (sheetHeight − pageH)/2`; `trim.x = dx + bleed`, `trim.y = dy + bleed`.
- Marks: per trim corner, two candidate hairline segments (one horizontal,
  one vertical), each starting `bleed` away from the trim edge, extending
  OUTWARD, length 18 pt. A segment with any endpoint outside
  `[0, slotWidth] × [0, sheetHeight]` is omitted entirely. No fold
  special-casing needed — spine-side horizontal marks fall out naturally on
  narrow margins, which is professionally correct (the spine is folded, not
  cut). `bleed: 0` is valid (marks touch the trim corners): marks-only mode.

### Drawing: `drawFace` bleed mode

- Mode trigger: `opts.bleed !== undefined || opts.cropMarks` on the saddle
  path. Off → byte-identical current behavior (fitSlot scaling).
- In bleed mode `drawFace` uses `bleedLayout` (no scaling) and wraps each
  page draw in a clip to its slot rectangle via pdf-lib graphics-state
  operators (`pushGraphicsState → rectangle → clip → endPath → drawPage →
  popGraphicsState`). The exact operator sequence is the one library-API
  unknown; the implementation plan verifies it FIRST (a spike step) before
  anything builds on it.
- Marks draw only when `cropMarks: true`: black (`rgb(0,0,0)`), 0.4 pt,
  solid (crop marks are conventionally black; fold guides stay grey/dashed
  and unchanged; `foldGuides: false` still works independently).

### API surface

- `SaddleOptions` gains `bleed?: number` (PDF points) and
  `cropMarks?: boolean`. `cropMarks` without `bleed` ⇒ `bleed: 0`.
  `bleed` without `cropMarks` ⇒ placement + clip, no marks.
- `SHEETS` gains `tabloidLandscape: { width: 1224, height: 792 }`;
  `SheetName` and `SHEET_BY_NAME` gain `"tabloid-landscape"`.
- Exports added: `bleedLayout`, `BleedLayoutResult`, `MarkSegment`
  (README's lower-level list gains `bleedLayout`).

### CLI

- `--bleed <points>` (parse float, must be finite ≥ 0) and `--crop-marks`,
  valid for the `booklet` command only; using either with `trifold` is a
  usage error. `--sheet tabloid-landscape` accepted. Usage strings updated.

## Worked example (the flagship golden)

Half-letter trim (396×612) with 9 pt bleed → pages arrive 414×630. Sheet
tabloid-landscape (1224×792), slot 612×792. Then: dx = 99, dy = 81,
trim = {x: 108, y: 90, width: 396, height: 612}, and all 8 marks are
present (outer margin 108 pt and vertical margin 81 pt both exceed
bleed + length = 27 pt).

Marks-omission golden: slot 612×792, page 594×630, bleed 9 (trim 576×612):
fits; horizontal marks at x ∈ [603, 621] and [−9, 9] leave `[0, 612]` → all
4 horizontal marks omitted; all 4 vertical marks present.

Error goldens: A5 trim + 9 pt bleed (437.53×613.28) on `a4-landscape`
(slot 420.945×595.28) → throws (use `a3-landscape`); bleed 300 on a 414-wide
page → "bleed consumes the whole page"; bleed −1 / NaN → throws.

## Testing

- `bleedLayout` golden arrays (house style — exact objects/arrays): the
  worked examples above, plus `bleed: 0` marks-only.
- Applier: bleed-mode output has correct face count/dims and saves; the
  non-bleed path is byte-identical (existing tests already pin it); a
  content-level assertion that bleed mode emits a clip (`W n`) in the face
  content stream if cheaply feasible, else covered by the spike + goldens.
- CLI: `--bleed`/`--crop-marks` parse, defaults, trifold rejection,
  `tabloid-landscape` accepted.
- TDD red-green throughout; suite grows from 32.

## Docs

- README: CLI options line, `applySaddle` example (bleed/cropMarks), does
  table (crop marks + bleed move to "does" on landing; roadmap bullet gets
  the *(landed)* marker — same reconciliation pattern as A4/A5), lower-level
  exports list.
- ROADMAP.md: item 2 marker flips at completion; trifold-bleed noted under
  deferred candidates.
- PRINTING.md: one short "trim workflow" paragraph (export at trim+bleed,
  print on oversized stock, cut at the marks after folding).

## Non-goals

- No trifold bleed. No TrimBox/BleedBox metadata reading (possible future
  bleed source; parameter wins for Chromium/QB-generated PDFs today).
- No creep interaction (creep is v0.2 item 5; when it lands it must compose
  with bleed placement — noted here so its design remembers).
- No new fold pattern ⇒ no physical fold-test gate. No version bump.

## Process

Direct commits to main (repo convention). Gate per code commit:
`npm run typecheck && npm test && npm run build`. Commit trailer:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
