import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import sabjisLogo from '../assets/images/sabjis_logo_1783085736930.jpg';

interface ModernLoadingScreenProps {
  isLoading: boolean;
  onFinished?: () => void;
}

export const ModernLoadingScreen: React.FC<ModernLoadingScreenProps> = ({
  isLoading,
  onFinished
}) => {
  // 1-second absolute maximum duration ceiling.
  // If isLoading becomes false earlier, it exits immediately!
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Hard ceiling: Never show for more than 1000ms
    const timer = setTimeout(() => {
      setVisible(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Immediate dismissal the moment data is ready (< 1s)
    if (!isLoading) {
      setVisible(false);
    }
  }, [isLoading]);

  return (
    <AnimatePresence onExitComplete={onFinished}>
      {visible && (
        <motion.div
          key="sabjies-modern-loading-screen"
          initial={{ opacity: 1 }}
          exit={{
            opacity: 0,
            scale: 0.98,
            filter: 'blur(8px)',
            transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
          }}
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center p-4 select-none overflow-hidden pointer-events-auto"
          style={{
            background:
              'radial-gradient(circle at 50% 40%, var(--card, #ffffff) 0%, var(--bg, #f5f9f6) 100%)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)'
          }}
        >
          {/* Subtle Ambient Farm-Fresh Halo */}
          <div
            className="absolute h-72 w-72 md:h-96 md:w-96 rounded-full blur-3xl pointer-events-none opacity-40 dark:opacity-20 animate-pulse"
            style={{
              background: 'radial-gradient(circle, var(--primary, #059669) 0%, transparent 70%)',
              animationDuration: '2.5s'
            }}
          />

          {/* Central Glass Card */}
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex flex-col items-center justify-center px-6 py-8 sm:px-10 sm:py-10 rounded-3xl border border-emerald-500/15 dark:border-emerald-500/20 bg-white/80 dark:bg-zinc-900/80 shadow-[0_20px_50px_-12px_rgba(5,150,105,0.18)] dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)] backdrop-blur-2xl max-w-sm w-full mx-4 text-center overflow-hidden"
          >
            {/* Specular Light Top Sheen */}
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-400/40 dark:via-emerald-400/20 to-transparent" />

            {/* Circular Loading Animation Around Sabjies Logo */}
            <div className="relative mb-5 flex items-center justify-center">
              {/* Outer Glowing Pulsing Orbit */}
              <div
                className="absolute -inset-4 sm:-inset-5 rounded-full border border-emerald-500/20 dark:border-emerald-400/20 animate-ping opacity-20 pointer-events-none"
                style={{ animationDuration: '2s' }}
              />

              {/* Background Circular Orbit Track (Dashed) */}
              <svg
                className="absolute -inset-3.5 sm:-inset-4 h-[calc(100%+28px)] sm:h-[calc(100%+32px)] w-[calc(100%+28px)] sm:w-[calc(100%+32px)] animate-spin-reverse pointer-events-none"
                style={{ animationDuration: '7s' }}
                viewBox="0 0 100 100"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="4 6"
                  className="text-emerald-500/25 dark:text-emerald-400/20"
                />
              </svg>

              {/* Primary Clockwise Gradient Spin Ring */}
              <svg
                className="absolute -inset-3 sm:-inset-3.5 h-[calc(100%+24px)] sm:h-[calc(100%+28px)] w-[calc(100%+24px)] sm:w-[calc(100%+28px)] animate-spin pointer-events-none"
                style={{ animationDuration: '1.2s' }}
                viewBox="0 0 100 100"
              >
                <defs>
                  <linearGradient id="sabjiesSpinGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#059669" stopOpacity="1" />
                    <stop offset="50%" stopColor="#10B981" stopOpacity="0.85" />
                    <stop offset="85%" stopColor="#34D399" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="url(#sabjiesSpinGradient)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray="95 190"
                />
              </svg>

              {/* Central Logo Container with Glass & Subtle Glow */}
              <div className="relative h-20 w-20 sm:h-24 sm:w-24 rounded-full p-1 bg-gradient-to-tr from-emerald-500/30 via-emerald-200/20 to-teal-400/30 shadow-[0_4px_20px_rgba(5,150,105,0.2)]">
                <div className="h-full w-full rounded-full overflow-hidden bg-white dark:bg-zinc-950 border border-emerald-500/20 dark:border-emerald-500/30 flex items-center justify-center p-2.5">
                  <img
                    src={sabjisLogo}
                    alt="Sabjies"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover rounded-full"
                  />
                </div>
              </div>

              {/* Floating Vegetable-Themed Animation Micro-Badges */}
              {/* 🥬 Crisp Leaf / Greens (Top Right) */}
              <motion.span
                animate={{
                  y: [-3, 3, -3],
                  rotate: [-6, 6, -6],
                  scale: [1, 1.05, 1]
                }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -top-2 -right-2 text-base sm:text-lg select-none filter drop-shadow-sm pointer-events-none"
                title="Fresh Greens"
              >
                🥬
              </motion.span>

              {/* 🥕 Sweet Carrot (Bottom Left) */}
              <motion.span
                animate={{
                  y: [3, -3, 3],
                  rotate: [6, -6, 6],
                  scale: [1, 1.05, 1]
                }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                className="absolute -bottom-2 -left-2 text-base sm:text-lg select-none filter drop-shadow-sm pointer-events-none"
                title="Farm Carrots"
              >
                🥕
              </motion.span>

              {/* 🍅 Farm Tomato (Bottom Right) */}
              <motion.span
                animate={{
                  y: [-2, 2, -2],
                  rotate: [-5, 5, -5]
                }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                className="absolute -bottom-1 -right-3 text-sm sm:text-base select-none filter drop-shadow-sm pointer-events-none"
                title="Fresh Tomatoes"
              >
                🍅
              </motion.span>

              {/* 🥦 Broccoli / Sprout (Top Left) */}
              <motion.span
                animate={{
                  y: [2, -2, 2],
                  rotate: [5, -5, 5]
                }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
                className="absolute -top-1.5 -left-3 text-sm sm:text-base select-none filter drop-shadow-sm pointer-events-none"
                title="Organic Broccoli"
              >
                🥦
              </motion.span>
            </div>

            {/* Brand Title & Tagline */}
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-2xl font-black tracking-tight text-[var(--fg,#082318)] dark:text-zinc-50">
                  Sabjies
                </span>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 tracking-wider">
                  Fresh
                </span>
              </div>
              <p className="text-xs font-semibold text-[var(--muted-fg,#3B6350)] dark:text-zinc-400 tracking-wide">
                Direct from Maharashtra Farms
              </p>
            </div>

            {/* Vegetable Theme Micro-Ticker */}
            <div className="mt-4 flex items-center justify-center gap-1.5 py-1 px-3 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
              <span className="inline-block animate-bounce">🌱</span>
              <span className="text-[10px] sm:text-[11px] font-semibold tracking-wide">
                Crisp &bull; Clean &bull; Chemical-Free
              </span>
              <span className="inline-block animate-bounce" style={{ animationDelay: '0.2s' }}>✨</span>
            </div>

            {/* Ultra-Fast Smooth Progress Line */}
            <div className="w-full max-w-[160px] sm:max-w-[190px] h-1 bg-emerald-500/15 dark:bg-emerald-500/20 rounded-full overflow-hidden mt-5 relative">
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
                className="w-1/2 h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600 rounded-full"
              />
            </div>
          </motion.div>

          {/* Location Delivery Indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="mt-5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-[var(--muted-fg,#3B6350)] dark:text-zinc-400 opacity-80"
          >
            <span>Express Delivery</span>
            <span>&bull;</span>
            <span>Ghatkopar, Mumbai</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
