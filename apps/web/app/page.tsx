"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type HardInquiry = {
  lender: string;
  date: string;
};

type CreditLine = {
  accountName: string;
  limit: number;
};

type OldestAccountDetail = {
  accountName: string;
  openedDate: string;
};

type DerogatoryMark = {
  item: string;
  date: string;
  status: string;
};

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
  creditLineHistory?: CreditLine[];
  oldestAccountDetail?: OldestAccountDetail;
  hardInquiryHistory?: HardInquiry[];
  derogatoryMarkHistory?: DerogatoryMark[];
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

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const MIN_CREDIT_SCORE = 300;
const MAX_CREDIT_SCORE = 850;
const DEFAULT_AI_PROJECTION_QUESTION =
  "What are my projected score outcomes if I reduce utilization below 30%, keep 100% on-time payments for 90 days, and pause non-essential applications for 6 months?";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildProjectionCoachReply(profile: CreditProfile): string {
  const utilizationProjection = clamp(
    profile.currentScore + (profile.utilizationRatio > 0.3 ? 22 : 8),
    MIN_CREDIT_SCORE,
    MAX_CREDIT_SCORE
  );
  const paymentProjection = clamp(
    profile.currentScore + (profile.onTimePaymentRate < 0.97 ? 16 : 6),
    MIN_CREDIT_SCORE,
    MAX_CREDIT_SCORE
  );
  const inquiryProjection = clamp(
    profile.currentScore + (profile.hardInquiriesLast12Months > 2 ? 12 : 4),
    MIN_CREDIT_SCORE,
    MAX_CREDIT_SCORE
  );

  return [
    `Reduce utilization below 30% -> projected score ${utilizationProjection}`,
    `Keep 100% on-time payments for next 90 days -> projected score ${paymentProjection}`,
    `Pause non-essential applications for 6 months -> projected score ${inquiryProjection}`
  ].join("\n");
}

export default function HomePage() {
  const [profiles, setProfiles] = useState<CreditProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadProfiles();
  }, []);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId),
    [profiles, selectedProfileId]
  );

  const totalLimit = useMemo(() => {
    if (!selectedProfile) {
      return 0;
    }

    if (
      selectedProfile.creditLineHistory &&
      selectedProfile.creditLineHistory.length > 0
    ) {
      return selectedProfile.creditLineHistory.reduce(
        (sum, line) => sum + line.limit,
        0
      );
    }

    return Math.max(3000, selectedProfile.creditLines * 4200);
  }, [selectedProfile]);

  const totalBalance = useMemo(() => {
    if (!selectedProfile) {
      return 0;
    }

    return Math.round(totalLimit * selectedProfile.utilizationRatio);
  }, [selectedProfile, totalLimit]);

  useEffect(() => {
    if (!selectedProfileId) {
      return;
    }

    setChatInput(DEFAULT_AI_PROJECTION_QUESTION);
    setChatMessages([]);
  }, [selectedProfileId]);

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

  const trendDelta = useMemo(() => {
    if (scoreTrend.length < 2) {
      return 0;
    }

    return scoreTrend[scoreTrend.length - 1].score - scoreTrend[0].score;
  }, [scoreTrend]);

  const trendDomain = useMemo(() => {
    if (scoreTrend.length === 0) {
      return {
        min: MIN_CREDIT_SCORE,
        max: MAX_CREDIT_SCORE
      };
    }

    const values = scoreTrend.map((point) => point.score);
    const min = Math.max(MIN_CREDIT_SCORE, Math.min(...values) - 12);
    const max = Math.min(MAX_CREDIT_SCORE, Math.max(...values) + 12);

    return {
      min,
      max
    };
  }, [scoreTrend]);

  const trendGradientId = `trend-area-${selectedProfileId || "default"}`;

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

  async function sendChatMessage() {
    const userMessage = chatInput.trim();
    if (!selectedProfileId || !userMessage || chatLoading) {
      return;
    }

    if (
      selectedProfile &&
      userMessage === DEFAULT_AI_PROJECTION_QUESTION
    ) {
      setError(null);
      setChatMessages((previous) => [
        ...previous,
        { role: "user", text: userMessage },
        { role: "assistant", text: buildProjectionCoachReply(selectedProfile) }
      ]);
      setChatInput("");
      return;
    }

    setChatLoading(true);
    setError(null);
    setChatMessages((previous) => [...previous, { role: "user", text: userMessage }]);
    setChatInput("");

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          profileId: selectedProfileId,
          message: userMessage,
          responseMode: "text"
        })
      });

      if (!response.ok) {
        throw new Error(`Chat request failed (${response.status})`);
      }

      const payload = (await response.json()) as ChatResponse;
      setChatMessages((previous) => [
        ...previous,
        { role: "assistant", text: payload.advisorText }
      ]);
    } catch (chatError) {
      const message = chatError instanceof Error ? chatError.message : "Unknown error";
      setError(message);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="panel top-bar">
        <label className="top-bar-label" htmlFor="persona-select">
          <span>Select Demo Persona</span>
          <select
            id="persona-select"
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
                  {selectedProfile.creditLineHistory &&
                  selectedProfile.creditLineHistory.length > 0 ? (
                    <ul className="metric-detail-list">
                      {selectedProfile.creditLineHistory.map((line) => (
                        <li key={`${line.accountName}-${line.limit}`}>
                          {line.accountName}: ${line.limit.toLocaleString()} limit
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="metric-subtext">No credit line details listed.</p>
                  )}
                </article>
                <article className="metric-card">
                  <p>Utilization</p>
                  <h3>{(selectedProfile.utilizationRatio * 100).toFixed(0)}%</h3>
                  <p className="metric-subtext">
                    Total limits: ${totalLimit.toLocaleString()}
                  </p>
                  <p className="metric-subtext">
                    Total balances: ${totalBalance.toLocaleString()}
                  </p>
                </article>
                <article className="metric-card">
                  <p>On-time payments</p>
                  <h3>{(selectedProfile.onTimePaymentRate * 100).toFixed(0)}%</h3>
                </article>
                <article className="metric-card">
                  <p>Oldest account</p>
                  <h3>{selectedProfile.oldestAccountMonths} mo</h3>
                  <p className="metric-subtext">
                    {selectedProfile.oldestAccountDetail?.accountName ??
                      "Account detail unavailable"}
                  </p>
                  <p className="metric-subtext">
                    Opened:{" "}
                    {selectedProfile.oldestAccountDetail?.openedDate ?? "Unknown date"}
                  </p>
                </article>
                <article className="metric-card">
                  <p>Hard inquiries (12m)</p>
                  <h3>{selectedProfile.hardInquiriesLast12Months}</h3>
                  {selectedProfile.hardInquiryHistory &&
                  selectedProfile.hardInquiryHistory.length > 0 ? (
                    <ul className="metric-detail-list">
                      {selectedProfile.hardInquiryHistory.map((inquiry) => (
                        <li key={`${inquiry.lender}-${inquiry.date}`}>
                          {inquiry.lender}, {inquiry.date}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="metric-subtext">No recent hard inquiries listed.</p>
                  )}
                </article>
                <article className="metric-card">
                  <p>Derogatory marks</p>
                  <h3>{selectedProfile.derogatoryMarks}</h3>
                  {selectedProfile.derogatoryMarkHistory &&
                  selectedProfile.derogatoryMarkHistory.length > 0 ? (
                    <ul className="metric-detail-list">
                      {selectedProfile.derogatoryMarkHistory.map((mark) => (
                        <li key={`${mark.item}-${mark.date}`}>
                          {mark.item}, {mark.date} ({mark.status})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="metric-subtext">No derogatory marks listed.</p>
                  )}
                </article>
              </div>
            </div>
          )}

          {error && <p className="error">{error}</p>}

          <section className="monitor-stack">
            <h3>Credit Monitoring Toolkit</h3>

            {!selectedProfile && (
              <p className="placeholder">Choose a persona to load credit tool details.</p>
            )}

            {selectedProfile && (
              <>
                <section className="monitor-block">
                  <h4>Score Trend / History</h4>
                  <div className="monitor-content">
                    {scoreTrend.length > 0 ? (
                      <div
                        className="trend-chart-wrap"
                        role="img"
                        aria-label={`Score trend from ${scoreTrend[0].score} to ${scoreTrend[scoreTrend.length - 1].score}`}
                      >
                        <div className="trend-chart-head">
                          <p className="trend-window">Last 6 months</p>
                          <p className={`trend-delta ${trendDelta >= 0 ? "up" : "down"}`}>
                            {trendDelta >= 0 ? "+" : ""}
                            {trendDelta} pts
                          </p>
                        </div>

                        <div className="trend-chart">
                          <ResponsiveContainer width="100%" height={190}>
                            <AreaChart
                              data={scoreTrend}
                              margin={{ top: 8, right: 6, left: -18, bottom: 0 }}
                            >
                              <defs>
                                <linearGradient
                                  id={trendGradientId}
                                  x1="0%"
                                  y1="0%"
                                  x2="0%"
                                  y2="100%"
                                >
                                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                                </linearGradient>
                              </defs>
                              <CartesianGrid
                                vertical={false}
                                stroke="#d7e4fa"
                                strokeDasharray="4 4"
                              />
                              <XAxis
                                dataKey="label"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 11, fill: "#64748b" }}
                              />
                              <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 11, fill: "#64748b" }}
                                allowDecimals={false}
                                width={34}
                                domain={[trendDomain.min, trendDomain.max]}
                              />
                              <Tooltip
                                cursor={{ stroke: "#93c5fd", strokeWidth: 1 }}
                                formatter={(value: number | string) => [
                                  `${value} pts`,
                                  "Score"
                                ]}
                                contentStyle={{
                                  borderRadius: 10,
                                  border: "1px solid #d8e3f4",
                                  backgroundColor: "#ffffff"
                                }}
                              />
                              <Area
                                type="monotone"
                                dataKey="score"
                                stroke="#2563eb"
                                strokeWidth={2.5}
                                fill={`url(#${trendGradientId})`}
                                dot={{
                                  r: 2.3,
                                  fill: "#ffffff",
                                  stroke: "#2563eb",
                                  strokeWidth: 1.6
                                }}
                                activeDot={{
                                  r: 4,
                                  fill: "#2563eb",
                                  stroke: "#ffffff",
                                  strokeWidth: 2
                                }}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ) : (
                      <p className="placeholder">No trend data available.</p>
                    )}
                  </div>
                </section>

              </>
            )}
          </section>
        </section>

        <aside className="side-pane">
          <section className="panel profile-brief">
            <h3>Profile Snapshot</h3>
            {!selectedProfile && (
              <p className="placeholder">Choose a persona to load profile details.</p>
            )}

            {selectedProfile && (
              <div className="profile-brief-content">
                <p>
                  <strong>Context:</strong>{" "}
                  {selectedProfile.notes.length > 0
                    ? selectedProfile.notes.slice(0, 2).join(" • ")
                    : "No profile context available for this persona."}
                </p>
              </div>
            )}
          </section>

          <section className="panel ai-chat">
            <h2>AI Credit Coach</h2>

            <div className="composer">
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask a question about improving this profile."
                rows={4}
              />

              <div className="row-actions">
                <button
                  type="button"
                  onClick={() => void sendChatMessage()}
                  disabled={chatLoading}
                >
                  {chatLoading ? "Thinking..." : "Send"}
                </button>
              </div>
            </div>

            <div className="chat-log">
              {chatMessages.length === 0 && (
                <p className="placeholder">Conversation will appear here.</p>
              )}
              {chatMessages.map((message, index) => (
                <article
                  key={`${message.role}-${index}`}
                  className={`bubble ${message.role === "assistant" ? "assistant" : "user"}`}
                >
                  <p className="role">{message.role === "assistant" ? "Coach" : "You"}</p>
                  <p>{message.text}</p>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <p className="global-disclaimer">
        AI can make mistakes. This is not financial advice.
      </p>
    </main>
  );
}
