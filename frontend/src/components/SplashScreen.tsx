import React from "react";
import { AnimatePresence, m } from "motion/react";
import { QassimzWordmark } from "./QassimzWordmark";
import { SPRINGS } from "../lib/motion";

interface Props {
  visible: boolean;
  progress: number;
  status: string;
  onSkip: () => void;
}

export const SplashScreen: React.FC<Props> = ({ visible, progress, status, onSkip }) => (
  <AnimatePresence>
    {visible && (
      <m.div
        id="brand-intro"
        role="status"
        aria-live="polite"
        onClick={onSkip}
        initial={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 1.015 }}
        transition={SPRINGS.smooth}
        className="brand-intro fixed inset-0 z-[600] flex items-center justify-center cursor-pointer"
        style={{
          background:
            "radial-gradient(75% 65% at 50% 0%, rgba(59, 99, 251, 0.14) 0%, rgba(59, 99, 251, 0) 68%), #0c0e13",
        }}
      >
        <m.div
          initial={{ opacity: 0, scale: 0.94, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={SPRINGS.gentle}
          className="relative w-[min(420px,90vw)] min-h-[280px] px-8 py-9 rounded-[18px] flex flex-col items-center justify-between gap-6 overflow-hidden border border-white/10"
          style={{
            background:
              "radial-gradient(90% 60% at 50% -10%, rgba(59, 99, 251, 0.13) 0%, rgba(59, 99, 251, 0) 64%), #14171f",
            boxShadow: "0 32px 84px rgba(0, 0, 0, 0.68), inset 0 1px 0 rgba(255, 255, 255, 0.10)",
          }}
        >
          <div className="flex flex-col items-center gap-3.5">
            <m.div
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={SPRINGS.smooth}
              className="w-[60px] h-[60px] rounded-[15px] overflow-hidden shadow-2xl"
            >
              <img src="./logo.svg" alt="QASSIMZ Hub" width={60} height={60} className="w-full h-full block" />
            </m.div>
            <QassimzWordmark className="h-[42px] w-auto text-[#f5f7fa]" />
            <div className="text-[12.5px] font-semibold tracking-[0.06em] text-[#a8b0bf]">QASSIMZ Hub</div>
          </div>

          <div className="w-full max-w-[240px] flex flex-col items-center gap-2.5">
            <div className="w-full h-[3px] rounded-full bg-white/10 overflow-hidden">
              <m.div
                className="h-full rounded-full bg-[#3b63fb] origin-left"
                animate={{ scaleX: Math.max(0.12, Math.min(1, progress / 100)) }}
                transition={SPRINGS.smooth}
              />
            </div>
            <div className="text-[12px] text-[#788296] text-center min-h-[18px]">{status}</div>
          </div>
        </m.div>
      </m.div>
    )}
  </AnimatePresence>
);
