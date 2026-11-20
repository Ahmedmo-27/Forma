import { Download, AlertCircle, X } from "lucide-react";
import { useI18n } from "../../i18n/useI18n";
import { useFormat } from "../../i18n/useFormat";

export function ImportErrorsModal({ isOpen, onClose, errors = [], totalCount = 0 }) {
  const { t } = useI18n();
  const { fmtNumber } = useFormat();
  if (!isOpen) return null;

  const handleDownloadCsv = () => {
    if (!errors || errors.length === 0) return;

    // Headers
    const headers = ["Row", "Name", "Phone", "Reason"];
    const csvRows = [headers.join(",")];

    errors.forEach((err, idx) => {
      const rowNum = idx + 1;
      const name = `"${(err.row?.name || err.name || "").replace(/"/g, '""')}"`;
      const phone = `"${(err.row?.phone || err.phone || "").replace(/"/g, '""')}"`;
      const reason = `"${(err.reason || err.message || "Invalid row data").replace(/"/g, '""')}"`;
      csvRows.push([rowNum, name, phone, reason].join(","));
    });

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `import-errors-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="import-errors-title"
        className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 text-start outline-none animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 id="import-errors-title" className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {t("Excel Import Errors")}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {t("{count} of {total} rows failed validation.", { count: fmtNumber(errors.length), total: fmtNumber(totalCount || errors.length) })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close")}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto my-4 border border-zinc-200 dark:border-zinc-700 rounded-xl">
          <table className="w-full text-start text-xs border-collapse">
            <thead className="bg-zinc-50 dark:bg-zinc-800/80 sticky top-0 border-b border-zinc-200 dark:border-zinc-700">
              <tr>
                <th className="py-2 px-3 font-semibold text-zinc-600 dark:text-zinc-300">#</th>
                <th className="py-2 px-3 font-semibold text-zinc-600 dark:text-zinc-300">{t("Name")}</th>
                <th className="py-2 px-3 font-semibold text-zinc-600 dark:text-zinc-300">{t("Phone")}</th>
                <th className="py-2 px-3 font-semibold text-zinc-600 dark:text-zinc-300">{t("Error Reason")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {errors.map((err, idx) => (
                <tr key={idx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40">
                  <td className="py-2 px-3 text-zinc-400 font-mono">{idx + 1}</td>
                  <td className="py-2 px-3 font-medium text-zinc-800 dark:text-zinc-200">
                    {err.row?.name || err.name || "—"}
                  </td>
                  <td dir="ltr" className="py-2 px-3 text-start text-zinc-600 dark:text-zinc-400 font-mono">
                    {err.row?.phone || err.phone || "—"}
                  </td>
                  <td className="py-2 px-3 text-red-600 dark:text-red-400">
                    {err.reason || err.message || t("Invalid row")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {t("Download Failed Rows (CSV)")}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
          >
            {t("Close")}
          </button>
        </div>
      </div>
    </div>
  );
}
