import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Percent, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  AlertCircle, 
  Sparkles, 
  RefreshCw, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  ShoppingBag, 
  ShieldCheck, 
  Tag, 
  HelpCircle 
} from 'lucide-react';
import { PaymentMethodDiscount } from '../types';

interface AdminPaymentDiscountsProps {
  onNotify?: (msg: string, type?: 'success' | 'error') => void;
  getAuthHeaders?: (extraHeaders?: Record<string, string>) => Record<string, string>;
}

const DEFAULT_METHODS = [
  { id: 'cod', name: 'Cash on Delivery (COD)', emoji: '💵', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  { id: 'gpay', name: 'Google Pay (GPay)', emoji: '🔵', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  { id: 'phonepe', name: 'PhonePe', emoji: '🟣', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-300' },
  { id: 'paytm', name: 'Paytm UPI & Wallet', emoji: '🟦', color: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  { id: 'upi', name: 'UPI / Online Payment', emoji: '⚡', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  { id: 'card', name: 'Credit & Debit Cards', emoji: '💳', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  { id: 'netbanking', name: 'Net Banking (50+ Banks)', emoji: '🏦', color: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' },
  { id: 'wallets', name: 'Wallets & Pay Later', emoji: '👛', color: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
];

const PRESETS = [
  {
    label: 'COD 2% OFF (Min ₹300, Max ₹50)',
    paymentMethod: 'cod',
    paymentMethodName: 'Cash on Delivery (COD)',
    discountType: 'percent' as const,
    discountValue: 2,
    minOrder: 300,
    maxDiscount: 50,
  },
  {
    label: 'GPay Flat ₹10 OFF (Min ₹500)',
    paymentMethod: 'gpay',
    paymentMethodName: 'Google Pay (GPay)',
    discountType: 'fixed' as const,
    discountValue: 10,
    minOrder: 500,
    maxDiscount: null,
  },
  {
    label: 'PhonePe 5% OFF (Min ₹600, Max ₹40)',
    paymentMethod: 'phonepe',
    paymentMethodName: 'PhonePe',
    discountType: 'percent' as const,
    discountValue: 5,
    minOrder: 600,
    maxDiscount: 40,
  },
  {
    label: 'Paytm Flat ₹15 OFF (Min ₹400)',
    paymentMethod: 'paytm',
    paymentMethodName: 'Paytm UPI & Wallet',
    discountType: 'fixed' as const,
    discountValue: 15,
    minOrder: 400,
    maxDiscount: null,
  },
];

export const AdminPaymentDiscounts: React.FC<AdminPaymentDiscountsProps> = ({ 
  onNotify,
  getAuthHeaders: propGetAuthHeaders
}) => {
  const [discounts, setDiscounts] = useState<PaymentMethodDiscount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Partial<PaymentMethodDiscount> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<{
    isAdmin: boolean;
    adminEmail?: string;
    isVerified: boolean;
  }>({
    isAdmin: false,
    isVerified: false
  });
  const [authError, setAuthError] = useState<string | null>(null);

  // Live Checkout Simulation state
  const [simCartValue, setSimCartValue] = useState<number>(550);
  const [simCouponDiscount, setSimCouponDiscount] = useState<number>(0);
  const [simDeliveryFee] = useState<number>(0);
  const [simSelectedMethod, setSimSelectedMethod] = useState<string>('gpay');

  // Verify logged-in administrator and construct authenticated request headers
  const getVerifiedAdminAuth = (extraHeaders: Record<string, string> = {}): {
    isValid: boolean;
    headers: Record<string, string>;
    error?: string;
    adminEmail?: string;
  } => {
    let currentUser: any = null;
    try {
      const userStr = localStorage.getItem('sabjies_current_user');
      if (userStr) {
        currentUser = JSON.parse(userStr);
      }
    } catch (e) {
      console.warn('Could not parse local current user:', e);
    }

    const sessionId = localStorage.getItem('sabjies_session_id') || '';

    // Check if user is recognized as administrator
    const isAdmin = Boolean(
      currentUser && (
        currentUser.role === 'admin' ||
        currentUser.id === 'admin_greensabjies' ||
        (typeof currentUser.email === 'string' && currentUser.email.toLowerCase() === 'greensabjies@gmail.com')
      )
    );

    if (!currentUser || !sessionId || !isAdmin) {
      return {
        isValid: false,
        headers: {},
        error: 'Authentication required. Please log in as an administrator.'
      };
    }

    // Check for any Supabase auth token
    let supabaseAuthToken = '';
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.access_token) {
              supabaseAuthToken = parsed.access_token;
              break;
            }
          }
        }
      }
    } catch (_) {}

    const authHeaders: Record<string, string> = {
      'x-session-id': sessionId,
      'x-user-id': String(currentUser.id || 'admin_greensabjies'),
      'x-user-email': String(currentUser.email || 'greensabjies@gmail.com'),
      'Authorization': `Bearer ${supabaseAuthToken || sessionId}`,
      ...extraHeaders
    };

    if (propGetAuthHeaders) {
      const parentHeaders = propGetAuthHeaders(extraHeaders);
      Object.assign(authHeaders, parentHeaders);
    }

    return {
      isValid: true,
      headers: authHeaders,
      adminEmail: currentUser.email || 'greensabjies@gmail.com'
    };
  };

  const fetchDiscounts = async () => {
    const auth = getVerifiedAdminAuth();
    if (!auth.isValid) {
      setAuthStatus({ isAdmin: false, isVerified: false });
      setAuthError(auth.error || 'Authentication required. Please log in as an administrator.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setAuthError(null);
      setAuthStatus({
        isAdmin: true,
        adminEmail: auth.adminEmail,
        isVerified: true
      });

      const res = await fetch('/api/admin/payment-method-discounts', {
        headers: auth.headers
      });

      if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        const errMsg = data.error || 'Authentication required. Please log in as an administrator.';
        setAuthError(errMsg);
        if (onNotify) onNotify(errMsg, 'error');
        return;
      }

      const data = await res.json();
      if (data && Array.isArray(data.discounts)) {
        setDiscounts(data.discounts);
      }
    } catch (err: any) {
      console.error('Failed to load payment method discounts:', err);
      if (onNotify) onNotify('Failed to load payment discounts.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiscounts();
  }, []);

  const handleOpenAdd = () => {
    const auth = getVerifiedAdminAuth();
    if (!auth.isValid) {
      const errMsg = auth.error || 'Authentication required. Please log in as an administrator.';
      setAuthError(errMsg);
      if (onNotify) onNotify(errMsg, 'error');
      return;
    }

    setEditingDiscount({
      paymentMethod: 'cod',
      paymentMethodName: 'Cash on Delivery (COD)',
      discountType: 'percent',
      discountValue: 2,
      minOrder: 300,
      maxDiscount: 50,
      startDate: null,
      endDate: null,
      status: 'active'
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: PaymentMethodDiscount) => {
    const auth = getVerifiedAdminAuth();
    if (!auth.isValid) {
      const errMsg = auth.error || 'Authentication required. Please log in as an administrator.';
      setAuthError(errMsg);
      if (onNotify) onNotify(errMsg, 'error');
      return;
    }

    setEditingDiscount({ ...item });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleApplyPreset = (preset: typeof PRESETS[0]) => {
    setEditingDiscount(prev => ({
      ...prev,
      paymentMethod: preset.paymentMethod,
      paymentMethodName: preset.paymentMethodName,
      discountType: preset.discountType,
      discountValue: preset.discountValue,
      minOrder: preset.minOrder,
      maxDiscount: preset.maxDiscount
    }));
  };

  const handleSaveDiscount = async () => {
    if (!editingDiscount) return;

    // 1. Verify logged-in administrator before request
    const auth = getVerifiedAdminAuth();
    if (!auth.isValid) {
      const errMsg = auth.error || 'Authentication required. Please log in as an administrator.';
      setFormError(errMsg);
      setAuthError(errMsg);
      if (onNotify) onNotify(errMsg, 'error');
      return;
    }

    if (!editingDiscount.paymentMethod) {
      setFormError('Please select a payment method.');
      return;
    }
    if (editingDiscount.discountValue === undefined || editingDiscount.discountValue === null || Number(editingDiscount.discountValue) < 0) {
      setFormError('Discount value must be a non-negative number.');
      return;
    }
    if (editingDiscount.discountType === 'percent' && (Number(editingDiscount.discountValue) <= 0 || Number(editingDiscount.discountValue) > 100)) {
      setFormError('Percentage discount must be between 1% and 100%.');
      return;
    }

    try {
      setIsSaving(true);
      setFormError(null);

      // 2. Pass authenticated admin session and token to the backend
      const res = await fetch('/api/admin/payment-method-discounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth.headers
        },
        body: JSON.stringify(editingDiscount)
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || !res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save payment discount');
      }

      setDiscounts(data.discounts || []);
      setIsModalOpen(false);
      setEditingDiscount(null);
      if (onNotify) onNotify('Payment method discount saved successfully!', 'success');
    } catch (err: any) {
      setFormError(err.message || 'Failed to save discount.');
      if (onNotify) onNotify(err.message || 'Failed to save discount.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (id: string) => {
    // 1. Verify logged-in administrator before request
    const auth = getVerifiedAdminAuth();
    if (!auth.isValid) {
      const errMsg = auth.error || 'Authentication required. Please log in as an administrator.';
      setAuthError(errMsg);
      if (onNotify) onNotify(errMsg, 'error');
      return;
    }

    try {
      // 2. Pass authenticated admin session and token to the backend
      const res = await fetch(`/api/admin/payment-method-discounts/${id}/toggle`, {
        method: 'PATCH',
        headers: auth.headers
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || !res.ok || !data.success) {
        throw new Error(data.error || 'Failed to toggle discount status');
      }

      setDiscounts(data.discounts || []);
      if (onNotify) onNotify(`Discount status updated to ${data.discount?.status}!`, 'success');
    } catch (err: any) {
      console.error(err);
      if (onNotify) onNotify(err.message || 'Failed to toggle discount status.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    // 1. Verify logged-in administrator before request
    const auth = getVerifiedAdminAuth();
    if (!auth.isValid) {
      const errMsg = auth.error || 'Authentication required. Please log in as an administrator.';
      setAuthError(errMsg);
      if (onNotify) onNotify(errMsg, 'error');
      return;
    }

    try {
      // 2. Pass authenticated admin session and token to the backend
      const res = await fetch(`/api/admin/payment-method-discounts/${id}`, {
        method: 'DELETE',
        headers: auth.headers
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || !res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete payment discount');
      }

      setDiscounts(data.discounts || []);
      setDeleteConfirmId(null);
      if (onNotify) onNotify('Payment method discount deleted.', 'success');
    } catch (err: any) {
      console.error(err);
      if (onNotify) onNotify(err.message || 'Failed to delete payment discount.', 'error');
    }
  };

  // Compute status: Active, Inactive, Scheduled, Expired
  const getComputedStatus = (item: PaymentMethodDiscount) => {
    if (item.status === 'inactive') return { label: 'Inactive', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-300' };
    const now = new Date();
    if (item.startDate && new Date(item.startDate) > now) {
      return { label: 'Scheduled', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200' };
    }
    if (item.endDate && new Date(item.endDate) < now) {
      return { label: 'Expired', color: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200' };
    }
    return { label: 'Active', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300' };
  };

  // Helper for simulation: calculate simulated discount
  const getSimulatedDiscount = (methodId: string, subtotal: number) => {
    const config = discounts.find(d => {
      const dKey = (d.paymentMethod || '').toLowerCase();
      const mKey = (methodId || '').toLowerCase();
      if (dKey === mKey) return true;
      if (mKey === 'gpay' && (dKey === 'google pay' || dKey === 'gpay')) return true;
      if (mKey === 'cod' && (dKey === 'cash on delivery' || dKey === 'cod')) return true;
      return false;
    });

    if (!config || config.status !== 'active') return null;

    const now = new Date();
    if (config.startDate && new Date(config.startDate) > now) return null;
    if (config.endDate && new Date(config.endDate) < now) return null;

    const minOrderMet = !config.minOrder || subtotal >= config.minOrder;
    const shortfall = config.minOrder && subtotal < config.minOrder ? config.minOrder - subtotal : 0;

    let discountAmount = 0;
    if (minOrderMet) {
      if (config.discountType === 'percent') {
        discountAmount = Math.round((subtotal * config.discountValue) / 100);
        if (config.maxDiscount && config.maxDiscount > 0) {
          discountAmount = Math.min(discountAmount, config.maxDiscount);
        }
      } else {
        discountAmount = Math.min(config.discountValue, subtotal);
      }
    }

    const badgeLabel = config.discountType === 'percent'
      ? `${config.discountValue}% OFF`
      : `₹${config.discountValue} OFF`;

    return {
      config,
      minOrderMet,
      shortfall,
      discountAmount,
      badgeLabel
    };
  };

  const activeCount = discounts.filter(d => getComputedStatus(d).label === 'Active').length;
  const currentSimDiscount = getSimulatedDiscount(simSelectedMethod, simCartValue);
  const simAppliedDiscount = currentSimDiscount?.minOrderMet ? currentSimDiscount.discountAmount : 0;
  const simFinalTotal = Math.max(0, simCartValue + simDeliveryFee - simCouponDiscount - simAppliedDiscount);

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base font-black text-[var(--fg)]">Payment Method Discounts</h2>
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Live Checkout Engine
            </span>
            {authStatus.isVerified ? (
              <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-bold px-2 py-0.5 rounded-full">
                <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                Admin Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 font-bold px-2 py-0.5 rounded-full">
                <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                Admin Auth Required
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--muted-fg)] mt-0.5 max-w-2xl">
            Configure exclusive customer discounts per payment method (COD, Google Pay, PhonePe, Paytm, UPI, Cards) with automatic minimum order rules, percentage caps, and real-time checkout updates.
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch md:self-auto">
          <button
            type="button"
            onClick={fetchDiscounts}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-[var(--fg)] transition-all cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-black rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>Add Discount</span>
          </button>
        </div>
      </div>

      {authError && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Administrator Session Required</p>
            <p className="mt-0.5">{authError}</p>
          </div>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase tracking-wider">Total Rules</span>
          <div className="text-2xl font-black text-[var(--fg)] mt-1">{discounts.length}</div>
          <span className="text-[10px] text-emerald-600 font-semibold">Configured methods</span>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase tracking-wider">Active Rules</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">{activeCount}</div>
          <span className="text-[10px] text-[var(--muted-fg)]">Applied at checkout</span>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase tracking-wider">Default Methods</span>
          <div className="text-2xl font-black text-[var(--fg)] mt-1">8</div>
          <span className="text-[10px] text-[var(--muted-fg)]">COD, UPI, Cards, Wallets</span>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase tracking-wider">Combines with Coupons</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">YES</div>
          <span className="text-[10px] text-emerald-600 font-semibold">Clean multi-savings policy</span>
        </div>
      </div>

      {/* Main Discounts List Table */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--muted)]/40">
          <div>
            <h3 className="text-xs font-black text-[var(--fg)] uppercase tracking-wider">Configured Payment Method Discounts</h3>
            <p className="text-[11px] text-[var(--muted-fg)] mt-0.5">Click toggle to instantly activate or pause any discount.</p>
          </div>
          <span className="text-[11px] font-bold text-[var(--muted-fg)]">
            Showing {discounts.length} rules
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-[var(--muted-fg)] font-semibold flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-emerald-600" />
            <span>Loading payment discounts...</span>
          </div>
        ) : discounts.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center mx-auto">
              <Tag className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-[var(--fg)]">No Payment Discounts Configured</h4>
            <p className="text-xs text-[var(--muted-fg)] max-w-sm mx-auto">
              Incentivize digital payments (or COD) by adding a percentage or fixed amount discount with optional minimum order thresholds.
            </p>
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-black rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Add First Payment Discount</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]/60 text-[10px] font-black uppercase text-[var(--muted-fg)] tracking-wider">
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4">Discount</th>
                  <th className="py-3 px-4">Min. Order</th>
                  <th className="py-3 px-4">Max. Cap</th>
                  <th className="py-3 px-4">Validity</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {discounts.map((item) => {
                  const statusInfo = getComputedStatus(item);
                  const matchedMethod = DEFAULT_METHODS.find(m => m.id === item.paymentMethod.toLowerCase());

                  return (
                    <tr key={item.id} className="hover:bg-[var(--muted)]/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg shrink-0">
                            {matchedMethod?.emoji || '💳'}
                          </span>
                          <div>
                            <span className="font-extrabold text-[var(--fg)] block">
                              {item.paymentMethodName || item.paymentMethod}
                            </span>
                            <span className="text-[10px] text-[var(--muted-fg)] uppercase font-mono">
                              Key: {item.paymentMethod}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-black text-xs border border-emerald-200 dark:border-emerald-800">
                          {item.discountType === 'percent' ? (
                            <span>{item.discountValue}% OFF</span>
                          ) : (
                            <span>₹{item.discountValue} OFF</span>
                          )}
                        </div>
                        <div className="text-[9px] text-[var(--muted-fg)] mt-0.5">
                          {item.discountType === 'percent' ? 'Percentage based' : 'Flat rupee discount'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-[var(--fg)]">
                        {item.minOrder ? (
                          <span className="font-mono">₹{item.minOrder}</span>
                        ) : (
                          <span className="text-[var(--muted-fg)] text-[11px]">No Minimum</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-[var(--fg)]">
                        {item.discountType === 'percent' && item.maxDiscount ? (
                          <span className="font-mono text-emerald-700 dark:text-emerald-400">Max ₹{item.maxDiscount}</span>
                        ) : (
                          <span className="text-[var(--muted-fg)] text-[11px]">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-[11px] text-[var(--muted-fg)]">
                        {item.startDate || item.endDate ? (
                          <div className="space-y-0.5">
                            {item.startDate && <div>From: {new Date(item.startDate).toLocaleDateString()}</div>}
                            {item.endDate && <div>To: {new Date(item.endDate).toLocaleDateString()}</div>}
                          </div>
                        ) : (
                          <span>Always Active</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(item.id)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              item.status === 'active' ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-700'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                item.status === 'active' ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold border uppercase ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            title="Edit Discount"
                            className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] text-[var(--fg)] transition-all cursor-pointer"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(item.id)}
                            title="Delete Discount"
                            className="p-1.5 rounded-lg border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 transition-all cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Real-time Customer Checkout Preview Simulator */}
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-gradient-to-br from-emerald-50/50 to-green-50/30 dark:from-emerald-950/20 dark:to-green-950/10 p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <h3 className="text-xs font-black uppercase tracking-wider text-emerald-950 dark:text-emerald-200">
                Live Customer Checkout Simulator
              </h3>
            </div>
            <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-0.5">
              Simulate customer checkout in real time to verify discount calculation, minimum thresholds, and customer savings badges.
            </p>
          </div>

          <div className="flex items-center gap-2 self-stretch md:self-auto bg-white dark:bg-zinc-900 border border-[var(--border)] p-1.5 rounded-xl text-xs">
            <span className="text-[11px] font-bold text-[var(--muted-fg)] pl-2">Sample Cart Subtotal:</span>
            <div className="flex items-center gap-1 font-mono font-black">
              <span>₹</span>
              <input
                type="number"
                min={0}
                step={50}
                value={simCartValue}
                onChange={(e) => setSimCartValue(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--fg)] outline-none text-right font-black font-mono"
              />
            </div>
            <div className="flex gap-1">
              {[250, 450, 600, 1000].map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSimCartValue(v)}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer ${
                    simCartValue === v ? 'bg-emerald-600 text-white' : 'bg-[var(--muted)] text-[var(--fg)]'
                  }`}
                >
                  ₹{v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Simulator Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Methods grid */}
          <div className="md:col-span-2 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-fg)]">
              Customer Payment Options (Click to Test)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DEFAULT_METHODS.map(method => {
                const isSelected = simSelectedMethod === method.id;
                const simDiscount = getSimulatedDiscount(method.id, simCartValue);

                return (
                  <div
                    key={method.id}
                    onClick={() => setSimSelectedMethod(method.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'border-emerald-600 bg-white dark:bg-zinc-900 shadow-md ring-2 ring-emerald-500/20'
                        : 'border-[var(--border)] bg-white/70 dark:bg-zinc-900/50 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{method.emoji}</span>
                        <div>
                          <span className="text-xs font-bold text-[var(--fg)] block">{method.name}</span>
                          {simDiscount ? (
                            simDiscount.minOrderMet ? (
                              <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400">
                                🎉 Save ₹{simDiscount.discountAmount} ({simDiscount.badgeLabel})
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                                💡 Add ₹{simDiscount.shortfall} more for {simDiscount.badgeLabel}
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] text-[var(--muted-fg)]">Standard rate</span>
                          )}
                        </div>
                      </div>

                      <div className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-400'
                      }`}>
                        {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Simulated Order Summary */}
          <div className="rounded-xl border border-[var(--border)] bg-white dark:bg-zinc-900 p-4 space-y-3 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted-fg)] block border-b border-[var(--border)] pb-2 mb-3">
                Simulated Order Summary
              </span>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-[var(--muted-fg)]">
                  <span>Subtotal</span>
                  <span className="font-mono font-bold text-[var(--fg)]">₹{simCartValue}</span>
                </div>
                <div className="flex justify-between text-[var(--muted-fg)]">
                  <span>Delivery Fee</span>
                  <span className="font-mono font-bold text-emerald-600">FREE</span>
                </div>

                {simCouponDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>Coupon Promo</span>
                    <span className="font-mono">-₹{simCouponDiscount}</span>
                  </div>
                )}

                {simAppliedDiscount > 0 && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/60 p-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 text-[11px]">
                    <span className="flex items-center gap-1">
                      <span>🏷️</span>
                      <span>{currentSimDiscount?.config.paymentMethodName || simSelectedMethod} Discount:</span>
                    </span>
                    <span className="font-mono font-black">-₹{simAppliedDiscount}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-[var(--border)] flex justify-between items-baseline font-black text-sm">
                  <span>Customer Pays:</span>
                  <span className="text-base text-emerald-600 font-mono font-black">₹{simFinalTotal}</span>
                </div>
              </div>
            </div>

            {simAppliedDiscount > 0 ? (
              <div className="p-2 bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 text-center rounded-lg text-[10px] font-black">
                ✨ Customer saves ₹{simAppliedDiscount + simCouponDiscount} on this order!
              </div>
            ) : currentSimDiscount && !currentSimDiscount.minOrderMet ? (
              <div className="p-2 bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-200 text-center rounded-lg text-[10px] font-bold">
                ⚠️ Order subtotal below ₹{currentSimDiscount.config.minOrder} requirement.
              </div>
            ) : (
              <div className="p-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-center rounded-lg text-[10px] font-medium">
                No active discount for {simSelectedMethod.toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit / Create Modal */}
      {isModalOpen && editingDiscount && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-3xl bg-[var(--card)] border border-[var(--border)] shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-emerald-600" />
                <h3 className="text-sm font-black text-[var(--fg)]">
                  {editingDiscount.id ? 'Edit Payment Method Discount' : 'Add Payment Method Discount'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="h-8 w-8 rounded-full border border-[var(--border)] flex items-center justify-center text-[var(--muted-fg)] hover:text-[var(--fg)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Presets Row */}
            {!editingDiscount.id && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase text-[var(--muted-fg)]">
                  ⚡ Quick Presets (Click to Auto-fill)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyPreset(p)}
                      className="px-2.5 py-1 text-[10px] font-bold rounded-lg border border-[var(--border)] bg-[var(--muted)] hover:bg-emerald-50 hover:border-emerald-300 text-[var(--fg)] transition-all cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[var(--fg)] mb-1">Payment Method *</label>
                <select
                  value={editingDiscount.paymentMethod || 'cod'}
                  onChange={(e) => {
                    const sel = DEFAULT_METHODS.find(m => m.id === e.target.value);
                    setEditingDiscount({
                      ...editingDiscount,
                      paymentMethod: e.target.value,
                      paymentMethodName: sel ? sel.name : e.target.value
                    });
                  }}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5 text-xs text-[var(--fg)] outline-none font-bold"
                >
                  {DEFAULT_METHODS.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.emoji} {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[var(--fg)] mb-1">Discount Type *</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[var(--muted)] border border-[var(--border)]">
                    <button
                      type="button"
                      onClick={() => setEditingDiscount({ ...editingDiscount, discountType: 'percent' })}
                      className={`py-1.5 rounded-lg text-xs font-black cursor-pointer transition-all ${
                        editingDiscount.discountType === 'percent'
                          ? 'bg-emerald-600 text-white shadow'
                          : 'text-[var(--muted-fg)]'
                      }`}
                    >
                      Percentage (%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingDiscount({ ...editingDiscount, discountType: 'fixed' })}
                      className={`py-1.5 rounded-lg text-xs font-black cursor-pointer transition-all ${
                        editingDiscount.discountType === 'fixed'
                          ? 'bg-emerald-600 text-white shadow'
                          : 'text-[var(--muted-fg)]'
                      }`}
                    >
                      Fixed Rupee (₹)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-[var(--fg)] mb-1">
                    Discount Value ({editingDiscount.discountType === 'percent' ? '%' : '₹'}) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={editingDiscount.discountType === 'percent' ? 100 : undefined}
                    value={editingDiscount.discountValue ?? ''}
                    onChange={(e) => setEditingDiscount({ ...editingDiscount, discountValue: e.target.value === '' ? 0 : Number(e.target.value) })}
                    placeholder={editingDiscount.discountType === 'percent' ? 'e.g. 2' : 'e.g. 10'}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5 text-xs text-[var(--fg)] font-bold outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[var(--fg)] mb-1">
                    Min. Order Value (₹) <span className="text-[10px] text-[var(--muted-fg)] font-normal">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editingDiscount.minOrder ?? ''}
                    onChange={(e) => setEditingDiscount({ ...editingDiscount, minOrder: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="e.g. 300 (Empty = No min)"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5 text-xs text-[var(--fg)] outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[var(--fg)] mb-1">
                    Max Discount Cap (₹) <span className="text-[10px] text-[var(--muted-fg)] font-normal">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    disabled={editingDiscount.discountType !== 'percent'}
                    value={editingDiscount.maxDiscount ?? ''}
                    onChange={(e) => setEditingDiscount({ ...editingDiscount, maxDiscount: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder={editingDiscount.discountType === 'percent' ? 'e.g. 50 (Empty = No cap)' : 'N/A for flat ₹'}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5 text-xs text-[var(--fg)] outline-none disabled:opacity-40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[var(--fg)] mb-1">
                    Start Date <span className="text-[10px] text-[var(--muted-fg)] font-normal">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    value={editingDiscount.startDate ? editingDiscount.startDate.split('T')[0] : ''}
                    onChange={(e) => setEditingDiscount({ ...editingDiscount, startDate: e.target.value || null })}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5 text-xs text-[var(--fg)] outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[var(--fg)] mb-1">
                    End Date <span className="text-[10px] text-[var(--muted-fg)] font-normal">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    value={editingDiscount.endDate ? editingDiscount.endDate.split('T')[0] : ''}
                    onChange={(e) => setEditingDiscount({ ...editingDiscount, endDate: e.target.value || null })}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5 text-xs text-[var(--fg)] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[var(--fg)] mb-1">Status</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingDiscount({ ...editingDiscount, status: editingDiscount.status === 'active' ? 'inactive' : 'active' })}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-2 ${
                      editingDiscount.status === 'active'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${editingDiscount.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                    <span>{editingDiscount.status === 'active' ? 'Active (Live at Checkout)' : 'Inactive (Disabled)'}</span>
                  </button>
                </div>
              </div>

              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-red-600 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-[var(--border)] text-[var(--muted-fg)] hover:text-[var(--fg)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveDiscount}
                className="px-5 py-2 text-xs font-black rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 stroke-[3]" />}
                <span>Save Discount Rule</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl p-5 space-y-4 text-center">
            <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-950 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-[var(--fg)]">Delete Payment Discount?</h4>
              <p className="text-xs text-[var(--muted-fg)] mt-1">
                Are you sure you want to delete this payment method discount rule? Customers will no longer receive this discount at checkout.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-[var(--border)] text-[var(--muted-fg)] hover:text-[var(--fg)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2 text-xs font-black rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-md cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
