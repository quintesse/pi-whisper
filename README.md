# pi-whisper

Pi package that adds a `transcribe_audio` tool backed by an existing local Whisper setup.

It prefers `whisper.cpp`, falls back to Python `whisper`, and does not depend on a fragile native Node binding.

## Install

From GitHub:

```bash
pi install git:github.com/quintesse/pi-whisper
```

For local development:

```bash
pi install /absolute/path/to/pi-whisper
```

Reload Pi:

```text
/reload
```

## Usage

Ask Pi something like:

> Transcribe `./meeting.wav`

Or check detection directly:

```text
/whisper-status
```

## What it detects

### Backends

- `whisper.cpp` via `whisper-cli`, `whisper.cpp`, or `main`
- Python `whisper`

### Common model locations

- `~/.cache/whisper`
- `~/.cache/whisper.cpp`
- `~/.cache/huggingface/hub`
- `~/.local/share/whisper`
- `~/Library/Application Support/whisper.cpp`
- `~/.pi/agent/models`
- `~/models`
- `~/Models`

## Configuration

Optional environment variables:

- `PI_WHISPER_COMMAND` - explicit transcription executable path or command name
- `PI_WHISPER_MODEL` - explicit model path, or Python Whisper model name like `base`
- `PI_WHISPER_MODEL_DIR` - extra directory to scan for models
- `PI_WHISPER_THREADS` - default thread count for `whisper.cpp`

Compatibility aliases from the Telegram PR also work:

- `WHISPER_COMMAND`
- `WHISPER_MODEL_DIR`

## Tool parameters

`transcribe_audio` accepts:

- `path` - local audio path
- `language` - optional language code
- `translate` - translate to English
- `wordTimestamps` - backend dependent
- `timestamps` - append subtitle-style timestamps when available
- `nThreads` - override thread count for one run
- `prompt` - backend dependent

## Notes

- `whisper.cpp` is the preferred backend.
- Some options depend on the backend actually found.
- If nothing is detected, `/whisper-status` tells you what is missing instead of breaking Pi startup.

## Develop

```bash
npm install
npm test
```

## License

MIT
