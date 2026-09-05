import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ShoppingBag, Sparkles, ShieldCheck, Truck, Clock, Leaf, ArrowRight, Star } from 'lucide-react';
import heroVegetablesImg from '../assets/images/farm_fresh_vegetables_hero_1788097781784.jpg';

interface HeroSectionProps {
  onShopFreshClick: () => void;
  onTodaysDealsClick: () => void;
}

// Interactive floating vegetable badges
const floatingProduce = [
  {
    icon: '🍅',
    name: 'Vine Tomatoes',
    tag: 'Crisp & Juicy',
    borderColor: 'border-red-400/40 dark:border-red-500/30',
    bgColor: 'bg-red-50/90 dark:bg-red-950/80',
    textColor: 'text-red-700 dark:text-red-300',
    badgePos: 'top-3 -left-3 sm:-left-6',
    floatRangeY: [-8, 8, -8],
    floatRangeX: [-4, 4, -4],
    duration: 5.2,
    delay: 0,
  },
  {
    icon: '🥦',
    name: 'Crisp Broccoli',
    tag: 'High Vitamin C',
    borderColor: 'border-emerald-400/40 dark:border-emerald-500/30',
    bgColor: 'bg-emerald-50/90 dark:bg-emerald-950/80',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    badgePos: 'top-8 -right-3 sm:-right-8',
    floatRangeY: [8, -10, 8],
    floatRangeX: [3, -5, 3],
    duration: 6.0,
    delay: 0.6,
  },
  {
    icon: '🥕',
    name: 'Sweet Carrots',
    tag: 'Farm Direct',
    borderColor: 'border-amber-400/40 dark:border-amber-500/30',
    bgColor: 'bg-amber-50/90 dark:bg-amber-950/80',
    textColor: 'text-amber-700 dark:text-amber-300',
    badgePos: 'bottom-16 -left-3 sm:-left-8',
    floatRangeY: [-6, 10, -6],
    floatRangeX: [-3, 5, -3],
    duration: 5.8,
    delay: 1.2,
  },
  {
    icon: '🫑',
    name: 'Bell Peppers',
    tag: 'Tricolor Fresh',
    borderColor: 'border-green-400/40 dark:border-green-500/30',
    bgColor: 'bg-green-50/90 dark:bg-green-950/80',
    textColor: 'text-green-700 dark:text-green-300',
    badgePos: 'bottom-6 -right-2 sm:-right-6',
    floatRangeY: [10, -6, 10],
    floatRangeX: [4, -4, 4],
    duration: 6.4,
    delay: 1.8,
  },
];

// Ambient falling / floating natural particles
const naturalParticles = [
  { emoji: '🍃', left: '8%', top: '12%', size: 'text-xl', duration: 7, delay: 0 },
  { emoji: '🌿', left: '88%', top: '18%', size: 'text-2xl', duration: 8.5, delay: 1 },
  { emoji: '🌱', left: '48%', top: '8%', size: 'text-lg', duration: 6, delay: 2 },
  { emoji: '✨', left: '22%', top: '78%', size: 'text-base', duration: 5, delay: 1.5 },
  { emoji: '🌾', left: '80%', top: '82%', size: 'text-xl', duration: 9, delay: 0.5 },
];

export function HeroSection({ onShopFreshClick, onTodaysDealsClick }: HeroSectionProps) {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });

  const visualY = useTransform(scrollYProgress, [0, 1], [0, 50]);
  const ambientGlowScale = useTransform(scrollYProgress, [0, 1], [1, 1.2]);

  return (
    <section
      ref={heroRef}
      className="relative overflow-hidden border-b border-[var(--border)] bg-gradient-to-b from-[var(--bg)] via-[var(--bg)] to-[var(--muted)]/30 select-none pt-4 sm:pt-8 pb-12 sm:pb-16"
    >
      {/* ── AMBIENT GLOWS & BACKGROUND PARTICLES ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Radial green & amber soft spotlights */}
        <motion.div
          style={{ scale: ambientGlowScale }}
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/4 w-[600px] sm:w-[850px] h-[350px] sm:h-[450px] bg-[var(--primary)] opacity-[0.09] blur-[120px] rounded-full pointer-events-none"
        />
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-amber-400/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />

        {/* Ambient floating natural leaves/particles */}
        {naturalParticles.map((p, idx) => (
          <motion.div
            key={idx}
            style={{ left: p.left, top: p.top }}
            initial={{ opacity: 0, y: 15 }}
            animate={{
              opacity: [0.35, 0.75, 0.35],
              y: [-12, 12, -12],
              x: [-6, 6, -6],
              rotate: [-8, 8, -8],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className={`absolute ${p.size} pointer-events-none select-none filter drop-shadow-xs`}
          >
            {p.emoji}
          </motion.div>
        ))}
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* ── LEFT COLUMN: HEADLINE, HIGHLIGHTS & CTAs ── */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-6 space-y-5 text-center lg:text-left z-10"
          >
            {/* Top pill badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold tracking-wide bg-[var(--muted)] text-[var(--muted-fg)] border border-[var(--border)] shadow-xs"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span>100% Farm-Fresh Vegetables</span>
              <span className="hidden sm:inline-block text-[var(--border)]">•</span>
              <span className="hidden sm:inline-block text-[11px] font-bold text-[var(--primary)] uppercase tracking-wider">
                Harvested at Dawn
              </span>
            </motion.div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-[3.4rem] font-black tracking-tight leading-[1.12] text-[var(--fg)]">
              Pure Farm-Fresh Sabjis, <br className="hidden sm:inline" />
              <span className="relative inline-block text-[var(--primary)] mt-1">
                Delivered in 90 Mins.
                <motion.svg
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.7 }}
                  transition={{ delay: 0.4, duration: 0.8 }}
                  className="absolute -bottom-1.5 left-0 w-full h-2.5 text-[var(--primary)]"
                  viewBox="0 0 100 20"
                  preserveAspectRatio="none"
                >
                  <path d="M0,15 Q50,0 100,15" fill="none" stroke="currentColor" strokeWidth="4" />
                </motion.svg>
              </span>
            </h1>

            {/* Sub-text description */}
            <p className="text-sm sm:text-base lg:text-lg text-[var(--muted-fg)] max-w-xl mx-auto lg:mx-0 font-normal leading-relaxed">
              Crisp tomatoes, farm greens, sweet carrots, broccoli, and peppers hand-inspected daily. Delivered straight to{' '}
              <strong className="text-[var(--fg)] font-semibold">Ghatkopar & Vikhroli</strong> with 0% cold-storage aging.
            </p>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 sm:gap-4">
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={onShopFreshClick}
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl font-bold btn-premium flex items-center justify-center gap-2.5 shadow-lg cursor-pointer group"
              >
                <ShoppingBag className="w-5 h-5 transition-transform duration-200 group-hover:-translate-y-0.5" />
                <span>Shop Fresh Harvest</span>
                <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 transition-transform" />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={onTodaysDealsClick}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-semibold bg-[var(--card)] hover:bg-[var(--muted)] text-[var(--fg)] border border-[var(--border)] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs"
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Today's Farm Deals</span>
              </motion.button>
            </div>

            {/* Key Trust & Quality Badges */}
            <div className="pt-4 sm:pt-6 grid grid-cols-3 gap-2 sm:gap-4 border-t border-[var(--border)] max-w-lg mx-auto lg:mx-0">
              <div className="flex flex-col items-center lg:items-start text-center lg:text-left p-1">
                <div className="flex items-center gap-1 text-[var(--primary)] mb-0.5">
                  <Truck className="w-4 h-4" />
                  <span className="text-xs sm:text-sm font-bold text-[var(--fg)]">90-Min Slot</span>
                </div>
                <span className="text-[11px] text-[var(--muted-fg)]">Ghatkopar & Vikhroli</span>
              </div>

              <div className="flex flex-col items-center lg:items-start text-center lg:text-left p-1">
                <div className="flex items-center gap-1 text-[var(--primary)] mb-0.5">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs sm:text-sm font-bold text-[var(--fg)]">Free &gt; ₹299</span>
                </div>
                <span className="text-[11px] text-[var(--muted-fg)]">Or active promo codes</span>
              </div>

              <div className="flex flex-col items-center lg:items-start text-center lg:text-left p-1">
                <div className="flex items-center gap-1 text-[var(--primary)] mb-0.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="text-xs sm:text-sm font-bold text-[var(--fg)]">100% Fresh</span>
                </div>
                <span className="text-[11px] text-[var(--muted-fg)]">Zero cold-storage</span>
              </div>
            </div>
          </motion.div>

          {/* ── RIGHT COLUMN: ANIMATED HERO VISUAL WITH FLOATING PRODUCE ── */}
          <motion.div
            style={{ y: visualY }}
            initial={{ opacity: 0, scale: 0.94, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-6 relative flex items-center justify-center pt-2 lg:pt-0"
          >
            {/* Ambient Backing Glow */}
            <div className="absolute -inset-3 bg-gradient-to-r from-emerald-500/20 via-teal-500/15 to-amber-500/20 rounded-[32px] blur-2xl opacity-70 -z-10 animate-pulse" />

            {/* Main Showcase Container Card */}
            <motion.div
              whileHover={{ scale: 1.012 }}
              transition={{ type: 'spring', stiffness: 220, damping: 22 }}
              className="relative w-full max-w-lg lg:max-w-none rounded-[26px] overflow-hidden glass-card p-3 sm:p-4 border border-[var(--border)] shadow-2xl backdrop-blur-xl group"
            >
              {/* Image Frame */}
              <div className="relative rounded-2xl overflow-hidden aspect-[4/3] bg-[var(--muted)]">
                <motion.img
                  src={heroVegetablesImg}
                  alt="Fresh farm vegetables visual: ripe tomatoes, crisp broccoli, carrots, bell peppers, greens"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transform transition-transform duration-1000 ease-out group-hover:scale-105"
                  initial={{ scale: 1.06, filter: 'blur(4px)' }}
                  animate={{ scale: 1, filter: 'blur(0px)' }}
                  transition={{ duration: 1.0, ease: 'easeOut' }}
                />

                {/* Subtle vignette gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent pointer-events-none" />

                {/* ── FLOATING PRODUCE BADGES ── */}
                <div className="absolute inset-0 pointer-events-none overflow-visible">
                  {floatingProduce.map((item) => (
                    <motion.div
                      key={item.name}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{
                        opacity: [0.95, 1, 0.95],
                        y: item.floatRangeY,
                        x: item.floatRangeX,
                        scale: 1,
                      }}
                      transition={{
                        duration: item.duration,
                        delay: item.delay,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                      className={`absolute ${item.badgePos} z-20 pointer-events-auto cursor-pointer`}
                    >
                      <motion.div
                        whileHover={{ scale: 1.12, rotate: [-2, 2, 0] }}
                        whileTap={{ scale: 0.95 }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${item.bgColor} backdrop-blur-md border ${item.borderColor} shadow-lg shadow-black/15 transition-all`}
                      >
                        <span className="text-xl sm:text-2xl filter drop-shadow-xs">{item.icon}</span>
                        <div className="flex flex-col pr-1">
                          <span className={`text-[11px] font-extrabold ${item.textColor} whitespace-nowrap leading-tight`}>
                            {item.name}
                          </span>
                          <span className="text-[9px] text-[var(--muted-fg)] font-semibold leading-none">
                            {item.tag}
                          </span>
                        </div>
                      </motion.div>
                    </motion.div>
                  ))}
                </div>

                {/* Bottom Overlay Badges inside image */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white z-10 pointer-events-none">
                  <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 shadow-md">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-xs font-semibold tracking-wide">6 AM Harvest Batch</span>
                  </div>

                  <div className="flex items-center gap-1.5 bg-emerald-600/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-emerald-400/40 text-xs font-bold text-white shadow-md">
                    <Leaf className="w-3.5 h-3.5 text-emerald-200" />
                    <span>100% Garden Fresh</span>
                  </div>
                </div>
              </div>

              {/* Mini Feature Details underneath the main visual */}
              <div className="mt-3.5 grid grid-cols-2 gap-2.5 text-xs">
                <motion.div
                  whileHover={{ y: -2 }}
                  className="p-3 rounded-2xl bg-[var(--muted)]/80 backdrop-blur-xs border border-[var(--border)] flex items-center gap-2.5 transition-all"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0">
                    🌱
                  </div>
                  <div>
                    <p className="font-bold text-[var(--fg)] text-xs">Dawn Harvested</p>
                    <p className="text-[10px] text-[var(--muted-fg)] leading-tight mt-0.5">
                      Direct local farmer network
                    </p>
                  </div>
                </motion.div>

                <motion.div
                  whileHover={{ y: -2 }}
                  className="p-3 rounded-2xl bg-[var(--muted)]/80 backdrop-blur-xs border border-[var(--border)] flex items-center gap-2.5 transition-all"
                >
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center font-bold text-sm shrink-0">
                    ⭐
                  </div>
                  <div>
                    <p className="font-bold text-[var(--fg)] text-xs">4.9 / 5 Rating</p>
                    <p className="text-[10px] text-[var(--muted-fg)] leading-tight mt-0.5">
                      Trusted across Ghatkopar
                    </p>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
