/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, CartItem, Address, PaymentSettings } from '../types';
import { MapPin, CreditCard, ShoppingCart, Plus, X, Tag, FileText, CheckCircle2, ShieldCheck, Check, AlertTriangle, Loader2, Sparkles, Clock, ArrowRight, RefreshCw, Smartphone, QrCode } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UpiPaymentGatewayModal } from './UpiPaymentGatewayModal';
import { safeJson } from '../utils/apiHelper';

interface CheckoutModalProps {
  user: User | null;
  cart: { [id: number]: CartItem };
  onClose: () => void;
  onConfirmOrder: (
    address: Address,
    paymentMethod: string,
    paymentStatus: 'Pending' | 'Paid',
    transactionId: string,
    extra?: { upiIdUsed?: string; utr?: string; screenshotUrl?: string }
  ) => void;
  onUpdateAddresses: (addresses: Address[]) => void;

  // Coupon System
  appliedCoupon: string;
  couponDiscount: number;
  onApplyCoupon: (code: string, discount: number) => void;

  // Delivery Instructions
  deliveryInstructions: string;
  onChangeDeliveryInstructions: (val: string) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  user,
  cart,
  onClose,
  onConfirmOrder,
  onUpdateAddresses,
  appliedCoupon,
  couponDiscount,
  onApplyCoupon,
  deliveryInstructions,
  onChangeDeliveryInstructions,
}) => {
  const [selectedAddressIdx, setSelectedAddressIdx] = useState(0);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [isUpiModalOpen, setIsUpiModalOpen] = useState(false);
  const [isUpiGatewayOpen, setIsUpiGatewayOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentStepMsg, setPaymentStepMsg] = useState<string>('');

  // Part 3 Payment Processing & Stage State
  type PaymentStage = 'idle' | 'processing' | 'awaiting_upi' | 'verifying' | 'success' | 'failed' | 'cancelled' | 'pending';
  const [paymentStage, setPaymentStage] = useState<PaymentStage>('idle');
  const [activeOrderInfo, setActiveOrderInfo] = useState<{
    orderId: string;
    amount: number;
    razorpayOrderId?: string;
    paymentMethod?: string;
  } | null>(null);
  const [completedOrder, setCompletedOrder] = useState<{
    orderId: string;
    transactionId: string;
    razorpayOrderId?: string;
    amount: number;
    date: string;
    paymentMethod: string;
    selectedAddress: Address;
  } | null>(null);
  const [stageError, setStageError] = useState<string>('');

  // Load payment settings as state
  const [settings, setSettings] = useState<PaymentSettings>({
    businessName: 'Sabjies Fresh Grocery',
    upiId: 'sabjies@upi',
    qrCodeUrl: '',
    qrCodeUploaded: false,
    instructions: '1. Pay securely online or cash on delivery when fresh vegetables arrive.',
    enableUpi: true,
    enableCod: true,
    enableRazorpay: true,
    autoApproveUpi: false,
  });

  const [selectedPayment, setSelectedPayment] = useState<string>('gpay');

  useEffect(() => {
    fetch('/api/payment-settings')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setSettings(data);
        }
      })
      .catch(() => {
        const storedSettings = localStorage.getItem('sabjies_payment_settings');
        if (storedSettings) {
          try {
            const parsed = JSON.parse(storedSettings);
            setSettings(parsed);
          } catch {}
        }
      });
  }, []);

  // Address fields
  const [addrLabel, setAddrLabel] = useState('Home');
  const [addrFlat, setAddrFlat] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrArea, setAddrArea] = useState('Ghatkopar East');
  const [addrPin, setAddrPin] = useState('400075');

  const addresses = user?.addresses || [];
  const cartItems = Object.values(cart) as CartItem[];
  const subtotal = cartItems.reduce((acc, i) => acc + i.sp * i.qty, 0);
  const delivery = subtotal >= 299 ? 0 : 30;

  // Coupon delivery fee deduction
  const isFreeDeliveryApplied = appliedCoupon === 'FREE90';
  const finalDelivery = isFreeDeliveryApplied ? 0 : delivery;
  const total = Math.max(0, subtotal + finalDelivery - couponDiscount);

  // Coupon application state inside checkout
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [businessSettings, setBusinessSettings] = useState({
    enableIgBanner: true,
    igProfileUrl: 'https://www.instagram.com/sabjies?igsh=MWp6cDQ2NHZtcnE0Zw',
    igBannerText: '🎁 Follow us on Instagram for exclusive discount codes.',
  });

  useEffect(() => {
    fetch('/api/business-settings')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setBusinessSettings({
            enableIgBanner: data.enableIgBanner !== undefined ? data.enableIgBanner : true,
            igProfileUrl: data.igProfileUrl || 'https://www.instagram.com/sabjies?igsh=MWp6cDQ2NHZtcnE0Zw',
            igBannerText: data.igBannerText || '🎁 Follow us on Instagram for exclusive discount codes.',
          });
        }
      })
      .catch(() => {});
  }, []);

  const AVAILABLE_COUPONS = [
    { code: 'FRESH20', desc: '20% OFF (Max ₹100) on orders above ₹199', minSubtotal: 199 },
    { code: 'SABJIES100', desc: 'Flat ₹100 OFF on orders above ₹499', minSubtotal: 499 },
    { code: 'FREE90', desc: 'Free Delivery on any order', minSubtotal: 0 },
  ];

  const handleApplyCouponCode = (code: string) => {
    const cleanCode = code.trim().toUpperCase();
    setCouponError('');

    if (!cleanCode) {
      setCouponError('Please enter a coupon code.');
      return;
    }

    // Server-side validation
    fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: cleanCode,
        subtotal: subtotal,
        userId: user?.id || 'guest',
        userEmail: user?.email || '',
        phone: user?.phone || ''
      })
    })
    .then(res => safeJson(res, { valid: false, message: 'Invalid response from coupon server' }))
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

  // Modern Amazon / Flipkart style Payment Method Options
  const paymentOptions = [
    {
      id: 'gpay',
      title: 'Google Pay',
      subtitle: 'Instant UPI via Google Pay app or QR',
      badge: 'Recommended',
      badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
      iconBg: 'bg-blue-500/10 text-blue-600',
      emoji: '🔵',
      buttonLabel: `Pay ₹${total} with Google Pay`,
      isOnline: true,
    },
    {
      id: 'phonepe',
      title: 'PhonePe',
      subtitle: 'Fast UPI payment via PhonePe app / QR',
      badge: 'Fast UPI',
      badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800',
      iconBg: 'bg-purple-500/10 text-purple-600',
      emoji: '🟣',
      buttonLabel: `Pay ₹${total} with PhonePe`,
      isOnline: true,
    },
    {
      id: 'paytm',
      title: 'Paytm',
      subtitle: 'Paytm UPI, Wallet & Postpaid',
      badge: 'Paytm FastPay',
      badgeClass: 'bg-sky-100 text-sky-700 dark:bg-sky-950/80 dark:text-sky-300 border border-sky-200 dark:border-sky-800',
      iconBg: 'bg-sky-500/10 text-sky-600',
      emoji: '🟦',
      buttonLabel: `Pay ₹${total} with Paytm`,
      isOnline: true,
    },
    {
      id: 'upi',
      title: 'Any UPI App / QR',
      subtitle: 'BHIM, CRED, WhatsApp Pay & any UPI ID',
      badge: 'All UPI Apps',
      badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
      iconBg: 'bg-emerald-500/10 text-emerald-600',
      emoji: '⚡',
      buttonLabel: `Pay ₹${total} via UPI / QR`,
      isOnline: true,
    },
    {
      id: 'card',
      title: 'Credit & Debit Cards',
      subtitle: 'Visa, Mastercard, RuPay, Maestro & Diners',
      badge: 'All Major Cards',
      badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
      iconBg: 'bg-amber-500/10 text-amber-600',
      emoji: '💳',
      buttonLabel: `Pay ₹${total} with Card`,
      isOnline: true,
    },
    {
      id: 'netbanking',
      title: 'Net Banking',
      subtitle: 'SBI, HDFC, ICICI, Axis, Kotak & 50+ Banks',
      badge: '50+ Banks',
      badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800',
      iconBg: 'bg-indigo-500/10 text-indigo-600',
      emoji: '🏦',
      buttonLabel: `Pay ₹${total} via Net Banking`,
      isOnline: true,
    },
    {
      id: 'wallets',
      title: 'Wallets & Pay Later',
      subtitle: 'Amazon Pay, MobiKwik, Simpl, LazyPay',
      badge: 'Wallets & BNPL',
      badgeClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
      iconBg: 'bg-rose-500/10 text-rose-600',
      emoji: '👛',
      buttonLabel: `Pay ₹${total} via Wallets`,
      isOnline: true,
    },
    {
      id: 'cod',
      title: 'Cash on Delivery (COD)',
      subtitle: 'Pay cash or UPI upon doorstep delivery',
      badge: 'Pay at Doorstep',
      badgeClass: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-300 dark:border-gray-700',
      iconBg: 'bg-gray-500/10 text-gray-600',
      emoji: '💵',
      buttonLabel: `Place COD Order • ₹${total}`,
      isOnline: false,
    },
  ];

  const finalPaymentOptions = paymentOptions;

  const selectedOption = finalPaymentOptions.find(o => o.id === selectedPayment) || finalPaymentOptions[0];

  const handleSaveAddress = () => {
    if (!addrFlat.trim() || !addrStreet.trim() || !addrArea.trim() || !addrPin.trim()) {
      setErrorMsg('Please fill all required address details.');
      return;
    }
    setErrorMsg(null);
    const newAddress: Address = {
      label: addrLabel.trim() || 'Home',
      flat: addrFlat.trim(),
      street: addrStreet.trim(),
      area: addrArea.trim(),
      pin: addrPin.trim(),
    };

    const updatedAddresses = [...addresses, newAddress];
    onUpdateAddresses(updatedAddresses);
    setSelectedAddressIdx(updatedAddresses.length - 1);
    setShowAddressForm(false);

    setAddrFlat('');
    setAddrStreet('');
  };

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleRazorpayPayment = async (selectedAddress: Address) => {
    const isRazorpayConfigured = Boolean(settings.enableRazorpay && (settings as any).razorpayKeyIdConfigured !== false && (settings as any).razorpayKeyIdConfigured);

    // If Razorpay gateway credentials are not configured on the server, smoothly open UPI & Online Gateway
    if (!isRazorpayConfigured) {
      setIsProcessingPayment(false);
      setPaymentStage('idle');
      setIsUpiGatewayOpen(true);
      return;
    }

    setIsProcessingPayment(true);
    setErrorMsg(null);
    setStageError('');
    setPaymentStage('processing');
    setPaymentStepMsg(`Connecting to Secure Payment Gateway for ${selectedOption.title}...`);

    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        setIsProcessingPayment(false);
        setPaymentStage('idle');
        setIsUpiGatewayOpen(true);
        return;
      }

      // Generate client-side idempotency key for this cart snapshot
      const idempotencyKey = `idemp_${user?.id || 'guest'}_${cartItems.map(i => `${i.id}x${i.qty}`).sort().join('_')}_${appliedCoupon || 'none'}`;

      // 1. Call backend API to create server-validated payment order (INITIATED state)
      const orderRes = await fetch('/api/payments/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cartItems.map(i => ({ id: i.id, name: i.name, qty: i.qty, sp: i.sp, emoji: i.emoji })),
          deliveryFee: delivery,
          couponCode: appliedCoupon,
          userId: user?.id,
          userEmail: user?.email,
          userName: user?.name,
          phone: user?.phone,
          address: `${selectedAddress.flat}, ${selectedAddress.street}, ${selectedAddress.area}, ${selectedAddress.pin}`,
          paymentMethod: `${selectedOption.title} (Online)`,
          idempotencyKey
        })
      });

      const orderData = await safeJson(orderRes, { success: false });

      if (!orderRes.ok || !orderData || !orderData.success || !orderData.keyId) {
        setIsProcessingPayment(false);
        setPaymentStage('idle');
        setIsUpiGatewayOpen(true);
        return;
      }

      const internalCreatedOrderId = orderData.orderId;
      const authoritativeAmount = orderData.calculatedDetails?.total || total;

      setActiveOrderInfo({
        orderId: internalCreatedOrderId,
        amount: authoritativeAmount,
        razorpayOrderId: orderData.razorpayOrderId,
        paymentMethod: selectedOption.title
      });

      // Show "Complete payment in app/window" (PAYMENT_PENDING state) - Do NOT show success yet
      setPaymentStage('awaiting_upi');
      setPaymentStepMsg(`Complete payment via ${selectedOption.title}`);

      // 2. Configure targeted method preference for Razorpay Checkout
      let methodConfig: any = {};
      if (selectedPayment === 'gpay') {
        methodConfig = {
          config: {
            display: {
              blocks: {
                upi: {
                  name: 'Google Pay UPI',
                  instruments: [
                    { method: 'upi', apps: ['google_pay'] },
                    { method: 'upi' }
                  ]
                },
                other: {
                  name: 'Other Payment Methods',
                  instruments: [
                    { method: 'card' },
                    { method: 'netbanking' },
                    { method: 'wallet' },
                    { method: 'upi' }
                  ]
                }
              },
              sequence: ['block.upi', 'block.other'],
              preferences: { show_default_blocks: true }
            }
          }
        };
      } else if (selectedPayment === 'phonepe') {
        methodConfig = {
          config: {
            display: {
              blocks: {
                upi: {
                  name: 'PhonePe UPI',
                  instruments: [
                    { method: 'upi', apps: ['phonepe'] },
                    { method: 'upi' }
                  ]
                },
                other: {
                  name: 'Other Payment Methods',
                  instruments: [
                    { method: 'card' },
                    { method: 'netbanking' },
                    { method: 'wallet' },
                    { method: 'upi' }
                  ]
                }
              },
              sequence: ['block.upi', 'block.other'],
              preferences: { show_default_blocks: true }
            }
          }
        };
      } else if (selectedPayment === 'paytm') {
        methodConfig = {
          config: {
            display: {
              blocks: {
                upi: {
                  name: 'Paytm UPI & Wallet',
                  instruments: [
                    { method: 'upi', apps: ['paytm'] },
                    { method: 'wallet', wallets: ['paytm'] },
                    { method: 'upi' }
                  ]
                },
                other: {
                  name: 'Other Payment Methods',
                  instruments: [
                    { method: 'card' },
                    { method: 'netbanking' },
                    { method: 'wallet' },
                    { method: 'upi' }
                  ]
                }
              },
              sequence: ['block.upi', 'block.other'],
              preferences: { show_default_blocks: true }
            }
          }
        };
      } else if (selectedPayment === 'upi') {
        methodConfig = {
          config: {
            display: {
              blocks: {
                upi: {
                  name: 'UPI Apps & Dynamic QR',
                  instruments: [{ method: 'upi' }]
                },
                other: {
                  name: 'Other Payment Methods',
                  instruments: [
                    { method: 'card' },
                    { method: 'netbanking' },
                    { method: 'wallet' }
                  ]
                }
              },
              sequence: ['block.upi', 'block.other'],
              preferences: { show_default_blocks: true }
            }
          }
        };
      } else if (selectedPayment === 'card') {
        methodConfig = {
          config: {
            display: {
              blocks: {
                card: {
                  name: 'Credit & Debit Cards',
                  instruments: [{ method: 'card' }]
                },
                other: {
                  name: 'Other Payment Methods',
                  instruments: [
                    { method: 'upi' },
                    { method: 'netbanking' },
                    { method: 'wallet' }
                  ]
                }
              },
              sequence: ['block.card', 'block.other'],
              preferences: { show_default_blocks: true }
            }
          }
        };
      } else if (selectedPayment === 'netbanking') {
        methodConfig = {
          config: {
            display: {
              blocks: {
                netbanking: {
                  name: 'Net Banking',
                  instruments: [{ method: 'netbanking' }]
                },
                other: {
                  name: 'Other Payment Methods',
                  instruments: [
                    { method: 'upi' },
                    { method: 'card' },
                    { method: 'wallet' }
                  ]
                }
              },
              sequence: ['block.netbanking', 'block.other'],
              preferences: { show_default_blocks: true }
            }
          }
        };
      } else if (selectedPayment === 'wallets') {
        methodConfig = {
          config: {
            display: {
              blocks: {
                wallet: {
                  name: 'Wallets & Pay Later',
                  instruments: [{ method: 'wallet' }]
                },
                other: {
                  name: 'Other Payment Methods',
                  instruments: [
                    { method: 'upi' },
                    { method: 'card' },
                    { method: 'netbanking' }
                  ]
                }
              },
              sequence: ['block.wallet', 'block.other'],
              preferences: { show_default_blocks: true }
            }
          }
        };
      }

      // 3. Launch official Razorpay Checkout modal
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'Sabjies Fresh Grocery',
        description: `Order #${internalCreatedOrderId} • ${selectedOption.title} (₹${authoritativeAmount})`,
        order_id: orderData.razorpayOrderId,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          contact: user?.phone || ''
        },
        theme: {
          color: '#16a34a'
        },
        ...methodConfig,
        modal: {
          ondismiss: () => {
            setIsProcessingPayment(false);
            setPaymentStage('cancelled');
            fetch('/api/payments/razorpay/cancel', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId: internalCreatedOrderId,
                razorpayOrderId: orderData.razorpayOrderId,
                reason: 'Customer dismissed payment window'
              })
            }).catch(() => {});
          }
        },
        handler: async (response: any) => {
          // Enter VERIFYING state
          setPaymentStage('verifying');
          setPaymentStepMsg('Verifying transaction signature securely with server...');
          try {
            const verifyRes = await fetch('/api/payments/razorpay/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                orderData: {
                  id: internalCreatedOrderId,
                  userId: user?.id || 'guest',
                  userEmail: user?.email || 'greensabjies@gmail.com',
                  userName: user?.name || 'Valued Customer',
                  phone: user?.phone || '99203 24172',
                  address: `${selectedAddress.flat}, ${selectedAddress.street}, ${selectedAddress.area}, ${selectedAddress.pin}`,
                  items: cartItems.map(i => ({ id: i.id, name: i.name, qty: i.qty, sp: i.sp, emoji: i.emoji })),
                  subtotal,
                  delivery,
                  total: authoritativeAmount,
                  couponApplied: appliedCoupon,
                  paymentMethod: `${selectedOption.title} (Online)`
                }
              })
            });

            const verifyData = await safeJson(verifyRes, { success: false });
            setIsProcessingPayment(false);

            if (verifyRes.ok && verifyData && verifyData.success && verifyData.state === 'PAID') {
              // Transition to PAID / SUCCESS state ONLY after successful server-side verification
              setCompletedOrder({
                orderId: verifyData.order?.id || internalCreatedOrderId,
                transactionId: response.razorpay_payment_id || verifyData.order?.transactionId,
                razorpayOrderId: response.razorpay_order_id,
                amount: authoritativeAmount,
                date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                paymentMethod: `${selectedOption.title} (Online)`,
                selectedAddress
              });
              setPaymentStage('success');
            } else {
              setStageError(verifyData.error || 'Payment signature verification failed. Please contact support.');
              setPaymentStage('failed');
            }
          } catch (err: any) {
            setIsProcessingPayment(false);
            setStageError('Payment verification encountered a network issue. Please contact support or try again.');
            setPaymentStage('failed');
          }
        }
      };

      const rzpInstance = new (window as any).Razorpay(options);
      rzpInstance.on('payment.failed', (response: any) => {
        setIsProcessingPayment(false);
        const errDesc = response.error?.description || 'Your payment was declined by the bank or gateway.';
        setStageError(errDesc);
        setPaymentStage('failed');
        fetch('/api/payments/razorpay/fail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: internalCreatedOrderId,
            razorpayOrderId: orderData.razorpayOrderId,
            error: response.error
          })
        }).catch(() => {});
      });
      rzpInstance.open();

    } catch (err: any) {
      setIsProcessingPayment(false);
      setPaymentStage('idle');
      setIsUpiGatewayOpen(true);
    }
  };

  const handleUpiPaymentVerified = (order: any, transactionId: string) => {
    const selectedAddress = addresses[selectedAddressIdx] || addresses[0];
    setIsUpiGatewayOpen(false);
    onConfirmOrder(
      selectedAddress,
      order.payment || `${selectedOption.title} (Online)`,
      'Paid',
      transactionId || order.transactionId || order.utr || ('UPI_' + Date.now()),
      {
        upiIdUsed: settings.upiId,
        utr: transactionId || order.transactionId || order.utr
      }
    );
  };

  const handleConfirm = () => {
    if (!user) {
      setErrorMsg('Please sign in to place your order.');
      return;
    }
    if (!addresses.length) {
      setErrorMsg('Please add a delivery address to proceed.');
      return;
    }
    setErrorMsg(null);
    const selectedAddress = addresses[selectedAddressIdx] || addresses[0];

    if (selectedPayment === 'cod') {
      const txnId = 'COD-' + Math.floor(10000 + Math.random() * 90000);
      onConfirmOrder(selectedAddress, 'Cash on Delivery', 'Pending', txnId);
    } else {
      // Direct all online payment options through the verified Razorpay gateway flow
      handleRazorpayPayment(selectedAddress);
    }
  };

  return (
    <div className="fixed inset-0 z-[550] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

      {/* Modal Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[560px] rounded-3xl bg-[var(--card)] border border-[var(--border)] shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh] backdrop-blur-2xl"
      >
        {businessSettings.enableIgBanner && (
          <div className="bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white py-1.5 px-4 shadow-inner flex items-center justify-between gap-2 flex-shrink-0 text-[10px] sm:text-xs font-semibold">
            <span className="truncate">{businessSettings.igBannerText}</span>
            <a
              href={businessSettings.igProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white text-pink-600 font-extrabold px-2.5 py-0.5 rounded-full uppercase text-[9px] hover:bg-pink-50 transition-colors shrink-0"
            >
              Follow Us
            </a>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)] bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/40">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-[var(--primary)]" />
            <h2 className="text-base font-extrabold text-[var(--fg)]">Checkout & Secure Payment 🛒</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted-fg)] hover:text-red-500 hover:border-red-200 transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div 
          data-lenis-prevent
          className="flex-1 overflow-y-auto p-5 space-y-6 overscroll-contain"
        >
          <AnimatePresence>
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 p-3 rounded-2xl text-[11px] font-bold flex items-center gap-2"
              >
                <span>⚠️</span>
                <span className="flex-1">{errorMsg}</span>
                <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-600 p-0.5 cursor-pointer">✕</button>
              </motion.div>
            )}
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 p-3 rounded-2xl text-[11px] font-bold flex items-center gap-2"
              >
                <span>✅</span>
                <span className="flex-1">{successMsg}</span>
                <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-600 p-0.5 cursor-pointer">✕</button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Section 1: Address Selection */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-[var(--primary)]" />
              <span>Delivery Address</span>
            </h3>

            {addresses.length > 0 ? (
              <div className="grid grid-cols-1 gap-2.5">
                {addresses.map((addr, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedAddressIdx(i)}
                    className={`rounded-xl border p-3.5 cursor-pointer transition-all ${
                      selectedAddressIdx === i
                        ? 'border-[var(--primary)] bg-[var(--muted)] shadow-sm'
                        : 'border-[var(--border)] bg-[var(--card)] hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-extrabold text-[var(--primary)] bg-green-100 dark:bg-green-950 px-2 py-0.5 rounded uppercase tracking-wide">
                        {addr.label || 'Home'}
                      </span>
                      {selectedAddressIdx === i && (
                        <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
                      )}
                    </div>
                    <p className="text-xs text-[var(--fg)] font-medium">
                      {addr.flat}, {addr.street}
                    </p>
                    <p className="text-[11px] text-[var(--muted-fg)] mt-0.5">
                      {addr.area} — {addr.pin}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--muted-fg)] py-1 italic">
                No delivery addresses found. Add one below to place your order.
              </p>
            )}

            {/* Add Address button & Form */}
            {!showAddressForm ? (
              <button
                onClick={() => setShowAddressForm(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--border)] p-3 text-xs font-semibold text-[var(--primary)] hover:border-[var(--primary)] hover:bg-[var(--muted)] transition-all"
              >
                <Plus className="h-4 w-4" />
                <span>+ Add New Address</span>
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 flex flex-col gap-3.5"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-[var(--muted-fg)]">Address Type</label>
                    <select
                      value={addrLabel}
                      onChange={(e) => setAddrLabel(e.target.value)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-xs text-[var(--fg)] outline-none"
                    >
                      <option value="Home">🏠 Home</option>
                      <option value="Office">💼 Office</option>
                      <option value="Other">📍 Other</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-[var(--muted-fg)]">Flat / Door No. *</label>
                    <input
                      type="text"
                      value={addrFlat}
                      onChange={(e) => setAddrFlat(e.target.value)}
                      placeholder="e.g., Flat A-402"
                      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-xs text-[var(--fg)] outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-[var(--muted-fg)]">Street / Building Name *</label>
                  <input
                    type="text"
                    value={addrStreet}
                    onChange={(e) => setAddrStreet(e.target.value)}
                    placeholder="e.g., Sunshine Apartments, Pant Nagar"
                    className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-xs text-[var(--fg)] outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-[var(--muted-fg)]">Area / Location *</label>
                    <input
                      type="text"
                      list="checkout-delivery-zones"
                      value={addrArea}
                      onChange={(e) => setAddrArea(e.target.value)}
                      placeholder="e.g., Ghatkopar East / West, Vikhroli West"
                      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-xs text-[var(--fg)] outline-none"
                    />
                    <datalist id="checkout-delivery-zones">
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
                      maxLength={6}
                      value={addrPin}
                      onChange={(e) => setAddrPin(e.target.value)}
                      placeholder="e.g., 400075"
                      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-xs text-[var(--fg)] outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end mt-1">
                  <button
                    onClick={() => setShowAddressForm(false)}
                    className="rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-1.5 text-xs font-semibold text-[var(--muted-fg)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveAddress}
                    className="rounded-full bg-[var(--primary)] px-5 py-1.5 text-xs font-bold text-white hover:opacity-95"
                  >
                    Save Address
                  </button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Section 2: Delivery Instructions */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-[var(--primary)]" />
              <span>Delivery Instructions (Optional)</span>
            </h3>
            <textarea
              value={deliveryInstructions}
              onChange={(e) => onChangeDeliveryInstructions(e.target.value)}
              placeholder="e.g., 'Ring doorbell twice', 'Leave at flat gate', 'Call on arrival', 'Keep in box at door'"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)] min-h-[60px] resize-none"
            />
          </div>

          {/* Section 3: Coupon System inside Checkout */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider flex items-center gap-1.5">
              <Tag className="h-4 w-4 text-[var(--primary)]" />
              <span>Promo Coupons</span>
            </h3>

            {appliedCoupon ? (
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20 p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    Coupon "{appliedCoupon}" Active (-₹{couponDiscount})
                  </span>
                </div>
                <button
                  onClick={() => onApplyCoupon('', 0)}
                  className="text-[10px] font-bold text-red-500 hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    placeholder="Enter Coupon / Promo Code"
                    onChange={(e) => {
                      setCouponInput(e.target.value);
                      setCouponError('');
                    }}
                    className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)] uppercase font-semibold"
                  />
                  <button
                    onClick={() => handleApplyCouponCode(couponInput)}
                    className="rounded-xl bg-[var(--primary)] text-white px-4 py-2 text-xs font-bold"
                  >
                    Apply
                  </button>
                </div>
                {couponError && (
                  <p className="text-[10px] text-red-500 font-semibold">{couponError}</p>
                )}
                {businessSettings.enableIgBanner && (
                  <div className="mt-2 p-2 bg-pink-50 dark:bg-pink-950/10 border border-pink-100 dark:border-pink-900/30 rounded-lg flex items-center justify-between gap-2">
                    <span className="text-[10px] text-pink-700 dark:text-pink-300 font-semibold flex items-center gap-1">
                      💚 Follow us on Instagram for exclusive discount codes.
                    </span>
                    <a
                      href={businessSettings.igProfileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] bg-pink-600 text-white font-black px-2 py-0.5 rounded-full uppercase shrink-0 hover:bg-pink-700 transition-colors"
                    >
                      Follow
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 4: Payment Method */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="h-4 w-4 text-[var(--primary)]" />
                <span>Select Payment Method</span>
              </h3>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> 100% Encrypted & Secure
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[310px] overflow-y-auto pr-1">
              {finalPaymentOptions.map((opt) => {
                const isSelected = selectedPayment === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setSelectedPayment(opt.id)}
                    className={`relative flex flex-col justify-between rounded-2xl border p-3 transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'border-[var(--primary)] bg-[var(--muted)] shadow-md ring-2 ring-[var(--primary)]/20'
                        : 'border-[var(--border)] bg-[var(--bg)] hover:border-emerald-300 dark:hover:border-emerald-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${opt.iconBg} font-bold text-base shrink-0 shadow-sm`}>
                          {opt.emoji}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-black text-[var(--fg)] flex items-center gap-1.5">
                            <span className="truncate">{opt.title}</span>
                          </div>
                          <div className="text-[10px] text-[var(--muted-fg)] line-clamp-1">{opt.subtitle}</div>
                        </div>
                      </div>

                      <div className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-gray-400'
                      }`}>
                        {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                    </div>

                    <div className="mt-2 pt-1.5 border-t border-[var(--border)]/40 flex items-center justify-between gap-1 text-[9px]">
                      <span className={`px-1.5 py-0.5 rounded font-extrabold uppercase ${opt.badgeClass}`}>
                        {opt.badge}
                      </span>
                      {opt.isOnline && (
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-[9px] flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> Secure & Encrypted
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 5: Summary of Checkout Items */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider flex items-center gap-1">
              <span>🛒</span>
              <span>Order Summary</span>
            </h3>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 space-y-2 max-h-[140px] overflow-y-auto">
              {cartItems.map((item) => (
                <div key={item.id} className="flex justify-between items-center text-xs">
                  <span className="text-[var(--fg)] font-medium">
                    {item.emoji} {item.name} <strong className="text-[var(--muted-fg)]">× {item.qty}</strong>
                  </span>
                  <span className="font-semibold text-[var(--fg)]">₹{item.sp * item.qty}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Summary & Placement */}
        <div className="p-5 border-t border-[var(--border)] bg-[var(--card)] flex flex-col gap-3">
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-[var(--muted-fg)]">
              <span>Subtotal</span>
              <span>₹{subtotal}</span>
            </div>
            <div className="flex justify-between text-[var(--muted-fg)]">
              <span>Express Delivery (90 Mins)</span>
              <span>
                {isFreeDeliveryApplied ? (
                  <span className="text-emerald-600 font-bold">FREE (COUPON)</span>
                ) : delivery === 0 ? (
                  'FREE'
                ) : (
                  `₹${delivery}`
                )}
              </span>
            </div>

            {couponDiscount > 0 && (
              <div className="flex justify-between text-emerald-600 font-bold">
                <span>Coupon Applied ({appliedCoupon})</span>
                <span>- ₹{couponDiscount}</span>
              </div>
            )}

            <div className="flex justify-between text-base font-extrabold text-[var(--fg)] pt-1.5 border-t border-[var(--border)] mt-1.5">
              <span>Total Price</span>
              <span className="text-[var(--primary)] text-lg font-black">₹{total}</span>
            </div>
          </div>

          {isProcessingPayment && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-center gap-2 text-xs text-emerald-800 dark:text-emerald-200 font-bold animate-pulse">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
              <span>{paymentStepMsg || 'Processing payment securely...'}</span>
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={!addresses.length || isProcessingPayment}
            className="w-full bg-[var(--primary)] text-[var(--primary-fg)] rounded-full py-3.5 text-xs font-black shadow-md hover:bg-opacity-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-1 uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
          >
            {isProcessingPayment ? (
              <span>Processing Order...</span>
            ) : (
              <span>{selectedOption.buttonLabel} →</span>
            )}
          </button>
        </div>

        {/* Part 3: Premium Payment Processing & Success Stage Modal */}
        <AnimatePresence>
          {paymentStage !== 'idle' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 bg-[var(--bg)]/95 backdrop-blur-md flex items-center justify-center p-4 rounded-3xl overflow-y-auto"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 10 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl space-y-6 text-center my-auto"
              >
                {/* 1. PROCESSING STAGE */}
                {paymentStage === 'processing' && (
                  <div className="space-y-5 py-4">
                    <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 border-t-emerald-600 animate-spin" />
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 rounded-full text-emerald-600 animate-pulse">
                        <ShieldCheck className="w-8 h-8" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-lg font-black text-[var(--fg)]">Securing Your Payment</h3>
                      <p className="text-xs text-[var(--muted-fg)]">
                        Please wait while we establish an encrypted connection with the payment gateway...
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--muted)] border border-[var(--border)] text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{paymentStepMsg || 'Preparing Secure Checkout Session...'}</span>
                    </div>
                  </div>
                )}

                {/* 1.5 AWAITING UPI PAYMENT STAGE */}
                {paymentStage === 'awaiting_upi' && (
                  <div className="space-y-5 py-2">
                    <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-4 border-amber-500/20 border-t-amber-600 animate-spin" />
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/60 rounded-full text-amber-600 animate-pulse">
                        <Smartphone className="w-8 h-8" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="inline-block px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase tracking-wider">
                        ⏳ Payment in Progress
                      </span>
                      <h3 className="text-lg font-black text-[var(--fg)]">Complete Payment</h3>
                      <p className="text-xs text-[var(--muted-fg)] max-w-sm mx-auto">
                        Please authorize the payment in the checkout window or your banking/UPI application to confirm order #{activeOrderInfo?.orderId}.
                      </p>
                    </div>

                    {/* Order Details Preview */}
                    <div className="bg-[var(--muted)] border border-[var(--border)] rounded-xl p-3.5 text-left text-xs space-y-2">
                      <div className="flex justify-between items-center pb-2 border-b border-[var(--border)]">
                        <span className="text-[var(--muted-fg)] font-medium">Order Reference</span>
                        <span className="font-mono font-bold text-[var(--fg)]">#{activeOrderInfo?.orderId}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--muted-fg)] font-medium">Authoritative Amount</span>
                        <span className="font-black text-emerald-600 text-sm">₹{activeOrderInfo?.amount || total}</span>
                      </div>
                      {activeOrderInfo?.razorpayOrderId && (
                        <div className="flex justify-between items-center">
                          <span className="text-[var(--muted-fg)] font-medium">Payment Reference</span>
                          <span className="font-mono text-[10px] text-[var(--muted-fg)] truncate max-w-[170px]">
                            {activeOrderInfo.razorpayOrderId}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-1 border-t border-[var(--border)]">
                        <span className="text-[var(--muted-fg)] font-medium">Payment Status</span>
                        <span className="text-amber-600 font-bold text-[11px] flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping inline-block" />
                          Awaiting Authorization
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 text-left flex items-start gap-2">
                      <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        Do not refresh or close this tab. Once authorized, your transaction will be confirmed automatically.
                      </span>
                    </div>

                    <div className="space-y-2 pt-1">
                      <button
                        onClick={() => {
                          const addr = addresses[selectedAddressIdx] || addresses[0];
                          if (addr) handleRazorpayPayment(addr);
                        }}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-full py-2.5 text-xs font-black shadow transition-all flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Re-open Payment Window</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsProcessingPayment(false);
                          setPaymentStage('idle');
                        }}
                        className="w-full bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--fg)] border border-[var(--border)] rounded-full py-2 text-xs font-bold transition-all cursor-pointer"
                      >
                        Cancel & Choose Different Method
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. VERIFYING STAGE */}
                {paymentStage === 'verifying' && (
                  <div className="space-y-5 py-2">
                    <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-4 border-emerald-500/30 border-t-emerald-600 animate-spin" />
                      <ShieldCheck className="w-7 h-7 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-[var(--fg)]">Verifying your payment...</h3>
                      <p className="text-xs text-[var(--muted-fg)] mt-0.5">
                        Authenticating HMAC signature and validating order with backend servers...
                      </p>
                    </div>

                    {/* Transaction Step Timeline */}
                    <div className="bg-[var(--muted)] border border-[var(--border)] rounded-xl p-4 text-left space-y-3">
                      <div className="flex items-center gap-3 text-xs font-extrabold text-emerald-600">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center text-[10px]">✓</span>
                        <span>Payment Initiated</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-extrabold text-emerald-600">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center text-[10px]">✓</span>
                        <span>Payment Processing</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-black text-amber-600 animate-pulse">
                        <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600 flex items-center justify-center text-[10px]">●</span>
                        <span>Payment Verification</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-semibold text-[var(--muted-fg)] opacity-50">
                        <span className="w-5 h-5 rounded-full border border-[var(--border)] flex items-center justify-center text-[10px]">○</span>
                        <span>Order Confirmation</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. SUCCESS STAGE */}
                {paymentStage === 'success' && (
                  <div className="space-y-5 py-2">
                    {/* Checkmark Visual */}
                    <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30">
                        <Check className="w-9 h-9 stroke-[3]" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <h2 className="text-xl font-black text-[var(--fg)] flex items-center justify-center gap-2">
                        <span className="text-emerald-600">✓</span> Payment Successful
                      </h2>
                      <p className="text-sm font-semibold text-[var(--muted-fg)]">
                        Payment of <strong className="text-emerald-600">₹{completedOrder?.amount || total}</strong> received successfully.
                      </p>
                    </div>

                    {/* Order & Payment IDs */}
                    <div className="bg-[var(--muted)] border border-[var(--border)] rounded-xl p-3.5 text-left text-xs space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--muted-fg)] font-medium">Order ID:</span>
                        <code className="font-mono font-bold text-[var(--fg)] bg-[var(--card)] px-2 py-0.5 rounded border border-[var(--border)]">
                          {completedOrder?.orderId ? (completedOrder.orderId.startsWith('ORD-') ? completedOrder.orderId : `ORD-${completedOrder.orderId.replace(/^ORD/, '')}`) : `ORD-${Math.floor(100000 + Math.random() * 900000)}`}
                        </code>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--muted-fg)] font-medium">Payment ID:</span>
                        <code className="font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-[var(--card)] px-2 py-0.5 rounded border border-[var(--border)] truncate max-w-[200px]" title={completedOrder?.transactionId}>
                          {completedOrder?.transactionId ? (completedOrder.transactionId.startsWith('PAY-') ? completedOrder.transactionId : (completedOrder.transactionId.startsWith('pay_') ? `PAY-${completedOrder.transactionId.replace(/^pay_/, '')}` : completedOrder.transactionId)) : `PAY-${Date.now()}`}
                        </code>
                      </div>
                    </div>

                    {/* Order Confirmed Section */}
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-left flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-black text-emerald-900 dark:text-emerald-200 uppercase tracking-wider">
                          Order Confirmed
                        </h4>
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-0.5">
                          Estimated express delivery: <strong>Today within 45–90 Minutes</strong>
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-2 pt-1">
                      <button
                        onClick={() => {
                          const addr = completedOrder?.selectedAddress || addresses[selectedAddressIdx];
                          onConfirmOrder(addr, completedOrder?.paymentMethod || 'Online Payment', 'Paid', completedOrder?.transactionId || '');
                        }}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-full py-3 text-xs font-black shadow-lg transition-all flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
                      >
                        <span>Track Order & View Details →</span>
                      </button>

                      <button
                        onClick={() => {
                          const addr = completedOrder?.selectedAddress || addresses[selectedAddressIdx];
                          onConfirmOrder(addr, completedOrder?.paymentMethod || 'Online Payment', 'Paid', completedOrder?.transactionId || '');
                        }}
                        className="w-full bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--fg)] border border-[var(--border)] rounded-full py-2.5 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>Continue Shopping</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. FAILED STAGE */}
                {paymentStage === 'failed' && (
                  <div className="space-y-5 py-2">
                    <div className="w-16 h-16 mx-auto rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 flex items-center justify-center">
                      <AlertTriangle className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-xl font-black text-[var(--fg)]">Payment Failed</h2>
                      <p className="text-xs text-[var(--muted-fg)]">
                        Your payment could not be completed.
                      </p>
                    </div>

                    {stageError && (
                      <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-medium text-rose-700 dark:text-rose-300 text-left">
                        ⚠️ {stageError}
                      </div>
                    )}

                    <div className="space-y-2 pt-2">
                      <button
                        onClick={() => {
                          setPaymentStage('idle');
                          const addr = addresses[selectedAddressIdx];
                          if (addr) handleRazorpayPayment(addr);
                        }}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-full py-3 text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Try Again</span>
                      </button>

                      <button
                        onClick={() => {
                          setSelectedPayment('cod');
                          setPaymentStage('idle');
                        }}
                        className="w-full bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--fg)] border border-[var(--border)] rounded-full py-2.5 text-xs font-bold transition-all cursor-pointer"
                      >
                        Choose Cash on Delivery (COD) Instead
                      </button>
                    </div>
                  </div>
                )}

                {/* 5. CANCELLED STAGE */}
                {paymentStage === 'cancelled' && (
                  <div className="space-y-5 py-2">
                    <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600 flex items-center justify-center">
                      <X className="w-8 h-8 stroke-[2.5]" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-xl font-black text-[var(--fg)]">Payment Cancelled</h2>
                      <p className="text-xs text-[var(--muted-fg)]">
                        Your payment was not completed.
                      </p>
                    </div>

                    <div className="space-y-2 pt-2">
                      <button
                        onClick={() => {
                          setPaymentStage('idle');
                          const addr = addresses[selectedAddressIdx];
                          if (addr) handleRazorpayPayment(addr);
                        }}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-full py-3 text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Try Again</span>
                      </button>

                      <button
                        onClick={() => setPaymentStage('idle')}
                        className="w-full bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--fg)] border border-[var(--border)] rounded-full py-2.5 text-xs font-bold transition-all cursor-pointer"
                      >
                        Back to Checkout
                      </button>
                    </div>
                  </div>
                )}

                {/* 6. PENDING STAGE */}
                {paymentStage === 'pending' && (
                  <div className="space-y-5 py-2">
                    <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600 flex items-center justify-center">
                      <Clock className="w-8 h-8 animate-pulse" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-xl font-black text-[var(--fg)]">Payment Verification Pending</h2>
                      <p className="text-xs text-[var(--muted-fg)]">
                        We are still waiting for confirmation from the payment provider.
                      </p>
                    </div>

                    <div className="p-3 bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300 text-left">
                      ⏳ Your payment request is in review. We will update your order status as soon as confirmation is received.
                    </div>

                    <div className="space-y-2 pt-1">
                      <button
                        onClick={() => setPaymentStage('verifying')}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-full py-3 text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Check Verification Status</span>
                      </button>

                      <button
                        onClick={() => setPaymentStage('idle')}
                        className="w-full bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--fg)] border border-[var(--border)] rounded-full py-2.5 text-xs font-bold transition-all cursor-pointer"
                      >
                        Back to Checkout
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Direct Live UPI / Online Payment Gateway with Server Verification */}
      <AnimatePresence>
        {isUpiGatewayOpen && (
          <UpiPaymentGatewayModal
            isOpen={isUpiGatewayOpen}
            paymentApp={selectedPayment}
            orderData={{
              items: cartItems,
              subtotal,
              delivery: finalDelivery,
              total,
              couponApplied: appliedCoupon || undefined,
              discountApplied: couponDiscount > 0 ? couponDiscount : undefined,
              selectedAddress: addresses[selectedAddressIdx] || addresses[0],
              userId: user?.id,
              userEmail: user?.email,
              userName: user?.name,
              phone: user?.phone
            }}
            onPaymentVerified={handleUpiPaymentVerified}
            onClose={() => setIsUpiGatewayOpen(false)}
            onSwitchToCod={() => {
              setSelectedPayment('cod');
              setIsUpiGatewayOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
