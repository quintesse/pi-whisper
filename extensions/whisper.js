import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { basename, dirname, extname, join, resolve } from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import { Type } from "typebox";

const execFileAsync = promisify(execFile);
const TOOL_NAME = "transcribe_audio";
const STATUS_COMMAND = "whisper-status";
const TEST_COMMAND = "whisper-transcribe";
const MODEL_COMMAND = "whisper-model";
const CONFIG_PATH = join(os.homedir(), ".pi", "agent", "whisper.json");
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const queueSeed = Promise.resolve();
let queue = queueSeed;

export function expandHome(value) {
  if (!value || !value.startsWith("~")) return value;
  return join(os.homedir(), value.slice(1));
}

export function resolveUserPath(cwd, inputPath) {
  const expanded = expandHome(inputPath);
  return resolve(cwd, expanded);
}

export function isLikelyPath(value) {
  return /[\\/]/.test(value) || value.startsWith("~") || /\.(bin|gguf|pt)$/i.test(value);
}

function normalizeMaybePath(value) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return isLikelyPath(trimmed) ? resolve(expandHome(trimmed)) : trimmed;
}

export function readConfig(env = process.env) {
  const threadsRaw = env.PI_WHISPER_THREADS?.trim();
  const nThreads = threadsRaw ? Number(threadsRaw) : undefined;
  if (threadsRaw && (!Number.isInteger(nThreads) || nThreads < 0)) {
    throw new Error(`PI_WHISPER_THREADS must be a non-negative integer, got: ${threadsRaw}`);
  }

  return {
    command: env.PI_WHISPER_COMMAND?.trim() || env.WHISPER_COMMAND?.trim() || undefined,
    model: normalizeMaybePath(env.PI_WHISPER_MODEL),
    modelDir: normalizeMaybePath(env.PI_WHISPER_MODEL_DIR || env.WHISPER_MODEL_DIR),
    nThreads,
  };
}

async function readStoredConfig() {
  const hasConfig = await pathExists(CONFIG_PATH);
  if (!hasConfig) return { hasConfig: false };

  try {
    const parsed = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
    return {
      hasConfig: true,
      command: typeof parsed.command === "string" ? parsed.command.trim() || undefined : undefined,
      model: typeof parsed.model === "string" ? normalizeMaybePath(parsed.model) : undefined,
      modelDir: typeof parsed.modelDir === "string" ? normalizeMaybePath(parsed.modelDir) : undefined,
      nThreads: Number.isInteger(parsed.nThreads) && parsed.nThreads >= 0 ? parsed.nThreads : undefined,
    };
  } catch {
    return { hasConfig: true };
  }
}

async function writeStoredConfig(config) {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function getConfig(env = process.env) {
  const stored = await readStoredConfig();
  const runtime = readConfig(env);
  const preferStored = stored.hasConfig;
  return {
    command: preferStored ? stored.command ?? runtime.command : runtime.command ?? stored.command,
    commandSource: preferStored
      ? stored.command ? "config" : runtime.command ? "env" : undefined
      : runtime.command ? "env" : stored.command ? "config" : undefined,
    model: preferStored ? stored.model ?? runtime.model : runtime.model ?? stored.model,
    modelSource: preferStored
      ? stored.model ? "config" : runtime.model ? "env" : undefined
      : runtime.model ? "env" : stored.model ? "config" : undefined,
    modelDir: preferStored ? stored.modelDir ?? runtime.modelDir : runtime.modelDir ?? stored.modelDir,
    nThreads: preferStored ? stored.nThreads ?? runtime.nThreads : runtime.nThreads ?? stored.nThreads,
  };
}

export function backendForModel(model) {
  if (!model) return undefined;
  if (/\.pt$/i.test(model)) return "python-whisper";
  if (/\.(bin|gguf)$/i.test(model)) return "whisper.cpp";
  return isLikelyPath(model) ? "whisper.cpp" : "python-whisper";
}

export function scoreSpeechModel(modelPath) {
  const lower = modelPath.toLowerCase();
  let score = 0;
  if (lower.includes("whisper")) score += 20;
  if (lower.includes("ggml")) score += 8;
  if (lower.endsWith(".gguf")) score += 7;
  if (lower.endsWith(".bin")) score += 6;
  if (lower.endsWith(".pt")) score += 5;
  if (lower.includes("base")) score += 10;
  if (lower.includes("small")) score += 8;
  if (lower.includes("tiny")) score += 6;
  return score;
}

export function buildWhisperCppArgs({ modelPath, audioPath, outBase, language, translate, timestamps, nThreads }) {
  const args = ["-m", modelPath, "-f", audioPath, "-np", "-of", outBase, "-otxt"];
  if (timestamps) args.push("-osrt");
  if (language) args.push("-l", language);
  if (translate) args.push("-tr");
  if (Number.isInteger(nThreads)) args.push("-t", String(nThreads));
  return args;
}

export function buildPythonWhisperArgs({ model, audioPath, outputDir, language, translate, timestamps, wordTimestamps, prompt }) {
  const args = [
    audioPath,
    "--model", pythonModelName(model),
    "--output_format", timestamps ? "all" : "txt",
    "--output_dir", outputDir,
    "--fp16", "False",
  ];
  if (language) args.push("--language", language);
  if (translate) args.push("--task", "translate");
  if (wordTimestamps) args.push("--word_timestamps", "True");
  if (prompt) args.push("--initial_prompt", prompt);
  return args;
}

function pythonModelName(model) {
  return /\.pt$/i.test(model) ? basename(model, ".pt") : model;
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function assertFileExists(filePath, label) {
  try {
    await stat(filePath);
  } catch {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

async function findExecutable(names) {
  for (const name of names.filter(Boolean)) {
    if (name.includes("/") || name.includes("\\")) {
      const resolved = resolve(expandHome(name));
      if (await pathExists(resolved)) return resolved;
      continue;
    }
    try {
      const { stdout } = await execFileAsync("which", [name]);
      const found = stdout.trim().split("\n")[0];
      if (found) return found;
    } catch {
      // try next
    }
  }
  return undefined;
}

async function scanModels(dir, candidates, depth = 0) {
  if (depth > 4 || !(await pathExists(dir))) return;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const target = join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanModels(target, candidates, depth + 1);
      continue;
    }
    if (/\.(pt|gguf)$/i.test(entry.name) || (/\.bin$/i.test(entry.name) && /ggml|whisper/i.test(target))) {
      candidates.push(target);
    }
  }
}

async function findSpeechModels(env = process.env) {
  const config = await getConfig(env);
  const candidates = [];

  if (config.model && isLikelyPath(config.model) && await pathExists(config.model)) {
    candidates.push(config.model);
  }

  const dirs = [
    config.modelDir,
    join(os.homedir(), ".cache", "whisper"),
    join(os.homedir(), ".cache", "whisper.cpp"),
    join(os.homedir(), ".cache", "huggingface", "hub"),
    join(os.homedir(), ".local", "share", "whisper"),
    join(os.homedir(), "Library", "Application Support", "whisper.cpp"),
    join(os.homedir(), ".pi", "agent", "models"),
    join(os.homedir(), "models"),
    join(os.homedir(), "Models"),
  ].filter(Boolean);

  for (const dir of dirs) await scanModels(dir, candidates);
  return [...new Set(candidates)].sort((a, b) => scoreSpeechModel(b) - scoreSpeechModel(a));
}

async function findSpeechModel(env = process.env) {
  const config = await getConfig(env);
  if (config.model) {
    if (isLikelyPath(config.model) && !(await pathExists(config.model))) {
      return { error: `Configured Whisper model not found: ${config.model}` };
    }
    return { model: config.model, source: config.modelSource ?? "config" };
  }

  const models = await findSpeechModels(env);
  if (models[0]) return { model: models[0], source: "auto" };
  return { error: "No Whisper model found. Use /whisper-model to pick one, or put a model in a common cache directory." };
}

async function detectBackend(env = process.env) {
  const config = await getConfig(env);
  const selectedModel = await findSpeechModel(env);
  if (selectedModel.error) {
    return { error: selectedModel.error };
  }
  const model = selectedModel.model;

  const backend = backendForModel(model);
  const command = await findExecutable(
    backend === "whisper.cpp"
      ? [
          config.command,
          "whisper-cli",
          "whisper.cpp",
          "main",
          join(os.homedir(), "whisper.cpp", "build", "bin", "whisper-cli"),
          join(os.homedir(), "whisper.cpp", "main"),
        ]
      : [config.command, "whisper"],
  );

  if (!command) {
    return {
      error:
        backend === "whisper.cpp"
          ? "No whisper.cpp executable found. Set PI_WHISPER_COMMAND or install whisper-cli."
          : "No Python whisper executable found. Set PI_WHISPER_COMMAND or install the whisper CLI.",
      model,
      backend,
    };
  }

  return {
    backend,
    command,
    commandSource: config.commandSource,
    model,
    modelSource: selectedModel.source,
    nThreads: config.nThreads,
  };
}

function withQueue(work) {
  // ponytail: one global transcription queue; split per backend if this becomes hot.
  const run = queue.then(work, work);
  queue = run.catch(() => {});
  return run;
}

async function runWhisperCpp(command, modelPath, audioPath, params, defaultThreads) {
  await assertFileExists(modelPath, "Model file");
  const tempDir = await mkdtemp(join(os.tmpdir(), "pi-whisper-"));
  const outBase = join(tempDir, "transcript");
  try {
    await execFileAsync(command, buildWhisperCppArgs({
      modelPath,
      audioPath,
      outBase,
      language: params.language,
      translate: params.translate,
      timestamps: params.timestamps,
      nThreads: params.nThreads ?? defaultThreads,
    }), { timeout: DEFAULT_TIMEOUT_MS });

    return {
      text: (await readFile(`${outBase}.txt`, "utf8")).trim(),
      timestampText: params.timestamps ? (await readFile(`${outBase}.srt`, "utf8").catch(() => "")).trim() : "",
      details: {
        backend: "whisper.cpp",
        unsupportedOptions: [params.wordTimestamps ? "wordTimestamps" : "", params.prompt ? "prompt" : ""].filter(Boolean),
      },
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function runPythonWhisper(command, model, audioPath, params) {
  if (isLikelyPath(model) && /\.pt$/i.test(model)) await assertFileExists(model, "Model file");
  const tempDir = await mkdtemp(join(os.tmpdir(), "pi-whisper-"));
  const stem = basename(audioPath, extname(audioPath));
  try {
    await execFileAsync(command, buildPythonWhisperArgs({
      model,
      audioPath,
      outputDir: tempDir,
      language: params.language,
      translate: params.translate,
      timestamps: params.timestamps,
      wordTimestamps: params.wordTimestamps,
      prompt: params.prompt,
    }), { timeout: DEFAULT_TIMEOUT_MS });

    return {
      text: (await readFile(join(tempDir, `${stem}.txt`), "utf8")).trim(),
      timestampText: params.timestamps ? (await readFile(join(tempDir, `${stem}.srt`), "utf8").catch(() => "")).trim() : "",
      details: {
        backend: "python-whisper",
        unsupportedOptions: [params.nThreads != null ? "nThreads" : ""].filter(Boolean),
      },
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function formatTranscript(text, timestampText) {
  if (!timestampText) return text || "(empty transcript)";
  return [text || "(empty transcript)", "", "Timestamps:", timestampText].join("\n");
}

async function findDefaultTestAudio() {
  const candidates = [
    "/usr/share/sounds/debian/samples/en-Wikipedia-Ignore_All_Rules.wav",
    "/usr/share/sounds/debian/samples/ar-Wikipedia-Five_Pillars.wav",
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  return undefined;
}

async function transcribe(ctx, params) {
  const audioPath = resolveUserPath(ctx.cwd, params.path);
  await assertFileExists(audioPath, "Audio file");

  const detected = await detectBackend();
  if (detected.error) throw new Error(detected.error);

  return withQueue(async () => {
    const result = detected.backend === "whisper.cpp"
      ? await runWhisperCpp(detected.command, detected.model, audioPath, params, detected.nThreads)
      : await runPythonWhisper(detected.command, detected.model, audioPath, params);

    return {
      content: [{ type: "text", text: formatTranscript(result.text, result.timestampText) }],
      details: {
        audioPath,
        backend: detected.backend,
        command: detected.command,
        model: detected.model,
        unsupportedOptions: result.details.unsupportedOptions,
      },
    };
  });
}

function modelLabel(model) {
  return isLikelyPath(model) ? `${basename(model)} — ${model}` : model;
}

async function statusText() {
  const detected = await detectBackend();
  if (detected.error) return detected.error;
  return [
    `backend: ${detected.backend}`,
    `command: ${detected.command}${detected.commandSource ? ` (${detected.commandSource})` : ""}`,
    `model: ${detected.model}${detected.modelSource ? ` (${detected.modelSource})` : ""}`,
    `threads: ${detected.nThreads ?? "auto"}`,
  ].join(" | ");
}

async function listModelsText() {
  const selected = await findSpeechModel();
  const models = await findSpeechModels();
  if (models.length === 0) {
    return "No Whisper models found. Download one, then use /whisper-model list or /whisper-model select.";
  }

  const lines = models.map((model, index) => {
    const marker = selected.model === model ? "*" : " ";
    return `${marker} ${index + 1}. ${modelLabel(model)}`;
  });

  if (selected.model && !models.includes(selected.model)) {
    lines.unshift(`* selected: ${selected.model}`);
  }
  return lines.join("\n");
}

async function selectModel(choice) {
  const stored = await readStoredConfig();
  await writeStoredConfig({ ...stored, model: choice });
}

async function clearSelectedModel() {
  const stored = await readStoredConfig();
  delete stored.model;
  await writeStoredConfig(stored);
}

async function whisperTestText(cwd, args) {
  const trimmed = (args || "").trim();
  const audioPath = trimmed ? resolveUserPath(cwd, trimmed) : await findDefaultTestAudio();
  if (!audioPath) {
    throw new Error("No default test audio found. Pass a file path, e.g. /whisper-transcribe ./sample.wav");
  }
  await assertFileExists(audioPath, "Audio file");

  const detected = await detectBackend();
  if (detected.error) throw new Error(detected.error);

  const result = await withQueue(async () => (
    detected.backend === "whisper.cpp"
      ? runWhisperCpp(detected.command, detected.model, audioPath, {}, detected.nThreads)
      : runPythonWhisper(detected.command, detected.model, audioPath, {})
  ));

  return [
    "whisper transcription ok",
    `backend: ${detected.backend}`,
    `audio: ${audioPath}`,
    `transcript: ${(result.text || "(empty transcript)").replace(/\s+/g, " ").trim()}`,
  ].join(" | ");
}

function whisperModelUsage() {
  return [
    "Usage:",
    "/whisper-model list",
    "/whisper-model select",
    "/whisper-model select 2",
    "/whisper-model select ./model.bin",
    "/whisper-model select base",
    "/whisper-model select auto",
  ].join("\n");
}

async function selectModelText(cwd, args, ctx) {
  const [subcommand = "", ...rest] = (args || "").trim().split(/\s+/).filter(Boolean);
  const value = rest.join(" ");

  if (!subcommand) return whisperModelUsage();
  if (subcommand === "list") return listModelsText();
  if (subcommand !== "select") throw new Error(whisperModelUsage());

  const models = await findSpeechModels();

  if (value === "auto" || value === "clear") {
    await clearSelectedModel();
    return "Cleared saved Whisper model. Auto-detection is active again.";
  }

  if (value) {
    const index = Number(value);
    const choice = Number.isInteger(index) && index >= 1 && index <= models.length
      ? models[index - 1]
      : isLikelyPath(value) ? resolveUserPath(cwd, value) : value;
    if (isLikelyPath(choice)) await assertFileExists(choice, "Model file");
    await selectModel(choice);
    return `Selected Whisper model: ${choice}`;
  }

  if (!ctx.hasUI) {
    throw new Error("Use /whisper-model select <number|path|auto>.");
  }
  if (models.length === 0) {
    throw new Error("No Whisper models found. Download one first.");
  }

  const selected = await findSpeechModel();
  const labels = models.map((model, index) => `${selected.model === model ? "* " : ""}${index + 1}. ${modelLabel(model)}`);
  const picked = await ctx.ui.select("Select Whisper model", labels);
  if (!picked) return "Whisper model selection cancelled.";

  const choice = models[labels.indexOf(picked)];
  await selectModel(choice);
  return `Selected Whisper model: ${choice}`;
}

export default function whisperExtension(pi) {
  pi.registerTool({
    name: TOOL_NAME,
    label: "Transcribe Audio",
    description: "Transcribe a local audio file with an installed Whisper backend.",
    promptSnippet: "Transcribe local audio files with an installed Whisper backend.",
    promptGuidelines: [
      "Use transcribe_audio when the user wants speech-to-text from a local audio or video file path.",
    ],
    parameters: Type.Object({
      path: Type.String({ description: "Path to the local audio file." }),
      language: Type.Optional(Type.String({ description: "Language code like en, de, zh. Omit for auto-detect." })),
      translate: Type.Optional(Type.Boolean({ description: "Translate speech to English." })),
      wordTimestamps: Type.Optional(Type.Boolean({ description: "Include word-level timestamps when supported." })),
      timestamps: Type.Optional(Type.Boolean({ description: "Append segment timestamps to the tool output when supported." })),
      nThreads: Type.Optional(Type.Number({ description: "Override thread count for one run when supported." })),
      prompt: Type.Optional(Type.String({ description: "Prompt text to steer transcription when supported." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return transcribe(ctx, params);
    },
  });

  pi.registerCommand(STATUS_COMMAND, {
    description: "Show detected Whisper backend, command, and model",
    handler: async (_args, ctx) => {
      const text = await statusText();
      ctx.ui.notify(text, text.startsWith("backend:") ? "info" : "error");
    },
  });

  pi.registerCommand(TEST_COMMAND, {
    description: "Run a quick local transcription, optionally with a file path",
    handler: async (args, ctx) => {
      try {
        ctx.ui.notify("Running whisper transcription...", "info");
        ctx.ui.notify(await whisperTestText(ctx.cwd, args), "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerCommand(MODEL_COMMAND, {
    description: "List or select the Whisper model to use",
    handler: async (args, ctx) => {
      try {
        const text = await selectModelText(ctx.cwd, args, ctx);
        ctx.ui.notify(text, text.startsWith("No Whisper models") ? "error" : "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
