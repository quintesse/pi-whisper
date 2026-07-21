import test from "node:test";
import assert from "node:assert/strict";
import { parseBool, readConfig, resolveUserPath } from "../extensions/whisper-fast.js";

test("parseBool accepts common values", () => {
  assert.equal(parseBool("1"), true);
  assert.equal(parseBool("true"), true);
  assert.equal(parseBool("no", true), false);
  assert.equal(parseBool(undefined, true), true);
});

test("readConfig expands env config", () => {
  const config = readConfig(
    {
      PI_WHISPER_FAST_MODEL: "~/models/ggml-base.bin",
      PI_WHISPER_FAST_GPU: "yes",
      PI_WHISPER_FAST_THREADS: "4",
    },
    { allowMissingModel: false },
  );

  assert.match(config.modelPath, /models[\\/]ggml-base\.bin$/);
  assert.equal(config.useGpu, true);
  assert.equal(config.nThreads, 4);
});

test("resolveUserPath resolves relative paths from cwd", () => {
  assert.equal(
    resolveUserPath("/tmp/project", "audio.wav"),
    "/tmp/project/audio.wav",
  );
});
