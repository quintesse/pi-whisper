import test from "node:test";
import assert from "node:assert/strict";
import {
  backendForModel,
  buildPythonWhisperArgs,
  buildWhisperCppArgs,
  formatBackendFailure,
  needsConversion,
  readConfig,
  resolveUserPath,
  scoreSpeechModel,
} from "../extensions/whisper.js";

test("readConfig normalizes env", () => {
  const config = readConfig({
    PI_WHISPER_COMMAND: "whisper-cli",
    PI_WHISPER_MODEL: "~/models/ggml-base.bin",
    PI_WHISPER_THREADS: "4",
  });

  assert.equal(config.command, "whisper-cli");
  assert.match(config.model, /models[\\/]ggml-base\.bin$/);
  assert.equal(config.nThreads, 4);
});

test("backendForModel prefers whisper.cpp for ggml and gguf", () => {
  assert.equal(backendForModel("/tmp/ggml-base.bin"), "whisper.cpp");
  assert.equal(backendForModel("/tmp/model.gguf"), "whisper.cpp");
  assert.equal(backendForModel("/tmp/base.pt"), "python-whisper");
  assert.equal(backendForModel("base"), "python-whisper");
});

test("scoreSpeechModel favors whisper-ish names", () => {
  assert.ok(scoreSpeechModel("/tmp/ggml-base.bin") > scoreSpeechModel("/tmp/model.bin"));
});

test("resolveUserPath resolves relative paths from cwd", () => {
  assert.equal(resolveUserPath("/tmp/project", "audio.wav"), "/tmp/project/audio.wav");
});

test("buildWhisperCppArgs keeps to boring stable flags", () => {
  assert.deepEqual(buildWhisperCppArgs({
    modelPath: "/models/ggml-base.bin",
    audioPath: "/tmp/audio.wav",
    outBase: "/tmp/out/transcript",
    language: "en",
    translate: true,
    timestamps: true,
    nThreads: 4,
  }), [
    "-m", "/models/ggml-base.bin",
    "-f", "/tmp/audio.wav",
    "-np",
    "-of", "/tmp/out/transcript",
    "-otxt",
    "-osrt",
    "-l", "en",
    "-tr",
    "-t", "4",
  ]);

  assert.deepEqual(buildWhisperCppArgs({
    modelPath: "/models/ggml-base.bin",
    audioPath: "/tmp/audio.wav",
    outBase: "/tmp/out/transcript",
    nThreads: 0,
  }), [
    "-m", "/models/ggml-base.bin",
    "-f", "/tmp/audio.wav",
    "-np",
    "-of", "/tmp/out/transcript",
    "-otxt",
    "-l", "auto",
  ]);
});

test("buildPythonWhisperArgs uses model name and writes outputs", () => {
  assert.deepEqual(buildPythonWhisperArgs({
    model: "/models/base.pt",
    audioPath: "/tmp/audio.wav",
    outputDir: "/tmp/out",
    language: "de",
    translate: true,
    timestamps: true,
    wordTimestamps: true,
    prompt: "names are Alice and Bob",
  }), [
    "/tmp/audio.wav",
    "--model", "base",
    "--output_format", "all",
    "--output_dir", "/tmp/out",
    "--fp16", "False",
    "--language", "de",
    "--task", "translate",
    "--word_timestamps", "True",
    "--initial_prompt", "names are Alice and Bob",
  ]);
});

test("formatBackendFailure includes stderr context", () => {
  const message = formatBackendFailure("whisper.cpp", "transcribe audio", {
    code: 1,
    stderr: "failed to read audio file",
  }, {
    audioPath: "/tmp/audio.ogg",
    model: "/models/ggml-base.bin",
  });

  assert.match(message, /whisper\.cpp failed to transcribe audio/);
  assert.match(message, /audio: \/tmp\/audio\.ogg/);
  assert.match(message, /model: \/models\/ggml-base\.bin/);
  assert.match(message, /stderr: failed to read audio file/);
});

test("needsConversion detects non-WAV files", () => {
  assert.strictEqual(needsConversion("/path/to/audio.wav"), false);
  assert.strictEqual(needsConversion("/path/to/audio.WAV"), false);
  assert.strictEqual(needsConversion("/path/to/audio.ogg"), true);
  assert.strictEqual(needsConversion("/path/to/audio.mp3"), true);
  assert.strictEqual(needsConversion("/path/to/audio.flac"), true);
});
