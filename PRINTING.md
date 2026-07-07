# Printing an imposed booklet

The PDF bookletize produces is a sequence of **sheet faces**: front of sheet 1,
back of sheet 1, front of sheet 2, back of sheet 2, … Your printer's job is to
put each "back" face on the reverse of its "front" face, oriented so nothing
comes out upside down. Three settings do all the work:

## 1. Duplex: flip on SHORT edge

Booklet sheets are landscape, so the fold axis is vertical. When the printer
flips the paper to print the back, it must flip around the **short** edge —
the dialog calls this *"flip on short edge"*, *"short-edge binding"*, or
*"tumble"*. The default ("long edge") prints every back face upside down.

This single setting causes more ruined print runs than everything else
combined. If your booklet's backs are inverted, this is why.

## 2. Scale: 100% / Actual size

Never "Fit to page" or "Shrink to printable area". The faces are already
exactly your paper size; any scaling shifts the two page slots off the fold
line, and the booklet's margins stop lining up when folded.

## 3. Paper size matches the sheet

`--sheet letter-landscape` → Letter (8.5 × 11 in). `--sheet legal-landscape` →
Legal (8.5 × 14 in). The printer dialog's paper size must agree, or the driver
will scale (see rule 2).

## Then

1. Print all pages, duplex, flip on short edge, 100%.
2. Keep the sheets in the order they came out.
3. Fold the whole stack in half (the dashed tick marks at the top and bottom
   edges are the fold line).
4. Staple on the fold if you like — that's saddle stitching.

Pages read 1, 2, 3, … through the whole booklet. If they don't, check rule 1.

## Tri-folds

Tri-folds are also duplex + flip on short edge. Fold the narrow flap panel in
first (the tick marks show both fold lines), then the cover over it — the
narrow panel is cut 1/16" short on purpose so the roll fold closes flat.

## A test worth doing once

Before a real run, print one booklet from this repo's arithmetic and fold it:
if pages read in order, your printer's duplex path is verified for every
future run. This library's letter-size layouts were verified exactly this way
on physical duplex printers before v0.1 shipped.
