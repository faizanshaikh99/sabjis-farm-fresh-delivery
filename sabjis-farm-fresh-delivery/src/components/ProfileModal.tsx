/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, Order, Address, Product } from '../types';
import { 
  User as UserIcon, MapPin, Package, Clipboard, Phone, Mail, X, Plus, 
  Clock, Compass, Truck, AlertTriangle, Upload, Image as ImageIcon, 
  RefreshCw, FileText, Heart, CreditCard, Settings, Moon, Sun, Trash2, 
  CheckCircle2, ShoppingCart, Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { InvoiceModal } from './InvoiceModal';

interface ProfileModalProps {
  user: User | null;
  orders: Order[];
  products: Product[];
  wishlistIds: number[];
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
  onClose,
  onUpdateProfile,
  onUpdateAddresses,
  onLogout,
  onResubmitPayment,
  onReorder,
  onAddToCart,
  onToggleWishlist,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'orders' | 'addresses' | 'wishlist' | 'payment_history' | 'settings'>('profile');
  const [selectedTrackingOrder, setSelectedTrackingOrder] = useState<Order | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Order | null>(null);

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

  const userOrders = orders.filter((o) => o.userId === user.id);

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
    switch (status) {
      case 'processing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300';
      case 'confirmed':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300';
      case 'packing':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
      case 'shipping':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300';
      case 'delivered':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
      case 'cancelled':
        return 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTrackingSteps = (status: string) => {
    const steps = [
      { id: 'processing', label: 'Order Registered', desc: 'Awaiting payment verification or scheduling confirmation' },
      { id: 'confirmed', label: 'Approved & Sourced', desc: 'Veggies reserved from cold locker' },
      { id: 'packing', label: 'Handpicked & Packed', desc: 'Sanitized package built and weighed' },
      { id: 'shipping', label: 'Out for Delivery', desc: 'In-route with express agent' },
      { id: 'delivered', label: 'Handed Over', desc: 'Delivered at flat doorstep!' },
    ];

    let activeIndex = 0;
    if (status === 'confirmed') activeIndex = 1;
    else if (status === 'packing') activeIndex = 2;
    else if (status === 'shipping') activeIndex = 3;
    else if (status === 'delivered') activeIndex = 4;
    else if (status === 'cancelled') activeIndex = -1;

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
          {selectedTrackingOrder ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <button
                    onClick={() => setSelectedTrackingOrder(null)}
                    className="text-xs font-bold text-[var(--primary)] hover:underline flex items-center gap-1 mb-1"
                  >
                    ← Back to Order History
                  </button>
                  <h3 className="text-sm font-extrabold text-[var(--fg)]">
                    Order Tracking for #{selectedTrackingOrder.id}
                  </h3>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${getStatusColor(selectedTrackingOrder.status)}`}>
                  {selectedTrackingOrder.status}
                </span>
              </div>

              {/* Smart Timeline Stepper */}
              {(() => {
                const { steps, activeIndex } = getTrackingSteps(selectedTrackingOrder.status);
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
              {selectedTrackingOrder.status !== 'cancelled' && selectedTrackingOrder.status !== 'delivered' && (
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
                    ETA: ~{selectedTrackingOrder.status === 'processing' ? '70-90' : selectedTrackingOrder.status === 'confirmed' ? '50-60' : selectedTrackingOrder.status === 'packing' ? '30-40' : '15-20'} Minutes
                  </p>
                </div>
              )}
            </div>
          ) : activeTab === 'profile' ? (
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
              {userOrders.length === 0 ? (
                <div className="text-center py-8 text-[var(--muted-fg)] flex flex-col items-center">
                  <Package className="h-10 w-10 opacity-35 mb-2" />
                  <p className="text-xs font-bold text-[var(--fg)]">No order records found</p>
                  <p className="text-[10px] mt-0.5">Place order dynamically from the catalog.</p>
                </div>
              ) : (
                userOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3 shadow-sm hover:border-gray-300 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-black text-[var(--primary)] block">
                          #{order.id}
                        </span>
                        <span className="text-[10px] text-[var(--muted-fg)] mt-0.5 block font-semibold">
                          {new Date(order.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </div>

                    <p className="text-[11px] text-[var(--fg)] font-bold">
                      {order.items.map((it: any) => {
                        const raw = it.name || it.productName || it.title || it.itemName || 'Product';
                        const clean = (raw === '()' || raw === '( )') ? 'Product' : raw;
                        return `${it.emoji || '🥬'} ${clean} ×${it.qty || 1}`;
                      }).join(', ')}
                    </p>

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

                        {/* Reorder Button */}
                        {onReorder && (
                          <button
                            onClick={() => {
                              onReorder(order.items.map(it => ({ id: it.id, qty: it.qty })));
                              setSuccessMsg('🔄 Added past items back to your cart!');
                            }}
                            className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 px-3 py-1 text-[9px] font-black uppercase hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-all cursor-pointer"
                          >
                            Reorder
                          </button>
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
                ))
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
