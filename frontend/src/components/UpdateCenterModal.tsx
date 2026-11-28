import React from "react";
import { AnimatePresence, m } from "motion/react";
import { CheckCircle2, Sparkles, X } from "lucide-react";
import { HubStatePayload } from "../lib/api";
import { I18N, Lang } from "../lib/i18n";
import { SPRINGS } from "../lib/motion";

interface UpdateCenterProps {
  open: boolean;
  checking: boolean;
  lang: Lang;
  state: HubStatePayload | null;
  onClose: () => void;
  onUpdateHub: () => void;
  onUpdateAllApps: () => void;
}

export const UpdateCenterModal: React.FC<UpdateCenterProps> = ({
  open,
  checking,
  lang,
  state,
  onClose,
  onUpdateHub,
  onUpdateAllApps,
}) => {
  const t = I18N[lang];
  const isAr = lang === "ar";
  const hasHub = Boolean(state?.hub_has_update);
  const appUpdCount = state?.counts?.updates || 0;

  return (
    <AnimatePresence>
      {open && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-[370] flex items-center justify-center p-5 bg-[var(--color-scrim)]"
        >
          <m.div
            id="update-center-modal"
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={SPRINGS.smooth}
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: "var(--shadow-elevated)" }}
            className="w-full max-w-[440px] rounded-2xl overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-strong)]"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border-subtle)]">
              <div className="flex items-center gap-2 text-[14px] font-bold">
                <img src="./logo.svg" alt="" className="w-5 h-5 rounded" />
                <span>{isAr ? "مركز التحديثات" : "Update Center"}</span>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-6 flex flex-col items-center text-center gap-3">
              {checking ? (
                <>
                  <div className="w-10 h-10 rounded-full border-2 border-[#38bdf8]/25 border-t-[#38bdf8] animate-spin" />
                  <h3 className="m-0 text-[16px] font-bold">
                    {isAr ? "جارٍ فحص التحديثات…" : "Checking for updates…"}
                  </h3>
                </>
              ) : hasHub || appUpdCount > 0 ? (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-[#3b63fb]/15 border border-[#60a5fa]/30 flex items-center justify-center text-[#60a5fa]">
                    <Sparkles size={26} />
                  </div>
                  <h3 className="m-0 text-[16px] font-bold">
                    {hasHub
                      ? isAr
                        ? `يتوفر تحديث جديد v${state?.hub_remote_version}`
                        : `QASSIMZ Hub v${state?.hub_remote_version} Ready`
                      : isAr
                      ? `يتوفر تحديث لـ ${appUpdCount} تطبيقات`
                      : `${appUpdCount} App Updates Ready`}
                  </h3>
                  {state?.hub_release_notes && hasHub && (
                    <p className="m-0 text-[12.5px] leading-relaxed text-[var(--color-text-secondary)] p-3 rounded-xl bg-[var(--color-surface-hover)] text-start w-full">
                      {state.hub_release_notes}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-[#10b981]/15 border border-[#34d399]/30 flex items-center justify-center text-[#34d399]">
                    <CheckCircle2 size={28} />
                  </div>
                  <h3 className="m-0 text-[16px] font-bold">{t.upToDateTitle}</h3>
                  <span className="text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full bg-[var(--color-surface-hover)]">
                    QASSIMZ Hub v{state?.hub_version || "1.6.3"}
                  </span>
                  <p className="m-0 text-[12.5px] text-[var(--color-text-secondary)]">{t.upToDateDesc}</p>
                </>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-[var(--color-border-subtle)] flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                className="h-8 px-3.5 rounded-lg border border-[var(--color-border-subtle)] text-[12.5px] font-semibold cursor-pointer"
              >
                {t.close}
              </button>
              {!checking && (hasHub || appUpdCount > 0) && (
                <button
                  onClick={() => {
                    onClose();
                    if (hasHub) onUpdateHub();
                    else onUpdateAllApps();
                  }}
                  className="h-8 px-4 rounded-lg bg-[var(--color-action-bg)] text-white text-[12.5px] font-semibold cursor-pointer"
                >
                  {isAr ? "تحديث الآن" : "Update Now"}
                </button>
              )}
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
};

interface WhatsNewProps {
  open: boolean;
  lang: Lang;
  version: string;
  notes: string;
  onClose: () => void;
}

export const WhatsNewModal: React.FC<WhatsNewProps> = ({ open, lang, version, notes, onClose }) => {
  const t = I18N[lang];
  return (
    <AnimatePresence>
      {open && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[365] flex items-center justify-center p-5 bg-[var(--color-scrim)]"
        >
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={SPRINGS.smooth}
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: "var(--shadow-elevated)" }}
            className="w-full max-w-[440px] rounded-2xl overflow-hidden bg-[var(--color-surface-elevated)] border border-[var(--color-border-strong)] p-5 flex flex-col gap-3"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#3b63fb]/15 text-[#60a5fa] flex items-center justify-center">
                <Sparkles size={18} />
              </div>
              <div>
                <div className="text-[15px] font-bold">{t.whatsNewTitle}</div>
                <div className="text-[11.5px] text-[var(--color-text-muted)]">v{version}</div>
              </div>
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">{notes}</p>
            <div className="flex justify-end pt-2">
              <button
                onClick={onClose}
                className="h-8 px-4 rounded-lg bg-[var(--color-action-bg)] text-white text-[12.5px] font-semibold cursor-pointer"
              >
                {t.done}
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
};
