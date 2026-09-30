/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CanonicalOrderStatus =
  | 'New Orders'
  | 'Confirmed'
  | 'Preparing'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled';

export const ORDER_STATUSES: readonly CanonicalOrderStatus[] = [
  'New Orders',
  'Confirmed',
  'Preparing',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
] as const;

/**
 * Normalizes any legacy or variant status string into one of the 6 canonical order statuses:
 * 1. New Orders
 * 2. Confirmed
 * 3. Preparing
 * 4. Out for Delivery
 * 5. Delivered
 * 6. Cancelled
 */
export function normalizeOrderStatus(status: string | undefined | null): CanonicalOrderStatus {
  if (!status) return 'New Orders';
  const s = status.trim().toLowerCase().replace(/[-_]/g, ' ');

  if (
    s === 'new orders' ||
    s === 'new order' ||
    s === 'new' ||
    s === 'processing' ||
    s === 'placed' ||
    s === 'pending' ||
    s === 'order registered'
  ) {
    return 'New Orders';
  }

  if (s === 'confirmed' || s === 'approved' || s === 'approved & sourced') {
    return 'Confirmed';
  }

  if (
    s === 'preparing' ||
    s === 'packing' ||
    s === 'packed' ||
    s === 'processing order' ||
    s === 'handpicked & packed'
  ) {
    return 'Preparing';
  }

  if (
    s === 'out for delivery' ||
    s === 'dispatched' ||
    s === 'shipping' ||
    s === 'in transit' ||
    s === 'on the way' ||
    s === 'in route'
  ) {
    return 'Out for Delivery';
  }

  if (s === 'delivered' || s === 'completed' || s === 'handed over') {
    return 'Delivered';
  }

  if (s === 'cancelled' || s === 'canceled' || s === 'rejected') {
    return 'Cancelled';
  }

  return 'New Orders';
}

export interface OrderStatusMeta {
  id: CanonicalOrderStatus;
  label: CanonicalOrderStatus;
  stepNumber: number; // 1 to 5, 0 for Cancelled
  color: 'amber' | 'blue' | 'purple' | 'indigo' | 'emerald' | 'rose';
  badgeClass: string;
  pillClass: string;
  borderClass: string;
  dotClass: string;
  bgLightClass: string;
  emoji: string;
  description: string;
  nextStatus: CanonicalOrderStatus | null;
  nextActionLabel: string | null;
}

export function getOrderStatusMeta(status: string | undefined | null): OrderStatusMeta {
  const norm = normalizeOrderStatus(status);
  switch (norm) {
    case 'New Orders':
      return {
        id: 'New Orders',
        label: 'New Orders',
        stepNumber: 1,
        color: 'amber',
        badgeClass:
          'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800',
        pillClass:
          'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300/60 dark:border-amber-700/60',
        borderClass: 'border-amber-400 dark:border-amber-600',
        dotClass: 'bg-amber-500',
        bgLightClass: 'bg-amber-50/50 dark:bg-amber-950/20',
        emoji: '🆕',
        description: 'Newly received order awaiting store manager review & confirmation',
        nextStatus: 'Confirmed',
        nextActionLabel: 'Confirm Order',
      };
    case 'Confirmed':
      return {
        id: 'Confirmed',
        label: 'Confirmed',
        stepNumber: 2,
        color: 'blue',
        badgeClass:
          'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800',
        pillClass:
          'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-300/60 dark:border-blue-700/60',
        borderClass: 'border-blue-400 dark:border-blue-600',
        dotClass: 'bg-blue-500',
        bgLightClass: 'bg-blue-50/50 dark:bg-blue-950/20',
        emoji: '✅',
        description: 'Order confirmed and fresh harvest reserved from cold locker',
        nextStatus: 'Preparing',
        nextActionLabel: 'Start Preparing',
      };
    case 'Preparing':
      return {
        id: 'Preparing',
        label: 'Preparing',
        stepNumber: 3,
        color: 'purple',
        badgeClass:
          'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/60 dark:text-purple-200 dark:border-purple-800',
        pillClass:
          'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-300/60 dark:border-purple-700/60',
        borderClass: 'border-purple-400 dark:border-purple-600',
        dotClass: 'bg-purple-500',
        bgLightClass: 'bg-purple-50/50 dark:bg-purple-950/20',
        emoji: '📦',
        description: 'Veggies being handpicked, weighed, sanitized & packed',
        nextStatus: 'Out for Delivery',
        nextActionLabel: 'Dispatch for Delivery',
      };
    case 'Out for Delivery':
      return {
        id: 'Out for Delivery',
        label: 'Out for Delivery',
        stepNumber: 4,
        color: 'indigo',
        badgeClass:
          'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800',
        pillClass:
          'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-300/60 dark:border-indigo-700/60',
        borderClass: 'border-indigo-400 dark:border-indigo-600',
        dotClass: 'bg-indigo-500',
        bgLightClass: 'bg-indigo-50/50 dark:bg-indigo-950/20',
        emoji: '🚚',
        description: 'Express delivery rider en route with order to doorstep',
        nextStatus: 'Delivered',
        nextActionLabel: 'Mark as Delivered',
      };
    case 'Delivered':
      return {
        id: 'Delivered',
        label: 'Delivered',
        stepNumber: 5,
        color: 'emerald',
        badgeClass:
          'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800',
        pillClass:
          'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300/60 dark:border-emerald-700/60',
        borderClass: 'border-emerald-400 dark:border-emerald-600',
        dotClass: 'bg-emerald-500',
        bgLightClass: 'bg-emerald-50/50 dark:bg-emerald-950/20',
        emoji: '🎉',
        description: 'Order successfully delivered to the customer doorstep',
        nextStatus: null,
        nextActionLabel: null,
      };
    case 'Cancelled':
      return {
        id: 'Cancelled',
        label: 'Cancelled',
        stepNumber: 0,
        color: 'rose',
        badgeClass:
          'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800',
        pillClass:
          'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-300/60 dark:border-rose-700/60',
        borderClass: 'border-rose-400 dark:border-rose-600',
        dotClass: 'bg-rose-500',
        bgLightClass: 'bg-rose-50/50 dark:bg-rose-950/20',
        emoji: '❌',
        description: 'Order cancelled by customer or administrator',
        nextStatus: null,
        nextActionLabel: null,
      };
  }
}

/**
 * Authoritative sort for orders: Newest → Oldest based on actual backend/database creation timestamp.
 * Handles ISO date strings, Unix millisecond timestamps, or date objects.
 * Do not rely only on frontend array order.
 */
export function sortOrdersNewestFirst<T = any>(ordersList: T[]): T[] {
  if (!Array.isArray(ordersList)) return [];
  return [...ordersList].sort((a: any, b: any) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    // Newest first (descending: larger timestamp comes first)
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    // Deterministic secondary sort by ID descending if timestamps are identical
    const idA = a.id !== undefined ? String(a.id) : '';
    const idB = b.id !== undefined ? String(b.id) : '';
    return idB.localeCompare(idA, undefined, { numeric: true });
  });
}

export type CanonicalPaymentStatus =
  | 'Pending'
  | 'PENDING_VERIFICATION'
  | 'Paid'
  | 'Failed'
  | 'Rejected'
  | 'Cancelled'
  | 'Refunded'
  | 'Partially Refunded';

export function normalizePaymentStatus(status: string | undefined | null): CanonicalPaymentStatus {
  if (!status) return 'Pending';
  const s = status.trim().toUpperCase().replace(/[-\s]/g, '_');
  if (s === 'PENDING_VERIFICATION' || s === 'VERIFICATION_PENDING') {
    return 'PENDING_VERIFICATION';
  }
  if (s === 'PAID' || s === 'SUCCESS' || s === 'CAPTURED') {
    return 'Paid';
  }
  if (s === 'FAILED' || s === 'FAILURE' || s === 'DECLINED') {
    return 'Failed';
  }
  if (s === 'REJECTED') {
    return 'Rejected';
  }
  if (s === 'CANCELLED' || s === 'CANCELED') {
    return 'Cancelled';
  }
  if (s === 'REFUNDED') {
    return 'Refunded';
  }
  if (s === 'PARTIALLY_REFUNDED') {
    return 'Partially Refunded';
  }
  return 'Pending';
}

export interface PaymentStatusMeta {
  id: CanonicalPaymentStatus;
  label: string;
  badgeClass: string;
  pillClass: string;
  dotClass: string;
  emoji: string;
  description: string;
}

export function getPaymentStatusMeta(status: string | undefined | null, paymentMethod?: string): PaymentStatusMeta {
  const norm = normalizePaymentStatus(status);
  const isCod = (paymentMethod || '').toLowerCase().includes('cash on delivery') || (paymentMethod || '').toLowerCase() === 'cod';

  switch (norm) {
    case 'PENDING_VERIFICATION':
      return {
        id: 'PENDING_VERIFICATION',
        label: 'Verification Pending',
        badgeClass: 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/70 dark:text-purple-200 dark:border-purple-800',
        pillClass: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-300/60 dark:border-purple-700/60',
        dotClass: 'bg-purple-500 animate-pulse',
        emoji: '⏳',
        description: 'Payment reference / screenshot submitted. Awaiting admin bank verification.',
      };
    case 'Paid':
      return {
        id: 'Paid',
        label: 'Paid',
        badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-800',
        pillClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300/60 dark:border-emerald-700/60',
        dotClass: 'bg-emerald-500',
        emoji: '✅',
        description: 'Payment verified and deposited to merchant account.',
      };
    case 'Pending':
      return {
        id: 'Pending',
        label: isCod ? 'Pending Collection (COD)' : 'Payment Pending',
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-800',
        pillClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300/60 dark:border-amber-700/60',
        dotClass: 'bg-amber-500',
        emoji: isCod ? '💵' : '⏱️',
        description: isCod ? 'Cash to be collected upon doorstep delivery handover.' : 'Payment pending checkout completion.',
      };
    case 'Failed':
      return {
        id: 'Failed',
        label: 'Payment Failed',
        badgeClass: 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-800',
        pillClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-300/60 dark:border-rose-700/60',
        dotClass: 'bg-rose-500',
        emoji: '❌',
        description: 'Payment transaction failed or was declined by issuing bank.',
      };
    case 'Rejected':
      return {
        id: 'Rejected',
        label: 'Payment Rejected',
        badgeClass: 'bg-red-100 text-red-900 border-red-300 dark:bg-red-950/70 dark:text-red-200 dark:border-red-800',
        pillClass: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-300/60 dark:border-red-700/60',
        dotClass: 'bg-red-500',
        emoji: '⚠️',
        description: 'Payment reference rejected by store admin (e.g. invalid UTR or uncredited).',
      };
    case 'Refunded':
      return {
        id: 'Refunded',
        label: 'Refunded',
        badgeClass: 'bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700',
        pillClass: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-300/60 dark:border-slate-700/60',
        dotClass: 'bg-slate-500',
        emoji: '💸',
        description: 'Payment fully refunded back to original payment method.',
      };
    case 'Partially Refunded':
      return {
        id: 'Partially Refunded',
        label: 'Partially Refunded',
        badgeClass: 'bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-950/70 dark:text-teal-200 dark:border-teal-800',
        pillClass: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-300/60 dark:border-teal-700/60',
        dotClass: 'bg-teal-500',
        emoji: '🪙',
        description: 'Partial amount refunded to customer.',
      };
    case 'Cancelled':
      return {
        id: 'Cancelled',
        label: 'Cancelled',
        badgeClass: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700',
        pillClass: 'bg-gray-500/15 text-gray-700 dark:text-gray-300 border-gray-300/60 dark:border-gray-700/60',
        dotClass: 'bg-gray-400',
        emoji: '🚫',
        description: 'Payment intent cancelled before completion.',
      };
  }
}
