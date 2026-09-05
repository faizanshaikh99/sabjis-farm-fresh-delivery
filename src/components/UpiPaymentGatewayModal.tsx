/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import { 
  ShieldCheck, 
  ExternalLink, 
  Copy, 
  Check, 
  Clock, 
  AlertTriangle, 
  Loader2, 
  ArrowLeft, 
  RefreshCw, 
  Sparkles, 
  QrCode, 
  Smartphone,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { Address, CartItem } from '../types';
import { safeJson } from '../utils/apiHelper';

interface UpiPaymentGatewayModalProps {
  isOpen: boolean;
  orderData: {
    id?: string;
    items: CartItem[];
    subtotal: number;
    delivery: number;
    total: number;
    couponApplied?: string;
    discountApplied?: number;
    selectedAddress: Address;
    userId?: string;
    userEmail?: string;
    userName?: string;
    phone?: string;
  };
  paymentApp: string; // 'gpay' | 'phonepe' | 'paytm' | 'upi' | 'card' | 'netbanking' | 'wallets'
  onPaymentVerified: (order: any, transactionId: string) => void;
  onClose: () => void;
  onSwitchToCod: () => void;
}

export const UpiPaymentGatewayModal: React.FC<UpiPaymentGatewayModalProps> = ({
  isOpen,
  orderData,
  paymentApp,
  onPaymentVerified,
  onClose,
  onSwitchToCod
}) => {
  type GatewayStage = 'init' | 'gateway' | 'verifying' | 'success' | 'failed';
  const [stage, setStage] = useState<GatewayStage>('init');
  const [session, setSession] = useState<{
    orderId: string;
    upiId: string;
    businessName: string;
    amount: number;
    upiIntentUri: string;
    gpayIntentUri: string;
    phonepeIntentUri: string;
    paytmIntentUri: string;
    qrCodeUrl: string;
    expiresInSeconds: number;
  } | null>(null);

  const [timeLeft, setTimeLeft] = useState<number>(300); // 5 minutes
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [userUtr, setUserUtr] = useState('');
  const [verificationStep, setVerificationStep] = useState(1);
  const [errorMessage, setErrorMessage] = useState('');
  const [verifiedOrder, setVerifiedOrder] = useState<any>(null);
  const [showQrExpanded, setShowQrExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 640;
    }
    return false;
  });
  const [fallbackQrUrl, setFallbackQrUrl] = useState<string>('');

  useEffect(() => {
    if (session && !session.qrCodeUrl && session.upiIntentUri) {
      QRCode.toDataURL(session.upiIntentUri, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 320,
        color: { dark: '#000000', light: '#ffffff' }
      })
        .then(url => setFallbackQrUrl(url))
        .catch(err => console.error("Client QR generation error:", err));
    }
  }, [session]);

  // App Theme & Meta mapping
  const appMeta: Record<string, {
    name: string;
    themeColor: string;
    bgGradient: string;
    borderClass: string;
    btnClass: string;
    icon: string;
    badge: string;
  }> = {
    gpay: {
      name: 'Google Pay',
      themeColor: '#1a73e8',
      bgGradient: 'from-blue-600 via-indigo-600 to-blue-700',
      borderClass: 'border-blue-500/30',
      btnClass: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/30',
      icon: '🔵',
      badge: 'GPay UPI'
    },
    phonepe: {
      name: 'PhonePe',
      themeColor: '#5f259f',
      bgGradient: 'from-purple-700 via-indigo-800 to-purple-900',
      borderClass: 'border-purple-500/30',
      btnClass: 'bg-purple-700 hover:bg-purple-800 text-white shadow-purple-700/30',
      icon: '🟣',
      badge: 'PhonePe UPI'
    },
    paytm: {
      name: 'Paytm',
      themeColor: '#00baf2',
      bgGradient: 'from-sky-600 via-cyan-700 to-sky-800',
      borderClass: 'border-sky-500/30',
      btnClass: 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-600/30',
      icon: '🟦',
      badge: 'Paytm UPI'
    },
    upi: {
      name: 'UPI Apps / BHIM',
      themeColor: '#16a34a',
      bgGradient: 'from-emerald-600 via-green-700 to-teal-800',
      borderClass: 'border-emerald-500/30',
      btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30',
      icon: '⚡',
      badge: 'Instant UPI'
    },
    card: {
      name: 'Debit / Credit Card',
      themeColor: '#0f766e',
      bgGradient: 'from-teal-700 via-emerald-800 to-cyan-900',
      borderClass: 'border-teal-500/30',
      btnClass: 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-600/30',
      icon: '💳',
      badge: 'Card Gateway'
    },
    netbanking: {
      name: 'Net Banking',
      themeColor: '#0369a1',
      bgGradient: 'from-sky-700 via-blue-800 to-slate-900',
      borderClass: 'border-sky-500/30',
      btnClass: 'bg-sky-700 hover:bg-sky-800 text-white shadow-sky-700/30',
      icon: '🏛️',
      badge: 'Net Banking'
    },
    wallets: {
      name: 'Wallets & PayLater',
      themeColor: '#ea580c',
      bgGradient: 'from-orange-600 via-amber-700 to-orange-800',
      borderClass: 'border-orange-500/30',
      btnClass: 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-600/30',
      icon: '👛',
      badge: 'Wallet'
    }
  };

  const currentMeta = appMeta[paymentApp] || appMeta.gpay;

  // 1. Initialize Payment Session
  useEffect(() => {
    if (!isOpen) return;

    setStage('init');
    setErrorMessage('');
    setTimeLeft(300);
    setVerificationStep(1);

    fetch('/api/payments/upi/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: orderData.items,
        deliveryFee: orderData.delivery,
        couponCode: orderData.couponApplied,
        userId: orderData.userId,
        userEmail: orderData.userEmail,
        userName: orderData.userName,
        phone: orderData.phone,
        address: `${orderData.selectedAddress.flat}, ${orderData.selectedAddress.street}, ${orderData.selectedAddress.area}, ${orderData.selectedAddress.pin}`,
        paymentApp
      })
    })
      .then(res => safeJson(res, { success: false }))
      .then(data => {
        if (data && data.success) {
          setSession(data);
          setTimeLeft(data.expiresInSeconds || 300);
          setStage('gateway');
        } else {
          setErrorMessage(data?.error || 'Failed to initiate payment session');
          setStage('failed');
        }
      })
      .catch(err => {
        console.error('UPI initiation error:', err);
        setErrorMessage('Unable to connect to payment server. Please try again or use Cash on Delivery.');
        setStage('failed');
      });
  }, [isOpen, paymentApp]);

  // 2. Countdown Timer
  useEffect(() => {
    if (stage !== 'gateway' || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setErrorMessage('Payment session expired. Please restart checkout.');
          setStage('failed');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [stage, timeLeft]);

  // Format seconds as mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Copy to clipboard helper
  const handleCopyUpi = () => {
    if (!session?.upiId) return;
    navigator.clipboard.writeText(session.upiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleCopyAmount = () => {
    if (!session?.amount) return;
    navigator.clipboard.writeText(String(session.amount));
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  // Handle Intent Launch
  const handleOpenUpiApp = () => {
    if (!session) return;
    let targetUri = session.upiIntentUri;
    if (paymentApp === 'phonepe') targetUri = session.phonepeIntentUri;
    else if (paymentApp === 'paytm') targetUri = session.paytmIntentUri;
    else if (paymentApp === 'gpay') targetUri = session.gpayIntentUri;

    // Trigger intent deep link
    window.location.href = targetUri;
  };

  // Handle Verify Payment by Server
  const handleVerifyPayment = async () => {
    if (!session) return;

    setStage('verifying');
    setVerificationStep(1);

    // Realistic verification step progression
    const timer1 = setTimeout(() => setVerificationStep(2), 600);
    const timer2 = setTimeout(() => setVerificationStep(3), 1200);

    try {
      const response = await fetch('/api/payments/upi/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: session.orderId,
          utr: userUtr.trim() || undefined,
          paymentApp,
          paymentMethod: `${currentMeta.name} (Online UPI)`,
          orderData: {
            id: session.orderId,
            userId: orderData.userId || 'guest',
            userEmail: orderData.userEmail || 'greensabjies@gmail.com',
            userName: orderData.userName || 'Valued Customer',
            phone: orderData.phone || '99203 24172',
            address: `${orderData.selectedAddress.flat}, ${orderData.selectedAddress.street}, ${orderData.selectedAddress.area}, ${orderData.selectedAddress.pin}`,
            items: orderData.items,
            subtotal: orderData.subtotal,
            delivery: orderData.delivery,
            total: session.amount,
            couponApplied: orderData.couponApplied,
            discountApplied: orderData.discountApplied
          }
        })
      });

      const data = await safeJson(response, { success: false });
      clearTimeout(timer1);
      clearTimeout(timer2);

      if (response.ok && data && data.success) {
        setVerifiedOrder(data.order);
        setStage('success');
      } else {
        setErrorMessage(data?.error || 'Bank server could not verify transaction. If debited, it will be refunded within 24h.');
        setStage('failed');
      }
    } catch (err: any) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      console.error('Verification error:', err);
      setErrorMessage('Network timeout while checking bank server. Please retry verification.');
      setStage('failed');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/75 backdrop-blur-md transition-opacity" 
        onClick={stage === 'success' || stage === 'verifying' ? undefined : onClose} 
      />

      {/* Modal Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[480px] rounded-3xl bg-[var(--card)] border border-[var(--border)] shadow-2xl overflow-hidden z-10 flex flex-col max-h-[92vh]"
      >
        {/* Top App Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/40">
          <div className="flex items-center gap-2">
            <button
              onClick={stage === 'success' || stage === 'verifying' ? undefined : onClose}
              className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[var(--muted-fg)] transition-colors cursor-pointer"
              title="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-extrabold text-[var(--fg)]">Sabjies Official Payment</span>
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-[10px] text-[var(--muted-fg)] font-medium">NPCI UPI 256-Bit Encrypted Gateway</p>
            </div>
          </div>

          {/* Countdown Clock Badge */}
          {stage === 'gateway' && (
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
              timeLeft < 60 ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 animate-pulse' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
            }`}>
              <Clock className="h-3.5 w-3.5" />
              <span>{formatTime(timeLeft)}</span>
            </div>
          )}
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 overscroll-contain">
          
          {/* 1. INITIALIZING STAGE */}
          {stage === 'init' && (
            <div className="py-12 text-center space-y-4">
              <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 border-t-emerald-600 animate-spin" />
                <Lock className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--fg)]">Connecting to {currentMeta.name}...</h3>
                <p className="text-xs text-[var(--muted-fg)] mt-1">Generating instant verified UPI session with exact total...</p>
              </div>
            </div>
          )}

          {/* 2. ACTIVE GATEWAY / INTENT STAGE */}
          {stage === 'gateway' && session && (
            <div className="space-y-4">
              {/* Payment Card Banner */}
              <div className={`p-4 rounded-2xl bg-gradient-to-br ${currentMeta.bgGradient} text-white shadow-lg relative overflow-hidden`}>
                <div className="absolute top-0 right-0 p-3 opacity-15">
                  <Smartphone className="w-24 h-24" />
                </div>
                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-extrabold uppercase tracking-wider backdrop-blur-sm mb-1.5">
                      {currentMeta.badge}
                    </span>
                    <p className="text-xs text-white/80 font-medium">Paying to Verified Merchant</p>
                    <h4 className="text-sm font-black text-white">{session.businessName}</h4>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-white/80 uppercase font-semibold">Exact Amount</span>
                    <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">₹{session.amount}</h3>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-white/20 flex items-center justify-between text-[11px] text-white/90 font-mono">
                  <span>Order: #{session.orderId}</span>
                  <span className="text-emerald-200 font-sans font-bold">● Express 90-Min Ghatkopar</span>
                </div>
              </div>

              {/* Primary App Launch Action */}
              <div className="space-y-2">
                <button
                  onClick={handleOpenUpiApp}
                  className={`w-full py-3.5 px-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg active:scale-[0.99] cursor-pointer ${currentMeta.btnClass}`}
                >
                  <span className="text-base">{currentMeta.icon}</span>
                  <span>Open {currentMeta.name} & Pay ₹{session.amount}</span>
                  <ExternalLink className="h-4 w-4 ml-1" />
                </button>
                <p className="text-[11px] text-center text-[var(--muted-fg)]">
                  Tapping above opens your UPI app prefilled with <strong className="text-[var(--fg)]">₹{session.amount}</strong> and receiver info.
                </p>
              </div>

              {/* Collapsible / Visible QR Code & UPI ID Section */}
              <div className="p-3.5 bg-[var(--muted)] border border-[var(--border)] rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <QrCode className="h-4 w-4 text-[var(--primary)]" />
                    <span className="text-xs font-bold text-[var(--fg)]">Or Scan QR from another phone</span>
                  </div>
                  <button
                    onClick={() => setShowQrExpanded(!showQrExpanded)}
                    className="text-[11px] font-bold text-[var(--primary)] hover:underline cursor-pointer"
                  >
                    {showQrExpanded ? 'Hide QR ▲' : 'View QR Code ▼'}
                  </button>
                </div>

                {showQrExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex flex-col items-center justify-center pt-2 pb-1 space-y-2"
                  >
                    <div className="p-3 bg-white rounded-2xl shadow-md border border-gray-200 text-center">
                      {(session.qrCodeUrl || fallbackQrUrl) ? (
                        <img
                          src={session.qrCodeUrl || fallbackQrUrl}
                          alt={`${session.businessName || 'Merchant'} UPI QR`}
                          className="w-44 h-44 object-contain rounded-lg"
                        />
                      ) : (
                        <div className="w-44 h-44 flex flex-col items-center justify-center rounded-lg bg-gray-50 border border-dashed border-gray-200 p-4 text-center">
                          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)] mb-2" />
                          <p className="text-[10px] font-bold text-gray-500">Generating Merchant QR...</p>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--muted-fg)] font-medium text-center">
                      Scan using GPay, PhonePe, Paytm, BHIM or another supported UPI app
                    </span>
                  </motion.div>
                )}

                {/* Copy UPI ID Row */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--card)] border border-[var(--border)] text-xs">
                  <div>
                    <span className="text-[10px] text-[var(--muted-fg)] uppercase font-semibold block">Merchant UPI VPA</span>
                    <span className="font-mono font-bold text-[var(--fg)]">{session.upiId}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleCopyUpi}
                      className="px-2.5 py-1 rounded-lg bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--fg)] text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      {copiedUpi ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600" />
                          <span className="text-emerald-600">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Step-by-Step Payment Instructions */}
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs space-y-2">
                <h5 className="font-extrabold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <span>⚡ 3 Easy Steps to Complete:</span>
                </h5>
                <ol className="space-y-1.5 text-[11px] text-emerald-800 dark:text-emerald-300 font-medium list-decimal list-inside pl-1">
                  <li>Tap the button above to pay in <strong className="font-bold">{currentMeta.name}</strong> (or scan QR).</li>
                  <li>Approve and complete payment of <strong className="font-bold">₹{session.amount}</strong>.</li>
                  <li>Return here and tap <strong className="font-bold">"I Have Paid • Verify Payment"</strong> below.</li>
                </ol>
              </div>

              {/* Optional UTR Input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[var(--muted-fg)] flex items-center justify-between">
                  <span>12-Digit Bank Ref / UTR No. (Optional)</span>
                  <span className="text-[10px] text-emerald-600 font-medium">Instant matching</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 423987102948"
                  value={userUtr}
                  onChange={(e) => setUserUtr(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--fg)] placeholder-[var(--muted-fg)] focus:outline-none focus:border-[var(--primary)] font-mono"
                />
              </div>

              {/* Primary Verify Button */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={handleVerifyPayment}
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>I Have Paid • Verify Payment</span>
                </button>

                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    onClick={onClose}
                    className="text-[var(--muted-fg)] hover:text-[var(--fg)] font-semibold cursor-pointer"
                  >
                    Cancel Payment
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      onSwitchToCod();
                    }}
                    className="text-emerald-700 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
                  >
                    Switch to Cash on Delivery
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. VERIFYING STAGE */}
          {stage === 'verifying' && (
            <div className="py-6 space-y-6 text-center">
              <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 border-t-emerald-600 animate-spin" />
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 rounded-full text-emerald-600 animate-pulse">
                  <ShieldCheck className="w-8 h-8" />
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-black text-[var(--fg)]">Verifying Payment with Server</h3>
                <p className="text-xs text-[var(--muted-fg)]">
                  Contacting UPI banking switch and validating credit to Sabjies Fresh Grocery...
                </p>
              </div>

              {/* Animated Verification Steps */}
              <div className="bg-[var(--muted)] border border-[var(--border)] rounded-2xl p-4 text-left space-y-3">
                <div className="flex items-center gap-3 text-xs font-bold text-emerald-600">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center text-[10px]">✓</span>
                  <span>1. Contacting NPCI UPI Clearing House</span>
                </div>

                <div className={`flex items-center gap-3 text-xs font-bold transition-colors ${
                  verificationStep >= 2 ? 'text-emerald-600' : 'text-amber-600 animate-pulse'
                }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                    verificationStep >= 2 ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600' : 'bg-amber-100 dark:bg-amber-950 text-amber-600'
                  }`}>
                    {verificationStep >= 2 ? '✓' : '●'}
                  </span>
                  <span>2. Confirming credit of ₹{session?.amount || orderData.total} to Sabjies</span>
                </div>

                <div className={`flex items-center gap-3 text-xs font-bold transition-colors ${
                  verificationStep >= 3 ? 'text-emerald-600' : 'text-[var(--muted-fg)]'
                }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                    verificationStep >= 3 ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600' : 'border border-[var(--border)]'
                  }`}>
                    {verificationStep >= 3 ? '✓' : '3'}
                  </span>
                  <span>3. Reserving freshly harvested stock on server</span>
                </div>
              </div>

              <p className="text-[11px] text-[var(--muted-fg)] italic">
                Please do not close this browser window while verification completes.
              </p>
            </div>
          )}

          {/* 4. SUCCESS STAGE (OFFICIAL CONFIRMATION) */}
          {stage === 'success' && verifiedOrder && (
            <div className="space-y-5 py-2 text-center">
              {/* Animated Celebration Badge */}
              <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
                <div className="w-20 h-20 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30">
                  <Check className="w-10 h-10 stroke-[3]" />
                </div>
              </div>

              <div className="space-y-1">
                <span className="inline-block px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                  ✓ Verified by Bank & Server
                </span>
                <h3 className="text-xl font-black text-[var(--fg)]">Payment Accepted!</h3>
                <p className="text-2xl font-black text-emerald-600">₹{verifiedOrder.total}</p>
              </div>

              {/* Transaction Summary Card */}
              <div className="bg-[var(--muted)] border border-[var(--border)] rounded-2xl p-4 text-left text-xs space-y-2.5">
                <div className="flex justify-between items-center pb-2 border-b border-[var(--border)]">
                  <span className="text-[var(--muted-fg)] font-medium">Payment Status</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-black text-[10px] uppercase tracking-wide">
                    PAID & CONFIRMED ✓
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted-fg)] font-medium">Order ID</span>
                  <span className="font-mono font-bold text-[var(--fg)]">#{verifiedOrder.id}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted-fg)] font-medium">Bank Ref / Transaction</span>
                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 truncate max-w-[200px]">
                    {verifiedOrder.transactionId || verifiedOrder.utr}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted-fg)] font-medium">Payment Method</span>
                  <span className="font-bold text-[var(--fg)]">{verifiedOrder.payment}</span>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[var(--border)]">
                  <span className="text-[var(--muted-fg)] font-medium">Delivery Address</span>
                  <span className="text-[11px] text-right font-medium text-[var(--fg)] truncate max-w-[210px]">
                    {verifiedOrder.address}
                  </span>
                </div>
              </div>

              {/* Express Delivery Confirmation */}
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-left flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-black text-emerald-900 dark:text-emerald-200">Fresh Harvest Dispatched! 🥦</h4>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-0.5">
                    Your organic vegetables are being handpicked from Maharashtra partner farms and will arrive within <strong>45–90 Minutes</strong>.
                  </p>
                </div>
              </div>

              {/* Primary Completion Button */}
              <div className="pt-2">
                <button
                  onClick={() => {
                    onPaymentVerified(verifiedOrder, verifiedOrder.transactionId || verifiedOrder.utr);
                  }}
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  <span>Track Order & View Receipt →</span>
                </button>
              </div>
            </div>
          )}

          {/* 5. FAILED STAGE */}
          {stage === 'failed' && (
            <div className="py-4 space-y-4 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-[var(--fg)]">Payment Verification Issue</h3>
                <p className="text-xs text-[var(--muted-fg)]">
                  {errorMessage || "We couldn't verify this transaction automatically. No money was deducted for unconfirmed orders."}
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  onClick={() => {
                    setStage('gateway');
                    setErrorMessage('');
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl py-3 text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Retry Verification</span>
                </button>

                <button
                  onClick={() => {
                    onClose();
                    onSwitchToCod();
                  }}
                  className="w-full bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--fg)] border border-[var(--border)] rounded-2xl py-2.5 text-xs font-bold transition-all cursor-pointer"
                >
                  Place Order with Cash on Delivery (COD) Instead
                </button>
              </div>
            </div>
          )}

        </div>
      </motion.div>
    </div>
  );
};
