import { describe, expect, test } from "vitest";
import { parseArgs } from "../src/cli.js";

describe("parseArgs", () => {
  test("booklet with explicit output", () => {
    expect(parseArgs(["booklet", "service.pdf", "-o", "out.pdf"])).toEqual({
      command: "booklet",
      input: "service.pdf",
      output: "out.pdf",
      sheet: "letter-landscape",
      foldGuides: true,
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

  test("rejects unknown commands, missing input, unknown flags, bad sheets", () => {
    expect(() => parseArgs([])).toThrow(/usage/i);
    expect(() => parseArgs(["staple", "in.pdf"])).toThrow(/unknown command/i);
    expect(() => parseArgs(["booklet"])).toThrow(/input/i);
    expect(() => parseArgs(["booklet", "in.pdf", "--wat"])).toThrow(/unknown option/i);
    expect(() => parseArgs(["booklet", "in.pdf", "--sheet", "a4"])).toThrow(/sheet/i);
  });
});
