/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ShieldCheck, QrCode, Smartphone, Copy, Check, Upload, X, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import { PaymentSettings } from '../types';
import { safeJson } from '../utils/apiHelper';

interface DirectUpiPaymentModalProps {
  isOpen: boolean;
  totalAmount: number;
  orderId: string;
  customerName: string;
  customerPhone: string;
  onSuccess: (paymentData: { utr: string; upiIdUsed: string; screenshotUrl?: string }) => void;
  onCancel: () => void;
}

export const DirectUpiPaymentModal: React.FC<DirectUpiPaymentModalProps> = ({
  isOpen,
  totalAmount,
  orderId,
  customerName,
  customerPhone,
  onSuccess,
  onCancel,
}) => {
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dynamicQrUrl, setDynamicQrUrl] = useState<string>('');

  // Form fields
  const [name, setName] = useState(customerName || '');
  const [phone, setPhone] = useState(customerPhone || '');
  const [utr, setUtr] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Load payment settings as state
  const [settings, setSettings] = useState<PaymentSettings>({
    businessName: 'Sabjies Fresh Grocery',
    upiId: 'sabjies@upi',
    qrCodeUrl: '',
    qrCodeUploaded: false,
    instructions: '1. Scan the QR code or tap "Pay via UPI App".\n2. Pay the exact amount shown.\n3. Copy the UTR/Transaction ID from your UPI app.\n4. Paste the UTR/Transaction ID into the website.\n5. Click "Submit Payment".',
    enableUpi: true,
    enableCod: true,
    autoApproveUpi: false,
  });

  useEffect(() => {
    if (isOpen) {
      fetch('/api/payment-settings')
        .then(res => safeJson(res, null))
        .then(data => {
          if (data && data.upiId) {
            setSettings(data);
          }
        })
        .catch(() => {
          const storedSettings = localStorage.getItem('sabjies_payment_settings');
          if (storedSettings) {
            setSettings(JSON.parse(storedSettings));
          }
        });
    }
  }, [isOpen]);

  const upiLink = settings.upiId
    ? `upi://pay?pa=${encodeURIComponent(settings.upiId)}&pn=${encodeURIComponent(settings.businessName)}&am=${totalAmount}&tr=${orderId}&tn=${encodeURIComponent(`Order ${orderId}`)}&cu=INR`
    : '';

  useEffect(() => {
    if (upiLink) {
      QRCode.toDataURL(upiLink, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 320,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })
        .then(url => setDynamicQrUrl(url))
        .catch(err => console.error("Dynamic QR generation error:", err));
    }
  }, [upiLink]);

  if (!isOpen) return null;

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(settings.upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshotUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let finalUtr = utr.trim();
    
    if (!finalUtr) {
      if (settings.autoApproveUpi) {
        finalUtr = 'AUTO-UPI-' + Math.floor(1000000000 + Math.random() * 9000000000);
      } else {
        setErrorMsg('Please enter your UTR / UPI Transaction ID.');
        return;
      }
    } else if (finalUtr.length < 6) {
      setErrorMsg('Please enter a valid UTR / Transaction ID (at least 6 characters).');
      return;
    }

    // Check duplicate UTR in existing orders
    const existingOrders = JSON.parse(localStorage.getItem('sabjies_orders') || '[]');
    const isDuplicate = existingOrders.some((o: any) => o.utr && o.utr.toLowerCase() === finalUtr.toLowerCase());
    if (isDuplicate && !settings.autoApproveUpi) {
      setErrorMsg('This UTR has already been submitted for another order. Please check your transaction ID.');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    setTimeout(() => {
      setIsSubmitting(false);
      onSuccess({
        utr: finalUtr,
        upiIdUsed: settings.upiId,
        screenshotUrl: screenshotUrl || undefined,
      });
    }, 1200);
  };

  const activeQrSrc = settings.qrCodeUploaded && settings.qrCodeUrl
    ? `${settings.qrCodeUrl}?t=${Date.now()}`
    : dynamicQrUrl;

  return (
    <div className="fixed inset-0 z-600 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={!isSubmitting ? onCancel : undefined} />

      {/* Modal Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-[500px] rounded-3xl bg-[var(--card)] border border-[var(--border)] shadow-2xl overflow-hidden z-10 flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-900 to-green-800 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-emerald-300">
              <QrCode className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold">Direct UPI Payment</h3>
              <p className="text-[10px] text-emerald-200">Secure Direct Transfer to {settings.businessName}</p>
            </div>
          </div>
          {!isSubmitting && (
            <button
              onClick={onCancel}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/25 text-white transition-all"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Amount & Order ID Bar */}
        <div className="bg-[var(--muted)] px-5 py-3 border-b border-[var(--border)] flex items-center justify-between text-xs">
          <div>
            <span className="text-[10px] text-[var(--muted-fg)] uppercase block">Order Reference</span>
            <strong className="text-[var(--fg)] font-mono">#{orderId}</strong>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-[var(--muted-fg)] uppercase block">Payable Amount</span>
            <span className="text-base font-black text-[var(--primary)]">₹{totalAmount}</span>
          </div>
        </div>

        {/* Scrollable Content */}
        <div 
          data-lenis-prevent
          className="p-6 space-y-5 overflow-y-auto max-h-[72vh] overscroll-contain"
        >
          {/* QR Code & UPI ID Box */}
          <div className="flex flex-col items-center justify-center p-5 rounded-2xl border border-[var(--border)] bg-white dark:bg-zinc-900 shadow-sm text-center space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--fg)]">
              <QrCode className="h-4 w-4 text-[var(--primary)]" />
              <span>Or Scan QR from another phone</span>
            </div>

            <div className="relative p-2 bg-white rounded-2xl shadow border border-gray-100 dark:border-zinc-700">
              {activeQrSrc ? (
                <img
                  src={activeQrSrc}
                  alt={`${settings.businessName} UPI Payment QR`}
                  className="h-44 w-44 object-contain rounded-lg"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-44 w-44 flex flex-col items-center justify-center rounded-lg bg-gray-50 dark:bg-zinc-900 border border-dashed border-gray-200 dark:border-zinc-800 p-4 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)] mb-2" />
                  <p className="text-[10px] font-bold text-[var(--muted-fg)]">Generating Payment QR...</p>
                </div>
              )}
            </div>

            <span className="text-[11px] text-[var(--muted-fg)] font-medium">
              Scan using GPay, PhonePe, Paytm, BHIM or another supported UPI app
            </span>

            <div className="w-full space-y-1 pt-1">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-zinc-800/80 border border-gray-200 dark:border-zinc-700 text-xs">
                <div className="text-left">
                  <span className="text-[10px] text-[var(--muted-fg)] uppercase font-semibold block">Merchant UPI VPA</span>
                  <span className="font-mono font-bold text-[var(--fg)]">{settings.upiId}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyUpi}
                  className="flex items-center gap-1 rounded-lg bg-[var(--primary)] text-white px-2.5 py-1.5 text-[11px] font-bold hover:opacity-90 transition-all cursor-pointer"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {upiLink && (
              <a
                href={upiLink}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-2 transition-all"
              >
                <Smartphone className="h-4 w-4" />
                <span>Pay via UPI App (GPay / PhonePe / Paytm)</span>
              </a>
            )}
          </div>

          {/* Payment Instructions */}
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
            <h4 className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
              <span>📋 Step-by-Step Payment Instructions</span>
            </h4>
            <div className="text-[11px] text-[var(--muted-fg)] space-y-1 whitespace-pre-line leading-relaxed font-medium">
              {settings.instructions}
            </div>
          </div>

          {/* UTR Submission Form */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wide">
              Submit Payment Details (UTR / Transaction ID)
            </h4>

            {errorMsg && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Customer Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Mobile Number</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">
                UPI Transaction ID / UTR Number {settings.autoApproveUpi ? <span className="text-emerald-500 font-extrabold">(Optional - Instant Auto-Approval ✨)</span> : <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                required={!settings.autoApproveUpi}
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                placeholder={settings.autoApproveUpi ? "Optional - leave empty for auto-generation" : "e.g. 418293741928 or UPI Ref ID"}
                className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] font-mono outline-none focus:border-[var(--primary)] font-bold tracking-wider"
              />
              <span className="text-[10px] text-[var(--muted-fg)]">
                {settings.autoApproveUpi 
                  ? "🚀 Auto-Approval is ON. Leave empty or enter UTR if you want to record it." 
                  : "Found in your payment app after successful transfer."}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">
                Payment Screenshot (Optional)
              </label>
              <div className="flex items-center gap-3">
                <label className="flex-1 cursor-pointer rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)] p-3 text-center text-xs font-semibold text-[var(--muted-fg)] hover:border-[var(--primary)] transition-all flex items-center justify-center gap-2">
                  <Upload className="h-4 w-4 text-[var(--primary)]" />
                  <span>{screenshotUrl ? 'Screenshot Attached ✅' : 'Upload Screenshot (PNG/JPG)'}</span>
                  <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                </label>
                {screenshotUrl && (
                  <button
                    type="button"
                    onClick={() => setScreenshotUrl('')}
                    className="text-xs text-red-500 font-bold hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="w-1/3 rounded-xl border border-[var(--border)] py-3 text-xs font-bold text-[var(--muted-fg)] hover:bg-[var(--muted)] transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-2/3 rounded-xl bg-[var(--primary)] text-white py-3 text-xs font-extrabold shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Verifying UTR...</span>
                  </>
                ) : (
                  <span>Submit Payment & Place Order</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
};
