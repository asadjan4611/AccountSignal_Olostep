# Demo video

The narrated walkthrough shown on the dashboard lives in `client/public/demo/`:

| File                            | What                                 |
| ------------------------------- | ------------------------------------ |
| `accountsignal-demo.mp4`        | 1:40, 1280×800, H.264 + AAC, ~3.9 MB |
| `accountsignal-demo.vtt`        | English captions (on by default)     |
| `accountsignal-demo-poster.jpg` | Poster frame                         |

## Re-recording it

Everything runs locally in demo mode (no Olostep key, no credits). The voice comes from Microsoft's
online neural TTS via [`edge-tts`](https://pypi.org/project/edge-tts/), so the narration text in
`script.json` is sent to that service.

```bash
# 1. Tools (outside the repo)
python3 -m venv .venv && .venv/bin/pip install edge-tts
npm i playwright-core   # uses your installed Google Chrome
# ffmpeg with libx264 must be on PATH

# 2. A fresh demo-mode server (production build)
npm run build
NODE_ENV=production SERVE_CLIENT=true PORT=5126 DATA_FILE=/tmp/rec.json OLOSTEP_API_KEY= node server/dist/index.js

# 3. From a working folder holding these four files:
python tts.py                              # narration per scene → audio/, durations.json
node record.mjs http://localhost:5126      # screen frames, timed to the narration
python3 build.py                           # → accountsignal-demo.mp4, .vtt, poster
```

Edit `script.json` to change what is said; each scene's on-screen actions are in `record.mjs`
and stretch to fit the length of its narration.
