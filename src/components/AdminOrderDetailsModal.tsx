/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Clock,
  Package,
  Printer,
  Copy,
  Check,
  CheckCircle2,
  Leaf,
  Scale,
  Receipt,
  FileText,
  RotateCcw
} from 'lucide-react';
import { motion } from 'motion/react';
import { Order } from '../types';
import {
  CanonicalOrderStatus,
  ORDER_STATUSES,
  getOrderStatusMeta,
  normalizeOrderStatus,
} from '../utils/orderStatus';

interface AdminOrderDetailsModalProps {
  order: Order | null;
  isOpen?: boolean;
  onClose: () => void;
  onUpdateStatus: (orderId: string, status: CanonicalOrderStatus) => void;
  onUpdatePaymentStatus?: (
    orderId: string,
    paymentStatus: 'Pending' | 'Paid' | 'Failed' | 'Rejected',
    remarks?: string
  ) => void;
  onOpenInvoice?: (order: Order) => void;
  onInitiateRazorpayRefund?: (orderId: string, amount: number) => void;
}

export const AdminOrderDetailsModal: React.FC<AdminOrderDetailsModalProps> = ({
  order,
  isOpen = true,
  onClose,
  onUpdateStatus,
  onUpdatePaymentStatus,
  onOpenInvoice,
  onInitiateRazorpayRefund,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [adminRemarksInput, setAdminRemarksInput] = useState('');
  const [showRemarksInput, setShowRemarksInput] = useState(false);

  if (!isOpen || !order) return null;

  const currentStatus = normalizeOrderStatus(order.status);
  const statusMeta = getOrderStatusMeta(currentStatus);

  // Copy helper
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Date and Time Formatting
  const orderDateObj = order.createdAt ? new Date(order.createdAt) : null;
  const formattedDate = orderDateObj && !isNaN(orderDateObj.getTime())
    ? orderDateObj.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Date not available';

  const formattedTime = orderDateObj && !isNaN(orderDateObj.getTime())
    ? orderDateObj.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
    : 'Time not available';

  // Subtotal & Financials
  const itemsSubtotal = order.items && order.items.length > 0
    ? order.items.reduce((acc, it: any) => {
        const p = it.price !== undefined ? it.price : (it.sp || 0);
        const q = it.quantity !== undefined ? it.quantity : (it.qty || 1);
        return acc + (it.itemTotal !== undefined ? it.itemTotal : (it.lineTotal !== undefined ? it.lineTotal : p * q));
      }, 0)
    : 0;

  const subtotal = order.subtotal !== undefined ? order.subtotal : itemsSubtotal;
  const deliveryCharge = order.delivery !== undefined ? order.delivery : 0;
  const discount = order.discountApplied || 0;
  const paymentDiscount = order.paymentDiscountAmount || 0;
  const finalTotal = order.total !== undefined ? order.total : Math.max(0, subtotal + deliveryCharge - discount - paymentDiscount);

  // Status Change Handler with immediate feedback
  const handleStatusChange = (newStatus: CanonicalOrderStatus) => {
    setIsUpdatingStatus(true);
    onUpdateStatus(order.id, newStatus);
    setTimeout(() => setIsUpdatingStatus(false), 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
      />

      {/* Modal Dialog */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 15 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl bg-[var(--card)] border border-[var(--border)] shadow-2xl overflow-hidden z-10"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4 bg-[var(--bg)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-[var(--fg)] tracking-tight">
                  Order #{order.id}
                </h2>
                <button
                  type="button"
                  onClick={() => handleCopy(order.id, 'id')}
                  className="p-1 text-[var(--muted-fg)] hover:text-[var(--fg)] rounded transition-colors"
                  title="Copy Order ID"
                >
                  {copiedField === 'id' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-[var(--muted-fg)] flex items-center gap-2">
                <span>{formattedDate}</span>
                <span>•</span>
                <span>{formattedTime}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenInvoice && (
              <button
                type="button"
                onClick={() => onOpenInvoice(order)}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-xs font-bold text-[var(--fg)] transition-all cursor-pointer shadow-xs"
              >
                <Printer className="h-3.5 w-3.5 text-gray-500" />
                <span>Invoice</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--fg)] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">

          {/* Quick Status Bar & Actions Banner */}
          <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${statusMeta.bgLightClass} ${statusMeta.borderClass}`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{statusMeta.emoji}</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted-fg)]">
                    Current Order Status:
                  </span>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wide border ${statusMeta.badgeClass}`}>
                    <span className={`h-2 w-2 rounded-full ${statusMeta.dotClass}`} />
                    {statusMeta.label}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--muted-fg)] mt-0.5">
                  {statusMeta.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:shrink-0">
              {/* Canonical Status Selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-[var(--muted-fg)]">Change to:</span>
                <select
                  value={currentStatus}
                  disabled={isUpdatingStatus}
                  onChange={(e) => handleStatusChange(e.target.value as CanonicalOrderStatus)}
                  className="px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-xs font-bold text-[var(--fg)] shadow-xs outline-none focus:ring-2 focus:ring-[var(--primary)] cursor-pointer"
                >
                  {ORDER_STATUSES.map((statusOption) => (
                    <option key={statusOption} value={statusOption}>
                      {statusOption === 'Delivered' ? '✅ 5. Delivered / Completed' : statusOption}
                    </option>
                  ))}
                </select>
              </div>

              {/* Direct "Mark as Delivered" button if not already delivered */}
              {currentStatus !== 'Delivered' ? (
                <button
                  type="button"
                  onClick={() => handleStatusChange('Delivered')}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Mark as Delivered</span>
                </button>
              ) : (
                <span className="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-xs font-extrabold flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Delivered & Archived</span>
                </span>
              )}
            </div>
          </div>

          {/* Section 1: Customer & Section 2: Order Side-by-Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* ### CUSTOMER SECTION */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-3.5 shadow-xs">
              <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2.5">
                <User className="h-4 w-4 text-[var(--primary)]" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--fg)]">
                  Customer
                </h3>
              </div>

              <div className="space-y-2.5 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase block mb-0.5">
                    Customer Name
                  </span>
                  <p className="font-bold text-[var(--fg)] text-sm">
                    {order.userName || 'Guest Customer'}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase block mb-0.5">
                    Contact Details
                  </span>
                  <div className="space-y-1.5">
                    {order.phone ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[var(--fg)]">
                          <Phone className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <a
                            href={`tel:${order.phone}`}
                            className="font-mono font-bold hover:underline"
                          >
                            {order.phone}
                          </a>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(order.phone || '', 'phone')}
                          className="p-1 text-[var(--muted-fg)] hover:text-[var(--fg)]"
                          title="Copy Phone"
                        >
                          {copiedField === 'phone' ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <p className="text-[var(--muted-fg)] italic">No phone provided</p>
                    )}

                    {order.userEmail && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[var(--fg)] truncate">
                          <Mail className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                          <a
                            href={`mailto:${order.userEmail}`}
                            className="text-xs hover:underline truncate"
                          >
                            {order.userEmail}
                          </a>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(order.userEmail || '', 'email')}
                          className="p-1 text-[var(--muted-fg)] hover:text-[var(--fg)] shrink-0"
                          title="Copy Email"
                        >
                          {copiedField === 'email' ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase block mb-0.5">
                    Delivery Address
                  </span>
                  <div className="flex items-start gap-1.5 rounded-xl bg-[var(--muted)]/50 p-2.5 text-[var(--fg)]">
                    <MapPin className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="leading-relaxed font-medium">
                        {order.address || 'Standard Ghatkopar Delivery Address'}
                      </p>
                      {order.deliveryInstructions && (
                        <div className="mt-2 pt-2 border-t border-[var(--border)] text-[11px] text-[var(--muted-fg)]">
                          <span className="font-bold text-[var(--fg)]">Special Instructions: </span>
                          <span>{order.deliveryInstructions}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ### ORDER SECTION */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-3.5 shadow-xs">
              <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2.5">
                <FileText className="h-4 w-4 text-[var(--primary)]" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--fg)]">
                  Order
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase block mb-0.5">
                      Order ID
                    </span>
                    <p className="font-mono font-bold text-[var(--fg)] text-sm">
                      #{order.id}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase block mb-0.5">
                      Current Status
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase border ${statusMeta.badgeClass}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotClass}`} />
                      {statusMeta.label}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase block mb-0.5">
                      Order Date
                    </span>
                    <p className="font-semibold text-[var(--fg)] flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-[var(--muted-fg)]" />
                      {formattedDate}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase block mb-0.5">
                      Order Time
                    </span>
                    <p className="font-semibold text-[var(--fg)] flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-[var(--muted-fg)]" />
                      {formattedTime}
                    </p>
                  </div>
                </div>

                {order.updatedAt && (
                  <div className="pt-2 border-t border-[var(--border)] text-[10px] text-[var(--muted-fg)]">
                    <span>Last Status Update: </span>
                    <span className="font-semibold text-[var(--fg)]">
                      {new Date(order.updatedAt).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ### ITEMS SECTION */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <div className="flex items-center gap-2">
                <Leaf className="h-4 w-4 text-emerald-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--fg)]">
                  Items
                </h3>
              </div>
              <span className="text-[11px] font-bold text-[var(--muted-fg)]">
                {order.items?.length || 0} {order.items?.length === 1 ? 'Vegetable' : 'Vegetables'}
              </span>
            </div>

            {/* Items Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[10px] font-extrabold uppercase text-[var(--muted-fg)] bg-[var(--muted)]/40">
                    <th className="p-2.5">Vegetable Name</th>
                    <th className="p-2.5">Weight</th>
                    <th className="p-2.5">Custom Weight</th>
                    <th className="p-2.5">Pricing Type</th>
                    <th className="p-2.5 text-right">Item Price</th>
                    <th className="p-2.5 text-center">Quantity</th>
                    <th className="p-2.5 text-right">Item Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {(order.items || []).map((item: any, idx: number) => {
                    const rawName = item.vegetableName || item.name || item.productName || item.title || 'Fresh Vegetable';
                    const cleanName = (rawName === '()' || rawName === '( )') ? 'Fresh Vegetable' : rawName;
                    const weightStr = item.weight || (item.weightInGrams ? `${item.weightInGrams}g` : '1 kg');
                    
                    // Determine if custom weight
                    const isCustomWeight = Boolean(
                      item.isCustomWeight ||
                      item.pricingType === 'Custom Weight' ||
                      (item.formulaText && item.formulaText.includes('system-calculated')) ||
                      (item.formulaText && item.formulaText.includes('admin-defined')) ||
                      (item.weightInGrams && ![250, 500, 1000].includes(item.weightInGrams))
                    );

                    // Determine pricing type
                    let pricingTypeLabel = 'Standard Rate';
                    if (item.pricingType) {
                      pricingTypeLabel = item.pricingType;
                    } else if (item.formulaText?.includes('Admin-defined') || item.formulaText?.includes('admin-defined')) {
                      pricingTypeLabel = 'Admin Weight Slab';
                    } else if (item.formulaText?.includes('system-calculated') || item.formulaText) {
                      pricingTypeLabel = 'Custom Weight (Proportional)';
                    } else if (item.weight && item.weight.toLowerCase().includes('slab')) {
                      pricingTypeLabel = 'Weight Slab';
                    } else if (isCustomWeight) {
                      pricingTypeLabel = 'Custom Weight';
                    }

                    const itemPrice = item.price !== undefined ? item.price : (item.sp || 0);
                    const quantity = item.quantity !== undefined ? item.quantity : (item.qty || 1);
                    const itemTotal = item.itemTotal !== undefined ? item.itemTotal : (item.lineTotal !== undefined ? item.lineTotal : itemPrice * quantity);

                    return (
                      <tr key={idx} className="hover:bg-[var(--muted)]/20 transition-colors">
                        {/* Vegetable Name */}
                        <td className="p-2.5 font-bold text-[var(--fg)]">
                          <div className="flex items-center gap-2">
                            {item.img ? (
                              <img
                                src={item.img}
                                alt={cleanName}
                                className="h-8 w-8 rounded-lg object-cover border border-[var(--border)] shrink-0"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-base shrink-0">
                                {item.emoji || '🥬'}
                              </span>
                            )}
                            <div>
                              <span>{cleanName}</span>
                            </div>
                          </div>
                        </td>

                        {/* Weight */}
                        <td className="p-2.5 font-semibold text-[var(--fg)] whitespace-nowrap">
                          {weightStr}
                        </td>

                        {/* Custom Weight If Applicable */}
                        <td className="p-2.5 whitespace-nowrap">
                          {isCustomWeight ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 font-extrabold text-[10px]">
                              <Scale className="h-3 w-3" />
                              Custom ({weightStr})
                            </span>
                          ) : (
                            <span className="text-[10px] text-[var(--muted-fg)] font-medium">
                              Standard
                            </span>
                          )}
                        </td>

                        {/* Pricing Type */}
                        <td className="p-2.5 text-[11px] text-[var(--muted-fg)] whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-[var(--muted)] text-[var(--fg)] font-medium text-[10px]">
                            {pricingTypeLabel}
                          </span>
                        </td>

                        {/* Item Price */}
                        <td className="p-2.5 text-right font-mono font-bold text-[var(--fg)] whitespace-nowrap">
                          ₹{itemPrice}
                        </td>

                        {/* Quantity */}
                        <td className="p-2.5 text-center font-bold text-[var(--fg)] whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full bg-[var(--muted)] text-xs">
                            {quantity}
                          </span>
                        </td>

                        {/* Item Total */}
                        <td className="p-2.5 text-right font-mono font-extrabold text-[var(--primary)] whitespace-nowrap">
                          ₹{itemTotal}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ### TOTAL & FINANCIAL SUMMARY SECTION */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-[var(--primary)]" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--fg)]">
                  Total
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">
                  Existing Payment Status:
                </span>
                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase ${
                    order.paymentStatus === 'Paid'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                      : order.paymentStatus === 'Pending'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
                  }`}
                >
                  {order.paymentStatus || 'Pending'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Payment Details & Functionality */}
              <div className="space-y-3 text-xs">
                <div className="space-y-1.5 rounded-xl bg-[var(--muted)]/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">
                      Payment Mode
                    </span>
                    <span className="font-bold text-[var(--fg)]">
                      {order.paymentGateway === 'razorpay' || order.razorpayPaymentId
                        ? 'Razorpay Online Gateway'
                        : order.payment}
                    </span>
                  </div>

                  {(order.transactionId || order.razorpayOrderId || order.utr) && (
                    <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]/60">
                      <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">
                        Transaction Ref / UTR
                      </span>
                      <span className="font-mono text-[11px] font-bold text-[var(--fg)] truncate max-w-[180px]">
                        {order.utr || order.transactionId || order.razorpayOrderId}
                      </span>
                    </div>
                  )}

                  {order.upiIdUsed && (
                    <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]/60">
                      <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">
                        Customer UPI ID
                      </span>
                      <span className="font-mono text-[11px] text-[var(--fg)]">
                        {order.upiIdUsed}
                      </span>
                    </div>
                  )}
                </div>

                {/* Screenshot Preview if available */}
                {order.screenshotUrl && (
                  <div className="rounded-xl border border-[var(--border)] p-2.5 space-y-1.5">
                    <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase block">
                      Uploaded Payment Proof:
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedScreenshot(order.screenshotUrl || null)}
                      className="relative block w-full h-24 rounded-lg overflow-hidden border border-[var(--border)] hover:opacity-90 transition-opacity"
                    >
                      <img
                        src={order.screenshotUrl}
                        alt="Payment screenshot"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute inset-0 bg-black/30 flex items-center justify-center text-white text-[10px] font-bold">
                        Click to Zoom Proof
                      </span>
                    </button>
                  </div>
                )}

                {/* Payment Action Buttons (Preserve all existing payment functionality) */}
                {onUpdatePaymentStatus && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase block">
                      Update Payment Status:
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onUpdatePaymentStatus(order.id, 'Paid', adminRemarksInput || 'Verified by Admin')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          order.paymentStatus === 'Paid'
                            ? 'bg-emerald-600 text-white'
                            : 'border border-emerald-300 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                        }`}
                      >
                        ✓ Mark as Paid
                      </button>

                      <button
                        type="button"
                        onClick={() => onUpdatePaymentStatus(order.id, 'Pending', adminRemarksInput || 'Pending Verification')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          order.paymentStatus === 'Pending'
                            ? 'bg-amber-600 text-white'
                            : 'border border-amber-300 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                        }`}
                      >
                        ⏳ Mark as Pending
                      </button>

                      <button
                        type="button"
                        onClick={() => onUpdatePaymentStatus(order.id, 'Rejected', adminRemarksInput || 'Payment not received')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          order.paymentStatus === 'Rejected'
                            ? 'bg-rose-600 text-white'
                            : 'border border-rose-300 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                        }`}
                      >
                        ✕ Reject Payment
                      </button>

                      {/* Razorpay Online Refund Action */}
                      {(order.razorpayPaymentId || order.paymentGateway === 'razorpay' || (order.payment || '').toLowerCase().includes('razorpay')) && order.paymentStatus === 'Paid' && onInitiateRazorpayRefund && (
                        <button
                          type="button"
                          onClick={() => onInitiateRazorpayRefund(order.id, finalTotal)}
                          className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/30 text-[10px] font-black transition-all cursor-pointer flex items-center gap-1"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Refund Online</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Financial Calculation Breakdown Table */}
              <div className="space-y-2 rounded-xl bg-[var(--muted)]/30 p-4 text-xs">
                <div className="flex justify-between items-center py-1">
                  <span className="text-[var(--muted-fg)]">Subtotal:</span>
                  <span className="font-mono font-bold text-[var(--fg)]">₹{subtotal}</span>
                </div>

                <div className="flex justify-between items-center py-1 border-t border-[var(--border)]/60">
                  <span className="text-[var(--muted-fg)]">Delivery Charge:</span>
                  <span className="font-mono font-bold text-[var(--fg)]">
                    {deliveryCharge > 0 ? `₹${deliveryCharge}` : 'FREE (₹0)'}
                  </span>
                </div>

                {discount > 0 && (
                  <div className="flex justify-between items-center py-1 border-t border-[var(--border)]/60 text-emerald-600 font-bold">
                    <span className="flex items-center gap-1">
                      <span>Coupon Discount:</span>
                      {order.couponApplied && (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-[9px] uppercase font-mono">
                          {order.couponApplied}
                        </span>
                      )}
                    </span>
                    <span className="font-mono">-₹{discount}</span>
                  </div>
                )}

                {paymentDiscount > 0 && (
                  <div className="flex justify-between items-center py-1 border-t border-[var(--border)]/60 text-emerald-600 font-bold">
                    <span className="flex items-center gap-1">
                      <span>Payment Discount:</span>
                      <span className="px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-600 text-[9px] uppercase font-mono">
                        {order.paymentDiscountLabel || order.payment || 'Special'}
                      </span>
                    </span>
                    <span className="font-mono">-₹{paymentDiscount}</span>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2.5 border-t-2 border-[var(--border)] text-sm">
                  <span className="font-black text-[var(--fg)] uppercase tracking-wider">
                    Final Total:
                  </span>
                  <span className="font-mono font-black text-lg text-[var(--primary)]">
                    ₹{finalTotal}
                  </span>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3.5 bg-[var(--bg)] shrink-0">
          <div className="flex items-center gap-2">
            {onOpenInvoice && (
              <button
                type="button"
                onClick={() => onOpenInvoice(order)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-xs font-bold text-[var(--fg)] transition-all cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5 text-gray-500" />
                <span>Print Invoice</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[var(--fg)] text-[var(--bg)] text-xs font-extrabold hover:opacity-90 transition-opacity cursor-pointer"
          >
            Close Details
          </button>
        </div>
      </motion.div>

      {/* Screenshot Zoom Modal */}
      {selectedScreenshot && (
        <div
          onClick={() => setSelectedScreenshot(null)}
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-xl max-h-[85vh] overflow-hidden rounded-2xl bg-white p-2">
            <img
              src={selectedScreenshot}
              alt="Payment screenshot full"
              className="max-h-[80vh] w-auto rounded-lg object-contain"
            />
            <p className="text-center text-xs font-bold text-gray-600 mt-2">
              Click anywhere to close preview
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
