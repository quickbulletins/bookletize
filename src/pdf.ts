/**
 * PDF applier for the pure mappings in impose.ts.
 * Takes a logical PDF (one page per finished booklet page, already at
 * finished size) and emits a new PDF of printer-sheet faces, front/back
 * alternating, ready for duplex printing with FLIP ON SHORT EDGE.
 */
import { PDFDocument, PDFPage, rgb } from "@cantoo/pdf-lib";
import type { PDFEmbeddedPage } from "@cantoo/pdf-lib";
import { imposeSaddle, imposeTrifold } from "./impose.js";
import type { SlotPage } from "./impose.js";

export interface SheetSpec {
  width: number;
  height: number;
}

export const SHEETS = {
  letterLandscape: { width: 792, height: 612 },
  legalLandscape: { width: 1008, height: 612 },
} as const satisfies Record<string, SheetSpec>;

export interface SaddleOptions {
  foldGuides?: boolean;
}

export const TRIFOLD_LETTER = {
  sheet: { width: 792, height: 612 },
  stdPanelWidth: 265.5,
  narrowPanelWidth: 261,
} as const;

const GUIDE_COLOR = rgb(0.62, 0.62, 0.62);

/**
 * Embed the logical pages into `out`, index-aligned with the source.
 * Pages with no content stream (possible in hand-built PDFs; Chromium always
 * emits one) cannot be embedded by pdf-lib — they map to null and render as
 * blank slots instead of crashing at save time.
 */
async function embedLogical(
  out: PDFDocument,
  logical: PDFDocument,
): Promise<Array<PDFEmbeddedPage | null>> {
  const pages = logical.getPages();
  const embeddableIndices = logical
    .getPageIndices()
    .filter((i) => pages[i]!.node.Contents() !== undefined);
  const embedded = await out.embedPdf(logical, embeddableIndices);

  const byLogicalIndex: Array<PDFEmbeddedPage | null> = pages.map(() => null);
  embeddableIndices.forEach((logicalIndex, embeddedIndex) => {
    byLogicalIndex[logicalIndex] = embedded[embeddedIndex]!;
  });
  return byLogicalIndex;
}

/** Short dashed tick in the top and bottom margins at a fold x-position. */
function drawFoldGuide(face: PDFPage, x: number, sheetHeight: number): void {
  for (const [y1, y2] of [
    [sheetHeight - 16, sheetHeight - 4],
    [4, 16],
  ] as const) {
    face.drawLine({
      start: { x, y: y1 },
      end: { x, y: y2 },
      thickness: 0.5,
      color: GUIDE_COLOR,
      dashArray: [2, 2],
    });
  }
}

export interface SlotFit {
  scale: number;
  dx: number;
  dy: number;
}

/**
 * Pure slot-fitting geometry: scale a page by the tighter of the two
 * ratios — enlarging smaller pages to fill the slot — and center it.
 * dx is from the slot's left edge, dy from the sheet bottom. Exported so
 * the placement math is golden-testable.
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

/** Draw one face: place each non-blank slot's embedded page, scaled to fit, centered in its slot. */
function drawFace(
  doc: PDFDocument,
  sheet: SheetSpec,
  embedded: Array<PDFEmbeddedPage | null>,
  slots: SlotPage[],
  slotWidths: number[],
): PDFPage {
  const face = doc.addPage([sheet.width, sheet.height]);
  let x = 0;
  slots.forEach((page, i) => {
    const slotW = slotWidths[i]!;
    if (page !== null) {
      if (page < 1 || page > embedded.length) {
        throw new Error(`impose: logical page ${page} is out of range`);
      }
      const ep = embedded[page - 1];
      if (!ep) {
        x += slotW;
        return; // contentless source page: render as a blank slot
      }
      const { scale, dx, dy } = fitSlot(slotW, sheet.height, ep.width, ep.height);
      face.drawPage(ep, {
        x: x + dx,
        y: dy,
        xScale: scale,
        yScale: scale,
      });
    }
    x += slotW;
  });
  return face;
}

export async function imposeSaddlePdf(
  logical: PDFDocument,
  sheet: SheetSpec,
  opts: SaddleOptions = {},
): Promise<PDFDocument> {
  const mapping = imposeSaddle(logical.getPageCount());
  const out = await PDFDocument.create();
  const embedded = await embedLogical(out, logical);
  const slotWidths = [sheet.width / 2, sheet.width / 2];

  for (const { front, back } of mapping) {
    for (const slots of [front, back]) {
      const face = drawFace(out, sheet, embedded, slots, slotWidths);
      if (opts.foldGuides !== false) drawFoldGuide(face, sheet.width / 2, sheet.height);
    }
  }
  return out;
}

// ------------------------------------------------------------ bytes API

/** The named sheets `applySaddle` accepts; use a SheetSpec for anything else. */
export type SheetName = "letter-landscape" | "legal-landscape";

const SHEET_BY_NAME: Record<SheetName, SheetSpec> = {
  "letter-landscape": SHEETS.letterLandscape,
  "legal-landscape": SHEETS.legalLandscape,
};

function resolveSheet(sheet: SheetName | SheetSpec): SheetSpec {
  if (typeof sheet === "string") {
    const spec = SHEET_BY_NAME[sheet];
    if (!spec) {
      throw new Error(
        `unknown sheet "${sheet}" — use ${Object.keys(SHEET_BY_NAME).join(" | ")} or a {width, height} spec in points`,
      );
    }
    return spec;
  }
  return sheet;
}

export interface ApplySaddleOptions extends SaddleOptions {
  /** Named size or a custom {width, height} in PDF points. Default letter-landscape. */
  sheet?: SheetName | SheetSpec;
}

/** Bytes in, imposed booklet bytes out — the README's front-door API. */
export async function applySaddle(
  pdf: Uint8Array | ArrayBuffer,
  opts: ApplySaddleOptions = {},
): Promise<Uint8Array> {
  const logical = await PDFDocument.load(pdf);
  const out = await imposeSaddlePdf(logical, resolveSheet(opts.sheet ?? "letter-landscape"), {
    foldGuides: opts.foldGuides,
  });
  return out.save();
}

/** Bytes in, imposed tri-fold bytes out. Expects exactly 6 logical panels. */
export async function applyTrifold(pdf: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const logical = await PDFDocument.load(pdf);
  const out = await imposeTrifoldPdf(logical);
  return out.save();
}

export async function imposeTrifoldPdf(logical: PDFDocument): Promise<PDFDocument> {
  if (logical.getPageCount() !== 6) {
    throw new Error(
      `imposeTrifoldPdf: expected exactly 6 logical panels, got ${logical.getPageCount()}`,
    );
  }
  const { sheet, stdPanelWidth: std, narrowPanelWidth: narrow } = TRIFOLD_LETTER;
  const { outside, inside } = imposeTrifold();
  // The fold-in flap (outside-left) and its reverse (inside-right) share the narrow panel.
  const faces: Array<{ slots: SlotPage[]; widths: number[] }> = [
    { slots: outside, widths: [narrow, std, std] },
    { slots: inside, widths: [std, std, narrow] },
  ];

  const out = await PDFDocument.create();
  const embedded = await embedLogical(out, logical);

  for (const { slots, widths } of faces) {
    const face = drawFace(out, sheet, embedded, slots, widths);
    drawFoldGuide(face, widths[0]!, sheet.height);
    drawFoldGuide(face, widths[0]! + widths[1]!, sheet.height);
  }
  return out;
}
