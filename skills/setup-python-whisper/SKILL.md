# Setup Python Whisper Backend

Install Python-based OpenAI Whisper as the transcription backend for pi-whisper.

## When to use this skill

- User says: "set up Whisper", "install Whisper", "configure Whisper backend", "I need Whisper to work"
- `/whisper-status` reports "No Whisper backend found"
- User wants local transcription without compiling C++ code

## What this installs

- **uv**: Fast Python package installer
- **openai-whisper**: Local speech-to-text model (Python implementation)
- **ffmpeg**: Audio conversion (static binary, no system packages needed)
- Symlinks in `~/.pi/agent/bin` so Pi can find them
- Config file `~/.pi/agent/whisper.json` pointing to the Python backend

## Installation steps

### 1. Install uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

This installs `uv` to `~/.local/bin/uv`.

### 2. Install openai-whisper with Python 3.12

```bash
~/.local/bin/uv tool install --python 3.12 openai-whisper
```

This:
- Downloads Python 3.12 (managed by uv, no system pollution)
- Installs `openai-whisper` and its dependencies
- Creates `~/.local/bin/whisper` command

### 3. Install static ffmpeg

```bash
mkdir -p ~/.local/opt ~/.local/bin
cd ~/.local/opt
curl -L -o ffmpeg-release-amd64-static.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
mkdir -p ffmpeg-static
tar -xJf ffmpeg-release-amd64-static.tar.xz -C ffmpeg-static --strip-components=1
ln -sf ~/.local/opt/ffmpeg-static/ffmpeg ~/.local/bin/ffmpeg
ln -sf ~/.local/opt/ffmpeg-static/ffprobe ~/.local/bin/ffprobe
```

Verify:
```bash
~/.local/bin/ffmpeg -version
```

### 4. Create symlinks in ~/.pi/agent/bin

This ensures Pi's subprocess environment can find the tools:

```bash
mkdir -p ~/.pi/agent/bin
ln -sf ~/.local/bin/whisper ~/.pi/agent/bin/whisper
ln -sf ~/.local/bin/ffmpeg ~/.pi/agent/bin/ffmpeg
ln -sf ~/.local/bin/ffprobe ~/.pi/agent/bin/ffprobe
```

### 5. Write config file

```bash
cat > ~/.pi/agent/whisper.json <<'EOF'
{
  "command": "/home/$USER/.pi/agent/bin/whisper",
  "model": "base"
}
EOF
```

Replace `$USER` with the actual username, or use the full path directly.

### 6. Test the installation

```bash
PATH="~/.pi/agent/bin:$PATH" ~/.pi/agent/bin/whisper --model base <some-audio-file.wav> --output_format txt --output_dir /tmp/whisper-test
```

First run will download the base model (~150MB) to `~/.cache/whisper/base.pt`.

### 7. Verify in Pi

```text
/reload
/whisper-status
```

Should show:
```
backend: python-whisper | command: /home/<user>/.pi/agent/bin/whisper | model: base (env)
```

Then test transcription:
```text
/whisper-transcribe <path-to-audio-file>
```

## Model selection

After setup, list and select models:

```text
/whisper-model list
/whisper-model select <number-or-path>
```

Or edit `~/.pi/agent/whisper.json` to use a model name (`tiny`, `base`, `small`, `medium`, `large`) or a `.pt` file path.

## Troubleshooting

**"No such file or directory: 'ffmpeg'"**
- Ensure symlinks in `~/.pi/agent/bin` exist
- Verify ffmpeg works: `~/.pi/agent/bin/ffmpeg -version`

**"ENOENT: no such file or directory, open '/tmp/pi-whisper-xxxxx/file.txt'"**
- Old error from before the PATH fix
- Run `/reload` to pick up the latest pi-whisper code

**"No Whisper backend found"**
- Check `~/.pi/agent/whisper.json` exists and has correct paths
- Verify `~/.pi/agent/bin/whisper` is executable
- Run `/whisper-status` for diagnostic details

## Notes

- This uses **local** transcription — no API calls, no API keys, no cost per transcription
- Models are cached in `~/.cache/whisper/` after first download
- The `base` model is ~150MB; larger models (up to ~3GB for `large`) offer better accuracy
- CPU transcription is slow; GPU support requires PyTorch with CUDA (not covered here)

## Platform notes

- **Linux/WSL**: Instructions above work as-is
- **macOS**: Same, but ffmpeg URL may differ (use homebrew or johnvansickle's macOS build)
- **Windows**: Use WSL or adjust paths for Windows (backslashes, different ffmpeg source)

## Alternative: whisper.cpp

If you prefer a C++ backend:

```bash
# Debian/Ubuntu
sudo apt install whisper.cpp

# Download model
mkdir -p ~/models
curl -L -o ~/models/ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin

# Configure
echo '{"command": "whisper-cli", "model": "~/models/ggml-base.bin"}' > ~/.pi/agent/whisper.json
```

See the main README for more details.
