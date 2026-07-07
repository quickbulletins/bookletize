/**
 * PDF applier for the pure mappings in impose.ts.
 * Takes a logical PDF (one page per finished booklet page, already at
 * finished size) and emits a new PDF of printer-sheet faces, front/back
 * alternating, ready for duplex printing with FLIP ON SHORT EDGE.
 */
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
  a4Landscape: { width: 841.89, height: 595.28 },
  a3Landscape: { width: 1190.55, height: 841.89 },
  tabloidLandscape: { width: 1224, height: 792 },
} as const satisfies Record<string, SheetSpec>;

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

export const TRIFOLD_LETTER = {
  sheet: { width: 792, height: 612 },
  stdPanelWidth: 265.5,
  narrowPanelWidth: 261,
} as const;

const GUIDE_COLOR = rgb(0.62, 0.62, 0.62);
const MARK_COLOR = rgb(0, 0, 0);

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

export interface MarkSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface BleedLayoutResult {
  /** Page offset from the slot's left edge / sheet bottom (scale is always 1).
   *  All coordinates here are slot-local: add the slot's sheet-x offset when
   *  drawing into a face. */
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

/** Draw one face: place each non-blank slot's embedded page, scaled to fit, centered in its slot. */
function drawFace(
  doc: PDFDocument,
  sheet: SheetSpec,
  embedded: Array<PDFEmbeddedPage | null>,
  slots: SlotPage[],
  slotWidths: number[],
  bleedMode?: BleedMode,
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
      if (bleedMode) {
        const { dx, dy, marks } = bleedLayout(slotW, sheet.height, ep.width, ep.height, bleedMode.bleed);
        face.pushOperators(pushGraphicsState(), rectangle(x, 0, slotW, sheet.height), clip(), endPath());
        face.drawPage(ep, { x: x + dx, y: dy });
        face.pushOperators(popGraphicsState());
        // Marks draw OUTSIDE the slot clip on purpose: they live in the slot
        // margins the clip would erase. A mark touching the slot boundary may
        // straddle the fold by half its 0.4pt stroke — folded, never seen flat.
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

// ------------------------------------------------------------ bytes API

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
    bleed: opts.bleed,
    cropMarks: opts.cropMarks,
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

// ------------------------------------------------------------ 2-up (step-and-repeat)

/** Short dashed horizontal ticks at the left and right sheet edges at a cut y-position. */
function drawCutGuide(face: PDFPage, y: number, sheetWidth: number): void {
  for (const [x1, x2] of [
    [4, 16],
    [sheetWidth - 16, sheetWidth - 4],
  ] as const) {
    face.drawLine({
      start: { x: x1, y },
      end: { x: x2, y },
      thickness: 0.5,
      color: GUIDE_COLOR,
      dashArray: [2, 2],
    });
  }
}

export interface TwoUpOptions {
  /** Dashed midline cut ticks at the sheet's left and right edges. Default true. */
  cutGuides?: boolean;
}

/**
 * Step-and-repeat: stack two identical copies of every face of an
 * already-imposed document on a derived double-height sheet
 * (letter-landscape faces → tabloid portrait). Cut the printed stack at
 * the midline for two identical booklet stacks. Copy-identity keeps the
 * duplex halves aligned. NOTE: unlike everything else this library emits,
 * the stacked output duplexes FLIP ON LONG EDGE — the small sheet's
 * vertical-axis flip is the portrait big sheet's long-edge flip
 * (PRINTING.md).
 */
export async function imposeTwoUpPdf(
  imposed: PDFDocument,
  opts: TwoUpOptions = {},
): Promise<PDFDocument> {
  const faces = imposed.getPages();
  if (faces.length === 0) {
    throw new Error("imposeTwoUpPdf: document has no pages");
  }
  const { width, height } = faces[0]!.getSize();
  for (const face of faces) {
    const size = face.getSize();
    if (Math.abs(size.width - width) > 1e-3 || Math.abs(size.height - height) > 1e-3) {
      throw new Error(
        `imposeTwoUpPdf: all faces must share one size — got ${width}×${height} and ${size.width}×${size.height}`,
      );
    }
  }

  const out = await PDFDocument.create();
  const embedded = await embedLogical(out, imposed);

  for (let i = 0; i < faces.length; i++) {
    const big = out.addPage([width, height * 2]);
    const ep = embedded[i];
    if (ep) {
      big.drawPage(ep, { x: 0, y: 0 });
      big.drawPage(ep, { x: 0, y: height });
    }
    // Contentless faces (possible with foldGuides: false and an all-blank
    // padded face) embed as null: the big page stays blank but keeps its
    // place so duplex front/back order is preserved.
    // Ticks sit on the cut line in the sacrificial trim margin — safe to
    // overprint even full-bleed faces; the guillotine destroys that ink.
    if (opts.cutGuides !== false) drawCutGuide(big, height, width);
  }
  return out;
}
