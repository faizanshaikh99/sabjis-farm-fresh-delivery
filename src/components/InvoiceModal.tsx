/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { 
  X, Printer, ShieldCheck, Truck, Clipboard, MapPin, 
  Phone, Mail, Calendar, CreditCard, Landmark, 
  Leaf, BadgePercent, CheckCircle2, ShoppingBag, Download, Loader2
} from 'lucide-react';
import { motion } from 'motion/react';
import { Order } from '../types';
import sabjisLogo from '../assets/images/sabjis_logo_1783085736930.jpg';
import { generateInvoicePdf } from '../utils/generateInvoicePdf';
import { safeJson } from '../utils/apiHelper';

interface InvoiceModalProps {
  order: Order | null;
  onClose: () => void;
}

interface PaymentSettings {
  businessName: string;
  upiId: string;
  qrCodeUrl: string;
  qrCodeUploaded: boolean;
}

interface BusinessSettings {
  minFreeDelivery: number;
  standardShipping: number;
  gstPercentage: number;
  operationalHoursStart: string;
  operationalHoursEnd: string;
  isOpen: boolean;
  supportPhone: string;
  address: string;
  businessName: string;
  supportEmail: string;
  website: string;
  gstNumber: string;
  fssaiLicense: string;
  businessRegistrationNumber: string;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ order, onClose }) => {
  const [settings, setSettings] = useState<PaymentSettings>({
    businessName: 'Sabjies Fresh Grocery',
    upiId: 'sabjies@upi',
    qrCodeUrl: '',
    qrCodeUploaded: false,
  });
  
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>({
    minFreeDelivery: 299,
    standardShipping: 30,
    gstPercentage: 5,
    operationalHoursStart: "09:00 AM",
    operationalHoursEnd: "09:00 PM",
    isOpen: true,
    supportPhone: "99203 24172",
    address: "Ghatkopar East, Mumbai, Maharashtra 400075",
    businessName: "Sabjies",
    supportEmail: "greensabjies@gmail.com",
    website: "www.sabjies.in",
    gstNumber: "",
    fssaiLicense: "",
    businessRegistrationNumber: ""
  });

  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    if (!order) return;
    setLoadingSettings(true);
    
    Promise.all([
      fetch('/api/payment-settings').then(res => safeJson(res, null)).catch(() => null),
      fetch('/api/business-settings').then(res => safeJson(res, null)).catch(() => null)
    ])
    .then(([paymentData, bizData]) => {
      if (paymentData) {
        setSettings({
          businessName: paymentData.businessName || 'Sabjies',
          upiId: paymentData.upiId || 'sabjies@upi',
          qrCodeUrl: paymentData.qrCodeUrl || '',
          qrCodeUploaded: !!paymentData.qrCodeUploaded,
        });
      }
      if (bizData) {
        setBusinessSettings(bizData);
      }
    })
    .catch((err) => console.error('Failed to load settings inside InvoiceModal', err))
    .finally(() => setLoadingSettings(false));
  }, [order]);

  if (!order) return null;

  const isCOD = order.payment === 'COD';
  const formattedDate = new Date(order.createdAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // Color mappings for Status Badges
  const getPaymentStatusStyles = (status: string) => {
    switch (status) {
      case 'Paid':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Pending':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Failed':
      case 'Rejected':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getOrderStatusStyles = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-emerald-600 text-white border-emerald-700';
      case 'cancelled':
        return 'bg-gray-500 text-white border-gray-600';
      case 'dispatched':
        return 'bg-blue-600 text-white border-blue-700';
      case 'packing':
      case 'confirmed':
      case 'processing':
        return 'bg-amber-500 text-white border-amber-600';
      default:
        return 'bg-teal-600 text-white border-teal-700';
    }
  };

  const gstValue = Math.round(order.subtotal * (5 / 105)); // 5% GST included
  const totalSavings = order.discountApplied || 0;

  const [isDownloading, setIsDownloading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const handleDownloadPdf = async () => {
    if (isDownloading) return;
    try {
      setIsDownloading(true);
      setFeedback(null);

      if (!order || !order.id) {
        throw new Error('Invalid order details');
      }

      await generateInvoicePdf(order, businessSettings);

      setFeedback({
        type: 'success',
        msg: 'Invoice downloaded successfully!'
      });
      setTimeout(() => setFeedback(null), 3500);
    } catch (err) {
      console.error('Failed to generate invoice PDF:', err);
      setFeedback({
        type: 'error',
        msg: 'Unable to download invoice. Please try again.'
      });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    try {
      window.focus();
      window.print();
    } catch (err) {
      console.error('Failed to trigger window.print:', err);
    }
  };

  return (
    <div id="invoice-modal-overlay" className="fixed inset-0 z-[700] flex items-center justify-center p-4 overflow-y-auto bg-black/60 backdrop-blur-xs">
      <div className="absolute inset-0 print:hidden" onClick={onClose} />
      
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        className="relative w-full max-w-[680px] rounded-3xl bg-white text-slate-800 border border-slate-100 shadow-2xl p-6 md:p-8 z-10 flex flex-col max-h-[90vh] overflow-y-auto print:max-h-none print:p-0 print:shadow-none print:border-none print:overflow-visible"
        id="printable-invoice-container"
      >
        {/* Top Close Button (Hidden when printing) */}
        <button
          onClick={onClose}
          type="button"
          aria-label="Close Modal"
          className="absolute top-5 right-5 h-9 w-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-all cursor-pointer print:hidden z-20"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header - Brand Info and Logo */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-100 pb-6 gap-4">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 md:h-20 md:w-20 rounded-2xl border border-emerald-100 overflow-hidden shrink-0 bg-emerald-50 flex items-center justify-center p-1.5 shadow-sm">
              <img 
                src={sabjisLogo} 
                alt="Sabjies Fresh Grocery Logo" 
                className="h-full w-full object-cover rounded-xl"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <Leaf className="h-5 w-5 text-emerald-600" />
                <h1 className="text-xl md:text-2xl font-black text-emerald-900 tracking-tight leading-none uppercase">{businessSettings.businessName || 'Sabjies'}</h1>
              </div>
              <p className="text-[10px] md:text-xs font-bold text-emerald-700/80 uppercase mt-1 tracking-wider">Maharashtra Certified Fresh & Organic</p>
              <p className="text-[10px] md:text-xs text-slate-500 font-medium">{businessSettings.address}</p>
              <p className="text-[10px] md:text-xs text-slate-600 font-semibold mt-0.5">
                📞 {businessSettings.supportPhone || '99203 24172'} &nbsp;|&nbsp; ✉️ {businessSettings.supportEmail || 'greensabjies@gmail.com'}
              </p>
            </div>
          </div>
          
          <div className="text-left md:text-right flex flex-col shrink-0 md:pr-8">
            <span className="text-xs font-black uppercase text-emerald-800 tracking-wider bg-emerald-50 px-3 py-1 rounded-full self-start md:self-end border border-emerald-100 mb-1.5">TAX INVOICE</span>
            <span className="text-xs text-slate-500 font-bold">Invoice ID: <strong className="text-slate-900 font-mono">INV-{order.id.toUpperCase()}</strong></span>
            <span className="text-xs text-slate-500 font-bold">Order ID: <strong className="text-slate-900 font-mono">#{order.id}</strong></span>
            <span className="text-xs text-slate-500 font-bold flex items-center gap-1 md:justify-end mt-1">
              <Calendar className="h-3 w-3 text-slate-400" />
              {formattedDate}
            </span>
          </div>
        </div>

        {/* Status Badges Bar */}
        <div className="flex flex-wrap items-center gap-2.5 my-5 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100/50">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold mr-auto">
            <span>Status Metrics:</span>
          </div>
          <div className="flex gap-2">
            <span className={`text-[10px] px-3 py-1 rounded-full font-black border uppercase tracking-wider ${getPaymentStatusStyles(order.paymentStatus)}`}>
              💳 Payment: {order.paymentStatus || 'Paid'} ({order.payment})
            </span>
            <span className={`text-[10px] px-3 py-1 rounded-full font-black border uppercase tracking-wider ${getOrderStatusStyles(order.status)}`}>
              🚚 Order: {order.status}
            </span>
          </div>
        </div>

        {/* Customer & Delivery Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6 text-xs border-b border-slate-100 pb-6">
          <div className="space-y-3 bg-emerald-50/20 p-4 rounded-2xl border border-emerald-100/30">
            <h4 className="text-[11px] font-black uppercase text-emerald-800 tracking-wider flex items-center gap-1">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Billing To
            </h4>
            <div className="space-y-1.5 text-slate-700 font-medium">
              <div className="flex justify-between">
                <span className="text-slate-400">Customer:</span>
                <span className="font-extrabold text-slate-900">
                  {order.userName || (order as any).customerName || (order as any).name || (order as any).customer || order.userEmail || 'Valued Customer'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Phone:</span>
                <span className="font-mono text-slate-900 font-bold">{order.phone || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Email:</span>
                <span className="text-slate-900">{order.userEmail}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 bg-emerald-50/20 p-4 rounded-2xl border border-emerald-100/30">
            <h4 className="text-[11px] font-black uppercase text-emerald-800 tracking-wider flex items-center gap-1">
              <MapPin className="h-4 w-4 text-emerald-600" /> Delivery Address
            </h4>
            <div className="text-slate-700 font-bold leading-relaxed truncate-print-none">
              {order.address}
            </div>
            {order.deliveryInstructions && (
              <div className="text-[10px] text-amber-800 bg-amber-50 p-2 rounded-xl border border-amber-100/50 mt-1">
                ⚠️ <strong className="font-bold">Instructions:</strong> {order.deliveryInstructions}
              </div>
            )}
          </div>
        </div>

        {/* Order Details Table */}
        <div className="mb-6">
          <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-wider mb-3 flex items-center gap-1">
            <Clipboard className="h-4 w-4 text-slate-400" /> Items Breakdown
          </h4>
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 font-black text-slate-500">
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-2 text-center">Qty</th>
                  <th className="py-3 px-3 text-right">Unit Price</th>
                  <th className="py-3 px-4 text-right">Total Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
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
                    <tr key={idx} className="hover:bg-slate-50/50 font-medium">
                      <td className="py-3 px-4 flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center text-lg shadow-sm border border-emerald-100/30 shrink-0">
                          {item.emoji || '🥬'}
                        </div>
                        <span className="font-bold text-slate-900">{displayName}</span>
                      </td>
                      <td className="py-3 px-2 text-center text-slate-600 font-bold">
                        {item.qty || 1}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-600 font-mono">
                        ₹{item.sp || 0}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-900 font-bold font-mono">
                        ₹{(item.sp || 0) * (item.qty || 1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pricing Summary Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-4">
            {/* Delivery Information Box */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
              <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
                <Truck className="h-3.5 w-3.5 text-emerald-600" /> Shipping & Logistics
              </h5>
              <div className="text-xs space-y-1 text-slate-600 font-medium">
                <div className="flex justify-between">
                  <span>Tracking ID:</span>
                  <span className="font-mono text-slate-900 font-bold">TRK-{order.id.slice(0, 8).toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Est. Delivery:</span>
                  <span className="text-slate-950 font-bold">90 Mins (Express Priority)</span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery Rider:</span>
                  <span className="text-slate-950 font-bold">
                    {order.status === 'dispatched' || order.status === 'delivered' ? 'Sabjies Priority Rider' : 'Assigning on Pack...'}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Customer notes / support notes */}
            <div className="p-4 rounded-2xl bg-emerald-50/20 border border-emerald-100/20 space-y-2">
              <h5 className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">🌱 FRESHNESS ASSURANCE</h5>
              <ul className="text-[10px] text-slate-600 font-medium space-y-1.5 list-none pl-0">
                <li className="flex items-start gap-1.5">
                  <span>🌱</span> <span>Thank you for supporting fresh local organic vegetables.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span>💚</span> <span>Freshness guaranteed on every order.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span>🚚</span> <span>Fast and reliable doorstep delivery.</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-between space-y-3.5">
            <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
              <Landmark className="h-3.5 w-3.5 text-emerald-600" /> Financial Summary
            </h5>
            
            <div className="space-y-2 text-xs text-slate-600 font-medium">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-mono text-slate-900 font-bold">₹{order.subtotal}</span>
              </div>
              
              {totalSavings > 0 && (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span className="flex items-center gap-1">
                    <BadgePercent className="h-3.5 w-3.5" /> Coupon Discount ({order.couponApplied || 'SAVINGS'}):
                  </span>
                  <span className="font-mono">- ₹{totalSavings}</span>
                </div>
              )}
              
              <div className="flex justify-between">
                <span>Delivery Charges:</span>
                <span className="font-mono font-bold text-slate-900">
                  {order.delivery === 0 ? 'FREE' : `₹${order.delivery}`}
                </span>
              </div>
              
              <div className="flex justify-between text-[10px] text-slate-400 border-t border-slate-200/50 pt-2">
                <span>GST Tax (Included 5%):</span>
                <span className="font-mono">₹{gstValue}</span>
              </div>
            </div>

            {totalSavings > 0 && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl text-center text-xs font-black text-emerald-800">
                🎉 YOU SAVED ₹{totalSavings} ON THIS ORDER!
              </div>
            )}

            <div className="p-4 bg-emerald-800 text-white rounded-xl flex items-center justify-between shadow-md">
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-100">GRAND TOTAL PAID</span>
                <span className="text-xl font-black font-mono">₹{order.total}</span>
              </div>
              <CheckCircle2 className="h-7 w-7 text-emerald-300" />
            </div>
          </div>
        </div>

        {/* Payment QR Section */}
        {!isCOD && (
          <div className="mb-6 p-5 rounded-2xl bg-amber-50/40 border border-amber-100/50 flex flex-col md:flex-row items-center justify-between gap-5 break-inside-avoid">
            <div className="space-y-2 flex-1">
              <h5 className="text-[11px] font-black uppercase text-amber-800 tracking-wider flex items-center gap-1.5">
                <CreditCard className="h-4 w-4" /> UPI Payment QR Verification
              </h5>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                Scan the QR code using any UPI app to complete your payment.
              </p>
              {order.utr && (
                <div className="text-[11px] bg-white border border-amber-200 p-2.5 rounded-xl font-medium text-slate-800">
                  ⚡ <strong className="font-black text-amber-900">Submitted UTR Ref:</strong> <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded font-black text-emerald-700">{order.utr}</code>
                </div>
              )}
              {order.upiIdUsed && (
                <div className="text-[10px] text-slate-400">
                  Target UPI ID: <span className="font-mono font-bold text-slate-600">{order.upiIdUsed}</span>
                </div>
              )}
            </div>
            
            <div className="shrink-0 flex flex-col items-center bg-white p-3 rounded-2xl border border-slate-200/60 shadow-sm">
              {loadingSettings ? (
                <div className="h-32 w-32 flex items-center justify-center text-slate-400 text-xs">
                  Loading QR Code...
                </div>
              ) : (
                <img 
                  src={settings.qrCodeUploaded ? `${settings.qrCodeUrl || '/api/payment-settings/qr-image'}?t=${Date.now()}` : `/api/payment-settings/qr-image`}
                  alt="Payment UPI QR Code" 
                  className="h-32 w-32 object-contain"
                  referrerPolicy="no-referrer"
                />
              )}
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">SECURE UPI QR</span>
            </div>
          </div>
        )}

        {isCOD && (
          <div className="mb-6 p-4 rounded-2xl bg-blue-50/40 border border-blue-100 flex items-center gap-4 text-xs font-medium text-blue-900 break-inside-avoid">
            <span className="text-2xl shrink-0">🏠</span>
            <div>
              <strong className="font-extrabold text-blue-900 block mb-0.5">CASH ON DELIVERY ORDER</strong>
              Please hand over <strong className="font-black text-slate-900 font-mono">₹{order.total}</strong> to the delivery partner when they arrive at your doorstep.
            </div>
          </div>
        )}

        {/* Footer Section */}
        <div className="mt-8 border-t border-slate-200/60 pt-6 flex flex-col gap-6 text-slate-500">
          <div className="text-center space-y-1 bg-emerald-50/25 p-4 rounded-2xl border border-emerald-100/30">
            <p className="font-extrabold text-emerald-800 text-xs uppercase tracking-wider">
              🎉 Thank you for shopping with us!
            </p>
            <p className="text-[10px] text-emerald-700 font-bold">
              Fresh vegetables delivered directly from trusted local farmers.
            </p>
          </div>

          <div className={`grid ${
            (businessSettings.gstNumber || businessSettings.fssaiLicense || businessSettings.businessRegistrationNumber) 
              ? 'grid-cols-1 md:grid-cols-2 gap-6' 
              : 'grid-cols-1'
          } text-[10px] leading-relaxed text-slate-500 font-medium border-b border-slate-100 pb-5`}>
            <div className={`space-y-2 ${(businessSettings.gstNumber || businessSettings.fssaiLicense || businessSettings.businessRegistrationNumber) ? '' : 'text-center'}`}>
              <div className={`flex items-center gap-1.5 font-extrabold text-slate-800 uppercase tracking-wider text-[11px] ${
                (businessSettings.gstNumber || businessSettings.fssaiLicense || businessSettings.businessRegistrationNumber) ? '' : 'justify-center'
              }`}>
                <span>Contact & Support</span>
              </div>
              <div className={`space-y-1 ${
                (businessSettings.gstNumber || businessSettings.fssaiLicense || businessSettings.businessRegistrationNumber) ? '' : 'flex flex-wrap items-center justify-center gap-x-6'
              }`}>
                {businessSettings.supportPhone && (
                  <p className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-emerald-600 shrink-0" />
                    <span>Support: <strong>{businessSettings.supportPhone}</strong></span>
                  </p>
                )}
                {businessSettings.supportEmail && (
                  <p className="flex items-center gap-1.5">
                    <Mail className="h-3 w-3 text-emerald-600 shrink-0" />
                    <span>Email: <a href={`mailto:${businessSettings.supportEmail}`} className="text-slate-600 hover:underline">{businessSettings.supportEmail}</a></span>
                  </p>
                )}
                {businessSettings.website && (
                  <p className="flex items-center gap-1.5">
                    <ShoppingBag className="h-3 w-3 text-emerald-600 shrink-0" />
                    <span>Website: <a href={`https://${businessSettings.website}`} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:underline font-bold">{businessSettings.website}</a></span>
                  </p>
                )}
                {(businessSettings.operationalHoursStart || businessSettings.operationalHoursEnd) && (
                  <p className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 text-emerald-600 shrink-0" />
                    <span>Hours: <strong>{businessSettings.operationalHoursStart} - {businessSettings.operationalHoursEnd}</strong></span>
                  </p>
                )}
              </div>
            </div>

            {(businessSettings.gstNumber || businessSettings.fssaiLicense || businessSettings.businessRegistrationNumber) && (
              <div className="space-y-2 md:text-right md:flex md:flex-col md:items-end">
                <div className="flex items-center gap-1.5 font-extrabold text-slate-800 uppercase tracking-wider text-[11px]">
                  <span>Business Credentials</span>
                </div>
                <div className="space-y-1 md:text-right text-slate-500">
                  {businessSettings.gstNumber && (
                    <p>GSTIN: <strong className="font-mono text-slate-700">{businessSettings.gstNumber}</strong></p>
                  )}
                  {businessSettings.fssaiLicense && (
                    <p>FSSAI Lic No: <strong className="font-mono text-slate-700">{businessSettings.fssaiLicense}</strong></p>
                  )}
                  {businessSettings.businessRegistrationNumber && (
                    <p>Reg No: <strong className="font-mono text-slate-700">{businessSettings.businessRegistrationNumber}</strong></p>
                  )}
                  <p className="text-[9px] text-slate-400 font-medium">Sourced direct from organic Maharashtrian partner farmers.</p>
                </div>
              </div>
            )}
          </div>

          <div className="text-[9px] text-slate-400 space-y-2 font-medium">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-center text-slate-500 font-semibold">
              <div className="flex flex-col items-center justify-center p-1 border-r border-slate-200/50 last:border-0">
                <span className="text-[8px] uppercase tracking-wider text-slate-400">Security Node</span>
                <span className="font-mono text-slate-800 font-bold">COMPUTER GENERATED</span>
              </div>
              <div className="flex flex-col items-center justify-center p-1 border-r border-slate-200/50 last:border-0">
                <span className="text-[8px] uppercase tracking-wider text-slate-400">Signature Status</span>
                <span className="text-slate-800 font-bold uppercase">NO SIGNATURE REQ.</span>
              </div>
              <div className="flex flex-col items-center justify-center p-1 border-r border-slate-200/50 last:border-0">
                <span className="text-[8px] uppercase tracking-wider text-slate-400">Print Generation</span>
                <span className="font-mono text-slate-800 font-bold uppercase">{new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
              <div className="flex flex-col items-center justify-center p-1 last:border-0">
                <span className="text-[8px] uppercase tracking-wider text-slate-400">Invoice Version</span>
                <span className="font-mono text-slate-800 font-bold">v2.4 (DigiNode)</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-[9px] text-slate-400">
              <span>© 2026 {businessSettings.businessName}. Sourced direct from organic Maharashtrian partner farmers.</span>
              <span className="font-mono">ID: INV-{order.id.toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons Overlay (Hidden during printing) */}
        <div className="flex flex-col gap-3 mt-6 border-t border-slate-100 pt-5 print:hidden">
          {feedback && (
            <div className={`p-3 rounded-2xl text-xs font-bold text-center transition-all ${
              feedback.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {feedback.msg}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              className="flex-1 rounded-full bg-emerald-800 text-white font-black text-xs py-3.5 flex items-center justify-center gap-2 shadow-lg hover:bg-emerald-900 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />
                  <span>Generating Invoice...</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 text-emerald-300" />
                  <span>Download Invoice</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="rounded-full border border-slate-200 bg-slate-50 text-slate-700 font-bold text-xs px-5 py-3.5 flex items-center justify-center gap-2 hover:bg-slate-100 transition-all cursor-pointer"
            >
              <Printer className="h-4 w-4 text-slate-500" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-slate-50 text-slate-600 font-bold text-xs px-5 py-3.5 hover:bg-slate-100 hover:text-slate-800 transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
