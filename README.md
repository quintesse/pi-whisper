# pi-whisper-fast

Pi package that adds a `transcribe_audio` tool backed by [`whisper-fast`](https://github.com/whisperfast/whisper-fast).

## What it gives Pi

- `transcribe_audio` tool for local audio files
- `/whisper-fast-status` command for quick setup checks
- lazy model loading, reused for the session

## Install

From GitHub:

```bash
pi install git:github.com/quintesse/pi-whisper-fast
```

For local development:

```bash
pi install /absolute/path/to/pi-whisper-fast
```

Then set a local Whisper model path:

```bash
export PI_WHISPER_FAST_MODEL=/absolute/path/to/ggml-base.bin
# optional
export PI_WHISPER_FAST_GPU=0
export PI_WHISPER_FAST_THREADS=4
```

Reload Pi:

```text
/reload
```

## Usage

Ask Pi something like:

> Transcribe `./meeting.wav`

Or check the extension directly:

```text
/whisper-fast-status
```

## Tool parameters

`transcribe_audio` accepts:

- `path` - local audio path
- `language` - optional language code
- `translate` - translate to English
- `wordTimestamps` - request word timestamps
- `timestamps` - append segment timestamps to the tool output
- `nThreads` - override thread count for one run
- `prompt` - prompt text for the decoder

## Configuration

Environment variables:

- `PI_WHISPER_FAST_MODEL` - required model file path
- `PI_WHISPER_FAST_GPU` - `1|0`, `true|false`, `yes|no`
- `PI_WHISPER_FAST_THREADS` - non-negative integer

## Important platform note

`whisper-fast` is a native module. The Pi extension is portable, but the upstream `whisper-fast` package must publish a matching native binary for your platform.

On this repo's first WSL/Linux test, `whisper-fast@1.0.1` installed but failed to load because the package contents appeared to include only a Windows native binary. If you hit that too:

- run Pi on native Windows instead of WSL, or
- switch this package to a Linux-capable upstream build once one exists

The extension handles that failure lazily, so Pi still starts and `/whisper-fast-status` will report the load error.

## Develop

```bash
npm install
npm test
```

## License

MIT
