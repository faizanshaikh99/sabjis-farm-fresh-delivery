import express from "express";
import crypto from "crypto";
import QRCode from "qrcode";
import {
  supabase,
  isSupabaseConfigured,
  fetchTable,
  fetchAllRows,
  fetchOneRow,
  upsertTable,
  syncOrderToSupabase,
  syncPaymentTransactionToSupabase,
  normalizeProductFromDb
} from "../../db/supabaseService";
import {
  sanitizePostgrestValue,
  validateUtrFormat,
  normalizeOrder,
  normalizeOrderItem,
  CanonicalPaymentStatus,
  normalizeOrderStatus,
  normalizeOrderFromDb,
  mapCouponFromDb,
  mapPaymentDiscountFromDb,
  mapTransactionFromDb
} from "../mappers";
import {
  asyncHandler,
  broadcastRealtimeEvent,
  saveScreenshotToStorageAsync,
  getBusinessSettingsFromDb,
  getPaymentSettingsFromDb,
  getUserByIdFromDb,
  getOrderByIdFromDb,
  findDuplicateUtrInDb,
  syncNotificationToSupabase,
  logAuditEvent,
  appendPaymentAudit,
  getUserIdFromRequestAsync,
  verifyAdminRequest,
  getAdminIdentityFromRequest
} from "../dbQueries";
import {
  getCouponPerCustomerLimit,
  getUserCouponRedemptionsCount,
  incrementCouponUsage,
  verifyCartAndCalculatePricing,
  reserveOrderStock,
  deductOrderStock,
  permanentlyConsumeOrderStock,
  releaseOrderStock,
  getRazorpayConfig,
  getRazorpayInstance
} from "../inventoryAndPricing";
import { sendOrderConfirmationEmail } from "../../services/emailService";

const router = express.Router();

const activeWebhookProcessing = new Set<string>();
const activeRefundLocks = new Set<string>();

function sortOrdersNewestFirstServer(list: any[]): any[] {
  return [...list].sort((a: any, b: any) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (timeB !== timeA) return timeB - timeA;
    return String(b.id || "").localeCompare(String(a.id || ""), undefined, { numeric: true });
  });
}

async function getProductsMapForOrderRows(rows: any[]): Promise<Map<number, any>> {
  const map = new Map<number, any>();
  const neededIds = new Set<number>();
  for (const row of rows) {
    const items = Array.isArray(row?.items) ? row.items : [];
    for (const it of items) {
      const pid = Number(it?.id);
      if (!isNaN(pid) && pid > 0) {
        neededIds.add(pid);
      }
    }
  }
  if (neededIds.size === 0) return map;
  const prodRows = await fetchTable("products", {
    columns: "id,name,sp,weight,emoji,img",
    filter: (q) => q.in("id", Array.from(neededIds))
  });
  prodRows.forEach((r: any) => {
    const p = normalizeProductFromDb(r);
    if (p && p.id !== undefined) map.set(Number(p.id), p);
  });
  return map;
}

// GET /api/orders
router.get("/api/orders", asyncHandler(async (req, res) => {
  const { userId, userEmail, customer, status, limit, offset, page } = req.query;
  const isAdmin = await verifyAdminRequest(req);
  const sessionUserId = !isAdmin ? await getUserIdFromRequestAsync(req) : null;

  if (!isAdmin && !sessionUserId) {
    return res.status(401).json({ error: "Authentication required to view orders." });
  }

  const limitNum = limit ? Math.min(200, Math.max(1, Number(limit))) : undefined;
  const offsetNum = offset ? Math.max(0, Number(offset)) : (page ? (Math.max(1, Number(page)) - 1) * (limitNum || 50) : 0);

  if (!isAdmin && sessionUserId) {
    const authUser = await getUserByIdFromDb(sessionUserId);
    const ownEmail = authUser?.email ? String(authUser.email).trim().toLowerCase() : "";
    const reqUid = userId ? String(userId).trim() : "";
    const reqEmail = userEmail ? String(userEmail).trim().toLowerCase() : "";
    const reqCustomer = customer ? String(customer).trim() : "";

    if (reqUid && reqUid !== String(sessionUserId)) {
      return res.status(403).json({ error: "Access denied. Cannot view another customer's orders." });
    }
    if (reqEmail && reqEmail !== ownEmail) {
      return res.status(403).json({ error: "Access denied. Cannot view another customer's orders." });
    }
    if (
      reqCustomer &&
      reqCustomer.toLowerCase() !== String(sessionUserId).toLowerCase() &&
      (!ownEmail || reqCustomer.toLowerCase() !== ownEmail)
    ) {
      return res.status(403).json({ error: "Access denied. Cannot view another customer's orders." });
    }

    const safeUid = sanitizePostgrestValue(sessionUserId);
    const safeEmail = ownEmail ? sanitizePostgrestValue(ownEmail) : "";
    const orClause = safeEmail
      ? `user_id.eq."${safeUid}",customer_id.eq."${safeUid}",user_email.ilike."${safeEmail}"`
      : `user_id.eq."${safeUid}",customer_id.eq."${safeUid}"`;

    const fetchOpts: any = {
      orderBy: { column: "created_at", ascending: false },
      filter: (q: any) => {
        let fq = q.or(orClause);
        if (status) fq = fq.ilike("status", sanitizePostgrestValue(String(status)));
        return fq;
      }
    };
    const rows = limitNum !== undefined
      ? await fetchTable("orders", { ...fetchOpts, limit: limitNum, offset: offsetNum })
      : await fetchAllRows("orders", fetchOpts);
    const productsMap = await getProductsMapForOrderRows(rows);
    return res.json(sortOrdersNewestFirstServer(rows.map((r: any) => normalizeOrder(normalizeOrderFromDb(r), productsMap))));
  }

  // Admin path
  const filterFn = (q: any) => {
    let fq = q;
    if (userId) {
      const safeUid = sanitizePostgrestValue(String(userId));
      fq = fq.or(`user_id.eq."${safeUid}",customer_id.eq."${safeUid}"`);
    } else if (userEmail) {
      fq = fq.ilike("user_email", sanitizePostgrestValue(String(userEmail)));
    } else if (customer) {
      const safeC = sanitizePostgrestValue(String(customer));
      fq = fq.or(`user_id.eq."${safeC}",customer_id.eq."${safeC}",user_email.ilike."${safeC}"`);
    }
    if (status) {
      fq = fq.ilike("status", sanitizePostgrestValue(String(status)));
    }
    return fq;
  };

  const fetchOpts: any = {
    orderBy: { column: "created_at", ascending: false },
    filter: filterFn
  };

  const rows = limitNum !== undefined
    ? await fetchTable("orders", { ...fetchOpts, limit: limitNum, offset: offsetNum })
    : await fetchAllRows("orders", fetchOpts);

  const productsMap = await getProductsMapForOrderRows(rows);
  res.json(sortOrdersNewestFirstServer(rows.map((r: any) => normalizeOrder(normalizeOrderFromDb(r), productsMap))));
}));

// Customer Order History
const handleCustomerOrders = asyncHandler(async (req, res) => {
  const customerId = String(req.params.userId || req.params.customerId || "").trim();
  const isAdmin = await verifyAdminRequest(req);
  const sessionUserId = !isAdmin ? await getUserIdFromRequestAsync(req) : null;

  if (!isAdmin && !sessionUserId) {
    return res.status(401).json({ error: "Authentication required to view order history." });
  }
  if (!isAdmin && sessionUserId) {
    const authUser = await getUserByIdFromDb(sessionUserId);
    const ownEmail = authUser?.email ? String(authUser.email).toLowerCase() : "";
    if (
      String(sessionUserId).toLowerCase() !== customerId.toLowerCase() &&
      (!ownEmail || ownEmail !== customerId.toLowerCase())
    ) {
      return res.status(403).json({ error: "Access denied. Cannot view another customer's order history." });
    }
  }

  const safeC = sanitizePostgrestValue(customerId);
  const rows = await fetchAllRows("orders", {
    filter: (q) => q.or(`user_id.eq."${safeC}",customer_id.eq."${safeC}",user_email.ilike."${safeC}"`),
    orderBy: { column: "created_at", ascending: false }
  });

  const productsMap = await getProductsMapForOrderRows(rows);
  const orders = sortOrdersNewestFirstServer(rows.map((r: any) => normalizeOrder(normalizeOrderFromDb(r), productsMap)));

  res.json({
    success: true,
    customerId,
    count: orders.length,
    orders
  });
});

router.get("/api/orders/customer/:userId", handleCustomerOrders);
router.get("/api/orders/user/:userId", handleCustomerOrders);

// Get Single Order
router.get("/api/orders/:id", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  const sessionUserId = !isAdmin ? await getUserIdFromRequestAsync(req) : null;
  if (!isAdmin && !sessionUserId) {
    return res.status(401).json({ success: false, error: "Authentication required to view order details." });
  }

  const orderId = String(req.params.id || "").trim();
  const order = await getOrderByIdFromDb(orderId);
  if (!order) {
    return res.status(404).json({ success: false, error: "Order not found" });
  }

  if (!isAdmin && sessionUserId) {
    const authUser = await getUserByIdFromDb(sessionUserId);
    const ownEmail = authUser?.email ? String(authUser.email).toLowerCase() : "";
    const isOwner =
      String(order.userId) === String(sessionUserId) ||
      (ownEmail && order.userEmail && ownEmail === String(order.userEmail).toLowerCase());
    if (!isOwner) {
      return res.status(403).json({ success: false, error: "Access denied. You cannot view this order." });
    }
  }

  const productsMap = await getProductsMapForOrderRows([order]);
  return res.json({ success: true, order: normalizeOrder(order, productsMap) });
}));

// Create Order (Authenticated Customer or Admin)
router.post("/api/orders", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const rawItems = body.items || [];
  const couponRequested = body.couponApplied || body.couponCode;
  const isAdmin = await verifyAdminRequest(req);
  const authenticatedUserId = await getUserIdFromRequestAsync(req);
  if (!authenticatedUserId && !isAdmin) {
    return res.status(401).json({ error: "Authentication required to place an order." });
  }
  if (!isAdmin && body.userId && body.userId !== "guest" && String(body.userId) !== String(authenticatedUserId)) {
    return res.status(403).json({ error: "Access denied. Cannot place an order for another user." });
  }
  const userId = (isAdmin && body.userId) ? String(body.userId) : String(authenticatedUserId);
  const authenticatedUser = await getUserByIdFromDb(userId).catch(() => null);
  const userEmail = body.userEmail || authenticatedUser?.email || "";
  const phone = body.phone || authenticatedUser?.phone || "";
  const paymentMethod = body.paymentMethod || body.payment || "Cash on Delivery";
  const idempotencyKey = body.idempotencyKey || (req.headers["x-idempotency-key"] as string);

  if (idempotencyKey) {
    const existingRow = await fetchOneRow("orders", (q) => q.eq("idempotency_key", String(idempotencyKey)));
    if (existingRow) {
      const norm = normalizeOrderFromDb(existingRow);
      return res.json({ ...norm, success: true, order: norm, idempotent: true });
    }
  }

  const verification = await verifyCartAndCalculatePricing(
    rawItems,
    couponRequested,
    userId,
    userEmail,
    phone,
    paymentMethod
  );

  if (!verification.valid) {
    return res.status(400).json({
      error: verification.error || "Order pricing verification failed.",
      code: "VERIFICATION_FAILED"
    });
  }

  const orderId = body.id ? String(body.id) : ("ORD" + Math.floor(100000 + Math.random() * 900000));

  const submittedUtr = body.utr || body.transactionId;
  if (submittedUtr) {
    const utrStr = String(submittedUtr).trim();
    const formatCheck = validateUtrFormat(utrStr);
    if (!formatCheck.valid && !body.screenshotUrl) {
      return res.status(400).json({ error: formatCheck.error, code: "INVALID_UTR_FORMAT" });
    }
    const duplicateOrder = await findDuplicateUtrInDb(utrStr, orderId);
    if (duplicateOrder) {
      return res.status(400).json({
        error: `Bank Reference / UTR "${utrStr}" has already been submitted for Order #${duplicateOrder.id}. Duplicate payment reference cannot be reused.`,
        code: "DUPLICATE_UTR"
      });
    }
  }

  const normPayment = String(paymentMethod).toLowerCase();
  let initialPaymentStatus: CanonicalPaymentStatus = "Pending";
  let initialRemarks = "";
  const isPendingUpi = normPayment.includes("upi") || Boolean(submittedUtr) || Boolean(body.screenshotUrl);

  if (normPayment.includes("cash on delivery") || normPayment === "cod") {
    initialPaymentStatus = "Pending";
    initialRemarks = "Cash on Delivery - Payment to be collected upon handover";
  } else if (isPendingUpi) {
    initialPaymentStatus = "PENDING_VERIFICATION";
    initialRemarks = submittedUtr
      ? `Direct UPI Reference (${submittedUtr}) submitted - Awaiting store manager bank verification`
      : "Direct UPI Payment proof submitted - Awaiting store manager bank verification";
  } else if (normPayment.includes("razorpay") || normPayment.includes("online")) {
    initialPaymentStatus = "Pending";
    initialRemarks = "Online payment initiated - Awaiting HMAC verification";
  } else {
    initialPaymentStatus = "Pending";
    initialRemarks = "Payment pending";
  }

  const isReservedInitial = isPendingUpi || initialPaymentStatus === "PENDING_VERIFICATION";
  if (isReservedInitial) {
    const reserveRes = await reserveOrderStock(verification.items);
    if (!reserveRes.success) {
      return res.status(400).json({
        error: reserveRes.error || "Inventory unavailable to reserve for order.",
        code: "INSUFFICIENT_STOCK"
      });
    }
  } else {
    const stockResult = await deductOrderStock(verification.items);
    if (!stockResult.success) {
      return res.status(400).json({
        error: stockResult.error || "Inventory unavailable to fulfill order.",
        code: "INSUFFICIENT_STOCK"
      });
    }
  }

  if (verification.couponApplied) {
    await incrementCouponUsage(
      verification.couponApplied,
      orderId,
      userId,
      userEmail,
      verification.couponDiscount
    );
  }

  const savedScreenshotUrl = await saveScreenshotToStorageAsync(body.screenshotUrl, orderId);
  const orderCreationTimestamp = new Date().toISOString();

  const newOrder = normalizeOrder({
    id: orderId,
    idempotencyKey: idempotencyKey || null,
    userId,
    userEmail,
    userName: body.userName || "Valued Customer",
    phone,
    address: body.address || "Ghatkopar East",
    items: verification.items.map((it) => normalizeOrderItem(it)),
    payment: paymentMethod,
    paymentStatus: initialPaymentStatus,
    transactionId: submittedUtr ? String(submittedUtr).trim() : "",
    subtotal: verification.subtotal,
    delivery: verification.delivery,
    total: verification.total,
    status: "New Orders",
    createdAt: orderCreationTimestamp,
    updatedAt: orderCreationTimestamp,
    upiIdUsed: body.upiIdUsed,
    utr: submittedUtr ? String(submittedUtr).trim() : "",
    screenshotUrl: savedScreenshotUrl,
    adminRemarks: initialRemarks,
    couponApplied: verification.couponApplied,
    discountApplied: verification.couponDiscount,
    paymentDiscountMethod: verification.paymentDiscount?.applied ? verification.paymentDiscount.method : undefined,
    paymentDiscountType: verification.paymentDiscount?.applied ? verification.paymentDiscount.type : undefined,
    paymentDiscountValue: verification.paymentDiscount?.applied ? verification.paymentDiscount.value : undefined,
    paymentDiscountAmount: verification.paymentDiscount?.amount || 0,
    paymentDiscountLabel: verification.paymentDiscount?.applied ? verification.paymentDiscount.label : undefined,
    paymentDiscountMinOrder: verification.paymentDiscount?.minOrder,
    paymentDiscountMaxDiscount: verification.paymentDiscount?.maxDiscount,
    totalDiscount: (verification.couponDiscount || 0) + (verification.paymentDiscount?.amount || 0),
    stockReserved: isReservedInitial,
    stockDeducted: !isReservedInitial,
    stockReleased: false,
    inventoryStatus: isReservedInitial ? "RESERVED" : "DEDUCTED",
    paymentAuditTrail: []
  });

  appendPaymentAudit(newOrder, {
    action: "ORDER_PLACED",
    performedBy: userEmail || userId || "Customer",
    previousPaymentStatus: "None",
    newPaymentStatus: initialPaymentStatus,
    amount: newOrder.total,
    reason: `Order placed via ${paymentMethod}`
  });

  appendPaymentAudit(newOrder, {
    action: isReservedInitial ? "STOCK_RESERVED" : "STOCK_DEDUCTED",
    performedBy: userEmail || userId || "Customer",
    previousPaymentStatus: "None",
    newPaymentStatus: initialPaymentStatus,
    amount: newOrder.total,
    reason: isReservedInitial
      ? "Inventory stock reserved pending payment verification"
      : "Inventory stock permanently deducted for order"
  });

  if (initialPaymentStatus === "PENDING_VERIFICATION") {
    appendPaymentAudit(newOrder, {
      action: "VERIFICATION_PENDING",
      performedBy: userEmail || userId || "Customer",
      previousPaymentStatus: "Pending",
      newPaymentStatus: "PENDING_VERIFICATION",
      amount: newOrder.total,
      reason: `Direct UPI reference ${submittedUtr || "screenshot"} submitted for verification`
    });
  }

  try {
    await syncOrderToSupabase(newOrder);
  } catch (err) {
    await releaseOrderStock(newOrder, "Order creation database rollback", "System").catch(() => {});
    throw err;
  }

  const notifMsg = initialPaymentStatus === "PENDING_VERIFICATION"
    ? `Your order #${newOrder.id} of ₹${newOrder.total} has been placed. Your payment reference has been submitted and is PENDING VERIFICATION by our store admin.`
    : `Your order #${newOrder.id} of ₹${newOrder.total} was placed with verified pricing. We're packing your fresh harvest now.`;

  await syncNotificationToSupabase({
    id: "notif_" + Date.now(),
    userId: newOrder.userId,
    title: initialPaymentStatus === "PENDING_VERIFICATION" ? "Order Placed (Verification Pending) ⏳" : "Order Received successfully! 📦",
    body: notifMsg,
    type: "order",
    read: false,
    createdAt: new Date().toISOString()
  });

  broadcastRealtimeEvent({
    table: "orders",
    eventType: "INSERT",
    new: newOrder
  });

  res.status(201).json(newOrder);
}));

router.post("/api/upload-screenshot", asyncHandler(async (req, res) => {
  const authUserId = await getUserIdFromRequestAsync(req);
  const isAdmin = !authUserId ? await verifyAdminRequest(req) : true;
  if (!authUserId && !isAdmin) {
    return res.status(401).json({ error: "Authentication required to upload payment screenshots." });
  }
  const { image, orderId } = req.body || {};
  if (!image) {
    return res.status(400).json({ error: "No image provided" });
  }
  const savedUrl = await saveScreenshotToStorageAsync(image, orderId || "upload");
  res.json({ success: true, url: savedUrl });
}));

const handleOrderUpdate = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const existingOrder = await getOrderByIdFromDb(id);
  if (!existingOrder) {
    return res.status(404).json({ success: false, error: "Order not found" });
  }

  const previousOrder = { ...existingOrder };
  const { status, paymentStatus, adminRemarks, assignedRider, utr, upiIdUsed, screenshotUrl } = req.body || {};

  const isAdmin = await verifyAdminRequest(req);
  const authUserId = await getUserIdFromRequestAsync(req);
  const isOwner = Boolean(authUserId && String(authUserId) === String(existingOrder.userId));
  const isResubmittingProof =
    isOwner &&
    !isAdmin &&
    (utr !== undefined || screenshotUrl !== undefined) &&
    (paymentStatus === undefined || paymentStatus === "PENDING_VERIFICATION" || paymentStatus === "Pending");

  if (!isAdmin && !isResubmittingProof) {
    return res.status(403).json({ error: "Administrative authorization required to update orders or payment status." });
  }

  const adminActor = isAdmin
    ? await getAdminIdentityFromRequest(req)
    : String(existingOrder.userEmail || existingOrder.userId || "Customer");

  const newUtr = utr !== undefined ? String(utr).trim() : undefined;
  if (newUtr && newUtr.length >= 4) {
    const formatCheck = validateUtrFormat(newUtr);
    if (!formatCheck.valid && !screenshotUrl) {
      return res.status(400).json({ error: formatCheck.error, code: "INVALID_UTR_FORMAT" });
    }
    const duplicateOrder = await findDuplicateUtrInDb(newUtr, id);
    if (duplicateOrder) {
      return res.status(400).json({
        error: `Bank Reference / UTR "${newUtr}" is already in use by order #${duplicateOrder.id}. Duplicate payment reference cannot be accepted.`,
        code: "DUPLICATE_UTR"
      });
    }
  }

  let finalPaymentStatus = paymentStatus !== undefined ? paymentStatus : existingOrder.paymentStatus;
  let finalStatus = status !== undefined ? status : existingOrder.status;

  if (isResubmittingProof) {
    finalPaymentStatus = "PENDING_VERIFICATION";
    if (existingOrder.stockReleased || (!existingOrder.stockReserved && !existingOrder.stockDeducted)) {
      const reReserve = await reserveOrderStock(existingOrder.items);
      if (!reReserve.success) {
        return res.status(400).json({
          error: `Cannot re-reserve stock: ${reReserve.error || "Items are currently out of stock."}`,
          code: "INSUFFICIENT_STOCK"
        });
      }
      existingOrder.stockReserved = true;
      existingOrder.stockDeducted = false;
      existingOrder.stockReleased = false;
      existingOrder.inventoryStatus = "RESERVED";
      appendPaymentAudit(existingOrder, {
        action: "STOCK_RESERVED",
        performedBy: adminActor,
        previousPaymentStatus: existingOrder.paymentStatus,
        newPaymentStatus: "PENDING_VERIFICATION",
        amount: existingOrder.total,
        reason: "Stock re-reserved after customer resubmitted payment proof"
      });
    }
    appendPaymentAudit(existingOrder, {
      action: "VERIFICATION_PENDING",
      performedBy: adminActor,
      previousPaymentStatus: existingOrder.paymentStatus,
      newPaymentStatus: "PENDING_VERIFICATION",
      reason: `Customer resubmitted payment proof (UTR: ${newUtr || "Screenshot"})`
    });
  }

  if (isAdmin && paymentStatus !== undefined && paymentStatus !== existingOrder.paymentStatus) {
    if (paymentStatus === "Paid") {
      if (normalizeOrderStatus(existingOrder.status) === "New Orders" && status === undefined) {
        finalStatus = "Confirmed";
      }
      await permanentlyConsumeOrderStock(existingOrder, adminActor, adminRemarks || "Payment received and verified in bank account by administrator");
      appendPaymentAudit(existingOrder, {
        action: "PAYMENT_VERIFIED",
        performedBy: adminActor,
        previousPaymentStatus: existingOrder.paymentStatus,
        newPaymentStatus: "Paid",
        amount: existingOrder.total,
        reason: adminRemarks || "Payment received and verified in bank account by administrator"
      });
    } else if (paymentStatus === "Rejected") {
      await releaseOrderStock(existingOrder, adminRemarks || "Payment rejected by administrator", adminActor);
      appendPaymentAudit(existingOrder, {
        action: "PAYMENT_REJECTED",
        performedBy: adminActor,
        previousPaymentStatus: existingOrder.paymentStatus,
        newPaymentStatus: "Rejected",
        amount: existingOrder.total,
        reason: adminRemarks || "Payment rejected by administrator"
      });
    } else if (paymentStatus === "Failed") {
      await releaseOrderStock(existingOrder, adminRemarks || "Payment marked failed", adminActor);
      appendPaymentAudit(existingOrder, {
        action: "PAYMENT_FAILED",
        performedBy: adminActor,
        previousPaymentStatus: existingOrder.paymentStatus,
        newPaymentStatus: "Failed",
        reason: adminRemarks || "Payment failed"
      });
    } else if (paymentStatus === "PENDING_VERIFICATION") {
      appendPaymentAudit(existingOrder, {
        action: "VERIFICATION_PENDING",
        performedBy: adminActor,
        previousPaymentStatus: existingOrder.paymentStatus,
        newPaymentStatus: "PENDING_VERIFICATION",
        amount: existingOrder.total,
        reason: adminRemarks || "Payment reset to pending verification by administrator"
      });
    } else if (paymentStatus === "Pending") {
      appendPaymentAudit(existingOrder, {
        action: "PAYMENT_PENDING",
        performedBy: adminActor,
        previousPaymentStatus: existingOrder.paymentStatus,
        newPaymentStatus: "Pending",
        amount: existingOrder.total,
        reason: adminRemarks || "Payment marked pending by administrator"
      });
    }
  }

  if (status === "Cancelled" && existingOrder.status !== "Cancelled") {
    await releaseOrderStock(existingOrder, adminRemarks || "Order cancelled", adminActor);
    if (existingOrder.paymentStatus === "Pending" || existingOrder.paymentStatus === "PENDING_VERIFICATION") {
      finalPaymentStatus = "Cancelled";
    }
    appendPaymentAudit(existingOrder, {
      action: "ORDER_CANCELLED",
      performedBy: adminActor,
      previousPaymentStatus: existingOrder.paymentStatus,
      newPaymentStatus: finalPaymentStatus,
      reason: adminRemarks || "Order cancelled"
    });
  }

  const savedScreenshot = screenshotUrl !== undefined
    ? await saveScreenshotToStorageAsync(screenshotUrl, id)
    : existingOrder.screenshotUrl;

  const updatedOrder = normalizeOrder({
    ...existingOrder,
    status: finalStatus,
    paymentStatus: finalPaymentStatus,
    adminRemarks: adminRemarks !== undefined ? adminRemarks : existingOrder.adminRemarks,
    assignedRider: assignedRider !== undefined ? assignedRider : existingOrder.assignedRider,
    utr: newUtr !== undefined ? newUtr : existingOrder.utr,
    transactionId: newUtr !== undefined ? newUtr : existingOrder.transactionId,
    upiIdUsed: upiIdUsed !== undefined ? upiIdUsed : existingOrder.upiIdUsed,
    screenshotUrl: savedScreenshot,
    paymentScreenshot: savedScreenshot,
    updatedAt: new Date().toISOString()
  });

  await syncOrderToSupabase(updatedOrder);

  if (finalPaymentStatus !== previousOrder.paymentStatus) {
    const matchingTxns = await fetchTable("payment_transactions", {
      filter: (q) => q.eq("order_id", String(updatedOrder.id))
    });
    for (const rawTxn of matchingTxns) {
      const txn = mapTransactionFromDb(rawTxn);
      txn.status = finalPaymentStatus;
      if (adminRemarks) txn.adminNotes = adminRemarks;
      await syncPaymentTransactionToSupabase(txn);
    }
  }

  let notifTitle = `Order Status: ${String(updatedOrder.status).toUpperCase()} 🚨`;
  let notifBody = `Your order #${updatedOrder.id} status has been updated to ${updatedOrder.status}. Remarks: ${updatedOrder.adminRemarks || "None"}`;
  if (finalPaymentStatus === "Rejected") {
    notifTitle = `⚠️ UPI Payment Rejected (Order #${updatedOrder.id})`;
    notifBody = `Your payment could not be verified in our bank account. Please resubmit your payment details or contact support. Remarks: ${updatedOrder.adminRemarks || "No remarks provided"}`;
  } else if (finalPaymentStatus === "Paid" && previousOrder.paymentStatus !== "Paid") {
    notifTitle = `✅ Payment Approved! (Order #${updatedOrder.id})`;
    notifBody = `We've successfully verified your payment of ₹${updatedOrder.total} for order #${updatedOrder.id}. Your order is now confirmed!`;
  } else if (finalPaymentStatus === "PENDING_VERIFICATION" && isResubmittingProof) {
    notifTitle = `🔄 Payment Reference Received (Order #${updatedOrder.id})`;
    notifBody = `Your resubmitted payment reference for Order #${updatedOrder.id} has been received. Our store admin will verify it shortly.`;
  }

  await syncNotificationToSupabase({
    id: "notif_" + Date.now(),
    userId: updatedOrder.userId,
    title: notifTitle,
    body: notifBody,
    type: "order",
    read: false,
    createdAt: new Date().toISOString()
  });

  logAuditEvent(adminActor, "Update Order Details", {
    orderId: id,
    status: finalStatus,
    paymentStatus: finalPaymentStatus,
    adminRemarks,
    assignedRider
  });

  broadcastRealtimeEvent({
    table: "orders",
    eventType: "UPDATE",
    old: previousOrder,
    new: updatedOrder
  });

  res.json({ success: true, order: updatedOrder });
});

router.patch("/api/orders/:id", handleOrderUpdate);
router.put("/api/orders/:id", handleOrderUpdate);
router.patch("/api/orders/:id/status", handleOrderUpdate);
router.put("/api/orders/:id/status", handleOrderUpdate);

// Razorpay Public Key
router.get("/api/payments/razorpay/key", asyncHandler(async (_req, res) => {
  const config = getRazorpayConfig();
  const paymentSettings = await getPaymentSettingsFromDb();
  const isOnlineConfigured = Boolean(config.isConfigured && paymentSettings.enableRazorpay !== false);
  res.json({
    keyId: config.isConfigured ? config.keyId : "",
    enabled: isOnlineConfigured,
    isConfigured: config.isConfigured,
    mode: config.keyId.startsWith("rzp_live") ? "live" : "test"
  });
}));

// Initiate Direct UPI Session (Authenticated Customer or Admin)
router.post("/api/payments/upi/initiate", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  const authUserId = await getUserIdFromRequestAsync(req);
  if (!authUserId && !isAdmin) {
    return res.status(401).json({ error: "Authentication required to initiate UPI payment." });
  }

  const { items, couponCode, userId, userEmail, phone, paymentApp, paymentMethod } = req.body || {};
  if (!isAdmin && userId && userId !== "guest" && String(userId) !== String(authUserId)) {
    return res.status(403).json({ error: "Access denied. Cannot initiate payment for another user." });
  }
  const effectiveUserId = (isAdmin && userId) ? String(userId) : String(authUserId);
  const authUser = await getUserByIdFromDb(effectiveUserId).catch(() => null);
  const resolvedEmail = userEmail || authUser?.email || "";
  const resolvedPhone = phone || authUser?.phone || "";

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Cart is empty. Select fresh items to proceed." });
  }

  const [verification, paymentSettings] = await Promise.all([
    verifyCartAndCalculatePricing(
      items,
      couponCode,
      effectiveUserId,
      resolvedEmail,
      resolvedPhone,
      paymentMethod || paymentApp || "Direct UPI Payment"
    ),
    getPaymentSettingsFromDb()
  ]);

  if (!verification.valid) {
    return res.status(400).json({ error: verification.error || "Cart verification failed." });
  }

  const calculatedSubtotal = verification.subtotal;
  const delivery = verification.delivery;
  const couponDiscount = verification.couponDiscount;
  const calculatedTotal = verification.total;
  const appliedCouponCode = verification.couponApplied || "";

  const orderId = "ORD" + Math.floor(100000 + Math.random() * 900000);
  const upiId = (paymentSettings.upiId || "").trim();
  const businessName = (paymentSettings.businessName || "Sabjies Fresh").trim();
  const encodedBusinessName = encodeURIComponent(businessName);
  const note = encodeURIComponent(`Order ${orderId}`);

  const upiIntentUri = upiId
    ? `upi://pay?pa=${upiId}&pn=${encodedBusinessName}&am=${calculatedTotal.toFixed(2)}&cu=INR&tr=${orderId}&tn=${note}`
    : "";
  const gpayIntentUri = upiIntentUri;
  const phonepeIntentUri = upiId ? `phonepe://pay?pa=${upiId}&pn=${encodedBusinessName}&am=${calculatedTotal.toFixed(2)}&cu=INR&tr=${orderId}&tn=${note}` : "";
  const paytmIntentUri = upiId ? `paytmmp://pay?pa=${upiId}&pn=${encodedBusinessName}&am=${calculatedTotal.toFixed(2)}&cu=INR&tr=${orderId}&tn=${note}` : "";

  let qrCodeUrl = "";
  if (upiIntentUri) {
    try {
      qrCodeUrl = await QRCode.toDataURL(upiIntentUri, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 320,
        color: { dark: "#000000", light: "#ffffff" }
      });
    } catch (qrErr) {
      console.error("Dynamic QR Code generation error:", qrErr);
    }
  }

  const adminQrUrl = paymentSettings.qrCodeUploaded && paymentSettings.qrCodeUrl
    ? paymentSettings.qrCodeUrl
    : "";

  res.json({
    success: true,
    orderId,
    upiId,
    businessName,
    amount: calculatedTotal,
    subtotal: calculatedSubtotal,
    delivery,
    discount: couponDiscount,
    paymentDiscount: verification.paymentDiscount,
    couponApplied: appliedCouponCode,
    upiIntentUri,
    gpayIntentUri,
    phonepeIntentUri,
    paytmIntentUri,
    qrCodeUrl: qrCodeUrl || adminQrUrl,
    adminStaticQrUrl: adminQrUrl,
    hasAdminQr: Boolean(paymentSettings.qrCodeUploaded),
    paymentApp: paymentApp || "gpay",
    expiresInSeconds: 300
  });
}));

// Verify / Submit UPI Proof (Strictly PENDING_VERIFICATION)
const handleUpiProofSubmission = asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  const authUserId = await getUserIdFromRequestAsync(req);
  if (!authUserId && !isAdmin) {
    return res.status(401).json({ error: "Authentication required to submit payment proof." });
  }

  const { orderId, utr, paymentApp, paymentMethod, orderData, screenshotUrl } = req.body || {};

  if (!orderData || !orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
    return res.status(400).json({ error: "Incomplete or empty order cart" });
  }

  if (!isAdmin && orderData.userId && orderData.userId !== "guest" && String(orderData.userId) !== String(authUserId)) {
    return res.status(403).json({ error: "Access denied. Cannot submit payment proof for another user." });
  }

  const cleanOrderId = orderId || orderData.id || ("ORD" + Math.floor(100000 + Math.random() * 900000));
  const submittedUtrRaw = utr || orderData?.utr || orderData?.transactionId;
  const cleanUtr = submittedUtrRaw ? String(submittedUtrRaw).trim() : "";
  const rawScreenshot = screenshotUrl || (orderData && (orderData.screenshotUrl || orderData.paymentScreenshot));

  if (cleanUtr) {
    const formatCheck = validateUtrFormat(cleanUtr);
    if (!formatCheck.valid && !rawScreenshot) {
      return res.status(400).json({
        error: formatCheck.error,
        code: "INVALID_UTR_FORMAT"
      });
    }

    const duplicateOrder = await findDuplicateUtrInDb(cleanUtr, cleanOrderId);
    if (duplicateOrder) {
      return res.status(400).json({
        error: `Bank Reference / UTR "${cleanUtr}" has already been submitted for Order #${duplicateOrder.id}. Duplicate payment references cannot be accepted.`,
        code: "DUPLICATE_UTR"
      });
    }
  }

  const existingOrder = await getOrderByIdFromDb(String(cleanOrderId));
  if (existingOrder) {
    if (!isAdmin && String(existingOrder.userId) !== String(authUserId)) {
      return res.status(403).json({ error: "Access denied. Cannot modify another customer's order." });
    }
    if (cleanUtr) {
      existingOrder.utr = cleanUtr;
      existingOrder.transactionId = cleanUtr;
    }
    if (rawScreenshot) {
      const savedUrl = await saveScreenshotToStorageAsync(rawScreenshot, String(cleanOrderId));
      existingOrder.screenshotUrl = savedUrl;
      existingOrder.paymentScreenshot = savedUrl;
    }
    const prevStatus = existingOrder.paymentStatus;
    existingOrder.paymentStatus = "PENDING_VERIFICATION";
    existingOrder.adminRemarks = cleanUtr
      ? `Direct UPI Reference (${cleanUtr}) submitted - Awaiting store manager bank verification`
      : "Payment proof submitted - Awaiting store manager bank verification";
    existingOrder.updatedAt = new Date().toISOString();

    if (existingOrder.stockReleased || (!existingOrder.stockReserved && !existingOrder.stockDeducted)) {
      const reReserve = await reserveOrderStock(existingOrder.items);
      if (!reReserve.success) {
        return res.status(400).json({
          error: reReserve.error || "Inventory unavailable to reserve for order.",
          code: "INSUFFICIENT_STOCK"
        });
      }
      existingOrder.stockReserved = true;
      existingOrder.stockDeducted = false;
      existingOrder.stockReleased = false;
      existingOrder.inventoryStatus = "RESERVED";
      appendPaymentAudit(existingOrder, {
        action: "STOCK_RESERVED",
        performedBy: existingOrder.userEmail || existingOrder.userId || "Customer",
        previousPaymentStatus: prevStatus,
        newPaymentStatus: "PENDING_VERIFICATION",
        amount: existingOrder.total,
        reason: "Stock reserved for pending UPI payment verification"
      });
    }

    appendPaymentAudit(existingOrder, {
      action: "VERIFICATION_PENDING",
      performedBy: existingOrder.userEmail || existingOrder.userId || "Customer",
      previousPaymentStatus: prevStatus,
      newPaymentStatus: "PENDING_VERIFICATION",
      amount: existingOrder.total,
      reason: `Bank reference ${cleanUtr || "screenshot"} submitted by customer. Awaiting manual admin confirmation.`
    });

    await syncOrderToSupabase(existingOrder);
    broadcastRealtimeEvent({ table: "orders", eventType: "UPDATE", new: existingOrder });

    return res.json({
      success: true,
      verified: false,
      paymentStatus: "PENDING_VERIFICATION",
      status: existingOrder.status,
      order: normalizeOrder(existingOrder),
      transactionId: cleanUtr,
      message: "Payment reference submitted. Your payment is currently PENDING VERIFICATION by our store administrator."
    });
  }

  const appNameMap: Record<string, string> = {
    gpay: "Google Pay (UPI)",
    phonepe: "PhonePe (UPI)",
    paytm: "Paytm (UPI)",
    upi: "Direct UPI Payment",
    card: "Debit/Credit Card",
    netbanking: "Net Banking",
    wallets: "Wallet / PayLater"
  };
  const displayPaymentMethod = paymentMethod || appNameMap[paymentApp] || "Direct UPI Payment";

  const effectiveUserId = (isAdmin && orderData.userId) ? String(orderData.userId) : String(authUserId);
  const authUser = await getUserByIdFromDb(effectiveUserId).catch(() => null);
  const resolvedEmail = orderData.userEmail || authUser?.email || "";
  const resolvedPhone = orderData.phone || authUser?.phone || "";
  const resolvedUserName = orderData.userName || orderData.customerName || authUser?.name || "Valued Customer";

  const [verification, paymentSettings] = await Promise.all([
    verifyCartAndCalculatePricing(
      orderData.items,
      orderData.couponApplied || orderData.couponCode,
      effectiveUserId,
      resolvedEmail,
      resolvedPhone,
      displayPaymentMethod
    ),
    getPaymentSettingsFromDb()
  ]);

  if (!verification.valid) {
    return res.status(400).json({
      error: verification.error || "Authoritative cart pricing verification failed.",
      code: "VERIFICATION_FAILED"
    });
  }

  const reserveResult = await reserveOrderStock(verification.items);
  if (!reserveResult.success) {
    return res.status(400).json({
      error: reserveResult.error || "Inventory unavailable to reserve for order.",
      code: "INSUFFICIENT_STOCK"
    });
  }

  if (verification.couponApplied) {
    await incrementCouponUsage(
      verification.couponApplied,
      String(cleanOrderId),
      effectiveUserId,
      resolvedEmail,
      verification.couponDiscount
    );
  }

  const creationTimestamp = new Date().toISOString();
  const savedScreenshot = await saveScreenshotToStorageAsync(rawScreenshot, String(cleanOrderId));
  const newOrder = normalizeOrder({
    id: cleanOrderId,
    userId: effectiveUserId,
    userEmail: resolvedEmail,
    userName: resolvedUserName,
    phone: resolvedPhone,
    address: orderData.address || "Ghatkopar East",
    items: verification.items.map((it) => normalizeOrderItem(it)),
    payment: displayPaymentMethod,
    paymentGateway: "Direct UPI / NPCI",
    paymentStatus: "PENDING_VERIFICATION",
    transactionId: cleanUtr || "",
    utr: cleanUtr || "",
    screenshotUrl: savedScreenshot,
    paymentScreenshot: savedScreenshot,
    upiIdUsed: paymentSettings.upiId || "merchant@upi",
    subtotal: verification.subtotal,
    delivery: verification.delivery,
    total: verification.total,
    status: "New Orders",
    createdAt: creationTimestamp,
    updatedAt: creationTimestamp,
    couponApplied: verification.couponApplied || "",
    discountApplied: verification.couponDiscount,
    paymentDiscountMethod: verification.paymentDiscount?.applied ? verification.paymentDiscount.method : undefined,
    paymentDiscountType: verification.paymentDiscount?.applied ? verification.paymentDiscount.type : undefined,
    paymentDiscountValue: verification.paymentDiscount?.applied ? verification.paymentDiscount.value : undefined,
    paymentDiscountAmount: verification.paymentDiscount?.amount || 0,
    paymentDiscountLabel: verification.paymentDiscount?.applied ? verification.paymentDiscount.label : undefined,
    paymentDiscountMinOrder: verification.paymentDiscount?.minOrder,
    paymentDiscountMaxDiscount: verification.paymentDiscount?.maxDiscount,
    totalDiscount: (verification.couponDiscount || 0) + (verification.paymentDiscount?.amount || 0),
    stockReserved: true,
    stockDeducted: false,
    stockReleased: false,
    inventoryStatus: "RESERVED",
    paymentAuditTrail: [],
    adminRemarks: cleanUtr
      ? `Direct UPI Reference (${cleanUtr}) submitted - Awaiting store manager bank verification`
      : "Payment proof submitted - Awaiting store manager bank verification"
  });

  appendPaymentAudit(newOrder, {
    action: "ORDER_PLACED",
    performedBy: newOrder.userEmail || newOrder.userId || "Customer",
    previousPaymentStatus: "None",
    newPaymentStatus: "PENDING_VERIFICATION",
    amount: newOrder.total,
    reason: `Order placed via ${displayPaymentMethod}`
  });

  appendPaymentAudit(newOrder, {
    action: "STOCK_RESERVED",
    performedBy: newOrder.userEmail || newOrder.userId || "Customer",
    previousPaymentStatus: "None",
    newPaymentStatus: "PENDING_VERIFICATION",
    amount: newOrder.total,
    reason: "Inventory stock reserved pending payment verification"
  });

  appendPaymentAudit(newOrder, {
    action: "VERIFICATION_PENDING",
    performedBy: newOrder.userEmail || newOrder.userId || "Customer",
    previousPaymentStatus: "Pending",
    newPaymentStatus: "PENDING_VERIFICATION",
    amount: newOrder.total,
    reason: `Bank reference ${cleanUtr || "screenshot"} submitted by customer. Awaiting manual admin confirmation.`
  });

  try {
    await syncOrderToSupabase(newOrder);
  } catch (err) {
    await releaseOrderStock(newOrder, "UPI order creation database rollback", "System").catch(() => {});
    throw err;
  }

  const upiTxnId = cleanUtr ? `txn_upi_${newOrder.id}_${cleanUtr}` : `txn_upi_${newOrder.id}`;
  const upiTxn = {
    id: upiTxnId,
    orderId: newOrder.id,
    userId: newOrder.userId,
    userEmail: newOrder.userEmail,
    amount: newOrder.total,
    currency: "INR",
    gateway: "UPI",
    status: "Pending",
    transactionId: cleanUtr || "",
    utr: cleanUtr || null,
    adminNotes: cleanUtr ? `UTR: ${cleanUtr}` : "Payment proof submitted",
    createdAt: creationTimestamp
  };

  await syncPaymentTransactionToSupabase(upiTxn);

  await syncNotificationToSupabase({
    id: "notif_" + Date.now(),
    userId: newOrder.userId,
    title: "Payment Reference Received (Pending Verification) ⏳",
    body: `Your payment reference (${cleanUtr || "Screenshot"}) for Order #${newOrder.id} has been submitted. Our store admin will verify the deposit in our bank account before confirming your order.`,
    type: "order",
    read: false,
    createdAt: creationTimestamp
  });

  broadcastRealtimeEvent({
    table: "orders",
    eventType: "INSERT",
    new: newOrder
  });

  res.json({
    success: true,
    verified: false,
    paymentStatus: "PENDING_VERIFICATION",
    status: "New Orders",
    order: newOrder,
    transactionId: cleanUtr,
    message: "Payment reference submitted. Your payment is currently PENDING VERIFICATION by our store administrator."
  });
});

router.post("/api/payments/upi/verify", handleUpiProofSubmission);
router.post("/api/payments/upi/submit-proof", handleUpiProofSubmission);

// Create Razorpay Order (Authenticated Customer or Admin; strictly live gateway)
router.post("/api/payments/razorpay/create-order", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  const authUserId = await getUserIdFromRequestAsync(req);
  if (!authUserId && !isAdmin) {
    return res.status(401).json({ error: "Authentication required to create an online payment order." });
  }

  const { items, couponCode, userId, userEmail, userName, phone, address, paymentMethod, idempotencyKey } = req.body || {};

  if (!isAdmin && userId && userId !== "guest" && String(userId) !== String(authUserId)) {
    return res.status(403).json({ error: "Access denied. Cannot create payment order for another user." });
  }
  const effectiveUserId = (isAdmin && userId) ? String(userId) : String(authUserId);
  const authUser = await getUserByIdFromDb(effectiveUserId).catch(() => null);
  const resolvedEmail = userEmail || authUser?.email || "";
  const resolvedPhone = phone || authUser?.phone || "";
  const resolvedName = userName || authUser?.name || "Valued Customer";

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Cart is empty. Select fresh items to proceed." });
  }

  const verification = await verifyCartAndCalculatePricing(
    items,
    couponCode,
    effectiveUserId,
    resolvedEmail,
    resolvedPhone,
    paymentMethod
  );
  if (!verification.valid) {
    return res.status(400).json({ error: verification.error || "Cart pricing verification failed." });
  }

  const calculatedSubtotal = verification.subtotal;
  const calculatedDelivery = verification.delivery;
  const couponDiscount = verification.couponDiscount;
  const couponApplied = verification.couponApplied || "";
  const paymentDiscount = verification.paymentDiscount;
  const paymentDiscountAmount = verification.paymentDiscountAmount || 0;
  const calculatedTotal = verification.total;

  const verifiedOrderItems = verification.items.map((it) => ({
    id: it.id,
    name: it.name,
    vegetableName: it.vegetableName || it.name,
    weight: it.weight,
    weightInGrams: it.weightInGrams,
    price: it.price !== undefined ? it.price : it.sp,
    sp: it.sp !== undefined ? it.sp : it.price,
    quantity: it.quantity !== undefined ? it.quantity : it.qty,
    qty: it.qty !== undefined ? it.qty : it.quantity,
    itemTotal: it.itemTotal !== undefined ? it.itemTotal : it.lineTotal,
    lineTotal: it.lineTotal !== undefined ? it.lineTotal : it.itemTotal,
    emoji: it.emoji,
    formulaText: it.formulaText,
    img: it.img
  }));

  const amountInPaise = calculatedTotal * 100;
  const razorpay = getRazorpayInstance();
  const config = getRazorpayConfig();

  if (!razorpay || !config.isConfigured) {
    return res.status(503).json({
      success: false,
      notConfigured: true,
      error: "Razorpay payment gateway credentials are not configured on the server."
    });
  }

  if (idempotencyKey) {
    const existingRow = await fetchOneRow("orders", (q) => q.eq("idempotency_key", String(idempotencyKey)));
    if (existingRow) {
      const existingPending = normalizeOrderFromDb(existingRow);
      if (
        existingPending &&
        existingPending.paymentStatus === "Pending" &&
        existingPending.razorpayOrderId &&
        (Date.now() - new Date(existingPending.createdAt).getTime() < 10 * 60 * 1000)
      ) {
        return res.json({
          success: true,
          orderId: existingPending.id,
          razorpayOrderId: existingPending.razorpayOrderId,
          amount: existingPending.total * 100,
          currency: "INR",
          keyId: config.keyId,
          state: "INITIATED",
          calculatedDetails: {
            subtotal: existingPending.subtotal,
            delivery: existingPending.delivery,
            discount: existingPending.discountApplied || 0,
            total: existingPending.total,
            couponApplied: existingPending.couponApplied || ""
          }
        });
      }
    }
  }

  const internalOrderId = "ORD" + Math.floor(100000 + Math.random() * 900000);
  const receiptId = "rcpt_" + internalOrderId;

  const stockReservation = await reserveOrderStock(verifiedOrderItems);
  if (!stockReservation.success) {
    return res.status(400).json({
      error: stockReservation.error || "Insufficient stock to fulfill order.",
      code: "INSUFFICIENT_STOCK"
    });
  }

  let razorpayOrder: any;
  try {
    razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: receiptId,
      notes: {
        internalOrderId,
        userId: effectiveUserId,
        userEmail: resolvedEmail,
        userName: resolvedName,
        couponApplied
      }
    });
  } catch (gatewayErr: any) {
    await releaseOrderStock(
      { items: verifiedOrderItems, stockReserved: true, stockReleased: false },
      "Gateway order creation failed",
      "Razorpay Gateway"
    ).catch(() => {});
    const gatewayMsg =
      gatewayErr?.error?.description ||
      gatewayErr?.message ||
      "Failed to create Razorpay payment order.";
    return res.status(502).json({
      success: false,
      error: gatewayMsg,
      code: "RAZORPAY_GATEWAY_ERROR"
    });
  }

  const creationTimestamp = new Date().toISOString();
  const initialOrder = normalizeOrder({
    id: internalOrderId,
    idempotencyKey: idempotencyKey || null,
    userId: effectiveUserId,
    userEmail: resolvedEmail,
    userName: resolvedName,
    phone: resolvedPhone,
    address: address || "Customer Address",
    items: verifiedOrderItems.map((it) => normalizeOrderItem(it)),
    payment: paymentMethod || "Online Payment",
    paymentGateway: "Razorpay Gateway",
    paymentStatus: "Pending",
    status: "New Orders",
    transactionId: "",
    razorpayOrderId: razorpayOrder.id,
    razorpayPaymentId: "",
    razorpaySignature: "",
    subtotal: calculatedSubtotal,
    delivery: calculatedDelivery,
    total: calculatedTotal,
    createdAt: creationTimestamp,
    updatedAt: creationTimestamp,
    couponApplied,
    discountApplied: couponDiscount,
    paymentDiscountMethod: paymentDiscount?.applied ? paymentDiscount.method : undefined,
    paymentDiscountType: paymentDiscount?.applied ? paymentDiscount.type : undefined,
    paymentDiscountValue: paymentDiscount?.applied ? paymentDiscount.value : undefined,
    paymentDiscountAmount,
    paymentDiscountLabel: paymentDiscount?.applied ? paymentDiscount.label : undefined,
    paymentDiscountMinOrder: paymentDiscount?.minOrder,
    paymentDiscountMaxDiscount: paymentDiscount?.maxDiscount,
    totalDiscount: couponDiscount + paymentDiscountAmount,
    stockReserved: true,
    stockDeducted: false,
    stockReleased: false,
    inventoryStatus: "RESERVED",
    paymentAuditTrail: [],
    adminRemarks: `Payment order initialized (${razorpayOrder.id}) - Status: PENDING`
  });

  appendPaymentAudit(initialOrder, {
    action: "PAYMENT_INITIATED",
    performedBy: initialOrder.userEmail || initialOrder.userId || "Customer",
    previousPaymentStatus: "None",
    newPaymentStatus: "Pending",
    amount: initialOrder.total,
    reason: `Razorpay checkout initiated (Gateway Order: ${razorpayOrder.id})`
  });

  try {
    await syncOrderToSupabase(initialOrder);
  } catch (err) {
    await releaseOrderStock(initialOrder, "Razorpay order creation database rollback", "System").catch(() => {});
    throw err;
  }

  const rzpOrderTxn = {
    id: `txn_rzp_ord_${razorpayOrder.id}`,
    orderId: internalOrderId,
    userId: initialOrder.userId,
    userEmail: initialOrder.userEmail,
    amount: calculatedTotal,
    currency: "INR",
    gateway: "Razorpay",
    status: "Pending",
    razorpayOrderId: razorpayOrder.id,
    razorpayPaymentId: "",
    createdAt: new Date().toISOString()
  };

  await syncPaymentTransactionToSupabase(rzpOrderTxn);

  res.json({
    success: true,
    orderId: internalOrderId,
    razorpayOrderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    keyId: config.keyId,
    state: "INITIATED",
    calculatedDetails: {
      subtotal: calculatedSubtotal,
      delivery: calculatedDelivery,
      discount: couponDiscount,
      total: calculatedTotal,
      couponApplied
    }
  });
}));

// Verify Razorpay Payment
router.post("/api/payments/razorpay/verify", asyncHandler(async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    orderId,
    orderData,
    amount,
    currency
  } = req.body || {};

  const config = getRazorpayConfig();
  if (!config.isConfigured || !config.keySecret) {
    return res.status(400).json({ error: "Razorpay payment gateway credentials are not configured on the server." });
  }
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing Razorpay transaction verification signature." });
  }

  const orderRow = await fetchOneRow("orders", (q) => q.eq("razorpay_order_id", String(razorpay_order_id)));
  const targetOrder = orderRow ? normalizeOrderFromDb(orderRow) : null;
  if (!targetOrder) {
    return res.status(400).json({
      success: false,
      error: "No matching internal order found for razorpay_order_id",
      code: "ORDER_NOT_FOUND"
    });
  }

  const clientSpecifiedOrderId = orderId || orderData?.id;
  if (clientSpecifiedOrderId && String(targetOrder.id) !== String(clientSpecifiedOrderId)) {
    return res.status(400).json({
      success: false,
      error: `Order reference mismatch: Razorpay order corresponds to #${targetOrder.id}, not #${clientSpecifiedOrderId}.`,
      code: "ORDER_MISMATCH"
    });
  }

  const reusedRow = await fetchOneRow(
    "orders",
    (q) => q.eq("razorpay_payment_id", String(razorpay_payment_id)).neq("id", String(targetOrder.id)),
    "id"
  );
  if (reusedRow) {
    return res.status(400).json({
      success: false,
      error: `Razorpay payment ID (${razorpay_payment_id}) has already been used for order #${reusedRow.id}. Payment ID reuse is forbidden.`,
      code: "PAYMENT_ID_REUSED"
    });
  }

  if (targetOrder.paymentStatus === "Paid" && targetOrder.razorpayPaymentId === razorpay_payment_id) {
    return res.json({
      success: true,
      state: "PAID",
      order: normalizeOrder(targetOrder),
      message: "Order already verified & confirmed",
      idempotent: true
    });
  }

  const submittedCurrency = currency || orderData?.currency;
  if (submittedCurrency && String(submittedCurrency).toUpperCase() !== "INR") {
    return res.status(400).json({
      success: false,
      error: "Invalid currency. Only INR is supported.",
      code: "INVALID_CURRENCY"
    });
  }

  const submittedAmount = amount !== undefined ? amount : (orderData?.total !== undefined ? orderData.total : undefined);
  if (submittedAmount !== undefined) {
    const numSubmitted = Number(submittedAmount);
    const serverRupees = targetOrder.total;
    const serverPaise = Math.round(targetOrder.total * 100);
    if (numSubmitted !== serverRupees && numSubmitted !== serverPaise) {
      return res.status(400).json({
        success: false,
        error: `Amount manipulation detected. Authoritative order total is ₹${serverRupees} (${serverPaise} paise), but client submitted ${numSubmitted}.`,
        code: "AMOUNT_MISMATCH",
        expectedAmount: serverRupees
      });
    }
  }

  const expectedSignature = crypto
    .createHmac("sha256", config.keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  let isValidSignature = false;
  try {
    const expBuf = Buffer.from(expectedSignature, "hex");
    const actBuf = Buffer.from(String(razorpay_signature), "hex");
    if (expBuf.length === actBuf.length && crypto.timingSafeEqual(expBuf, actBuf)) {
      isValidSignature = true;
    }
  } catch {
    isValidSignature = false;
  }

  if (!isValidSignature) {
    if (targetOrder.paymentStatus !== "Paid") {
      const prevStatus = targetOrder.paymentStatus;
      targetOrder.paymentStatus = "Failed";
      targetOrder.status = "Cancelled";
      targetOrder.adminRemarks = "HMAC signature verification failed (Tampered/Invalid)";
      targetOrder.updatedAt = new Date().toISOString();
      await releaseOrderStock(targetOrder, "Signature verification failed", "Cryptographic Verification");
      appendPaymentAudit(targetOrder, {
        action: "SIGNATURE_VERIFICATION_FAILED",
        performedBy: "Server Cryptographic Verification",
        previousPaymentStatus: prevStatus,
        newPaymentStatus: "Failed",
        amount: targetOrder.total,
        reason: "HMAC SHA256 signature mismatch (Invalid or tampered token)"
      });
      await syncOrderToSupabase(targetOrder);
      broadcastRealtimeEvent({ table: "orders", eventType: "UPDATE", new: targetOrder });
    }

    return res.status(400).json({
      success: false,
      state: "VERIFICATION_FAILED",
      error: "Payment signature verification failed. Invalid transaction signature."
    });
  }

  const prevPaymentStatus = targetOrder.paymentStatus;
  await permanentlyConsumeOrderStock(targetOrder, "Razorpay Gateway (HMAC)", `Payment verified via Razorpay HMAC (${razorpay_payment_id})`);
  targetOrder.paymentStatus = "Paid";
  if (normalizeOrderStatus(targetOrder.status) === "New Orders") {
    targetOrder.status = "Confirmed";
  }
  targetOrder.transactionId = razorpay_payment_id;
  targetOrder.razorpayPaymentId = razorpay_payment_id;
  targetOrder.razorpaySignature = razorpay_signature;
  targetOrder.updatedAt = new Date().toISOString();
  targetOrder.adminRemarks = `Payment verified via Razorpay HMAC (${razorpay_payment_id})`;

  appendPaymentAudit(targetOrder, {
    action: "PAYMENT_VERIFIED",
    performedBy: "Razorpay Gateway (HMAC)",
    previousPaymentStatus: prevPaymentStatus,
    newPaymentStatus: "Paid",
    amount: targetOrder.total,
    reason: `Cryptographic HMAC SHA256 verified payment ID: ${razorpay_payment_id}`
  });

  const confirmedOrder = normalizeOrder(targetOrder);
  await syncOrderToSupabase(confirmedOrder);

  const verifiedTxnId = `txn_rzp_${razorpay_payment_id}`;
  const verifiedTxn = {
    id: verifiedTxnId,
    orderId: confirmedOrder.id,
    userId: confirmedOrder.userId,
    userEmail: confirmedOrder.userEmail,
    amount: confirmedOrder.total,
    currency: "INR",
    gateway: "Razorpay",
    status: "Paid",
    transactionId: razorpay_payment_id,
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    createdAt: new Date().toISOString()
  };
  await syncPaymentTransactionToSupabase(verifiedTxn);

  const pendingOrdTxns = await fetchTable("payment_transactions", {
    filter: (q) => q.eq("razorpay_order_id", String(razorpay_order_id)).neq("id", verifiedTxnId)
  });
  for (const pt of pendingOrdTxns) {
    const mapped = mapTransactionFromDb(pt);
    mapped.status = "Paid";
    mapped.razorpayPaymentId = razorpay_payment_id;
    await syncPaymentTransactionToSupabase(mapped);
  }

  await syncNotificationToSupabase({
    id: "notif_" + Date.now(),
    userId: confirmedOrder.userId,
    title: "Payment Confirmed & Order Placed! 🎉",
    body: `Your online payment of ₹${confirmedOrder.total} for order #${confirmedOrder.id} was confirmed. We are packing your fresh harvest now!`,
    type: "order",
    read: false,
    createdAt: new Date().toISOString()
  });

  if (confirmedOrder.userEmail) {
    sendOrderConfirmationEmail(confirmedOrder.userEmail, confirmedOrder).catch((err) =>
      console.warn("Order confirmation email warning:", err?.message || err)
    );
  }

  broadcastRealtimeEvent({ table: "orders", eventType: "UPDATE", new: confirmedOrder });

  res.json({
    success: true,
    state: "PAID",
    order: confirmedOrder,
    message: "Payment verified and order placed successfully"
  });
}));

// Cancel Razorpay Payment (Authenticated Owner or Admin)
router.post("/api/payments/razorpay/cancel", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  const authUserId = !isAdmin ? await getUserIdFromRequestAsync(req) : null;
  if (!isAdmin && !authUserId) {
    return res.status(401).json({ error: "Authentication required to cancel payment." });
  }

  const { orderId, razorpayOrderId, reason } = req.body || {};
  let targetOrder: any = null;
  if (orderId) {
    targetOrder = await getOrderByIdFromDb(String(orderId));
  } else if (razorpayOrderId) {
    const row = await fetchOneRow("orders", (q) => q.eq("razorpay_order_id", String(razorpayOrderId)));
    targetOrder = row ? normalizeOrderFromDb(row) : null;
  }

  if (targetOrder && !isAdmin && String(targetOrder.userId) !== String(authUserId)) {
    return res.status(403).json({ error: "Access denied. Cannot cancel another customer's payment." });
  }

  if (targetOrder && targetOrder.paymentStatus !== "Paid") {
    const prev = targetOrder.paymentStatus;
    targetOrder.paymentStatus = "Cancelled";
    targetOrder.status = "Cancelled";
    targetOrder.adminRemarks = reason || "Customer dismissed checkout window (Cancelled)";
    targetOrder.updatedAt = new Date().toISOString();
    await releaseOrderStock(targetOrder, reason || "Customer dismissed payment gateway window", "Customer");
    appendPaymentAudit(targetOrder, {
      action: "PAYMENT_CANCELLED",
      performedBy: "Customer",
      previousPaymentStatus: prev,
      newPaymentStatus: "Cancelled",
      amount: targetOrder.total,
      reason: reason || "Customer dismissed payment gateway window"
    });
    await syncOrderToSupabase(targetOrder);
    broadcastRealtimeEvent({ table: "orders", eventType: "UPDATE", new: targetOrder });
  }

  res.json({ success: true, state: "CANCELLED", message: "Payment cancelled" });
}));

// Record Failed Razorpay Payment (Authenticated Owner or Admin)
router.post("/api/payments/razorpay/fail", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  const authUserId = !isAdmin ? await getUserIdFromRequestAsync(req) : null;
  if (!isAdmin && !authUserId) {
    return res.status(401).json({ error: "Authentication required to update payment state." });
  }

  const { orderId, razorpayOrderId, error } = req.body || {};
  let targetOrder: any = null;
  if (orderId) {
    targetOrder = await getOrderByIdFromDb(String(orderId));
  } else if (razorpayOrderId) {
    const row = await fetchOneRow("orders", (q) => q.eq("razorpay_order_id", String(razorpayOrderId)));
    targetOrder = row ? normalizeOrderFromDb(row) : null;
  }

  if (targetOrder && !isAdmin && String(targetOrder.userId) !== String(authUserId)) {
    return res.status(403).json({ error: "Access denied. Cannot modify another customer's payment." });
  }

  if (targetOrder && targetOrder.paymentStatus !== "Paid") {
    const prev = targetOrder.paymentStatus;
    targetOrder.paymentStatus = "Failed";
    targetOrder.status = "Cancelled";
    targetOrder.adminRemarks = error?.description || error?.reason || "Payment declined by bank or gateway";
    targetOrder.updatedAt = new Date().toISOString();
    await releaseOrderStock(targetOrder, error?.description || error?.reason || "Payment declined by bank or gateway", "Razorpay Gateway");
    appendPaymentAudit(targetOrder, {
      action: "PAYMENT_FAILED",
      performedBy: "Gateway/Bank",
      previousPaymentStatus: prev,
      newPaymentStatus: "Failed",
      amount: targetOrder.total,
      reason: error?.description || error?.reason || "Payment declined by bank or gateway"
    });
    await syncOrderToSupabase(targetOrder);
    broadcastRealtimeEvent({ table: "orders", eventType: "UPDATE", new: targetOrder });
  }

  res.json({ success: true, state: "FAILED", message: "Payment failure recorded" });
}));

// Get Razorpay Order Status (Authenticated Owner or Admin)
router.get("/api/payments/razorpay/status/:orderId", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  const authUserId = !isAdmin ? await getUserIdFromRequestAsync(req) : null;
  if (!isAdmin && !authUserId) {
    return res.status(401).json({ error: "Authentication required to inspect payment status." });
  }

  const orderId = sanitizePostgrestValue(String(req.params.orderId || ""));
  const row = await fetchOneRow("orders", (q) => q.or(`id.eq."${orderId}",razorpay_order_id.eq."${orderId}"`));
  const targetOrder = row ? normalizeOrderFromDb(row) : null;

  if (!targetOrder) {
    return res.status(404).json({ error: "Order not found" });
  }
  if (!isAdmin && String(targetOrder.userId) !== String(authUserId)) {
    return res.status(403).json({ error: "Access denied. Cannot inspect another customer's payment status." });
  }

  let state = "INITIATED";
  if (targetOrder.paymentStatus === "Paid") state = "PAID";
  else if (targetOrder.paymentStatus === "Failed") state = "FAILED";
  else if (targetOrder.paymentStatus === "Cancelled") state = "CANCELLED";
  else if (targetOrder.paymentStatus === "Pending") state = "PAYMENT_PENDING";
  else if (targetOrder.paymentStatus === "PENDING_VERIFICATION") state = "PENDING_VERIFICATION";

  res.json({
    success: true,
    orderId: targetOrder.id,
    paymentStatus: targetOrder.paymentStatus,
    status: targetOrder.status,
    state,
    total: targetOrder.total,
    razorpayOrderId: targetOrder.razorpayOrderId,
    transactionId: targetOrder.transactionId
  });
}));

// Razorpay Webhook
router.post("/api/payments/razorpay/webhook", asyncHandler(async (req, res) => {
  const config = getRazorpayConfig();
  const webhookSignature = (req.headers["x-razorpay-signature"] as string) || "";

  if (!webhookSignature) {
    return res.status(400).json({ error: "Missing x-razorpay-signature header" });
  }
  if (!config.webhookSecret) {
    return res.status(400).json({ error: "Razorpay webhook secret is not configured" });
  }

  const rawBodyBuffer: Buffer = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
  const expectedSignature = crypto
    .createHmac("sha256", config.webhookSecret)
    .update(rawBodyBuffer)
    .digest("hex");

  let isValid = false;
  try {
    const expBuf = Buffer.from(expectedSignature, "hex");
    const actBuf = Buffer.from(webhookSignature, "hex");
    if (expBuf.length === actBuf.length && crypto.timingSafeEqual(expBuf, actBuf)) {
      isValid = true;
    }
  } catch {
    isValid = false;
  }

  if (!isValid) {
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  const event = req.body?.event;
  const payload = req.body?.payload;
  if (!event) {
    return res.status(400).json({ error: "Missing event in webhook body" });
  }

  const findTargetOrder = async (razorpayOrderId?: string, razorpayPaymentId?: string, internalOrderId?: string) => {
    const clauses: string[] = [];
    if (razorpayOrderId) clauses.push(`razorpay_order_id.eq."${sanitizePostgrestValue(razorpayOrderId)}"`);
    if (razorpayPaymentId) clauses.push(`razorpay_payment_id.eq."${sanitizePostgrestValue(razorpayPaymentId)}"`);
    if (internalOrderId) clauses.push(`id.eq."${sanitizePostgrestValue(internalOrderId)}"`);
    if (clauses.length === 0) return null;
    const row = await fetchOneRow("orders", (q) => q.or(clauses.join(",")));
    return row ? normalizeOrderFromDb(row) : null;
  };

  if (event === "payment.captured" || event === "order.paid") {
    const paymentEntity = payload?.payment?.entity;
    const orderEntity = payload?.order?.entity;
    const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
    const razorpayPaymentId = paymentEntity?.id;
    const internalOrderId = paymentEntity?.notes?.internalOrderId || orderEntity?.notes?.internalOrderId;

    const initialOrder = await findTargetOrder(razorpayOrderId, razorpayPaymentId, internalOrderId);
    if (!initialOrder) {
      return res.json({ status: "ok", message: "Order not found, ignored" });
    }

    const lockKey = `webhook:capture:${initialOrder.id}`;
    while (activeWebhookProcessing.has(lockKey)) {
      await new Promise((r) => setTimeout(r, 20));
    }

    activeWebhookProcessing.add(lockKey);
    try {
      const freshOrder = await getOrderByIdFromDb(initialOrder.id);
      if (!freshOrder || freshOrder.paymentStatus === "Paid") {
        return res.json({ status: "ok", message: "Order already processed as Paid" });
      }

      const prev = freshOrder.paymentStatus;
      await permanentlyConsumeOrderStock(freshOrder, "Razorpay Webhook", `Webhook confirmed payment captured: ${razorpayPaymentId || razorpayOrderId}`);
      freshOrder.paymentStatus = "Paid";
      if (normalizeOrderStatus(freshOrder.status) === "New Orders") {
        freshOrder.status = "Confirmed";
      }
      if (razorpayPaymentId) {
        freshOrder.razorpayPaymentId = razorpayPaymentId;
        freshOrder.transactionId = razorpayPaymentId;
      }
      freshOrder.updatedAt = new Date().toISOString();

      appendPaymentAudit(freshOrder, {
        action: "PAYMENT_CAPTURED_WEBHOOK",
        performedBy: "Razorpay Webhook",
        previousPaymentStatus: prev,
        newPaymentStatus: "Paid",
        amount: freshOrder.total,
        reason: `Webhook confirmed payment captured: ${razorpayPaymentId || razorpayOrderId}`
      });

      const rzpPaymentId = razorpayPaymentId || freshOrder.razorpayPaymentId;
      const webhookTxnId = rzpPaymentId ? `txn_rzp_${rzpPaymentId}` : `txn_rzp_ord_${razorpayOrderId}`;
      const capturedTxn = {
        id: webhookTxnId,
        orderId: freshOrder.id,
        userId: freshOrder.userId,
        userEmail: freshOrder.userEmail,
        amount: freshOrder.total,
        currency: "INR",
        gateway: "Razorpay",
        status: "Paid",
        transactionId: rzpPaymentId || null,
        razorpayOrderId: razorpayOrderId || null,
        razorpayPaymentId: rzpPaymentId || null,
        adminNotes: "Captured via Razorpay Webhook",
        createdAt: new Date().toISOString()
      };

      await syncPaymentTransactionToSupabase(capturedTxn);
      await syncOrderToSupabase(freshOrder);
      broadcastRealtimeEvent({ table: "orders", eventType: "UPDATE", new: freshOrder });

      if (freshOrder.userEmail) {
        sendOrderConfirmationEmail(freshOrder.userEmail, freshOrder).catch(() => {});
      }
    } finally {
      activeWebhookProcessing.delete(lockKey);
    }

    return res.json({ status: "ok", message: "Payment capture webhook processed" });
  } else if (event === "payment.failed") {
    const paymentEntity = payload?.payment?.entity;
    const razorpayOrderId = paymentEntity?.order_id || payload?.order?.entity?.id;
    const internalOrderId = paymentEntity?.notes?.internalOrderId;

    const initialOrder = await findTargetOrder(razorpayOrderId, undefined, internalOrderId);
    if (!initialOrder) {
      return res.json({ status: "ok", message: "Order not found, ignored" });
    }

    const lockKey = `webhook:failed:${initialOrder.id}`;
    while (activeWebhookProcessing.has(lockKey)) {
      await new Promise((r) => setTimeout(r, 20));
    }

    activeWebhookProcessing.add(lockKey);
    try {
      const freshOrder = await getOrderByIdFromDb(initialOrder.id);
      if (!freshOrder || freshOrder.paymentStatus === "Paid") {
        return res.json({ status: "ok", message: "Order already paid, ignoring failure webhook" });
      }
      if (freshOrder.paymentStatus === "Failed" && freshOrder.stockReleased) {
        return res.json({ status: "ok", message: "Payment failure already processed" });
      }

      const prev = freshOrder.paymentStatus;
      freshOrder.paymentStatus = "Failed";
      freshOrder.status = "Cancelled";
      freshOrder.updatedAt = new Date().toISOString();
      if (freshOrder.stockReserved && !freshOrder.stockReleased) {
        await releaseOrderStock(freshOrder, paymentEntity?.error_description || "Webhook reported payment failure", "Razorpay Webhook");
      }
      appendPaymentAudit(freshOrder, {
        action: "PAYMENT_FAILED_WEBHOOK",
        performedBy: "Razorpay Webhook",
        previousPaymentStatus: prev,
        newPaymentStatus: "Failed",
        amount: freshOrder.total,
        reason: paymentEntity?.error_description || "Webhook reported payment failure"
      });

      const failTxns = await fetchTable("payment_transactions", {
        filter: (q) => q.eq("order_id", String(freshOrder.id))
      });
      for (const ft of failTxns) {
        const mapped = mapTransactionFromDb(ft);
        mapped.status = "Failed";
        mapped.adminNotes = paymentEntity?.error_description || "Webhook reported payment failure";
        await syncPaymentTransactionToSupabase(mapped);
      }

      await syncOrderToSupabase(freshOrder);
      broadcastRealtimeEvent({ table: "orders", eventType: "UPDATE", new: freshOrder });
    } finally {
      activeWebhookProcessing.delete(lockKey);
    }

    return res.json({ status: "ok", message: "Payment failure webhook processed" });
  }

  res.json({ status: "ok", message: `Unhandled event: ${event}` });
}));

// Admin Refund Handler
const handleOrderRefund = asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ error: "Administrative authorization required to process refunds." });
  }

  const orderId = req.params.id || req.body?.orderId;
  const { amount, reason, restoreStock } = req.body || {};

  const initialOrder = await getOrderByIdFromDb(String(orderId || ""));
  if (!initialOrder) {
    return res.status(404).json({ error: "Order not found" });
  }

  const refundLockKey = `refund:${initialOrder.id}`;
  while (activeRefundLocks.has(refundLockKey)) {
    await new Promise((r) => setTimeout(r, 20));
  }
  activeRefundLocks.add(refundLockKey);

  try {
    const targetOrder = await getOrderByIdFromDb(initialOrder.id);
    if (!targetOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (targetOrder.paymentStatus === "Refunded" || Number(targetOrder.refundAmount || 0) >= targetOrder.total) {
      return res.status(400).json({ error: "Order is already fully refunded.", code: "ALREADY_REFUNDED" });
    }
    if (targetOrder.paymentStatus !== "Paid" && targetOrder.paymentStatus !== "Partially Refunded") {
      return res.status(400).json({ error: `Cannot refund order with payment status: ${targetOrder.paymentStatus}`, code: "INVALID_ORDER_STATUS" });
    }

    const currentRefunded = Number(targetOrder.refundAmount || 0);
    const maxRefundable = Math.round((targetOrder.total - currentRefunded) * 100) / 100;
    if (maxRefundable <= 0) {
      return res.status(400).json({ error: "Order is already fully refunded.", code: "ALREADY_REFUNDED" });
    }

    const rawAmount = amount;
    if (rawAmount === undefined || rawAmount === null || rawAmount === "") {
      return res.status(400).json({ error: "Refund amount is required and must be a valid number.", code: "INVALID_AMOUNT" });
    }
    const requestedAmount = Number(rawAmount);
    if (typeof rawAmount === "boolean" || isNaN(requestedAmount) || !isFinite(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({ error: "Invalid refund amount requested. Amount must be a positive number greater than zero.", code: "INVALID_AMOUNT" });
    }

    if (requestedAmount > maxRefundable) {
      return res.status(400).json({
        error: `Requested refund (₹${requestedAmount}) exceeds maximum refundable balance (₹${maxRefundable}).`,
        code: "EXCESSIVE_REFUND",
        remainingRefundable: maxRefundable
      });
    }

    const idempotencyKey = req.body?.idempotencyKey || (req.headers["x-idempotency-key"] as string) || req.body?.refundRequestId;
    if (idempotencyKey) {
      const existingRefund = (targetOrder.refundHistory || []).find((r: any) => r.idempotencyKey === idempotencyKey);
      if (existingRefund) {
        return res.json({
          success: true,
          order: normalizeOrder(targetOrder),
          refund: existingRefund,
          idempotent: true
        });
      }
    }

    const newRefundTotal = Math.round((currentRefunded + requestedAmount) * 100) / 100;
    const isFullRefund = newRefundTotal >= targetOrder.total;
    const newPaymentStatus: CanonicalPaymentStatus = isFullRefund ? "Refunded" : "Partially Refunded";

    const razorpay = getRazorpayInstance();
    const config = getRazorpayConfig();
    const uniqueRefundId = "rfnd_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex");
    let finalRefundId = uniqueRefundId;

    if (targetOrder.razorpayPaymentId && !req.body?.recordManual) {
      if (!razorpay || !config.isConfigured) {
        return res.status(503).json({
          error: "Razorpay gateway credentials are not configured on the server. Live gateway refund cannot be processed.",
          code: "RAZORPAY_NOT_CONFIGURED"
        });
      }
      try {
        const gatewayRefundResponse = await razorpay.payments.refund(targetOrder.razorpayPaymentId, {
          amount: Math.round(requestedAmount * 100),
          notes: { reason: reason || "Merchant approved refund", orderId: String(targetOrder.id) }
        });
        if (gatewayRefundResponse?.id) {
          finalRefundId = gatewayRefundResponse.id;
        }
      } catch (err: any) {
        return res.status(502).json({
          error: `Razorpay refund failed: ${err?.error?.description || err?.message || "Gateway error"}`,
          code: "RAZORPAY_REFUND_FAILED"
        });
      }
    }

    const adminId = await getAdminIdentityFromRequest(req);
    let didRestoreStock = false;
    if (restoreStock) {
      didRestoreStock = await releaseOrderStock(targetOrder, reason || "Refund inventory restoration", String(adminId || "Admin"));
    }

    const previousPaymentStatus = targetOrder.paymentStatus;
    targetOrder.paymentStatus = newPaymentStatus;
    targetOrder.refundAmount = newRefundTotal;
    targetOrder.refundId = finalRefundId;
    targetOrder.refundStatus = "Processed";
    targetOrder.refundReason = reason || "Admin processed refund";
    targetOrder.refundedAt = new Date().toISOString();
    targetOrder.updatedAt = new Date().toISOString();

    if (!Array.isArray(targetOrder.refundHistory)) {
      targetOrder.refundHistory = [];
    }
    const refundRecord = {
      id: finalRefundId,
      refundId: finalRefundId,
      idempotencyKey: idempotencyKey || null,
      amount: requestedAmount,
      totalRefundedSoFar: newRefundTotal,
      remainingRefundable: Math.max(0, Math.round((targetOrder.total - newRefundTotal) * 100) / 100),
      reason: reason || "Admin processed refund",
      status: "Processed",
      restoredStock: didRestoreStock,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      processedBy: String(adminId),
      adminId: String(adminId)
    };
    targetOrder.refundHistory.unshift(refundRecord);

    const refundTxn = {
      id: `txn_rfnd_${finalRefundId}`,
      orderId: targetOrder.id,
      userId: targetOrder.userId,
      userEmail: targetOrder.userEmail,
      amount: requestedAmount,
      currency: "INR",
      gateway: targetOrder.paymentGateway || (targetOrder.razorpayPaymentId ? "Razorpay" : (targetOrder.upiIdUsed ? "UPI" : "Manual")),
      status: "Refunded",
      transactionId: finalRefundId,
      razorpayPaymentId: targetOrder.razorpayPaymentId || null,
      adminNotes: `${isFullRefund ? "Full" : "Partial"} refund of ₹${requestedAmount}: ${reason || ""}`,
      createdAt: new Date().toISOString()
    };

    appendPaymentAudit(targetOrder, {
      action: isFullRefund ? "PAYMENT_REFUNDED" : "PAYMENT_PARTIALLY_REFUNDED",
      performedBy: String(adminId),
      previousPaymentStatus,
      newPaymentStatus,
      amount: requestedAmount,
      reason: `${isFullRefund ? "Full" : "Partial"} refund of ₹${requestedAmount} processed. ${reason || ""}`
    });

    await syncOrderToSupabase(targetOrder);
    await syncPaymentTransactionToSupabase(refundTxn);

    await syncNotificationToSupabase({
      id: "notif_" + Date.now(),
      userId: targetOrder.userId,
      title: "Refund Processed 💸",
      body: `A refund of ₹${requestedAmount} for Order #${targetOrder.id} has been processed (${newPaymentStatus}).`,
      type: "order",
      read: false,
      createdAt: new Date().toISOString()
    });

    broadcastRealtimeEvent({ table: "orders", eventType: "UPDATE", new: targetOrder });
    logAuditEvent(String(adminId), "Process Order Refund", {
      orderId: targetOrder.id,
      requestedAmount,
      newRefundTotal,
      reason,
      restoreStock
    });

    res.json({
      success: true,
      order: normalizeOrder(targetOrder),
      refund: refundRecord
    });
  } finally {
    activeRefundLocks.delete(refundLockKey);
  }
});

router.post("/api/payments/razorpay/refund", handleOrderRefund);
router.post("/api/orders/:id/refund", handleOrderRefund);

router.get("/api/payments/transactions", asyncHandler(async (req, res) => {
  if (!(await verifyAdminRequest(req))) {
    return res.status(403).json({ error: "Access denied" });
  }
  const rows = await fetchAllRows("payment_transactions", {
    orderBy: { column: "created_at", ascending: false }
  });
  res.json(rows.map(mapTransactionFromDb));
}));

// Payment & Business Settings (Public GET, Admin POST)
router.get("/api/payment-settings", asyncHandler(async (_req, res) => {
  const config = getRazorpayConfig();
  const paymentSettings = await getPaymentSettingsFromDb();
  const isOnlineConfigured = Boolean(config.isConfigured && paymentSettings.enableRazorpay !== false);
  res.json({
    ...paymentSettings,
    enableRazorpay: isOnlineConfigured,
    razorpayKeyIdConfigured: config.isConfigured
  });
}));

router.get("/api/business-settings", asyncHandler(async (_req, res) => {
  const settings = await getBusinessSettingsFromDb();
  res.json(settings);
}));

router.post("/api/payment-settings", asyncHandler(async (req, res) => {
  if (!(await verifyAdminRequest(req))) {
    return res.status(403).json({ error: "Access denied. Administrator privileges required." });
  }

  const current = await getPaymentSettingsFromDb();
  const { businessName, upiId, instructions, enableUpi, enableCod, enableRazorpay, autoApproveUpi } = req.body || {};

  const updated = {
    ...current,
    businessName: businessName ? String(businessName).trim() : current.businessName,
    upiId: upiId ? String(upiId).trim() : current.upiId,
    instructions: instructions !== undefined ? String(instructions).trim() : current.instructions,
    enableUpi: enableUpi !== undefined ? Boolean(enableUpi) : current.enableUpi,
    enableCod: enableCod !== undefined ? Boolean(enableCod) : current.enableCod,
    enableRazorpay: enableRazorpay !== undefined ? Boolean(enableRazorpay) : (current.enableRazorpay !== false),
    autoApproveUpi: autoApproveUpi !== undefined ? Boolean(autoApproveUpi) : current.autoApproveUpi
  };

  await upsertTable("payment_settings", [{
    id: 1,
    business_name: updated.businessName,
    upi_id: updated.upiId,
    qr_code_url: updated.qrCodeUrl || "",
    qr_code_file_name: updated.qrCodeFileName || "",
    qr_code_data_url: updated.qrCodeDataUrl || "",
    qr_code_uploaded: Boolean(updated.qrCodeUploaded),
    qr_code_uploaded_at: updated.qrCodeUploadedAt || null,
    instructions: updated.instructions || "",
    enable_upi: updated.enableUpi,
    enable_cod: updated.enableCod,
    enable_razorpay: updated.enableRazorpay,
    auto_approve_upi: updated.autoApproveUpi
  }], "id");

  const adminId = await getAdminIdentityFromRequest(req);
  logAuditEvent(adminId, "Update Payment Settings", { businessName, upiId, enableUpi, enableCod, enableRazorpay, autoApproveUpi });

  const config = getRazorpayConfig();
  res.json({
    success: true,
    settings: {
      ...updated,
      razorpayKeyIdConfigured: config.isConfigured
    }
  });
}));

// Public QR Image stream (Supabase Storage redirect or inline data URL)
router.get("/api/payment-settings/qr-image", asyncHandler(async (_req, res) => {
  const paymentSettings = await getPaymentSettingsFromDb();
  if (!paymentSettings.qrCodeUploaded && !paymentSettings.qrCodeDataUrl) {
    return res.status(404).send("Payment QR is currently unavailable.");
  }

  if (paymentSettings.qrCodeUrl && (paymentSettings.qrCodeUrl.startsWith("http://") || paymentSettings.qrCodeUrl.startsWith("https://"))) {
    return res.redirect(paymentSettings.qrCodeUrl);
  }

  if (paymentSettings.qrCodeFileName && isSupabaseConfigured && supabase) {
    const { data } = supabase.storage.from("qr_codes").getPublicUrl(paymentSettings.qrCodeFileName);
    if (data?.publicUrl) {
      return res.redirect(data.publicUrl);
    }
  }

  if (paymentSettings.qrCodeDataUrl) {
    const matches = paymentSettings.qrCodeDataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.*)$/);
    if (matches) {
      const contentType = matches[1];
      const buffer = Buffer.from(matches[2], "base64");
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
      return res.send(buffer);
    }
  }

  return res.status(404).send("Payment QR is currently unavailable.");
}));

// Public coupon validation
router.post("/api/coupons/validate", asyncHandler(async (req, res) => {
  const { code, subtotal, userId, userEmail, phone } = req.body || {};
  if (!code) {
    return res.json({ valid: false, message: "Please enter a coupon code." });
  }

  const codeUpper = sanitizePostgrestValue(String(code).trim().toUpperCase());
  const couponRow = await fetchOneRow("coupons", (q) => q.ilike("code", codeUpper));
  const coupon = couponRow ? mapCouponFromDb(couponRow) : null;

  if (!coupon || coupon.status === "Disabled") {
    return res.json({ valid: false, message: "Invalid promo code." });
  }

  const todayStr = new Date().toISOString().split("T")[0];
  if (coupon.startDate && todayStr < coupon.startDate) {
    return res.json({ valid: false, message: "Promo code is upcoming and not yet active." });
  }
  if (coupon.expiry && todayStr > coupon.expiry) {
    return res.json({ valid: false, message: "Promo code has expired." });
  }
  if (coupon.maxRedemptions !== undefined && coupon.maxRedemptions !== null && Number(coupon.maxRedemptions) > 0) {
    if ((coupon.usage || 0) >= Number(coupon.maxRedemptions)) {
      return res.json({ valid: false, message: "Promo code is sold out." });
    }
  }

  const customerLimit = getCouponPerCustomerLimit(coupon);
  if (customerLimit < 99999) {
    const userRedemptionsCount = await getUserCouponRedemptionsCount(codeUpper, userId, userEmail, phone);
    if (userRedemptionsCount >= customerLimit) {
      return res.json({
        valid: false,
        message: `This promo code is limited to ${customerLimit} use(s) per customer and has already been redeemed.`
      });
    }
  }

  if (subtotal !== undefined && Number(subtotal) < (Number(coupon.minOrder) || 0)) {
    return res.json({ valid: false, message: "Minimum order amount not reached." });
  }

  let discountAmount = 0;
  const subNum = Number(subtotal || 0);
  if (coupon.type === "percent") {
    discountAmount = Math.round(subNum * (Number(coupon.discount) / 100));
    if (coupon.maxDiscount && Number(coupon.maxDiscount) > 0) {
      discountAmount = Math.min(Number(coupon.maxDiscount), discountAmount);
    }
  } else if (coupon.type === "free_delivery") {
    discountAmount = 0;
  } else {
    discountAmount = Number(coupon.discount);
  }

  return res.json({
    valid: true,
    code: coupon.code,
    discount: discountAmount,
    type: coupon.type,
    minOrder: coupon.minOrder,
    message: "Promo code applied successfully."
  });
}));

// Public active payment method discounts
router.get("/api/payment-method-discounts", asyncHandler(async (_req, res) => {
  const rows = await fetchAllRows("payment_method_discounts");
  const active = rows
    .map(mapPaymentDiscountFromDb)
    .filter((d) => (d.status || "active").toLowerCase() === "active");
  res.json({
    success: true,
    discounts: active
  });
}));

export default router;
