/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Product } from '../types';
import { Heart, Star, ShoppingBag, Plus, Minus, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';

interface ProductCardProps {
  product: Product;
  quantityInCart: number;
  isWishlisted: boolean;
  onAddToCart: (id: number) => void;
  onRemoveFromCart: (id: number) => void;
  onUpdateQuantity: (id: number, delta: number) => void;
  onToggleWishlist: (id: number) => void;
  onViewProduct?: (id: number) => void;
  isHighlighted?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -5, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } }}
      className={`group relative flex flex-col overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--card)] backdrop-blur-xl shadow-sm hover:shadow-xl transition-all duration-300 will-change-transform ${
        isHighlighted ? 'ring-2 ring-[var(--primary)] scale-[1.02] shadow-2xl z-20' : ''
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
            <span className="rounded-full bg-red-500/90 backdrop-blur-md px-3 py-1 text-[10px] font-extrabold text-white shadow-sm uppercase tracking-wider">
              Out of Stock
            </span>
          ) : product.discount ? (
            <span className="rounded-full bg-[var(--primary)] backdrop-blur-md px-3 py-1 text-[10px] font-extrabold text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
              {product.discount} Off
            </span>
          ) : product.type === 'organic' ? (
            <span className="rounded-full bg-emerald-600/90 backdrop-blur-md px-3 py-1 text-[10px] font-extrabold text-white shadow-sm uppercase tracking-wider">
              Organic
            </span>
          ) : null}
        </div>

        {/* Favorite Heart Button */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.1 }}
          onClick={(e) => {
            e.stopPropagation();
            onToggleWishlist(product.id);
          }}
          className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white/85 dark:bg-slate-900/85 backdrop-blur-md text-gray-400 shadow-sm transition-all duration-200 hover:border-red-300"
          aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
        >
          <Heart
            className={`h-4.5 w-4.5 transition-colors duration-200 ${
              isWishlisted ? 'fill-red-500 text-red-500' : 'text-gray-400 hover:text-red-500'
            }`}
          />
        </motion.button>
      </div>

      {/* Product Body */}
      <div className="flex flex-1 flex-col p-4">
        {/* Name & Weight */}
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-extrabold text-[var(--fg)] group-hover:text-[var(--primary)] transition-colors duration-200">
            {product.name}
          </h3>
          <span className="whitespace-nowrap text-[10px] font-bold text-[var(--muted-fg)] uppercase bg-[var(--muted)] px-2 py-0.5 rounded-full">
            {product.emoji} {product.weight}
          </span>
        </div>

        {/* Rating */}
        <div className="mb-2.5 flex items-center gap-1.5 text-[11px] text-[var(--muted-fg)]">
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

        {/* Low Stock Warning */}
        {low && (
          <div className="mb-2 flex items-center gap-1 text-[10px] font-bold text-orange-500 bg-orange-50 dark:bg-orange-950/40 px-2 py-1 rounded-lg">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Only {product.stockQty} left in stock!</span>
          </div>
        )}

        {/* Price & Cart Actions at the bottom */}
        <div className="mt-auto pt-3 border-t border-[var(--border)]">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-base font-black text-[var(--primary)] transition-colors duration-200">₹{product.sp}</span>
            {product.cp > product.sp && (
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
            <motion.div 
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-between rounded-full bg-[var(--muted)] border border-[var(--border)] p-1 h-10 shadow-inner"
            >
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={() => onUpdateQuantity(product.id, -1)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--card)] border border-[var(--border)] text-[var(--fg)] shadow-sm hover:bg-[var(--primary)] hover:text-white hover:border-[var(--primary)] transition-all duration-150"
                title="Decrease quantity"
              >
                <Minus className="h-3.5 w-3.5" />
              </motion.button>
              <span className="text-sm font-extrabold text-[var(--fg)] min-w-[24px] text-center">
                {quantityInCart}
              </span>
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={() => {
                  if (product.stockQty !== undefined && quantityInCart >= product.stockQty) return;
                  onUpdateQuantity(product.id, 1);
                }}
                disabled={product.stockQty !== undefined && quantityInCart >= product.stockQty}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--card)] border border-[var(--border)] text-[var(--fg)] shadow-sm hover:bg-[var(--primary)] hover:text-white hover:border-[var(--primary)] disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-400 transition-all duration-150"
                title="Increase quantity"
              >
                <Plus className="h-3.5 w-3.5" />
              </motion.button>
            </motion.div>
          ) : (
            <motion.button
              whileTap={{ scale: 0.96 }}
              whileHover={{ scale: 1.01 }}
              onClick={() => onAddToCart(product.id)}
              disabled={oos}
              className="btn-premium flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-xs font-bold disabled:cursor-not-allowed disabled:bg-gray-400 disabled:text-white h-10"
            >
              <ShoppingBag className="h-4 w-4" />
              <span>{oos ? 'Out of Stock' : 'Add to Cart'}</span>
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

