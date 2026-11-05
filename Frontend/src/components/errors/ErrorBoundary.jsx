import { Component } from "react";
import { AlertTriangle, RefreshCw, Copy, Check, DownloadCloud } from "lucide-react";

/**
 * Robust React Error Boundary with App, Route, and Widget level support.
 * Catches runtime rendering exceptions, reports to logger, handles Vite
 * dynamic chunk reload failures, and prevents widget crashes from blanking screens.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
      isChunkError: false,
    };
  }

  static getDerivedStateFromError(error) {
    const isChunkError =
      error?.message?.includes("Failed to fetch dynamically imported module") ||
      error?.message?.includes("Importing a module script failed") ||
      error?.name === "ChunkLoadError";

    return { hasError: true, error, isChunkError };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log to console in DEV, could send to reporting endpoint in prod
    console.error(`[ErrorBoundary:${this.props.level || "app"}]`, error, errorInfo);
  }

  handleCopyDetails = () => {
    const details = `Error: ${this.state.error?.message || "Unknown"}\nStack: ${this.state.error?.stack || "N/A"}\nComponent Stack: ${this.state.errorInfo?.componentStack || "N/A"}\nURL: ${window.location.href}\nTime: ${new Date().toISOString()}`;
    navigator.clipboard.writeText(details);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { level = "app", title, fallback } = this.props;
    const { isChunkError, copied, error } = this.state;

    // Custom fallback provided by parent
    if (typeof fallback === "function") {
      return fallback({ error, reset: this.handleReset });
    } else if (fallback) {
      return fallback;
    }

    // 1. Dynamic Vite Chunk-Loading Error (Deploy update)
    if (isChunkError) {
      return (
        <div className="min-h-[200px] flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-lg">
            <div className="w-10 h-10 mx-auto rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
              <DownloadCloud className="w-5 h-5 animate-bounce" />
            </div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-1">
              New Version Available
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-4">
              A fresh update has been deployed. Please reload the page to load the latest components.
            </p>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer"
            >
              Update and Reload
            </button>
          </div>
        </div>
      );
    }

    // 2. Widget Level (Cards, Charts, Tables)
    if (level === "widget") {
      return (
        <div
          role="alert"
          aria-live="polite"
          className="p-5 rounded-2xl border border-dashed border-red-300 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 text-center flex flex-col items-center justify-center min-h-[140px]"
        >
          <AlertTriangle className="w-5 h-5 text-red-500 mb-2" />
          <h4 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
            {title || "Unable to display this widget"}
          </h4>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-3 max-w-xs">
            An error occurred while loading this section. Other parts of the app remain unaffected.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={this.handleReset}
              className="px-3 py-1.5 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 rounded-lg flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    // 3. Route or App Level
    return (
      <div
        role="alert"
        className="min-h-[60vh] flex items-center justify-center p-6 text-center"
      >
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-xl">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1">
            {title || "Something went wrong"}
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">
            An unexpected error occurred while rendering this view. You can reload the page or copy details to report the problem.
          </p>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={this.handleCopyDetails}
              className="px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied Details" : "Copy Error Details"}
            </button>

            <button
              onClick={this.handleReload}
              className="px-4 py-2 text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white rounded-xl transition-colors cursor-pointer"
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * Convenience wrapper for widget-level boundary
 */
export function WidgetErrorBoundary({ children, title, onReset }) {
  return (
    <ErrorBoundary level="widget" title={title} onReset={onReset}>
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
