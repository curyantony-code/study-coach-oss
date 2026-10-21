import { describe, expect, test } from "vitest";
import { missingDetails } from "@/lib/problems/completeness";

describe("missingDetails", () => {
  test("spots a time frame the solution uses and the question never gives", () => {
    const question = "Compare FV of \\$1,000 at a 12% APR compounded annually, quarterly, daily and continuously.";
    const solution = "EAR = 12.00%, 12.55%. FV after 1 year: 1,120.00 / 1,125.51; after 20 years: 9,646.29 / 10,640.89.";
    expect(missingDetails(question, solution)).toEqual(["20 years"]);
    // The example's label ("T1 L2") must not be read as numbers in the problem.
    expect(missingDetails(question, solution, "T1 L2 - Effect of Compounding Frequency")).toEqual(["20 years"]);
  });

  test("a time frame worked out from the question's own numbers is not missing", () => {
    const question = "10% semiannual coupon, 20 years to maturity, EAR 8%. Price in 7 years?";
    expect(missingDetails(question, "Remaining life is 13 years, so 26 periods of 3.92%.")).toEqual([]);
  });

  test("numbers written as words or in the example's name count as given", () => {
    const question = "\\$10, \\$20, \\$0 repeating for 99 years, EAR 10%. FV at year 99?";
    expect(missingDetails(question, "Each 3 years is one block of the pattern.", "TVM 11 - Repeating Three-Year Pattern")).toEqual([]);
  });

  test("a question that asks for the time is not missing it", () => {
    expect(missingDetails("How long until \\$100 doubles at 7%?", "It takes 10.24 years.")).toEqual([]);
  });

  test("nothing is reported when the question already states the time frame", () => {
    expect(missingDetails("FV of \\$500 after 5 years at 6%?", "After 5 years: 669.11.")).toEqual([]);
    expect(missingDetails("With T = 5 and r = 6%, find FV.", "After 5 years: 669.11.")).toEqual([]);
  });
});
