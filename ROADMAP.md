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
