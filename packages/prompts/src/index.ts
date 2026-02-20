import type { CreditHealthReport, CreditProfile } from "@credit-coach/shared-types";

export function buildAdvisorSystemPrompt(): string {
  return [
    "You are a credit coach.",
    "Give practical, non-judgmental guidance in plain language.",
    "Keep responses short, they must be under 67 words.",
  ].join(" ");
}

export function buildAdvisorUserPrompt({
  profile,
  report,
  userMessage,
  includeContext = true
}: {
  profile: CreditProfile;
  report: CreditHealthReport;
  userMessage: string;
  includeContext?: boolean;
}): string {
  if (!includeContext) {
    return [
      `User question: ${userMessage}`,
      "",
      "Use the Profile and Analysis context already provided earlier in this conversation."
    ].join("\n");
  }

  return [
    `User question: ${userMessage}`,
    "",
    "Profile:",
    JSON.stringify(
      {
        id: profile.id,
        label: profile.label,
        currentScore: profile.currentScore,
        creditLines: profile.creditLines,
        utilizationRatio: profile.utilizationRatio,
        onTimePaymentRate: profile.onTimePaymentRate,
        oldestAccountMonths: profile.oldestAccountMonths,
        oldestAccountDetail: profile.oldestAccountDetail ?? null,
        hardInquiriesLast12Months: profile.hardInquiriesLast12Months,
        creditLineHistory: profile.creditLineHistory ?? [],
        hardInquiryHistory: profile.hardInquiryHistory ?? [],
        derogatoryMarks: profile.derogatoryMarks,
        derogatoryMarkHistory: profile.derogatoryMarkHistory ?? [],
        notes: profile.notes
      },
      null,
      2
    ),
    "",
    "Analysis:",
    JSON.stringify(
      {
        band: report.band,
        summary: report.summary,
        strengths: report.strengths,
        riskFactors: report.riskFactors,
        estimatedScoreRange: report.estimatedScoreRange,
        recommendedActions: report.recommendedActions
      },
      null,
      2
    ),
    "",
    "Use this context to answer the user question."
  ].join("\n");
}
