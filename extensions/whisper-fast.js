import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { Type } from "typebox";

const require = createRequire(import.meta.url);
const TOOL_NAME = "transcribe_audio";
const STATUS_COMMAND = "whisper-fast-status";

let whisperModulePromise;
let loadedModel;
let loadedModelKey;
let queue = Promise.resolve();

export function expandHome(value) {
  if (!value || !value.startsWith("~")) return value;
  return path.join(os.homedir(), value.slice(1));
}

export function parseBool(value, fallback = false) {
  if (value == null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

export function readConfig(env = process.env, { allowMissingModel = false } = {}) {
  const modelPath = env.PI_WHISPER_FAST_MODEL?.trim();
  const threadsRaw = env.PI_WHISPER_FAST_THREADS?.trim();
  const nThreads = threadsRaw ? Number(threadsRaw) : undefined;

  if (!modelPath && !allowMissingModel) {
    throw new Error("Set PI_WHISPER_FAST_MODEL to a local ggml Whisper model file.");
  }
  if (threadsRaw && (!Number.isInteger(nThreads) || nThreads < 0)) {
    throw new Error(`PI_WHISPER_FAST_THREADS must be a non-negative integer, got: ${threadsRaw}`);
  }

  return {
    modelPath: modelPath ? expandHome(modelPath) : undefined,
    useGpu: parseBool(env.PI_WHISPER_FAST_GPU, false),
    nThreads,
  };
}

export function resolveUserPath(cwd, inputPath) {
  const expanded = expandHome(inputPath);
  return path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
}

function withQueue(work) {
  // ponytail: one global transcription queue; split per model if throughput matters.
  const run = queue.then(work, work);
  queue = run.catch(() => {});
  return run;
}

async function assertFileExists(filePath, label) {
  try {
    await stat(filePath);
  } catch {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function summarizeLoadError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("Cannot find native binding")) return message;
  return [
    `whisper-fast could not load on ${process.platform}/${process.arch}.`,
    "The current upstream package may not ship a native binary for this platform yet.",
    "If you are in WSL, run Pi on Windows or swap to a Linux-supported upstream build.",
  ].join(" ");
}

async function loadWhisperFast() {
  whisperModulePromise ??= (async () => {
    try {
      const mod = require("whisper-fast");
      return mod.default ?? mod;
    } catch (error) {
      throw new Error(summarizeLoadError(error));
    }
  })();
  return whisperModulePromise;
}

async function getModel(config) {
  const whisperFast = await loadWhisperFast();
  const modelKey = JSON.stringify([config.modelPath, config.useGpu]);

  if (loadedModel && loadedModelKey !== modelKey) {
    if (loadedModel.isLoaded?.()) loadedModel.unload();
    loadedModel = undefined;
    loadedModelKey = undefined;
  }

  if (!loadedModel) {
    loadedModel = new whisperFast.WhisperModel(config.modelPath);
    await loadedModel.load(config.useGpu);
    loadedModelKey = modelKey;
  }

  return loadedModel;
}

function formatTranscript(result, timestamps) {
  const lines = [result.text?.trim() || "(empty transcript)"];
  if (timestamps && result.segments?.length) {
    lines.push(
      "",
      ...result.segments.map((segment) =>
        `[${segment.start.toFixed(2)}-${segment.end.toFixed(2)}] ${segment.text.trim()}`,
      ),
    );
  }
  return lines.join("\n");
}

async function transcribe(ctx, params) {
  const config = readConfig();
  const audioPath = resolveUserPath(ctx.cwd, params.path);
  await assertFileExists(audioPath, "Audio file");
  await assertFileExists(config.modelPath, "Model file");

  const result = await withQueue(async () => {
    const model = await getModel(config);
    return model.transcribeFile(audioPath, {
      language: params.language,
      translate: params.translate,
      wordTimestamps: params.wordTimestamps,
      prompt: params.prompt,
      nThreads: params.nThreads ?? config.nThreads,
    });
  });

  return {
    content: [{ type: "text", text: formatTranscript(result, params.timestamps) }],
    details: {
      audioPath,
      modelPath: config.modelPath,
      processTimeMs: result.processTimeMs,
      language: result.language,
      languageProbability: result.languageProbability,
      segments: result.segments,
    },
  };
}

async function statusText() {
  const config = readConfig(process.env, { allowMissingModel: true });
  let library = "not loaded yet";
  try {
    const whisperFast = await loadWhisperFast();
    library = `ready (${whisperFast.getVersion?.() ?? "unknown version"})`;
  } catch (error) {
    library = summarizeLoadError(error);
  }

  return [
    `library: ${library}`,
    `model: ${config.modelPath ?? "unset (set PI_WHISPER_FAST_MODEL)"}`,
    `gpu: ${config.useGpu}`,
    `threads: ${config.nThreads ?? "auto"}`,
  ].join(" | ");
}

export default function whisperFastExtension(pi) {
  pi.registerTool({
    name: TOOL_NAME,
    label: "Transcribe Audio",
    description: "Transcribe a local audio file with whisper-fast.",
    promptSnippet: "Transcribe local audio files with whisper-fast.",
    promptGuidelines: [
      "Use transcribe_audio when the user wants speech-to-text from a local audio or video file path.",
    ],
    parameters: Type.Object({
      path: Type.String({ description: "Path to the local audio file." }),
      language: Type.Optional(Type.String({ description: "Language code like en, de, zh. Omit for auto-detect." })),
      translate: Type.Optional(Type.Boolean({ description: "Translate speech to English." })),
      wordTimestamps: Type.Optional(Type.Boolean({ description: "Include word-level timestamps when supported." })),
      timestamps: Type.Optional(Type.Boolean({ description: "Append segment timestamps to the tool output." })),
      nThreads: Type.Optional(Type.Number({ description: "Override thread count for this run." })),
      prompt: Type.Optional(Type.String({ description: "Prompt text to steer transcription." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return transcribe(ctx, params);
    },
  });

  pi.registerCommand(STATUS_COMMAND, {
    description: "Show whisper-fast config and native module status",
    handler: async (_args, ctx) => {
      const text = await statusText();
      ctx.ui.notify(text, text.includes("ready (") ? "info" : "error");
    },
  });

  pi.on("session_shutdown", async () => {
    if (loadedModel?.isLoaded?.()) loadedModel.unload();
    loadedModel = undefined;
    loadedModelKey = undefined;
  });
}
