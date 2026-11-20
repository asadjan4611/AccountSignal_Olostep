import { useRef, useState } from "react";
import { IconAlert, IconPlay } from "./common/icons";

const SRC = "/demo/accountsignal-demo.mp4";
const POSTER = "/demo/accountsignal-demo-poster.jpg";
const CAPTIONS = "/demo/accountsignal-demo.vtt";

/**
 * The narrated product walkthrough (1:40). Nothing downloads until the viewer presses play
 * (preload="none"), captions are on by default, and a failed load shows a clear message.
 */
export function DemoVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);

  function play() {
    setStarted(true);
    const v = ref.current;
    if (!v) return;
    void v.play().catch(() => {
      // Autoplay with sound can be refused; the native controls are now visible instead.
    });
  }

  return (
    <figure className="overflow-hidden rounded-2xl border border-white/80 bg-white/85 shadow-(--shadow-pop) backdrop-blur">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
        </span>
        <figcaption className="text-xs text-muted">How AccountSignal works</figcaption>
        <span className="text-[11px] text-faint tabular-nums">1:40 · voice</span>
      </div>
      <div className="relative aspect-[16/10] bg-ink">
        <video
          ref={ref}
          className="absolute inset-0 size-full"
          poster={POSTER}
          preload="none"
          playsInline
          controls={started}
          onPlay={() => setStarted(true)}
          onError={() => setFailed(true)}
          aria-label="AccountSignal demo video with voice-over"
        >
          <source src={SRC} type="video/mp4" onError={() => setFailed(true)} />
          <track kind="captions" src={CAPTIONS} srcLang="en" label="English" default />
        </video>

        {!started && !failed && (
          <button
            type="button"
            onClick={play}
            className="group absolute inset-0 grid place-items-center bg-gradient-to-t from-ink/55 via-ink/10 to-transparent focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand"
            aria-label="Play the demo video (1 minute 40, with voice-over)"
          >
            <span className="relative grid size-16 place-items-center rounded-full bg-white text-brand shadow-(--shadow-pop) transition group-hover:scale-110">
              <span
                className="absolute inset-0 animate-ping rounded-full bg-white/50"
                aria-hidden="true"
              />
              <IconPlay className="relative ml-1 size-6" />
            </span>
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-between px-4 py-3 text-left text-white">
              <span>
                <span className="block text-sm sm:text-[15px]">Watch the 100-second tour</span>
                <span className="hidden text-xs text-white/75 sm:block">
                  ICP → upload → research → ranked accounts
                </span>
              </span>
              <span className="hidden rounded-full bg-white/15 px-2.5 py-1 text-xs backdrop-blur sm:inline">
                Sound on
              </span>
            </span>
          </button>
        )}

        {failed && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/85">
            <span>
              <IconAlert className="mx-auto mb-2 size-5" />
              The video couldn't load.{" "}
              <a href={SRC} className="underline">
                Open it directly
              </a>
              .
            </span>
          </div>
        )}
      </div>
    </figure>
  );
}
