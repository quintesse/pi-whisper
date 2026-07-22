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

## Quick setup

### Option 1: Ask Pi to set it up for you

If you have no Whisper backend installed yet:

```text
Set up Whisper for me
```

Pi will use the bundled skill to install Python Whisper, ffmpeg, and configure everything automatically.

### Option 2: Manual backend setup

See the [Backend setup](#backend-setup) section below for manual installation instructions.

## Usage

Ask Pi something like:

> Transcribe `./meeting.wav`

Or check detection directly:

```text
/whisper-status
```

Or run a quick transcription smoke test:

```text
/whisper-transcribe
```

To manage models without environment variables:

```text
/whisper-model list
/whisper-model select
/whisper-model clear
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

Pick one backend setup. `whisper.cpp` is the recommended default; Python `whisper` is the portable fallback.

### Quickest path by platform

- **macOS:** use `whisper.cpp` via Homebrew
- **Ubuntu / Debian / WSL:** install the distro `whisper.cpp` package when available
- **Windows:** use the prebuilt `whisper.cpp` zip
- **Any platform with Python already set up:** use Python `whisper` via `pipx`

### `whisper.cpp` setup

#### macOS via Homebrew

```bash
brew install whisper-cpp
mkdir -p ~/models
curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin -o ~/models/ggml-base.bin
export PI_WHISPER_COMMAND="$(command -v whisper-cli)"
export PI_WHISPER_MODEL="$HOME/models/ggml-base.bin"
```

#### Ubuntu / Debian / WSL via `apt`

```bash
sudo apt update
sudo apt install -y whisper.cpp
mkdir -p "$HOME/models"
curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin -o "$HOME/models/ggml-base.bin"
export PI_WHISPER_COMMAND="$(command -v whisper-cli)"
export PI_WHISPER_MODEL="$HOME/models/ggml-base.bin"
```

If your distro does not package `whisper.cpp` yet, fall back to the upstream prebuilt release tarball.

#### Windows via upstream prebuilt zip

1. Download `whisper-bin-x64.zip` from the latest `whisper.cpp` release:
   `https://github.com/ggml-org/whisper.cpp/releases/latest`
2. Unzip it somewhere like `C:\Tools\whisper.cpp`
3. Download a model such as `ggml-base.bin` from:
   `https://huggingface.co/ggerganov/whisper.cpp/tree/main`
4. Set:

```powershell
$env:PI_WHISPER_COMMAND="C:\Tools\whisper.cpp\build\bin\whisper-cli.exe"
$env:PI_WHISPER_MODEL="C:\Tools\whisper.cpp\models\ggml-base.bin"
```

### Python `whisper` setup

This is the most portable fallback. You also need `ffmpeg`.

#### macOS

```bash
brew install ffmpeg pipx
pipx install openai-whisper
export PI_WHISPER_COMMAND="$(command -v whisper)"
export PI_WHISPER_MODEL=base
```

#### Ubuntu / Debian / WSL

```bash
sudo apt update
sudo apt install -y ffmpeg pipx
pipx install openai-whisper
export PI_WHISPER_COMMAND="$HOME/.local/bin/whisper"
export PI_WHISPER_MODEL=base
```

#### Windows

Install Python and ffmpeg however you prefer, then:

```powershell
py -m pip install -U openai-whisper
$env:PI_WHISPER_COMMAND="whisper"
$env:PI_WHISPER_MODEL="base"
```

To verify either backend:

```text
/whisper-status
/whisper-transcribe
```

## Model selection

If you do not want to set `PI_WHISPER_MODEL`, use:

```text
/whisper-model list               # list detected local models
/whisper-model select             # pick one interactively
/whisper-model select 2           # pick model number 2
/whisper-model select /path/to/model.bin
/whisper-model clear              # clear saved selection and go back to auto-detect
```

The selected model is saved in `~/.pi/agent/whisper.json`.
Environment variables act as defaults only until that config file exists; after that, the saved config takes precedence.

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
