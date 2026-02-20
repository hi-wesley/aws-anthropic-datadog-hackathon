import "dotenv/config";
import tracer from "dd-trace";

if (process.env.DD_TRACE_ENABLED === "true") {
  tracer.init({
    service: process.env.DD_SERVICE ?? "credit-coach-api",
    env: process.env.DD_ENV ?? "dev",
    version: process.env.DD_VERSION ?? "0.1.0"
  });
}

import Fastify from "fastify";
import cors from "@fastify/cors";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  BedrockRuntimeClient,
  ConverseCommand
} from "@aws-sdk/client-bedrock-runtime";
import {
  PollyClient,
  SynthesizeSpeechCommand,
  type SynthesizeSpeechCommandOutput,
  type VoiceId
} from "@aws-sdk/client-polly";
import { evaluateCreditProfile } from "@credit-coach/credit-engine";
import { buildAdvisorSystemPrompt, buildAdvisorUserPrompt } from "@credit-coach/prompts";
import type {
  ChatResponse,
  CreditProfile,
  CreditHealthReport
} from "@credit-coach/shared-types";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info"
  }
});

await app.register(cors, {
  origin: true
});

const region = process.env.AWS_REGION ?? "us-east-1";
const bedrockModelId =
  process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-3-5-sonnet-20241022-v2:0";

const bedrockClient = new BedrockRuntimeClient({ region });
const pollyClient = new PollyClient({ region });
const mockUsersPath = new URL("../../../data/mock-users/users.json", import.meta.url);

const chatSchema = z.object({
  profileId: z.string().min(1),
  message: z.string().min(1),
  responseMode: z.enum(["text", "voice"]).default("text"),
  conversationId: z.string().min(1).max(120).optional()
});

const ttsSchema = z.object({
  text: z.string().min(1).max(3500)
});

type ConversationRole = "user" | "assistant";

type ConversationMessage = {
  role: ConversationRole;
  text: string;
};

type ConversationSession = {
  profileId: string;
  messages: ConversationMessage[];
  updatedAtMs: number;
};

const conversationSessions = new Map<string, ConversationSession>();
const CONVERSATION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_CONVERSATION_MESSAGES = 20;

app.get("/health", async () => {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    region,
    bedrockModelId,
    datadogTraceEnabled: process.env.DD_TRACE_ENABLED === "true"
  };
});

app.get("/profiles", async () => {
  return await loadProfiles();
});

app.post("/chat", async (request, reply) => {
  const parsed = chatSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.code(400);
    return {
      error: "Invalid request body",
      issues: parsed.error.flatten()
    };
  }

  const { profileId, message, responseMode, conversationId } = parsed.data;
  const resolvedConversationId = conversationId?.trim() || randomUUID();
  const profiles = await loadProfiles();
  const profile = profiles.find((candidate) => candidate.id === profileId);

  if (!profile) {
    reply.code(404);
    return {
      error: `Profile ${profileId} not found`
    };
  }

  const report = evaluateCreditProfile(profile);
  const advisor = await generateAdvisorReply({
    profile,
    report,
    message,
    conversationId: resolvedConversationId
  });
  const audioBase64 =
    responseMode === "voice" ? await synthesizeSpeech(advisor.text) : undefined;

  const response: ChatResponse = {
    advisorText: advisor.text,
    report,
    audioBase64,
    meta: {
      usedBedrock: advisor.usedBedrock,
      conversationId: advisor.conversationId,
      profileContextIncluded: advisor.profileContextIncluded
    }
  };

  request.log.info(
    {
      profileId,
      conversationId: advisor.conversationId,
      responseMode,
      usedBedrock: advisor.usedBedrock,
      profileContextIncluded: advisor.profileContextIncluded,
      healthBand: report.band,
      datadog: {
        llm_provider: "aws.bedrock",
        model: bedrockModelId,
        profile_id: profileId
      }
    },
    "chat_request_completed"
  );

  return response;
});

app.post("/voice/transcribe", async () => {
  return {
    mode: "client-side-stt",
    note: "MVP defaults to browser speech recognition. Replace with Amazon Transcribe for server-side STT."
  };
});

app.post("/voice/synthesize", async (request, reply) => {
  const parsed = ttsSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.code(400);
    return {
      error: "Invalid request body",
      issues: parsed.error.flatten()
    };
  }

  const audioBase64 = await synthesizeSpeech(parsed.data.text);
  if (!audioBase64) {
    reply.code(503);
    return {
      error: "Voice synthesis unavailable"
    };
  }

  return {
    audioBase64
  };
});

async function loadProfiles(): Promise<CreditProfile[]> {
  const raw = await readFile(mockUsersPath, "utf8");
  return JSON.parse(raw) as CreditProfile[];
}

function pruneExpiredConversations(nowMs: number): void {
  for (const [conversationId, session] of conversationSessions.entries()) {
    if (nowMs - session.updatedAtMs > CONVERSATION_TTL_MS) {
      conversationSessions.delete(conversationId);
    }
  }
}

function getConversationSession(
  conversationId: string,
  profileId: string
): ConversationSession {
  const nowMs = Date.now();
  pruneExpiredConversations(nowMs);

  const existing = conversationSessions.get(conversationId);
  if (existing && existing.profileId === profileId) {
    existing.updatedAtMs = nowMs;
    return existing;
  }

  const fresh: ConversationSession = {
    profileId,
    messages: [],
    updatedAtMs: nowMs
  };
  conversationSessions.set(conversationId, fresh);
  return fresh;
}

function toBedrockMessages(messages: ConversationMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: [{ text: message.text }]
  }));
}

function appendConversationTurn(
  session: ConversationSession,
  userText: string,
  assistantText: string
): void {
  session.messages.push({ role: "user", text: userText });
  session.messages.push({ role: "assistant", text: assistantText });

  if (session.messages.length > MAX_CONVERSATION_MESSAGES) {
    const tail = session.messages.slice(-(MAX_CONVERSATION_MESSAGES - 1));
    session.messages = [session.messages[0], ...tail];
  }

  session.updatedAtMs = Date.now();
}

async function generateAdvisorReply({
  profile,
  report,
  message,
  conversationId
}: {
  profile: CreditProfile;
  report: CreditHealthReport;
  message: string;
  conversationId: string;
}): Promise<{
  text: string;
  usedBedrock: boolean;
  conversationId: string;
  profileContextIncluded: boolean;
}> {
  const session = getConversationSession(conversationId, profile.id);
  const profileContextIncluded = session.messages.length === 0;
  const userPrompt = buildAdvisorUserPrompt({
    profile,
    report,
    userMessage: message,
    includeContext: profileContextIncluded
  });
  const fallback = createFallbackAdvice(report);

  if (process.env.DISABLE_BEDROCK === "true") {
    appendConversationTurn(session, userPrompt, fallback);
    return {
      text: fallback,
      usedBedrock: false,
      conversationId,
      profileContextIncluded
    };
  }

  try {
    const systemPrompt = buildAdvisorSystemPrompt();
    const conversationHistory = toBedrockMessages(session.messages);
    const currentUserMessage = {
      role: "user" as const,
      content: [{ text: userPrompt }]
    };

    const command = new ConverseCommand({
      modelId: bedrockModelId,
      system: [{ text: systemPrompt }],
      messages: [...conversationHistory, currentUserMessage],
      inferenceConfig: {
        maxTokens: 180,
        temperature: 0.2
      }
    });

    const result = await bedrockClient.send(command);
    const text =
      result.output?.message?.content
        ?.map((item) => ("text" in item ? item.text ?? "" : ""))
        .join("\n")
        .trim() ?? "";

    if (!text) {
      appendConversationTurn(session, userPrompt, fallback);
      return {
        text: fallback,
        usedBedrock: false,
        conversationId,
        profileContextIncluded
      };
    }

    appendConversationTurn(session, userPrompt, text);
    return {
      text,
      usedBedrock: true,
      conversationId,
      profileContextIncluded
    };
  } catch (error) {
    app.log.warn(
      {
        err: error,
        model: bedrockModelId
      },
      "bedrock_converse_failed"
    );

    appendConversationTurn(session, userPrompt, fallback);
    return {
      text: fallback,
      usedBedrock: false,
      conversationId,
      profileContextIncluded
    };
  }
}

function createFallbackAdvice(report: CreditHealthReport): string {
  const topActions = report.recommendedActions.slice(0, 3);
  const actionText = topActions
    .map((action) => `- ${action.title} (${action.timeline})`)
    .join("\n");

  return [
    `Top priorities for this profile (${report.band}):`,
    actionText,
    "Educational only, not financial advice."
  ].join("\n");
}

async function synthesizeSpeech(text: string): Promise<string | undefined> {
  if (process.env.ENABLE_POLLY === "false") {
    return undefined;
  }

  const configuredVoiceId = process.env.POLLY_VOICE_ID as VoiceId | undefined;

  try {
    const response = await pollyClient.send(
      new SynthesizeSpeechCommand({
        OutputFormat: "mp3",
        VoiceId: configuredVoiceId ?? "Joanna",
        Text: text.slice(0, 3000)
      })
    );

    return await audioStreamToBase64(response);
  } catch (error) {
    app.log.warn({ err: error }, "polly_synthesis_failed");
    return undefined;
  }
}

async function audioStreamToBase64(
  response: SynthesizeSpeechCommandOutput
): Promise<string | undefined> {
  const { AudioStream: audioStream } = response;
  if (!audioStream) {
    return undefined;
  }

  if (audioStream instanceof Uint8Array) {
    return Buffer.from(audioStream).toString("base64");
  }

  if (typeof (audioStream as Blob).arrayBuffer === "function") {
    const asBlob = audioStream as Blob;
    const arrayBuffer = await asBlob.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("base64");
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of audioStream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("base64");
}

const port = Number(process.env.PORT ?? "4000");
await app.listen({
  port,
  host: "0.0.0.0"
});

app.log.info(`Credit Coach API running on port ${port}`);
