#!/usr/bin/env node
/**
 * npx bookletize — impose a PDF from the command line.
 *
 *   bookletize booklet service.pdf [-o booklet.pdf] [--sheet <name>] [--bleed <points>] [--crop-marks] [--no-guides]
 *   bookletize trifold flyer.pdf   [-o trifold.pdf]
 *
 * Then print duplex, FLIP ON SHORT EDGE (see PRINTING.md).
 */
import { readFile, writeFile } from "node:fs/promises";
import { applySaddle, applyTrifold } from "./pdf.js";
import type { SheetName } from "./pdf.js";

const SHEET_NAMES: SheetName[] = [
  "letter-landscape",
  "legal-landscape",
  "a4-landscape",
  "a3-landscape",
  "tabloid-landscape",
];

const USAGE = `usage:
  bookletize booklet <input.pdf> [-o <output.pdf>] [--sheet ${SHEET_NAMES.join("|")}] [--bleed <points>] [--crop-marks] [--no-guides]
  bookletize trifold <input.pdf> [-o <output.pdf>]

Print the result duplex, FLIP ON SHORT EDGE.`;

export interface CliArgs {
  command: "booklet" | "trifold";
  input: string;
  output: string;
  sheet: SheetName;
  foldGuides: boolean;
  bleed?: number;
  cropMarks: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    throw new Error(USAGE);
  }
  const [command, ...rest] = argv;
  if (command !== "booklet" && command !== "trifold") {
    throw new Error(`unknown command "${command}"\n${USAGE}`);
  }

  let input: string | undefined;
  let output: string | undefined;
  let sheet: SheetName = "letter-landscape";
  let foldGuides = true;
  let bleed: number | undefined;
  let cropMarks = false;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === "-o" || arg === "--out") {
      output = rest[++i];
      if (!output) throw new Error(`${arg} needs a value\n${USAGE}`);
    } else if (arg === "--sheet") {
      const value = rest[++i];
      if (!value || !SHEET_NAMES.includes(value as SheetName)) {
        throw new Error(`--sheet must be one of: ${SHEET_NAMES.join(", ")}`);
      }
      sheet = value as SheetName;
    } else if (arg === "--no-guides") {
      foldGuides = false;
    } else if (arg === "--bleed") {
      const value = rest[++i];
      const parsed = value === undefined ? Number.NaN : Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`--bleed needs a number of points >= 0\n${USAGE}`);
      }
      bleed = parsed;
    } else if (arg === "--crop-marks") {
      cropMarks = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option "${arg}"\n${USAGE}`);
    } else if (!input) {
      input = arg;
    } else {
      throw new Error(`unexpected argument "${arg}"\n${USAGE}`);
    }
  }

  if (!input) throw new Error(`missing input PDF\n${USAGE}`);

  if (command === "trifold" && (bleed !== undefined || cropMarks)) {
    throw new Error(`--bleed/--crop-marks apply to the booklet command only\n${USAGE}`);
  }

  output ??= input.replace(/\.pdf$/i, "") + `.${command}.pdf`;

  return { command, input, output, sheet, foldGuides, bleed, cropMarks };
}

export async function runCli(argv: string[]): Promise<string> {
  const args = parseArgs(argv);
  const bytes = new Uint8Array(await readFile(args.input));
  const out =
    args.command === "booklet"
      ? await applySaddle(bytes, {
          sheet: args.sheet,
          foldGuides: args.foldGuides,
          bleed: args.bleed,
          cropMarks: args.cropMarks,
        })
      : await applyTrifold(bytes);
  await writeFile(args.output, out);
  return args.output;
}

// Invoked as a binary (not imported): run and report.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "\0");
if (invokedDirectly) {
  runCli(process.argv.slice(2)).then(
    (out) => {
      console.log(`wrote ${out} — print duplex, FLIP ON SHORT EDGE`);
    },
    (err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    },
  );
}
