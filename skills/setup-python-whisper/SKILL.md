---
name: setup-whisper
description: Automatically install and configure Whisper (whisper.cpp or Python) for local audio transcription. Detects platform, recommends best option, guides installation of chosen backend. Use when no Whisper backend exists, /whisper-status shows nothing found, or user requests Whisper setup.
license: MIT
---

# Setup Whisper Backend

Install and configure a local Whisper transcription backend for pi-whisper.

## When to use this skill

- User says: "set up Whisper", "install Whisper", "configure Whisper backend", "I need Whisper to work"
- `/whisper-status` reports "No Whisper backend found"
- User wants local transcription

## Workflow

1. **Detect platform and existing tools**
2. **Recommend best option** (whisper.cpp or Python whisper)
3. **Let user choose**
4. **Guide installation**

## Step 1: Detection

Run these checks:

```bash
# Platform
uname -s  # Linux, Darwin (macOS), or MINGW*/MSYS* (Windows)

# Package managers
command -v brew       # macOS Homebrew
command -v apt        # Debian/Ubuntu
command -v pipx       # Python tool installer
command -v python3    # Python
command -v ffmpeg     # Audio converter
```

## Step 2: Recommendation

**Priority: use what's already installed.**

### Recommend **Python whisper** when:
- `python3` or `pipx` already installed
- **Fewer new dependencies = faster setup**
- Most portable, works everywhere

### Recommend **whisper.cpp** when:
- No Python installed
- macOS with Homebrew / Ubuntu with apt available
- User specifically wants the faster C++ backend

### Present both options clearly
Ask: "I recommend [X] (uses existing tools), but you can choose either. Which do you want?"

## Step 3: Installation Paths

### Option A: whisper.cpp

#### macOS via Homebrew

```bash
# Install whisper.cpp
brew install whisper-cpp

# Download base model
mkdir -p ~/models
curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin -o ~/models/ggml-base.bin

# Configure Pi
cat > ~/.pi/agent/whisper.json <<EOF
{
  "command": "$(command -v whisper-cli)",
  "model": "$HOME/models/ggml-base.bin"
}
EOF

# Test
/reload
/whisper-status
```

#### Ubuntu/Debian via apt

```bash
# Install whisper.cpp and ffmpeg
sudo apt update
sudo apt install -y whisper.cpp ffmpeg

# Download base model
mkdir -p ~/models
curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin -o ~/models/ggml-base.bin

# Configure Pi
cat > ~/.pi/agent/whisper.json <<EOF
{
  "command": "$(command -v whisper-cli)",
  "model": "$HOME/models/ggml-base.bin"
}
EOF

# Test
/reload
/whisper-status
```

#### Windows via prebuilt release

```powershell
# Download latest whisper-bin-x64.zip from
# https://github.com/ggml-org/whisper.cpp/releases/latest
# Unzip to C:\Tools\whisper.cpp

# Download model
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\models"
Invoke-WebRequest -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" -OutFile "$env:USERPROFILE\models\ggml-base.bin"

# Configure Pi
@"
{
  "command": "C:\\Tools\\whisper.cpp\\build\\bin\\whisper-cli.exe",
  "model": "$env:USERPROFILE\\models\\ggml-base.bin"
}
"@ | Out-File -FilePath "$env:USERPROFILE\.pi\agent\whisper.json" -Encoding utf8

# Test
/reload
/whisper-status
```

#### Linux/WSL via prebuilt tarball

If your distro doesn't package whisper.cpp yet:

```bash
# Download latest from https://github.com/ggml-org/whisper.cpp/releases/latest
# Look for whisper-bin-Linux.tar.gz or similar

mkdir -p ~/.local/opt
cd ~/.local/opt
# Extract tarball here, adjust path as needed
# tar -xzf whisper-bin-Linux.tar.gz

# Download model
mkdir -p ~/models
curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin -o ~/models/ggml-base.bin

# Configure (adjust path to whisper-cli)
cat > ~/.pi/agent/whisper.json <<EOF
{
  "command": "$HOME/.local/opt/whisper.cpp/whisper-cli",
  "model": "$HOME/models/ggml-base.bin"
}
EOF
```

### Option B: Python whisper

#### macOS

```bash
# Install ffmpeg and pipx
brew install ffmpeg pipx

# Install openai-whisper
pipx install openai-whisper

# Configure Pi
cat > ~/.pi/agent/whisper.json <<EOF
{
  "command": "$(command -v whisper)",
  "model": "base"
}
EOF

# Test
/reload
/whisper-status
```

#### Ubuntu/Debian/WSL

```bash
# Install ffmpeg and pipx
sudo apt update
sudo apt install -y ffmpeg pipx

# Install openai-whisper
pipx install openai-whisper

# Configure Pi
cat > ~/.pi/agent/whisper.json <<EOF
{
  "command": "$HOME/.local/bin/whisper",
  "model": "base"
}
EOF

# Test
/reload
/whisper-status
```

#### Windows

```powershell
# Install Python and ffmpeg first (via official installers or chocolatey)

# Install openai-whisper
py -m pip install -U openai-whisper

# Configure Pi
@"
{
  "command": "whisper",
  "model": "base"
}
"@ | Out-File -FilePath "$env:USERPROFILE\.pi\agent\whisper.json" -Encoding utf8

# Test
/reload
/whisper-status
```

#### Portable install without system packages (Linux/WSL/macOS)

Uses `uv` to avoid system Python pollution:

```bash
# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install openai-whisper with managed Python
~/.local/bin/uv tool install --python 3.12 openai-whisper

# Install static ffmpeg (Linux/WSL only)
mkdir -p ~/.local/opt ~/.local/bin
cd ~/.local/opt
curl -L -o ffmpeg-release-amd64-static.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
mkdir -p ffmpeg-static
tar -xJf ffmpeg-release-amd64-static.tar.xz -C ffmpeg-static --strip-components=1
ln -sf ~/.local/opt/ffmpeg-static/ffmpeg ~/.local/bin/ffmpeg
ln -sf ~/.local/opt/ffmpeg-static/ffprobe ~/.local/bin/ffprobe

# For macOS: brew install ffmpeg instead

# Configure Pi
cat > ~/.pi/agent/whisper.json <<EOF
{
  "command": "$HOME/.local/bin/whisper",
  "model": "base"
}
EOF

# Test
/reload
/whisper-status
```

## Step 4: Verification

After installation:

```text
/reload
/whisper-status
```

Should show detected backend and model.

Test transcription:
```text
/whisper-transcribe
```

## Model management

After setup, manage models:

```text
/whisper-model list               # List detected models
/whisper-model select             # Interactive selection
/whisper-model select 2           # Select by number
/whisper-model select /path/to/model
/whisper-model clear              # Reset to auto-detect
```

### Model sizes and quality

| Model | Size (whisper.cpp) | Size (Python) | Quality |
|-------|-------------------|---------------|---------|
| tiny  | ~75 MB            | ~75 MB        | Fast, basic accuracy |
| base  | ~150 MB           | ~150 MB       | Good balance (recommended) |
| small | ~500 MB           | ~500 MB       | Better accuracy |
| medium | ~1.5 GB          | ~1.5 GB       | High accuracy |
| large | ~3 GB             | ~3 GB         | Best accuracy, slowest |

Download additional models:

**whisper.cpp:**
```bash
curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin -o ~/models/ggml-small.bin
```

**Python whisper:** Models auto-download on first use when you specify the name (e.g., `"model": "small"`).

## Troubleshooting

### "No Whisper backend found"
- Check `~/.pi/agent/whisper.json` exists
- Verify the command path is correct: `cat ~/.pi/agent/whisper.json`
- Test the command directly: `whisper-cli --help` or `whisper --help`
- Run `/whisper-status` for diagnostics

### whisper.cpp: "No such file or directory: 'ffmpeg'"
- Install ffmpeg: `brew install ffmpeg` or `sudo apt install ffmpeg`
- whisper.cpp needs ffmpeg for non-WAV audio formats

### Python whisper: slow first run
- First transcription downloads the model (~150MB for base)
- Cached in `~/.cache/whisper/` for subsequent runs

### Wrong model loaded
- Use `/whisper-model list` and `/whisper-model select`
- Or edit `~/.pi/agent/whisper.json` directly

## Notes

- **whisper.cpp is faster** and recommended when available
- **Python whisper is more portable** across platforms
- Both use **local models**, no API calls, no cost per transcription
- Models are reusable between backends (with format conversion)
- First transcription may be slow while downloading the model
- CPU transcription works but is slow; GPU support varies by platform

## References

- [pi-whisper README](../../../README.md)
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
- [openai-whisper](https://github.com/openai/whisper)
