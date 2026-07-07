# bookletize

> Turn ordinary PDFs into press-ready folded booklets.

[![CI](https://github.com/quickbulletins/bookletize/actions/workflows/ci.yml/badge.svg)](https://github.com/quickbulletins/bookletize/actions/workflows/ci.yml)

**bookletize** reorders and places the pages of a PDF so that when you print it duplex, fold
it, and (optionally) staple it, the pages read in the right order. That's *imposition* — the
oldest problem in printing, and somehow still unsolved on npm.

```
An 8-page half-letter booklet on two letter sheets:

  sheet 1  front: [ 8 │ 1 ]      back: [ 2 │ 7 ]
  sheet 2  front: [ 6 │ 3 ]      back: [ 4 │ 5 ]

Fold the stack in half → pages 1,2,3,4,5,6,7,8. Magic, but it's just arithmetic:
  sheet s of N pages (N a multiple of 4, 0-indexed):
  front: [ N−2s, 1+2s ]   back: [ 2+2s, N−1−2s ]
```

- **Zero-dependency core.** The mappings are pure functions: page count in, sheet layout out.
- **Optional PDF applier.** The `bookletize/pdf` entry point applies a mapping to real PDF
  bytes (via [`@cantoo/pdf-lib`](https://github.com/cantoo-scribe/pdf-lib), a maintained
  pdf-lib fork), draws dashed fold guides, and pads to a multiple of 4 with blanks.
- **Golden-file tested.** Every mapping is locked by tests; the letter-size layouts have been
  print-verified on physical duplex printers.
- **MIT licensed.**

## Install

```sh
npm install bookletize        # pnpm add / yarn add / bun add
```

## CLI

```sh
# Half-letter saddle booklet on letter landscape sheets:
npx bookletize booklet service.pdf -o booklet.pdf

# Letter tri-fold (outside panels 5,6,1 / inside 2,3,4, with flap allowance):
npx bookletize trifold flyer.pdf -o trifold.pdf
```

Options: `--sheet letter-landscape|legal-landscape` (booklet), `--no-guides`, `-o/--out`
(defaults to `<input>.<command>.pdf`).

Then print **duplex, "flip on short edge"** for booklets. (This one printer-dialog setting
causes more upside-down back pages than everything else combined — see
[PRINTING.md](PRINTING.md).)

## API

```ts
import { imposeSaddle } from "bookletize";

// Pure math — which logical page lands on which sheet face and slot.
// Pads to a multiple of 4; blank (padding) slots are null.
const sheets = imposeSaddle(5);
// → [
//     { front: [null, 1], back: [2, null] },   // pages 6–8 of the padded book are blank
//     { front: [null, 3], back: [4, 5] },
//   ]
```

```ts
import { applySaddle } from "bookletize/pdf";

// Real PDFs in, imposed sheet faces out (Uint8Array).
const bytes = await applySaddle(pdfBytes, {
  sheet: "letter-landscape",   // or "legal-landscape", or { width, height } in points
  foldGuides: true,            // dashed tick marks on the spine (default true)
});
```

Lower-level entry points (`imposeSaddlePdf`, `imposeTrifoldPdf`, `SHEETS`,
`TRIFOLD_LETTER`) are exported from `bookletize/pdf` for callers who already
hold a `PDFDocument`.

## What it does / doesn't do

| Does | Doesn't |
|---|---|
| Saddle-fold booklets (half-letter, half-legal) | Render or lay out your content |
| Tri-folds with correct narrow-flap allowance | Edit PDF content |
| Fold guides, blank padding, page-slot math | Compress, encrypt, or sign PDFs |
| (v0.2) crop marks, bleed, creep compensation, A4/A5, cut-and-stack | Anything that isn't imposition |

That last row is a promise: **scope is imposition only.** Issues asking for rendering or
layout features will be closed kindly. This keeps the library small enough to trust and small
enough for one maintainer to keep excellent.

## Why this exists

We build [QuickBulletins](https://quickbulletins.app?utm_source=bookletize), which turns church
worship bulletins into folded, stapled booklets every week. The imposition layer had no home
on npm — prepress RIP software costs four figures and the classic desktop tools are abandoned
— so we extracted ours. If you're printing zines, concert programs, wedding orders of service,
or school booklets: it's the same arithmetic. Enjoy.

## Roadmap

- **0.1** — saddle + tri-fold (letter/legal), CLI, fold guides ← *you are here*
- **0.2** — A4/A5, cut-and-stack, 2-up, crop marks + bleed, creep/shingling compensation
- **0.3** — browser build + a free in-browser [Booklet this PDF](https://quickbulletins.app/booklet?utm_source=bookletize) tool (your PDF never leaves your machine)
- **1.0** — API freeze, semver promise

## License

MIT © Heavenly Technologies LLC
