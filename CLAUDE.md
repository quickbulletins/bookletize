# bookletize

Open-source PDF imposition engine (npm: `bookletize`), extracted from
QuickBulletins' print pipeline. Public repo: github.com/quickbulletins/bookletize.

## Scope policy (hard rule)

Imposition only: page reordering, N-up placement, fold guides. No rendering,
no layout, no content features. The README's does/doesn't table is a public
promise — close out-of-scope issues kindly, don't implement them.

## Commands

- `npm test` — vitest (25 golden + API tests)
- `npm run typecheck` — tsc, no emit
- `npm run build` — tsup, dual ESM/CJS + dts
- If a pnpm wrapper misbehaves on this machine, call `./node_modules/.bin/*` directly.

## Conventions

- **TDD, red-green.** The exact-array golden tests are the product — a wrong
  mapping prints a scrambled booklet in the physical world.
- **The README is the API contract.** Code conforms to the README's documented
  surface (`imposeSaddle`, `applySaddle`, CLI flags), never the reverse.
- **Zero-dep core.** `src/impose.ts` imports nothing, ever. PDF concerns stay
  in `src/pdf.ts` behind the `bookletize/pdf` subpath.
- **Print contract:** duplex output assumes FLIP ON SHORT EDGE (PRINTING.md).
  Any NEW sheet layout must pass a physical fold test on real printers before
  it ships in a release — arithmetic that hasn't touched paper isn't done.
- Commit author is the repo-local noreply config (already set); keep it.

## Release flow

1. CI green on main (includes a CLI smoke test).
2. Bump `version` in package.json; update the README roadmap marker.
3. Commit, tag `vX.Y.Z`, `git push --tags`.
4. `npm publish --otp=<code>` — 2FA code from the founder's authenticator;
   `prepublishOnly` re-runs typecheck + tests + build automatically.
   Package is org-managed under the `quickbulletins` npm org.

## Relationship to QuickBulletins (until O3 lands)

QuickBulletins still carries a vendored copy of this engine
(`quickbulletins/lib/render/impose.ts` + `imposePdf.ts`). Until QB switches to
the published package and deletes it (roadmap O3), any correctness fix here
MUST be mirrored there, and vice versa. Say so in the commit message.

## Roadmap

v0.2: A4/A5 + half-legal, cut-and-stack, 2-up, crop marks + bleed,
creep/shingling compensation, printer-quirks doc. v0.3: browser build + free
web tool. 1.0: API freeze. Quarterly cadence; correctness fixes out-of-band.
