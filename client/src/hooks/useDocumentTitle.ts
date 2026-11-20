import { useEffect } from "react";

export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · AccountSignal` : "AccountSignal";
  }, [title]);
}
