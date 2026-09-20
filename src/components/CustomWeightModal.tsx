/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Product } from '../types';
import { X, Scale, Plus, Minus, ShoppingBag, CheckCircle, Sparkles, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  parseWeightToGrams,
  calculateWeightPrice,
  formatWeight,
  getBaseWeightInGrams,
  WEIGHT_PRESETS,
  WeightPriceResult,
  isKgProduct
} from '../utils/weightParser';

export interface CustomWeightSelection {
  weight: string;          // e.g. "1.25 kg" or "650g"
  weightInGrams: number;   // e.g. 1250 or 650
  price: number;           // e.g. 38 or 20
  qty: number;             // e.g. 1
  baseSp: number;          // e.g. 30
  formulaText: string;
}

interface CustomWeightModalProps {
  product: Product;
  isOpen: boolean;
  initialWeightInGrams?: number;
  onClose: () => void;
  onConfirm: (selection: CustomWeightSelection) => void;
  actionButtonLabel?: string;
}

export const POPULAR_CUSTOM_SUGGESTIONS = [
  { label: '300g', text: '300g', grams: 300 },
  { label: '650g', text: '650g', grams: 650 },
  { label: '750g', text: '750g', grams: 750 },
  { label: '1.25 kg', text: '1.25kg', grams: 1250 },
  { label: '1.5 kg', text: '1.5kg', grams: 1500 },
  { label: '2.25 kg', text: '2.25kg', grams: 2250 },
];

export const CustomWeightModal: React.FC<CustomWeightModalProps> = ({
  product,
  isOpen,
  initialWeightInGrams,
  onClose,
  onConfirm,
  actionButtonLabel = 'Add to Cart'
}) => {
  if (!isKgProduct(product)) {
    return null;
  }

  const baseGrams = useMemo(() => getBaseWeightInGrams(product.weight), [product.weight]);
  const defaultGrams = initialWeightInGrams || baseGrams || 1000;

  const [inputVal, setInputVal] = useState<string>(formatWeight(defaultGrams));
  const [selectedUnit, setSelectedUnit] = useState<'g' | 'kg'>(defaultGrams >= 1000 ? 'kg' : 'g');
  const [packQty, setPackQty] = useState<number>(1);

  // Reset when modal opens or product changes
  useEffect(() => {
    if (isOpen) {
      const g = initialWeightInGrams || baseGrams || 1000;
      setInputVal(formatWeight(g));
      setSelectedUnit(g >= 1000 ? 'kg' : 'g');
      setPackQty(1);
    }
  }, [isOpen, product.id, initialWeightInGrams, baseGrams]);

  // Real-time parsed weight & instant price calculation
  const parsedWeight = useMemo(() => {
    return parseWeightToGrams(inputVal, selectedUnit);
  }, [inputVal, selectedUnit]);

  const priceResult: WeightPriceResult | null = useMemo(() => {
    if (!parsedWeight.isValid || parsedWeight.grams <= 0) return null;
    return calculateWeightPrice(product.sp, product.weight, parsedWeight.grams, product.weightSlabs);
  }, [product.sp, product.weight, parsedWeight, product.weightSlabs]);

  const totalPrice = priceResult ? priceResult.price * packQty : 0;

  const handlePresetClick = (grams: number) => {
    const formatted = formatWeight(grams);
    setInputVal(formatted);
    setSelectedUnit(grams >= 1000 ? 'kg' : 'g');
  };

  const handleUnitToggle = (unit: 'g' | 'kg') => {
    setSelectedUnit(unit);
    if (!parsedWeight.isValid || parsedWeight.grams <= 0) return;
    if (unit === 'kg') {
      const kgVal = parseFloat((parsedWeight.grams / 1000).toFixed(3));
      setInputVal(`${kgVal}kg`);
    } else {
      setInputVal(`${parsedWeight.grams}g`);
    }
  };

  const handleApply = () => {
    if (!parsedWeight.isValid || !priceResult) return;
    onConfirm({
      weight: priceResult.displayWeight,
      weightInGrams: parsedWeight.grams,
      price: priceResult.price,
      qty: packQty,
      baseSp: product.sp,
      formulaText: priceResult.formulaText,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl z-10 flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 bg-[var(--muted)]/40">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <Scale className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--fg)] tracking-tight">
                    Custom Vegetable Weight
                  </h3>
                  <p className="text-[11px] text-[var(--muted-fg)] font-medium">
                    Enter exact quantity needed for your cooking
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--muted-fg)] hover:text-[var(--fg)] hover:bg-[var(--border)] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-5 space-y-5 overflow-y-auto">
              {/* Product Info Banner */}
              <div className="flex items-center gap-3.5 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/30 p-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--card)] text-3xl shadow-sm border border-[var(--border)] overflow-hidden">
                  {product.img ? (
                    <img
                      src={product.img}
                      alt={product.name}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>{product.emoji}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-extrabold text-sm text-[var(--fg)] truncate">
                    {product.name}
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] text-[var(--muted-fg)] mt-0.5">
                    <span>Base Rate:</span>
                    <strong className="text-[var(--primary)] font-bold">₹{product.sp} {product.weight}</strong>
                  </div>
                </div>
              </div>

              {/* Instant Price Highlight Box */}
              <div className="rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-4 shadow-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Calculated Live Price
                    </span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                        {priceResult ? `₹${priceResult.price}` : '—'}
                      </span>
                      {priceResult && priceResult.price !== priceResult.exactPrice && (
                        <span className="text-xs text-[var(--muted-fg)] font-medium">
                          (exact ₹{priceResult.exactPrice.toFixed(2)})
                        </span>
                      )}
                    </div>
                  </div>

                  {priceResult && (
                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
                        <Scale className="h-3 w-3" />
                        {priceResult.grams.toLocaleString('en-IN')}g
                      </span>
                      <p className="text-[10px] text-[var(--muted-fg)] mt-1 font-medium">
                        Converted internally
                      </p>
                    </div>
                  )}
                </div>

                {priceResult && (
                  <div className="mt-3 pt-3 border-t border-emerald-500/20 flex flex-wrap items-center justify-between gap-1 text-[11px] text-emerald-800 dark:text-emerald-200">
                    <div className="flex items-center gap-1.5">
                      {priceResult.isCustomSlab ? (
                        <span className="rounded bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700 px-1.5 py-0.5 text-[9px] font-black text-amber-800 dark:text-amber-300">
                          ⭐ Special Slab Rate
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700 px-1.5 py-0.5 text-[9px] font-black text-emerald-800 dark:text-emerald-300">
                          Fresh Daily Rate
                        </span>
                      )}
                      <span className="font-extrabold text-emerald-900 dark:text-emerald-100">
                        ₹{priceResult.price} for {priceResult.grams >= 1000 ? `${priceResult.grams / 1000} kg` : `${priceResult.grams}g`}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-[var(--muted-fg)]">
                      {priceResult.isCustomSlab ? 'Special quantity pricing' : `Rate: ₹${priceResult.pricePerKg}/kg`}
                    </span>
                  </div>
                )}
              </div>

              {/* Custom Weight Input */}
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-[var(--fg)] flex items-center justify-between">
                  <span>Enter Custom Weight</span>
                  <div className="flex items-center gap-1 rounded-lg bg-[var(--muted)] p-0.5 border border-[var(--border)]">
                    <button
                      type="button"
                      onClick={() => handleUnitToggle('g')}
                      className={`px-2 py-0.5 text-[10px] font-black rounded-md transition-all ${
                        selectedUnit === 'g'
                          ? 'bg-[var(--primary)] text-white shadow-sm'
                          : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
                      }`}
                    >
                      Grams (g)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUnitToggle('kg')}
                      className={`px-2 py-0.5 text-[10px] font-black rounded-md transition-all ${
                        selectedUnit === 'kg'
                          ? 'bg-[var(--primary)] text-white shadow-sm'
                          : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
                      }`}
                    >
                      Kilograms (kg)
                    </button>
                  </div>
                </label>

                <div className="relative">
                  <input
                    type="text"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    placeholder="e.g. 300g, 650g, 750g, 1.25kg, 1.5kg, 2.25kg"
                    className="w-full rounded-2xl border-2 border-[var(--border)] focus:border-[var(--primary)] bg-[var(--bg)] px-4 py-3.5 text-base font-bold text-[var(--fg)] outline-none transition-all shadow-inner placeholder:text-[var(--muted-fg)]/60 placeholder:text-xs"
                    autoFocus
                  />
                  {parsedWeight.isValid && (
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs font-black text-emerald-600 dark:text-emerald-400">
                      <CheckCircle className="h-4 w-4" />
                      <span>{parsedWeight.displayWeight}</span>
                    </div>
                  )}
                </div>

                {!parsedWeight.isValid && inputVal.trim() !== '' && (
                  <p className="text-[11px] text-red-500 font-bold flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{parsedWeight.error || 'Please enter a valid weight (e.g. 300g, 1.25kg)'}</span>
                  </p>
                )}
              </div>

              {/* Direct Requested Quick Suggestions */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-[var(--muted-fg)]">
                  Quick Examples (Click to apply):
                </span>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_CUSTOM_SUGGESTIONS.map((item) => (
                    <button
                      key={item.text}
                      type="button"
                      onClick={() => handlePresetClick(item.grams)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-extrabold border transition-all ${
                        parsedWeight.grams === item.grams
                          ? 'border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm scale-105'
                          : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:border-[var(--primary)] hover:bg-[var(--muted)]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Standard Presets */}
              <div className="space-y-2 pt-1 border-t border-[var(--border)]">
                <span className="text-[11px] font-bold text-[var(--muted-fg)]">
                  Standard Market Presets:
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {WEIGHT_PRESETS.map((preset) => {
                    const presetCalc = calculateWeightPrice(product.sp, product.weight, preset.grams, product.weightSlabs);
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handlePresetClick(preset.grams)}
                        className={`rounded-xl p-2 text-center text-xs font-bold border transition-all ${
                          parsedWeight.grams === preset.grams
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500'
                            : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:bg-[var(--muted)]'
                        }`}
                      >
                        <div className="text-[11px] font-extrabold flex items-center justify-center gap-0.5">
                          <span>{preset.label}</span>
                          {presetCalc.isCustomSlab && (
                            <span className="text-[8px] text-amber-500" title="Admin slab price">⭐</span>
                          )}
                        </div>
                        <div className="text-[9px] text-[var(--muted-fg)] font-medium mt-0.5">
                          ₹{presetCalc.price}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quantity Pack Selector */}
              <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--muted)]/20 p-3">
                <div>
                  <span className="text-xs font-black text-[var(--fg)]">Quantity of Packets</span>
                  <p className="text-[10px] text-[var(--muted-fg)] font-medium">
                    {parsedWeight.isValid ? `${parsedWeight.displayWeight} each` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--card)] p-1">
                  <button
                    type="button"
                    onClick={() => setPackQty(Math.max(1, packQty - 1))}
                    disabled={packQty <= 1}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--fg)] hover:bg-[var(--primary)] hover:text-white disabled:opacity-40 transition-all"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="text-sm font-extrabold text-[var(--fg)] min-w-[20px] text-center">
                    {packQty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPackQty(packQty + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--fg)] hover:bg-[var(--primary)] hover:text-white transition-all"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--border)] p-4 bg-[var(--card)] flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Total Amount</span>
                <span className="text-xl font-black text-[var(--primary)]">
                  {priceResult ? `₹${totalPrice}` : '₹0'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-[var(--border)] px-4 py-2.5 text-xs font-bold text-[var(--muted-fg)] hover:bg-[var(--muted)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!parsedWeight.isValid || !priceResult}
                  className="btn-premium flex items-center gap-2 rounded-full px-6 py-2.5 text-xs font-extrabold disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                >
                  <ShoppingBag className="h-4 w-4" />
                  <span>
                    {actionButtonLabel}
                    {priceResult ? ` (${priceResult.displayWeight} • ₹${totalPrice})` : ''}
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
