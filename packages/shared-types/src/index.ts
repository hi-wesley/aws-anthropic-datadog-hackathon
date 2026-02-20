export type CreditHealthBand =
  | "critical"
  | "at_risk"
  | "stable"
  | "strong"
  | "excellent";

export type ActionImpact = "high" | "medium" | "low";

export interface HardInquiryRecord {
  lender: string;
  date: string;
}

export interface CreditLineRecord {
  accountName: string;
  limit: number;
}

export interface OldestAccountRecord {
  accountName: string;
  openedDate: string;
}

export interface DerogatoryMarkRecord {
  item: string;
  date: string;
  status: string;
}

export interface CreditProfile {
  id: string;
  label: string;
  currentScore: number;
  creditLines: number;
  utilizationRatio: number;
  onTimePaymentRate: number;
  oldestAccountMonths: number;
  hardInquiriesLast12Months: number;
  derogatoryMarks: number;
  notes: string[];
  creditLineHistory?: CreditLineRecord[];
  oldestAccountDetail?: OldestAccountRecord;
  hardInquiryHistory?: HardInquiryRecord[];
  derogatoryMarkHistory?: DerogatoryMarkRecord[];
}

export interface CreditAction {
  id: string;
  title: string;
  why: string;
  timeline: string;
  impact: ActionImpact;
}

export interface CreditScoreRange {
  current: number;
  conservative: number;
  optimistic: number;
}

export interface CreditHealthReport {
  band: CreditHealthBand;
  summary: string;
  strengths: string[];
  riskFactors: string[];
  estimatedScoreRange: CreditScoreRange;
  recommendedActions: CreditAction[];
  componentScores: {
    paymentHistory: number;
    utilization: number;
    historyDepth: number;
    inquiriesAndMix: number;
  };
}

export interface ChatRequest {
  profileId: string;
  message: string;
  responseMode?: "text" | "voice";
}

export interface ChatResponse {
  advisorText: string;
  audioBase64?: string;
  report: CreditHealthReport;
  meta: {
    usedBedrock: boolean;
  };
}
