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
