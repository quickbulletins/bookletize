import { PDFDocument } from "@cantoo/pdf-lib";
import { describe, expect, test } from "vitest";
import { SHEETS, TRIFOLD_LETTER, fitSlot, imposeSaddlePdf, imposeTrifoldPdf } from "../src/pdf.js";

/** Logical document: n pages, each w×h points, each with real content (as Chromium output always has). */
async function makeLogical(n: number, w: number, h: number): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) {
    const page = doc.addPage([w, h]);
    page.drawRectangle({ x: 10, y: 10, width: 20, height: 20 });
  }
  return doc;
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
