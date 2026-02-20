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

export default function HomePage() {
  const [profiles, setProfiles] = useState<CreditProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [report, setReport] = useState<CreditHealthReport | null>(null);
  const [responseMode, setResponseMode] = useState<"text" | "voice">("text");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadProfiles();
  }, []);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId),
    [profiles, selectedProfileId]
  );

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

  async function sendMessage(overrideMessage?: string) {
    const userMessage = (overrideMessage ?? input).trim();
    if (!selectedProfileId || !userMessage || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    if (!overrideMessage) {
      setInput("");
    }

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          profileId: selectedProfileId,
          message: userMessage,
          responseMode
        })
      });

      if (!response.ok) {
        throw new Error(`Chat request failed (${response.status})`);
      }

      const payload = (await response.json()) as ChatResponse;

      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: payload.advisorText }
      ]);
      setReport(payload.report);

      if (responseMode === "voice") {
        await speakReply(payload);
      }
    } catch (chatError) {
      const message =
        chatError instanceof Error ? chatError.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function speakReply(payload: ChatResponse) {
    if (payload.audioBase64) {
      const player = new Audio(`data:audio/mp3;base64,${payload.audioBase64}`);
      await player.play();
      return;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(payload.advisorText);
      window.speechSynthesis.speak(utterance);
    }
  }

  function captureVoice() {
    if (typeof window === "undefined") {
      return;
    }

    type SpeechRecognitionCtor = new () => {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onstart: (() => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
      onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      start: () => void;
    };

    const anyWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };

    const SpeechRecognitionAPI =
      anyWindow.SpeechRecognition ?? anyWindow.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setError("Speech recognition is not available in this browser.");
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setRecording(true);
      setError(null);
    };

    recognition.onend = () => {
      setRecording(false);
    };

    recognition.onerror = () => {
      setRecording(false);
      setError("Voice capture failed. Please try again.");
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      void sendMessage(transcript);
    };

    recognition.start();
  }

  return (
    <main className="page-shell">
      <section className="panel hero">
        <p className="eyebrow">AWS Bedrock + Datadog</p>
        <h1>Credit Health Coach</h1>
        <p>
          Run mock personas, ask questions in text or voice, and get educational,
          personalized credit-improvement guidance.
        </p>
      </section>

      <section className="layout-grid">
        <div className="panel">
          <div className="controls">
            <label>
              Persona
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

            <div className="mode-toggle" role="radiogroup" aria-label="Response mode">
              <button
                className={responseMode === "text" ? "active" : ""}
                type="button"
                onClick={() => setResponseMode("text")}
              >
                Text Reply
              </button>
              <button
                className={responseMode === "voice" ? "active" : ""}
                type="button"
                onClick={() => setResponseMode("voice")}
              >
                Voice Reply
              </button>
            </div>
          </div>

          {selectedProfile && (
            <div className="profile-card">
              <h2>{selectedProfile.label}</h2>
              <p>Current score: {selectedProfile.currentScore}</p>
              <p>Credit lines: {selectedProfile.creditLines}</p>
              <p>Utilization: {(selectedProfile.utilizationRatio * 100).toFixed(0)}%</p>
              <p>
                On-time payments: {(selectedProfile.onTimePaymentRate * 100).toFixed(0)}%
              </p>
            </div>
          )}

          <div className="composer">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about this persona's credit health and how to improve it."
              rows={4}
            />

            <div className="row-actions">
              <button type="button" onClick={() => void sendMessage()} disabled={loading}>
                {loading ? "Thinking..." : "Send"}
              </button>
              <button type="button" onClick={captureVoice} disabled={loading || recording}>
                {recording ? "Listening..." : "Speak"}
              </button>
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          <div className="chat-log">
            {messages.length === 0 && (
              <p className="placeholder">Conversation will appear here.</p>
            )}
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={`bubble ${message.role === "assistant" ? "assistant" : "user"}`}
              >
                <p className="role">{message.role === "assistant" ? "Coach" : "You"}</p>
                <p>{message.text}</p>
              </article>
            ))}
          </div>
        </div>

        <aside className="panel insights">
          <h2>Credit Health Snapshot</h2>
          {!report && <p>Send a message to generate a report.</p>}

          {report && (
            <>
              <p className="summary">{report.summary}</p>
              <p>Band: {report.band}</p>
              <p>
                Estimated range: {report.estimatedScoreRange.current} {"->"}{" "}
                {report.estimatedScoreRange.conservative} to {report.estimatedScoreRange.optimistic}
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
        </aside>
      </section>
    </main>
  );
}
