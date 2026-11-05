import { useEffect, useState } from "react";
import { Timer, RefreshCw } from "lucide-react";

export function RateLimitedModal({ isOpen, onClose, error }) {
  const initialSeconds = error?.retryAfter || error?.details?.retryAfter || 60;
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    if (!isOpen) return;
    setSecondsLeft(initialSeconds);

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, initialSeconds]);

  if (!isOpen) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ratelimit-title"
        className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 text-center outline-none animate-in zoom-in-95"
      >
        <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
          <Timer className="w-6 h-6 animate-pulse" />
        </div>

        <h2 id="ratelimit-title" className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1">
          Please Slow Down
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-5 leading-relaxed">
          Too many requests were sent in a short period. Please wait for the cooldown timer to expire.
        </p>

        <div className="py-4 px-6 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 mb-5 inline-block">
          <div className="text-2xl font-mono font-bold text-zinc-900 dark:text-zinc-100 tracking-wider">
            {formattedTime}
          </div>
          <div className="text-[10px] text-zinc-400 uppercase tracking-widest mt-0.5">Cooldown Remaining</div>
        </div>

        <div>
          <button
            type="button"
            disabled={secondsLeft > 0}
            onClick={onClose}
            className="w-full py-2.5 px-4 text-xs font-semibold rounded-xl text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${secondsLeft === 0 ? "animate-spin" : ""}`} />
            {secondsLeft > 0 ? `Wait (${secondsLeft}s)` : "Try Again Now"}
          </button>
        </div>
      </div>
    </div>
  );
}
