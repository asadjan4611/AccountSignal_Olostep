import { Link } from "react-router";
import { IconCheck } from "./icons";

const STEPS = ["Ideal customer", "Upload", "Preview", "Review & run"] as const;

/** New-analysis stepper. Completed steps link back when `links` gives a target. */
export function Steps({
  current,
  links = {},
}: {
  current: 0 | 1 | 2 | 3;
  links?: Partial<Record<0 | 1 | 2, string>>;
}) {
  return (
    <ol
      className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm"
      aria-label="New analysis steps"
    >
      {STEPS.map((label, i) => {
        const done = i < current;
        const href = done ? links[i as 0 | 1 | 2] : undefined;
        const inner = (
          <>
            <span
              className={`grid size-6 place-items-center rounded-full text-xs transition ${
                done
                  ? "bg-brand text-white"
                  : i === current
                    ? "bg-brand text-white ring-4 ring-brand/15"
                    : "border border-line-strong bg-white text-muted"
              }`}
            >
              {done ? <IconCheck className="size-3.5" /> : i + 1}
            </span>
            <span className={i === current ? "text-ink" : done ? "text-ink-2" : "text-muted"}>
              {label}
            </span>
          </>
        );
        return (
          <li
            key={label}
            className="flex items-center gap-2"
            aria-current={i === current ? "step" : undefined}
          >
            {href ? (
              <Link to={href} className="flex items-center gap-2 rounded-full hover:opacity-80">
                {inner}
              </Link>
            ) : (
              <span className="flex items-center gap-2">{inner}</span>
            )}
            {i < STEPS.length - 1 && (
              <span
                className={`mx-1 h-px w-5 sm:w-8 ${done ? "bg-brand" : "bg-line-strong"}`}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
