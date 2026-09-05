/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, Package, Truck, Printer, ShoppingBag, 
  ArrowRight, ShieldCheck, MapPin, Download, Loader2, User, Phone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Order } from '../types';
import { InvoiceModal } from './InvoiceModal';
import { generateInvoicePdf } from '../utils/generateInvoicePdf';
import { safeJson } from '../utils/apiHelper';

interface OrderSuccessModalProps {
  order: Order | null;
  onClose: () => void;
  onViewOrders: () => void;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({
  order,
  onClose,
  onViewOrders,
}) => {
  const [showFullInvoice, setShowFullInvoice] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadFeedback, setDownloadFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [businessSettings, setBusinessSettings] = useState({
    enableIgBanner: true,
    igProfileUrl: 'https://www.instagram.com/sabjies?igsh=MWp6cDQ2NHZtcnE0Zw',
    igBannerText: '🎁 Follow us on Instagram for exclusive discount codes.',
    businessName: 'Sabjies',
    address: 'Ghatkopar East, Mumbai, Maharashtra 400075',
    supportPhone: '99203 24172',
    supportEmail: 'greensabjies@gmail.com',
  });

  useEffect(() => {
    fetch('/api/business-settings')
      .then(res => safeJson(res, null))
      .then(data => {
        if (data) {
          setBusinessSettings(prev => ({
            ...prev,
            enableIgBanner: data.enableIgBanner !== undefined ? data.enableIgBanner : true,
            igProfileUrl: data.igProfileUrl || prev.igProfileUrl,
            igBannerText: data.igBannerText || prev.igBannerText,
            businessName: data.businessName || prev.businessName,
            address: data.address || prev.address,
            supportPhone: data.supportPhone || prev.supportPhone,
            supportEmail: data.supportEmail || prev.supportEmail,
          }));
        }
      })
      .catch(err => console.error('Failed to load business settings in OrderSuccessModal:', err));
  }, []);

  if (!order) return null;

  const customerName = (
    order.userName ||
    (order as any).customerName ||
    (order as any).name ||
    (order as any).customer ||
    order.userEmail ||
    'Valued Customer'
  ).trim();

  const handleDownloadPdf = async () => {
    if (isDownloading) return;
    try {
      setIsDownloading(true);
      setDownloadFeedback(null);

      if (!order || !order.id) {
        throw new Error('Invalid order details');
      }

      await generateInvoicePdf(order, businessSettings);

      setDownloadFeedback({
        type: 'success',
        msg: 'Invoice downloaded successfully!'
      });
      setTimeout(() => setDownloadFeedback(null), 3500);
    } catch (err) {
      console.error('Failed to generate invoice PDF:', err);
      setDownloadFeedback({
        type: 'error',
        msg: 'Unable to download invoice. Please try again.'
      });
      setTimeout(() => setDownloadFeedback(null), 4000);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[650] overflow-y-auto bg-black/75 backdrop-blur-md p-3 sm:p-4 md:p-6 flex items-start sm:items-center justify-center min-h-screen">
        <div className="fixed inset-0" onClick={onClose} />

        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-[540px] my-auto rounded-3xl bg-[var(--card)] border border-[var(--border)] shadow-2xl overflow-hidden z-10 flex flex-col shrink-0 text-[var(--fg)]"
        >
          {/* Top green gradient banner */}
          <div className="bg-gradient-to-r from-emerald-600 via-green-600 to-teal-700 p-6 text-white text-center relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-xl pointer-events-none" />
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-white text-emerald-600 shadow-xl mb-3"
            >
              <CheckCircle2 className="h-12 w-12" />
            </motion.div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">Order Placed Successfully! 🎉</h2>
            <p className="text-xs text-emerald-100 mt-1">Your farm-fresh sabjies are being packed with care.</p>
          </div>

          {/* Instagram Campaign Banner */}
          {businessSettings.enableIgBanner && (
            <div className="bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white py-2 px-4 shadow-inner flex items-center justify-between gap-2 text-xs font-semibold">
              <span className="truncate flex-1">{businessSettings.igBannerText}</span>
              <a
                href={businessSettings.igProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white text-pink-600 font-extrabold px-2.5 py-0.5 rounded-full uppercase text-[10px] hover:bg-pink-50 transition-colors shrink-0"
              >
                Follow Us
              </a>
            </div>
          )}

          {/* Details section - natural flow without internal max-h clipping */}
          <div className="p-5 sm:p-6 space-y-4 sm:space-y-5">
            {/* Order ID & Status Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--muted)] p-3.5 rounded-2xl border border-[var(--border)]">
              <div>
                <div className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Order Number</div>
                <div className="text-sm font-black text-[var(--primary)] font-mono">#{order.id}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Payment Status</div>
                <span className={`inline-block text-[10px] px-2.5 py-0.5 rounded-full font-extrabold uppercase mt-0.5 ${
                  order.paymentStatus === 'Paid' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                  'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                }`}>
                  {order.paymentStatus || 'Paid'} ({order.payment})
                </span>
              </div>
            </div>

            {/* Customer Details Summary Box */}
            <div className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-[var(--fg)]">
                <User className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span className="text-[var(--muted-fg)]">Customer:</span>
                <span className="font-extrabold text-[var(--fg)] break-words">{customerName}</span>
              </div>
              {order.phone && (
                <div className="flex items-center gap-1.5 text-[var(--fg)]">
                  <Phone className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="text-[var(--muted-fg)]">Phone:</span>
                  <span className="font-mono font-bold">{order.phone}</span>
                </div>
              )}
            </div>

            {/* Delivery Estimate Box */}
            <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-md">
                <Truck className="h-5 w-5 animate-pulse" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-[var(--fg)]">Express Delivery in 90 Minutes</div>
                <div className="text-[11px] text-[var(--muted-fg)] truncate">Delivering to: {order.address}</div>
              </div>
            </div>

            {/* Items Summary */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider">Ordered Items ({order.items?.length || 0})</h4>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3 space-y-2">
                {(order.items || []).map((item: any, idx) => {
                  const resolvedName = (
                    item.name ||
                    item.productName ||
                    item.product_name ||
                    item.title ||
                    item.productTitle ||
                    item.itemName ||
                    item.item_name ||
                    'Product unavailable'
                  );
                  const displayName = (resolvedName === '()' || resolvedName === '( )') ? 'Product unavailable' : resolvedName;

                  return (
                    <div key={idx} className="flex justify-between items-center text-xs gap-2">
                      <span className="text-[var(--fg)] font-medium truncate">
                        {item.emoji || '🥬'} {displayName} <strong className="text-[var(--muted-fg)]">× {item.qty || 1}</strong>
                      </span>
                      <span className="font-bold text-[var(--fg)] font-mono shrink-0">₹{(item.sp || 0) * (item.qty || 1)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Total Breakdown */}
            <div className="border-t border-[var(--border)] pt-3 space-y-1 text-xs">
              <div className="flex justify-between text-[var(--muted-fg)]">
                <span>Subtotal</span>
                <span className="font-mono font-bold">₹{order.subtotal}</span>
              </div>
              {order.discountApplied && order.discountApplied > 0 ? (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Discount ({order.couponApplied || 'SAVINGS'})</span>
                  <span className="font-mono">- ₹{order.discountApplied}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-[var(--muted-fg)]">
                <span>Delivery</span>
                <span className="font-mono font-bold">{order.delivery === 0 ? 'FREE' : `₹${order.delivery}`}</span>
              </div>
              <div className="flex justify-between text-base font-black text-[var(--fg)] pt-2 border-t border-[var(--border)] mt-1">
                <span>Total Amount Paid</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-mono">₹{order.total}</span>
              </div>
            </div>
          </div>

          {/* Download Feedback Alert */}
          {downloadFeedback && (
            <div className={`mx-5 p-2.5 rounded-xl text-xs font-bold text-center transition-all ${
              downloadFeedback.type === 'success'
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200'
                : 'bg-red-100 text-red-900 border border-red-300 dark:bg-red-950 dark:text-red-200'
            }`}>
              {downloadFeedback.msg}
            </div>
          )}

          {/* Action Buttons */}
          <div className="p-4 sm:p-5 bg-[var(--muted)] border-t border-[var(--border)] space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isDownloading}
                className="flex items-center justify-center gap-2 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white py-3 px-4 text-xs font-black shadow-md transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-200" />
                    <span>Downloading...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 text-emerald-200" />
                    <span>Download Invoice</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowFullInvoice(true)}
                className="flex items-center justify-center gap-2 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 py-3 px-4 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all shadow-xs cursor-pointer"
              >
                <Printer className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>View / Print Receipt</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onViewOrders();
              }}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-[var(--primary)] text-white py-3 text-xs font-black shadow-md hover:opacity-95 transition-all cursor-pointer"
            >
              <span>Track Order & Delivery Status</span>
              <ArrowRight className="h-4 w-4" />
            </button>

            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-semibold text-[var(--muted-fg)] hover:text-[var(--primary)] underline transition-all cursor-pointer"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {showFullInvoice && (
          <InvoiceModal
            order={order}
            onClose={() => setShowFullInvoice(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
};
