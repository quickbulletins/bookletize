# Crop Marks + Bleed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the trim workflow to the saddle applier — pages at trim+bleed impose at scale 1 on oversized stock, clipped to their slots, with optional crop marks — plus the `tabloid-landscape` sheet and CLI flags.

**Architecture:** A pure `bleedLayout` helper (like `fitSlot`, golden-tested arrays) computes placement, trim box, and mark segments with an omit-out-of-bounds rule; `drawFace` gains a bleed mode that uses it, clips each page draw to its slot via pdf-lib graphics-state operators, and draws marks; options plumb through `SaddleOptions`/CLI. Spec: `docs/superpowers/specs/2026-07-07-crop-marks-bleed-design.md`.

**Tech Stack:** TypeScript ESM, vitest, tsup, `@cantoo/pdf-lib`.

**Facts verified during planning (do not re-derive; trust these):**
- `@cantoo/pdf-lib` exports `pushGraphicsState`, `popGraphicsState`, `rectangle`, `clip`, `endPath` (operator helpers) and `PDFPage.pushOperators` exists.
- The sequence `pushOperators(pushGraphicsState(), rectangle(x, y, w, h), clip(), endPath())` … `drawPage` … `pushOperators(popGraphicsState())` emits `q / <x y w h> re / W / n / …page ops… / Q` and survives save/load.
- In a saved-then-reloaded document, `page.node.Contents()` is a `PDFArray` of stream refs; `decodePDFRawStream(context.lookup(ref) as PDFRawStream).decode()` returns the operator bytes (`re\nW\nn` was observed verbatim). This powers the operator-level test assertions below — no byte-length proxies needed.

**Conventions binding every task:** commits direct to `main`, each message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; gate per code commit `npm run typecheck && npm test && npm run build` (fall back to `./node_modules/.bin/*` if pnpm wrappers misbehave); no version bump, no push, no CI changes. Suite starts at 32 passing, ends at 49 (two goldens beyond this plan's original count were added during review). While a red test references a missing export, `tsc` also fails — typecheck gates only at green points.

---

## File Structure

| File | Role in this plan |
|---|---|
| `src/pdf.ts` | Modify — `bleedLayout` + types (Task 1); `tabloidLandscape` (Task 2); `drawFace` bleed mode, `SaddleOptions`, `applySaddle` plumb (Task 3) |
| `src/cli.ts` | Modify — `--bleed`/`--crop-marks`, tabloid name, USAGE derived from `SHEET_NAMES` (Task 4) |
| `test/pdf.test.ts` | Modify — `bleedLayout` goldens (Task 1); tabloid dims (Task 2); bleed-mode operator tests (Task 3) |
| `test/api.test.ts` | Modify — tabloid by name (Task 2) |
| `test/cli.test.ts` | Modify — flag tests + existing `toEqual` object gains `cropMarks: false` (Task 4) |
| `README.md`, `ROADMAP.md`, `PRINTING.md` | Modify — docs + status markers (Task 5) |
| `src/impose.ts`, `src/index.ts`, CI | **Untouched** |

---

### Task 1: `bleedLayout` — pure trim-workflow geometry

**Files:**
- Modify: `test/pdf.test.ts` (import line + new describe at end)
- Modify: `src/pdf.ts` (new section directly below `fitSlot`)

- [ ] **Step 1: Write the failing tests.** In `test/pdf.test.ts`, extend the line-3 import with `bleedLayout`:

```ts
import { SHEETS, TRIFOLD_LETTER, bleedLayout, fitSlot, imposeSaddlePdf, imposeTrifoldPdf } from "../src/pdf.js";
```

Append at end of file:

```ts
describe("bleedLayout", () => {
  test("flagship: half-letter trim + 9pt bleed in a half-tabloid slot — all 8 marks", () => {
    // Trim 396×612, bleed 9 → page 414×630. Slot 612×792 (tabloid-landscape half).
    expect(bleedLayout(612, 792, 414, 630, 9)).toEqual({
      dx: 99,
      dy: 81,
      trim: { x: 108, y: 90, width: 396, height: 612 },
      marks: [
        { x1: 81, y1: 90, x2: 99, y2: 90 },     // bottom-left horizontal
        { x1: 108, y1: 63, x2: 108, y2: 81 },   // bottom-left vertical
        { x1: 513, y1: 90, x2: 531, y2: 90 },   // bottom-right horizontal
        { x1: 504, y1: 63, x2: 504, y2: 81 },   // bottom-right vertical
        { x1: 81, y1: 702, x2: 99, y2: 702 },   // top-left horizontal
        { x1: 108, y1: 711, x2: 108, y2: 729 }, // top-left vertical
        { x1: 513, y1: 702, x2: 531, y2: 702 }, // top-right horizontal
        { x1: 504, y1: 711, x2: 504, y2: 729 }, // top-right vertical
      ],
    });
  });

  test("marks that would leave the slot are omitted (spine-side rule falls out)", () => {
    // Trim 576×612, bleed 9 → page 594×630 in a 612×792 slot: horizontal marks
    // would land at x∈[603,621] and [−9,9] — outside [0,612] — so only the
    // 4 vertical marks survive.
    const { marks } = bleedLayout(612, 792, 594, 630, 9);
    expect(marks).toEqual([
      { x1: 18, y1: 63, x2: 18, y2: 81 },
      { x1: 594, y1: 63, x2: 594, y2: 81 },
      { x1: 18, y1: 711, x2: 18, y2: 729 },
      { x1: 594, y1: 711, x2: 594, y2: 729 },
    ]);
  });

  test("bleed 0 is marks-only mode: marks touch the trim corners", () => {
    const { trim, marks } = bleedLayout(612, 792, 396, 612, 0);
    expect(trim).toEqual({ x: 108, y: 90, width: 396, height: 612 });
    expect(marks).toHaveLength(8);
    expect(marks[0]).toEqual({ x1: 90, y1: 90, x2: 108, y2: 90 });
    expect(marks[1]).toEqual({ x1: 108, y1: 72, x2: 108, y2: 90 });
  });

  test("page that doesn't fit the slot throws (A5+bleed needs A3 stock, not A4)", () => {
    // A5 trim 419.53×595.28 + 9pt bleed → 437.53×613.28 vs half-A4 slot 420.945×595.28.
    expect(() => bleedLayout(841.89 / 2, 595.28, 437.53, 613.28, 9)).toThrow(/larger stock/);
  });

  test("bleed that consumes the page throws", () => {
    expect(() => bleedLayout(612, 792, 414, 630, 207)).toThrow(/consumes/);
  });

  test("negative or non-finite bleed throws", () => {
    expect(() => bleedLayout(612, 792, 414, 630, -1)).toThrow(/bleed/);
    expect(() => bleedLayout(612, 792, 414, 630, Number.NaN)).toThrow(/bleed/);
  });
});
```

- [ ] **Step 2: Run and verify red.**

Run: `./node_modules/.bin/vitest run test/pdf.test.ts`
Expected: the 6 new tests FAIL with `TypeError: (0 , bleedLayout) is not a function` (missing named export binds to undefined — same red shape as the fitSlot task); the 11 pre-existing tests stay green.

- [ ] **Step 3: Implement.** In `src/pdf.ts`, directly below the `fitSlot` function, insert:

```ts
export interface MarkSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface BleedLayoutResult {
  /** Page offset from the slot's left edge / sheet bottom (scale is always 1). */
  dx: number;
  dy: number;
  /** The finished-size box, in slot coordinates: cut here. */
  trim: { x: number; y: number; width: number; height: number };
  /** Crop-mark hairlines, slot coordinates; out-of-bounds candidates are omitted. */
  marks: MarkSegment[];
}

const MARK_LENGTH = 18;

/**
 * Pure trim-workflow geometry. Pages arrive at trim + 2·bleed per axis and
 * place at scale 1, trim centered in the slot. The full page must fit the
 * slot — bleed never silently falls off the sheet or into a neighbor.
 * Marks start `bleed` outside the trim edge and extend outward; any segment
 * leaving the slot is omitted (which is why spine-side horizontal marks
 * disappear on tight margins: the spine is folded, never cut).
 */
export function bleedLayout(
  slotWidth: number,
  sheetHeight: number,
  pageWidth: number,
  pageHeight: number,
  bleed: number,
): BleedLayoutResult {
  if (!Number.isFinite(bleed) || bleed < 0) {
    throw new Error(`bleedLayout: bleed must be a finite number of points >= 0, got ${bleed}`);
  }
  const trimWidth = pageWidth - 2 * bleed;
  const trimHeight = pageHeight - 2 * bleed;
  if (trimWidth <= 0 || trimHeight <= 0) {
    throw new Error(`bleedLayout: ${bleed}pt bleed consumes the whole ${pageWidth}×${pageHeight} page`);
  }
  if (pageWidth > slotWidth || pageHeight > sheetHeight) {
    throw new Error(
      `bleedLayout: trim + bleed (${pageWidth}×${pageHeight}) does not fit the ` +
        `${slotWidth}×${sheetHeight} slot — use larger stock`,
    );
  }

  const dx = (slotWidth - pageWidth) / 2;
  const dy = (sheetHeight - pageHeight) / 2;
  const trim = { x: dx + bleed, y: dy + bleed, width: trimWidth, height: trimHeight };

  // Two candidate marks per corner (horizontal, then vertical), corners in
  // bottom-left, bottom-right, top-left, top-right order; segments normalized
  // so x1 <= x2 and y1 <= y2. The goldens pin this order.
  const horizontal = (cornerX: number, dir: -1 | 1, y: number): MarkSegment => {
    const near = cornerX + dir * bleed;
    const far = cornerX + dir * (bleed + MARK_LENGTH);
    return { x1: Math.min(near, far), y1: y, x2: Math.max(near, far), y2: y };
  };
  const vertical = (x: number, cornerY: number, dir: -1 | 1): MarkSegment => {
    const near = cornerY + dir * bleed;
    const far = cornerY + dir * (bleed + MARK_LENGTH);
    return { x1: x, y1: Math.min(near, far), x2: x, y2: Math.max(near, far) };
  };

  const candidates: MarkSegment[] = [];
  for (const [y, vDir] of [
    [trim.y, -1],
    [trim.y + trim.height, 1],
  ] as const) {
    for (const [x, hDir] of [
      [trim.x, -1],
      [trim.x + trim.width, 1],
    ] as const) {
      candidates.push(horizontal(x, hDir, y), vertical(x, y, vDir));
    }
  }

  const inSlot = (s: MarkSegment) =>
    s.x1 >= 0 && s.x2 <= slotWidth && s.y1 >= 0 && s.y2 <= sheetHeight;
  return { dx, dy, trim, marks: candidates.filter(inSlot) };
}
```

- [ ] **Step 4: Run green, then the full gate.**

Run: `./node_modules/.bin/vitest run test/pdf.test.ts`
Expected: 17 passed (11 existing + 6 new).

Run: `npm run typecheck && npm test`
Expected: tsc clean; `Tests  38 passed (38)`.

- [ ] **Step 5: Commit.**

```bash
git add src/pdf.ts test/pdf.test.ts
git commit -m "pdf: bleedLayout — pure trim-workflow geometry with crop-mark segments

Scale-1 placement of trim+bleed pages, derived trim box, and mark
segments with an omit-out-of-bounds rule (spine-side marks drop out
naturally: the spine is folded, never cut). Hard errors when bleed is
invalid, consumes the page, or the page doesn't fit the slot.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `tabloid-landscape` sheet

**Files:**
- Modify: `test/pdf.test.ts` (one test inside the `imposeSaddlePdf` describe)
- Modify: `test/api.test.ts` (one test inside the `applySaddle` describe)
- Modify: `src/pdf.ts` (`SHEETS`, `SheetName`, `SHEET_BY_NAME`)

- [ ] **Step 1: Write the failing tests.** In `test/pdf.test.ts`, inside the `imposeSaddlePdf` describe, after the "8 A4 pages -> 4 a3-landscape faces" test:

```ts
  test("8 half-tabloid pages -> 4 tabloid-landscape faces", async () => {
    const logical = await makeLogical(8, 612, 792);
    const out = await imposeSaddlePdf(logical, SHEETS.tabloidLandscape);
    expect(out.getPageCount()).toBe(4);
    const { width, height } = out.getPage(0).getSize();
    expect(width).toBeCloseTo(1224);
    expect(height).toBeCloseTo(792);
  });
```

In `test/api.test.ts`, inside the `applySaddle` describe, after the `'accepts "a4-landscape" (A5 booklets)'` test:

```ts
  test('accepts "tabloid-landscape" (half-letter with room for bleed)', async () => {
    const input = await makeLogicalBytes(4, 612, 792);
    const out = await applySaddle(input, { sheet: "tabloid-landscape" });
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(1224);
  });
```

- [ ] **Step 2: Run and verify red.**

Run: `./node_modules/.bin/vitest run test/pdf.test.ts test/api.test.ts`
Expected: exactly 2 FAIL — the pdf test with `TypeError: Cannot read properties of undefined (reading 'width')` (`SHEETS.tabloidLandscape` missing), the api test rejecting with `unknown sheet "tabloid-landscape" — use letter-landscape | legal-landscape | a4-landscape | a3-landscape or a {width, height} spec in points`. All pre-existing tests stay green.

- [ ] **Step 3: Implement.** In `src/pdf.ts`, `SHEETS` becomes:

```ts
export const SHEETS = {
  letterLandscape: { width: 792, height: 612 },
  legalLandscape: { width: 1008, height: 612 },
  a4Landscape: { width: 841.89, height: 595.28 },
  a3Landscape: { width: 1190.55, height: 841.89 },
  tabloidLandscape: { width: 1224, height: 792 },
} as const satisfies Record<string, SheetSpec>;
```

`SheetName` and `SHEET_BY_NAME` become:

```ts
/** The named sheets `applySaddle` accepts; use a SheetSpec for anything else. */
export type SheetName =
  | "letter-landscape"
  | "legal-landscape"
  | "a4-landscape"
  | "a3-landscape"
  | "tabloid-landscape";

const SHEET_BY_NAME: Record<SheetName, SheetSpec> = {
  "letter-landscape": SHEETS.letterLandscape,
  "legal-landscape": SHEETS.legalLandscape,
  "a4-landscape": SHEETS.a4Landscape,
  "a3-landscape": SHEETS.a3Landscape,
  "tabloid-landscape": SHEETS.tabloidLandscape,
};
```

(11×17 in tabloid = 792×1224 pt portrait; stored landscape. `resolveSheet`'s error self-updates via `Object.keys`.)

- [ ] **Step 4: Full gate.**

Run: `npm run typecheck && npm test`
Expected: tsc clean; `Tests  40 passed (40)`.

- [ ] **Step 5: Commit.**

```bash
git add src/pdf.ts test/pdf.test.ts test/api.test.ts
git commit -m "pdf: tabloid-landscape sheet (half-letter booklets with bleed room)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `drawFace` bleed mode — clipping, marks, option plumbing

**Files:**
- Modify: `test/pdf.test.ts` (imports; decode helper; new describe)
- Modify: `src/pdf.ts` (imports; `SaddleOptions`; `drawFace`; `imposeSaddlePdf`; `applySaddle`)

- [ ] **Step 1: Write the failing tests.** In `test/pdf.test.ts`, replace the pdf-lib import (line 1) with:

```ts
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "@cantoo/pdf-lib";
```

Add this helper below `makeLogical`:

```ts
/** Decode a saved face's content-stream operators as text (Contents is a PDFArray of stream refs). */
async function faceOperators(doc: PDFDocument, faceIndex: number): Promise<string> {
  const reloaded = await PDFDocument.load(await doc.save());
  const contents = reloaded.getPage(faceIndex).node.Contents();
  const parts: string[] = [];
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) {
      const stream = reloaded.context.lookup(contents.get(i)) as PDFRawStream;
      parts.push(Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1"));
    }
  }
  return parts.join("\n");
}
```

Append a new describe at end of file:

```ts
describe("imposeSaddlePdf bleed mode", () => {
  test("half-letter + 9pt bleed on tabloid-landscape: 4 faces, slot clips, crop marks", async () => {
    const logical = await makeLogical(8, 414, 630);
    const out = await imposeSaddlePdf(logical, SHEETS.tabloidLandscape, { bleed: 9, cropMarks: true });
    expect(out.getPageCount()).toBe(4);
    const { width, height } = out.getPage(0).getSize();
    expect(width).toBeCloseTo(1224);
    expect(height).toBeCloseTo(792);
    const ops = await faceOperators(out, 0);
    expect(ops).toMatch(/re\nW\nn/); // slot clip is active
    expect(ops).toContain("81 90 m"); // left slot's bottom-left horizontal mark...
    expect(ops).toContain("99 90 l"); // ...drawn from (81,90) to (99,90)
  });

  test("cropMarks: false still clips but draws no marks", async () => {
    const logical = await makeLogical(4, 414, 630);
    const out = await imposeSaddlePdf(logical, SHEETS.tabloidLandscape, { bleed: 9 });
    const ops = await faceOperators(out, 0);
    expect(ops).toMatch(/re\nW\nn/);
    expect(ops).not.toContain("81 90 m");
  });

  test("normal mode emits no clip and is unchanged", async () => {
    const logical = await makeLogical(4, 396, 612);
    const out = await imposeSaddlePdf(logical, SHEETS.letterLandscape);
    const ops = await faceOperators(out, 0);
    expect(ops).not.toMatch(/re\nW\nn/);
  });

  test("stock too small for trim + bleed rejects (A5+bleed needs A3, not A4)", async () => {
    const logical = await makeLogical(4, 437.53, 613.28);
    await expect(imposeSaddlePdf(logical, SHEETS.a4Landscape, { bleed: 9 })).rejects.toThrow(/larger stock/);
  });
});
```

- [ ] **Step 2: Run and verify red.**

Run: `./node_modules/.bin/vitest run test/pdf.test.ts`
Expected: the four new tests FAIL — the first two and the fourth because `SaddleOptions` has no `bleed`/`cropMarks` yet so the applier scales instead of erroring/clipping (assertion failures: no `re\nW\nn` match, no rejection); "normal mode" may already pass (that's fine — it pins the status quo). Pre-existing 19 pdf tests stay green.

- [ ] **Step 3: Implement.** In `src/pdf.ts`:

1. Extend the pdf-lib import (line 7) to:

```ts
import {
  PDFDocument,
  PDFPage,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
} from "@cantoo/pdf-lib";
```

2. Replace `SaddleOptions` with:

```ts
export interface SaddleOptions {
  foldGuides?: boolean;
  /** Bleed on each side of every logical page, in PDF points. Enables the
   *  trim workflow: pages place at scale 1 and must fit their slot. */
  bleed?: number;
  /** Draw crop marks at the trim corners (implies the trim workflow; bleed
   *  defaults to 0 = marks-only). */
  cropMarks?: boolean;
}

interface BleedMode {
  bleed: number;
  cropMarks: boolean;
}
```

3. Below `GUIDE_COLOR` add:

```ts
const MARK_COLOR = rgb(0, 0, 0);
```

4. Change `drawFace`'s signature and non-blank branch. Signature:

```ts
function drawFace(
  doc: PDFDocument,
  sheet: SheetSpec,
  embedded: Array<PDFEmbeddedPage | null>,
  slots: SlotPage[],
  slotWidths: number[],
  bleedMode?: BleedMode,
): PDFPage {
```

Inside `slots.forEach`, replace the placement block (from `const { scale, dx, dy } = fitSlot(...)` through the `face.drawPage(...)` call) with:

```ts
      if (bleedMode) {
        const { dx, dy, marks } = bleedLayout(slotW, sheet.height, ep.width, ep.height, bleedMode.bleed);
        face.pushOperators(pushGraphicsState(), rectangle(x, 0, slotW, sheet.height), clip(), endPath());
        face.drawPage(ep, { x: x + dx, y: dy });
        face.pushOperators(popGraphicsState());
        if (bleedMode.cropMarks) {
          for (const m of marks) {
            face.drawLine({
              start: { x: x + m.x1, y: m.y1 },
              end: { x: x + m.x2, y: m.y2 },
              thickness: 0.4,
              color: MARK_COLOR,
            });
          }
        }
      } else {
        const { scale, dx, dy } = fitSlot(slotW, sheet.height, ep.width, ep.height);
        face.drawPage(ep, {
          x: x + dx,
          y: dy,
          xScale: scale,
          yScale: scale,
        });
      }
```

(Blank and contentless slots draw nothing and get no marks — there is no page to derive a trim from.)

5. In `imposeSaddlePdf`, derive the mode and pass it through:

```ts
export async function imposeSaddlePdf(
  logical: PDFDocument,
  sheet: SheetSpec,
  opts: SaddleOptions = {},
): Promise<PDFDocument> {
  const mapping = imposeSaddle(logical.getPageCount());
  const out = await PDFDocument.create();
  const embedded = await embedLogical(out, logical);
  const slotWidths = [sheet.width / 2, sheet.width / 2];
  const bleedMode: BleedMode | undefined =
    opts.bleed !== undefined || opts.cropMarks === true
      ? { bleed: opts.bleed ?? 0, cropMarks: opts.cropMarks === true }
      : undefined;

  for (const { front, back } of mapping) {
    for (const slots of [front, back]) {
      const face = drawFace(out, sheet, embedded, slots, slotWidths, bleedMode);
      if (opts.foldGuides !== false) drawFoldGuide(face, sheet.width / 2, sheet.height);
    }
  }
  return out;
}
```

6. In `applySaddle`, pass the new options through (replace the `imposeSaddlePdf` call):

```ts
  const out = await imposeSaddlePdf(logical, resolveSheet(opts.sheet ?? "letter-landscape"), {
    foldGuides: opts.foldGuides,
    bleed: opts.bleed,
    cropMarks: opts.cropMarks,
  });
```

(`ApplySaddleOptions extends SaddleOptions`, so the bytes API gains both fields with no further change. The trifold path calls `drawFace` without a `bleedMode` argument and is untouched.)

- [ ] **Step 4: Run green, then the full gate.**

Run: `./node_modules/.bin/vitest run test/pdf.test.ts`
Expected: 23 passed (19 + 4 new).

Run: `npm run typecheck && npm test`
Expected: tsc clean; `Tests  43 passed (43)`.

- [ ] **Step 5: Commit.**

```bash
git add src/pdf.ts test/pdf.test.ts
git commit -m "pdf: bleed mode — scale-1 trim placement, slot clipping, crop marks

bleed/cropMarks on SaddleOptions switch drawFace to bleedLayout: pages
place unscaled with the trim centered, each draw is clipped to its slot
(q re W n … Q), and marks render as black 0.4pt hairlines. Normal mode
is untouched. Operator-level tests assert the clip and mark draws in
the decoded content stream.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: CLI — `--bleed`, `--crop-marks`, tabloid name, derived USAGE

**Files:**
- Modify: `test/cli.test.ts` (existing `toEqual` object + four new tests)
- Modify: `src/cli.ts` (header comment, `SHEET_NAMES`/`USAGE` order + derivation, `CliArgs`, parse loop, trifold guard, `runCli`)

- [ ] **Step 1: Write the failing tests.** In `test/cli.test.ts`:

1. The existing "booklet with explicit output" test's expected object gains `cropMarks: false` (vitest's `toEqual` ignores `undefined` fields, so `bleed` needs no entry):

```ts
    expect(parseArgs(["booklet", "service.pdf", "-o", "out.pdf"])).toEqual({
      command: "booklet",
      input: "service.pdf",
      output: "out.pdf",
      sheet: "letter-landscape",
      foldGuides: true,
      cropMarks: false,
    });
```

2. After the "accepts the A-series sheets" test, add:

```ts
  test("accepts --bleed, --crop-marks, and tabloid-landscape for booklet", () => {
    const parsed = parseArgs([
      "booklet", "in.pdf", "--sheet", "tabloid-landscape", "--bleed", "9", "--crop-marks",
    ]);
    expect(parsed.sheet).toBe("tabloid-landscape");
    expect(parsed.bleed).toBe(9);
    expect(parsed.cropMarks).toBe(true);
  });

  test("trim-workflow defaults are off", () => {
    const parsed = parseArgs(["booklet", "in.pdf"]);
    expect(parsed.bleed).toBeUndefined();
    expect(parsed.cropMarks).toBe(false);
  });

  test("rejects bad --bleed values", () => {
    expect(() => parseArgs(["booklet", "in.pdf", "--bleed", "nope"])).toThrow(/bleed/);
    expect(() => parseArgs(["booklet", "in.pdf", "--bleed", "-2"])).toThrow(/bleed/);
    expect(() => parseArgs(["booklet", "in.pdf", "--bleed"])).toThrow(/bleed/);
  });

  test("rejects trim-workflow flags on trifold", () => {
    expect(() => parseArgs(["trifold", "in.pdf", "--bleed", "9"])).toThrow(/booklet/);
    expect(() => parseArgs(["trifold", "in.pdf", "--crop-marks"])).toThrow(/booklet/);
  });
```

- [ ] **Step 2: Run and verify red.**

Run: `./node_modules/.bin/vitest run test/cli.test.ts`
Expected: 5 FAIL — the edited `toEqual` (object lacks `cropMarks`), the tabloid/bleed test (`--sheet must be one of: …` without tabloid, then unknown option `--bleed`), defaults (`cropMarks` undefined ≠ false), bad-bleed (throws `unknown option "--bleed"` — passes the /bleed/ match? NO: message contains "--bleed", so `/bleed/` DOES match — this sub-assertion may pass incidentally; the `--bleed -2` case throws `unknown option` mentioning bleed too. Accept partial incidental passes; the suite is still red overall via the other tests), trifold rejection (message lacks "booklet"). The pre-existing 6 tests stay green.

- [ ] **Step 3: Implement.** In `src/cli.ts`:

1. Header comment booklet line (line 5) becomes:

```ts
 *   bookletize booklet service.pdf [-o booklet.pdf] [--sheet <name>] [--bleed <points>] [--crop-marks] [--no-guides]
```

2. Move `SHEET_NAMES` ABOVE `USAGE` and derive the usage fragment (honoring the Task-4-of-A4/A5 reviewer's on-next-sheet extraction trigger):

```ts
const SHEET_NAMES: SheetName[] = [
  "letter-landscape",
  "legal-landscape",
  "a4-landscape",
  "a3-landscape",
  "tabloid-landscape",
];

const USAGE = `usage:
  bookletize booklet <input.pdf> [-o <output.pdf>] [--sheet ${SHEET_NAMES.join("|")}] [--bleed <points>] [--crop-marks] [--no-guides]
  bookletize trifold <input.pdf> [-o <output.pdf>]

Print the result duplex, FLIP ON SHORT EDGE.`;
```

3. `CliArgs` gains the two fields:

```ts
export interface CliArgs {
  command: "booklet" | "trifold";
  input: string;
  output: string;
  sheet: SheetName;
  foldGuides: boolean;
  bleed?: number;
  cropMarks: boolean;
}
```

4. In `parseArgs`, declare alongside the other locals:

```ts
  let bleed: number | undefined;
  let cropMarks = false;
```

add branches to the option loop (before the generic `arg.startsWith("-")` rejection):

```ts
    } else if (arg === "--bleed") {
      const value = rest[++i];
      const parsed = value === undefined ? Number.NaN : Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`--bleed needs a number of points >= 0\n${USAGE}`);
      }
      bleed = parsed;
    } else if (arg === "--crop-marks") {
      cropMarks = true;
```

and after the input check, before the return:

```ts
  if (command === "trifold" && (bleed !== undefined || cropMarks)) {
    throw new Error(`--bleed/--crop-marks apply to the booklet command only\n${USAGE}`);
  }
```

return `{ command, input, output, sheet, foldGuides, bleed, cropMarks }`.

5. In `runCli`, the booklet call becomes:

```ts
      ? await applySaddle(bytes, {
          sheet: args.sheet,
          foldGuides: args.foldGuides,
          bleed: args.bleed,
          cropMarks: args.cropMarks,
        })
```

- [ ] **Step 4: Full gate.**

Run: `npm run typecheck && npm test`
Expected: tsc clean; `Tests  49 passed (49)`.

- [ ] **Step 5: Commit.**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "cli: --bleed and --crop-marks (booklet only), tabloid-landscape sheet

USAGE's sheet list is now derived from SHEET_NAMES — the fifth name
triggered the extraction a review logged for exactly this moment.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Docs — README, ROADMAP marker, PRINTING.md — and final gate

**Files:**
- Modify: `README.md`, `ROADMAP.md`, `PRINTING.md`

- [ ] **Step 1: README edits (five).**

1. CLI options paragraph becomes:

```markdown
Options: `--sheet letter-landscape|legal-landscape|a4-landscape|a3-landscape|tabloid-landscape`
(booklet), `--bleed <points>` + `--crop-marks` (booklet trim workflow — print on oversized
stock, cut at the marks), `--no-guides`, `-o/--out` (defaults to `<input>.<command>.pdf`).
```

2. In the `applySaddle` example code block, after the `foldGuides` line add:

```ts
  bleed: 9,                    // pages arrive at trim+bleed; scale locks to 1 (optional)
  cropMarks: true,             // black hairlines at the trim corners (optional)
```

3. Lower-level entry points paragraph: the parenthetical list becomes
`` (`imposeSaddlePdf`, `imposeTrifoldPdf`, `fitSlot`, `bleedLayout`, `SHEETS`, `TRIFOLD_LETTER`) ``.

4. Does/doesn't table: the third row's does-cell `Fold guides, blank padding, page-slot math` becomes `Fold guides, crop marks + bleed, blank padding, page-slot math`; the `(v0.2)` cell becomes `(v0.2) creep compensation, cut-and-stack, 2-up`.

5. Roadmap 0.2 bullet becomes:

```markdown
- **0.2** — A4/A5 *(landed)*, crop marks + bleed *(landed)*, cut-and-stack, 2-up, creep/shingling compensation
```

- [ ] **Step 2: ROADMAP.md.** Build-order item 2 becomes:

```markdown
2. **Crop marks + bleed** *(landed 2026-07)* — applier-side drawing in `src/pdf.ts`; no new
   fold pattern. Trim workflow: pages at trim+2·bleed place at scale 1 on
   oversized stock (`tabloid-landscape`, `a3-landscape`), clipped to their
   slots, marks at the trim corners.
```

And under v0.3's "Explicitly deferred candidates", extend the list item to
`**A4 tri-fold** (new fold layout → ⚠ paper gate), **trifold bleed** (narrow-flap trim geometry), further regional sheet names as people ask.`

- [ ] **Step 3: PRINTING.md.** Append this section at the end:

```markdown
## Trim workflow (crop marks + bleed)

Export your pages at finished size **plus bleed** (typically 1/8" = 9 pt on
every side), impose with `--bleed 9 --crop-marks` onto oversized stock
(`tabloid-landscape` for half-letter, `a3-landscape` for A5), print duplex
flip-on-short-edge as always, fold, then cut at the marks. The spine has no
marks on purpose — it is folded, never cut. If bookletize says the sheet is
too small for trim + bleed, it means exactly that: pick larger stock.
```

- [ ] **Step 4: Full gate including build.**

Run: `npm run typecheck && npm test && npm run build`
Expected: tsc clean; `Tests  49 passed (49)`; tsup emits ESM/CJS/dts.

- [ ] **Step 5: Commit.**

```bash
git add README.md ROADMAP.md PRINTING.md
git commit -m "docs: crop marks + bleed — README, ROADMAP marker, PRINTING.md trim workflow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Checklist (run after drafting — done)

- Spec coverage: bleedLayout + rules/errors ✓ (Task 1), page-fits rule ✓ (Task 1), clipping + marks drawing + mode trigger ✓ (Task 3), tabloid sheet ✓ (Task 2), CLI flags + trifold rejection ✓ (Task 4), README/ROADMAP/PRINTING ✓ (Task 5), spike ✓ (resolved during planning, facts recorded in header), non-goals (no trifold bleed, no TrimBox, no version bump) ✓ respected.
- No placeholders: every step has full code/text and exact expected outputs.
- Type consistency: `bleedLayout(slotWidth, sheetHeight, pageWidth, pageHeight, bleed) → {dx, dy, trim, marks}` identical in Tasks 1/3; `BleedMode {bleed, cropMarks}` defined and used in Task 3 only; `MarkSegment {x1,y1,x2,y2}` matches goldens; `SHEET_NAMES` order matches `SheetName` union; golden mark order (BL,BR,TL,TR × h,v) matches the documented generation loop.
