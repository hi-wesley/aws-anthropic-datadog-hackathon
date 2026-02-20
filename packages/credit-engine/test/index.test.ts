import { describe, expect, it } from "vitest";
import type { CreditProfile } from "@credit-coach/shared-types";
import { evaluateCreditProfile } from "../src/index";

describe("credit engine", () => {
  it("flags high utilization as a risk", () => {
    const profile: CreditProfile = {
      id: "u-1",
      label: "High utilization profile",
      currentScore: 590,
      creditLines: 1,
      utilizationRatio: 0.86,
      onTimePaymentRate: 0.82,
      oldestAccountMonths: 18,
      hardInquiriesLast12Months: 3,
      derogatoryMarks: 1,
      notes: []
    };

    const report = evaluateCreditProfile(profile);

    expect(report.riskFactors.some((item) => item.toLowerCase().includes("utilization"))).toBe(
      true
    );
    expect(report.estimatedScoreRange.optimistic).toBeGreaterThan(profile.currentScore);
  });

  it("keeps a healthy profile in strong or excellent band", () => {
    const profile: CreditProfile = {
      id: "u-2",
      label: "Healthy profile",
      currentScore: 770,
      creditLines: 5,
      utilizationRatio: 0.08,
      onTimePaymentRate: 1,
      oldestAccountMonths: 140,
      hardInquiriesLast12Months: 1,
      derogatoryMarks: 0,
      notes: []
    };

    const report = evaluateCreditProfile(profile);

    expect(["strong", "excellent"]).toContain(report.band);
    expect(report.strengths.length).toBeGreaterThan(0);
  });
});
