"use client";
// Last-resort error page when the root layout itself fails. Renders its own <html>.
import "@fontsource-variable/inter";
import "./globals.css";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-surface-alt px-4 antialiased">
        <div className="w-full max-w-md rounded-card border border-line bg-white p-6 text-center shadow-card">
          <h1 className="text-lg font-bold tracking-tight text-ink">Legiit Overviews hit an error</h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Reload the page. If it keeps happening, email help@legiit.com.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-5 inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-strong"
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
