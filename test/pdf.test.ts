import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "@cantoo/pdf-lib";
import { describe, expect, test } from "vitest";
import { SHEETS, TRIFOLD_LETTER, bleedLayout, fitSlot, imposeSaddlePdf, imposeTrifoldPdf, imposeTwoUpPdf } from "../src/pdf.js";

/** Logical document: n pages, each w×h points, each with real content (as Chromium output always has). */
async function makeLogical(n: number, w: number, h: number): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) {
    const page = doc.addPage([w, h]);
    page.drawRectangle({ x: 10, y: 10, width: 20, height: 20 });
  }
  return doc;
}

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

describe("imposeSaddlePdf", () => {
  test("8 half-letter pages -> 4 letter-landscape faces (2 sheets, duplex)", async () => {
    const logical = await makeLogical(8, 396, 612);
    const out = await imposeSaddlePdf(logical, SHEETS.letterLandscape);
    expect(out.getPageCount()).toBe(4);
    const { width, height } = out.getPage(0).getSize();
    expect(width).toBeCloseTo(792);
    expect(height).toBeCloseTo(612);
  });

  test("12 legal-half pages -> 6 legal-landscape faces", async () => {
    const logical = await makeLogical(12, 504, 612);
    const out = await imposeSaddlePdf(logical, SHEETS.legalLandscape);
    expect(out.getPageCount()).toBe(6);
    const { width, height } = out.getPage(0).getSize();
    expect(width).toBeCloseTo(1008);
    expect(height).toBeCloseTo(612);
  });

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

  test("8 half-tabloid pages -> 4 tabloid-landscape faces", async () => {
    const logical = await makeLogical(8, 612, 792);
    const out = await imposeSaddlePdf(logical, SHEETS.tabloidLandscape);
    expect(out.getPageCount()).toBe(4);
    const { width, height } = out.getPage(0).getSize();
    expect(width).toBeCloseTo(1224);
    expect(height).toBeCloseTo(792);
  });

  test("6 pages pad to 8: still 4 faces, blank slots render without error", async () => {
    const logical = await makeLogical(6, 396, 612);
    const out = await imposeSaddlePdf(logical, SHEETS.letterLandscape);
    expect(out.getPageCount()).toBe(4);
  });

  test("source pages with no content stream are tolerated as blanks (save succeeds)", async () => {
    // pdf-lib pages created without any draw call have no Contents entry and
    // cannot be embedded; the applier must treat them as blank slots, not crash.
    const doc = await PDFDocument.create();
    doc.addPage([396, 612]).drawRectangle({ x: 10, y: 10, width: 20, height: 20 });
    for (let i = 0; i < 3; i++) doc.addPage([396, 612]); // three truly blank pages
    const out = await imposeSaddlePdf(doc, SHEETS.letterLandscape);
    expect(out.getPageCount()).toBe(2);
    await expect(out.save()).resolves.toBeDefined();
  });

  test("fold guides are drawn by default and can be disabled", async () => {
    const logical = await makeLogical(4, 396, 612);
    const withGuides = await (await imposeSaddlePdf(logical, SHEETS.letterLandscape)).save();
    const noGuides = await (
      await imposeSaddlePdf(logical, SHEETS.letterLandscape, { foldGuides: false })
    ).save();
    expect(withGuides.length).toBeGreaterThan(noGuides.length);
  });
});

describe("imposeTrifoldPdf", () => {
  test("6 panels -> 2 letter-landscape faces", async () => {
    const logical = await makeLogical(6, TRIFOLD_LETTER.stdPanelWidth, 612);
    const out = await imposeTrifoldPdf(logical);
    expect(out.getPageCount()).toBe(2);
    const { width, height } = out.getPage(0).getSize();
    expect(width).toBeCloseTo(792);
    expect(height).toBeCloseTo(612);
  });

  test("panel widths: two standard + one narrow flap sum to the letter sheet", () => {
    expect(TRIFOLD_LETTER.stdPanelWidth * 2 + TRIFOLD_LETTER.narrowPanelWidth).toBeCloseTo(792);
    // The fold-in flap is 1/16" (4.5pt) narrower so the roll fold closes flat.
    expect(TRIFOLD_LETTER.stdPanelWidth - TRIFOLD_LETTER.narrowPanelWidth).toBeCloseTo(4.5);
  });

  test("rejects logical documents that are not exactly 6 panels", async () => {
    const logical = await makeLogical(5, TRIFOLD_LETTER.stdPanelWidth, 612);
    await expect(imposeTrifoldPdf(logical)).rejects.toThrow();
  });
});

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

  test("undersized pages are enlarged to fill the slot (shipped v0.1 behavior)", () => {
    // 200 × 300 page into a 396 × 612 slot: width ratio 1.98 is the tighter fit.
    const { scale, dx, dy } = fitSlot(396, 612, 200, 300);
    expect(scale).toBeCloseTo(1.98);
    expect(dx).toBeCloseTo(0);
    expect(dy).toBeCloseTo(9); // (612 − 300·1.98) / 2
  });
});

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

  test("marks landing exactly on the slot boundary survive", () => {
    // Slot 450×792, page 414×630, bleed 9 → trim {27, 90, 396, 612}: the
    // left horizontal mark ends exactly at x=0 and the right one exactly at
    // x=450 — inclusive bounds keep them.
    const { marks } = bleedLayout(450, 792, 414, 630, 9);
    expect(marks).toHaveLength(8);
    expect(marks).toContainEqual({ x1: 0, y1: 90, x2: 18, y2: 90 });
    expect(marks).toContainEqual({ x1: 432, y1: 90, x2: 450, y2: 90 });
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

describe("imposeTwoUpPdf", () => {
  test("stacks each face twice on a derived double-height sheet", async () => {
    const logical = await makeLogical(8, 396, 612);
    const imposed = await imposeSaddlePdf(logical, SHEETS.letterLandscape);
    const out = await imposeTwoUpPdf(imposed);
    expect(out.getPageCount()).toBe(4); // face count preserved; sheets-per-booklet halve at the cutter
    const { width, height } = out.getPage(0).getSize();
    expect(width).toBeCloseTo(792);
    expect(height).toBeCloseTo(1224); // tabloid portrait, derived — no SHEETS entry
    const ops = await faceOperators(out, 0);
    expect((ops.match(/ Do\b/g) ?? []).length).toBe(2); // two copies
    expect(ops).toContain("1 0 0 1 0 0 cm");
    expect(ops).toContain("1 0 0 1 0 612 cm"); // second copy offset by the small height
    expect(ops).toContain("4 612 m"); // midline cut tick, left edge
    expect(ops).toContain("16 612 l");
    expect(ops).toContain("776 612 m"); // right tick derives from sheetWidth − 16
  });

  test("cutGuides: false suppresses the midline ticks", async () => {
    const logical = await makeLogical(4, 396, 612);
    const imposed = await imposeSaddlePdf(logical, SHEETS.letterLandscape);
    const out = await imposeTwoUpPdf(imposed, { cutGuides: false });
    const ops = await faceOperators(out, 0);
    expect((ops.match(/ Do\b/g) ?? []).length).toBe(2);
    expect(ops).not.toContain("4 612 m");
  });

  test("rejects documents whose faces differ in size", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]).drawRectangle({ x: 1, y: 1, width: 5, height: 5 });
    doc.addPage([200, 200]).drawRectangle({ x: 1, y: 1, width: 5, height: 5 });
    await expect(imposeTwoUpPdf(doc)).rejects.toThrow(/share one size/);
  });

  test("accepts float-dust size differences (loaded-doc tolerance)", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]).drawRectangle({ x: 1, y: 1, width: 5, height: 5 });
    doc.addPage([612, 792 + 1e-9]).drawRectangle({ x: 1, y: 1, width: 5, height: 5 });
    const out = await imposeTwoUpPdf(doc);
    expect(out.getPageCount()).toBe(2);
    expect(out.getPage(0).getSize().height).toBeCloseTo(1584);
  });

  test("rejects an empty document", async () => {
    const doc = await PDFDocument.create();
    await expect(imposeTwoUpPdf(doc)).rejects.toThrow(/no pages/);
  });
});
