import json, re, subprocess
m = json.load(open("marks.json"))
lead, total, marks = m["lead"], m["total"], m["marks"]

# Captions: shift each scene's sentence cues to where the scene starts in the video.
def ts(sec):
    sec = max(0.0, sec)
    h, r = divmod(sec, 3600); mi, s = divmod(r, 60)
    return f"{int(h):02d}:{int(mi):02d}:{s:06.3f}"
cues = ["WEBVTT", ""]
for mk in marks:
    off = mk["at"] - lead + 0.15
    srt = open(f"audio/{mk['id']}.srt").read()
    for a, b, text in re.findall(r"(\d+:\d+:\d+,\d+) --> (\d+:\d+:\d+,\d+)\n(.+?)(?:\n\n|\n?$)", srt, re.S):
        sec = lambda t: sum(float(x) * k for x, k in zip(t.replace(",", ".").split(":"), (3600, 60, 1)))
        cues += [f"{ts(sec(a) + off)} --> {ts(sec(b) + off)}", " ".join(text.split()), ""]
open("accountsignal-demo.vtt", "w").write("\n".join(cues))

# Audio: each narration clip delayed to its scene start, mixed onto one track.
inputs, filters = [], []
for i, mk in enumerate(marks):
    inputs += ["-i", f"audio/{mk['id']}.mp3"]
    d = max(0, int((mk["at"] - lead) * 1000) + 150)
    filters.append(f"[{i+1}:a]adelay={d}|{d}[a{i}]")
mix = "".join(f"[a{i}]" for i in range(len(marks)))
filters.append(f"{mix}amix=inputs={len(marks)}:normalize=0,apad,afade=t=out:st={total-1.2:.2f}:d=1[aout]")

subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", "frames.txt", *inputs,
    "-filter_complex", ";".join(filters) + ";[0:v]fps=30,format=yuv420p,fade=t=in:st=0:d=0.5[vout]",
    "-map", "[vout]", "-map", "[aout]", "-t", f"{total:.2f}",
    "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-tune", "stillimage", "-profile:v", "high",
    "-c:a", "aac", "-b:a", "96k", "-ac", "1", "-movflags", "+faststart",
    "accountsignal-demo.mp4"], check=True)

# Poster: the ranked results with the priority matrix.
res = next(mk for mk in marks if mk["id"] == "results")
subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{res['at'] - lead + 0.4:.2f}", "-i", "accountsignal-demo.mp4",
    "-frames:v", "1", "-q:v", "4", "accountsignal-demo-poster.jpg"], check=True)
print("ok")
