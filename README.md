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

## Backend setup

## Option 1: `whisper.cpp` recommended

### Linux

```bash
git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp
cmake -B build
cmake --build build -j
./models/download-ggml-model.sh base
```

Then point `pi-whisper` at it:

```bash
export PI_WHISPER_COMMAND="$PWD/build/bin/whisper-cli"
export PI_WHISPER_MODEL="$PWD/models/ggml-base.bin"
```

### macOS

```bash
brew install whisper-cpp
mkdir -p ~/models
curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin -o ~/models/ggml-base.bin
export PI_WHISPER_COMMAND="$(command -v whisper-cli)"
export PI_WHISPER_MODEL="$HOME/models/ggml-base.bin"
```

### Windows

Build or download a `whisper.cpp` binary, then set:

```powershell
$env:PI_WHISPER_COMMAND="C:\path\to\whisper-cli.exe"
$env:PI_WHISPER_MODEL="C:\path\to\ggml-base.bin"
```

## Option 2: Python `whisper`

```bash
python3 -m pip install -U openai-whisper
whisper --model base sample.wav
```

Then either let `pi-whisper` auto-detect the cached model, or pin it explicitly:

```bash
export PI_WHISPER_COMMAND="$(command -v whisper)"
export PI_WHISPER_MODEL=base
```

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
