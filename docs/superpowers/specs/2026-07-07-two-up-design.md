# Design: 2-up (step-and-repeat) — v0.2 item 3

- **Date:** 2026-07-07
- **Status:** approved in sections (semantics, geometry, architecture, CLI,
  testing, docs/gates).
- **Scope:** saddle output only. Trifold 2-up is deferred (mechanism would
  generalize, but it is a second paper gate).

## Semantics (pinned)

2-up in bookletize means **step-and-repeat**: each output face carries two
identical copies of one imposed saddle face, stacked vertically on a
double-height sheet. Print the job, cut the printed stack once at the
horizontal midline, get two identical booklet stacks — the bulk-run
throughput feature. It is deliberately distinct from cut-and-stack
(roadmap item 4), which recombines *different* piles.

Geometry (pinned): **stacked on standard stock** — letter-landscape faces
→ 792×1224 (tabloid portrait), a4-landscape faces → 841.89×1190.55 (A3
portrait). The big sheet is *derived* (`{width: w, height: h × 2}`), so
`SHEETS` and `SheetName` grow by nothing. Legal-landscape derives a
nonstandard 1008×1224 sheet — allowed, documented as bring-your-own-stock.

**Duplex flip consequence (the headline print fact):** the small sheet's
print-verified contract is flip-on-short-edge, which for a landscape sheet
is a flip about its vertical axis. On the portrait big sheet, the
vertical-axis flip is **FLIP ON LONG EDGE**. 2-up is therefore the
library's first long-edge output; the CLI message and PRINTING.md must say
so, loudly. Copy-identity additionally makes vertical alignment flip-proof
(both stacked copies are the same content).

## Deliverable

### Core: `imposeTwoUpPdf` (src/pdf.ts, exported lower-level)

```ts
export interface TwoUpOptions {
  /** Dashed midline cut ticks in the left/right margins. Default true. */
  cutGuides?: boolean;
}
export async function imposeTwoUpPdf(
  imposed: PDFDocument,
  opts: TwoUpOptions = {},
): Promise<PDFDocument>
```

- Input: an already-imposed document (faces alternating front/back).
- Asserts every face has the same width/height as face 0; throws
  `imposeTwoUpPdf: all faces must share one size` otherwise. Throws on an
  empty document.
- Output: same number of pages; each is `{w, h*2}` with the corresponding
  face embedded twice at scale 1 — once at y=0, once at y=h. Front/back
  alternation is preserved (big face i = small face i, duplicated), so
  duplex order is unchanged and each cut big sheet yields two copies of
  one small sheet.
- Cut ticks (unless `cutGuides: false`): the existing guide style
  (GUIDE_COLOR grey, 0.5pt, dashArray [2,2]) drawn horizontally at the
  midline y=h, as two short ticks at the far left and right of the sheet
  (x 4–16 and w−16–w−4), sitting on the cut seam between the copies'
  content-free top/bottom guide bands. Same visual language and same
  content-risk profile as the shipped fold guides — the seam zone is
  exactly where the embedded faces keep their own margins.
- Contentless/blank faces cannot occur in our own pipeline (every face is
  a created page); no special handling.

### Wiring: `applySaddle` + CLI

- `ApplySaddleOptions` (NOT `SaddleOptions`) gains `twoUp?: boolean`.
  When true, `applySaddle` imposes normally, then passes the result
  through `imposeTwoUpPdf` (cut guides follow `foldGuides` — if
  `foldGuides: false`, cut ticks are off too; no separate knob at the
  bytes API. `imposeTwoUpPdf`'s own `cutGuides` option remains for
  lower-level callers).
- Composition: bleed/cropMarks/foldGuides live inside the embedded faces
  and survive verbatim — no interaction code needed.
- CLI: `--two-up` flag, booklet command only (trifold rejects it with the
  existing "booklet command only" error, extended to mention the flag).
- `runCli` return type changes from `Promise<string>` to
  `Promise<{ output: string; flipEdge: "short" | "long" }>`; the
  invoked-as-binary block prints:
  - short: `wrote <out> — print duplex, FLIP ON SHORT EDGE`
  - long: `wrote <out> — print duplex, FLIP ON LONG EDGE, cut at the midline ticks`
  A tiny exported pure helper `printInstruction(twoUp: boolean): string`
  produces the message tail so it is unit-testable without fs.

### Errors

- `imposeTwoUpPdf` on mixed-size faces or an empty doc → throws (messages
  above).
- CLI `--two-up` on trifold → usage error.
- No new validation elsewhere; `twoUp` composes with every existing
  option.

## Testing (suite grows from 49)

- Operator-level goldens via the existing `faceOperators` helper: a
  stacked face contains exactly two form-XObject `Do` invocations with
  `cm` translations y=0 and y=612 (flagship: 8-page half-letter booklet →
  4 faces at 792×1224). The embedded content's own marks/guides are NOT
  re-asserted at the big-face level — their fidelity is pinned by the
  existing small-face tests; the big-face assertions target the stacking
  transform.
- Cut ticks present by default (dash pattern + midline coordinates in the
  decoded stream), absent with `cutGuides: false`.
- Composition test: `applySaddle(bytes, { sheet: "tabloid-landscape",
  bleed: 9, cropMarks: true, twoUp: true })` → tabloid-landscape faces
  (1224×792) stack to 1224×1584 — double-tabloid stock is exotic
  (bring-your-own), but the math composes and the test documents that:
  assert dims 1224×1584 and two `Do` invocations. The realistic flagship
  (plain letter-landscape, 792×612 → 792×1224 tabloid-portrait) is the
  primary twoUp test; letter 2-up cannot carry bleed (no bleed room on
  exact-fit stock), which is why the composition test uses tabloid.
- Error tests: mixed-size doc (hand-built) throws; empty doc throws; CLI
  trifold rejection; `--two-up` parse + defaults.
- `printInstruction` unit: both messages.
- `runCli` return-shape change: the existing suite never called `runCli`;
  the CI smoke checks the file output only. The new return shape is
  covered by the printInstruction unit + parse tests.

## Docs

- README: `--two-up` in CLI options; `twoUp: true` line in the applySaddle
  example (with an "(optional)" comment, consistent with bleed's
  treatment); does-table: 2-up moves from the (v0.2) cell into the does
  column ("2-up step-and-repeat"); roadmap bullet gains `*(landed)*` at
  completion.
- ROADMAP item 3 amended honestly: applier-side stacking (the page order
  is unchanged and already print-verified — the original "new pure
  mapping in src/impose.ts" wording was a planning-time guess), plus
  **⚠ paper gate**: new physical layout + long-edge flip ⇒ the 0.2.0
  pre-tag checklist gains "2-up duplex test (long-edge flip) on a real
  printer".
- PRINTING.md: a 2-up section that leads with the exception: **this one
  output flips on the LONG edge**; cut at the midline ticks; two booklets
  per stack.

## Non-goals

- No trifold 2-up (second paper gate; mechanism generalizes later).
- No 4-up/N-up generalization (YAGNI until asked).
- No new named sheets. No version bump. No publish.
- src/impose.ts untouched (explicitly: 2-up adds no mapping math).

## Process

Direct commits to main; gate per code commit
(`npm run typecheck && npm test && npm run build`); TDD red-green;
subagent-driven execution with two-stage reviews; commit trailer
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
