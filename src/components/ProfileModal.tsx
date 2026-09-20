/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, Order, Address, Product } from '../types';
import { 
  Package, Phone, X, Plus, 
  Truck, AlertTriangle, Upload, 
  RefreshCw, Heart, CreditCard, Settings, Moon, Sun, 
  CheckCircle2, ShoppingCart, Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { InvoiceModal } from './InvoiceModal';
import { normalizeOrderStatus, getOrderStatusMeta, sortOrdersNewestFirst } from '../utils/orderStatus';

/** Formats an order ID into the standard "Order #..." representation (e.g. "Order #SBJ-10025") */
export function formatCustomerOrderNumber(id: string | undefined | null): string {
  if (!id) return 'Order #N/A';
  const clean = String(id).trim();
  if (clean.startsWith('Order #')) return clean;
  if (clean.startsWith('Order ')) return clean.replace('Order ', 'Order #');
  if (clean.startsWith('#')) return `Order ${clean}`;
  return `Order #${clean}`;
}

/** Formats an ISO/timestamp into distinct Date, Time and combined Date/Time (e.g. "08 Sep 2026, 4:35 PM") */
export function formatCustomerOrderDateTime(dateVal?: string | Date) {
  if (!dateVal) {
    return {
      date: 'Recent',
      time: '',
      dateTime: 'Recent',
    };
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) {
    return {
      date: 'Recent',
      time: '',
      dateTime: 'Recent',
    };
  }

  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;

  const dateFormatted = `${day} ${month} ${year}`;
  const timeFormatted = `${hours}:${minutes} ${ampm}`;
  return {
    date: dateFormatted,
    time: timeFormatted,
    dateTime: `${dateFormatted}, ${timeFormatted}`,
  };
}

interface ProfileModalProps {
  user: User | null;
  orders: Order[];
  products: Product[];
  wishlistIds: number[];
  initialTab?: 'profile' | 'orders' | 'addresses' | 'wishlist' | 'payment_history' | 'settings';
  onClose: () => void;
  onUpdateProfile: (name: string, phone: string) => void;
  onUpdateAddresses: (addresses: Address[]) => void;
  onLogout: () => void;
  onResubmitPayment?: (orderId: string, utr: string, screenshotUrl?: string) => void;
  onReorder?: (items: { id: number; qty: number }[]) => void;
  onAddToCart?: (id: number) => void;
  onToggleWishlist?: (id: number) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  user,
  orders,
  products = [],
  wishlistIds = [],
  initialTab = 'profile',
  onClose,
  onUpdateProfile,
  onUpdateAddresses,
  onLogout,
  onResubmitPayment,
  onReorder,
  onAddToCart,
  onToggleWishlist,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'orders' | 'addresses' | 'wishlist' | 'payment_history' | 'settings'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [selectedTrackingOrder, setSelectedTrackingOrder] = useState<Order | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Order | null>(null);

  // Keep selected tracking order in sync when real-time updates arrive
  useEffect(() => {
    if (selectedTrackingOrder) {
      const updated = orders.find(o => String(o.id) === String(selectedTrackingOrder.id));
      if (updated && (updated.status !== selectedTrackingOrder.status || updated.updatedAt !== selectedTrackingOrder.updatedAt)) {
        setSelectedTrackingOrder(updated);
      }
    }
  }, [orders, selectedTrackingOrder]);

  // Settings mock toggles
  const [darkTheme, setDarkTheme] = useState<boolean>(() => {
    return document.documentElement.classList.contains('dark') || localStorage.getItem('theme') === 'dark';
  });
  const [pushNotifications, setPushNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(true);
  const [defaultPayment, setDefaultPayment] = useState<'upi' | 'cod'>('upi');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Reorder animation state
  const [reorderingOrderId, setReorderingOrderId] = useState<string | null>(null);
  const [reorderPhase, setReorderPhase] = useState<'idle' | 'adding' | 'added'>('idle');

  const handleReorderWithAnimation = (order: Order) => {
    if (reorderingOrderId) return;
    setReorderingOrderId(order.id);
    setReorderPhase('adding');

    // Step 1: Show animated adding state
    setTimeout(() => {
      setReorderPhase('added');

      // Step 2: Transition into active cart drawer
      setTimeout(() => {
        onReorder?.(order.items.map(it => ({ id: it.id, qty: it.qty || it.quantity || 1 })));
        setReorderingOrderId(null);
        setReorderPhase('idle');
      }, 450);
    }, 600);
  };

  // Resubmit Payment State per Order
  const [resubmitUtr, setResubmitUtr] = useState<{[orderId: string]: string}>({});
  const [resubmitImg, setResubmitImg] = useState<{[orderId: string]: string}>({});

  // Profile Edit fields
  const [pName, setPName] = useState(user?.name || '');
  const [pPhone, setPPhone] = useState(user?.phone || '');

  // Keep state synchronized with the user prop when it changes
  React.useEffect(() => {
    if (user) {
      setPName(user.name || '');
      setPPhone(user.phone || '');
    }
  }, [user]);

  // New Address fields
  const [newLabel, setNewLabel] = useState('Home');
  const [newFlat, setNewFlat] = useState('');
  const [newStreet, setNewStreet] = useState('');
  const [newArea, setNewArea] = useState('Ghatkopar East');
  const [newPin, setNewPin] = useState('400075');
  const [showAddAddress, setShowAddAddress] = useState(false);

  if (!user) return null;

  const userOrders = sortOrdersNewestFirst(
    orders.filter((o) => o.userId === user.id || (user.email && o.userEmail === user.email))
  );

  // Wishlisted products lookup
  const wishlistedProducts = products.filter(p => wishlistIds.includes(p.id));

  // Initials for avatar icon
  const initials = (user?.name || 'User')
    .split(' ')
    .map((n) => n[0] || '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';

  const handleUpdateProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim()) return;
    onUpdateProfile(pName.trim(), pPhone.trim());
    setErrorMsg(null);
    setSuccessMsg('🎉 Profile updated successfully!');
  };

  const handleAddAddress = () => {
    if (!newFlat.trim() || !newStreet.trim() || !newArea.trim() || !newPin.trim()) {
      setErrorMsg('Please fill out all mandatory address fields.');
      return;
    }
    setErrorMsg(null);
    const newAddr: Address = {
      label: newLabel.trim() || 'Home',
      flat: newFlat.trim(),
      street: newStreet.trim(),
      area: newArea.trim(),
      pin: newPin.trim(),
    };

    const updated = [...(user.addresses || []), newAddr];
    onUpdateAddresses(updated);
    setShowAddAddress(false);
    setSuccessMsg('📍 New delivery address saved successfully!');

    setNewFlat('');
    setNewStreet('');
  };

  const handleDeleteAddress = (idx: number) => {
    const updated = (user.addresses || []).filter((_, i) => i !== idx);
    onUpdateAddresses(updated);
    setConfirmDeleteIdx(null);
    setSuccessMsg('Address removed successfully.');
  };

  const handleToggleTheme = () => {
    const isDarkNow = !darkTheme;
    setDarkTheme(isDarkNow);
    if (isDarkNow) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleWipeData = () => {
    localStorage.removeItem('sabjies_cart');
    localStorage.removeItem('sabjies_wishlist');
    localStorage.removeItem('sabjies_recent_searches');
    localStorage.removeItem('sabjies_saved_for_later');
    setErrorMsg(null);
    setSuccessMsg('🧹 Local cache cleaned successfully.');
  };

  const getStatusColor = (status: string) => {
    const meta = getOrderStatusMeta(status);
    return meta.badgeClass;
  };

  const getTrackingSteps = (status: string) => {
    const norm = normalizeOrderStatus(status);
    const steps = [
      { id: 'New Orders', label: '1. New Orders', desc: 'Order placed & registered in Sabjies system' },
      { id: 'Confirmed', label: '2. Confirmed', desc: 'Sourced & reserved from fresh cold locker' },
      { id: 'Preparing', label: '3. Preparing', desc: 'Handpicked, sanitized, weighed & packed' },
      { id: 'Out for Delivery', label: '4. Out for Delivery', desc: 'With Sabjies priority rider en route to your doorstep' },
      { id: 'Delivered', label: '5. Delivered', desc: 'Freshly handed over at your doorstep!' },
    ];

    let activeIndex = 0;
    if (norm === 'New Orders') activeIndex = 0;
    else if (norm === 'Confirmed') activeIndex = 1;
    else if (norm === 'Preparing') activeIndex = 2;
    else if (norm === 'Out for Delivery') activeIndex = 3;
    else if (norm === 'Delivered') activeIndex = 4;
    else if (norm === 'Cancelled') activeIndex = -1;

    return { steps, activeIndex };
  };

  return (
    <div className="fixed inset-0 z-[550] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

      {/* Main Modal container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-[620px] rounded-3xl bg-[var(--card)] border border-[var(--border)] shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
      >
        {/* Header Block with avatar */}
        <div className="relative border-b border-[var(--border)] p-6 bg-gradient-to-r from-emerald-800 to-green-700 text-white flex-shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-xl font-black text-emerald-800 shadow-md">
              {initials}
            </div>
            <div>
              <h2 className="text-lg font-extrabold">{user.name}</h2>
              <p className="text-xs text-green-100 mt-0.5">{user.email}</p>
              <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider mt-2">
                {user.role === 'admin' ? '👑 Admin Panel' : '🌿 Family Member'}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation (Scrollable row) */}
        <div data-lenis-prevent className="flex overflow-x-auto scrollbar-none border-b border-[var(--border)] bg-[var(--bg)] text-xs font-bold text-[var(--muted-fg)] shrink-0 whitespace-nowrap">
          <button
            onClick={() => { setActiveTab('profile'); setSelectedTrackingOrder(null); }}
            className={`px-4 py-3.5 border-b-2 transition-all ${
              activeTab === 'profile' && !selectedTrackingOrder
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent hover:text-[var(--fg)]'
            }`}
          >
            👤 Profile Info
          </button>
          <button
            onClick={() => { setActiveTab('orders'); setSelectedTrackingOrder(null); }}
            className={`px-4 py-3.5 border-b-2 transition-all ${
              activeTab === 'orders' || selectedTrackingOrder
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent hover:text-[var(--fg)]'
            }`}
          >
            📦 Order History {userOrders.length > 0 && `(${userOrders.length})`}
          </button>
          <button
            onClick={() => { setActiveTab('wishlist'); setSelectedTrackingOrder(null); }}
            className={`px-4 py-3.5 border-b-2 transition-all ${
              activeTab === 'wishlist' && !selectedTrackingOrder
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent hover:text-[var(--fg)]'
            }`}
          >
            ❤️ Wishlist {wishlistedProducts.length > 0 && `(${wishlistedProducts.length})`}
          </button>
          <button
            onClick={() => { setActiveTab('payment_history'); setSelectedTrackingOrder(null); }}
            className={`px-4 py-3.5 border-b-2 transition-all ${
              activeTab === 'payment_history' && !selectedTrackingOrder
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent hover:text-[var(--fg)]'
            }`}
          >
            💳 Payments
          </button>
          <button
            onClick={() => { setActiveTab('addresses'); setSelectedTrackingOrder(null); }}
            className={`px-4 py-3.5 border-b-2 transition-all ${
              activeTab === 'addresses' && !selectedTrackingOrder
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent hover:text-[var(--fg)]'
            }`}
          >
            📍 Addresses
          </button>
          <button
            onClick={() => { setActiveTab('settings'); setSelectedTrackingOrder(null); }}
            className={`px-4 py-3.5 border-b-2 transition-all ${
              activeTab === 'settings' && !selectedTrackingOrder
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent hover:text-[var(--fg)]'
            }`}
          >
            ⚙️ Settings
          </button>
        </div>

        {/* Content Area */}
        <div data-lenis-prevent className="flex-1 overflow-y-auto p-6 overscroll-contain">
          <AnimatePresence>
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 p-3 rounded-2xl text-[11px] font-bold flex items-center gap-2 overflow-hidden"
              >
                <span>⚠️</span>
                <span className="flex-1">{errorMsg}</span>
                <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-600 p-0.5 cursor-pointer">✕</button>
              </motion.div>
            )}
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 p-3 rounded-2xl text-[11px] font-bold flex items-center gap-2 overflow-hidden"
              >
                <span>✅</span>
                <span className="flex-1">{successMsg}</span>
                <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-600 p-0.5 cursor-pointer">✕</button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tracking Subview Overlay inside orders tab */}
          {(() => {
            const currentTrackingOrder = selectedTrackingOrder
              ? (orders.find((o) => String(o.id) === String(selectedTrackingOrder.id)) || selectedTrackingOrder)
              : null;

            if (!currentTrackingOrder) return null;

            return (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <button
                      onClick={() => setSelectedTrackingOrder(null)}
                      className="text-xs font-bold text-[var(--primary)] hover:underline flex items-center gap-1 mb-1 cursor-pointer"
                    >
                      ← Back to Order History
                    </button>
                    <h3 className="text-sm font-extrabold text-[var(--fg)]">
                      Order Tracking for #{currentTrackingOrder.id}
                    </h3>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${getStatusColor(currentTrackingOrder.status)}`}>
                    {currentTrackingOrder.status}
                  </span>
                </div>

                {/* Smart Timeline Stepper */}
                {(() => {
                  const { steps, activeIndex } = getTrackingSteps(currentTrackingOrder.status);
                  return (
                    <div className="relative border-l border-emerald-200 ml-4 pl-6 space-y-6">
                      {steps.map((step, idx) => {
                        const isCompleted = idx <= activeIndex;
                        const isCurrent = idx === activeIndex;

                        return (
                          <div key={step.id} className="relative">
                            {/* Stepper Dot */}
                            <span className={`absolute -left-10 top-0.5 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all ${
                              isCompleted
                                ? 'bg-[var(--primary)] border-[var(--primary)] text-white shadow-sm'
                                : 'bg-[var(--card)] border-[var(--border)] text-[var(--muted-fg)]'
                            }`}>
                              {isCurrent ? '⚡' : idx + 1}
                            </span>

                            <div>
                              <h4 className={`text-xs font-extrabold ${isCompleted ? 'text-[var(--fg)]' : 'text-[var(--muted-fg)]'}`}>
                                {step.label}
                              </h4>
                              <p className="text-[10px] text-[var(--muted-fg)] mt-0.5">
                                {step.desc}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Express delivery extra details */}
                {normalizeOrderStatus(currentTrackingOrder.status) !== 'Cancelled' && normalizeOrderStatus(currentTrackingOrder.status) !== 'Delivered' && (
                  <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4.5 w-4.5 text-[var(--primary)]" />
                      <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        Express 90-Minute Delivery
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                      Your vegetables are monitored for refrigeration and temperature preservation. Fresh organic produce from Sabjies is strictly kept fresh!
                    </p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                      ETA: ~{(() => {
                        const s = normalizeOrderStatus(currentTrackingOrder.status);
                        if (s === 'New Orders') return '70-90';
                        if (s === 'Confirmed') return '50-60';
                        if (s === 'Preparing') return '30-40';
                        return '15-20';
                      })()} Minutes
                    </p>
                  </div>
                )}

                {/* Order Items Breakdown */}
                <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                  <h4 className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--muted-fg)]">
                    Purchased Items ({currentTrackingOrder.items?.length || 0})
                  </h4>
                  <div className="space-y-1.5">
                    {(currentTrackingOrder.items || []).map((it: any, itemIdx: number) => {
                      const raw = it.vegetableName || it.name || it.productName || it.title || it.itemName || 'Product';
                      const clean = (raw === '()' || raw === '( )') ? 'Product' : raw;
                      const weight = it.weight || '';
                      const unitPrice = it.price !== undefined ? it.price : (it.sp || 0);
                      const qty = it.quantity !== undefined ? it.quantity : (it.qty || 1);
                      const itemTotal = it.itemTotal !== undefined ? it.itemTotal : (it.lineTotal !== undefined ? it.lineTotal : (unitPrice * qty));

                      return (
                        <div key={itemIdx} className="flex items-center justify-between text-xs py-2 px-3 rounded-xl bg-[var(--card)] border border-[var(--border)]/70">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-base shrink-0">{it.emoji || '🥬'}</span>
                            <span className="font-extrabold text-[var(--fg)] truncate">{clean}</span>
                            {weight && (
                              <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200/60 dark:border-emerald-800/50 shrink-0">
                                {weight}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 font-mono text-xs font-black text-[var(--fg)] shrink-0">
                            <span>₹{unitPrice}</span>
                            {qty > 1 && (
                              <span className="text-[10px] font-semibold text-[var(--muted-fg)]">
                                × {qty} = <strong className="text-[var(--primary)] font-bold">₹{itemTotal}</strong>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
          {!selectedTrackingOrder && activeTab === 'profile' ? (
            /* Tab 1: Profile Form */
            <form onSubmit={handleUpdateProfileSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Full Name</label>
                  <input
                    type="text"
                    required
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-4 py-2.5 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)] transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Phone Number</label>
                  <input
                    type="tel"
                    value={pPhone}
                    onChange={(e) => setPPhone(e.target.value)}
                    placeholder="Enter phone number"
                    className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-4 py-2.5 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)] transition-all"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Email Address</label>
                <input
                  type="email"
                  disabled
                  value={user.email}
                  className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/50 px-4 py-2.5 text-xs text-[var(--muted-fg)] cursor-not-allowed outline-none"
                />
                <p className="text-[10px] text-[var(--muted-fg)] mt-0.5 italic">Registered account email cannot be changed.</p>
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="submit"
                  className="rounded-full bg-[var(--primary)] text-white px-6 py-2.5 text-xs font-black hover:opacity-95 shadow transition-all uppercase tracking-wider"
                >
                  Save Profile Edits
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-full border border-red-200 text-red-500 bg-red-50/30 hover:bg-red-50 px-6 py-2.5 text-xs font-bold transition-all uppercase tracking-wider"
                >
                  Logout Session
                </button>
              </div>
            </form>
          ) : activeTab === 'orders' ? (
            /* Tab 2: Orders List */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--border)]">
                <div>
                  <h3 className="text-sm font-extrabold text-[var(--fg)] flex items-center gap-2">
                    <Package className="h-4 w-4 text-[var(--primary)]" />
                    <span>Customer Order History</span>
                    <span className="text-[10px] bg-[var(--primary)]/10 text-[var(--primary)] font-bold px-2 py-0.5 rounded-full">
                      {userOrders.length} {userOrders.length === 1 ? 'Order' : 'Orders'}
                    </span>
                  </h3>
                  <p className="text-[10px] text-[var(--muted-fg)] mt-0.5">
                    Sorted newest to oldest · Real-time status updates & itemized receipts
                  </p>
                </div>
              </div>

              {userOrders.length === 0 ? (
                <div className="text-center py-8 text-[var(--muted-fg)] flex flex-col items-center">
                  <Package className="h-10 w-10 opacity-35 mb-2" />
                  <p className="text-xs font-bold text-[var(--fg)]">No order records found</p>
                  <p className="text-[10px] mt-0.5">Place order dynamically from the catalog.</p>
                </div>
              ) : (
                userOrders.map((order) => {
                  const meta = getOrderStatusMeta(order.status);
                  const dt = formatCustomerOrderDateTime(order.createdAt);
                  const formattedOrderNum = formatCustomerOrderNumber(order.id);

                  return (
                    <div
                      key={order.id}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-4 shadow-sm hover:border-gray-300 dark:hover:border-zinc-700 transition-all"
                    >
                      {/* Order Number & Status Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-[var(--primary)] shrink-0" />
                          <span className="text-sm sm:text-base font-black text-[var(--fg)] tracking-tight">
                            {formattedOrderNum}
                          </span>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide border shadow-2xs ${meta.badgeClass}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
                          <span>{meta.label}</span>
                        </span>
                      </div>

                      {/* Items List (Clearly displaying Vegetable — Weight/quantity — Item price) */}
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-black uppercase tracking-wider text-[var(--muted-fg)]">
                          Items ({order.items.length})
                        </div>
                        <div className="rounded-xl bg-[var(--muted)]/40 border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
                          {order.items.map((it: any, itemIdx: number) => {
                            const raw = it.vegetableName || it.name || it.productName || it.title || it.itemName || 'Product';
                            const clean = (raw === '()' || raw === '( )') ? 'Product' : raw;
                            const weight = it.weight || (it.weightInGrams ? `${it.weightInGrams}g` : '');
                            const unitPrice = it.price !== undefined ? it.price : (it.sp || 0);
                            const qty = it.quantity !== undefined ? it.quantity : (it.qty || 1);
                            const itemTotal = it.itemTotal !== undefined ? it.itemTotal : (it.lineTotal !== undefined ? it.lineTotal : (unitPrice * qty));
                            const weightQty = weight
                              ? (qty > 1 ? `${weight} (Qty: ${qty})` : weight)
                              : (qty > 1 ? `${qty} units` : '1 unit');

                            return (
                              <div
                                key={itemIdx}
                                className="flex items-center justify-between text-xs sm:text-sm py-2 px-3 hover:bg-[var(--card)]/60 transition-colors gap-2"
                              >
                                {/* Format: Tomato — 750g — ₹45 */}
                                <div className="flex items-center gap-2 flex-wrap min-w-0 font-medium text-[var(--fg)]">
                                  <span className="text-base shrink-0 select-none">{it.emoji || '🥬'}</span>
                                  <span className="font-bold text-[var(--fg)]">{clean}</span>
                                  <span className="text-[var(--muted-fg)] font-bold select-none">—</span>
                                  <span className="text-emerald-800 dark:text-emerald-300 font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200/60 dark:border-emerald-800/40 text-xs">
                                    {weightQty}
                                  </span>
                                  <span className="text-[var(--muted-fg)] font-bold select-none">—</span>
                                  <span className="font-mono font-black text-[var(--fg)]">
                                    ₹{itemTotal}
                                  </span>
                                </div>
                                {qty > 1 && (
                                  <div className="font-mono text-[10px] text-[var(--muted-fg)] shrink-0 pl-2">
                                    (₹{unitPrice} × {qty})
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Order Summary: Total, Status, Date/Time */}
                      <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] p-3.5 space-y-2.5 text-xs">
                        {/* Total */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="text-xs sm:text-sm font-black text-[var(--fg)] flex items-center gap-1.5">
                            <span>Total:</span>
                            <span className="text-base sm:text-lg font-black text-[var(--primary)]">₹{order.total}</span>
                          </div>
                          {order.payment && (
                            <span className="text-[10px] text-[var(--muted-fg)] font-medium">
                              Paid via {order.payment === 'Cash on Delivery' ? 'Cash on Delivery (COD)' : order.payment}
                            </span>
                          )}
                        </div>

                        {/* Status */}
                        <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]/60">
                          <span className="font-bold text-[var(--fg)]">Status:</span>
                          <span className="font-bold text-[var(--fg)] flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
                            <span>{meta.label}</span>
                          </span>
                          {order.paymentStatus && (
                            <span className={`ml-auto text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                              order.paymentStatus === 'Paid'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : order.paymentStatus === 'Pending'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-950/40'
                            }`}>
                              Payment: {order.paymentStatus}
                            </span>
                          )}
                        </div>

                        {/* Date / Time */}
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-2 border-t border-[var(--border)]/60 text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[var(--fg)]">Date/Time:</span>
                            <span className="font-bold text-[var(--fg)]">{dt.dateTime}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-[var(--muted-fg)]">
                            <span>Order Date: <strong className="font-semibold text-[var(--fg)]">{dt.date}</strong></span>
                            <span>•</span>
                            <span>Order Time: <strong className="font-semibold text-[var(--fg)]">{dt.time}</strong></span>
                          </div>
                        </div>
                      </div>

                    {order.deliveryInstructions && (
                      <p className="text-[10px] bg-[var(--muted)] px-2.5 py-1.5 rounded-lg text-[var(--muted-fg)] font-medium">
                        📣 <strong>Instructions:</strong> "{order.deliveryInstructions}"
                      </p>
                    )}

                    {/* If payment rejected, show the warning and resubmission form */}
                    {(order.paymentStatus === 'Rejected' || order.paymentStatus === 'Failed') && (
                      <div className="space-y-3 pt-1">
                        <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 p-3 space-y-1 text-[11px] text-red-900 dark:text-red-100">
                          <div className="flex items-center gap-1.5 font-black">
                            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                            <span>Payment Rejected / Verification Failed</span>
                          </div>
                          <p className="opacity-90 font-medium leading-relaxed">
                            Your payment is not showing. Please add a screenshot proof or double check payment details.
                          </p>
                          {order.adminRemarks && (
                            <p className="mt-1 font-mono text-[10px] bg-red-100/30 dark:bg-red-950/40 px-2 py-1 rounded text-red-900 dark:text-red-200">
                              <strong>Admin Remark:</strong> {order.adminRemarks}
                            </p>
                          )}
                        </div>

                        {/* Inline Resubmission Panel */}
                        <div className="p-3 bg-[var(--muted)]/50 rounded-xl border border-[var(--border)] space-y-2">
                          <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--fg)] flex items-center gap-1.5">
                            <RefreshCw className="h-3 w-3 text-[var(--primary)]" />
                            <span>Fix & Resubmit UPI Payment Proof</span>
                          </h4>

                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase block">
                              New UTR / Transaction ID
                            </label>
                            <input
                              type="text"
                              value={resubmitUtr[order.id] !== undefined ? resubmitUtr[order.id] : (order.utr || '')}
                              placeholder="Enter 12-digit UTR or Txn ID"
                              onChange={(e) => setResubmitUtr({ ...resubmitUtr, [order.id]: e.target.value })}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)] font-mono font-bold"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase block">
                              Updated Payment Screenshot
                            </label>
                            <div className="flex items-center gap-2">
                              <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 border border-dashed border-[var(--border)] rounded-lg bg-[var(--card)] cursor-pointer hover:bg-[var(--muted)] transition-all">
                                <Upload className="h-3 w-3 text-[var(--primary)]" />
                                <span className="text-[10px] font-bold text-[var(--primary)]">
                                  {resubmitImg[order.id] ? 'Change Screenshot' : 'Upload Screenshot'}
                                </span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0] || null;
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onloadend = () => {
                                        setResubmitImg({ ...resubmitImg, [order.id]: reader.result as string });
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                  className="hidden"
                                />
                              </label>

                              {(resubmitImg[order.id] || order.screenshotUrl) && (
                                <div className="relative h-8 w-8 rounded border border-[var(--border)] overflow-hidden bg-white shrink-0">
                                  <img
                                    src={resubmitImg[order.id] || order.screenshotUrl}
                                    alt="Preview"
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const utrVal = (resubmitUtr[order.id] !== undefined ? resubmitUtr[order.id] : (order.utr || '')).trim();
                              if (!utrVal || utrVal.length < 6) {
                                setErrorMsg("Please enter a valid UPI Transaction / UTR ID (at least 6 characters).");
                                return;
                              }
                              setErrorMsg(null);
                              onResubmitPayment?.(order.id, utrVal, resubmitImg[order.id] || order.screenshotUrl);
                              setSuccessMsg('Payment details updated. Admin has been notified!');
                            }}
                            className="w-full mt-1.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1.5 shadow transition-all uppercase tracking-wider"
                          >
                            <RefreshCw className="h-3 w-3" />
                            <span>Resubmit Payment Proof</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between pt-2.5 border-t border-[var(--border)] gap-2">
                      <span className="text-[10px] font-semibold text-[var(--muted-fg)]">
                        Amount: ₹<strong className="text-[var(--fg)] font-black text-xs">{order.total}</strong> via {order.payment === 'Cash on Delivery' ? 'COD' : 'UPI'}
                      </span>

                      <div className="flex gap-1.5">
                        {/* Download Invoice (Print receipt trigger) */}
                        <button
                          onClick={() => setViewingInvoice(order)}
                          className="rounded-full bg-[var(--muted)] border border-[var(--border)] text-[var(--fg)] px-3 py-1 text-[9px] font-black uppercase hover:bg-gray-200 dark:hover:bg-gray-800 transition-all flex items-center gap-1"
                        >
                          <Printer className="h-3 w-3 text-gray-500" />
                          <span>Invoice</span>
                        </button>

                        {/* Reorder Button with Subtle Adding to Cart Animation */}
                        {onReorder && (
                          <div className="relative inline-flex items-center">
                            <AnimatePresence>
                              {reorderingOrderId === order.id && reorderPhase === 'adding' && (
                                <motion.div
                                  initial={{ opacity: 0, y: 6, scale: 0.85 }}
                                  animate={{ opacity: 1, y: -26, scale: 1 }}
                                  exit={{ opacity: 0, y: -34, scale: 0.9 }}
                                  transition={{ duration: 0.25, ease: 'easeOut' }}
                                  className="absolute right-0 pointer-events-none z-30 flex items-center gap-1.5 rounded-full bg-emerald-700 px-2.5 py-1 text-[9px] font-extrabold text-white shadow-lg border border-emerald-500/50 whitespace-nowrap"
                                >
                                  <motion.span
                                    animate={{ y: [0, -3, 0] }}
                                    transition={{ duration: 0.4, repeat: Infinity }}
                                  >
                                    🛒
                                  </motion.span>
                                  <span>Adding to cart...</span>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            <motion.button
                              type="button"
                              disabled={reorderingOrderId !== null}
                              onClick={() => handleReorderWithAnimation(order)}
                              whileTap={reorderingOrderId === null ? { scale: 0.95 } : {}}
                              className={`relative overflow-hidden rounded-full px-3 py-1 text-[9px] font-black uppercase transition-all duration-200 flex items-center gap-1.5 cursor-pointer shadow-xs ${
                                reorderingOrderId === order.id
                                  ? reorderPhase === 'added'
                                    ? 'bg-emerald-600 text-white border border-emerald-500 shadow-md ring-2 ring-emerald-400/50'
                                    : 'bg-emerald-700 text-white border border-emerald-600 shadow-md'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900'
                              }`}
                            >
                              {reorderingOrderId === order.id ? (
                                reorderPhase === 'added' ? (
                                  <>
                                    <CheckCircle2 className="h-3 w-3 text-white" />
                                    <span>Added to Cart!</span>
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="h-3 w-3 animate-spin text-white" />
                                    <span>Adding...</span>
                                  </>
                                )
                              ) : (
                                <>
                                  <ShoppingCart className="h-3 w-3 text-emerald-700 dark:text-emerald-400" />
                                  <span>Reorder</span>
                                </>
                              )}
                            </motion.button>
                          </div>
                        )}

                        {/* Tracking button */}
                        <button
                          onClick={() => setSelectedTrackingOrder(order)}
                          className="rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-[var(--primary)] border border-emerald-200 px-3.5 py-1 text-[9px] font-black hover:bg-[var(--primary)] hover:text-white transition-all uppercase shadow-sm"
                        >
                          Track
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
              )}
            </div>
          ) : activeTab === 'wishlist' ? (
            /* Tab 3: Wishlist Products with Instant Add to Cart */
            <div className="space-y-4">
              {wishlistedProducts.length === 0 ? (
                <div className="text-center py-8 text-[var(--muted-fg)] flex flex-col items-center">
                  <Heart className="h-10 w-10 opacity-35 text-red-500 mb-2" />
                  <p className="text-xs font-bold text-[var(--fg)]">Your wishlist is empty</p>
                  <p className="text-[10px] mt-0.5">Save veggies to your wishlist to buy them later.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {wishlistedProducts.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3 flex items-center justify-between gap-3 shadow-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-11 w-11 rounded-xl bg-[var(--muted)] text-2xl flex items-center justify-center flex-shrink-0 select-none">
                          {p.emoji}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-extrabold text-[var(--fg)] truncate">{p.name}</h4>
                          <p className="text-[10px] text-[var(--muted-fg)]">₹{p.sp} · {p.weight}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => onToggleWishlist?.(p.id)}
                          className="p-1.5 text-red-500 hover:text-red-700 transition-colors"
                          title="Remove from wishlist"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            onAddToCart?.(p.id);
                            setSuccessMsg(`🛒 Added ${p.name} to your active cart!`);
                          }}
                          disabled={p.stockQty === 0}
                          className="rounded-full bg-[var(--primary)] text-white text-[10px] font-black uppercase px-3 py-1.5 hover:opacity-95 disabled:opacity-40 transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <ShoppingCart className="h-3 w-3" />
                          <span>Add</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'payment_history' ? (
            /* Tab 4: Payments & Transactions Ledger */
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-extrabold text-[var(--fg)] uppercase tracking-wide">
                <CreditCard className="h-4 w-4 text-[var(--primary)]" />
                <span>Transaction Log</span>
              </div>

              {userOrders.length === 0 ? (
                <p className="text-xs text-[var(--muted-fg)] italic py-4 text-center">No transactions available yet.</p>
              ) : (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden divide-y divide-[var(--border)]">
                  {userOrders.map((ord) => (
                    <div key={ord.id} className="p-3.5 flex justify-between items-center text-xs gap-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-[var(--fg)]">Order #{ord.id}</span>
                          <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                            ord.paymentStatus === 'Paid' 
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : ord.paymentStatus === 'Pending'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-950/40'
                          }`}>
                            {ord.paymentStatus}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--muted-fg)] mt-1">
                          Ref: <span className="font-mono">{ord.transactionId || 'N/A'}</span>
                        </p>
                        <p className="text-[9px] text-[var(--muted-fg)] mt-0.5">
                          {new Date(ord.createdAt).toLocaleDateString('en-IN')} via {ord.payment}
                        </p>
                      </div>

                      <span className="text-sm font-black text-[var(--primary)]">₹{ord.total}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'addresses' ? (
            /* Tab 5: Saved Addresses list */
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2.5">
                {(user.addresses || []).map((addr, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-start rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-xs"
                  >
                    <div>
                      <span className="text-[10px] font-extrabold text-[var(--primary)] bg-green-100 dark:bg-green-950 px-2.5 py-0.5 rounded uppercase tracking-wide">
                        {addr.label || 'Home'}
                      </span>
                      <p className="text-xs text-[var(--fg)] font-extrabold mt-2">
                        {addr.flat}, {addr.street}
                      </p>
                      <p className="text-[10px] text-[var(--muted-fg)] mt-0.5 font-semibold">
                        {addr.area} — {addr.pin}
                      </p>
                    </div>
                    {confirmDeleteIdx === i ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeleteAddress(i)}
                          className="text-[10px] font-bold text-white bg-rose-500 rounded-full px-2.5 py-1 cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDeleteIdx(null)}
                          className="text-[10px] font-bold text-[var(--muted-fg)] hover:underline cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteIdx(i)}
                        className="text-[10px] font-bold text-red-500 hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}

                {(user.addresses || []).length === 0 && (
                  <p className="text-xs text-[var(--muted-fg)] py-2 text-center italic">
                    No addresses stored. Complete checkout or add below to save one.
                  </p>
                )}
              </div>

              {/* Add Address fields within profile */}
              {!showAddAddress ? (
                <button
                  onClick={() => setShowAddAddress(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--border)] p-3 text-xs font-semibold text-[var(--primary)] hover:border-[var(--primary)] hover:bg-[var(--muted)] transition-all"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add New Delivery Address</span>
                </button>
              ) : (
                <div className="rounded-2xl border border-[var(--border)] p-4 flex flex-col gap-3">
                  <h4 className="text-xs font-extrabold text-[var(--fg)]">Create New Saved Address</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-[var(--muted-fg)]">Type</label>
                      <select
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-xs text-[var(--fg)] outline-none"
                      >
                        <option value="Home">🏠 Home</option>
                        <option value="Office">💼 Office</option>
                        <option value="Other">📍 Other</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-[var(--muted-fg)]">Flat / Door *</label>
                      <input
                        type="text"
                        value={newFlat}
                        onChange={(e) => setNewFlat(e.target.value)}
                        placeholder="e.g., A-102"
                        className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-xs text-[var(--fg)] outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-[var(--muted-fg)]">Street / Locality *</label>
                    <input
                      type="text"
                      value={newStreet}
                      onChange={(e) => setNewStreet(e.target.value)}
                      placeholder="e.g., Sunshine Enclave, LBS Marg"
                      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-xs text-[var(--fg)] outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-[var(--muted-fg)]">Area / Location *</label>
                      <input
                        type="text"
                        list="profile-delivery-zones"
                        value={newArea}
                        onChange={(e) => setNewArea(e.target.value)}
                        placeholder="e.g., Ghatkopar East / West, Vikhroli West"
                        className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-xs text-[var(--fg)] outline-none"
                      />
                      <datalist id="profile-delivery-zones">
                        <option value="Ghatkopar East" />
                        <option value="Ghatkopar West" />
                        <option value="Vikhroli West" />
                        <option value="Pant Nagar" />
                        <option value="Garodia Nagar" />
                        <option value="LBS Marg" />
                        <option value="Amrut Nagar" />
                        <option value="Cama Lane" />
                        <option value="Vallabh Baug Lane" />
                      </datalist>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-[var(--muted-fg)]">Pincode *</label>
                      <input
                        type="text"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        placeholder="e.g., 400086"
                        className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-xs text-[var(--fg)] outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end mt-2">
                    <button
                      onClick={() => setShowAddAddress(false)}
                      className="rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-1.5 text-xs font-semibold text-[var(--muted-fg)]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddAddress}
                      className="rounded-full bg-[var(--primary)] px-5 py-1.5 text-xs font-bold text-white hover:opacity-95"
                    >
                      Save Address
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Tab 6: Settings panel with simulated notifications & dark mode triggers */
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-xs font-extrabold text-[var(--fg)] uppercase tracking-wide">
                <Settings className="h-4 w-4 text-[var(--primary)]" />
                <span>Application Preferences</span>
              </div>

              <div className="space-y-4">
                {/* Dark Mode toggle */}
                <div className="flex items-center justify-between p-3.5 bg-[var(--muted)]/30 rounded-2xl border border-[var(--border)]">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--fg)] flex items-center gap-1.5">
                      {darkTheme ? <Moon className="h-3.5 w-3.5 text-indigo-400" /> : <Sun className="h-3.5 w-3.5 text-amber-500" />}
                      <span>Visual Night Mode</span>
                    </h4>
                    <p className="text-[10px] text-[var(--muted-fg)] mt-0.5">Toggle dark interface and eye-save colors</p>
                  </div>
                  <button
                    onClick={handleToggleTheme}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${darkTheme ? 'bg-[var(--primary)]' : 'bg-gray-300'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${darkTheme ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Simulated Push Notifications */}
                <div className="flex items-center justify-between p-3.5 bg-[var(--muted)]/30 rounded-2xl border border-[var(--border)]">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--fg)]">Push Order Updates</h4>
                    <p className="text-[10px] text-[var(--muted-fg)] mt-0.5">Receive immediate screen notification alerts on delivery dispatch</p>
                  </div>
                  <button
                    onClick={() => setPushNotifications(!pushNotifications)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${pushNotifications ? 'bg-[var(--primary)]' : 'bg-gray-300'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${pushNotifications ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Simulated SMS Notifications */}
                <div className="flex items-center justify-between p-3.5 bg-[var(--muted)]/30 rounded-2xl border border-[var(--border)]">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--fg)]">WhatsApp & SMS Receipts</h4>
                    <p className="text-[10px] text-[var(--muted-fg)] mt-0.5">Receive transaction reports on registered mobile number</p>
                  </div>
                  <button
                    onClick={() => setSmsNotifications(!smsNotifications)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${smsNotifications ? 'bg-[var(--primary)]' : 'bg-gray-300'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${smsNotifications ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Default payment selection */}
                <div className="flex items-center justify-between p-3.5 bg-[var(--muted)]/30 rounded-2xl border border-[var(--border)]">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--fg)]">Preferred Payment</h4>
                    <p className="text-[10px] text-[var(--muted-fg)] mt-0.5">Default method highlighted on checkout modal</p>
                  </div>
                  <select
                    value={defaultPayment}
                    onChange={(e) => setDefaultPayment(e.target.value as 'upi' | 'cod')}
                    className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-1.5 text-xs text-[var(--fg)] font-bold outline-none"
                  >
                    <option value="cod">💵 Cash on Delivery (COD)</option>
                  </select>
                </div>

                {/* Clear cache */}
                <div className="flex items-center justify-between p-3.5 bg-red-500/5 dark:bg-red-950/10 rounded-2xl border border-red-200/50">
                  <div>
                    <h4 className="text-xs font-bold text-red-600 dark:text-red-400">Wipe Local Caches</h4>
                    <p className="text-[10px] text-red-500/80 mt-0.5">Clears shopping cart, cached user orders and search query lists</p>
                  </div>
                  {showResetConfirm ? (
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-[9px] font-bold text-rose-500 uppercase">Are you absolutely sure?</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={handleWipeData}
                          className="rounded-xl bg-red-600 hover:bg-red-700 text-white text-[10px] font-extrabold px-3 py-1.5 uppercase transition-all cursor-pointer"
                        >
                          Wipe
                        </button>
                        <button
                          onClick={() => setShowResetConfirm(false)}
                          className="rounded-xl border border-[var(--border)] text-[var(--muted-fg)] text-[10px] font-bold px-3 py-1.5 transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowResetConfirm(true)}
                      className="rounded-xl bg-red-600 hover:bg-red-700 text-white text-[10px] font-extrabold px-3.5 py-2 uppercase shadow-sm transition-all cursor-pointer"
                    >
                      Wipe Storage
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Invoice Modal Overlay (Beautiful printable receipt) */}
      <AnimatePresence>
        {viewingInvoice && (
          <InvoiceModal 
            order={viewingInvoice} 
            onClose={() => setViewingInvoice(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
};
