/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Product } from '../types';
import { Heart, Star, ShoppingBag, Plus, Minus, AlertTriangle, Scale } from 'lucide-react';
import { CustomWeightModal } from './CustomWeightModal';
import { getBaseWeightInGrams, calculateWeightPrice, formatWeight, isKgProduct } from '../utils/weightParser';

interface ProductCardProps {
  product: Product;
  quantityInCart: number;
  isWishlisted: boolean;
  onAddToCart: (id: number, customWeight?: { weight: string; weightInGrams: number; price: number; qty?: number }) => void;
  onRemoveFromCart: (id: number) => void;
  onUpdateQuantity: (id: number | string, delta: number) => void;
  onToggleWishlist: (id: number) => void;
  onViewProduct?: (id: number) => void;
  isHighlighted?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = React.memo(({
  product,
  quantityInCart,
  isWishlisted,
  onAddToCart,
  onRemoveFromCart,
  onUpdateQuantity,
  onToggleWishlist,
  onViewProduct,
  isHighlighted = false
}) => {
  const oos = product.stockQty === 0;
  const low = product.stockQty > 0 && product.stockQty <= product.lowAt;
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const isKg = isKgProduct(product);

  // Custom Weight State - strictly for kg products
  const baseGrams = useMemo(() => isKg ? getBaseWeightInGrams(product.weight) : 0, [isKg, product.weight]);
  const [selectedWeightGrams, setSelectedWeightGrams] = useState<number>(baseGrams);
  const [selectedDisplayWeight, setSelectedDisplayWeight] = useState<string>(product.weight);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);

  // Dynamic quick weight buttons: strictly for kg products
  const quickWeightOptions = useMemo(() => {
    if (!isKg) return [];
    const defaults = [500, 750, 1000];
    const slabGrams = (product.weightSlabs || [])
      .filter((s) => s.enabled !== false && s.grams > 0)
      .map((s) => s.grams);
    const set = new Set<number>([baseGrams, ...defaults, ...slabGrams]);
    return Array.from(set).filter((g) => g > 0).sort((a, b) => a - b).slice(0, 4);
  }, [isKg, baseGrams, product.weightSlabs]);

  // Instant calculated price based on selected weight:
  // Strictly applies to kg products; non-kg products always use product.sp directly
  const priceResult = useMemo(() => {
    if (!isKg) {
      return { price: product.sp, isCustomSlab: false, displayWeight: product.weight || '1 unit', grams: 0 };
    }
    return calculateWeightPrice(product.sp, product.weight, selectedWeightGrams, product.weightSlabs);
  }, [isKg, product.sp, product.weight, selectedWeightGrams, product.weightSlabs]);

  const displayedSp = isKg ? priceResult.price : product.sp;
  const isCustomWeight = isKg && selectedWeightGrams !== baseGrams;

  const handleQuickWeightSelect = (grams: number) => {
    if (!isKg) return;
    setSelectedWeightGrams(grams);
    setSelectedDisplayWeight(formatWeight(grams));
  };

  const handleAddCurrentWeightToCart = () => {
    if (isKg) {
      onAddToCart(product.id, {
        weight: selectedDisplayWeight,
        weightInGrams: selectedWeightGrams,
        price: displayedSp,
      });
    } else {
      onAddToCart(product.id);
    }
  };

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--card)] shadow-xs hover:shadow-lg transition-transform duration-200 hover:-translate-y-1 ${
        isHighlighted ? 'ring-2 ring-[var(--primary)] scale-[1.02] shadow-xl z-20' : ''
      }`}
      id={`product-card-${product.id}`}
    >
      {/* Product Image Stage */}
      <div 
        className="relative aspect-square w-full overflow-hidden bg-[var(--muted)] cursor-pointer"
        onClick={() => onViewProduct?.(product.id)}
      >
        {!imgLoaded && !imgError && (
          <div className="absolute inset-0 skeleton-shimmer" />
        )}
        
        {!imgError ? (
          <img
            src={product.img}
            alt={product.name}
            loading="lazy"
            decoding="async"
            onLoad={() => setImgLoaded(true)}
            onError={() => {
              setImgError(true);
              setImgLoaded(true);
            }}
            className={`h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 ${
              imgLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            referrerPolicy="no-referrer"
          />
        ) : null}

        {(imgError || !product.img) && (
          <div className="absolute inset-0 flex items-center justify-center text-5xl flex-col bg-[var(--muted)] select-none">
            <span>{product.emoji}</span>
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
          {oos ? (
            <span className="rounded-full bg-red-500/95 px-3 py-1 text-[10px] font-extrabold text-white shadow-xs uppercase tracking-wider">
              Out of Stock
            </span>
          ) : product.discount ? (
            <span className="rounded-full bg-[var(--primary)] px-3 py-1 text-[10px] font-extrabold text-white shadow-xs transition-transform duration-200 group-hover:scale-105">
              {product.discount} Off
            </span>
          ) : product.type === 'organic' ? (
            <span className="rounded-full bg-emerald-600/95 px-3 py-1 text-[10px] font-extrabold text-white shadow-xs uppercase tracking-wider">
              Organic
            </span>
          ) : null}
        </div>

        {/* Favorite Heart Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleWishlist(product.id);
          }}
          className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white/90 dark:bg-slate-900/90 text-gray-400 shadow-xs transition-transform duration-150 active:scale-90 hover:border-red-300"
          aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
        >
          <Heart
            className={`h-4.5 w-4.5 transition-colors duration-200 ${
              isWishlisted ? 'fill-red-500 text-red-500' : 'text-gray-400 hover:text-red-500'
            }`}
          />
        </button>
      </div>

      {/* Product Body */}
      <div className="flex flex-1 flex-col p-4">
        {/* Name & Weight */}
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-extrabold text-[var(--fg)] group-hover:text-[var(--primary)] transition-colors duration-200">
            {product.name}
          </h3>
          {isKg ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsWeightModalOpen(true);
              }}
              title="Click to customize vegetable weight"
              className="whitespace-nowrap text-[10px] font-bold text-[var(--primary)] uppercase bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 px-2 py-0.5 rounded-full border border-[var(--primary)]/20 flex items-center gap-1 transition-all"
            >
              <Scale className="h-2.5 w-2.5" />
              <span>{selectedDisplayWeight}</span>
              <span className="text-[8px] opacity-70">▾</span>
            </button>
          ) : (
            <span
              className="whitespace-nowrap text-[10px] font-bold text-[var(--muted-fg)] uppercase bg-[var(--muted)] px-2 py-0.5 rounded-full border border-[var(--border)] flex items-center gap-1 cursor-default"
            >
              <span>{product.weight || `per ${product.unit || 'piece'}`}</span>
            </span>
          )}
        </div>

        {/* Rating */}
        <div className="mb-2 flex items-center gap-1.5 text-[11px] text-[var(--muted-fg)]">
          <div className="flex text-amber-500">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-3 w-3 ${
                  i < Math.round(product.rating) ? 'fill-current' : 'opacity-30'
                }`}
              />
            ))}
          </div>
          <span className="font-bold text-[var(--fg)]">{product.rating}</span>
          <span>({product.reviews})</span>
        </div>

        {/* Quick Weight Selector & Custom Weight Option - strictly ONLY for kg products */}
        {isKg && (
          <div className="mb-2 flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            {quickWeightOptions.map((grams) => {
              const isSelected = selectedWeightGrams === grams;
              const label = formatWeight(grams);
              const calc = calculateWeightPrice(product.sp, product.weight, grams, product.weightSlabs);
              return (
                <button
                  key={grams}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuickWeightSelect(grams);
                  }}
                  title={`₹${calc.price} for ${label}`}
                  className={`rounded-lg px-2 py-0.5 text-[9px] font-extrabold border transition-all whitespace-nowrap flex items-center gap-0.5 ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 font-black shadow-xs'
                      : 'border-[var(--border)] bg-[var(--muted)]/40 text-[var(--muted-fg)] hover:text-[var(--fg)]'
                  }`}
                >
                  <span>{label}</span>
                  {calc.isCustomSlab && (
                    <span className="text-[7px] text-amber-500" title="Admin custom slab">⭐</span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsWeightModalOpen(true);
              }}
              className={`rounded-lg px-2 py-0.5 text-[9px] font-extrabold border transition-all flex items-center gap-0.5 whitespace-nowrap ${
                isCustomWeight && !quickWeightOptions.includes(selectedWeightGrams)
                  ? 'border-[var(--primary)] bg-[var(--primary)] text-white font-black'
                  : 'border-[var(--border)] bg-[var(--muted)]/50 text-[var(--primary)] hover:border-[var(--primary)]'
              }`}
            >
              <Scale className="h-2.5 w-2.5" />
              <span>
                {isCustomWeight && !quickWeightOptions.includes(selectedWeightGrams)
                  ? selectedDisplayWeight
                  : 'Custom ⚖️'}
              </span>
            </button>
          </div>
        )}

        {/* Low Stock Warning */}
        {low && (
          <div className="mb-2 flex items-center gap-1 text-[10px] font-bold text-orange-500 bg-orange-50 dark:bg-orange-950/40 px-2 py-1 rounded-lg">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Only {product.stockQty} left in stock!</span>
          </div>
        )}

        {/* Price & Cart Actions at the bottom */}
        <div className="mt-auto pt-3 border-t border-[var(--border)]">
          <div className="flex flex-wrap items-baseline gap-1.5 mb-1.5">
            <span className="text-base font-black text-[var(--primary)] transition-colors duration-200">
              ₹{displayedSp}
            </span>
            {isCustomWeight && (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
                for {selectedDisplayWeight}
              </span>
            )}
            {priceResult.isCustomSlab ? (
              <span className="text-[9px] text-amber-700 dark:text-amber-300 font-black bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-700/60" title="Admin configured slab price">
                ⭐ Slab Rate
              </span>
            ) : null}
            {!isCustomWeight && product.cp > product.sp && (
              <span className="text-xs text-[var(--muted-fg)] line-through">₹{product.cp}</span>
            )}
            {product.discount && (
              <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[9px] font-black text-[var(--primary)]">
                {product.discount}
              </span>
            )}
          </div>

          {/* ADD TO CART & QUANTITY CONTROLS */}
          {quantityInCart > 0 ? (
            <div 
              className="flex items-center justify-between rounded-full bg-[var(--muted)] border border-[var(--border)] p-1 h-10 shadow-xs"
            >
              <button
                onClick={() => onUpdateQuantity(product.id, -1)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--card)] border border-[var(--border)] text-[var(--fg)] shadow-xs hover:bg-[var(--primary)] hover:text-white hover:border-[var(--primary)] transition-transform duration-100 active:scale-90"
                title="Decrease quantity"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="text-sm font-extrabold text-[var(--fg)] min-w-[24px] text-center">
                {quantityInCart}
              </span>
              <button
                onClick={() => {
                  if (product.stockQty !== undefined && quantityInCart >= product.stockQty) return;
                  onUpdateQuantity(product.id, 1);
                }}
                disabled={product.stockQty !== undefined && quantityInCart >= product.stockQty}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--card)] border border-[var(--border)] text-[var(--fg)] shadow-xs hover:bg-[var(--primary)] hover:text-white hover:border-[var(--primary)] disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-400 transition-transform duration-100 active:scale-90"
                title="Increase quantity"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleAddCurrentWeightToCart}
              disabled={oos}
              className="btn-premium flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-xs font-bold disabled:cursor-not-allowed disabled:bg-gray-400 disabled:text-white h-10 transition-transform duration-150 active:scale-95"
            >
              <ShoppingBag className="h-4 w-4" />
              <span>{oos ? 'Out of Stock' : `Add to Cart • ₹${displayedSp}`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Custom Weight Modal (Lazy-mounted ONLY for kg products when requested) */}
      {isKg && isWeightModalOpen && (
        <CustomWeightModal
          product={product}
          isOpen={isWeightModalOpen}
          initialWeightInGrams={selectedWeightGrams}
          onClose={() => setIsWeightModalOpen(false)}
          onConfirm={(selection) => {
            setSelectedWeightGrams(selection.weightInGrams);
            setSelectedDisplayWeight(selection.weight);
            onAddToCart(product.id, {
              weight: selection.weight,
              weightInGrams: selection.weightInGrams,
              price: selection.price,
              qty: selection.qty,
            });
          }}
        />
      )}
    </div>
  );
});

