/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { WeightSlab } from '../types';
import {
  formatWeight,
  parseWeightToGrams,
  calculateWeightPrice,
  getPricingPreviewList,
  isKgProduct
} from '../utils/weightParser';
import {
  Scale,
  Plus,
  Trash2,
  Sparkles,
  Calculator,
  AlertCircle,
  Zap,
  ShieldCheck,
  Layers,
  Edit2,
  Check,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

interface AdminWeightSlabsEditorProps {
  basePrice: number;
  baseWeight: string;
  unit?: string;
  weightSlabs: WeightSlab[];
  onBasePriceChange: (newPrice: number) => void;
  onBaseWeightChange: (newWeight: string) => void;
  onWeightSlabsChange: (newSlabs: WeightSlab[]) => void;
  productName?: string;
  productEmoji?: string;
  isCompact?: boolean;
}

export const AdminWeightSlabsEditor: React.FC<AdminWeightSlabsEditorProps> = ({
  basePrice,
  baseWeight,
  unit,
  weightSlabs = [],
  onBasePriceChange,
  onBaseWeightChange,
  onWeightSlabsChange,
  productName = 'Vegetable',
  productEmoji = '🥦',
  isCompact = false
}) => {
  const isKg = isKgProduct({ unit, weight: baseWeight });

  if (!isKg) {
    return null;
  }
  // Input state for adding a new custom slab
  const [newSlabWeightInput, setNewSlabWeightInput] = useState('500g');
  const [newSlabPriceInput, setNewSlabPriceInput] = useState('');
  const [slabInputError, setSlabInputError] = useState<string | null>(null);

  // Slab being actively edited inline
  const [editingSlabGrams, setEditingSlabGrams] = useState<number | null>(null);
  const [editWeightInput, setEditWeightInput] = useState('');
  const [editPriceInput, setEditPriceInput] = useState('');
  const [editSlabError, setEditSlabError] = useState<string | null>(null);

  // Live tester state
  const [testWeightInput, setTestWeightInput] = useState('750g');

  // Parse new slab weight
  const parsedNewSlab = useMemo(() => {
    return parseWeightToGrams(newSlabWeightInput);
  }, [newSlabWeightInput]);

  // Suggested price based on current base calculation
  const suggestedPrice = useMemo(() => {
    if (!parsedNewSlab.isValid || parsedNewSlab.grams <= 0) return 0;
    const res = calculateWeightPrice(basePrice, baseWeight, parsedNewSlab.grams);
    return res.price;
  }, [basePrice, baseWeight, parsedNewSlab]);

  // Full Live Pricing Breakdown Preview
  const pricingPreview = useMemo(() => {
    return getPricingPreviewList(basePrice, baseWeight, weightSlabs);
  }, [basePrice, baseWeight, weightSlabs]);

  // Live test result
  const testResult = useMemo(() => {
    const parsed = parseWeightToGrams(testWeightInput);
    if (!parsed.isValid || parsed.grams <= 0) return null;
    return calculateWeightPrice(basePrice, baseWeight, parsed.grams, weightSlabs);
  }, [testWeightInput, basePrice, baseWeight, weightSlabs]);

  // 1. ADD SLAB HANDLER (with strict duplicate prevention)
  const handleAddSlab = (gramsToAdd?: number, priceToAdd?: number) => {
    setSlabInputError(null);

    let targetGrams = gramsToAdd;
    let targetPrice = priceToAdd;

    if (targetGrams === undefined) {
      if (!parsedNewSlab.isValid || parsedNewSlab.grams <= 0) {
        setSlabInputError('Please enter a valid weight (e.g. 500g, 750g, 1kg, 2kg)');
        return;
      }
      targetGrams = parsedNewSlab.grams;
    }

    if (targetPrice === undefined) {
      const parsedPrice = parseFloat(newSlabPriceInput);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        setSlabInputError('Please enter a valid slab price in ₹ (e.g. 40, 100, 180)');
        return;
      }
      targetPrice = parsedPrice;
    }

    const weightLabel = formatWeight(targetGrams);

    // PREVENT DUPLICATE WEIGHT SLABS
    const duplicate = weightSlabs.find((s) => s.grams === targetGrams);
    if (duplicate) {
      setSlabInputError(
        `Duplicate weight slab prevented! A slab for ${weightLabel} already exists (₹${duplicate.price}). Use the Edit button below to change its price.`
      );
      return;
    }

    const newSlab: WeightSlab = {
      id: `slab_${Date.now()}_${targetGrams}`,
      grams: targetGrams,
      weightLabel,
      price: Math.round(targetPrice),
      enabled: true,
    };

    const updatedSlabs = [...weightSlabs, newSlab].sort((a, b) => a.grams - b.grams);
    onWeightSlabsChange(updatedSlabs);

    // Reset input
    setNewSlabPriceInput('');
    setSlabInputError(null);
  };

  // 2. START EDITING SLAB
  const handleStartEdit = (slab: WeightSlab) => {
    setEditingSlabGrams(slab.grams);
    setEditWeightInput(slab.weightLabel || formatWeight(slab.grams));
    setEditPriceInput(String(slab.price));
    setEditSlabError(null);
  };

  // 2. CANCEL EDITING SLAB
  const handleCancelEdit = () => {
    setEditingSlabGrams(null);
    setEditWeightInput('');
    setEditPriceInput('');
    setEditSlabError(null);
  };

  // 2. SAVE EDITED SLAB (with strict duplicate prevention)
  const handleSaveEdit = (originalGrams: number) => {
    setEditSlabError(null);

    const parsedWeight = parseWeightToGrams(editWeightInput);
    if (!parsedWeight.isValid || parsedWeight.grams <= 0) {
      setEditSlabError('Please enter a valid weight (e.g. 500g, 1kg, 2kg)');
      return;
    }

    const newPrice = parseFloat(editPriceInput);
    if (isNaN(newPrice) || newPrice <= 0) {
      setEditSlabError('Please enter a valid price in ₹ (e.g. 40, 100)');
      return;
    }

    const newGrams = parsedWeight.grams;
    const newLabel = formatWeight(newGrams);

    // Check for duplicate weight on ANOTHER slab
    const duplicate = weightSlabs.find(
      (s) => s.grams === newGrams && s.grams !== originalGrams
    );
    if (duplicate) {
      setEditSlabError(
        `Duplicate weight prevented! Another slab for ${newLabel} already exists (₹${duplicate.price}). Each weight can only have one slab.`
      );
      return;
    }

    const updated = weightSlabs
      .map((s) => {
        if (s.grams === originalGrams) {
          return {
            ...s,
            grams: newGrams,
            weightLabel: newLabel,
            price: Math.round(newPrice),
          };
        }
        return s;
      })
      .sort((a, b) => a.grams - b.grams);

    onWeightSlabsChange(updated);
    handleCancelEdit();
  };

  // 3. DELETE SLAB
  const handleRemoveSlab = (gramsToRemove: number) => {
    const updated = weightSlabs.filter((s) => s.grams !== gramsToRemove);
    onWeightSlabsChange(updated);
    if (editingSlabGrams === gramsToRemove) {
      handleCancelEdit();
    }
  };

  // 4. ENABLE / DISABLE SLAB
  const handleToggleSlab = (gramsToToggle: number) => {
    const updated = weightSlabs.map((s) => {
      if (s.grams === gramsToToggle) {
        const currentlyEnabled = s.enabled !== false;
        return {
          ...s,
          enabled: !currentlyEnabled,
        };
      }
      return s;
    });
    onWeightSlabsChange(updated);
  };

  // Quick preset filler
  const handleQuickAddPreset = (grams: number) => {
    const autoPrice = calculateWeightPrice(basePrice, baseWeight, grams).price;
    setNewSlabWeightInput(formatWeight(grams));
    setNewSlabPriceInput(String(autoPrice));
    setSlabInputError(null);
  };

  // 1-Click Example Loader: 500g → ₹40, 1kg → ₹100, 2kg → ₹180
  const handleLoadStandardExample = () => {
    onBasePriceChange(100);
    onBaseWeightChange('per kg');
    const exampleSlabs: WeightSlab[] = [
      { id: `slab_${Date.now()}_500`, grams: 500, weightLabel: '500g', price: 40, enabled: true },
      { id: `slab_${Date.now()}_1000`, grams: 1000, weightLabel: '1kg', price: 100, enabled: true },
      { id: `slab_${Date.now()}_2000`, grams: 2000, weightLabel: '2kg', price: 180, enabled: true },
    ];
    onWeightSlabsChange(exampleSlabs);
    setSlabInputError(null);
  };

  const handleClearAllSlabs = () => {
    onWeightSlabsChange([]);
    handleCancelEdit();
  };

  const hasCustomSlabs = weightSlabs.length > 0;
  const activeSlabsCount = weightSlabs.filter((s) => s.enabled !== false).length;
  const disabledSlabsCount = weightSlabs.length - activeSlabsCount;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Scale className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-black text-[var(--fg)]">Vegetable Pricing & Weight Slabs</h4>
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[9px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
                Priority Rules
              </span>
            </div>
            <p className="text-[11px] text-[var(--muted-fg)]">
              Base ₹/kg auto-calculation with optional priority weight slabs.
            </p>
          </div>
        </div>

        {/* Status Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {hasCustomSlabs ? (
            <>
              <span className="rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700/60 px-2.5 py-1 text-[10px] font-extrabold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                <Layers className="h-3 w-3" />
                <span>{activeSlabsCount} Active Slab{activeSlabsCount !== 1 ? 's' : ''}</span>
              </span>
              {disabledSlabsCount > 0 && (
                <span className="rounded-full bg-gray-100 dark:bg-neutral-800 border border-gray-300 dark:border-neutral-700 px-2 py-0.5 text-[10px] font-bold text-[var(--muted-fg)]">
                  {disabledSlabsCount} Disabled
                </span>
              )}
            </>
          ) : (
            <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700/60 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
              <Zap className="h-3 w-3" />
              <span>100% Automatic Calculation</span>
            </span>
          )}
        </div>
      </div>

      {/* ── SECTION 1: AUTOMATIC PRICING (BASE RATE) ── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-emerald-600 text-white text-[10px] font-black">
              1
            </span>
            <span className="text-xs font-black text-[var(--fg)]">Automatic Pricing (Base ₹/kg Rate)</span>
          </div>
          <span className="text-[10px] font-semibold text-[var(--muted-fg)]">Standard baseline</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">
              Base Price (₹) *
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-xs font-bold text-[var(--muted-fg)]">₹</span>
              <input
                type="number"
                min={1}
                required
                value={basePrice}
                onChange={(e) => onBasePriceChange(Math.max(1, Number(e.target.value)))}
                placeholder="e.g. 100"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] pl-7 pr-3 py-2 text-xs font-bold text-[var(--fg)] outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">
              Base Metric Unit *
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                required
                value={baseWeight}
                onChange={(e) => onBaseWeightChange(e.target.value)}
                placeholder="per kg"
                className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)]"
              />
              <button
                type="button"
                onClick={() => onBaseWeightChange('per kg')}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-[10px] font-bold text-[var(--muted-fg)] hover:text-[var(--fg)] hover:border-[var(--primary)] whitespace-nowrap cursor-pointer transition-colors"
              >
                1 kg
              </button>
            </div>
          </div>
        </div>

        {/* Automatic calculation formula preview */}
        <div className="rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/50 p-2.5 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
          <Zap className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <div className="space-y-0.5 leading-relaxed text-[11px]">
            <p className="font-bold">
              Base Price = ₹{basePrice}/{baseWeight || 'kg'}
            </p>
            <p className="text-emerald-800 dark:text-emerald-300">
              When no custom slab exists, price is automatically calculated proportionally from the ₹/kg rate.
            </p>
            <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
              Examples:
              <span className="font-semibold ml-1">
                500g → ₹{calculateWeightPrice(basePrice, baseWeight, 500).price}, 750g → ₹{calculateWeightPrice(basePrice, baseWeight, 750).price}, 1kg → ₹{calculateWeightPrice(basePrice, baseWeight, 1000).price}, 2kg → ₹{calculateWeightPrice(basePrice, baseWeight, 2000).price}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: CUSTOM WEIGHT SLABS (OPTIONAL) ── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-amber-500 text-white text-[10px] font-black">
              2
            </span>
            <div>
              <span className="text-xs font-black text-[var(--fg)]">Custom Weight Prices (Slabs)</span>
              <span className="ml-1.5 rounded bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-800 dark:text-amber-300 uppercase">
                Optional
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick 1-click standard example loader */}
            <button
              type="button"
              onClick={handleLoadStandardExample}
              className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-800 rounded-lg px-2.5 py-1 cursor-pointer transition-colors flex items-center gap-1"
              title="Loads ₹100/kg with 500g → ₹40, 1kg → ₹100, 2kg → ₹180"
            >
              <Sparkles className="h-3 w-3 text-amber-600" />
              <span>Load 500g/1kg/2kg Example</span>
            </button>

            {hasCustomSlabs && (
              <button
                type="button"
                onClick={handleClearAllSlabs}
                className="text-[10px] font-bold text-red-500 hover:text-red-700 cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" />
                <span>Reset All</span>
              </button>
            )}
          </div>
        </div>

        {/* Priority & Rules Banner */}
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 p-2.5 text-[11px] text-amber-900 dark:text-amber-200 space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <ShieldCheck className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span>Slab Priority & Operational Rules:</span>
          </div>
          <ul className="list-disc list-inside text-[10.5px] leading-relaxed text-amber-800 dark:text-amber-300 space-y-0.5">
            <li><strong>Enabled slab price = highest priority.</strong> If set and active, that exact price is charged.</li>
            <li><strong>Disabled slab or no slab = automatic calculation</strong> using base ₹/kg price.</li>
            <li><strong>Duplicate weights are strictly prevented:</strong> each vegetable can have at most one slab per weight.</li>
            <li><strong>Optional:</strong> Admin is NOT forced to create weight slabs.</li>
          </ul>
        </div>

        {/* ── ADD SLAB FORM ── */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="text-[11px] font-extrabold text-[var(--fg)]">Add New Weight Slab:</span>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[9px] text-[var(--muted-fg)] font-semibold">Quick presets:</span>
              {[250, 500, 750, 1000, 1500, 2000].map((grams) => {
                const isAlreadyPresent = weightSlabs.some((s) => s.grams === grams);
                return (
                  <button
                    key={grams}
                    type="button"
                    disabled={isAlreadyPresent}
                    onClick={() => handleQuickAddPreset(grams)}
                    className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold transition-all ${
                      isAlreadyPresent
                        ? 'border-gray-200 dark:border-neutral-800 text-gray-400 dark:text-neutral-600 cursor-not-allowed line-through'
                        : 'border-[var(--border)] bg-[var(--bg)] text-[var(--muted-fg)] hover:border-amber-500 hover:text-amber-600 cursor-pointer'
                    }`}
                    title={isAlreadyPresent ? `${formatWeight(grams)} slab already added` : `Preset ${formatWeight(grams)}`}
                  >
                    {formatWeight(grams)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">
                Weight (e.g. 500g, 1kg, 2kg)
              </label>
              <input
                type="text"
                value={newSlabWeightInput}
                onChange={(e) => {
                  setNewSlabWeightInput(e.target.value);
                  setSlabInputError(null);
                }}
                placeholder="e.g. 500g, 1kg, 2kg"
                className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">
                  Custom Price (₹)
                </label>
                {suggestedPrice > 0 && (
                  <span className="text-[9px] text-[var(--muted-fg)]">
                    Auto rate: ₹{suggestedPrice}
                  </span>
                )}
              </div>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-xs font-bold text-[var(--muted-fg)]">₹</span>
                <input
                  type="number"
                  min={1}
                  value={newSlabPriceInput}
                  onChange={(e) => {
                    setNewSlabPriceInput(e.target.value);
                    setSlabInputError(null);
                  }}
                  placeholder={suggestedPrice > 0 ? `e.g. ${suggestedPrice}` : 'e.g. 40'}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] pl-7 pr-3 py-1.5 text-xs font-bold text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleAddSlab()}
              className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Slab</span>
            </button>
          </div>

          {/* Inline Duplicate Prevention & Error Notice */}
          {slabInputError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 p-2 text-[10.5px] text-red-700 dark:text-red-300 flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500 mt-0.5" />
              <span>{slabInputError}</span>
            </div>
          )}
        </div>

        {/* ── CONFIGURED SLABS LIST (EDIT, DELETE, ENABLE/DISABLE) ── */}
        {hasCustomSlabs ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-fg)]">
                Configured Weight Slabs ({weightSlabs.length})
              </span>
              <span className="text-[10px] text-[var(--muted-fg)]">
                Edit, delete or toggle enable/disable anytime
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {weightSlabs.map((slab) => {
                const isEditing = editingSlabGrams === slab.grams;
                const isEnabled = slab.enabled !== false;
                const autoCalc = calculateWeightPrice(basePrice, baseWeight, slab.grams).price;
                const diff = slab.price - autoCalc;

                if (isEditing) {
                  return (
                    <div
                      key={slab.grams}
                      className="rounded-xl border-2 border-[var(--primary)] bg-[var(--card)] p-3 space-y-2.5 shadow-md col-span-1 sm:col-span-2"
                    >
                      <div className="flex items-center justify-between border-b border-[var(--border)] pb-1.5">
                        <span className="text-xs font-black text-[var(--fg)] flex items-center gap-1.5">
                          <Edit2 className="h-3.5 w-3.5 text-[var(--primary)]" />
                          <span>Edit Slab: {slab.weightLabel || formatWeight(slab.grams)}</span>
                        </span>
                        <span className="text-[10px] text-[var(--muted-fg)]">Modify weight or price</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">
                            Weight (e.g. 500g, 1kg, 2kg)
                          </label>
                          <input
                            type="text"
                            value={editWeightInput}
                            onChange={(e) => {
                              setEditWeightInput(e.target.value);
                              setEditSlabError(null);
                            }}
                            className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs font-bold text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">
                            Price in ₹
                          </label>
                          <div className="relative flex items-center">
                            <span className="absolute left-3 text-xs font-bold text-[var(--muted-fg)]">₹</span>
                            <input
                              type="number"
                              min={1}
                              value={editPriceInput}
                              onChange={(e) => {
                                setEditPriceInput(e.target.value);
                                setEditSlabError(null);
                              }}
                              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] pl-7 pr-3 py-1.5 text-xs font-black text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                            />
                          </div>
                        </div>
                      </div>

                      {editSlabError && (
                        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 p-2 text-[10.5px] text-red-700 dark:text-red-300 flex items-start gap-1.5">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500 mt-0.5" />
                          <span>{editSlabError}</span>
                        </div>
                      )}

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-bold text-[var(--muted-fg)] hover:bg-[var(--muted)] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(slab.grams)}
                          className="rounded-lg bg-[var(--primary)] px-3.5 py-1 text-xs font-black text-white hover:opacity-90 flex items-center gap-1 shadow-sm cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Save Slab</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={slab.grams}
                    className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-all shadow-xs ${
                      isEnabled
                        ? 'border-amber-200 dark:border-amber-800/80 bg-amber-50/40 dark:bg-amber-950/20'
                        : 'border-gray-200 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-900/30 opacity-70'
                    }`}
                  >
                    {/* Left: Weight & Badge */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`rounded-lg px-2 py-1 text-xs font-black whitespace-nowrap ${
                          isEnabled
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : 'bg-gray-200 dark:bg-neutral-800 text-gray-600 dark:text-neutral-400'
                        }`}
                      >
                        {slab.weightLabel || formatWeight(slab.grams)}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          {isEnabled ? (
                            <span className="text-[9px] font-black uppercase text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/60 px-1 py-0.2 rounded">
                              ⭐ Priority
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold uppercase text-gray-500 dark:text-neutral-400 bg-gray-200 dark:bg-neutral-800 px-1 py-0.2 rounded">
                              Disabled
                            </span>
                          )}
                        </div>

                        <p className="text-[10px] text-[var(--muted-fg)] mt-0.5 truncate">
                          {isEnabled ? (
                            <>
                              Auto was ₹{autoCalc}{' '}
                              {diff !== 0 && (
                                <span className={diff < 0 ? 'text-emerald-600 font-bold' : 'text-orange-600 font-bold'}>
                                  ({diff < 0 ? `-₹${Math.abs(diff)}` : `+₹${diff}`})
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="italic">Falls back to auto ₹{autoCalc}</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Right: Price & Action Controls */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Price Pill */}
                      <span
                        className={`text-xs font-black px-2 py-1 rounded-lg border ${
                          isEnabled
                            ? 'bg-[var(--card)] border-amber-300 dark:border-amber-700 text-[var(--fg)]'
                            : 'bg-gray-100 dark:bg-neutral-800 border-gray-300 dark:border-neutral-700 text-gray-400 line-through'
                        }`}
                        title={isEnabled ? 'Custom slab price' : 'Slab is disabled'}
                      >
                        ₹{slab.price}
                      </span>

                      {/* Enable/Disable Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleSlab(slab.grams)}
                        className={`p-1 rounded-lg transition-colors cursor-pointer ${
                          isEnabled
                            ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                            : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800'
                        }`}
                        title={isEnabled ? 'Click to disable slab (reverts to auto base rate)' : 'Click to enable slab (applies custom price)'}
                      >
                        {isEnabled ? (
                          <ToggleRight className="h-4 w-4" />
                        ) : (
                          <ToggleLeft className="h-4 w-4" />
                        )}
                      </button>

                      {/* Edit Slab Button */}
                      <button
                        type="button"
                        onClick={() => handleStartEdit(slab)}
                        className="p-1 text-gray-400 hover:text-[var(--primary)] hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
                        title="Edit slab weight or price"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>

                      {/* Delete Slab Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveSlab(slab.grams)}
                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                        title="Delete slab (permanently remove)"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-3 text-center text-xs text-[var(--muted-fg)]">
            <span>No custom slabs configured. All customer weights are calculated automatically using base price ₹{basePrice}/kg.</span>
          </div>
        )}
      </div>

      {/* ── SECTION 3: LIVE EFFECTIVE PRICING PREVIEW TABLE ── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Calculator className="h-4 w-4 text-[var(--primary)]" />
            <h5 className="text-xs font-black text-[var(--fg)]">Live Effective Customer Pricing Table</h5>
          </div>
          <span className="text-[10px] text-[var(--muted-fg)]">Real-time priority resolution</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--muted)]/50 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-fg)] border-b border-[var(--border)]">
              <tr>
                <th className="py-2 px-3">Weight</th>
                <th className="py-2 px-3">Customer Price</th>
                <th className="py-2 px-3">Pricing Rule Applied</th>
                <th className="py-2 px-3">Calculation Breakdown</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-[var(--card)]">
              {pricingPreview.map((item) => (
                <tr
                  key={item.grams}
                  className={`transition-colors ${
                    item.isCustomSlab
                      ? 'bg-amber-50/30 dark:bg-amber-950/10 font-semibold'
                      : item.isDisabledSlab
                      ? 'bg-gray-50/30 dark:bg-neutral-900/10'
                      : 'hover:bg-[var(--muted)]/30'
                  }`}
                >
                  <td className="py-2.5 px-3 font-bold text-[var(--fg)]">
                    {item.label}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-sm font-black text-[var(--primary)]">
                      {item.formattedPrice}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    {item.isCustomSlab ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:text-amber-200">
                        ⭐ admin-defined (Highest Priority)
                      </span>
                    ) : item.isDisabledSlab ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-200 dark:bg-neutral-800 px-2 py-0.5 text-[10px] font-bold text-gray-600 dark:text-neutral-400">
                        ⚡ system-calculated (Slab Disabled)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:text-emerald-300">
                        ⚡ system-calculated (Base ₹/kg)
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-[var(--muted-fg)]">
                    {item.isCustomSlab ? (
                      <span>Manual slab override applied (base auto was ₹{item.baseComparisonPrice})</span>
                    ) : item.isDisabledSlab ? (
                      <span>Slab disabled by admin → calculated from ₹{basePrice}/kg</span>
                    ) : (
                      <span>₹{Math.round((basePrice / 1000) * 1000)}/kg × {item.label} = {item.formattedPrice}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Test Any Weight Simulator */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[var(--fg)]">🔬 Test Any Weight:</span>
            <input
              type="text"
              value={testWeightInput}
              onChange={(e) => setTestWeightInput(e.target.value)}
              placeholder="e.g. 300g, 650g, 750g, 1.25kg, 1.5kg, 2kg"
              className="w-28 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs font-bold text-[var(--fg)] text-center outline-none focus:border-[var(--primary)]"
            />
          </div>

          {testResult ? (
            <div className="flex items-center gap-2">
              <span className="text-[var(--muted-fg)]">Customer will pay:</span>
              <span className="text-sm font-black text-[var(--primary)]">
                ₹{testResult.price}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-black ${
                  testResult.isCustomSlab
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                }`}
              >
                {testResult.isCustomSlab ? '⭐ admin-defined' : '⚡ system-calculated'}
              </span>
            </div>
          ) : (
            <span className="text-[10px] text-[var(--muted-fg)]">Enter a weight above to test</span>
          )}
        </div>
      </div>
    </div>
  );
};
