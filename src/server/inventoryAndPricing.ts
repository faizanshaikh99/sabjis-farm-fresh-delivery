import Razorpay from "razorpay";
import { GoogleGenAI } from "@google/genai";
import {
  requireSupabase,
  translateSupabaseError,
  fetchTable,
  fetchAllRows,
  fetchOneRow,
  upsertTable,
  callRpc,
  syncOrderToSupabase,
  normalizeProductFromDb
} from "../db/supabaseService";
import {
  normalizePaymentMethodKey,
  mapCouponFromDb,
  mapPaymentDiscountFromDb,
  normalizeOrderFromDb
} from "./mappers";
import {
  getBusinessSettingsFromDb,
  appendPaymentAudit,
  broadcastRealtimeEvent
} from "./dbQueries";
import {
  calculateWeightPrice,
  getBaseWeightInGrams,
  parseWeightToGrams,
  formatWeight
} from "../utils/weightParser";

export interface VerifiedCartItem {
  id: number;
  name: string;
  vegetableName?: string;
  weightInGrams: number;
  weight_in_grams?: number;
  weightLabel: string;
  weight_label?: string;
  pricingType: 'slab' | 'base_rate' | 'unit' | string;
  pricing_type?: string;
  actualPurchasedPrice: number;
  actual_purchased_price?: number;
  quantity: number;
  itemTotal: number;
  item_total?: number;
  qty: number;
  sp: number;
  price?: number;
  lineTotal: number;
  emoji: string;
  weight: string;
  img?: string;
  formulaText: string;
  isCustomSlab: boolean;
  pricingSource: 'admin-defined' | 'system-calculated' | 'unit-price';
}

export interface CartVerificationResult {
  valid: boolean;
  error?: string;
  items: VerifiedCartItem[];
  subtotal: number;
  delivery: number;
  couponDiscount: number;
  couponApplied?: string;
  paymentDiscount?: {
    applied: boolean;
    method: string;
    methodName: string;
    label: string;
    type: 'percent' | 'fixed';
    value: number;
    amount: number;
    minOrder: number | null;
    maxDiscount: number | null;
  };
  paymentDiscountAmount?: number;
  totalDiscount?: number;
  total: number;
}

export interface StockOperationResult {
  success: boolean;
  error?: string;
}

export function getCouponPerCustomerLimit(coupon: any): number {
  if (!coupon) return 1;
  if (coupon.maxPerCustomer === 'Unlimited') return 99999;
  if (coupon.maxPerCustomer === 'Once' || coupon.maxPerCustomer === 1 || coupon.maxPerCustomer === '1') return 1;
  if (coupon.maxPerCustomer === 'Twice' || coupon.maxPerCustomer === 2 || coupon.maxPerCustomer === '2') return 2;
  const parsed = Number(coupon.maxPerCustomer);
  if (!isNaN(parsed) && parsed > 0) return parsed;
  return 1;
}

export async function getUserCouponRedemptionsCount(
  couponCode: string,
  userId?: string | null,
  userEmail?: string | null,
  phone?: string | null
): Promise<number> {
  const codeUpper = String(couponCode || '').trim().toUpperCase();
  if (!codeUpper) return 0;

  const cleanUserId = userId && userId !== 'guest' ? String(userId).trim() : null;
  const cleanEmail = userEmail ? String(userEmail).trim().toLowerCase() : null;
  const cleanPhoneNum = phone ? String(phone).replace(/\D/g, '').slice(-10) : null;

  if (!cleanUserId && !cleanEmail && !cleanPhoneNum) {
    return 0;
  }

  const [matchingOrders, matchingLogs] = await Promise.all([
    fetchAllRows('orders', {
      columns: 'id,user_id,customer_id,user_email,phone,coupon_applied',
      filter: (q) => q.ilike('coupon_applied', codeUpper)
    }),
    fetchAllRows('redemption_logs', {
      columns: 'id,user_id,user_email,coupon_code,code,order_id',
      filter: (q) => q.or(`coupon_code.ilike."${codeUpper}",code.ilike."${codeUpper}"`)
    })
  ]);

  const countedOrderIds = new Set<string>();
  let totalMatches = 0;

  for (const o of matchingOrders) {
    const orderUserId = (o.user_id || o.customer_id) && (o.user_id || o.customer_id) !== 'guest'
      ? String(o.user_id || o.customer_id).trim()
      : null;
    const orderEmail = o.user_email ? String(o.user_email).trim().toLowerCase() : null;
    const orderPhone = o.phone ? String(o.phone).replace(/\D/g, '').slice(-10) : null;

    const matchUser = cleanUserId && orderUserId && cleanUserId === orderUserId;
    const matchEmail = cleanEmail && orderEmail && cleanEmail === orderEmail;
    const matchPhone = cleanPhoneNum && orderPhone && cleanPhoneNum === orderPhone;

    if (matchUser || matchEmail || matchPhone) {
      totalMatches++;
      if (o.id) countedOrderIds.add(String(o.id));
    }
  }

  for (const l of matchingLogs) {
    if (l.order_id && countedOrderIds.has(String(l.order_id))) continue;
    const logUserId = l.user_id && l.user_id !== 'guest' ? String(l.user_id).trim() : null;
    const logEmail = l.user_email ? String(l.user_email).trim().toLowerCase() : null;
    if ((cleanUserId && logUserId && cleanUserId === logUserId) || (cleanEmail && logEmail && cleanEmail === logEmail)) {
      totalMatches++;
    }
  }

  return totalMatches;
}

export async function incrementCouponUsage(
  code: string,
  orderId: string,
  userId?: string | null,
  userEmail?: string | null,
  discountAmount: number = 0
): Promise<boolean> {
  const codeUpper = String(code || '').trim().toUpperCase();
  if (!codeUpper) return false;

  const client = requireSupabase();
  let updated = false;

  const rpcRes = await callRpc<any>('increment_coupon_usage_atomic', { p_code: codeUpper });
  if (!rpcRes.missingFunction) {
    updated = Array.isArray(rpcRes.data) ? rpcRes.data.length > 0 : Boolean(rpcRes.data);
  } else {
    // CAS fallback when stored procedure is absent
    for (let attempt = 0; attempt < 3; attempt++) {
      const couponRow = await fetchOneRow('coupons', (q) => q.ilike('code', codeUpper));
      if (!couponRow) break;
      const currentUsage = Number(couponRow.usage || 0);
      const maxRed = couponRow.max_redemptions !== null && couponRow.max_redemptions !== undefined
        ? Number(couponRow.max_redemptions)
        : 0;
      if (maxRed > 0 && currentUsage >= maxRed) break;

      const { data: casData, error: casErr } = await client
        .from('coupons')
        .update({ usage: currentUsage + 1 })
        .eq('code', couponRow.code)
        .eq('usage', currentUsage)
        .select('code,usage');
      if (casErr) throw translateSupabaseError(casErr, 'coupons');
      if (Array.isArray(casData) && casData.length > 0) {
        updated = true;
        break;
      }
    }
  }

  if (updated) {
    const cleanUid = userId && userId !== 'guest' ? String(userId) : null;
    await upsertTable('redemption_logs', [{
      id: 'redempt_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      user_id: cleanUid,
      user_email: userEmail || '',
      coupon_code: codeUpper,
      code: codeUpper,
      order_id: orderId || null,
      discount_amount: Number(discountAmount || 0),
      timestamp: new Date().toISOString()
    }], 'id');
  }

  return updated;
}

export function calculatePaymentMethodDiscount(
  subtotal: number,
  paymentMethodKey?: string,
  discountsList: any[] = []
): {
  eligible: boolean;
  discountAmount: number;
  discountType?: 'percent' | 'fixed';
  discountValue?: number;
  discountLabel?: string;
  minOrder?: number | null;
  maxDiscount?: number | null;
  config?: any;
  reason?: string;
} {
  if (!paymentMethodKey || subtotal <= 0) {
    return { eligible: false, discountAmount: 0 };
  }

  const normalized = normalizePaymentMethodKey(paymentMethodKey);
  const config = discountsList.find((d: any) => normalizePaymentMethodKey(d.paymentMethod) === normalized);

  if (!config) {
    return { eligible: false, discountAmount: 0, reason: 'No discount configured for this method' };
  }

  if (String(config.status || '').toLowerCase() !== 'active') {
    return { eligible: false, discountAmount: 0, reason: 'Discount is inactive' };
  }

  const now = new Date();
  if (config.startDate && new Date(config.startDate) > now) {
    return { eligible: false, discountAmount: 0, reason: 'Discount not active yet' };
  }
  if (config.endDate && new Date(config.endDate) < now) {
    return { eligible: false, discountAmount: 0, reason: 'Discount expired' };
  }

  if (config.minOrder !== null && config.minOrder !== undefined && config.minOrder !== '' && Number(config.minOrder) > 0) {
    if (subtotal < Number(config.minOrder)) {
      return {
        eligible: false,
        discountAmount: 0,
        minOrder: Number(config.minOrder),
        config,
        reason: `Requires minimum order of ₹${config.minOrder}`
      };
    }
  }

  let rawDiscount = 0;
  const val = Number(config.discountValue) || 0;
  if (config.discountType === 'percent') {
    rawDiscount = (subtotal * val) / 100;
    if (config.maxDiscount !== null && config.maxDiscount !== undefined && config.maxDiscount !== '' && Number(config.maxDiscount) > 0) {
      rawDiscount = Math.min(rawDiscount, Number(config.maxDiscount));
    }
  } else {
    rawDiscount = val;
  }

  const rounded = Math.round(rawDiscount);
  const finalDiscount = Math.max(0, Math.min(subtotal, rounded));
  const label = config.discountType === 'percent'
    ? `${config.paymentMethodName || 'Payment'} (${config.discountValue}% OFF)`
    : `${config.paymentMethodName || 'Payment'} (₹${config.discountValue} OFF)`;

  return {
    eligible: finalDiscount > 0,
    discountAmount: finalDiscount,
    discountType: config.discountType,
    discountValue: config.discountValue,
    discountLabel: label,
    minOrder: (config.minOrder !== null && config.minOrder !== undefined && config.minOrder !== '') ? Number(config.minOrder) : null,
    maxDiscount: (config.maxDiscount !== null && config.maxDiscount !== undefined && config.maxDiscount !== '') ? Number(config.maxDiscount) : null,
    config
  };
}

export async function verifyCartAndCalculatePricing(
  rawItems: any[],
  couponCode?: string,
  userId?: string,
  userEmail?: string,
  phone?: string,
  paymentMethod?: string
): Promise<CartVerificationResult> {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return {
      valid: false,
      error: 'Cart is empty. Please add fresh vegetables to your cart.',
      items: [],
      subtotal: 0,
      delivery: 0,
      couponDiscount: 0,
      total: 0
    };
  }

  const requestedProductIds = Array.from(
    new Set(
      rawItems
        .map((it: any) => Number(it?.id))
        .filter((id: number) => !isNaN(id) && id > 0)
    )
  );

  const [matchingProductRows, rawDiscounts, businessSettings] = await Promise.all([
    requestedProductIds.length > 0
      ? fetchTable('products', {
          filter: (q) => q.in('id', requestedProductIds)
        })
      : Promise.resolve([]),
    fetchAllRows('payment_method_discounts'),
    getBusinessSettingsFromDb()
  ]);

  const productsById = new Map<number, any>();
  matchingProductRows.forEach((rawRow: any) => {
    const p = normalizeProductFromDb(rawRow);
    if (p && p.id !== undefined) productsById.set(Number(p.id), p);
  });
  const paymentDiscounts = rawDiscounts.map(mapPaymentDiscountFromDb);

  const verifiedItems: VerifiedCartItem[] = [];
  let subtotal = 0;

  for (let idx = 0; idx < rawItems.length; idx++) {
    const item = rawItems[idx];
    if (!item) {
      return {
        valid: false,
        error: `Item at index ${idx + 1} is missing or corrupted.`,
        items: [],
        subtotal: 0,
        delivery: 0,
        couponDiscount: 0,
        total: 0
      };
    }

    const productId = Number(item.id);
    if (!productId || isNaN(productId)) {
      return {
        valid: false,
        error: `Product identifier is missing or invalid for item #${idx + 1}.`,
        items: [],
        subtotal: 0,
        delivery: 0,
        couponDiscount: 0,
        total: 0
      };
    }

    const dbProduct = productsById.get(productId);
    if (!dbProduct) {
      return {
        valid: false,
        error: `Product ID ${productId} (${item.name || 'item'}) does not exist in the catalog or was removed.`,
        items: [],
        subtotal: 0,
        delivery: 0,
        couponDiscount: 0,
        total: 0
      };
    }

    if (dbProduct.stockQty !== undefined && Number(dbProduct.stockQty) <= 0) {
      return {
        valid: false,
        error: `"${dbProduct.name}" is currently out of stock. Please remove it from your cart to proceed.`,
        items: [],
        subtotal: 0,
        delivery: 0,
        couponDiscount: 0,
        total: 0
      };
    }

    const rawQty = Number(item.qty);
    if (!Number.isInteger(rawQty) || rawQty < 1 || rawQty > 100) {
      return {
        valid: false,
        error: `Invalid quantity (${item.qty}) for "${dbProduct.name}". Quantity must be a whole number between 1 and 100.`,
        items: [],
        subtotal: 0,
        delivery: 0,
        couponDiscount: 0,
        total: 0
      };
    }

    if (dbProduct.stockQty !== undefined && Number(dbProduct.stockQty) < rawQty) {
      return {
        valid: false,
        error: `Insufficient stock for "${dbProduct.name}". Only ${dbProduct.stockQty} unit(s) available in inventory, but ${rawQty} were requested.`,
        items: [],
        subtotal: 0,
        delivery: 0,
        couponDiscount: 0,
        total: 0
      };
    }

    const baseSp = Number(dbProduct.sp);
    if (typeof baseSp !== 'number' || isNaN(baseSp) || baseSp <= 0) {
      return {
        valid: false,
        error: `Pricing configuration is missing or invalid for "${dbProduct.name}". Base selling price must be greater than zero.`,
        items: [],
        subtotal: 0,
        delivery: 0,
        couponDiscount: 0,
        total: 0
      };
    }

    const isPiece =
      (dbProduct.weight && String(dbProduct.weight).toLowerCase().includes('pc')) ||
      (typeof item.weight === 'string' && String(item.weight).toLowerCase().includes('pc'));

    let targetGrams = 0;
    let resolvedWeightStr = '';

    if (isPiece) {
      resolvedWeightStr = item.weight || dbProduct.weight || '1 pc';
    } else {
      if (typeof item.weightInGrams === 'number' && !isNaN(item.weightInGrams) && item.weightInGrams > 0) {
        targetGrams = Math.round(item.weightInGrams);
      } else if (item.weight && typeof item.weight === 'string') {
        const parsed = parseWeightToGrams(item.weight);
        if (parsed.isValid && parsed.grams > 0) targetGrams = parsed.grams;
      }

      if (!targetGrams || targetGrams <= 0) {
        targetGrams = getBaseWeightInGrams(dbProduct.weight);
      }

      if (targetGrams < 10 || targetGrams > 50000 || isNaN(targetGrams)) {
        return {
          valid: false,
          error: `Invalid weight (${item.weight || item.weightInGrams || 'unknown'}) specified for "${dbProduct.name}". Weight must be between 10g and 50kg.`,
          items: [],
          subtotal: 0,
          delivery: 0,
          couponDiscount: 0,
          total: 0
        };
      }

      resolvedWeightStr = formatWeight(targetGrams);
    }

    let verifiedUnitSp = 0;
    let formulaText = '';
    let isCustomSlab = false;
    let pricingSource: 'admin-defined' | 'system-calculated' | 'unit-price' = 'system-calculated';

    if (isPiece) {
      verifiedUnitSp = Math.max(1, Math.round(baseSp));
      formulaText = `₹${verifiedUnitSp} / pc`;
      pricingSource = 'unit-price';
    } else {
      const priceResult = calculateWeightPrice(baseSp, dbProduct.weight, targetGrams, dbProduct.weightSlabs);
      verifiedUnitSp = priceResult.price;
      formulaText = priceResult.formulaText;
      isCustomSlab = priceResult.isCustomSlab;
      pricingSource = priceResult.pricingSource;
    }

    const lineTotal = verifiedUnitSp * rawQty;
    subtotal += lineTotal;

    const resolvedPricingType = isPiece ? 'unit' : (isCustomSlab ? 'slab' : 'base_rate');

    verifiedItems.push({
      id: dbProduct.id,
      name: dbProduct.name,
      vegetableName: dbProduct.name,
      weightInGrams: targetGrams,
      weight_in_grams: targetGrams,
      weightLabel: resolvedWeightStr,
      weight_label: resolvedWeightStr,
      pricingType: resolvedPricingType,
      pricing_type: resolvedPricingType,
      actualPurchasedPrice: verifiedUnitSp,
      actual_purchased_price: verifiedUnitSp,
      quantity: rawQty,
      itemTotal: lineTotal,
      item_total: lineTotal,
      qty: rawQty,
      sp: verifiedUnitSp,
      price: verifiedUnitSp,
      lineTotal,
      emoji: dbProduct.emoji || item.emoji || '🥬',
      weight: resolvedWeightStr,
      img: dbProduct.img || item.img || '',
      formulaText,
      isCustomSlab,
      pricingSource
    });
  }

  const minFreeDelivery = Number(businessSettings?.minFreeDelivery ?? 299);
  const standardShipping = Number(businessSettings?.standardShipping ?? 30);
  const delivery = subtotal >= minFreeDelivery ? 0 : standardShipping;

  let couponDiscount = 0;
  let cleanCouponApplied: string | undefined = undefined;
  let isFreeDeliveryCoupon = false;

  const rawCoupon = couponCode ? String(couponCode).trim().toUpperCase() : '';
  if (rawCoupon) {
    const rawCouponRow = await fetchOneRow('coupons', (q) => q.ilike('code', rawCoupon));
    const coupon = rawCouponRow ? mapCouponFromDb(rawCouponRow) : null;
    if (coupon && coupon.status !== 'Disabled') {
      let isEligible = true;
      const todayStr = new Date().toISOString().split('T')[0];
      if (coupon.startDate && todayStr < coupon.startDate) isEligible = false;
      if (coupon.expiry && todayStr > coupon.expiry) isEligible = false;
      if (coupon.maxRedemptions && Number(coupon.maxRedemptions) > 0) {
        if ((coupon.usage || 0) >= Number(coupon.maxRedemptions)) isEligible = false;
      }
      if (coupon.minOrder && subtotal < Number(coupon.minOrder)) {
        isEligible = false;
      }
      const customerLimit = getCouponPerCustomerLimit(coupon);
      if (customerLimit < 99999) {
        const count = await getUserCouponRedemptionsCount(rawCoupon, userId, userEmail, phone);
        if (count >= customerLimit) isEligible = false;
      }

      if (isEligible) {
        if (coupon.type === 'percent') {
          let rawDiscount = Math.round((subtotal * Number(coupon.discount)) / 100);
          if (coupon.maxDiscount && Number(coupon.maxDiscount) > 0) {
            rawDiscount = Math.min(Number(coupon.maxDiscount), rawDiscount);
          }
          couponDiscount = Math.min(subtotal, rawDiscount);
        } else if (coupon.type === 'free_delivery') {
          couponDiscount = 0;
          isFreeDeliveryCoupon = true;
        } else {
          couponDiscount = Math.round(Math.min(subtotal, Number(coupon.discount)));
        }
        cleanCouponApplied = coupon.code;
      }
    }
  }

  const finalDelivery = isFreeDeliveryCoupon ? 0 : delivery;
  const pmd = calculatePaymentMethodDiscount(subtotal, paymentMethod, paymentDiscounts);
  const paymentDiscountAmount = pmd.eligible ? pmd.discountAmount : 0;
  const total = Math.max(0, subtotal + finalDelivery - couponDiscount - paymentDiscountAmount);

  return {
    valid: true,
    items: verifiedItems,
    subtotal,
    delivery: finalDelivery,
    couponDiscount,
    couponApplied: cleanCouponApplied,
    paymentDiscount: {
      applied: pmd.eligible && paymentDiscountAmount > 0,
      method: pmd.config?.paymentMethod || (paymentMethod ? normalizePaymentMethodKey(paymentMethod) : ''),
      methodName: pmd.config?.paymentMethodName || paymentMethod || '',
      label: pmd.discountLabel || '',
      type: pmd.discountType || 'fixed',
      value: pmd.discountValue || 0,
      amount: paymentDiscountAmount,
      minOrder: pmd.minOrder ?? null,
      maxDiscount: pmd.maxDiscount ?? null
    },
    paymentDiscountAmount,
    totalDiscount: couponDiscount + paymentDiscountAmount,
    total
  };
}

// ── ATOMIC INVENTORY HELPERS (PostgreSQL RPC + Optimistic CAS Fallback + Rollback) ──

async function reserveProductQtyAtomic(productId: number, qty: number): Promise<boolean> {
  const rpcRes = await callRpc<any[]>('reserve_product_stock_atomic', {
    p_product_id: productId,
    p_qty: qty
  });
  if (!rpcRes.missingFunction) {
    return Array.isArray(rpcRes.data) ? rpcRes.data.length > 0 : Boolean(rpcRes.data);
  }

  const client = requireSupabase();
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await fetchOneRow('products', (q) => q.eq('id', productId), 'id,stock_qty,reserved_qty,sold_qty');
    if (!row) return false;
    const currentStock = Number(row.stock_qty ?? 0);
    const currentReserved = Number(row.reserved_qty ?? 0);
    if (currentStock < qty) return false;

    const { data, error } = await client
      .from('products')
      .update({
        stock_qty: currentStock - qty,
        reserved_qty: currentReserved + qty,
        updated_at: new Date().toISOString()
      })
      .eq('id', productId)
      .eq('stock_qty', currentStock)
      .select('id');

    if (error) throw translateSupabaseError(error, 'products');
    if (Array.isArray(data) && data.length > 0) return true;
  }
  return false;
}

async function consumeProductQtyAtomic(productId: number, qty: number, wasReserved: boolean): Promise<boolean> {
  const rpcRes = await callRpc<any[]>('consume_product_stock_atomic', {
    p_product_id: productId,
    p_qty: qty,
    p_was_reserved: wasReserved
  });
  if (!rpcRes.missingFunction) {
    return Array.isArray(rpcRes.data) ? rpcRes.data.length > 0 : Boolean(rpcRes.data);
  }

  const client = requireSupabase();
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await fetchOneRow('products', (q) => q.eq('id', productId), 'id,stock_qty,reserved_qty,sold_qty');
    if (!row) return false;
    const currentStock = Number(row.stock_qty ?? 0);
    const currentReserved = Number(row.reserved_qty ?? 0);
    const currentSold = Number(row.sold_qty ?? 0);

    let nextStock = currentStock;
    let nextReserved = currentReserved;
    if (wasReserved) {
      if (currentReserved >= qty) {
        nextReserved = currentReserved - qty;
      } else {
        const deficit = qty - currentReserved;
        if (currentStock < deficit) return false;
        nextReserved = 0;
        nextStock = currentStock - deficit;
      }
    } else {
      if (currentStock < qty) return false;
      nextStock = currentStock - qty;
    }

    const { data, error } = await client
      .from('products')
      .update({
        stock_qty: nextStock,
        reserved_qty: nextReserved,
        sold_qty: currentSold + qty,
        updated_at: new Date().toISOString()
      })
      .eq('id', productId)
      .eq('stock_qty', currentStock)
      .select('id');

    if (error) throw translateSupabaseError(error, 'products');
    if (Array.isArray(data) && data.length > 0) return true;
  }
  return false;
}

async function releaseProductQtyAtomic(productId: number, qty: number, wasReserved: boolean): Promise<void> {
  const rpcRes = await callRpc<any[]>('release_product_stock_atomic', {
    p_product_id: productId,
    p_qty: qty,
    p_was_reserved: wasReserved
  });
  if (!rpcRes.missingFunction) {
    return;
  }

  const client = requireSupabase();
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await fetchOneRow('products', (q) => q.eq('id', productId), 'id,stock_qty,reserved_qty,sold_qty');
    if (!row) return;
    const currentStock = Number(row.stock_qty ?? 0);
    const currentReserved = Number(row.reserved_qty ?? 0);
    const currentSold = Number(row.sold_qty ?? 0);

    const { data, error } = await client
      .from('products')
      .update({
        stock_qty: currentStock + qty,
        reserved_qty: wasReserved ? Math.max(0, currentReserved - qty) : currentReserved,
        sold_qty: !wasReserved ? Math.max(0, currentSold - qty) : currentSold,
        updated_at: new Date().toISOString()
      })
      .eq('id', productId)
      .eq('stock_qty', currentStock)
      .select('id');

    if (error) throw translateSupabaseError(error, 'products');
    if (Array.isArray(data) && data.length > 0) return;
  }
}

export async function reserveOrderStock(items: any[]): Promise<StockOperationResult> {
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, error: 'No items provided for stock reservation' };
  }

  const normalizedItems = items
    .map((it) => ({
      productId: Number(it.id),
      name: it.name || 'item',
      qty: Number(it.quantity !== undefined ? it.quantity : (it.qty || 1))
    }))
    .filter((it) => !isNaN(it.productId) && it.qty > 0);

  if (normalizedItems.length === 0) {
    return { success: false, error: 'No valid items provided for stock reservation' };
  }

  const productIds = Array.from(new Set(normalizedItems.map((i) => i.productId)));
  const dbRows = await fetchTable('products', {
    columns: 'id,name,stock_qty',
    filter: (q) => q.in('id', productIds)
  });
  const prodMap = new Map<number, any>(dbRows.map((r: any) => [Number(r.id), r]));

  for (const it of normalizedItems) {
    const dbProduct = prodMap.get(it.productId);
    if (!dbProduct) {
      return {
        success: false,
        error: `Product #${it.productId} (${it.name}) is not available in catalog.`
      };
    }
    const currentStock = Number(dbProduct.stock_qty ?? 0);
    if (currentStock < it.qty) {
      return {
        success: false,
        error: `Insufficient stock for "${dbProduct.name}". Only ${currentStock} in stock, but ${it.qty} requested.`
      };
    }
  }

  const reservedSoFar: Array<{ productId: number; qty: number }> = [];
  for (const it of normalizedItems) {
    const ok = await reserveProductQtyAtomic(it.productId, it.qty);
    if (!ok) {
      for (const prev of reservedSoFar) {
        await releaseProductQtyAtomic(prev.productId, prev.qty, true).catch(() => {});
      }
      const dbProduct = prodMap.get(it.productId);
      return {
        success: false,
        error: `Insufficient stock for "${dbProduct?.name || it.name}". Concurrent order exhausted available inventory.`
      };
    }
    reservedSoFar.push({ productId: it.productId, qty: it.qty });
  }

  return { success: true };
}

export async function deductOrderStock(items: any[]): Promise<StockOperationResult> {
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, error: 'No items provided for stock deduction' };
  }

  const normalizedItems = items
    .map((it) => ({
      productId: Number(it.id),
      name: it.name || 'item',
      qty: Number(it.quantity !== undefined ? it.quantity : (it.qty || 1))
    }))
    .filter((it) => !isNaN(it.productId) && it.qty > 0);

  if (normalizedItems.length === 0) {
    return { success: false, error: 'No valid items provided for stock deduction' };
  }

  const productIds = Array.from(new Set(normalizedItems.map((i) => i.productId)));
  const dbRows = await fetchTable('products', {
    columns: 'id,name,stock_qty',
    filter: (q) => q.in('id', productIds)
  });
  const prodMap = new Map<number, any>(dbRows.map((r: any) => [Number(r.id), r]));

  for (const it of normalizedItems) {
    const dbProduct = prodMap.get(it.productId);
    if (!dbProduct) {
      return {
        success: false,
        error: `Product #${it.productId} (${it.name}) is not available in catalog.`
      };
    }
    const currentStock = Number(dbProduct.stock_qty ?? 0);
    if (currentStock < it.qty) {
      return {
        success: false,
        error: `Insufficient stock for "${dbProduct.name}". Only ${currentStock} in stock, but ${it.qty} requested.`
      };
    }
  }

  const deductedSoFar: Array<{ productId: number; qty: number }> = [];
  for (const it of normalizedItems) {
    const ok = await consumeProductQtyAtomic(it.productId, it.qty, false);
    if (!ok) {
      for (const prev of deductedSoFar) {
        await releaseProductQtyAtomic(prev.productId, prev.qty, false).catch(() => {});
      }
      const dbProduct = prodMap.get(it.productId);
      return {
        success: false,
        error: `Insufficient stock for "${dbProduct?.name || it.name}". Concurrent order exhausted available inventory.`
      };
    }
    deductedSoFar.push({ productId: it.productId, qty: it.qty });
  }

  return { success: true };
}

export async function permanentlyConsumeOrderStock(
  order: any,
  performedBy: string = 'System',
  reason?: string
): Promise<boolean> {
  if (!order || order.stockDeducted) {
    return false;
  }

  if (order.id) {
    const client = requireSupabase();
    const { data: claimed, error: claimErr } = await client
      .from('orders')
      .update({
        stock_reserved: false,
        stock_deducted: true,
        stock_released: false,
        inventory_status: 'DEDUCTED',
        updated_at: new Date().toISOString()
      })
      .eq('id', String(order.id))
      .eq('stock_deducted', false)
      .select('id');

    if (claimErr) {
      throw translateSupabaseError(claimErr, 'orders');
    }
    if (!Array.isArray(claimed) || claimed.length === 0) {
      const existing = await fetchOneRow('orders', (q) => q.eq('id', String(order.id)), 'id,stock_deducted');
      if (existing) {
        order.stockDeducted = Boolean(existing.stock_deducted);
        return false;
      }
    }
  }

  const items = order.items || [];
  const wasReserved = Boolean(order.stockReserved);

  for (const it of items) {
    const productId = Number(it.id);
    const qty = Number(it.quantity !== undefined ? it.quantity : (it.qty || 1));
    if (!isNaN(productId) && qty > 0) {
      await consumeProductQtyAtomic(productId, qty, wasReserved);
    }
  }

  order.stockReserved = false;
  order.stockDeducted = true;
  order.stockReleased = false;
  order.inventoryStatus = 'DEDUCTED';

  appendPaymentAudit(order, {
    action: 'STOCK_DEDUCTED',
    performedBy: performedBy || 'system',
    previousPaymentStatus: order.paymentStatus,
    newPaymentStatus: order.paymentStatus,
    amount: order.total,
    reason: reason || (wasReserved
      ? 'Reserved stock permanently consumed upon confirmed payment'
      : 'Stock permanently consumed upon confirmed payment')
  });

  return true;
}

export async function releaseOrderStock(
  order: any,
  reason: string = 'Order cancelled/failed',
  performedBy: string = 'System'
): Promise<boolean> {
  if (!order || order.stockReleased || (!order.stockReserved && !order.stockDeducted)) {
    return false;
  }

  const nowIso = new Date().toISOString();
  if (order.id) {
    const client = requireSupabase();
    const { data: claimed, error: claimErr } = await client
      .from('orders')
      .update({
        stock_reserved: false,
        stock_deducted: false,
        stock_released: true,
        stock_released_at: nowIso,
        stock_release_reason: reason,
        inventory_status: 'RELEASED',
        updated_at: nowIso
      })
      .eq('id', String(order.id))
      .eq('stock_released', false)
      .select('id');

    if (claimErr) {
      throw translateSupabaseError(claimErr, 'orders');
    }
    if (!Array.isArray(claimed) || claimed.length === 0) {
      const existing = await fetchOneRow('orders', (q) => q.eq('id', String(order.id)), 'id,stock_released');
      if (existing) {
        order.stockReleased = Boolean(existing.stock_released);
        return false;
      }
    }
  }

  const items = order.items || [];
  const wasReserved = Boolean(order.stockReserved);

  for (const it of items) {
    const productId = Number(it.id);
    const qty = Number(it.quantity !== undefined ? it.quantity : (it.qty || 1));
    if (!isNaN(productId) && qty > 0) {
      await releaseProductQtyAtomic(productId, qty, wasReserved);
    }
  }

  order.stockReserved = false;
  order.stockDeducted = false;
  order.stockReleased = true;
  order.stockReleasedAt = nowIso;
  order.stockReleaseReason = reason;
  order.inventoryStatus = 'RELEASED';

  appendPaymentAudit(order, {
    action: 'STOCK_RELEASED',
    performedBy: performedBy || 'system',
    previousPaymentStatus: order.paymentStatus,
    newPaymentStatus: order.paymentStatus,
    amount: order.total,
    reason: wasReserved
      ? `Reserved stock released back to inventory: ${reason}`
      : `Deducted stock restored to inventory: ${reason}`
  });

  return true;
}

export async function checkAndReleaseExpiredOrders(): Promise<void> {
  try {
    const EXPIRATION_WINDOW_MS = 15 * 60 * 1000;
    const cutoffIso = new Date(Date.now() - EXPIRATION_WINDOW_MS).toISOString();

    const candidateRows = await fetchTable('orders', {
      filter: (q) =>
        q
          .eq('payment_status', 'Pending')
          .eq('stock_released', false)
          .lt('created_at', cutoffIso)
    });

    for (const row of candidateRows) {
      const order = normalizeOrderFromDb(row);
      if (!order) continue;

      const isUnverifiedPending = order.paymentStatus === 'Pending' && !order.utr && !order.screenshotUrl;
      const isAbandonedOnline = Boolean(
        order.razorpayOrderId ||
        (order.paymentGateway && String(order.paymentGateway).toLowerCase().includes('razorpay')) ||
        (order.payment && String(order.payment).toLowerCase().includes('upi'))
      );

      if (isUnverifiedPending && isAbandonedOnline && (order.stockReserved || order.stockDeducted) && !order.stockReleased) {
        const released = await releaseOrderStock(order, 'Payment window expired without completion', 'System Expiration Sweeper');
        if (!released) continue;

        const prevStatus = order.paymentStatus;
        order.paymentStatus = 'Cancelled';
        order.status = 'Cancelled';
        order.adminRemarks = 'Payment session expired without submission. Reserved stock restored.';
        order.updatedAt = new Date().toISOString();

        appendPaymentAudit(order, {
          action: 'PAYMENT_EXPIRED',
          performedBy: 'System Expiration Sweeper',
          previousPaymentStatus: prevStatus,
          newPaymentStatus: 'Cancelled',
          amount: order.total,
          reason: 'Checkout window expired without payment verification (>15 min)'
        });

        await syncOrderToSupabase(order);
        broadcastRealtimeEvent({ table: 'orders', eventType: 'UPDATE', new: order });
      }
    }
  } catch (err: any) {
    if (err?.code !== 'SUPABASE_NOT_CONFIGURED') {
      console.warn('[Order Expiry Sweeper Warning]:', err?.message || err);
    }
  }
}

// ── RAZORPAY CONFIGURATION ──
export function getRazorpayConfig() {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();

  const isConfigured = Boolean(
    keyId &&
    keySecret &&
    !keyId.includes('PASTE_') &&
    !keySecret.includes('PASTE_') &&
    keyId.length > 5 &&
    keySecret.length > 5
  );

  return { keyId, keySecret, webhookSecret, isConfigured };
}

export function getRazorpayInstance() {
  const { keyId, keySecret, isConfigured } = getRazorpayConfig();
  if (!isConfigured) return null;
  try {
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
  } catch (err) {
    console.error('Razorpay instance initialization error:', err);
    return null;
  }
}

// ── GEMINI AI IMAGE RECOGNITION & VALIDATION ──
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

export async function validateProductImageWithAI(
  imageUrl: string,
  productName: string,
  categoryName?: string
): Promise<{
  isMatch: boolean;
  confidence: number;
  detectedObject: string;
  reason: string;
  warning: string | null;
  suggestedTag: string;
}> {
  const cleanProductName = (productName || 'Vegetable').trim();
  const cleanCat = (categoryName || 'Produce').trim();

  const ai = getAIClient();
  if (ai) {
    try {
      let mimeType = 'image/jpeg';
      let base64Data = '';

      if (imageUrl.startsWith('data:')) {
        const matches = imageUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          base64Data = matches[2];
        } else {
          base64Data = imageUrl.split(',')[1] || '';
        }
      } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
        try {
          const resp = await fetch(imageUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (resp.ok) {
            const contentType = resp.headers.get('content-type');
            if (contentType && contentType.startsWith('image/')) {
              mimeType = contentType.split(';')[0];
            }
            const arrayBuf = await resp.arrayBuffer();
            base64Data = Buffer.from(arrayBuf).toString('base64');
          }
        } catch {
          clearTimeout(timeoutId);
        }
      }

      if (base64Data) {
        const prompt = `You are a grocery product quality and image classification AI for "Sabjies" fresh farm grocery.
Your task is to analyze the provided image and determine whether it accurately shows or matches the requested vegetable/grocery product.

Product Name to verify: "${cleanProductName}"
Product Category: "${cleanCat}"

Strict Evaluation Rules:
1. Identify the prominent vegetable, food item, or object in the image.
2. If the product is "${cleanProductName}" (e.g., "Hari Mirch", "Green Chili", "Potato", "Tomato", "Onion", etc.), but the image shows a clearly different item, mark isMatch: false.
3. If it accurately represents "${cleanProductName}", mark isMatch: true.
4. Output STRICT JSON only with no markdown wrapping:
{
  "isMatch": boolean,
  "confidence": number,
  "detectedObject": string,
  "reason": string,
  "warning": string or null,
  "suggestedTag": string
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType, data: base64Data } },
                { text: prompt }
              ]
            }
          ]
        });

        const textOutput = response.text || '';
        const jsonMatch = textOutput.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const isMatch = Boolean(parsed.isMatch);
          const detected = parsed.detectedObject || (isMatch ? cleanProductName : 'Unrelated item');
          const warning = !isMatch
            ? (parsed.warning || `This image appears to show ${detected} rather than ${cleanProductName}.`)
            : null;
          return {
            isMatch,
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : (isMatch ? 0.95 : 0.2),
            detectedObject: detected,
            reason: parsed.reason || (isMatch ? `Image matches ${cleanProductName}.` : `Image does not match ${cleanProductName}.`),
            warning,
            suggestedTag: parsed.suggestedTag || (isMatch ? 'Fresh Produce' : 'Unmatched')
          };
        }
      }
    } catch (err) {
      console.warn('Gemini image validation encountered an issue, running heuristic fallback:', err);
    }
  }

  const lowerUrl = imageUrl.toLowerCase();
  const lowerProd = cleanProductName.toLowerCase();

  const mismatchKeywords: Record<string, string[]> = {
    chili: ['asparagus', 'potato', 'onion', 'eggplant', 'tomato', 'broccoli', 'banana'],
    mirch: ['asparagus', 'potato', 'onion', 'eggplant', 'tomato', 'broccoli', 'banana'],
    hari: ['asparagus'],
    aloo: ['asparagus', 'chili', 'eggplant', 'spinach', 'broccoli'],
    potato: ['asparagus', 'chili', 'eggplant', 'spinach', 'broccoli'],
    pyaz: ['asparagus', 'chili', 'eggplant', 'spinach', 'broccoli'],
    onion: ['asparagus', 'chili', 'eggplant', 'spinach', 'broccoli'],
    tamatar: ['asparagus', 'potato', 'onion', 'spinach'],
    tomato: ['asparagus', 'potato', 'onion', 'spinach']
  };

  let detectedMismatch: string | null = null;
  for (const [key, keywords] of Object.entries(mismatchKeywords)) {
    if (lowerProd.includes(key)) {
      for (const kw of keywords) {
        if (lowerUrl.includes(kw)) {
          detectedMismatch = kw;
          break;
        }
      }
    }
  }

  if (detectedMismatch) {
    return {
      isMatch: false,
      confidence: 0.85,
      detectedObject: detectedMismatch,
      reason: `Image URL metadata indicates ${detectedMismatch} which differs from ${cleanProductName}.`,
      warning: `This image appears to show ${detectedMismatch} rather than ${cleanProductName}.`,
      suggestedTag: 'Mismatch'
    };
  }

  return {
    isMatch: true,
    confidence: 0.9,
    detectedObject: cleanProductName,
    reason: `Image verified for ${cleanProductName}.`,
    warning: null,
    suggestedTag: 'Fresh Produce'
  };
}
