import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router";
import { ConfirmProvider, ErrorBoundary, ToastProvider } from "./components/common/feedback";
import { IconAlert, IconRefresh } from "./components/common/icons";
import { Layout, Page, PageSkeleton } from "./components/common/Layout";
import { Button, buttonClass } from "./components/common/ui";
import { ConnectionProvider } from "./hooks/useConnection";
import type { AppConfig } from "./lib/types";
import { AccountPage } from "./pages/AccountPage";
import { Dashboard } from "./pages/Dashboard";
import { IcpPage } from "./pages/IcpPage";
import { Preview } from "./pages/Preview";
import { Review } from "./pages/Review";
import { RunPage } from "./pages/RunPage";
import { Upload } from "./pages/Upload";
import { api, errorMessage } from "./services/api";

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function AppRoutes({ config }: { config: AppConfig }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <Routes>
        <Route path="/" element={<Dashboard config={config} />} />
        <Route path="/icp" element={<IcpPage />} />
        <Route path="/new" element={<Upload config={config} />} />
        <Route path="/new/:uploadId/preview" element={<Preview />} />
        <Route path="/new/:uploadId/review" element={<Review config={config} />} />
        <Route path="/runs/:runId" element={<RunPage />} />
        <Route path="/runs/:runId/accounts/:companyId" element={<AccountPage />} />
        <Route
          path="*"
          element={
            <Page title="Page not found" sub="That link doesn't point to anything here.">
              <Link to="/" className={buttonClass("primary")}>
                Go to the dashboard
              </Link>
            </Page>
          }
        />
      </Routes>
    </ErrorBoundary>
  );
}

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .config()
      .then(setConfig)
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  return (
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <ConnectionProvider enabled={config?.live_configured ?? false}>
            <ScrollToTop />
            <Layout>
              {config ? (
                <AppRoutes config={config} />
              ) : error ? (
                <div className="mx-auto max-w-lg px-4 py-24 text-center">
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-bad-soft text-bad">
                    <IconAlert className="size-5" />
                  </span>
                  <h1 className="mt-4 font-display text-2xl text-ink">Can't reach the API</h1>
                  <p className="mt-2 text-sm text-muted">
                    {error} Start it with <code className="text-ink">npm run dev</code> or{" "}
                    <code className="text-ink">pnpm dev</code>.
                  </p>
                  <Button
                    variant="primary"
                    className="mt-6"
                    loading={loading}
                    icon={<IconRefresh className="size-4" />}
                    onClick={load}
                  >
                    Try again
                  </Button>
                </div>
              ) : (
                <PageSkeleton />
              )}
            </Layout>
          </ConnectionProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
