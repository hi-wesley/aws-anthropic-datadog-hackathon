"use client";

import { useEffect, useMemo, useState } from "react";

type CreditProfile = {
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
};

type CreditAction = {
  id: string;
  title: string;
  why: string;
  timeline: string;
  impact: "high" | "medium" | "low";
};

type CreditHealthReport = {
  band: string;
  summary: string;
  strengths: string[];
  riskFactors: string[];
  estimatedScoreRange: {
    current: number;
    conservative: number;
    optimistic: number;
  };
  recommendedActions: CreditAction[];
  componentScores: {
    paymentHistory: number;
    utilization: number;
    historyDepth: number;
    inquiriesAndMix: number;
  };
};

type ChatResponse = {
  advisorText: string;
  audioBase64?: string;
  report: CreditHealthReport;
  meta: {
    usedBedrock: boolean;
  };
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const MIN_CREDIT_SCORE = 300;
const MAX_CREDIT_SCORE = 850;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function HomePage() {
  const [profiles, setProfiles] = useState<CreditProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [report, setReport] = useState<CreditHealthReport | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadProfiles();
  }, []);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId),
    [profiles, selectedProfileId]
  );

  useEffect(() => {
    if (!selectedProfileId) {
      return;
    }

    void loadProfileReport(selectedProfileId);
  }, [selectedProfileId]);

  const factorScores = useMemo(() => {
    if (report?.componentScores) {
      return report.componentScores;
    }

    if (!selectedProfile) {
      return null;
    }

    return {
      paymentHistory: Math.round(selectedProfile.onTimePaymentRate * 100),
      utilization: clamp(100 - Math.round(selectedProfile.utilizationRatio * 100), 0, 100),
      historyDepth: clamp(
        Math.round((selectedProfile.oldestAccountMonths / 120) * 100),
        0,
        100
      ),
      inquiriesAndMix: clamp(
        Math.round(
          (selectedProfile.creditLines / 6) * 65 +
            (35 - selectedProfile.hardInquiriesLast12Months * 6)
        ),
        0,
        100
      )
    };
  }, [report, selectedProfile]);

  const scoreTrend = useMemo(() => {
    if (!selectedProfile) {
      return [] as Array<{ label: string; score: number }>;
    }

    const labels = ["5m ago", "4m ago", "3m ago", "2m ago", "1m ago", "Now"];
    const drag =
      selectedProfile.utilizationRatio * 18 +
      selectedProfile.hardInquiriesLast12Months * 2 +
      selectedProfile.derogatoryMarks * 6;
    const base = selectedProfile.currentScore - drag;

    return labels.map((label, index) => {
      const movement = index * (drag / 5);
      return {
        label,
        score: clamp(
          Math.round(base + movement),
          MIN_CREDIT_SCORE,
          MAX_CREDIT_SCORE
        )
      };
    });
  }, [selectedProfile]);

  const changeDrivers = useMemo(() => {
    if (!selectedProfile) {
      return [] as Array<{ direction: "up" | "down"; detail: string }>;
    }

    const drivers: Array<{ direction: "up" | "down"; detail: string }> = [];

    if (selectedProfile.utilizationRatio > 0.3) {
      drivers.push({
        direction: "down",
        detail: "Higher utilization is putting downward pressure on score momentum."
      });
    } else {
      drivers.push({
        direction: "up",
        detail: "Healthy utilization supports score stability."
      });
    }

    if (selectedProfile.onTimePaymentRate < 0.97) {
      drivers.push({
        direction: "down",
        detail: "Payment history has past missed payments affecting outcomes."
      });
    } else {
      drivers.push({
        direction: "up",
        detail: "Consistent on-time payments are contributing positively."
      });
    }

    if (selectedProfile.hardInquiriesLast12Months > 2) {
      drivers.push({
        direction: "down",
        detail: "Recent hard inquiries are adding short-term scoring drag."
      });
    } else {
      drivers.push({
        direction: "up",
        detail: "Low inquiry volume is helping limit score volatility."
      });
    }

    if (selectedProfile.oldestAccountMonths >= 60) {
      drivers.push({
        direction: "up",
        detail: "Longer credit history depth is supporting profile strength."
      });
    } else {
      drivers.push({
        direction: "down",
        detail: "Limited credit age depth is constraining scoring headroom."
      });
    }

    return drivers;
  }, [selectedProfile]);

  const accountBreakdown = useMemo(() => {
    if (!selectedProfile) {
      return [] as Array<{
        id: string;
        type: string;
        ageMonths: number;
        limit: number;
        balance: number;
        status: string;
      }>;
    }

    const totalAccounts = Math.max(1, Math.min(selectedProfile.creditLines, 4));
    const totalLimitBase = Math.max(3000, selectedProfile.creditLines * 4200);
    const utilizationSeed = selectedProfile.utilizationRatio;

    return Array.from({ length: totalAccounts }).map((_, index) => {
      const limit = Math.round(totalLimitBase / totalAccounts + index * 450);
      const utilizationForLine = clamp(
        utilizationSeed + (index - 1) * 0.08,
        0.06,
        0.95
      );
      const balance = Math.round(limit * utilizationForLine);
      const ageMonths = Math.max(3, selectedProfile.oldestAccountMonths - index * 10);

      return {
        id: `account-${index + 1}`,
        type: index % 2 === 0 ? "Revolving credit card" : "Installment loan",
        ageMonths,
        limit,
        balance,
        status: selectedProfile.onTimePaymentRate >= 0.97 ? "Current" : "Current with historical delinquencies"
      };
    });
  }, [selectedProfile]);

  const totalLimit = useMemo(
    () => accountBreakdown.reduce((sum, account) => sum + account.limit, 0),
    [accountBreakdown]
  );

  const totalBalance = useMemo(
    () => accountBreakdown.reduce((sum, account) => sum + account.balance, 0),
    [accountBreakdown]
  );

  const scorePercent = useMemo(() => {
    if (!selectedProfile) {
      return 0;
    }

    return clamp(
      Math.round(
        ((selectedProfile.currentScore - MIN_CREDIT_SCORE) /
          (MAX_CREDIT_SCORE - MIN_CREDIT_SCORE)) *
          100
      ),
      0,
      100
    );
  }, [selectedProfile]);

  async function loadProfiles() {
    try {
      const response = await fetch(`${API_BASE}/profiles`);
      if (!response.ok) {
        throw new Error("Failed to load profiles");
      }

      const loadedProfiles = (await response.json()) as CreditProfile[];
      setProfiles(loadedProfiles);
      if (loadedProfiles.length > 0) {
        setSelectedProfileId((current) => current || loadedProfiles[0].id);
      }
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Unknown error";
      setError(`Unable to load profiles: ${message}`);
    }
  }

  async function loadProfileReport(profileId: string) {
    setAnalysisLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          profileId,
          message: "Provide a concise credit health summary for this persona.",
          responseMode: "text"
        })
      });

      if (!response.ok) {
        throw new Error(`Analysis request failed (${response.status})`);
      }

      const payload = (await response.json()) as ChatResponse;
      setReport(payload.report);
    } catch (analysisError) {
      const message =
        analysisError instanceof Error ? analysisError.message : "Unknown error";
      setError(message);
      setReport(null);
    } finally {
      setAnalysisLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="panel top-bar">
        <label className="top-bar-label">
          Demo Persona
          <select
            value={selectedProfileId}
            onChange={(event) => setSelectedProfileId(event.target.value)}
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="layout-grid">
        <section className="panel score-pane">
          {selectedProfile && (
            <section className="score-overview">
              <div className="score-overview-head">
                <h2>Current Score</h2>
                <p className="score-number">{selectedProfile.currentScore}</p>
              </div>
              <div
                className="score-gradient"
                role="img"
                aria-label={`Credit score position ${scorePercent}%`}
              >
                <span className="score-marker" style={{ left: `${scorePercent}%` }} />
              </div>
              <div className="score-scale">
                <span>300</span>
                <span>850</span>
              </div>
            </section>
          )}

          {selectedProfile && (
            <div className="profile-card">
              <h2>{selectedProfile.label}</h2>
              <div className="score-metrics">
                <article className="metric-card">
                  <p>Credit lines</p>
                  <h3>{selectedProfile.creditLines}</h3>
                </article>
                <article className="metric-card">
                  <p>Utilization</p>
                  <h3>{(selectedProfile.utilizationRatio * 100).toFixed(0)}%</h3>
                </article>
                <article className="metric-card">
                  <p>On-time payments</p>
                  <h3>{(selectedProfile.onTimePaymentRate * 100).toFixed(0)}%</h3>
                </article>
                <article className="metric-card">
                  <p>Oldest account</p>
                  <h3>{selectedProfile.oldestAccountMonths} mo</h3>
                </article>
                <article className="metric-card">
                  <p>Hard inquiries (12m)</p>
                  <h3>{selectedProfile.hardInquiriesLast12Months}</h3>
                </article>
                <article className="metric-card">
                  <p>Derogatory marks</p>
                  <h3>{selectedProfile.derogatoryMarks}</h3>
                </article>
              </div>
            </div>
          )}

          <section className="insights">
            <h2>Credit Health Snapshot</h2>
            {analysisLoading && <p>Analyzing selected persona...</p>}
            {!analysisLoading && !report && !error && (
              <p>Select a persona to load report details.</p>
            )}

            {report && (
              <>
                <p className="summary">{report.summary}</p>
                <p>Band: {report.band}</p>
                <p>
                  Estimated range: {report.estimatedScoreRange.current} {"->"}{" "}
                  {report.estimatedScoreRange.conservative} to{" "}
                  {report.estimatedScoreRange.optimistic}
                </p>

                <h3>Strengths</h3>
                <ul>
                  {report.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>

                <h3>Risk Factors</h3>
                <ul>
                  {report.riskFactors.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>

                <h3>Recommended Actions</h3>
                <ul>
                  {report.recommendedActions.map((action) => (
                    <li key={action.id}>
                      <strong>{action.title}</strong> ({action.impact})
                      <p>{action.why}</p>
                      <p>Timeline: {action.timeline}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {error && <p className="error">{error}</p>}

          <section className="monitor-stack">
            <h3>Credit Monitoring Toolkit</h3>

            {!selectedProfile && (
              <p className="placeholder">Choose a persona to load credit tool details.</p>
            )}

            {selectedProfile && (
              <>
                <section className="monitor-block">
                  <h4>Current Score Snapshot</h4>
                  <div className="monitor-content">
                    <p>Score: {selectedProfile.currentScore}</p>
                    <p>Band: {report?.band ?? "pending analysis"}</p>
                    <p>Range context: 300-850</p>
                  </div>
                </section>

                <section className="monitor-block">
                  <h4>Scoring Model + Bureau</h4>
                  <div className="monitor-content">
                    <p>Model shown: VantageScore 3.0 style educational view (mock).</p>
                    <p>Data sources: TransUnion and Experian style profile fields (mock).</p>
                    <p>Lender-used scores can differ from this educational score.</p>
                  </div>
                </section>

                <section className="monitor-block">
                  <h4>Score Trend / History</h4>
                  <div className="monitor-content">
                    <ul className="simple-list">
                      {scoreTrend.map((point) => (
                        <li key={point.label}>
                          <strong>{point.label}</strong>: {point.score}
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>

                <section className="monitor-block">
                  <h4>Why Score Changed</h4>
                  <div className="monitor-content">
                    <ul className="simple-list">
                      {changeDrivers.map((driver) => (
                        <li key={driver.detail}>
                          <strong>{driver.direction === "up" ? "Positive" : "Negative"}:</strong>{" "}
                          {driver.detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>

                <section className="monitor-block">
                  <h4>Credit Factor Breakdown</h4>
                  <div className="monitor-content">
                    {factorScores && (
                      <ul className="factor-list">
                        <li>
                          <p>Payment history</p>
                          <div className="factor-bar">
                            <span style={{ width: `${factorScores.paymentHistory}%` }} />
                          </div>
                          <small>{factorScores.paymentHistory}/100</small>
                        </li>
                        <li>
                          <p>Utilization / usage</p>
                          <div className="factor-bar">
                            <span style={{ width: `${factorScores.utilization}%` }} />
                          </div>
                          <small>{factorScores.utilization}/100</small>
                        </li>
                        <li>
                          <p>Credit age / depth</p>
                          <div className="factor-bar">
                            <span style={{ width: `${factorScores.historyDepth}%` }} />
                          </div>
                          <small>{factorScores.historyDepth}/100</small>
                        </li>
                        <li>
                          <p>Inquiries + mix</p>
                          <div className="factor-bar">
                            <span style={{ width: `${factorScores.inquiriesAndMix}%` }} />
                          </div>
                          <small>{factorScores.inquiriesAndMix}/100</small>
                        </li>
                      </ul>
                    )}
                  </div>
                </section>

                <section className="monitor-block">
                  <h4>Credit Report Summary</h4>
                  <div className="monitor-content">
                    <p>Open accounts (estimated): {selectedProfile.creditLines}</p>
                    <p>Estimated total limits: ${totalLimit.toLocaleString()}</p>
                    <p>Estimated total balances: ${totalBalance.toLocaleString()}</p>
                    <p>
                      Estimated utilization from balances:{" "}
                      {totalLimit > 0 ? Math.round((totalBalance / totalLimit) * 100) : 0}%
                    </p>
                  </div>
                </section>

                <section className="monitor-block">
                  <h4>Account-Level Details</h4>
                  <div className="monitor-content">
                    <ul className="simple-list">
                      {accountBreakdown.map((account) => (
                        <li key={account.id}>
                          <strong>{account.type}</strong> | Age: {account.ageMonths} months | Balance: $
                          {account.balance.toLocaleString()} / Limit: $
                          {account.limit.toLocaleString()} | {account.status}
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>

                <section className="monitor-block">
                  <h4>Inquiries</h4>
                  <div className="monitor-content">
                    <p>Hard inquiries in last 12 months: {selectedProfile.hardInquiriesLast12Months}</p>
                    <p>
                      {selectedProfile.hardInquiriesLast12Months > 2
                        ? "Inquiry pace is elevated; reducing new applications may help."
                        : "Inquiry pace is controlled."}
                    </p>
                  </div>
                </section>

                <section className="monitor-block">
                  <h4>Derogatory / Public-Record Items</h4>
                  <div className="monitor-content">
                    <p>Derogatory marks: {selectedProfile.derogatoryMarks}</p>
                    <p>
                      {selectedProfile.derogatoryMarks > 0
                        ? "Derogatory items are present and likely impacting score outcomes."
                        : "No derogatory marks in this mock profile."}
                    </p>
                  </div>
                </section>

                <section className="monitor-block">
                  <h4>Personal Information</h4>
                  <div className="monitor-content">
                    <p>Name: Mock Persona ({selectedProfile.id})</p>
                    <p>Address: Masked for demo mode</p>
                    <p>SSN: Not stored in this prototype</p>
                  </div>
                </section>

                <section className="monitor-block">
                  <h4>Alerts / Monitoring</h4>
                  <div className="monitor-content">
                    <ul className="simple-list">
                      <li>Score change alerts: Enabled (session-level)</li>
                      <li>
                        New inquiry alerts:{" "}
                        {selectedProfile.hardInquiriesLast12Months > 2 ? "High activity" : "Normal activity"}
                      </li>
                      <li>
                        Delinquency watch:{" "}
                        {selectedProfile.onTimePaymentRate < 0.97 ? "Elevated" : "Low"}
                      </li>
                    </ul>
                  </div>
                </section>

                <section className="monitor-block">
                  <h4>Identity Protection Signals</h4>
                  <div className="monitor-content">
                    <ul className="simple-list">
                      <li>Dark web monitoring: Placeholder integration</li>
                      <li>Identity breach watch: Placeholder integration</li>
                      <li>Fraud account watch: Placeholder integration</li>
                    </ul>
                  </div>
                </section>

                <section className="monitor-block">
                  <h4>What-If Simulator</h4>
                  <div className="monitor-content">
                    <ul className="simple-list">
                      <li>
                        Reduce utilization below 30% {"->"} projected score{" "}
                        {clamp(
                          selectedProfile.currentScore +
                            (selectedProfile.utilizationRatio > 0.3 ? 22 : 8),
                          MIN_CREDIT_SCORE,
                          MAX_CREDIT_SCORE
                        )}
                      </li>
                      <li>
                        Keep 100% on-time payments for next 90 days {"->"} projected score{" "}
                        {clamp(
                          selectedProfile.currentScore +
                            (selectedProfile.onTimePaymentRate < 0.97 ? 16 : 6),
                          MIN_CREDIT_SCORE,
                          MAX_CREDIT_SCORE
                        )}
                      </li>
                      <li>
                        Pause non-essential applications for 6 months {"->"} projected score{" "}
                        {clamp(
                          selectedProfile.currentScore +
                            (selectedProfile.hardInquiriesLast12Months > 2 ? 12 : 4),
                          MIN_CREDIT_SCORE,
                          MAX_CREDIT_SCORE
                        )}
                      </li>
                    </ul>
                  </div>
                </section>

              </>
            )}
          </section>
        </section>

        <aside className="panel side-pane">
          {selectedProfile && selectedProfile.notes.length > 0 ? (
            <section className="profile-notes right-notes">
              <h3>Profile context</h3>
              <ul>
                {selectedProfile.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="placeholder">No profile context available for this persona.</p>
          )}
        </aside>
      </section>

      <p className="global-disclaimer">
        AI can make mistakes. This is not financial advice.
      </p>
    </main>
  );
}
