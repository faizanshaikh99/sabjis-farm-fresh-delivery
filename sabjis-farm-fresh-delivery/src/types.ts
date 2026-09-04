/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CartItem {
  id: number;
  name: string;
  qty: number;
  sp: number;
  emoji: string;
  weight: string;
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

export interface Product {
  id: number;
  name: string;
  cat: string;
  type: string; // 'all', 'organic', 'deal'
  cp: number;   // Cost price
  sp: number;   // Selling price
  weight: string;
  discount: string; // e.g., '-10%', '-15%', or empty
  img: string;
  images?: (ProductImageItem | string)[];
  emoji: string;
  rating: number;
  reviews: number;
  stockQty: number;
  lowAt: number;
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
  qty: number;
  sp: number;
  emoji?: string;
}

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
  status: 'processing' | 'confirmed' | 'packing' | 'dispatched' | 'delivered' | 'cancelled';
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

