/**
 * The README's public API: bytes in, bytes out, sheet by name.
 * These are the wrappers around the lower-level imposeSaddlePdf/imposeTrifoldPdf.
 */
import { PDFDocument } from "@cantoo/pdf-lib";
import { describe, expect, test } from "vitest";
import { applySaddle, applyTrifold } from "../src/pdf.js";

async function makeLogicalBytes(n: number, w: number, h: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) {
    doc.addPage([w, h]).drawRectangle({ x: 10, y: 10, width: 20, height: 20 });
  }
  return doc.save();
}

describe("applySaddle", () => {
  test("bytes in, imposed letter-landscape bytes out (default sheet)", async () => {
    const input = await makeLogicalBytes(8, 396, 612);
    const out = await applySaddle(input);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(792);
  });

  test("accepts a sheet by name", async () => {
    const input = await makeLogicalBytes(4, 504, 612);
    const out = await applySaddle(input, { sheet: "legal-landscape" });
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(1008);
  });

  test('accepts "a4-landscape" (A5 booklets)', async () => {
    const input = await makeLogicalBytes(4, 419.53, 595.28);
    const out = await applySaddle(input, { sheet: "a4-landscape" });
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(841.89);
  });

  test('accepts "tabloid-landscape" (half-letter with room for bleed)', async () => {
    const input = await makeLogicalBytes(4, 612, 792);
    const out = await applySaddle(input, { sheet: "tabloid-landscape" });
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(1224);
  });

  test("twoUp: true stacks faces on a double-height sheet", async () => {
    const input = await makeLogicalBytes(8, 396, 612);
    const out = await applySaddle(input, { twoUp: true });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(792);
    expect(doc.getPage(0).getSize().height).toBeCloseTo(1224);
  });

  test("twoUp composes with the trim workflow (exotic stock, valid math)", async () => {
    const input = await makeLogicalBytes(4, 414, 630);
    const out = await applySaddle(input, {
      sheet: "tabloid-landscape",
      bleed: 9,
      cropMarks: true,
      twoUp: true,
    });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(1224);
    expect(doc.getPage(0).getSize().height).toBeCloseTo(1584);
  });

  test("twoUp tolerates an all-blank padded face when guides are off", async () => {
    // 1 logical page pads to 4: sheet 1's back face is entirely blank, and
    // with foldGuides: false it has no content stream at all — the stacker
    // must skip embedding it, not crash.
    const input = await makeLogicalBytes(1, 396, 612);
    const out = await applySaddle(input, { foldGuides: false, twoUp: true });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(1).getSize().height).toBeCloseTo(1224);
  });

  test("accepts a custom SheetSpec", async () => {
    const input = await makeLogicalBytes(4, 396, 612);
    const out = await applySaddle(input, { sheet: { width: 842, height: 595 } }); // A4 landscape
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(842);

    // twoUp derives its big sheet from the imposed faces, so custom specs stack too.
    const stacked = await applySaddle(input, { sheet: { width: 842, height: 595 }, twoUp: true });
    const stackedDoc = await PDFDocument.load(stacked);
    expect(stackedDoc.getPage(0).getSize().width).toBeCloseTo(842);
    expect(stackedDoc.getPage(0).getSize().height).toBeCloseTo(1190);
  });

  test("rejects unknown sheet names", async () => {
    const input = await makeLogicalBytes(4, 396, 612);
    // @ts-expect-error — the union type forbids this; the runtime must too.
    await expect(applySaddle(input, { sheet: "a4-portrait" })).rejects.toThrow(/sheet/);
  });

  test("foldGuides: false produces smaller output than the default", async () => {
    const input = await makeLogicalBytes(4, 396, 612);
    const withGuides = await applySaddle(input);
    const without = await applySaddle(input, { foldGuides: false });
    expect(withGuides.length).toBeGreaterThan(without.length);
  });
});

describe("applyTrifold", () => {
  test("6 panels in, 2 letter-landscape faces out", async () => {
    const input = await makeLogicalBytes(6, 265.5, 612);
    const out = await applyTrifold(input);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(792);
  });
});
