/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WeightSlab } from '../types';

/**
 * Utility for parsing, converting, and calculating vegetable weights and prices.
 * Converts any user-entered weight string (e.g. "300g", "650g", "750g", "1.25kg", "1.5kg", "2.25kg")
 * into grams internally for precise, consistent retail calculations.
 */

export interface ParsedWeight {
  grams: number;
  displayWeight: string;
  unit: 'g' | 'kg';
  value: number;
  isValid: boolean;
  error?: string;
}

export interface WeightPriceResult {
  price: number;              // Final rounded integer price in rupees (e.g. 40 or 75)
  exactPrice: number;         // Float price with decimals (e.g. 40 or 75.0)
  formattedPrice: string;     // e.g. "₹40"
  pricePerKg: number;         // e.g. 100
  pricePerGram: number;       // e.g. 0.1
  displayWeight: string;      // e.g. "500g" or "1.5 kg"
  grams: number;              // e.g. 500 or 1500
  formulaText: string;        // e.g. "500g → ₹40 (admin-defined)" or "750g → ₹75 (system-calculated)"
  isCustomSlab: boolean;      // true if matched an admin-defined slab
  pricingSource: 'admin-defined' | 'system-calculated';
  matchedSlab?: WeightSlab;
}

/**
 * Common preset weights for quick vegetable selection
 */
export const WEIGHT_PRESETS = [
  { label: '250g', grams: 250 },
  { label: '500g', grams: 500 },
  { label: '750g', grams: 750 },
  { label: '1 kg', grams: 1000 },
  { label: '1.5 kg', grams: 1500 },
  { label: '2 kg', grams: 2000 },
];

/**
 * Standard product selling units
 */
export interface SellingUnitOption {
  value: string;
  label: string;
  allowsWeightCatalog: boolean;
  defaultMetric: string;
  description: string;
}

export const SELLING_UNITS: SellingUnitOption[] = [
  {
    value: 'kg',
    label: 'Kilogram (kg)',
    allowsWeightCatalog: true,
    defaultMetric: 'per kg',
    description: 'Enables Weight Catalog: 250g, 500g, 750g, 1kg, custom grams & slabs',
  },
  {
    value: 'piece',
    label: 'Piece (per pc / piece)',
    allowsWeightCatalog: false,
    defaultMetric: 'per piece',
    description: 'Sold in whole pieces (1, 2, 3...). Weight slabs disabled.',
  },
  {
    value: 'bunch',
    label: 'Bunch (per bunch)',
    allowsWeightCatalog: false,
    defaultMetric: 'per bunch',
    description: 'Sold in whole bunches. Weight slabs disabled.',
  },
  {
    value: 'packet',
    label: 'Packet / Pack (per pack)',
    allowsWeightCatalog: false,
    defaultMetric: 'per pack',
    description: 'Sold in sealed packs. Weight slabs disabled.',
  },
  {
    value: 'dozen',
    label: 'Dozen (12 pcs)',
    allowsWeightCatalog: false,
    defaultMetric: 'per dozen',
    description: 'Sold per dozen. Weight slabs disabled.',
  },
  {
    value: 'other',
    label: 'Other Unit',
    allowsWeightCatalog: false,
    defaultMetric: 'per unit',
    description: 'Custom whole selling unit. Weight slabs disabled.',
  },
];

/**
 * Checks whether a product has "kg" as its selling unit.
 * Weight Management (slabs, custom grams, 250g, 500g, 750g, 1kg) is ONLY enabled for kg products.
 */
export function isKgProduct(product?: { unit?: string; weight?: string } | null): boolean {
  if (!product) return false;
  if (product.unit !== undefined && product.unit !== null && String(product.unit).trim() !== '') {
    const u = String(product.unit).toLowerCase().trim();
    return u === 'kg' || u === 'kilogram' || u === 'kilo';
  }
  if (product.weight) {
    const w = String(product.weight).toLowerCase().trim();
    if (
      w.includes('piece') ||
      w.includes('pc') ||
      w.includes('bunch') ||
      w.includes('packet') ||
      w.includes('pack') ||
      w.includes('dozen') ||
      w.includes('box') ||
      w.includes('tray') ||
      w.includes('bottle')
    ) {
      return false;
    }
    return w.includes('kg') || w === 'per kg';
  }
  return false;
}

/**
 * Returns normalized selling unit for a product ('kg', 'piece', 'bunch', 'packet', 'dozen', or custom)
 */
export function getProductSellingUnit(product?: { unit?: string; weight?: string } | null): string {
  if (!product) return 'piece';
  if (product.unit !== undefined && product.unit !== null && String(product.unit).trim() !== '') {
    const u = String(product.unit).toLowerCase().trim();
    if (u === 'kg' || u === 'kilogram' || u === 'kilo') return 'kg';
    if (u.includes('piece') || u === 'pc') return 'piece';
    if (u.includes('bunch')) return 'bunch';
    if (u.includes('pack')) return 'packet';
    if (u.includes('dozen')) return 'dozen';
    return u;
  }
  if (product.weight) {
    const w = String(product.weight).toLowerCase().trim();
    if (w.includes('bunch')) return 'bunch';
    if (w.includes('piece') || w.includes('pc')) return 'piece';
    if (w.includes('pack')) return 'packet';
    if (w.includes('dozen')) return 'dozen';
    if (w.includes('kg') || w === 'per kg') return 'kg';
  }
  return 'kg';
}

/**
 * Extract base weight in grams from a product's weight specification (e.g. "per kg", "500g pack", "100g pack")
 */
export function getBaseWeightInGrams(weightStr?: string): number {
  if (!weightStr) return 1000;
  const str = weightStr.toLowerCase().trim();

  // "per kg", "1 kg", "1kg", "kg"
  if (str === 'per kg' || str === '1 kg' || str === '1kg' || str === 'kg') {
    return 1000;
  }

  // Check for explicit "X kg" e.g. "2 kg"
  const kgMatch = str.match(/(\d+(?:\.\d+)?)\s*kg/);
  if (kgMatch && kgMatch[1]) {
    return Math.max(1, parseFloat(kgMatch[1]) * 1000);
  }

  // Check for explicit "X g" or "Xgm" or "X grams"
  const gMatch = str.match(/(\d+(?:\.\d+)?)\s*g(?:m|ram|rams)?/);
  if (gMatch && gMatch[1]) {
    return Math.max(1, parseFloat(gMatch[1]));
  }

  // Default to standard 1 kg (1000 grams)
  return 1000;
}

/**
 * Parses user input into grams internally.
 * Supports:
 * - "300g", "650g", "750g"
 * - "1.25kg", "1.5kg", "2.25kg"
 * - "1.25 kg", "300 gm", "500 grams"
 * - Raw numbers with context unit: e.g. 300 (interpreted as 300g) or 1.5 (interpreted as 1.5kg)
 */
export function parseWeightToGrams(rawInput: string | number, defaultUnit: 'g' | 'kg' = 'g'): ParsedWeight {
  if (typeof rawInput === 'number') {
    if (isNaN(rawInput) || rawInput <= 0) {
      return { grams: 0, displayWeight: '', unit: defaultUnit, value: 0, isValid: false, error: 'Enter a valid weight' };
    }
    const grams = defaultUnit === 'kg' ? Math.round(rawInput * 1000) : Math.round(rawInput);
    return {
      grams,
      displayWeight: formatWeight(grams),
      unit: defaultUnit,
      value: rawInput,
      isValid: grams >= 10,
    };
  }

  const input = (rawInput || '').trim().toLowerCase();
  if (!input) {
    return { grams: 0, displayWeight: '', unit: defaultUnit, value: 0, isValid: false, error: 'Enter weight (e.g. 300g, 1.5kg)' };
  }

  // Match pattern: number followed optionally by unit
  // Example: "1.25kg", "300g", "650 gm", "2.25", "750"
  const regex = /^([\d.]+)\s*(kg|kilos|kilo|k|g|gm|grams|gram)?$/i;
  const match = input.match(regex);

  if (!match) {
    return { grams: 0, displayWeight: '', unit: defaultUnit, value: 0, isValid: false, error: 'Invalid format. Use 300g, 750g, 1.25kg' };
  }

  const numVal = parseFloat(match[1]);
  if (isNaN(numVal) || numVal <= 0) {
    return { grams: 0, displayWeight: '', unit: defaultUnit, value: 0, isValid: false, error: 'Weight must be greater than 0' };
  }

  const unitStr = match[2]?.toLowerCase();
  let grams = 0;
  let unit: 'g' | 'kg' = defaultUnit;

  if (unitStr) {
    if (unitStr.startsWith('k')) {
      grams = Math.round(numVal * 1000);
      unit = 'kg';
    } else {
      grams = Math.round(numVal);
      unit = 'g';
    }
  } else {
    // If no unit provided, infer smartly:
    // If <= 20 or contains decimal point (e.g. 1.25, 1.5, 2.25), user almost certainly means kg
    // If >= 25 (e.g. 300, 650, 750), user means grams
    if (defaultUnit === 'kg' || numVal <= 20 || input.includes('.')) {
      grams = Math.round(numVal * 1000);
      unit = 'kg';
    } else {
      grams = Math.round(numVal);
      unit = 'g';
    }
  }

  if (grams < 25) {
    return {
      grams,
      displayWeight: formatWeight(grams),
      unit,
      value: numVal,
      isValid: false,
      error: 'Minimum order weight is 25g',
    };
  }

  if (grams > 25000) {
    return {
      grams,
      displayWeight: formatWeight(grams),
      unit,
      value: numVal,
      isValid: false,
      error: 'Maximum weight is 25 kg per item',
    };
  }

  return {
    grams,
    displayWeight: formatWeight(grams),
    unit,
    value: numVal,
    isValid: true,
  };
}

/**
 * Format grams into clean, human-readable retail weight:
 * - 300g => "300g"
 * - 650g => "650g"
 * - 750g => "750g"
 * - 1000g => "1 kg"
 * - 1250g => "1.25 kg"
 * - 1500g => "1.5 kg"
 * - 2250g => "2.25 kg"
 */
export function formatWeight(grams: number): string {
  if (!grams || grams <= 0) return '0g';
  if (grams < 1000) {
    return `${grams}g`;
  }
  const kg = grams / 1000;
  // Strip trailing zeros after decimal (e.g. 1.50 -> 1.5, 1.00 -> 1)
  const formattedKg = parseFloat(kg.toFixed(3));
  return `${formattedKg} kg`;
}

/**
 * Calculate price instantly for a target weight in grams.
 * 
 * IMPORTANT RULE:
 * 1. Custom / admin-defined slab price = HIGHEST PRIORITY.
 *    If the admin manually set a slab for this weight, that exact price must be used.
 * 2. No custom slab = automatically calculate proportionally using base ₹/kg price.
 * 3. The admin is NOT forced to create weight slabs (slabs are optional).
 */
export function calculateWeightPrice(
  basePrice: number,
  baseWeightStr: string | undefined,
  targetGrams: number,
  weightSlabs?: WeightSlab[]
): WeightPriceResult {
  const baseGrams = getBaseWeightInGrams(baseWeightStr);
  // Base Price per kg:
  // If baseWeightStr is 'per kg' (1000g), basePricePerKg is basePrice (e.g. ₹100/kg)
  // If baseWeightStr is '500g' with basePrice 40, basePricePerKg is (40 / 500) * 1000 = ₹80/kg
  const basePricePerKg = baseGrams > 0 ? (basePrice / baseGrams) * 1000 : basePrice;
  const pricePerGram = basePricePerKg / 1000;
  const roundedBasePricePerKg = Math.round(basePricePerKg);
  const displayWeight = formatWeight(targetGrams);

  // 1. Check whether the selected weight has an admin-defined slab.
  if (Array.isArray(weightSlabs) && weightSlabs.length > 0) {
    const matchedSlab = weightSlabs.find((s) => {
      if (!s || typeof s.price !== 'number' || s.price < 0) return false;
      // If slab is disabled by admin, ignore it and fall back to base-price calculation
      if (s.enabled === false) return false;
      // Match by exact grams
      if (s.grams === targetGrams) return true;
      // Also match if the label resolves to the same targetGrams
      if (s.weightLabel) {
        const parsed = parseWeightToGrams(s.weightLabel);
        if (parsed.isValid && parsed.grams === targetGrams) return true;
      }
      return false;
    });

    // 2. If yes, use the slab price.
    if (matchedSlab) {
      const slabPrice = Math.max(1, Math.round(matchedSlab.price));
      return {
        price: slabPrice,
        exactPrice: matchedSlab.price,
        formattedPrice: `₹${slabPrice}`,
        pricePerKg: roundedBasePricePerKg,
        pricePerGram,
        displayWeight,
        grams: targetGrams,
        formulaText: `${displayWeight} → ₹${slabPrice} (Admin-defined slab)`,
        isCustomSlab: true,
        pricingSource: 'admin-defined',
        matchedSlab,
      };
    }
  }

  // 3. If no, calculate using the vegetable's base price per kg.
  // Formula: Price = Weight in grams × (Base Price per kg ÷ 1000)
  // Example: Base price = ₹100/kg, 750g: 750 × (100 ÷ 1000) = ₹75
  const exactCalculation = targetGrams * (basePricePerKg / 1000);

  // Proper currency rounding (to nearest whole rupee for retail vegetable display, preserving 2-decimal exact calculation)
  const roundedRupees = Math.max(1, Math.round(exactCalculation));
  const roundedExact = Math.round(exactCalculation * 100) / 100;

  const formulaText = `${targetGrams}g × (₹${roundedBasePricePerKg} ÷ 1000) = ₹${roundedRupees}`;

  return {
    price: roundedRupees,
    exactPrice: roundedExact,
    formattedPrice: `₹${roundedRupees}`,
    pricePerKg: roundedBasePricePerKg,
    pricePerGram,
    displayWeight,
    grams: targetGrams,
    formulaText,
    isCustomSlab: false,
    pricingSource: 'system-calculated',
  };
}

export interface PricingPreviewItem {
  grams: number;
  label: string;
  price: number;
  formattedPrice: string;
  isCustomSlab: boolean;
  isDisabledSlab?: boolean;
  pricingSource: 'admin-defined' | 'system-calculated';
  formulaText: string;
  baseComparisonPrice?: number;
}

/**
 * Returns a comprehensive pricing breakdown of standard weight slabs
 * and any admin-defined custom slabs for live previews in Admin Panel and storefronts.
 */
export function getPricingPreviewList(
  basePrice: number,
  baseWeightStr?: string,
  weightSlabs?: WeightSlab[]
): PricingPreviewItem[] {
  // Collect core benchmarks (250g, 500g, 750g, 1kg, 1.5kg, 2kg) + any custom slabs
  const gramSet = new Set<number>([250, 500, 750, 1000, 1500, 2000]);
  if (Array.isArray(weightSlabs)) {
    weightSlabs.forEach((s) => {
      if (s && s.grams > 0) gramSet.add(s.grams);
    });
  }

  const sortedGrams = Array.from(gramSet).sort((a, b) => a - b);
  const baseGrams = getBaseWeightInGrams(baseWeightStr);
  const ratePerGram = baseGrams > 0 ? basePrice / baseGrams : 0.03;

  return sortedGrams.map((grams) => {
    const res = calculateWeightPrice(basePrice, baseWeightStr, grams, weightSlabs);
    const systemBasePrice = Math.max(1, Math.round(ratePerGram * grams));
    const matchedConfigSlab = weightSlabs?.find((s) => s.grams === grams);
    const isDisabledSlab = matchedConfigSlab ? matchedConfigSlab.enabled === false : false;

    return {
      grams,
      label: res.displayWeight,
      price: res.price,
      formattedPrice: res.formattedPrice,
      isCustomSlab: res.isCustomSlab,
      isDisabledSlab,
      pricingSource: res.pricingSource,
      formulaText: res.formulaText,
      baseComparisonPrice: systemBasePrice,
    };
  });
}
