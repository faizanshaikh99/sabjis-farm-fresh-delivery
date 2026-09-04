/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { CartItem, Offer } from '../types';
import { ShoppingBag, X, Minus, Plus, Trash2, Tag, Sparkles, Heart, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { safeJson } from '../utils/apiHelper';

interface CartDrawerProps {
  isOpen: boolean;
  cart: { [id: number]: CartItem };
  offers?: Offer[];
  onClose: () => void;
  onUpdateQuantity: (id: number, delta: number) => void;
  onRemoveFromCart: (id: number) => void;
  onClearCart: () => void;
  onCheckout: () => void;
  onAddToCart?: (id: number) => void;

  // Save for Later
  savedForLater: CartItem[];
  onUpdateSavedForLater: (items: CartItem[]) => void;

  // Coupon System
  appliedCoupon: string;
  couponDiscount: number;
  onApplyCoupon: (code: string, discount: number) => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  cart,
  offers = [],
  onClose,
  onUpdateQuantity,
  onRemoveFromCart,
  onClearCart,
  onCheckout,
  onAddToCart,
  savedForLater,
  onUpdateSavedForLater,
  appliedCoupon,
  couponDiscount,
  onApplyCoupon,
}) => {
  const items = Object.values(cart) as CartItem[];
  const subtotal = items.reduce((acc, i) => acc + i.sp * i.qty, 0);
  const delivery = subtotal >= 299 ? 0 : 30;
  
  // Is FREE90 coupon applied?
  const isFreeDeliveryApplied = appliedCoupon === 'FREE90';
  const finalDelivery = isFreeDeliveryApplied ? 0 : delivery;
  const total = Math.max(0, subtotal + finalDelivery - couponDiscount);

  // Local coupon code input state
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [businessSettings, setBusinessSettings] = useState({
    enableIgBanner: true,
    igProfileUrl: 'https://www.instagram.com/sabjies?igsh=MWp6cDQ2NHZtcnE0Zw',
    igBannerText: '🎁 Follow us on Instagram for exclusive discount codes.',
  });

  useEffect(() => {
    fetch('/api/business-settings')
      .then(res => safeJson(res, null))
      .then(data => {
        if (data) {
          setBusinessSettings({
            enableIgBanner: data.enableIgBanner !== undefined ? data.enableIgBanner : true,
            igProfileUrl: data.igProfileUrl || 'https://www.instagram.com/sabjies?igsh=MWp6cDQ2NHZtcnE0Zw',
            igBannerText: data.igBannerText || '🎁 Follow us on Instagram for exclusive discount codes.',
          });
        }
      })
      .catch(err => console.error(err));
  }, []);

  // Pre-defined high value coupon codes
  const AVAILABLE_COUPONS = [
    { code: 'FRESH20', desc: '20% OFF (Max ₹100) on orders above ₹199', minSubtotal: 199 },
    { code: 'SABJIES100', desc: 'Flat ₹100 OFF on orders above ₹499', minSubtotal: 499 },
    { code: 'FREE90', desc: 'Free Delivery on any order size', minSubtotal: 0 },
  ];

  const handleApplyCouponCode = (code: string) => {
    const cleanCode = code.trim().toUpperCase();
    setCouponError('');

    if (!cleanCode) {
      setCouponError('Please enter a coupon code.');
      return;
    }

    let userId = 'guest';
    let userEmail = '';
    let userPhone = '';
    try {
      const localUser = localStorage.getItem('sabjies_current_user');
      if (localUser) {
        const parsed = JSON.parse(localUser);
        userId = parsed.id || 'guest';
        userEmail = parsed.email || '';
        userPhone = parsed.phone || '';
      }
    } catch (err) {}

    // Call dynamic validation endpoint
    fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: cleanCode,
        subtotal: subtotal,
        userId: userId,
        userEmail: userEmail,
        phone: userPhone
      })
    })
    .then(res => safeJson(res, { valid: false, message: 'Invalid server response' }))
    .then(data => {
      if (data && data.valid) {
        onApplyCoupon(data.code, data.discount);
        setCouponInput('');
      } else {
        setCouponError(data?.message || 'Invalid promo code.');
      }
    })
    .catch(err => {
      console.error(err);
      setCouponError('Error validating coupon. Please try again.');
    });
  };

  const handleRemoveCoupon = () => {
    onApplyCoupon('', 0);
    setCouponError('');
  };

  const handleSaveForLater = (item: CartItem) => {
    // Add to saved list if not already present
    if (!savedForLater.some(x => x.id === item.id)) {
      onUpdateSavedForLater([...savedForLater, { ...item, qty: 1 }]);
    }
    // Remove from active cart
    onRemoveFromCart(item.id);
  };

  const handleMoveToCart = (item: CartItem) => {
    // Add back to active cart
    if (onAddToCart) {
      onAddToCart(item.id);
    }
    // Remove from saved list
    onUpdateSavedForLater(savedForLater.filter(x => x.id !== item.id));
  };

  const handleRemoveSavedItem = (id: number) => {
    onUpdateSavedForLater(savedForLater.filter(x => x.id !== id));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[500] bg-black/50 backdrop-blur-sm"
          />

          {/* Drawer Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-0 right-0 bottom-0 z-[510] flex w-full max-w-[400px] flex-col bg-[var(--card)] border-l border-[var(--border)] shadow-2xl backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-[var(--primary)]" />
                <h2 className="text-base font-extrabold text-[var(--fg)]">Your Cart</h2>
                <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-xs font-bold text-white">
                  {items.reduce((sum, item) => sum + item.qty, 0)}
                </span>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted-fg)] hover:text-red-500 hover:border-red-200 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Items list */}
            <div data-lenis-prevent className="flex-1 overflow-y-auto p-4 space-y-4 overscroll-contain">
              {items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-[var(--muted-fg)] py-12">
                  <ShoppingBag className="h-12 w-12 opacity-35 mb-3" />
                  <h4 className="text-sm font-bold text-[var(--fg)]">Your cart is empty</h4>
                  <p className="text-xs mt-1">Add some fresh organic veggies to get started!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => {
                    const itemImg = item.img;
                    return (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3 shadow-sm relative group"
                      >
                          {/* Item Image & Emoji Fallback */}
                          <div className="h-12 w-12 rounded-xl overflow-hidden bg-[var(--muted)] flex-shrink-0 border border-[var(--border)] relative flex items-center justify-center">
                            <span className="text-2xl select-none absolute">{item.emoji}</span>
                            {itemImg && (
                              <img
                                src={itemImg}
                                alt={item.name}
                                className="h-full w-full object-cover relative z-10"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            )}
                          </div>

                      {/* Information */}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-[var(--fg)] truncate">
                          {item.name}
                        </h4>
                        <p className="text-[10px] text-[var(--muted-fg)] mt-0.5">{item.weight}</p>
                        <p className="text-xs font-extrabold text-[var(--primary)] mt-1.5">
                          ₹{item.sp * item.qty}
                        </p>
                        <button
                          onClick={() => handleSaveForLater(item)}
                          className="text-[10px] text-[var(--primary)] font-bold hover:underline flex items-center gap-1 mt-1"
                        >
                          <Heart className="h-2.5 w-2.5 text-red-500 fill-red-500" />
                          <span>Save for Later</span>
                        </button>
                      </div>

                      {/* Actions and Quantity Buttons */}
                      <div className="flex flex-col items-end gap-2">
                        <button
                          onClick={() => onRemoveFromCart(item.id)}
                          className="text-[var(--muted-fg)] hover:text-red-500 transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>

                        <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] p-0.5">
                          <button
                            onClick={() => onUpdateQuantity(item.id, -1)}
                            className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold hover:bg-[var(--primary)] hover:text-white transition-all"
                          >
                            <Minus className="h-2.5 w-2.5" />
                          </button>
                          <span className="text-xs font-extrabold text-[var(--fg)] min-w-[14px] text-center">
                            {item.qty}
                          </span>
                          <button
                            onClick={() => {
                              if (item.stockQty !== undefined && item.qty >= item.stockQty) return;
                              onUpdateQuantity(item.id, 1);
                            }}
                            disabled={item.stockQty !== undefined && item.qty >= item.stockQty}
                            className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold hover:bg-[var(--primary)] hover:text-white disabled:opacity-45 disabled:hover:bg-white disabled:hover:text-gray-400 transition-all"
                          >
                            <Plus className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
                </div>
              )}

              {/* ── SAVE FOR LATER SECTION ── */}
              {savedForLater.length > 0 && (
                <div className="mt-6 pt-4 border-t border-[var(--border)] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--fg)]">
                      <Heart className="h-4 w-4 text-red-500 fill-red-500" />
                      <span>Saved For Later ({savedForLater.length})</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {savedForLater.map((sItem) => (
                      <div
                        key={sItem.id}
                        className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5 flex items-center justify-between gap-2.5 shadow-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-9 w-9 rounded-lg bg-[var(--muted)] text-xl flex items-center justify-center flex-shrink-0 select-none">
                            {sItem.emoji}
                          </div>
                          <div className="min-w-0">
                            <h5 className="text-[11px] font-bold text-[var(--fg)] truncate">{sItem.name}</h5>
                            <p className="text-[9px] text-[var(--muted-fg)]">₹{sItem.sp} · {sItem.weight}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRemoveSavedItem(sItem.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                            title="Remove Saved Item"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleMoveToCart(sItem)}
                            className="rounded-full bg-[var(--primary)]/10 text-[var(--primary)] text-[10px] font-extrabold px-3 py-1 hover:bg-[var(--primary)] hover:text-white transition-all whitespace-nowrap"
                          >
                            Move to Cart
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── COUPON / PROMO SYSTEM ── */}
              {items.length > 0 && (
                <div className="mt-6 pt-4 border-t border-[var(--border)] space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--fg)]">
                    <Tag className="h-4 w-4 text-[var(--primary)]" />
                    <span>Apply Coupon Code</span>
                  </div>

                  {appliedCoupon ? (
                    <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/55 dark:border-emerald-900/50 dark:bg-emerald-950/20 p-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <div>
                          <p className="text-xs font-black text-emerald-800 dark:text-emerald-300">
                            CODE APPLIED: {appliedCoupon}
                          </p>
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                            {appliedCoupon === 'FREE90' ? '🎉 Delivery Fee Saved!' : `🎉 ₹${couponDiscount} saved on Sabjies!`}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleRemoveCoupon}
                        className="text-[10px] font-bold text-red-500 hover:underline px-2 py-1"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={couponInput}
                          placeholder="Enter Promo Code"
                          onChange={(e) => {
                            setCouponInput(e.target.value);
                            setCouponError('');
                          }}
                          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)] font-semibold uppercase"
                        />
                        <button
                          onClick={() => handleApplyCouponCode(couponInput)}
                          className="rounded-xl bg-[var(--primary)] text-white px-4 py-2 text-xs font-extrabold shadow hover:opacity-95"
                        >
                          Apply
                        </button>
                      </div>
                      {couponError && (
                        <p className="text-[10px] text-red-500 font-semibold">{couponError}</p>
                      )}

                      {businessSettings.enableIgBanner && (
                        <div className="mt-2.5 p-2 bg-pink-50 dark:bg-pink-950/10 border border-pink-100 dark:border-pink-900/30 rounded-lg flex items-center justify-between gap-2">
                          <span className="text-[10px] text-pink-700 dark:text-pink-300 font-semibold">
                            🎁 Follow us on Instagram for exclusive discount codes.
                          </span>
                          <a
                            href={businessSettings.igProfileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] bg-pink-600 text-white font-black px-2 py-0.5 rounded-full uppercase hover:bg-pink-700 transition-colors shrink-0"
                          >
                            Follow
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Active Special Offers & Promos in Cart */}
              {offers.length > 0 && (
                <div className="mt-6 pt-4 border-t border-[var(--border)] space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--fg)]">
                    <Sparkles className="h-4 w-4 text-[var(--primary)]" />
                    <span>Special Offers & Combos For You</span>
                  </div>
                  <div className="space-y-2.5">
                    {offers.slice(0, 2).map((off) => (
                      <div
                        key={off.id}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3 flex gap-3 items-center shadow-xs overflow-hidden"
                      >
                        <div className="h-12 w-12 rounded-xl overflow-hidden bg-[var(--muted)] flex-shrink-0 border border-[var(--border)] relative flex items-center justify-center text-xl">
                          <span>🎁</span>
                          {off.img && (
                            <img
                              src={off.img}
                              alt={off.title}
                              className="h-full w-full object-cover absolute inset-0 z-10"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 text-[8px] font-black uppercase">
                            {off.tag}
                          </span>
                          <h5 className="text-xs font-bold text-[var(--fg)] truncate mt-0.5">{off.title}</h5>
                          <p className="text-[10px] text-[var(--muted-fg)] line-clamp-1">{off.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Cart Summary & CTA */}
            {items.length > 0 && (
              <div className="border-t border-[var(--border)] bg-[var(--card)] p-4 space-y-3.5">
                <div className="space-y-1.5 text-xs text-[var(--muted-fg)]">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="text-[var(--fg)] font-semibold">₹{subtotal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Express Delivery</span>
                    <span className="text-[var(--fg)] font-semibold">
                      {isFreeDeliveryApplied ? (
                        <span className="text-emerald-600 font-extrabold flex items-center gap-1">
                          <span className="line-through text-[var(--muted-fg)] font-normal">₹{delivery}</span>
                          <span>FREE (COUPON)</span>
                        </span>
                      ) : delivery === 0 ? (
                        'FREE'
                      ) : (
                        `₹${delivery}`
                      )}
                    </span>
                  </div>

                  {couponDiscount > 0 && (
                    <div className="flex justify-between text-emerald-600 font-bold">
                      <span>Coupon Discount ({appliedCoupon})</span>
                      <span>- ₹{couponDiscount}</span>
                    </div>
                  )}

                  {subtotal < 299 && !isFreeDeliveryApplied && (
                    <p className="text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 rounded-lg p-2 font-medium">
                      🚚 Add <strong>₹{299 - subtotal}</strong> more to qualify for <strong>FREE Delivery</strong>, or apply <strong>FREE90</strong>!
                    </p>
                  )}

                  <div className="flex justify-between text-sm font-extrabold text-[var(--fg)] pt-2 border-t border-[var(--border)] mt-2">
                    <span>Total Amount</span>
                    <span className="text-[var(--primary)] text-base font-black">₹{total}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={onCheckout}
                    className="w-full bg-[var(--primary)] text-white text-xs font-extrabold rounded-full py-3 hover:opacity-95 shadow-md active:scale-[0.99] transition-all"
                  >
                    Place Order · ₹{total}
                  </button>
                  <button
                    onClick={onClearCart}
                    className="text-[10px] font-semibold text-[var(--muted-fg)] hover:text-red-500 py-1 transition-colors self-center"
                  >
                    Clear Entire Cart
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
