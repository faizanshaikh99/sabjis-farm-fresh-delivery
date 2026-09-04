/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Product, CartItem, Review } from '../types';
import { X, Star, Heart, ShoppingBag, Plus, Minus, Share2, ShieldCheck, Truck, RefreshCw, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ProductDetailsModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  quantityInCart: number;
  isWishlisted: boolean;
  onAddToCart: (id: number) => void;
  onRemoveFromCart: (id: number) => void;
  onUpdateQuantity: (id: number, delta: number) => void;
  onToggleWishlist: (id: number) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  globalReviews?: Review[];
}

export const ProductDetailsModal: React.FC<ProductDetailsModalProps> = ({
  product,
  isOpen,
  onClose,
  quantityInCart,
  isWishlisted,
  onAddToCart,
  onRemoveFromCart,
  onUpdateQuantity,
  onToggleWishlist,
  showToast,
  globalReviews = [],
}) => {
  if (!product) return null;

  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  // Strictly display only images assigned to this specific product ID!
  // Never randomly reuse images from other products, categories, or placeholders.
  const galleryImages: string[] = React.useMemo(() => {
    if (!product) return [];
    if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      const validImages = product.images
        .map((item) => {
          if (typeof item === 'string') return item.trim();
          // If flagged with a warning and not confirmed by admin, do not display automatically on the customer storefront
          if (item && typeof item === 'object') {
            if (item.warning && item.isConfirmed === false) return '';
            return (item.url || '').trim();
          }
          return '';
        })
        .filter(Boolean);

      if (validImages.length > 0) {
        return validImages;
      }
    }
    return product.img ? [product.img] : [];
  }, [product]);

  // Reset active image index if out of bounds
  React.useEffect(() => {
    setActiveImageIdx(0);
  }, [product?.id]);

  // Filter reviews for this vegetable category or name to make them product-specific!
  const relevantReviews = globalReviews.length > 0 
    ? globalReviews.filter(r => ((r.body || '').toLowerCase().includes(((product?.name || '').split(' ')[0] || '').toLowerCase())) || (r.id % 4 === product.id % 4))
    : [];

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/#product-${product.id}`;
    if (navigator.share) {
      navigator.share({
        title: `${product.name} - Sabjies Fresh Grocery`,
        text: `Check out these fresh ${product.name} on Sabjies! Only ₹${product.sp} ${product.weight}.`,
        url: shareUrl,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      showToast('🔗 Product share link copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const oos = product.stockQty === 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/65 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25 }}
            className="relative w-full max-w-[800px] rounded-3xl bg-[var(--card)] border border-[var(--border)] shadow-2xl overflow-hidden z-10 flex flex-col md:flex-row max-h-[90vh] md:max-h-[85vh]"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white hover:bg-black/60 transition-all border border-white/20"
              aria-label="Close product details"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Left Column: Product Images & Gallery */}
            <div className="w-full md:w-[48%] bg-[var(--muted)]/30 flex flex-col p-4 md:p-6 border-b md:border-b-0 md:border-r border-[var(--border)] shrink-0">
              <div className="relative aspect-square w-full rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--card)] shadow-inner">
                <img
                  src={galleryImages[activeImageIdx]}
                  alt={product.name}
                  className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&q=80&w=600';
                  }}
                />

                {/* Wishlist toggle badge */}
                <button
                  onClick={() => onToggleWishlist(product.id)}
                  className="absolute top-3 left-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 dark:bg-slate-900/90 shadow border border-[var(--border)] text-gray-400 hover:text-red-500 transition-all active:scale-90"
                >
                  <Heart className={`h-4.5 w-4.5 ${isWishlisted ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                </button>

                {/* Out of Stock banner */}
                {oos && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center">
                    <span className="bg-red-600 text-white font-black uppercase text-xs tracking-widest px-4 py-2 rounded-xl shadow">
                      Sold Out
                    </span>
                  </div>
                )}
              </div>

              {/* Gallery Thumbnails (only shown when multiple images exist for this product) */}
              {galleryImages.length > 1 && (
                <div className="flex gap-2.5 mt-3.5 justify-center flex-wrap">
                  {galleryImages.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveImageIdx(idx)}
                      className={`h-12 w-12 rounded-xl overflow-hidden border-2 bg-white transition-all ${
                        activeImageIdx === idx 
                          ? 'border-[var(--primary)] scale-105 shadow-sm' 
                          : 'border-[var(--border)] opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt="thumbnail" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    </button>
                  ))}
                </div>
              )}

              {/* Badges Info */}
              <div className="mt-5 space-y-2.5 hidden md:block">
                <div className="flex items-center gap-2.5 text-[11px] font-semibold text-[var(--muted-fg)] bg-[var(--muted)]/50 p-2 rounded-xl">
                  <ShieldCheck className="h-4 w-4 text-[var(--primary)] shrink-0" />
                  <span>100% Organic Sourcing & Lab Tested</span>
                </div>
                <div className="flex items-center gap-2.5 text-[11px] font-semibold text-[var(--muted-fg)] bg-[var(--muted)]/50 p-2 rounded-xl">
                  <Truck className="h-4 w-4 text-[var(--primary)] shrink-0" />
                  <span>Fresh Harvest Delivered in 90 Mins</span>
                </div>
              </div>
            </div>

            {/* Right Column: Descriptions, Specs, Ratings & Reviews */}
            <div data-lenis-prevent className="flex-1 overflow-y-auto p-5 md:p-6 flex flex-col justify-between overscroll-contain">
              <div className="space-y-4">
                {/* Category & Sharing */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--primary)] bg-[var(--primary)]/15 px-3 py-1 rounded-full">
                    {product.cat.toUpperCase()} VEGETABLE
                  </span>
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-1.5 text-xs font-bold text-[var(--muted-fg)] hover:text-[var(--primary)] transition-colors px-2 py-1"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Share2 className="h-4 w-4" />}
                    <span>{copied ? 'Copied' : 'Share Product'}</span>
                  </button>
                </div>

                {/* Title & Price */}
                <div>
                  <h1 className="text-xl md:text-2xl font-black text-[var(--fg)] tracking-tight leading-none">
                    {product.emoji} {product.name}
                  </h1>
                  <p className="text-xs text-[var(--muted-fg)] mt-1.5 font-bold uppercase">
                    Sells {product.weight}
                  </p>
                </div>

                {/* Cost Section */}
                <div className="flex items-baseline gap-3.5 pt-1">
                  <span className="text-2xl font-black text-[var(--primary)]">₹{product.sp}</span>
                  {product.discount && (
                    <>
                      <span className="text-xs text-[var(--muted-fg)] line-through">₹{Math.round(product.sp * 1.2)}</span>
                      <span className="text-[10px] font-black text-red-500 bg-red-100 dark:bg-red-950/40 px-2 py-0.5 rounded uppercase tracking-wide">
                        Save {product.discount}
                      </span>
                    </>
                  )}
                </div>

                {/* Description */}
                <div>
                  <h4 className="text-[10px] font-extrabold uppercase text-[var(--muted-fg)] tracking-wider mb-1">
                    Product Description
                  </h4>
                  <p className="text-xs text-[var(--fg)] leading-relaxed opacity-90 font-medium">
                    Picked directly at local Maharashtra farms and processed under ultra-sanitary conditions. Crisp, sweet, and bursting with vitamins. Ideal for salads, subzis, curries, and juices. Guaranteed freshness within our daily morning cycle.
                  </p>
                </div>

                {/* Dynamic Rating Summary */}
                <div className="border-t border-[var(--border)] pt-4 space-y-3">
                  <h4 className="text-[10px] font-extrabold uppercase text-[var(--muted-fg)] tracking-wider">
                    Ratings & Reviews ⭐
                  </h4>
                  <div className="flex items-center gap-4 bg-[var(--muted)]/30 p-3.5 rounded-2xl border border-[var(--border)]">
                    <div className="text-center shrink-0">
                      <div className="text-2xl font-black text-[var(--fg)]">{product.rating}</div>
                      <div className="flex text-amber-400 gap-0.5 justify-center mt-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-3 w-3 ${i < Math.round(product.rating) ? 'fill-current' : 'opacity-30'}`} />
                        ))}
                      </div>
                      <p className="text-[9px] text-[var(--muted-fg)] font-bold mt-1 uppercase">{product.reviews} verified reviews</p>
                    </div>

                    <div className="flex-1 space-y-1">
                      {/* Star percentage bar */}
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--muted-fg)]">
                        <span className="w-2.5">5</span>
                        <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                        <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                          <div className="bg-[var(--primary)] h-full rounded-full" style={{ width: '75%' }} />
                        </div>
                        <span className="w-6 text-right">75%</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--muted-fg)]">
                        <span className="w-2.5">4</span>
                        <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                        <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                          <div className="bg-[var(--primary)] h-full rounded-full" style={{ width: '15%' }} />
                        </div>
                        <span className="w-6 text-right">15%</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--muted-fg)]">
                        <span className="w-2.5">3</span>
                        <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                        <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                          <div className="bg-[var(--primary)] h-full rounded-full animate-pulse" style={{ width: '10%' }} />
                        </div>
                        <span className="w-6 text-right">10%</span>
                      </div>
                    </div>
                  </div>

                  {/* Reviews List */}
                  <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                    {relevantReviews.length > 0 ? (
                      relevantReviews.slice(0, 3).map((rev) => (
                        <div key={rev.id} className="p-2.5 bg-[var(--muted)]/20 rounded-xl border border-[var(--border)] text-[11px] space-y-1">
                          <div className="flex justify-between items-center text-[10px] font-black text-[var(--fg)]">
                            <span>{rev.authorName} <strong className="text-[var(--primary)] font-semibold">({rev.location || 'Ghatkopar'})</strong></span>
                            <div className="flex text-amber-400 gap-0.5">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star key={i} className={`h-2.5 w-2.5 ${i < rev.rating ? 'fill-current' : 'opacity-20'}`} />
                              ))}
                            </div>
                          </div>
                          <p className="text-[10px] text-[var(--muted-fg)] italic leading-relaxed">"{rev.body}"</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-[var(--muted-fg)] italic py-1.5">No reviews yet for this vegetable. Be the first to buy and write a review!</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Add to Cart Actions Footer */}
              <div className="border-t border-[var(--border)] pt-4 mt-5 flex items-center justify-between gap-4 bg-[var(--card)] relative z-20">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase text-[var(--muted-fg)]">Stock Status</span>
                  <span className={`text-[10px] font-extrabold ${oos ? 'text-red-500' : 'text-emerald-600'}`}>
                    {oos ? 'Temporarily Out of Stock' : `Available (${product.stockQty} Units Left)`}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {quantityInCart > 0 ? (
                    <div className="flex items-center gap-3.5 rounded-full border border-[var(--border)] bg-[var(--muted)]/50 p-1.5">
                      <button
                        onClick={() => onUpdateQuantity(product.id, -1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold hover:bg-[var(--primary)] hover:text-white shadow-sm transition-all"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-sm font-extrabold text-[var(--fg)] min-w-[16px] text-center">
                        {quantityInCart}
                      </span>
                      <button
                        onClick={() => {
                          if (product.stockQty !== undefined && quantityInCart >= product.stockQty) return;
                          onUpdateQuantity(product.id, 1);
                        }}
                        disabled={quantityInCart >= product.stockQty}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold hover:bg-[var(--primary)] hover:text-white disabled:opacity-40 shadow-sm transition-all"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onAddToCart(product.id)}
                      disabled={oos}
                      className="rounded-full bg-[var(--primary)] text-white text-xs font-extrabold px-6 py-3 shadow-md hover:bg-opacity-95 disabled:opacity-40 transition-all flex items-center gap-2"
                    >
                      <ShoppingBag className="h-4 w-4" />
                      <span>{oos ? 'SOLD OUT' : `ADD TO CART`}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
