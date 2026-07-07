import { describe, expect, test } from "vitest";
import { parseArgs, printInstruction } from "../src/cli.js";

describe("parseArgs", () => {
  test("booklet with explicit output", () => {
    expect(parseArgs(["booklet", "service.pdf", "-o", "out.pdf"])).toEqual({
      command: "booklet",
      input: "service.pdf",
      output: "out.pdf",
      sheet: "letter-landscape",
      foldGuides: true,
      cropMarks: false,
      twoUp: false,
    });
  });

  test("derives the output name when -o is omitted", () => {
    expect(parseArgs(["booklet", "service.pdf"]).output).toBe("service.booklet.pdf");
    expect(parseArgs(["trifold", "flyer.pdf"]).output).toBe("flyer.trifold.pdf");
  });

  test("accepts --sheet and --no-guides", () => {
    const parsed = parseArgs(["booklet", "in.pdf", "--sheet", "legal-landscape", "--no-guides"]);
    expect(parsed.sheet).toBe("legal-landscape");
    expect(parsed.foldGuides).toBe(false);
  });

  test("accepts the A-series sheets", () => {
    expect(parseArgs(["booklet", "in.pdf", "--sheet", "a4-landscape"]).sheet).toBe("a4-landscape");
    expect(parseArgs(["booklet", "in.pdf", "--sheet", "a3-landscape"]).sheet).toBe("a3-landscape");
  });

  test("accepts --bleed, --crop-marks, and tabloid-landscape for booklet", () => {
    const parsed = parseArgs([
      "booklet", "in.pdf", "--sheet", "tabloid-landscape", "--bleed", "9", "--crop-marks",
    ]);
    expect(parsed.sheet).toBe("tabloid-landscape");
    expect(parsed.bleed).toBe(9);
    expect(parsed.cropMarks).toBe(true);
  });

  test("trim-workflow defaults are off", () => {
    const parsed = parseArgs(["booklet", "in.pdf"]);
    expect(parsed.bleed).toBeUndefined();
    expect(parsed.cropMarks).toBe(false);
  });

  test("rejects bad --bleed values", () => {
    expect(() => parseArgs(["booklet", "in.pdf", "--bleed", "nope"])).toThrow(/needs a number of points/);
    expect(() => parseArgs(["booklet", "in.pdf", "--bleed", "-2"])).toThrow(/needs a number of points/);
    expect(() => parseArgs(["booklet", "in.pdf", "--bleed"])).toThrow(/needs a number of points/);
  });

  test("rejects trim-workflow flags on trifold", () => {
    expect(() => parseArgs(["trifold", "in.pdf", "--bleed", "9"])).toThrow(/booklet command only/);
    expect(() => parseArgs(["trifold", "in.pdf", "--crop-marks"])).toThrow(/booklet command only/);
    expect(() => parseArgs(["trifold", "in.pdf", "--two-up"])).toThrow(/booklet command only/);
  });

  test("accepts --two-up for booklet", () => {
    expect(parseArgs(["booklet", "in.pdf", "--two-up"]).twoUp).toBe(true);
    expect(parseArgs(["booklet", "in.pdf"]).twoUp).toBe(false);
  });

  test("printInstruction: long-edge flip only for two-up output", () => {
    expect(printInstruction("short")).toBe("print duplex, FLIP ON SHORT EDGE");
    expect(printInstruction("long")).toBe(
      "print duplex, FLIP ON LONG EDGE, cut at the midline ticks",
    );
  });

  test("rejects unknown commands, missing input, unknown flags, bad sheets", () => {
    expect(() => parseArgs([])).toThrow(/usage/i);
    expect(() => parseArgs(["staple", "in.pdf"])).toThrow(/unknown command/i);
    expect(() => parseArgs(["booklet"])).toThrow(/input/i);
    expect(() => parseArgs(["booklet", "in.pdf", "--wat"])).toThrow(/unknown option/i);
    expect(() => parseArgs(["booklet", "in.pdf", "--sheet", "a4"])).toThrow(/sheet/i);
  });
});
