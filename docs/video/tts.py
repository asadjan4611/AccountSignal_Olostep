import json, os, subprocess, sys
scenes = json.load(open("script.json"))
dur = {}
for s in scenes:
    mp3, srt = f"audio/{s['id']}.mp3", f"audio/{s['id']}.srt"
    for attempt in range(4):
        if os.path.exists(mp3) and os.path.getsize(mp3) > 1000 and os.path.getsize(srt) > 0:
            break
        try:
            subprocess.run([".venv/bin/edge-tts", "--voice", "en-US-AndrewNeural", "--rate", "+4%",
                            "--text", s["text"], "--write-media", mp3, "--write-subtitles", srt],
                           check=True, timeout=45)
        except Exception as e:
            print(s["id"], "retry", attempt, e, flush=True)
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", mp3], capture_output=True, text=True, check=True)
    dur[s["id"]] = float(out.stdout.strip())
    print(s["id"], round(dur[s["id"]], 1), flush=True)
json.dump(dur, open("durations.json", "w"), indent=2)
print("total", round(sum(dur.values()), 1))
