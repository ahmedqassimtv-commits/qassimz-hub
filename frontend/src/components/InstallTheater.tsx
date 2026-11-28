import React from "react";
import { AnimatePresence, m } from "motion/react";
import { CheckCircle2, AlertTriangle, Minus } from "lucide-react";
import { HubTask, humanBytes } from "../lib/api";
import { I18N, Lang } from "../lib/i18n";
import { SPRINGS } from "../lib/motion";

interface Props {
  task: HubTask | null;
  minimized: boolean;
  lang: Lang;
  onMinimize: () => void;
  onRestore: () => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onLaunch: (id: string) => void;
  onDone: () => void;
}

export const InstallTheater: React.FC<Props> = ({
  task,
  minimized,
  lang,
  onMinimize,
  onRestore,
  onCancel,
  onRetry,
  onLaunch,
  onDone,
}) => {
  const t = I18N[lang];
  const isAr = lang === "ar";
  const isBusy = Boolean(task && ["queued", "downloading", "installing"].includes(task.status));
  const isDone = task?.status === "completed";
  const isErr = task?.status === "error";
  const showModal = Boolean(task && !minimized);
  const showStrip = Boolean(task && minimized && isBusy);

  const stageLabel = () => {
    if (!task) return "";
    if (isDone) return isAr ? "تم التحديث بنجاح" : "Installation Complete";
    if (isErr) return t.friendlyErr;
    const st = String(task.stage || task.status);
    if (st === "verifying" || st === "applying" || task.status === "installing" || task.progress >= 82) {
      return isAr ? "جارٍ التحقق والتجهيز..." : "Verifying & preparing…";
    }
    return isAr ? "جارٍ تنزيل التحديث..." : "Downloading update…";
  };

  return (
    <>
      {/* Minimized Background Transfer Strip */}
      <AnimatePresence>
        {showStrip && task && (
          <m.div
            id="transfer-strip"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={SPRINGS.smooth}
            className="fixed bottom-4 inset-inline-end-4 z-[350] w-[340px] p-3 rounded-2xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-strong)] flex items-center gap-3"
            style={{ boxShadow: "var(--shadow-elevated)" }}
          >
            <img
              src={task.id === "qassimz-hub" ? "./logo.svg" : `./icons/${task.id}.svg`}
              alt=""
              className="w-8 h-8 rounded-lg shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-bold truncate">{task.name}</div>
              <div className="text-[11px] text-[var(--color-text-secondary)] tabular-nums">
                {task.progress}% · {stageLabel()}
              </div>
            </div>
            <button
              id="btn-open-theater"
              onClick={onRestore}
              className="h-7 px-2.5 rounded-lg bg-[var(--color-action-bg)] text-white text-[11.5px] font-semibold cursor-pointer shrink-0"
            >
              {t.showInstaller}
            </button>
          </m.div>
        )}
      </AnimatePresence>

      {/* Main Install Theater Modal */}
      {showModal && task && (
        <m.div
          id="install-theater"
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[400] flex items-center justify-center p-5 bg-[var(--color-scrim)]"
        >
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={SPRINGS.smooth}
            style={{ boxShadow: "var(--shadow-elevated)" }}
            className="w-full max-w-[480px] rounded-2xl overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-strong)] flex flex-col"
          >
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border-subtle)]">
                <div className="flex items-center gap-2 text-[13px] font-bold">
                  <img src="./logo.svg" alt="" className="w-5 h-5 rounded" />
                  <span>QASSIMZ Installer</span>
                </div>
                <button
                  id="btn-min-theater"
                  onClick={onMinimize}
                  title={t.continueBg}
                  className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
                >
                  <Minus size={14} />
                </button>
              </div>

              <div className="p-6 flex flex-col items-center text-center gap-4">
                <img
                  src={task.id === "qassimz-hub" ? "./logo.svg" : `./icons/${task.id}.svg`}
                  alt={task.name}
                  className="w-16 h-16 rounded-2xl shadow-xl"
                />
                <div>
                  <h3 id="th-app-name" className="m-0 text-[18px] font-bold">
                    {task.name}
                  </h3>
                  <div className="text-[12px] text-[var(--color-text-muted)] mt-0.5">v{task.version}</div>
                </div>

                {isBusy && (
                  <div className="w-full flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[12.5px] text-[var(--color-text-secondary)]">
                      <span>{stageLabel()}</span>
                      <strong id="th-pct" className="tabular-nums text-[var(--color-text-primary)]">
                        {task.progress}%
                      </strong>
                    </div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#3b63fb] to-[#38bdf8] origin-left transition-transform duration-200"
                        style={{ transform: `scaleX(${Math.max(0.03, task.progress / 100).toFixed(3)})` }}
                      />
                    </div>
                    {task.speed_bps ? (
                      <div className="text-[11.5px] text-[var(--color-text-muted)] tabular-nums">
                        {humanBytes(task.speed_bps)}/s
                      </div>
                    ) : null}
                  </div>
                )}

                {isDone && (
                  <div className="flex flex-col items-center gap-2 text-[#34d399]">
                    <CheckCircle2 size={36} />
                    <div className="text-[14px] font-semibold text-[var(--color-text-primary)]">{stageLabel()}</div>
                  </div>
                )}

                {isErr && (
                  <div className="flex flex-col items-center gap-2 text-[#fbbf24]">
                    <AlertTriangle size={34} />
                    <div className="text-[13.5px] font-medium text-[var(--color-text-secondary)]">{t.friendlyErr}</div>
                  </div>
                )}
              </div>

              <div className="px-5 py-3.5 border-t border-[var(--color-border-subtle)] flex items-center justify-end gap-2">
                {isBusy && (
                  <>
                    <button
                      onClick={onMinimize}
                      className="h-8 px-3 rounded-lg border border-[var(--color-border-subtle)] text-[12.5px] font-semibold cursor-pointer hover:bg-[var(--color-surface-hover)]"
                    >
                      {t.continueBg}
                    </button>
                    <button
                      onClick={() => onCancel(task.id)}
                      className="h-8 px-3 rounded-lg bg-red-500/15 text-[#f87171] text-[12.5px] font-semibold cursor-pointer hover:bg-red-500/25"
                    >
                      {t.cancel}
                    </button>
                  </>
                )}
                {isDone && (
                  <>
                    <button
                      onClick={onDone}
                      className="h-8 px-3.5 rounded-lg border border-[var(--color-border-subtle)] text-[12.5px] font-semibold cursor-pointer"
                    >
                      {t.done}
                    </button>
                    {task.id !== "qassimz-hub" && (
                      <button
                        onClick={() => {
                          onDone();
                          onLaunch(task.id);
                        }}
                        className="h-8 px-3.5 rounded-lg bg-[var(--color-action-bg)] text-white text-[12.5px] font-semibold cursor-pointer"
                      >
                        {t.launch}
                      </button>
                    )}
                  </>
                )}
                {isErr && (
                  <>
                    <button
                      onClick={onDone}
                      className="h-8 px-3.5 rounded-lg border border-[var(--color-border-subtle)] text-[12.5px] font-semibold cursor-pointer"
                    >
                      {t.close}
                    </button>
                    <button
                      id="btn-th-retry"
                      onClick={() => onRetry(task.id)}
                      className="h-8 px-3.5 rounded-lg bg-[var(--color-action-bg)] text-white text-[12.5px] font-semibold cursor-pointer"
                    >
                      {t.retry}
                    </button>
                  </>
                )}
              </div>
          </m.div>
        </m.div>
      )}
    </>
  );
};
