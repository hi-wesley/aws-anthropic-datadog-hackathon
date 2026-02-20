import type { CreditHealthReport, CreditProfile } from "@credit-coach/shared-types";

export function buildAdvisorSystemPrompt(): string {
  return [
    "You are a credit education coach.",
    "Give practical, non-judgmental guidance in plain language.",
    "Explain recommendations using cause-and-effect logic tied to credit factors.",
    "Do not promise exact score outcomes.",
    "Include a short disclaimer that this is educational guidance, not legal or financial advice.",
    "When useful, provide an action order for the next 30, 60, and 90 days.",
    "Keep responses concise but actionable."
  ].join(" ");
}

export function buildAdvisorUserPrompt({
  profile,
  report,
  userMessage
}: {
  profile: CreditProfile;
  report: CreditHealthReport;
  userMessage: string;
}): string {
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
        hardInquiriesLast12Months: profile.hardInquiriesLast12Months,
        derogatoryMarks: profile.derogatoryMarks,
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
    "Return: 1) key takeaways, 2) prioritized next steps, 3) short risk warnings, 4) brief disclaimer."
  ].join("\n");
}
