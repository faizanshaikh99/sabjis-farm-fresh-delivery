/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CartItem {
  id: number;
  cartKey?: string;
  name: string;
  qty: number;
  sp: number;
  emoji: string;
  weight: string;
  weightInGrams?: number;
  baseSp?: number;
  baseWeight?: string;
  stockQty?: number;
  img?: string;
}

export interface Category {
  id: string;
  label: string;
  emoji: string;
}

export interface ProductImageItem {
  id: string;
  url: string;
  tag?: string; // e.g., 'Cover', 'Fresh Harvest', 'Packaging', 'Close-up', 'Farm Sourced'
  name?: string; // optional image title
  isConfirmed?: boolean; // whether confirmed by admin if flagged
  isMatch?: boolean; // AI validation match result
  confidence?: number;
  detectedObject?: string;
  warning?: string | null;
}

export interface WeightSlab {
  id?: string;
  grams: number;         // exact normalized weight in grams, e.g. 500, 1000
  weightLabel: string;   // e.g. "500g" or "1 kg"
  price: number;         // Admin-defined price in ₹ (takes highest priority)
  enabled?: boolean;     // Enable / disable slab toggle (defaults to true if undefined)
}

export interface Product {
  id: number;
  name: string;
  cat: string;
  type: string; // 'all', 'organic', 'deal'
  cp: number;   // Cost price
  sp: number;   // Selling price (Base Price ₹/kg)
  basePricePerKg?: number; // Base price per kg
  base_price_per_kg?: number; // Database alias
  unit?: string; // Selling unit: 'kg' | 'piece' | 'bunch' | 'packet' | 'dozen' | etc.
  weight: string;
  discount: string; // e.g., '-10%', '-15%', or empty
  img: string;
  images?: (ProductImageItem | string)[];
  emoji: string;
  rating: number;
  reviews: number;
  stockQty: number;
  lowAt: number;
  pricingMode?: 'auto' | 'slabs';
  weightSlabs?: WeightSlab[]; // Weight-price slabs
  weight_slabs?: WeightSlab[]; // Database alias
}

export interface Address {
  label: string;
  flat: string;
  street: string;
  area: string;
  pin: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  password?: string;
  role: 'user' | 'admin';
  addresses: Address[];
  joinedAt?: string;
}

export interface OrderItem {
  id: number;
  name: string;
  vegetableName?: string;
  // Minimum required fields:
  weightInGrams?: number;
  weight_in_grams?: number;
  weightLabel?: string;
  weight_label?: string;
  pricingType?: 'slab' | 'base_rate' | 'unit' | string;
  pricing_type?: string;
  actualPurchasedPrice?: number;
  actual_purchased_price?: number;
  quantity?: number;
  itemTotal?: number;
  item_total?: number;
  // Backward compatibility aliases:
  qty?: number;
  sp?: number; // Historical purchased unit price
  price?: number; // Historical purchased unit price
  lineTotal?: number;
  emoji?: string;
  weight?: string; // Historical purchased weight, e.g. '750g' or '1 kg'
  formulaText?: string;
  img?: string;
}

export type OrderStatus =
  | 'New Orders'
  | 'Confirmed'
  | 'Preparing'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled'
  | 'processing'
  | 'packing'
  | 'dispatched'
  | string;

export interface Order {
  id: string;
  userId: string;
  userEmail: string;
  userName?: string;
  phone?: string;
  items: OrderItem[];
  address: string;
  payment: string;
  paymentStatus: 'Pending' | 'Paid' | 'Failed' | 'Rejected' | 'Refunded' | 'Partially Refunded';
  transactionId: string;
  subtotal: number;
  delivery: number;
  total: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt?: string;
  trackingUpdates?: { status: string; time: string; desc: string }[];
  upiIdUsed?: string;
  utr?: string;
  screenshotUrl?: string;
  adminRemarks?: string;
  deliveryInstructions?: string;
  couponApplied?: string;
  discountApplied?: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  paymentGateway?: string;
  refundId?: string;
  refundStatus?: string;
  refundAmount?: number;
  refundReason?: string;
  paymentDiscountMethod?: string;
  paymentDiscountType?: 'percent' | 'fixed';
  paymentDiscountValue?: number;
  paymentDiscountAmount?: number;
  paymentDiscountLabel?: string;
  paymentDiscountMinOrder?: number | null;
  paymentDiscountMaxDiscount?: number | null;
  totalDiscount?: number;
}

export interface PaymentMethodDiscount {
  id: string;
  paymentMethod: string; // 'cod' | 'gpay' | 'phonepe' | 'paytm' | 'upi' | 'card' | 'netbanking' | 'wallets'
  paymentMethodName: string; // e.g. 'Cash on Delivery (COD)', 'Google Pay', etc.
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minOrder?: number | null; // Optional: empty/null = no minimum order limit
  maxDiscount?: number | null; // Optional: empty/null = no cap for percentage discount
  startDate?: string | null; // Optional ISO date/time
  endDate?: string | null; // Optional ISO date/time
  status: 'active' | 'inactive';
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentSettings {
  businessName: string;
  upiId: string;
  qrCodeUrl: string;
  qrCodeFileName?: string;
  qrCodeDataUrl?: string;
  qrCodeUploaded?: boolean;
  qrCodeUploadedAt?: string | null;
  instructions: string;
  enableUpi: boolean;
  enableCod: boolean;
  enableRazorpay?: boolean;
  autoApproveUpi?: boolean;
  razorpayKeyIdConfigured?: boolean;
}

export interface Review {
  id: number;
  authorName: string;
  location?: string;
  rating: number;
  body: string;
  createdAt: string;
}

export interface Offer {
  id: number;
  title: string;
  desc: string;
  tag: string;
  tagColor: string;
  img: string;
}

export interface BusinessSettings {
  minFreeDelivery?: number;
  standardShipping?: number;
  gstPercentage?: number;
  operationalHoursStart?: string;
  operationalHoursEnd?: string;
  isOpen?: boolean;
  supportPhone?: string;
  address?: string;
  businessName?: string;
  supportEmail?: string;
  website?: string;
  gstNumber?: string;
  fssaiLicense?: string;
  businessRegistrationNumber?: string;
  enableIgBanner?: boolean;
  igProfileUrl?: string;
  igBannerText?: string;
}

export interface Coupon {
  code: string;
  discount: number;
  minOrder: number;
  usage?: number;
  type: 'flat' | 'percent' | 'free_delivery' | string;
  expiry?: string;
  maxPerCustomer?: number | string;
}

