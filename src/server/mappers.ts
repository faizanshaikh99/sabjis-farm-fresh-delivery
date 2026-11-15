import crypto from "crypto";
import {
  getBaseWeightInGrams,
  parseWeightToGrams,
  isKgProduct,
  getProductSellingUnit
} from "../utils/weightParser";

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

export const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'greensabjies@gmail.com';

export function hashPassword(pwd: string): string {
  if (!pwd) return '';
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(pwd, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: 32 * 1024 * 1024
  });
  return `scrypt:${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

export function isScryptHash(storedHash: string): boolean {
  if (!storedHash || typeof storedHash !== 'string') return false;
  return storedHash.startsWith('scrypt:');
}

export function isLegacySha256Hash(storedHash: string): boolean {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const cleaned = storedHash.trim().replace(/^sha256:/i, '');
  return /^[a-f0-9]{64}$/i.test(cleaned);
}

export function verifyPassword(inputPassword: string, storedPasswordHash: string): boolean {
  if (!inputPassword || !storedPasswordHash || typeof inputPassword !== 'string' || typeof storedPasswordHash !== 'string') {
    return false;
  }
  const trimmedStored = storedPasswordHash.trim();

  if (isScryptHash(trimmedStored)) {
    try {
      const parts = trimmedStored.split(':');
      if (parts.length === 3) {
        const salt = Buffer.from(parts[1], 'hex');
        const expectedKey = Buffer.from(parts[2], 'hex');
        const derivedKey = crypto.scryptSync(inputPassword, salt, expectedKey.length, {
          N: SCRYPT_COST,
          r: SCRYPT_BLOCK_SIZE,
          p: SCRYPT_PARALLELIZATION,
          maxmem: 32 * 1024 * 1024
        });
        if (expectedKey.length === derivedKey.length && crypto.timingSafeEqual(expectedKey, derivedKey)) {
          return true;
        }
      }
    } catch (err) {
      console.warn('[Auth] Error verifying scrypt password hash:', err);
    }
    return false;
  }

  if (isLegacySha256Hash(trimmedStored)) {
    try {
      const normalizedStoredHex = trimmedStored.replace(/^sha256:/i, '').toLowerCase();
      const expectedBuf = Buffer.from(normalizedStoredHex, 'hex');

      const candidates = [inputPassword];
      const lowerInput = inputPassword.toLowerCase();
      if (lowerInput !== inputPassword) {
        candidates.push(lowerInput);
      }
      const trimmedInput = inputPassword.trim();
      if (trimmedInput && trimmedInput !== inputPassword && trimmedInput !== lowerInput) {
        candidates.push(trimmedInput);
      }

      for (const candidate of candidates) {
        const inputHash = crypto.createHash('sha256').update(candidate).digest('hex');
        const actualBuf = Buffer.from(inputHash.toLowerCase(), 'hex');
        if (expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf)) {
          return true;
        }
      }
    } catch (err) {
      console.warn('[Auth] Error verifying legacy SHA-256 hash:', err);
    }
    return false;
  }

  return false;
}

export function isUserAccountActive(user: any): boolean {
  if (!user) return false;
  const status = String(user.status || 'Active').trim().toLowerCase();
  return status !== 'blocked' && status !== 'suspended' && status !== 'deleted' && status !== 'inactive';
}

export function isUserAdmin(user: any): boolean {
  if (!user) return false;
  return (
    user.role === 'admin' ||
    user.id === 'admin_greensabjies' ||
    (typeof user.email === 'string' && user.email.toLowerCase() === DEFAULT_ADMIN_EMAIL.toLowerCase())
  );
}

export function cleanPhone(p: string | null | undefined): string {
  if (!p) return '';
  const digits = String(p).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function sanitizePostgrestValue(val: string): string {
  return String(val || '').replace(/["\\,()]/g, '').trim();
}

export function buildPostgrestPhoneFilter(rawIdentifier: string, cleanedPhone: string): string {
  const safeRaw = sanitizePostgrestValue(rawIdentifier);
  const parts: string[] = [];
  if (safeRaw) {
    parts.push(`phone.eq."${safeRaw}"`);
    parts.push(`id.eq."${safeRaw}"`);
  }
  if (cleanedPhone) {
    parts.push(`phone.eq."${cleanedPhone}"`);
    parts.push(`phone.ilike."%${cleanedPhone}%"`);
    if (cleanedPhone.length === 10) {
      parts.push(`phone.ilike."%${cleanedPhone.slice(0, 5)}%${cleanedPhone.slice(5)}%"`);
    }
  }
  return parts.join(',');
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export function maskPhone(phone: string): string {
  const clean = cleanPhone(phone);
  if (!clean || clean.length < 4) return '******';
  return `******${clean.slice(-4)}`;
}

export function normalizeUtr(utrString: string | undefined | null): string {
  if (!utrString) return '';
  return String(utrString).trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

export function validateUtrFormat(utrString: string | undefined | null): { valid: boolean; error?: string } {
  if (!utrString) return { valid: false, error: 'Payment reference / UTR is required.' };
  const str = String(utrString).trim();
  if (str.length < 4) {
    return { valid: false, error: 'Payment reference is too short. Please provide a valid UPI or bank reference (at least 4 characters).' };
  }
  if (str.length > 64) {
    return { valid: false, error: 'Payment reference is too long (maximum 64 characters).' };
  }
  if (!/^[a-zA-Z0-9\-_./ ]+$/.test(str)) {
    return { valid: false, error: 'Payment reference contains unsupported special characters.' };
  }
  return { valid: true };
}

export function normalizePaymentMethodKey(str: string): string {
  if (!str) return '';
  const s = str.toLowerCase().trim();
  if (s === 'cod' || s.includes('cash on delivery') || s.includes('cash-on-delivery')) return 'cod';
  if (s === 'gpay' || s.includes('google pay') || s.includes('googlepay') || s.includes('g pay')) return 'gpay';
  if (s === 'phonepe' || s.includes('phone pe')) return 'phonepe';
  if (s === 'paytm') return 'paytm';
  if (s === 'upi' || s.includes('direct upi') || s.includes('any upi') || s.includes('upi payment') || s.includes('online')) return 'upi';
  if (s === 'card' || s.includes('credit') || s.includes('debit')) return 'card';
  if (s === 'netbanking' || s.includes('net banking') || s.includes('bank')) return 'netbanking';
  if (s === 'wallets' || s.includes('wallet') || s.includes('pay later')) return 'wallets';
  return s;
}

export function normalizeProduct(p: any) {
  if (!p) return p;
  const isKg = isKgProduct(p);
  const unit = p.unit !== undefined && p.unit !== null && String(p.unit).trim() !== ''
    ? String(p.unit).toLowerCase().trim()
    : (isKg ? 'kg' : getProductSellingUnit(p));

  const sp = Number(p.sp !== undefined ? p.sp : (p.basePricePerKg !== undefined ? p.basePricePerKg : 0));
  const basePricePerKg = isKg
    ? Number(
        p.basePricePerKg !== undefined
          ? p.basePricePerKg
          : (p.base_price_per_kg !== undefined ? p.base_price_per_kg : sp)
      )
    : sp;

  const rawSlabs = isKg
    ? (Array.isArray(p.weightSlabs) ? p.weightSlabs : (Array.isArray(p.weight_slabs) ? p.weight_slabs : []))
    : [];
  const weightSlabs = isKg ? rawSlabs : [];

  let rawImages: any[] = [];
  if (Array.isArray(p.images)) {
    rawImages = p.images;
  } else if (typeof p.images === 'string' && p.images.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(p.images);
      if (Array.isArray(parsed)) rawImages = parsed;
    } catch {}
  } else if (Array.isArray(p.image)) {
    rawImages = p.image;
  }

  let img = String(p.img || p.image || p.image_url || '').trim();
  if (!img && rawImages.length > 0) {
    const first = rawImages[0];
    img = String(typeof first === 'string' ? first : (first?.url || '')).trim();
  }

  return {
    ...p,
    unit,
    sp,
    basePricePerKg,
    base_price_per_kg: basePricePerKg,
    img,
    images: rawImages,
    weightSlabs,
    weight_slabs: weightSlabs,
    pricingMode: isKg ? (p.pricingMode || (weightSlabs.length > 0 ? 'slabs' : 'auto')) : 'auto'
  };
}

export function normalizeUser(u: any, existingUser?: any) {
  if (!u) return null;
  const incomingPassword = (u.password && typeof u.password === 'string' && u.password.trim()) ? u.password.trim() : '';
  const existingPassword = (existingUser?.password && typeof existingUser.password === 'string' && existingUser.password.trim()) ? existingUser.password.trim() : '';
  const resolvedPassword = (isScryptHash(existingPassword) && !isScryptHash(incomingPassword))
    ? existingPassword
    : (incomingPassword || existingPassword);

  return {
    id: String(u.id),
    name: u.name || '',
    email: u.email || '',
    phone: u.phone || '',
    password: resolvedPassword,
    role: u.role || 'user',
    permissions: Array.isArray(u.permissions) ? u.permissions : [],
    addresses: Array.isArray(u.addresses) ? u.addresses : [],
    joinedAt: u.joined_at || u.joinedAt || u.created_at || new Date().toISOString(),
    status: u.status || 'Active',
    mustChangePassword: Boolean(u.must_change_password !== undefined ? u.must_change_password : u.mustChangePassword)
  };
}

export function sanitizeUserForResponse(u: any, addressesOverride?: any[]) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone || '',
    role: u.role || 'user',
    permissions: Array.isArray(u.permissions) ? u.permissions : [],
    addresses: addressesOverride !== undefined ? addressesOverride : (Array.isArray(u.addresses) ? u.addresses : []),
    joinedAt: u.joinedAt || u.joined_at,
    status: u.status || 'Active'
  };
}

export function normalizeOrderItem(it: any, dbProduct?: any) {
  if (!it) {
    return {
      id: 0,
      name: 'Product unavailable',
      vegetableName: 'Product unavailable',
      weightInGrams: 0,
      weight_in_grams: 0,
      weightLabel: '1 unit',
      weight_label: '1 unit',
      pricingType: 'unit',
      pricing_type: 'unit',
      actualPurchasedPrice: 0,
      actual_purchased_price: 0,
      quantity: 1,
      itemTotal: 0,
      item_total: 0,
      qty: 1,
      price: 0,
      sp: 0,
      lineTotal: 0,
      weight: '1 unit',
      emoji: '🥬'
    };
  }

  const name = it.vegetableName || it.name || (dbProduct ? dbProduct.name : 'Product');
  const qty = Math.max(1, Number(it.quantity !== undefined ? it.quantity : (it.qty !== undefined ? it.qty : 1)));
  const unitPrice = Number(
    it.actualPurchasedPrice !== undefined
      ? it.actualPurchasedPrice
      : (it.actual_purchased_price !== undefined
          ? it.actual_purchased_price
          : (it.price !== undefined ? it.price : (it.sp !== undefined ? it.sp : (dbProduct ? dbProduct.sp : 0))))
  );
  const total = Number(
    it.itemTotal !== undefined
      ? it.itemTotal
      : (it.item_total !== undefined
          ? it.item_total
          : (it.lineTotal !== undefined ? it.lineTotal : (unitPrice * qty)))
  );
  const weightStr = it.weightLabel || it.weight_label || it.weight || (dbProduct ? dbProduct.weight : 'per kg');

  let grams = Number(it.weightInGrams !== undefined ? it.weightInGrams : it.weight_in_grams);
  const isPiece = String(weightStr).toLowerCase().includes('pc');
  if (!grams || isNaN(grams)) {
    if (isPiece) {
      grams = 0;
    } else {
      const parsed = parseWeightToGrams(weightStr);
      grams = parsed.isValid ? parsed.grams : getBaseWeightInGrams(weightStr);
    }
  }

  const pricingType = it.pricingType || it.pricing_type || (
    isPiece ? 'unit' : (it.isCustomSlab ? 'slab' : 'base_rate')
  );

  return {
    id: it.id || (dbProduct ? dbProduct.id : 0),
    name,
    vegetableName: name,
    weightInGrams: grams,
    weight_in_grams: grams,
    weightLabel: weightStr,
    weight_label: weightStr,
    pricingType,
    pricing_type: pricingType,
    actualPurchasedPrice: unitPrice,
    actual_purchased_price: unitPrice,
    quantity: qty,
    itemTotal: total,
    item_total: total,
    qty,
    price: unitPrice,
    sp: unitPrice,
    lineTotal: total,
    weight: weightStr,
    emoji: it.emoji || (dbProduct ? dbProduct.emoji : '🥬'),
    formulaText: it.formulaText || '',
    img: it.img || it.image || it.image_url || (dbProduct && (dbProduct.name === name || !it.name) ? dbProduct.img : '')
  };
}

export function normalizeOrderItems(rawItems: any[], productsMap?: Map<number, any>): any[] {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((item: any) => {
    const dbProduct = (productsMap && item?.id) ? productsMap.get(Number(item.id)) : null;
    return normalizeOrderItem(item, dbProduct);
  });
}

export function normalizeOrder(o: any, productsMap?: Map<number, any>) {
  if (!o) return o;
  return {
    ...o,
    items: normalizeOrderItems(o.items || [], productsMap)
  };
}

export type CanonicalPaymentStatus =
  | 'Pending'
  | 'Paid'
  | 'Failed'
  | 'Refunded'
  | 'Partially Refunded'
  | 'Cancelled'
  | 'PENDING_VERIFICATION'
  | 'Rejected';

export function normalizePaymentStatus(status: string | undefined | null): CanonicalPaymentStatus {
  if (!status) return 'Pending';
  const s = status.trim().toUpperCase().replace(/[-\s]/g, '_');
  if (s === 'PENDING_VERIFICATION' || s === 'VERIFICATION_PENDING') return 'PENDING_VERIFICATION';
  if (s === 'PAID' || s === 'SUCCESS' || s === 'CAPTURED') return 'Paid';
  if (s === 'FAILED' || s === 'FAILURE' || s === 'DECLINED') return 'Failed';
  if (s === 'REJECTED') return 'Rejected';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'Cancelled';
  if (s === 'REFUNDED') return 'Refunded';
  if (s === 'PARTIALLY_REFUNDED') return 'Partially Refunded';
  return 'Pending';
}

export function normalizeOrderStatus(status: string | undefined | null): string {
  if (!status) return 'New Orders';
  const s = status.trim().toLowerCase().replace(/[-_]/g, ' ');
  if (
    s === 'new orders' || s === 'new order' || s === 'new' ||
    s === 'processing' || s === 'placed' || s === 'pending' || s === 'order registered'
  ) {
    return 'New Orders';
  }
  if (s === 'confirmed' || s === 'approved' || s === 'approved & sourced') return 'Confirmed';
  if (s === 'preparing' || s === 'packing' || s === 'packed' || s === 'processing order' || s === 'handpicked & packed') return 'Preparing';
  if (s === 'out for delivery' || s === 'on the way' || s === 'dispatched' || s === 'shipped') return 'Out for Delivery';
  if (s === 'delivered' || s === 'completed' || s === 'fulfilled') return 'Delivered';
  if (s === 'cancelled' || s === 'canceled' || s === 'rejected' || s === 'void') return 'Cancelled';
  return status;
}

export function normalizeOrderFromDb(o: any) {
  if (!o) return null;
  return normalizeOrder({
    id: o.id,
    idempotencyKey: o.idempotency_key || o.idempotencyKey || null,
    userId: o.user_id || o.customer_id || o.userId || 'guest',
    userEmail: o.user_email || o.userEmail || '',
    userName: o.user_name || o.userName || 'Customer',
    phone: o.phone || '',
    address: o.address || '',
    items: o.items || [],
    subtotal: Number(o.subtotal || 0),
    delivery: Number(o.delivery || 0),
    discountApplied: Number(o.discount_applied !== undefined ? o.discount_applied : (o.discountApplied || 0)),
    couponApplied: o.coupon_applied || o.couponApplied || '',
    total: Number(o.total || 0),
    payment: o.payment || 'COD',
    paymentStatus: normalizePaymentStatus(o.payment_status || o.paymentStatus),
    paymentGateway: o.payment_gateway || o.paymentGateway || '',
    utrNumber: o.utr_number || o.utr || o.utrNumber || '',
    utr: o.utr || o.utr_number || '',
    transactionId: o.razorpay_payment_id || o.utr || o.utr_number || o.transaction_id || '',
    upiIdUsed: o.upi_id_used || o.upiIdUsed || '',
    paymentScreenshot: o.payment_screenshot || o.paymentScreenshot || o.screenshotUrl || '',
    screenshotUrl: o.payment_screenshot || o.screenshotUrl || '',
    paymentDiscountMethod: o.payment_discount_method || o.paymentDiscountMethod,
    paymentDiscountType: o.payment_discount_type || o.paymentDiscountType,
    paymentDiscountValue: o.payment_discount_value !== undefined && o.payment_discount_value !== null ? Number(o.payment_discount_value) : o.paymentDiscountValue,
    paymentDiscountAmount: Number(o.payment_discount_amount !== undefined ? o.payment_discount_amount : (o.paymentDiscountAmount || 0)),
    paymentDiscountLabel: o.payment_discount_label || o.paymentDiscountLabel,
    paymentDiscountMinOrder: o.payment_discount_min_order !== undefined && o.payment_discount_min_order !== null ? Number(o.payment_discount_min_order) : o.paymentDiscountMinOrder,
    paymentDiscountMaxDiscount: o.payment_discount_max_discount !== undefined && o.payment_discount_max_discount !== null ? Number(o.payment_discount_max_discount) : o.paymentDiscountMaxDiscount,
    totalDiscount: Number(o.total_discount !== undefined ? o.total_discount : (o.totalDiscount || 0)),
    status: normalizeOrderStatus(o.status),
    adminRemarks: o.admin_remarks || o.adminRemarks || '',
    assignedRider: o.assigned_rider || o.assignedRider || '',
    deliveryInstructions: o.delivery_instructions || o.deliveryInstructions || '',
    stockReserved: o.stock_reserved !== undefined
      ? Boolean(o.stock_reserved)
      : (o.stockReserved !== undefined
          ? Boolean(o.stockReserved)
          : (normalizePaymentStatus(o.payment_status || o.paymentStatus) === 'PENDING_VERIFICATION' && !Boolean(o.stock_released || o.stockReleased) && !Boolean(o.stock_deducted || o.stockDeducted))),
    stockDeducted: o.stock_deducted !== undefined ? Boolean(o.stock_deducted) : Boolean(o.stockDeducted),
    stockReleased: Boolean(o.stock_released || o.stockReleased),
    inventoryStatus: o.inventory_status || o.inventoryStatus || (Boolean(o.stock_released || o.stockReleased) ? 'RELEASED' : (Boolean(o.stock_deducted || o.stockDeducted) ? 'DEDUCTED' : 'RESERVED')),
    stockReleasedAt: o.stock_released_at || o.stockReleasedAt,
    stockReleaseReason: o.stock_release_reason || o.stockReleaseReason,
    razorpayOrderId: o.razorpay_order_id || o.razorpayOrderId,
    razorpayPaymentId: o.razorpay_payment_id || o.razorpayPaymentId,
    razorpaySignature: o.razorpay_signature || o.razorpaySignature,
    refundAmount: Number(o.refund_amount !== undefined ? o.refund_amount : (o.refundAmount || 0)),
    refundHistory: Array.isArray(o.refund_history) ? o.refund_history : (o.refundHistory || []),
    refundId: o.refund_id || o.refundId,
    refundStatus: o.refund_status || o.refundStatus,
    refundReason: o.refund_reason || o.refundReason,
    paymentAuditTrail: Array.isArray(o.payment_audit_trail) ? o.payment_audit_trail : (o.paymentAuditTrail || []),
    cancellationReason: o.cancellation_reason || o.cancellationReason,
    cancelledAt: o.cancelled_at || o.cancelledAt,
    refundedAt: o.refunded_at || o.refundedAt,
    refundNote: o.refund_note || o.refundNote,
    cashier: o.cashier || 'Online Order',
    createdAt: o.created_at || o.createdAt,
    updatedAt: o.updated_at || o.updatedAt
  });
}

export const DEFAULT_BUSINESS_SETTINGS = {
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
  businessRegistrationNumber: "",
  enableIgBanner: true,
  igProfileUrl: "https://www.instagram.com/sabjies?igsh=MWp6cDQ2NHZtcnE0Zw",
  igBannerText: "🎁 Follow us on Instagram for exclusive discount codes."
};

export const DEFAULT_PAYMENT_SETTINGS = {
  businessName: 'Sabjies Fresh Grocery',
  upiId: 'sabjies@upi',
  qrCodeUrl: '',
  qrCodeFileName: '',
  qrCodeDataUrl: '',
  qrCodeUploaded: false,
  qrCodeUploadedAt: null as string | null,
  instructions: '1. Scan the QR code or tap "Pay via UPI App".\n2. Pay the exact amount shown.\n3. Copy the UTR/Transaction ID from your UPI app.\n4. Paste the UTR/Transaction ID into the website.\n5. Click "Submit Payment".',
  enableUpi: true,
  enableCod: true,
  enableRazorpay: true,
  autoApproveUpi: false
};

export function mapBusinessSettingsFromDb(row: any) {
  if (!row) return { ...DEFAULT_BUSINESS_SETTINGS };
  return {
    ...DEFAULT_BUSINESS_SETTINGS,
    minFreeDelivery: Number(row.min_free_delivery ?? row.minFreeDelivery ?? DEFAULT_BUSINESS_SETTINGS.minFreeDelivery),
    standardShipping: Number(row.standard_shipping ?? row.standardShipping ?? DEFAULT_BUSINESS_SETTINGS.standardShipping),
    gstPercentage: Number(row.gst_percentage ?? row.gstPercentage ?? DEFAULT_BUSINESS_SETTINGS.gstPercentage),
    operationalHoursStart: row.operational_hours_start || row.operationalHoursStart || DEFAULT_BUSINESS_SETTINGS.operationalHoursStart,
    operationalHoursEnd: row.operational_hours_end || row.operationalHoursEnd || DEFAULT_BUSINESS_SETTINGS.operationalHoursEnd,
    isOpen: row.is_open !== undefined ? Boolean(row.is_open) : Boolean(row.isOpen ?? true),
    supportPhone: row.support_phone || row.supportPhone || DEFAULT_BUSINESS_SETTINGS.supportPhone,
    address: row.address || DEFAULT_BUSINESS_SETTINGS.address,
    businessName: row.business_name || row.businessName || DEFAULT_BUSINESS_SETTINGS.businessName,
    supportEmail: row.support_email || row.supportEmail || DEFAULT_BUSINESS_SETTINGS.supportEmail,
    website: row.website || DEFAULT_BUSINESS_SETTINGS.website,
    gstNumber: row.gst_number ?? row.gstNumber ?? '',
    fssaiLicense: row.fssai_license ?? row.fssaiLicense ?? '',
    businessRegistrationNumber: row.business_registration_number ?? row.businessRegistrationNumber ?? '',
    enableIgBanner: row.enable_ig_banner !== undefined ? Boolean(row.enable_ig_banner) : Boolean(row.enableIgBanner ?? true),
    igProfileUrl: row.ig_profile_url || row.igProfileUrl || DEFAULT_BUSINESS_SETTINGS.igProfileUrl,
    igBannerText: row.ig_banner_text || row.igBannerText || DEFAULT_BUSINESS_SETTINGS.igBannerText
  };
}

export function mapPaymentSettingsFromDb(row: any) {
  if (!row) return { ...DEFAULT_PAYMENT_SETTINGS };
  const rawQrUrl = row.qr_code_url ?? row.qrCodeUrl ?? '';
  const sanitizedQrUrl = rawQrUrl.includes('qrserver.com') ? '' : rawQrUrl;
  return {
    ...DEFAULT_PAYMENT_SETTINGS,
    businessName: row.business_name || row.businessName || DEFAULT_PAYMENT_SETTINGS.businessName,
    upiId: row.upi_id || row.upiId || DEFAULT_PAYMENT_SETTINGS.upiId,
    qrCodeUrl: sanitizedQrUrl,
    qrCodeDataUrl: row.qr_code_data_url ?? row.qrCodeDataUrl ?? '',
    qrCodeFileName: row.qr_code_file_name ?? row.qrCodeFileName ?? '',
    qrCodeUploaded: rawQrUrl.includes('qrserver.com') ? false : Boolean(row.qr_code_uploaded ?? row.qrCodeUploaded ?? false),
    qrCodeUploadedAt: row.qr_code_uploaded_at ?? row.qrCodeUploadedAt ?? null,
    instructions: row.instructions ?? DEFAULT_PAYMENT_SETTINGS.instructions,
    enableUpi: row.enable_upi !== undefined ? Boolean(row.enable_upi) : Boolean(row.enableUpi ?? true),
    enableCod: row.enable_cod !== undefined ? Boolean(row.enable_cod) : Boolean(row.enableCod ?? true),
    enableRazorpay: row.enable_razorpay !== undefined ? Boolean(row.enable_razorpay) : Boolean(row.enableRazorpay ?? true),
    autoApproveUpi: row.auto_approve_upi !== undefined ? Boolean(row.auto_approve_upi) : Boolean(row.autoApproveUpi ?? false)
  };
}

export function mapAddressFromDb(a: any) {
  return {
    id: a.id,
    userId: a.user_id || a.userId,
    name: a.name || '',
    label: a.label || 'Home',
    flat: a.flat || '',
    street: a.street || '',
    area: a.area || 'Ghatkopar East',
    pin: a.pin || '400075',
    city: a.city || 'Mumbai',
    state: a.state || 'Maharashtra',
    landmark: a.landmark || '',
    isDefault: Boolean(a.is_default ?? a.isDefault)
  };
}

export function mapOfferFromDb(o: any) {
  return {
    id: Number(o.id),
    title: o.title || '',
    desc: o.desc_text ?? o.desc ?? o.description ?? '',
    tag: o.tag || 'HOT DEAL',
    tagColor: o.tag_color || o.tagColor || '#1a9c5b',
    img: o.img || ''
  };
}

export function mapReviewFromDb(r: any) {
  return {
    id: Number(r.id),
    authorName: r.author_name || r.authorName || 'Customer',
    location: r.location || 'Ghatkopar',
    rating: Number(r.rating || 5),
    body: r.body || '',
    createdAt: r.created_at || r.createdAt || new Date().toISOString()
  };
}

export function mapCategoryFromDb(c: any) {
  return {
    id: String(c.id),
    label: c.label || c.name || String(c.id),
    emoji: c.emoji || '🥦'
  };
}

export function mapCouponFromDb(c: any) {
  return {
    code: String(c.code || '').toUpperCase(),
    discount: Number(c.discount || 0),
    minOrder: Number(c.min_order ?? c.minOrder ?? 0),
    maxDiscount: c.max_discount !== undefined && c.max_discount !== null ? Number(c.max_discount) : (c.maxDiscount ?? null),
    usage: Number(c.usage || 0),
    type: c.type || 'flat',
    expiry: c.expiry || '',
    maxPerCustomer: c.max_per_customer ?? c.maxPerCustomer ?? 'Unlimited',
    maxRedemptions: c.max_redemptions !== undefined && c.max_redemptions !== null ? Number(c.max_redemptions) : (c.maxRedemptions ?? null),
    campaignType: c.campaign_type || c.campaignType || 'Regular Promo Code',
    status: c.status || 'Active',
    startDate: c.start_date || c.startDate || null,
    campaignName: c.campaign_name || c.campaignName || '',
    igPostUrl: c.ig_post_url || c.igPostUrl || '',
    igReelUrl: c.ig_reel_url || c.igReelUrl || '',
    igStoryLink: c.ig_story_link || c.igStoryLink || '',
    campaignNotes: c.campaign_notes || c.campaignNotes || '',
    internalDescription: c.internal_description || c.internalDescription || '',
    createdDate: c.created_date || c.createdDate || ''
  };
}

export function mapCouponToDb(c: any) {
  return {
    code: String(c.code || '').trim().toUpperCase(),
    discount: Number(c.discount || 0),
    min_order: Number(c.minOrder ?? c.min_order ?? 0),
    max_discount: (c.maxDiscount !== undefined && c.maxDiscount !== null && c.maxDiscount !== '') ? Number(c.maxDiscount) : null,
    usage: Number(c.usage || 0),
    type: c.type || 'flat',
    expiry: c.expiry || '',
    max_per_customer: c.maxPerCustomer !== undefined && c.maxPerCustomer !== null ? String(c.maxPerCustomer) : 'Unlimited',
    max_redemptions: (c.maxRedemptions !== undefined && c.maxRedemptions !== null && c.maxRedemptions !== '') ? Number(c.maxRedemptions) : null,
    campaign_type: c.campaignType || 'Regular Promo Code',
    status: c.status || 'Active',
    start_date: c.startDate || null,
    campaign_name: c.campaignName || '',
    ig_post_url: c.igPostUrl || '',
    ig_reel_url: c.igReelUrl || '',
    ig_story_link: c.igStoryLink || '',
    campaign_notes: c.campaignNotes || '',
    internal_description: c.internalDescription || '',
    created_date: c.createdDate || new Date().toISOString().split('T')[0]
  };
}

export function mapPaymentDiscountFromDb(d: any) {
  return {
    id: d.id,
    paymentMethod: d.payment_method || d.paymentMethod || '',
    paymentMethodName: d.payment_method_name || d.paymentMethodName || d.payment_method || '',
    discountType: (d.discount_type || d.discountType || 'fixed') as 'percent' | 'fixed',
    discountValue: Number(d.discount_value ?? d.discountValue ?? 0),
    minOrder: d.min_order !== undefined && d.min_order !== null ? Number(d.min_order) : (d.minOrder ?? null),
    maxDiscount: d.max_discount !== undefined && d.max_discount !== null ? Number(d.max_discount) : (d.maxDiscount ?? null),
    startDate: d.start_date || d.startDate || null,
    endDate: d.end_date || d.endDate || null,
    status: (d.status || 'active') as 'active' | 'inactive',
    createdAt: d.created_at || d.createdAt,
    updatedAt: d.updated_at || d.updatedAt
  };
}

export function mapPaymentDiscountToDb(d: any) {
  return {
    id: d.id,
    payment_method: d.paymentMethod,
    payment_method_name: d.paymentMethodName,
    discount_type: d.discountType,
    discount_value: d.discountValue,
    min_order: d.minOrder,
    max_discount: d.maxDiscount,
    start_date: d.startDate,
    end_date: d.endDate,
    status: d.status,
    created_at: d.createdAt,
    updated_at: d.updatedAt
  };
}

export function mapTransactionFromDb(t: any) {
  return {
    id: t.id,
    orderId: t.order_id || t.orderId,
    userId: t.user_id || t.userId,
    userEmail: t.user_email || t.userEmail || '',
    amount: Number(t.amount || 0),
    currency: t.currency || 'INR',
    gateway: t.gateway || 'unknown',
    status: t.status || 'Pending',
    transactionId: t.transaction_id || t.transactionId || null,
    utr: t.utr || null,
    razorpayOrderId: t.razorpay_order_id || t.razorpayOrderId || null,
    razorpayPaymentId: t.razorpay_payment_id || t.razorpayPaymentId || null,
    adminNotes: t.admin_notes || t.adminNotes || '',
    createdAt: t.created_at || t.createdAt
  };
}

export function mapNotificationFromDb(n: any) {
  return {
    id: n.id,
    userId: n.user_id || n.userId,
    title: n.title || '',
    body: n.body || '',
    type: n.type || 'info',
    read: Boolean(n.read),
    createdAt: n.created_at || n.createdAt || new Date().toISOString()
  };
}

export function mapPasswordResetFromDb(r: any) {
  return {
    id: String(r.id),
    userId: r.user_id || r.userId || null,
    email: r.email || '',
    phone: r.phone || '',
    name: r.name || '',
    reason: r.reason || '',
    status: r.status || 'Pending',
    createdAt: r.requested_at || r.created_at || r.createdAt || new Date().toISOString(),
    requestedAt: r.requested_at || r.created_at || r.createdAt || new Date().toISOString(),
    updatedAt: r.updated_at || r.updatedAt || r.created_at || new Date().toISOString(),
    approvedAt: r.approved_at || r.approvedAt || null,
    approvedBy: r.approved_by || r.approvedBy || '',
    adminNotes: r.admin_notes || r.adminNotes || '',
    tempPasswordHash: r.temp_password_hash || r.tempPasswordHash || '',
    tempPassword: '', // Never expose/store plaintext temp passwords
    token: r.token || '',
    expiresAt: r.expires_at || r.expiresAt || null,
    notificationStatus: r.notification_status || r.notificationStatus || 'Pending',
    lastLogin: r.last_login || r.lastLogin || '',
    deviceInfo: r.device_info || r.deviceInfo || '',
    ip: r.ip || '',
    auditTrail: Array.isArray(r.audit_trail) ? r.audit_trail : (r.auditTrail || []),
    attempts: Number(r.attempts || 0),
    maxAttempts: Number(r.max_attempts ?? r.maxAttempts ?? 5),
    cooldownUntil: r.cooldown_until || r.cooldownUntil || null,
    verifiedAt: r.verified_at || r.verifiedAt || null,
    verificationToken: r.verification_token || r.verificationToken || '',
    verificationTokenExpiresAt: r.verification_token_expires_at || r.verificationTokenExpiresAt || null,
    channel: r.channel || '',
    used: Boolean(r.used)
  };
}

export function mapPasswordResetToDb(reqItem: any) {
  const createdIso = reqItem.requested_at || reqItem.requestedAt || reqItem.createdAt || new Date().toISOString();
  return {
    id: String(reqItem.id),
    user_id: reqItem.userId ? String(reqItem.userId) : null,
    email: reqItem.email || '',
    phone: reqItem.phone || reqItem.mobileNumber || '',
    name: reqItem.name || '',
    reason: reqItem.reason || '',
    status: reqItem.status || 'Pending',
    requested_at: createdIso,
    updated_at: reqItem.updatedAt || new Date().toISOString(),
    approved_at: reqItem.approvedAt || null,
    approved_by: reqItem.approvedBy || '',
    admin_notes: reqItem.adminNotes || '',
    temp_password_hash: reqItem.tempPasswordHash || '',
    temp_password: '',
    token: reqItem.token || '',
    expires_at: reqItem.expiresAt || null,
    notification_status: reqItem.notificationStatus || 'Pending',
    last_login: reqItem.lastLogin || '',
    device_info: reqItem.deviceInfo || '',
    ip: reqItem.ip || '',
    audit_trail: Array.isArray(reqItem.auditTrail) ? reqItem.auditTrail : [],
    attempts: Number(reqItem.attempts || 0),
    max_attempts: Number(reqItem.maxAttempts ?? 5),
    cooldown_until: reqItem.cooldownUntil || null,
    verified_at: reqItem.verifiedAt || null,
    verification_token: reqItem.verificationToken || null,
    verification_token_expires_at: reqItem.verificationTokenExpiresAt || null,
    channel: reqItem.channel || null,
    used: Boolean(reqItem.used)
  };
}

export function mapSessionFromDb(s: any) {
  return {
    id: String(s.id),
    userId: String(s.user_id || s.userId || ''),
    token: s.token || s.id,
    createdAt: s.created_at || s.createdAt,
    expiresAt: s.expires_at || s.expiresAt,
    device: s.device || '',
    ip: s.ip || ''
  };
}

export function mapLoginHistoryFromDb(l: any) {
  return {
    id: l.id,
    userId: l.user_id || l.userId,
    identifier: l.identifier || '',
    status: l.status || 'Success',
    ip: l.ip || '',
    userAgent: l.user_agent || l.userAgent || '',
    timestamp: l.timestamp || new Date().toISOString()
  };
}

export function mapAuditLogFromDb(a: any) {
  return {
    id: a.id,
    userId: a.user_id || a.performed_by || a.userId || 'system',
    performedBy: a.performed_by || a.user_id || 'system',
    action: a.action || '',
    details: a.details || {},
    timestamp: a.timestamp || new Date().toISOString()
  };
}

export function mapRedemptionLogFromDb(r: any) {
  return {
    id: r.id,
    orderId: r.order_id || r.orderId,
    code: r.code || r.coupon_code || '',
    couponCode: r.coupon_code || r.code || '',
    userId: r.user_id || r.userId || 'guest',
    userEmail: r.user_email || r.userEmail || '',
    discount: Number(r.discount_amount ?? r.discount ?? 0),
    timestamp: r.timestamp || new Date().toISOString()
  };
}
