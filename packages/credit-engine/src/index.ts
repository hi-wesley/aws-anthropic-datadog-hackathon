import type {
  CreditAction,
  CreditHealthBand,
  CreditHealthReport,
  CreditProfile
} from "@credit-coach/shared-types";

const MAX_SCORE = 850;
const MIN_SCORE = 300;

const WEIGHTS = {
  paymentHistory: 0.35,
  utilization: 0.3,
  historyDepth: 0.15,
  inquiriesAndMix: 0.2
} as const;

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(upper, Math.max(lower, value));
}

function scoreUtilization(utilizationRatio: number): number {
  if (utilizationRatio <= 0.1) return 100;
  if (utilizationRatio <= 0.3) return 80 + (0.3 - utilizationRatio) * 100;
  if (utilizationRatio <= 0.5) return 55 + (0.5 - utilizationRatio) * 125;
  if (utilizationRatio <= 0.75) return 25 + (0.75 - utilizationRatio) * 120;
  return clamp(10 - (utilizationRatio - 0.75) * 60, 0, 20);
}

function scoreHistoryDepth(months: number): number {
  return clamp((months / 120) * 100, 10, 100);
}

function scoreMixAndInquiries(creditLines: number, hardInquiries: number): number {
  const lineScore = clamp((creditLines / 6) * 70, 15, 70);
  const inquiryPenalty = clamp(hardInquiries * 8, 0, 40);
  return clamp(lineScore + (30 - inquiryPenalty), 0, 100);
}

function deriveBand(healthScore: number): CreditHealthBand {
  if (healthScore >= 85) return "excellent";
  if (healthScore >= 72) return "strong";
  if (healthScore >= 55) return "stable";
  if (healthScore >= 40) return "at_risk";
  return "critical";
}

function formatBandName(band: CreditHealthBand): string {
  return band.replace("_", " ");
}

export function evaluateCreditProfile(profile: CreditProfile): CreditHealthReport {
  const paymentHistory = clamp(profile.onTimePaymentRate * 100, 0, 100);
  const utilization = scoreUtilization(profile.utilizationRatio);
  const historyDepth = scoreHistoryDepth(profile.oldestAccountMonths);
  const inquiriesAndMix = scoreMixAndInquiries(
    profile.creditLines,
    profile.hardInquiriesLast12Months
  );

  const weightedHealthScore =
    paymentHistory * WEIGHTS.paymentHistory +
    utilization * WEIGHTS.utilization +
    historyDepth * WEIGHTS.historyDepth +
    inquiriesAndMix * WEIGHTS.inquiriesAndMix;

  const derogatoryPenalty = clamp(profile.derogatoryMarks * 10, 0, 25);
  const adjustedHealthScore = clamp(weightedHealthScore - derogatoryPenalty, 0, 100);
  const band = deriveBand(adjustedHealthScore);

  const strengths: string[] = [];
  const riskFactors: string[] = [];

  if (paymentHistory >= 97) {
    strengths.push("Strong on-time payment behavior is helping score stability.");
  } else {
    riskFactors.push("Payment history is below ideal and is the highest-impact score factor.");
  }

  if (profile.utilizationRatio <= 0.3) {
    strengths.push("Utilization is in a healthy range for revolving credit.");
  } else {
    riskFactors.push("Utilization is high and may be suppressing score growth.");
  }

  if (profile.oldestAccountMonths >= 60) {
    strengths.push("Average credit age depth is supporting long-term score health.");
  } else {
    riskFactors.push("Credit history depth is limited; time will improve this factor.");
  }

  if (profile.hardInquiriesLast12Months > 4) {
    riskFactors.push("Recent hard inquiry volume may temporarily drag score gains.");
  }

  if (profile.derogatoryMarks > 0) {
    riskFactors.push("Derogatory marks are introducing downside pressure on score outcomes.");
  }

  const recommendedActions = buildActions(profile);
  const gainPotential = estimatePotentialGain(recommendedActions);

  const estimatedScoreRange = {
    current: clamp(Math.round(profile.currentScore), MIN_SCORE, MAX_SCORE),
    conservative: clamp(
      Math.round(profile.currentScore + gainPotential.conservative),
      MIN_SCORE,
      MAX_SCORE
    ),
    optimistic: clamp(
      Math.round(profile.currentScore + gainPotential.optimistic),
      MIN_SCORE,
      MAX_SCORE
    )
  };

  const summary = `The profile looks ${formatBandName(band)} right now. Main levers are payment reliability, utilization, and inquiry pacing.`;

  return {
    band,
    summary,
    strengths,
    riskFactors,
    estimatedScoreRange,
    recommendedActions,
    componentScores: {
      paymentHistory: Math.round(paymentHistory),
      utilization: Math.round(utilization),
      historyDepth: Math.round(historyDepth),
      inquiriesAndMix: Math.round(inquiriesAndMix)
    }
  };
}

function buildActions(profile: CreditProfile): CreditAction[] {
  const actions: CreditAction[] = [];

  if (profile.onTimePaymentRate < 0.97) {
    actions.push({
      id: "autopay-and-calendar-guardrails",
      title: "Protect payment history with autopay and reminders",
      impact: "high",
      timeline: "30-90 days",
      why: "Preventing any new late payments is the fastest way to stop compounding damage."
    });
  }

  if (profile.utilizationRatio > 0.3) {
    actions.push({
      id: "lower-utilization",
      title: "Reduce revolving utilization below 30% (ideally below 10%)",
      impact: "high",
      timeline: "15-60 days",
      why: "High balances relative to limits can significantly suppress score potential."
    });
  }

  if (profile.hardInquiriesLast12Months > 2) {
    actions.push({
      id: "pause-hard-inquiries",
      title: "Pause non-essential credit applications",
      impact: "medium",
      timeline: "30-180 days",
      why: "Fewer hard pulls can reduce short-term scoring pressure."
    });
  }

  if (profile.derogatoryMarks > 0) {
    actions.push({
      id: "clean-up-derogatories",
      title: "Work a cleanup plan for derogatory items",
      impact: "high",
      timeline: "60-180 days",
      why: "Addressing inaccuracies or settling eligible items can improve future underwriting outcomes."
    });
  }

  if (profile.creditLines < 2) {
    actions.push({
      id: "responsible-line-expansion",
      title: "Add one managed credit line only if budget supports it",
      impact: "medium",
      timeline: "60-180 days",
      why: "A thin file can benefit from additional positive payment history and available credit."
    });
  }

  if (profile.oldestAccountMonths < 24) {
    actions.push({
      id: "preserve-oldest-account",
      title: "Keep oldest accounts open and active",
      impact: "medium",
      timeline: "ongoing",
      why: "Credit age builds slowly and supports longer-term score resilience."
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: "maintain-routine",
      title: "Maintain current habits and monitor monthly",
      impact: "low",
      timeline: "ongoing",
      why: "Strong profiles benefit most from consistency and avoiding avoidable inquiries."
    });
  }

  return actions;
}

function estimatePotentialGain(actions: CreditAction[]): {
  conservative: number;
  optimistic: number;
} {
  const impactMap = {
    high: { conservative: 18, optimistic: 35 },
    medium: { conservative: 9, optimistic: 18 },
    low: { conservative: 3, optimistic: 8 }
  } as const;

  const conservative = actions.reduce(
    (sum, action) => sum + impactMap[action.impact].conservative,
    0
  );
  const optimistic = actions.reduce(
    (sum, action) => sum + impactMap[action.impact].optimistic,
    0
  );

  return {
    conservative: clamp(conservative, 8, 80),
    optimistic: clamp(optimistic, 15, 150)
  };
}
