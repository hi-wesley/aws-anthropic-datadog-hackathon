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
import { z } from "zod";
import {
  BedrockRuntimeClient,
  ConverseCommand
} from "@aws-sdk/client-bedrock-runtime";
import {
  PollyClient,
  SynthesizeSpeechCommand,
  type SynthesizeSpeechCommandOutput
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
  responseMode: z.enum(["text", "voice"]).default("text")
});

const ttsSchema = z.object({
  text: z.string().min(1).max(3500)
});

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

  const { profileId, message, responseMode } = parsed.data;
  const profiles = await loadProfiles();
  const profile = profiles.find((candidate) => candidate.id === profileId);

  if (!profile) {
    reply.code(404);
    return {
      error: `Profile ${profileId} not found`
    };
  }

  const report = evaluateCreditProfile(profile);
  const advisor = await generateAdvisorReply({ profile, report, message });
  const audioBase64 =
    responseMode === "voice" ? await synthesizeSpeech(advisor.text) : undefined;

  const response: ChatResponse = {
    advisorText: advisor.text,
    report,
    audioBase64,
    meta: {
      usedBedrock: advisor.usedBedrock
    }
  };

  request.log.info(
    {
      profileId,
      responseMode,
      usedBedrock: advisor.usedBedrock,
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

async function generateAdvisorReply({
  profile,
  report,
  message
}: {
  profile: CreditProfile;
  report: CreditHealthReport;
  message: string;
}): Promise<{ text: string; usedBedrock: boolean }> {
  const fallback = createFallbackAdvice(report);

  if (process.env.DISABLE_BEDROCK === "true") {
    return {
      text: fallback,
      usedBedrock: false
    };
  }

  try {
    const systemPrompt = buildAdvisorSystemPrompt();
    const userPrompt = buildAdvisorUserPrompt({ profile, report, userMessage: message });

    const command = new ConverseCommand({
      modelId: bedrockModelId,
      system: [{ text: systemPrompt }],
      messages: [
        {
          role: "user",
          content: [{ text: userPrompt }]
        }
      ],
      inferenceConfig: {
        maxTokens: 700,
        temperature: 0.3
      }
    });

    const result = await bedrockClient.send(command);
    const text =
      result.output?.message?.content
        ?.map((item) => ("text" in item ? item.text ?? "" : ""))
        .join("\n")
        .trim() ?? "";

    if (!text) {
      return {
        text: fallback,
        usedBedrock: false
      };
    }

    return {
      text,
      usedBedrock: true
    };
  } catch (error) {
    app.log.warn(
      {
        err: error,
        model: bedrockModelId
      },
      "bedrock_converse_failed"
    );

    return {
      text: fallback,
      usedBedrock: false
    };
  }
}

function createFallbackAdvice(report: CreditHealthReport): string {
  const topActions = report.recommendedActions.slice(0, 3);
  const actionText = topActions
    .map(
      (action, index) =>
        `${index + 1}. ${action.title} (${action.impact}, ${action.timeline}) - ${action.why}`
    )
    .join("\n");

  return [
    `Current credit health: ${report.band}. ${report.summary}`,
    `Estimated score outlook: ${report.estimatedScoreRange.current} now, with potential movement to ${report.estimatedScoreRange.conservative}-${report.estimatedScoreRange.optimistic}.`,
    "Recommended next steps:",
    actionText,
    "This is educational guidance and not financial or legal advice."
  ].join("\n\n");
}

async function synthesizeSpeech(text: string): Promise<string | undefined> {
  if (process.env.ENABLE_POLLY === "false") {
    return undefined;
  }

  try {
    const response = await pollyClient.send(
      new SynthesizeSpeechCommand({
        OutputFormat: "mp3",
        VoiceId: process.env.POLLY_VOICE_ID ?? "Joanna",
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
