# ROADMAP.md + A4/A5 Sheets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ROADMAP.md` the single roadmap source of truth (README/CLAUDE.md become pointers), then land the first v0.2 feature: `a4-landscape`/`a3-landscape` sheets with a new pure `fitSlot` geometry helper.

**Architecture:** Docs land first (pure markdown, no code risk). The feature then lands in three red-green slices, innermost-out: the pure `fitSlot` helper (extracted from `drawFace`, newly golden-testable), the sheet specs in `src/pdf.ts` (the only file that owns dimensions — `src/impose.ts` is untouched), and the CLI names. README API docs close it out. Spec: `docs/superpowers/specs/2026-07-07-roadmap-and-a4-sheets-design.md`.

**Tech Stack:** TypeScript ESM, vitest, tsup, `@cantoo/pdf-lib` (applier only).

**Conventions that bind every task:**
- Commits go directly to `main` (repo convention). Every commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Gate before each code commit: `npm run typecheck && npm test && npm run build` (if the pnpm wrapper misbehaves, call `./node_modules/.bin/tsc`, `./node_modules/.bin/vitest`, `./node_modules/.bin/tsup` directly).
- **No version bump, no publish, no CI changes** in this plan.
- Test counts: suite starts at 25 passing; ends at 31 passing.
- Note: while a red test exists, `tsc --noEmit` also fails (the tests reference not-yet-existing exports/union members). That's expected; typecheck only gates at each task's green point.

---

## File Structure

| File | Role in this plan |
|---|---|
| `ROADMAP.md` | **Create** — the authoritative roadmap (Task 1) |
| `README.md` | Modify — roadmap link (Task 1); CLI/API/table updates (Task 5) |
| `CLAUDE.md` | Modify — roadmap section becomes a pointer (Task 1) |
| `src/pdf.ts` | Modify — `fitSlot` helper (Task 2); A4/A3 specs + names (Task 3) |
| `src/cli.ts` | Modify — sheet names + usage text (Task 4) |
| `test/pdf.test.ts` | Modify — `fitSlot` goldens (Task 2); face-dimension tests (Task 3) |
| `test/api.test.ts` | Modify — `applySaddle` accepts `"a4-landscape"` (Task 3) |
| `test/cli.test.ts` | Modify — parseArgs accepts the A-series names (Task 4) |
| `src/impose.ts`, `src/index.ts`, `.github/workflows/ci.yml` | **Untouched** |

---

### Task 1: ROADMAP.md + pointer edits (docs only)

**Files:**
- Create: `ROADMAP.md`
- Modify: `README.md:102-107` (the `## Roadmap` section)
- Modify: `CLAUDE.md` (the `## Roadmap` section, last section of the file)

- [ ] **Step 1: Create `ROADMAP.md`** with exactly this content:

```markdown
# bookletize roadmap

The single source of truth for release scope, sequencing, and acceptance
gates. The README keeps a four-line summary; CLAUDE.md points here.

## How this roadmap works

- **Cadence.** Quarterly minor releases. Correctness fixes ship out-of-band
  as patches — a wrong mapping prints a physically scrambled booklet, so
  those never wait for a release train.
- **Gate 1 — golden tests.** Every mapping is locked by exact-array golden
  tests (`test/impose.test.ts`) before it merges.
- **Gate 2 — paper.** Any **new fold pattern** must pass a physical fold
  test on real duplex printers before it ships in a release. Code may merge
  earlier; the *release* is what blocks. Arithmetic that hasn't touched
  paper isn't done (see PRINTING.md).
- Duplex output assumes **flip on short edge**, everywhere, always.

## v0.1 — shipped (2026-07)

Saddle-fold booklets (half-letter on letter-landscape, half-legal on
legal-landscape), letter tri-fold with narrow-flap allowance, CLI
(`booklet`, `trifold`), dashed fold guides, blank padding to a multiple
of 4. Letter layouts print-verified on physical duplex printers.

## v0.2 — in progress

Goal: the paper sizes and press niceties a small print shop expects,
without leaving imposition.

Build order (each lands red-green; ⚠ marks a paper gate):

1. **A4/A5 sheets** *(in progress)* — named `a4-landscape` and
   `a3-landscape` sheet specs → A5 and A4 booklets. Same fold pattern as
   letter, which is already print-verified; pre-tag checklist item:
   spot-check on A4 stock.
2. **Crop marks + bleed** — applier-side drawing in `src/pdf.ts`; no new
   fold pattern.
3. **2-up** — new pure mapping in `src/impose.ts` + golden tests.
4. **Cut-and-stack** — new pure mapping + golden tests. ⚠ physical fold
   test before 0.2.0 tags.
5. **Creep/shingling compensation** — progressive spine offset in the
   applier for thick booklets. ⚠ physical verification on a thick booklet
   before it ships enabled.
6. **Printer-quirks doc** — public field notes extending PRINTING.md
   (driver flip settings, margin clipping, scaling traps).

## v0.3

- Browser build (no Node built-ins on the applier path) + a free
  in-browser "Booklet this PDF" tool — your PDF never leaves your machine.
- Explicitly deferred candidates: **A4 tri-fold** (new fold layout → ⚠
  paper gate), further regional sheet names as people ask.

## v1.0

API freeze + semver promise. The freeze covers: exported names, option
object shapes, CLI commands and flags, and the meaning of existing
mappings — a given input maps to the same sheets forever; new layouts are
additive.

## Non-goals

The does/doesn't table in the README is a public promise: no rendering,
no layout, no content editing, no compression/encryption/signing —
nothing that isn't imposition. Issues asking for these are closed kindly,
with a link to this section.
```

- [ ] **Step 2: Link it from the README.** In `README.md`, replace the current `## Roadmap` section (lines 102–107, the four bullets) with:

```markdown
## Roadmap

- **0.1** — saddle + tri-fold (letter/legal), CLI, fold guides ← *you are here*
- **0.2** — A4/A5, cut-and-stack, 2-up, crop marks + bleed, creep/shingling compensation
- **0.3** — browser build + a free in-browser [Booklet this PDF](https://quickbulletins.app/booklet?utm_source=bookletize) tool (your PDF never leaves your machine)
- **1.0** — API freeze, semver promise

Scope detail, build order, and acceptance gates: [ROADMAP.md](ROADMAP.md).
```

(Only the last line is new; the bullets are unchanged. The "you are here" marker moves at publish time per the release flow.)

- [ ] **Step 3: Point CLAUDE.md at it.** In `CLAUDE.md`, replace the entire `## Roadmap` section (currently "v0.2: A4/A5 + half-legal, cut-and-stack, … Quarterly cadence; correctness fixes out-of-band.") with:

```markdown
## Roadmap

[ROADMAP.md](ROADMAP.md) is the single source of truth — scope, build
order, and acceptance gates live there, nowhere else.
```

(This deletes the stale "half-legal" claim — half-legal shipped in 0.1.)

- [ ] **Step 4: Sanity-run the suite** (docs can't break it, but it's 400 ms):

Run: `npm test`
Expected: `Tests  25 passed (25)`

- [ ] **Step 5: Commit**

```bash
git add ROADMAP.md README.md CLAUDE.md
git commit -m "docs: ROADMAP.md is the roadmap source of truth

Per-release scope with build order and the two acceptance gates (golden
tests; physical fold test for new fold patterns). README and CLAUDE.md
now point here — fixes the stale half-legal drift in CLAUDE.md.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `fitSlot` — slot-fitting geometry as a pure, tested function

**Files:**
- Modify: `test/pdf.test.ts` (import line 3 + new describe at end of file)
- Modify: `src/pdf.ts:73-105` (`drawFace`; new helper above it)

- [ ] **Step 1: Write the failing tests.** In `test/pdf.test.ts`, change line 3's import to include `fitSlot`:

```ts
import { SHEETS, TRIFOLD_LETTER, fitSlot, imposeSaddlePdf, imposeTrifoldPdf } from "../src/pdf.js";
```

and append this describe block at the end of the file:

```ts
describe("fitSlot", () => {
  test("true A5 fits a half-A4-landscape slot at exactly scale 1 (ISO rounds halves down)", () => {
    // A4 landscape is 841.89 × 595.28 pt; half of it is a 420.945 pt slot.
    // A5 portrait is 419.53 × 595.28 pt — a sliver narrower, same height.
    const { scale, dx, dy } = fitSlot(841.89 / 2, 595.28, 419.53, 595.28);
    expect(scale).toBe(1);
    expect(dx).toBeCloseTo(0.7075, 4);
    expect(dy).toBe(0);
  });

  test("oversized pages scale down by the tighter ratio and stay centered", () => {
    // 800 × 600 page into a 396-wide, 612-high slot: width is the tighter fit.
    const { scale, dx, dy } = fitSlot(396, 612, 800, 600);
    expect(scale).toBeCloseTo(396 / 800);
    expect(dx).toBeCloseTo(0);
    expect(dy).toBeCloseTo((612 - 600 * (396 / 800)) / 2); // 157.5
  });
});
```

- [ ] **Step 2: Run and verify it fails at module load**

Run: `./node_modules/.bin/vitest run test/pdf.test.ts`
Expected: the whole file FAILS with `does not provide an export named 'fitSlot'` (an ESM import error — every test in the file errors, which is the red state).

- [ ] **Step 3: Implement.** In `src/pdf.ts`, insert directly above the `drawFace` function (i.e., after `drawFoldGuide`):

```ts
export interface SlotFit {
  scale: number;
  dx: number;
  dy: number;
}

/**
 * Pure slot-fitting geometry: scale a page to fit a slot (never enlarging
 * past fit) and center it. dx is from the slot's left edge, dy from the
 * sheet bottom. Exported so the placement math is golden-testable.
 */
export function fitSlot(
  slotWidth: number,
  sheetHeight: number,
  pageWidth: number,
  pageHeight: number,
): SlotFit {
  const scale = Math.min(slotWidth / pageWidth, sheetHeight / pageHeight);
  return {
    scale,
    dx: (slotWidth - pageWidth * scale) / 2,
    dy: (sheetHeight - pageHeight * scale) / 2,
  };
}
```

Then refactor `drawFace` to call it — replace these lines inside the `slots.forEach` body:

```ts
      const scale = Math.min(slotW / ep.width, sheet.height / ep.height);
      face.drawPage(ep, {
        x: x + (slotW - ep.width * scale) / 2,
        y: (sheet.height - ep.height * scale) / 2,
        xScale: scale,
        yScale: scale,
      });
```

with:

```ts
      const { scale, dx, dy } = fitSlot(slotW, sheet.height, ep.width, ep.height);
      face.drawPage(ep, {
        x: x + dx,
        y: dy,
        xScale: scale,
        yScale: scale,
      });
```

(Behavior is identical — the existing 8 pdf tests guard the refactor.)

- [ ] **Step 4: Run the file, then the full gate**

Run: `./node_modules/.bin/vitest run test/pdf.test.ts`
Expected: `10 passed` (8 existing + 2 new).

Run: `npm run typecheck && npm test`
Expected: tsc clean; `Tests  27 passed (27)`.

- [ ] **Step 5: Commit**

```bash
git add src/pdf.ts test/pdf.test.ts
git commit -m "pdf: extract fitSlot — placement geometry as a pure, tested function

The suite previously asserted face counts and dimensions only; a scaling
regression was invisible. fitSlot(slotW, sheetH, pageW, pageH) → {scale,
dx, dy} is now golden-tested, including the ISO-216 edge: true A5 fits a
half-A4-landscape slot at exactly scale 1.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `a4-landscape` and `a3-landscape` sheet specs

**Files:**
- Modify: `test/pdf.test.ts` (two tests inside the `imposeSaddlePdf` describe)
- Modify: `test/api.test.ts` (one test inside the `applySaddle` describe)
- Modify: `src/pdf.ts:17-20` (`SHEETS`), `src/pdf.ts:129-134` (`SheetName`, `SHEET_BY_NAME`)

- [ ] **Step 1: Write the failing tests.** In `test/pdf.test.ts`, add inside the `imposeSaddlePdf` describe (after the legal test at line 32):

```ts
  test("8 A5 pages -> 4 a4-landscape faces", async () => {
    const logical = await makeLogical(8, 419.53, 595.28);
    const out = await imposeSaddlePdf(logical, SHEETS.a4Landscape);
    expect(out.getPageCount()).toBe(4);
    const { width, height } = out.getPage(0).getSize();
    expect(width).toBeCloseTo(841.89);
    expect(height).toBeCloseTo(595.28);
  });

  test("8 A4 pages -> 4 a3-landscape faces", async () => {
    const logical = await makeLogical(8, 595.28, 841.89);
    const out = await imposeSaddlePdf(logical, SHEETS.a3Landscape);
    expect(out.getPageCount()).toBe(4);
    const { width, height } = out.getPage(0).getSize();
    expect(width).toBeCloseTo(1190.55);
    expect(height).toBeCloseTo(841.89);
  });
```

In `test/api.test.ts`, add inside the `applySaddle` describe (after the "accepts a sheet by name" test at line 31):

```ts
  test('accepts "a4-landscape" (A5 booklets)', async () => {
    const input = await makeLogicalBytes(4, 419.53, 595.28);
    const out = await applySaddle(input, { sheet: "a4-landscape" });
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(841.89);
  });
```

- [ ] **Step 2: Run and verify the failures**

Run: `./node_modules/.bin/vitest run test/pdf.test.ts test/api.test.ts`
Expected: exactly 3 FAIL —
- the two pdf tests throw `TypeError: Cannot read properties of undefined (reading 'width')` (`SHEETS.a4Landscape` doesn't exist yet; esbuild strips types so it fails at runtime, not compile),
- the api test rejects with `unknown sheet "a4-landscape" — use letter-landscape | legal-landscape or a {width, height} spec in points`.

The pre-existing tests (including `rejects unknown sheet names` with `"a4-portrait"` and the CLI's rejection of bare `"a4"`) must still pass.

- [ ] **Step 3: Implement.** In `src/pdf.ts`, replace the `SHEETS` constant with:

```ts
export const SHEETS = {
  letterLandscape: { width: 792, height: 612 },
  legalLandscape: { width: 1008, height: 612 },
  a4Landscape: { width: 841.89, height: 595.28 },
  a3Landscape: { width: 1190.55, height: 841.89 },
} as const satisfies Record<string, SheetSpec>;
```

Replace the `SheetName` type and `SHEET_BY_NAME` map with:

```ts
/** The named sheets `applySaddle` accepts; use a SheetSpec for anything else. */
export type SheetName = "letter-landscape" | "legal-landscape" | "a4-landscape" | "a3-landscape";

const SHEET_BY_NAME: Record<SheetName, SheetSpec> = {
  "letter-landscape": SHEETS.letterLandscape,
  "legal-landscape": SHEETS.legalLandscape,
  "a4-landscape": SHEETS.a4Landscape,
  "a3-landscape": SHEETS.a3Landscape,
};
```

(`resolveSheet`'s error message is built from `Object.keys(SHEET_BY_NAME)`, so it self-updates. ISO 216 sizes in PDF points match pdf-lib's canonical values: A4 = 595.28 × 841.89 portrait, A3 = 841.89 × 1190.55 portrait; we store landscape.)

- [ ] **Step 4: Run the full gate**

Run: `npm run typecheck && npm test`
Expected: tsc clean; `Tests  30 passed (30)`.

- [ ] **Step 5: Commit**

```bash
git add src/pdf.ts test/pdf.test.ts test/api.test.ts
git commit -m "pdf: a4-landscape and a3-landscape sheets (A5/A4 booklets)

First v0.2 roadmap item. Same print-verified fold pattern as letter —
only the applier learns new dimensions; the mapping in impose.ts is
untouched. ISO 216 sizes in PDF points (pdf-lib canonical values).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: CLI `--sheet` accepts the A-series names

**Files:**
- Modify: `test/cli.test.ts` (one test inside the `parseArgs` describe)
- Modify: `src/cli.ts:5` (header comment), `src/cli.ts:14-18` (`USAGE`), `src/cli.ts:20` (`SHEET_NAMES`)

- [ ] **Step 1: Write the failing test.** In `test/cli.test.ts`, add after the "accepts --sheet and --no-guides" test (line 24):

```ts
  test("accepts the A-series sheets", () => {
    expect(parseArgs(["booklet", "in.pdf", "--sheet", "a4-landscape"]).sheet).toBe("a4-landscape");
    expect(parseArgs(["booklet", "in.pdf", "--sheet", "a3-landscape"]).sheet).toBe("a3-landscape");
  });
```

- [ ] **Step 2: Run and verify it fails**

Run: `./node_modules/.bin/vitest run test/cli.test.ts`
Expected: 1 FAIL — `--sheet must be one of: letter-landscape, legal-landscape`. The "bad sheets" case (`--sheet a4` rejected) must still pass.

- [ ] **Step 3: Implement.** In `src/cli.ts`:

Replace line 20 with:

```ts
const SHEET_NAMES: SheetName[] = ["letter-landscape", "legal-landscape", "a4-landscape", "a3-landscape"];
```

Replace the `USAGE` constant with:

```ts
const USAGE = `usage:
  bookletize booklet <input.pdf> [-o <output.pdf>] [--sheet letter-landscape|legal-landscape|a4-landscape|a3-landscape] [--no-guides]
  bookletize trifold <input.pdf> [-o <output.pdf>]

Print the result duplex, FLIP ON SHORT EDGE.`;
```

And update the header comment's booklet line (line 5) to match:

```ts
 *   bookletize booklet service.pdf [-o booklet.pdf] [--sheet letter-landscape|legal-landscape|a4-landscape|a3-landscape] [--no-guides]
```

- [ ] **Step 4: Run the full gate**

Run: `npm run typecheck && npm test`
Expected: tsc clean; `Tests  31 passed (31)`.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "cli: --sheet a4-landscape|a3-landscape

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: README API/CLI docs + final gate

**Files:**
- Modify: `README.md` (CLI options line 46-47, API example line 72, lower-level line 77-79, does/doesn't table lines 85 and 88)

- [ ] **Step 1: Update the README.** Four edits:

1. CLI options paragraph (currently "Options: `--sheet letter-landscape|legal-landscape` (booklet), …") becomes:

```markdown
Options: `--sheet letter-landscape|legal-landscape|a4-landscape|a3-landscape` (booklet),
`--no-guides`, `-o/--out` (defaults to `<input>.<command>.pdf`).
```

2. In the `applySaddle` API example, the sheet comment line becomes:

```ts
  sheet: "letter-landscape",   // or "legal-landscape" | "a4-landscape" | "a3-landscape", or { width, height } in points
```

3. The lower-level entry points paragraph becomes:

```markdown
Lower-level entry points (`imposeSaddlePdf`, `imposeTrifoldPdf`, `fitSlot`,
`SHEETS`, `TRIFOLD_LETTER`) are exported from `bookletize/pdf` for callers
who already hold a `PDFDocument`.
```

4. Does/doesn't table: the first "does" cell becomes `Saddle-fold booklets (half-letter, half-legal, A5, A4)`; the `(v0.2)` cell becomes `(v0.2) crop marks, bleed, creep compensation, cut-and-stack, 2-up`.

- [ ] **Step 2: Full gate including build**

Run: `npm run typecheck && npm test && npm run build`
Expected: tsc clean; 31 passed; tsup emits `dist/` (ESM + CJS + dts) without error.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "README: document A4/A5 sheets and fitSlot

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Checklist (run after drafting — done)

- Spec coverage: ROADMAP.md structure ✓ (Task 1), pointer edits ✓ (Task 1), fitSlot + goldens ✓ (Task 2), sheet specs + dimension/api tests ✓ (Task 3), CLI ✓ (Task 4), README ✓ (Task 5), no bump/publish ✓ (conventions).
- No placeholders: every step carries the actual content.
- Type consistency: `fitSlot(slotWidth, sheetHeight, pageWidth, pageHeight) → { scale, dx, dy }` used identically in Tasks 2 (definition/tests) and the `drawFace` refactor; `SheetName` union matches `SHEET_BY_NAME` keys and `SHEET_NAMES` array.
