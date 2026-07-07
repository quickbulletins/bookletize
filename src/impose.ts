/**
 * Pure page-imposition math.
 * No I/O, no PDF library — just the mapping from logical (reader-order)
 * pages to physical printer-sheet faces. See pdf.ts for the applier.
 *
 * Saddle (half-fold booklet), duplex with FLIP ON SHORT EDGE:
 * logical pages 1..N (padded to a multiple of 4), sheet s (0-based):
 *   front, left-to-right: [ N - 2s,  1 + 2s ]
 *   back,  left-to-right: [ 2 + 2s,  N - 1 - 2s ]
 * e.g. N=8 → sheets [8,1|2,7], [6,3|4,5]; folded and nested, pages read 1..8.
 *
 * Padding blanks land at the *end* of the logical sequence (so with 6 real
 * pages, "pages 7 and 8" of the padded book are blank). If you want the back
 * cover preserved on partial counts, insert blanks before the last page
 * upstream — this function stays a pure mapping.
 *
 * Extracted from QuickBulletins (quickbulletins.app), where these mappings
 * fold real church bulletins every week; print-verified on physical duplex
 * printers.
 */

/** A 1-based logical page number, or null for a blank (padding) slot. */
export type SlotPage = number | null;

/** One physical duplex sheet: slots are listed left-to-right as printed. */
export interface SheetFaces {
  front: SlotPage[];
  back: SlotPage[];
}

export function imposeSaddle(pageCount: number): SheetFaces[] {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error(`imposeSaddle: pageCount must be a positive integer, got ${pageCount}`);
  }
  const padded = Math.ceil(pageCount / 4) * 4;
  const slot = (p: number): SlotPage => (p <= pageCount ? p : null);

  const sheets: SheetFaces[] = [];
  for (let s = 0; s < padded / 4; s++) {
    sheets.push({
      front: [slot(padded - 2 * s), slot(1 + 2 * s)],
      back: [slot(2 + 2 * s), slot(padded - 1 - 2 * s)],
    });
  }
  return sheets;
}

/**
 * Letter-landscape roll-fold tri-fold. Logical panel numbering:
 *   1 front cover · 2 inside-left · 3 inside-center · 4 inside-right
 *   5 flap outer (seen beside panel 2 when the cover opens) · 6 back cover
 * Physical layout, left-to-right as printed (duplex flip on short edge):
 *   outside face: [5 (narrow fold-in flap), 6, 1]
 *   inside face:  [2, 3, 4 (narrow — the flap's reverse)]
 * The flap panel is cut narrower (see pdf.ts) so the roll fold closes flat.
 */
export interface TrifoldFaces {
  outside: SlotPage[];
  inside: SlotPage[];
}

export function imposeTrifold(): TrifoldFaces {
  return { outside: [5, 6, 1], inside: [2, 3, 4] };
}
