import { describe, expect, test } from "vitest";
import { imposeSaddle, imposeTrifold } from "../src/impose.js";

describe("imposeSaddle", () => {
  test("4 logical pages -> 1 sheet: front [4,1], back [2,3]", () => {
    expect(imposeSaddle(4)).toEqual([{ front: [4, 1], back: [2, 3] }]);
  });

  test("8 logical pages -> 2 sheets in saddle order", () => {
    expect(imposeSaddle(8)).toEqual([
      { front: [8, 1], back: [2, 7] },
      { front: [6, 3], back: [4, 5] },
    ]);
  });

  test("12 logical pages -> 3 sheets, center spread [6,7] on last back", () => {
    expect(imposeSaddle(12)).toEqual([
      { front: [12, 1], back: [2, 11] },
      { front: [10, 3], back: [4, 9] },
      { front: [8, 5], back: [6, 7] },
    ]);
  });

  test("6 logical pages pad to 8; missing pages 7 and 8 become blank (null) slots", () => {
    expect(imposeSaddle(6)).toEqual([
      { front: [null, 1], back: [2, null] },
      { front: [6, 3], back: [4, 5] },
    ]);
  });

  test("1 logical page pads to 4; only the front-right slot is printed", () => {
    expect(imposeSaddle(1)).toEqual([{ front: [null, 1], back: [null, null] }]);
  });

  test("rejects page counts below 1 and non-integers", () => {
    expect(() => imposeSaddle(0)).toThrow();
    expect(() => imposeSaddle(-4)).toThrow();
    expect(() => imposeSaddle(2.5)).toThrow();
  });
});

describe("imposeTrifold", () => {
  test("fixed 6-panel roll-fold mapping: outside [flap 5, back 6, front 1], inside [2,3,4]", () => {
    expect(imposeTrifold()).toEqual({
      outside: [5, 6, 1],
      inside: [2, 3, 4],
    });
  });
});
