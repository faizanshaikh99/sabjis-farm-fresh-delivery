import express from "express";
import crypto from "crypto";
import {
  isSupabaseConfigured,
  fetchTable,
  fetchAllRows,
  fetchOneRow,
  fetchTablePaginated,
  countTableRows,
  upsertTable,
  updateRows,
  deleteFromTable,
  deleteManyFromTable,
  uploadToSupabaseStorage,
  deleteFromSupabaseStorage,
  normalizeProductFromDb
} from "../../db/supabaseService";
import { importJsonFilesToSupabase } from "../../db/importJsonToSupabase";
import {
  hashPassword,
  isScryptHash,
  normalizeUser,
  sanitizeUserForResponse,
  normalizePaymentMethodKey,
  normalizeOrderFromDb,
  mapBusinessSettingsFromDb,
  mapAddressFromDb,
  mapReviewFromDb,
  mapCategoryFromDb,
  mapCouponFromDb,
  mapCouponToDb,
  mapPaymentDiscountFromDb,
  mapPaymentDiscountToDb,
  mapNotificationFromDb,
  mapPasswordResetFromDb,
  mapSessionFromDb,
  mapLoginHistoryFromDb,
  mapAuditLogFromDb,
  mapRedemptionLogFromDb
} from "../mappers";
import {
  asyncHandler,
  broadcastRealtimeEvent,
  revokeAllUserSessions,
  getBusinessSettingsFromDb,
  getPaymentSettingsFromDb,
  getUserByIdFromDb,
  syncUserToSupabase,
  syncPasswordResetToSupabase,
  syncNotificationToSupabase,
  logAuditEvent,
  verifyAdminRequest,
  getAdminIdentityFromRequest
} from "../dbQueries";
import { bumpCatalogVersion } from "./catalogRoutes";

const router = express.Router();

// Global Admin Route Protection Middleware
router.use("/api/admin", asyncHandler(async (req, res, next) => {
  if (await verifyAdminRequest(req)) {
    return next();
  }
  return res.status(401).json({ error: "Authentication required. Please log in as an administrator." });
}));

// ── PASSWORD RESET ADMIN WORKFLOW ──
router.get("/api/admin/password-resets", asyncHandler(async (_req, res) => {
  const rows = await fetchAllRows("password_resets", {
    orderBy: { column: "requested_at", ascending: false }
  });
  res.json(rows.map(mapPasswordResetFromDb));
}));

router.post("/api/admin/password-resets/:id/view", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const row = await fetchOneRow("password_resets", (q) => q.eq("id", String(id)));
  if (!row) {
    return res.status(404).json({ error: "Request not found." });
  }

  const request = mapPasswordResetFromDb(row);
  const nowIso = new Date().toISOString();
  if (!request.auditTrail.some((a: any) => a.action === "Admin Viewed")) {
    request.auditTrail.push({
      action: "Admin Viewed",
      timestamp: nowIso,
      notes: "Reviewed by administrator"
    });
    request.updatedAt = nowIso;
    await syncPasswordResetToSupabase(request);
  }

  res.json({ success: true, request });
}));

router.post("/api/admin/password-resets/:id/approve", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tempPassword, adminNotes } = req.body || {};
  if (!tempPassword || String(tempPassword).trim().length < 6) {
    return res.status(400).json({ error: "A temporary password of at least 6 characters is required." });
  }

  const row = await fetchOneRow("password_resets", (q) => q.eq("id", String(id)));
  if (!row) {
    return res.status(404).json({ error: "Request not found." });
  }
  const request = mapPasswordResetFromDb(row);

  const user = request.userId ? await getUserByIdFromDb(String(request.userId)) : null;
  if (!user) {
    return res.status(404).json({ error: "User account not found." });
  }

  const cleanTempPass = String(tempPassword).trim();
  const tempPassHash = hashPassword(cleanTempPass);
  const nowIso = new Date().toISOString();

  user.password = tempPassHash;
  user.mustChangePassword = true;
  await syncUserToSupabase(user);

  request.status = "Approved";
  request.tempPasswordHash = tempPassHash;
  request.adminNotes = adminNotes ? String(adminNotes).trim() : (request.adminNotes || "");
  request.approvedBy = "Administrator";
  request.approvedAt = nowIso;
  request.updatedAt = nowIso;
  request.notificationStatus = "In-App Sent";
  request.auditTrail.push({ action: "Admin Approved", timestamp: nowIso, notes: adminNotes || "Authorized temporary credentials" });
  request.auditTrail.push({ action: "Temporary Password Generated & Hashed", timestamp: nowIso });
  request.auditTrail.push({ action: "Customer In-App Notification Dispatched", timestamp: nowIso });

  await syncPasswordResetToSupabase(request);

  await syncNotificationToSupabase({
    id: "notif_" + Date.now(),
    userId: user.id,
    title: "🔔 Password Reset Approved",
    body: `Your password reset request (Request ID: ${request.id}) has been approved by the administrator. Your Temporary Password: ${cleanTempPass}. Please log in using this temporary password or use 'Check Status' on the login screen to set a new password immediately.`,
    type: "security",
    read: false,
    createdAt: nowIso
  });

  const adminActor = await getAdminIdentityFromRequest(req);
  logAuditEvent(adminActor, "Approved Password Reset", { requestId: id, userId: user.id, email: user.email, adminNotes });

  res.json({ success: true, request, tempPassword: cleanTempPass });
}));

router.post("/api/admin/password-resets/:id/reject", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { adminNotes } = req.body || {};

  const row = await fetchOneRow("password_resets", (q) => q.eq("id", String(id)));
  if (!row) {
    return res.status(404).json({ error: "Request not found." });
  }
  const request = mapPasswordResetFromDb(row);

  const nowIso = new Date().toISOString();
  request.status = "Rejected";
  if (adminNotes) request.adminNotes = String(adminNotes).trim();
  request.updatedAt = nowIso;
  request.notificationStatus = "In-App Sent";
  request.auditTrail.push({ action: "Admin Rejected", timestamp: nowIso, notes: adminNotes || "Rejected by admin" });

  await syncPasswordResetToSupabase(request);

  if (request.userId) {
    await syncNotificationToSupabase({
      id: "notif_" + Date.now(),
      userId: request.userId,
      title: "🔔 Password Reset Request Rejected",
      body: `Your password reset request (Request ID: ${request.id}) was rejected by the administrator. ${adminNotes ? `Reason: ${adminNotes}` : "Please contact customer support for further assistance."}`,
      type: "security",
      read: false,
      createdAt: nowIso
    });
  }

  const adminActor = await getAdminIdentityFromRequest(req);
  logAuditEvent(adminActor, "Rejected Password Reset", { requestId: id, userId: request.userId, email: request.email, adminNotes });

  res.json({ success: true, request });
}));

router.post("/api/admin/password-resets/:id/notes", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { adminNotes } = req.body || {};

  const row = await fetchOneRow("password_resets", (q) => q.eq("id", String(id)));
  if (!row) {
    return res.status(404).json({ error: "Request not found." });
  }
  const request = mapPasswordResetFromDb(row);

  const nowIso = new Date().toISOString();
  request.adminNotes = adminNotes ? String(adminNotes).trim() : "";
  request.updatedAt = nowIso;
  request.auditTrail.push({ action: "Admin Notes Updated", timestamp: nowIso, notes: request.adminNotes });

  await syncPasswordResetToSupabase(request);
  res.json({ success: true, request });
}));

router.post("/api/admin/password-resets/:id/complete", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { adminNotes } = req.body || {};

  const row = await fetchOneRow("password_resets", (q) => q.eq("id", String(id)));
  if (!row) {
    return res.status(404).json({ error: "Request not found." });
  }
  const request = mapPasswordResetFromDb(row);

  const nowIso = new Date().toISOString();
  request.status = "Completed";
  request.used = true;
  if (adminNotes) request.adminNotes = String(adminNotes).trim();
  request.updatedAt = nowIso;
  request.auditTrail.push({ action: "Admin Marked Completed", timestamp: nowIso, notes: adminNotes || "Completed manually by admin" });

  await syncPasswordResetToSupabase(request);
  res.json({ success: true, request });
}));

// ── USER MANAGEMENT ──
router.delete("/api/admin/users/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (id === "admin_greensabjies") {
    return res.status(400).json({ error: "Primary administrator account cannot be deleted." });
  }
  await revokeAllUserSessions(id);
  await deleteFromTable("addresses", "user_id", id);
  await deleteFromTable("users", "id", id);
  res.json({ success: true, message: "User deleted successfully." });
}));

router.post("/api/admin/users/:userId/update-password", asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body || {};

  if (!newPassword || String(newPassword).trim().length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters." });
  }

  const user = await getUserByIdFromDb(userId);
  if (!user) {
    return res.status(404).json({ error: "User account not found." });
  }

  const hashed = hashPassword(String(newPassword).trim());
  user.password = hashed;
  user.mustChangePassword = false;
  await syncUserToSupabase(user);
  await revokeAllUserSessions(user.id);

  const adminActor = await getAdminIdentityFromRequest(req);
  logAuditEvent(adminActor, "Admin Updated User Password", { targetUserId: user.id, email: user.email });

  res.json({
    success: true,
    message: `Password updated successfully for ${user.name}.`
  });
}));

router.post("/api/admin/users/:userId/status", asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { status } = req.body || {};
  if (!status) {
    return res.status(400).json({ error: "Status is required." });
  }

  const user = await getUserByIdFromDb(userId);
  if (!user) {
    return res.status(404).json({ error: "User account not found." });
  }
  if (userId === "admin_greensabjies" && status !== "Active") {
    return res.status(400).json({ error: "Primary administrator account cannot be deactivated." });
  }

  await updateRows(
    "users",
    { status: String(status), updated_at: new Date().toISOString() },
    (q) => q.eq("id", user.id)
  );
  if (String(status).toLowerCase() !== "active") {
    await revokeAllUserSessions(user.id);
  }

  res.json({ success: true, user: { id: user.id, status: String(status) } });
}));

router.post("/api/admin/users/:userId/role-permissions", asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { role, permissions } = req.body || {};

  const user = await getUserByIdFromDb(userId);
  if (!user) {
    return res.status(404).json({ error: "User account not found." });
  }
  if (userId === "admin_greensabjies" && role && role !== "admin") {
    return res.status(400).json({ error: "Primary master administrator role cannot be altered." });
  }

  user.role = role || user.role;
  user.permissions = permissions !== undefined ? permissions : (user.permissions || []);
  await syncUserToSupabase(user);

  await syncNotificationToSupabase({
    id: "notif_" + Date.now(),
    userId,
    title: "Security Profile Updated 🛡️",
    body: `Your account role has been updated to ${String(user.role).toUpperCase()}. Staff permissions adjusted accordingly.`,
    type: "security",
    read: false,
    createdAt: new Date().toISOString()
  });

  res.json({ success: true, user: { id: user.id, role: user.role, permissions: user.permissions } });
}));

// ── QR CODE MANAGEMENT ──
router.post("/api/admin/payment-settings/qr-code", asyncHandler(async (req, res) => {
  const { fileName, fileType, fileData } = req.body || {};
  if (!fileName || !fileType || !fileData) {
    return res.status(400).json({ error: "Invalid payload. Missing fileName, fileType or fileData." });
  }

  const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  if (!allowedTypes.includes(String(fileType).toLowerCase())) {
    return res.status(400).json({ error: "Invalid file format. Only PNG, JPG, JPEG, and WebP are allowed." });
  }

  let base64Data = String(fileData);
  if (base64Data.includes(";base64,")) {
    base64Data = base64Data.split(";base64,")[1];
  }
  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length > 5 * 1024 * 1024) {
    return res.status(400).json({ error: "File size too large. Maximum size allowed is 5MB." });
  }

  const rawExt = (String(fileType) || "image/png").split("/")[1] || "png";
  const extension = rawExt === "jpeg" ? "jpg" : rawExt;
  const uniqueName = `payment_qr_${Date.now()}_${crypto.randomBytes(8).toString("hex")}.${extension}`;

  const currentSettings = await getPaymentSettingsFromDb();
  if (currentSettings.qrCodeFileName) {
    await deleteFromSupabaseStorage("qr_codes", currentSettings.qrCodeFileName);
  }

  const publicQrUrl = await uploadToSupabaseStorage("qr_codes", uniqueName, buffer, String(fileType));

  const nowIso = new Date().toISOString();
  const updatedSettings = {
    ...currentSettings,
    qrCodeUrl: publicQrUrl,
    qrCodeFileName: uniqueName,
    qrCodeDataUrl: "",
    qrCodeUploaded: true,
    qrCodeUploadedAt: nowIso
  };

  await upsertTable("payment_settings", [{
    id: 1,
    business_name: updatedSettings.businessName,
    upi_id: updatedSettings.upiId,
    qr_code_url: updatedSettings.qrCodeUrl,
    qr_code_file_name: updatedSettings.qrCodeFileName,
    qr_code_data_url: "",
    qr_code_uploaded: true,
    qr_code_uploaded_at: nowIso,
    instructions: updatedSettings.instructions || "",
    enable_upi: updatedSettings.enableUpi,
    enable_cod: updatedSettings.enableCod,
    enable_razorpay: updatedSettings.enableRazorpay !== false,
    auto_approve_upi: updatedSettings.autoApproveUpi
  }], "id");

  const adminId = await getAdminIdentityFromRequest(req);
  logAuditEvent(adminId, "Upload Payment QR Code", { fileName, uniqueName, fileType, sizeBytes: buffer.length });

  res.json({ success: true, settings: updatedSettings });
}));

router.delete("/api/admin/payment-settings/qr-code", asyncHandler(async (req, res) => {
  const currentSettings = await getPaymentSettingsFromDb();
  if (currentSettings.qrCodeFileName) {
    await deleteFromSupabaseStorage("qr_codes", currentSettings.qrCodeFileName);
  }

  const updatedSettings = {
    ...currentSettings,
    qrCodeUrl: "",
    qrCodeFileName: "",
    qrCodeDataUrl: "",
    qrCodeUploaded: false,
    qrCodeUploadedAt: null
  };

  await upsertTable("payment_settings", [{
    id: 1,
    qr_code_url: "",
    qr_code_file_name: "",
    qr_code_data_url: "",
    qr_code_uploaded: false,
    qr_code_uploaded_at: null
  }], "id");

  const adminId = await getAdminIdentityFromRequest(req);
  logAuditEvent(adminId, "Delete Payment QR Code", { message: "QR Code removed by administrator" });

  res.json({ success: true, settings: updatedSettings });
}));

// ── AUDIT LOGS & SUPABASE STATUS / SYNC ──
router.get("/api/admin/audit-logs", asyncHandler(async (_req, res) => {
  const rows = await fetchTable("audit_logs", {
    orderBy: { column: "timestamp", ascending: false },
    limit: 500
  });
  res.json(rows.map(mapAuditLogFromDb));
}));

router.get("/api/admin/supabase-status", asyncHandler(async (_req, res) => {
  const [totalUsersCount, totalProductsCount, totalOrdersCount, totalCouponsCount] = await Promise.all([
    countTableRows("users"),
    countTableRows("products"),
    countTableRows("orders"),
    countTableRows("coupons")
  ]);

  res.json({
    configured: isSupabaseConfigured,
    provider: "Supabase PostgreSQL",
    databaseUrl: isSupabaseConfigured ? "Supabase Cloud PostgreSQL (Connected)" : "Not configured",
    totalUsersCount,
    totalProductsCount,
    totalOrdersCount,
    totalCouponsCount,
    timestamp: new Date().toISOString()
  });
}));

router.post("/api/admin/supabase-sync", asyncHandler(async (_req, res) => {
  const result = await importJsonFilesToSupabase({ dryRun: false });
  bumpCatalogVersion();
  res.json(result);
}));

// ── COUPONS CRUD & ANALYTICS ──
router.get("/api/admin/coupons", asyncHandler(async (_req, res) => {
  const rows = await fetchAllRows("coupons");
  res.json(rows.map(mapCouponFromDb));
}));

router.post("/api/admin/coupons", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const { code, discount, minOrder } = body;
  if (!code || discount === undefined || minOrder === undefined) {
    return res.status(400).json({ error: "Code, discount, and minOrder are required." });
  }

  const codeUpper = String(code).trim().toUpperCase();
  const existingRow = await fetchOneRow("coupons", (q) => q.eq("code", codeUpper));
  const existing = existingRow ? mapCouponFromDb(existingRow) : null;

  const newCoupon = {
    code: codeUpper,
    discount: Number(discount),
    minOrder: Number(minOrder),
    maxDiscount: body.maxDiscount !== undefined ? body.maxDiscount : (existing?.maxDiscount ?? null),
    usage: existing ? (existing.usage || 0) : 0,
    type: body.type || "flat",
    expiry: body.expiry || "2026-12-31",
    campaignType: body.campaignType || "Regular Promo Code",
    maxRedemptions: body.maxRedemptions !== undefined ? body.maxRedemptions : null,
    maxPerCustomer: body.maxPerCustomer || "Unlimited",
    startDate: body.startDate || null,
    status: body.status || "Active",
    campaignName: body.campaignName || "",
    igPostUrl: body.igPostUrl || "",
    igReelUrl: body.igReelUrl || "",
    igStoryLink: body.igStoryLink || "",
    campaignNotes: body.campaignNotes || "",
    internalDescription: body.internalDescription || "",
    createdDate: body.createdDate || existing?.createdDate || new Date().toISOString().split("T")[0]
  };

  await upsertTable("coupons", [mapCouponToDb(newCoupon)], "code");
  const allRows = await fetchAllRows("coupons");
  res.json({ success: true, coupons: allRows.map(mapCouponFromDb) });
}));

router.delete("/api/admin/coupons/:code", asyncHandler(async (req, res) => {
  const codeUpper = String(req.params.code).trim().toUpperCase();
  await deleteFromTable("coupons", "code", codeUpper);
  const allRows = await fetchAllRows("coupons");
  res.json({ success: true, coupons: allRows.map(mapCouponFromDb) });
}));

router.get("/api/admin/coupon-redemptions", asyncHandler(async (_req, res) => {
  const rows = await fetchAllRows("redemption_logs", {
    orderBy: { column: "timestamp", ascending: false }
  });
  res.json(rows.map(mapRedemptionLogFromDb));
}));

router.get("/api/admin/coupon-analytics", asyncHandler(async (_req, res) => {
  const [couponRows, orderRows] = await Promise.all([
    fetchAllRows("coupons"),
    fetchAllRows("orders", { columns: "id,coupon_applied,total" })
  ]);
  const coupons = couponRows.map(mapCouponFromDb);

  const totalRedemptions = coupons.reduce((acc, c) => acc + (Number(c.usage) || 0), 0);
  let remainingRedemptions = 0;
  let hasLimitCoupons = false;
  coupons.forEach((c) => {
    if (c.maxRedemptions !== undefined && c.maxRedemptions !== null && Number(c.maxRedemptions) > 0) {
      hasLimitCoupons = true;
      remainingRedemptions += Math.max(0, Number(c.maxRedemptions) - (Number(c.usage) || 0));
    }
  });
  const remainingDisplay = hasLimitCoupons ? remainingRedemptions : "Unlimited";

  let revenueGenerated = 0;
  let totalOrders = 0;
  orderRows.forEach((o: any) => {
    if (o.coupon_applied || o.couponApplied) {
      totalOrders++;
      revenueGenerated += Number(o.total || 0);
    }
  });
  const averageOrderValue = totalOrders > 0 ? Math.round(revenueGenerated / totalOrders) : 0;

  const todayStr = new Date().toISOString().split("T")[0];
  let activeCampaignsCount = 0;
  let expiredCampaignsCount = 0;
  let soldOutCampaignsCount = 0;
  coupons.forEach((c) => {
    const isExpired = c.expiry && todayStr > c.expiry;
    const isSoldOut = c.maxRedemptions && Number(c.maxRedemptions) > 0 && (c.usage || 0) >= Number(c.maxRedemptions);
    const isDisabled = c.status === "Disabled";
    if (isExpired) expiredCampaignsCount++;
    else if (isSoldOut) soldOutCampaignsCount++;
    else if (!isDisabled) activeCampaignsCount++;
  });

  const topPromoCodes = [...coupons]
    .sort((a, b) => (b.usage || 0) - (a.usage || 0))
    .slice(0, 5)
    .map((c) => ({
      code: c.code,
      usage: c.usage || 0,
      discount: c.discount,
      campaignType: c.campaignType || "Regular Promo Code"
    }));

  res.json({
    totalRedemptions,
    remainingRedemptions: remainingDisplay,
    revenueGenerated,
    totalOrders,
    averageOrderValue,
    activeCampaignsCount,
    expiredCampaignsCount,
    soldOutCampaignsCount,
    topPromoCodes
  });
}));

// ── PAYMENT METHOD DISCOUNTS ──
router.get("/api/admin/payment-method-discounts", asyncHandler(async (_req, res) => {
  const rows = await fetchAllRows("payment_method_discounts");
  res.json({
    success: true,
    discounts: rows.map(mapPaymentDiscountFromDb)
  });
}));

router.post("/api/admin/payment-method-discounts", asyncHandler(async (req, res) => {
  const {
    id,
    paymentMethod,
    paymentMethodName,
    discountType,
    discountValue,
    minOrder,
    maxDiscount,
    startDate,
    endDate,
    status
  } = req.body || {};

  if (!paymentMethod || !discountType || discountValue === undefined) {
    return res.status(400).json({
      success: false,
      error: "Payment method, discount type, and discount value are required."
    });
  }

  const numVal = Number(discountValue);
  if (isNaN(numVal) || numVal < 0) {
    return res.status(400).json({
      success: false,
      error: "Discount value must be a non-negative number."
    });
  }
  if (discountType === "percent" && (numVal <= 0 || numVal > 100)) {
    return res.status(400).json({
      success: false,
      error: "Percentage discount must be between 1% and 100%."
    });
  }

  const normalizedKey = normalizePaymentMethodKey(paymentMethod);
  const existingRows = await fetchAllRows("payment_method_discounts");
  const existing = existingRows
    .map(mapPaymentDiscountFromDb)
    .find((d) => (id && String(d.id) === String(id)) || normalizePaymentMethodKey(d.paymentMethod) === normalizedKey);

  const resolvedId = existing?.id || id || `pmd_${normalizedKey}_${Date.now()}`;
  const nowIso = new Date().toISOString();
  const updatedDiscount = {
    id: resolvedId,
    paymentMethod: normalizedKey,
    paymentMethodName: paymentMethodName || paymentMethod,
    discountType: discountType === "percent" ? "percent" : "fixed",
    discountValue: numVal,
    minOrder: (minOrder !== null && minOrder !== undefined && minOrder !== "") ? Number(minOrder) : null,
    maxDiscount: (maxDiscount !== null && maxDiscount !== undefined && maxDiscount !== "") ? Number(maxDiscount) : null,
    startDate: startDate || null,
    endDate: endDate || null,
    status: (status || "active").toLowerCase() === "active" ? "active" : "inactive",
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso
  };

  await upsertTable("payment_method_discounts", [mapPaymentDiscountToDb(updatedDiscount)], "id");
  const allRows = await fetchAllRows("payment_method_discounts");
  res.json({
    success: true,
    message: "Payment method discount saved successfully",
    discount: updatedDiscount,
    discounts: allRows.map(mapPaymentDiscountFromDb)
  });
}));

router.patch("/api/admin/payment-method-discounts/:id/toggle", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const row = await fetchOneRow("payment_method_discounts", (q) => q.eq("id", String(id)));
  if (!row) {
    return res.status(404).json({ success: false, error: "Payment method discount not found" });
  }
  const target = mapPaymentDiscountFromDb(row);
  target.status = target.status === "active" ? "inactive" : "active";
  target.updatedAt = new Date().toISOString();

  await upsertTable("payment_method_discounts", [mapPaymentDiscountToDb(target)], "id");
  const allRows = await fetchAllRows("payment_method_discounts");
  res.json({
    success: true,
    discount: target,
    discounts: allRows.map(mapPaymentDiscountFromDb)
  });
}));

router.delete("/api/admin/payment-method-discounts/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  await deleteFromTable("payment_method_discounts", "id", id);
  const allRows = await fetchAllRows("payment_method_discounts");
  res.json({
    success: true,
    message: "Payment method discount deleted successfully",
    discounts: allRows.map(mapPaymentDiscountFromDb)
  });
}));

// ── BUSINESS SETTINGS & BROADCAST ──
router.get("/api/admin/business-settings", asyncHandler(async (_req, res) => {
  const settings = await getBusinessSettingsFromDb();
  res.json(settings);
}));

router.post("/api/admin/business-settings", asyncHandler(async (req, res) => {
  const current = await getBusinessSettingsFromDb();
  const body = req.body || {};
  const merged = mapBusinessSettingsFromDb({
    ...current,
    ...body,
    minFreeDelivery: body.minFreeDelivery !== undefined ? Number(body.minFreeDelivery) : current.minFreeDelivery,
    standardShipping: body.standardShipping !== undefined ? Number(body.standardShipping) : current.standardShipping,
    gstPercentage: body.gstPercentage !== undefined ? Number(body.gstPercentage) : current.gstPercentage
  });

  await upsertTable("business_settings", [{
    id: 1,
    min_free_delivery: merged.minFreeDelivery,
    standard_shipping: merged.standardShipping,
    gst_percentage: merged.gstPercentage,
    operational_hours_start: merged.operationalHoursStart,
    operational_hours_end: merged.operationalHoursEnd,
    is_open: Boolean(merged.isOpen),
    support_phone: merged.supportPhone,
    address: merged.address,
    business_name: merged.businessName,
    support_email: merged.supportEmail,
    website: merged.website,
    gst_number: merged.gstNumber,
    fssai_license: merged.fssaiLicense,
    business_registration_number: merged.businessRegistrationNumber,
    enable_ig_banner: Boolean(merged.enableIgBanner),
    ig_profile_url: merged.igProfileUrl,
    ig_banner_text: merged.igBannerText
  }], "id");

  res.json({ success: true, settings: merged });
}));

router.post("/api/admin/notifications/broadcast", asyncHandler(async (req, res) => {
  const { title, body, type, targetUserId } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ error: "Title and body are required." });
  }

  const timestamp = new Date().toISOString();
  const rowsToInsert: any[] = [];

  if (targetUserId && targetUserId !== "all") {
    const targetUser = await getUserByIdFromDb(String(targetUserId));
    if (!targetUser) {
      return res.status(404).json({ error: "Target user not found." });
    }
    rowsToInsert.push({
      id: "notif_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      user_id: targetUserId,
      title,
      body,
      type: type || "announcement",
      read: false,
      created_at: timestamp
    });
  } else {
    const users = await fetchAllRows("users", { columns: "id" });
    users.forEach((u: any, idx: number) => {
      rowsToInsert.push({
        id: "notif_" + Date.now() + "_" + idx + "_" + Math.floor(Math.random() * 1000),
        user_id: u.id,
        title,
        body,
        type: type || "announcement",
        read: false,
        created_at: timestamp
      });
    });
  }

  if (rowsToInsert.length > 0) {
    await upsertTable("notifications", rowsToInsert, "id");
  }
  res.json({ success: true, count: rowsToInsert.length });
}));

// ── SYSTEM LOGS ──
router.get("/api/admin/system-logs", asyncHandler(async (_req, res) => {
  const [activeTokensCount, loginRows] = await Promise.all([
    countTableRows("sessions"),
    fetchTable("login_history", {
      orderBy: { column: "timestamp", ascending: false },
      limit: 200
    })
  ]);

  const mappedHistory = loginRows.map(mapLoginHistoryFromDb);
  const failedLogins = mappedHistory.filter((log: any) =>
    String(log.status || "").toLowerCase() === "failed" || log.success === false
  );
  const totalLoginsCount = await countTableRows("login_history");

  const memMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
  res.json({
    activeTokensCount,
    failedLoginsCount: failedLogins.length,
    totalLoginsCount,
    systemPerformance: {
      cpuUsage: `${Math.min(95, Math.max(5, Math.round(process.cpuUsage().user / 1000000) % 45 + 12))}%`,
      ramUsage: `${memMb} MB`,
      apiLatency: "Supabase Connected",
      platform: "Cloud Run Containers (Linux Node.js)",
      status: "Healthy",
      nodeVersion: process.version
    },
    failedLoginRecords: failedLogins.slice(0, 10),
    securityAlerts: failedLogins.length > 5 ? [
      { id: 1, type: "warning", message: "Multiple failed login attempts detected. Rate limits engaged.", timestamp: new Date().toISOString() }
    ] : []
  });
}));

// ── ADMIN MASTER DATABASE EXPLORER & BULK OPS ──
router.get("/api/admin/database", asyncHandler(async (req, res) => {
  const requestedTable = typeof req.query.table === "string" ? req.query.table.trim() : "";
  const limitNum = Math.min(500, Math.max(1, Number(req.query.limit || 200)));
  const offsetNum = Math.max(0, Number(req.query.offset || 0));

  const mapSanitizedSession = (s: any) => {
    const mapped = mapSessionFromDb(s);
    return {
      ...mapped,
      token: mapped.token ? `${String(mapped.token).slice(0, 8)}...` : ""
    };
  };

  if (requestedTable) {
    if (requestedTable === "users") {
      const p = await fetchTablePaginated("users", { limit: limitNum, offset: offsetNum });
      return res.json({ users: p.rows.map((u: any) => sanitizeUserForResponse(normalizeUser(u))), total: p.total, hasMore: p.hasMore });
    }
    if (requestedTable === "products") {
      const p = await fetchTablePaginated("products", { orderBy: { column: "id", ascending: true }, limit: limitNum, offset: offsetNum });
      return res.json({ products: p.rows.map(normalizeProductFromDb).filter(Boolean), total: p.total, hasMore: p.hasMore });
    }
    if (requestedTable === "categories") {
      const rows = await fetchAllRows("categories");
      return res.json({ categories: rows.map(mapCategoryFromDb), total: rows.length, hasMore: false });
    }
    if (requestedTable === "orders" || requestedTable === "payments") {
      const p = await fetchTablePaginated("orders", { orderBy: { column: "created_at", ascending: false }, limit: limitNum, offset: offsetNum });
      const mappedOrders = p.rows.map(normalizeOrderFromDb).filter(Boolean);
      const payments = mappedOrders.map((o: any) => ({
        id: o.transactionId || "PAY_" + o.id,
        orderId: o.id,
        customer: o.userName || o.userEmail || "Guest",
        amount: o.total,
        method: o.payment || "UPI",
        date: o.createdAt,
        status: o.paymentStatus || "Pending"
      }));
      return res.json({ orders: mappedOrders, payments, total: p.total, hasMore: p.hasMore });
    }
    if (requestedTable === "addresses") {
      const p = await fetchTablePaginated("addresses", { limit: limitNum, offset: offsetNum });
      return res.json({ addresses: p.rows.map(mapAddressFromDb), total: p.total, hasMore: p.hasMore });
    }
    if (requestedTable === "reviews") {
      const p = await fetchTablePaginated("reviews", { orderBy: { column: "created_at", ascending: false }, limit: limitNum, offset: offsetNum });
      return res.json({ reviews: p.rows.map(mapReviewFromDb), total: p.total, hasMore: p.hasMore });
    }
    if (requestedTable === "loginHistory") {
      const p = await fetchTablePaginated("login_history", { orderBy: { column: "timestamp", ascending: false }, limit: limitNum, offset: offsetNum });
      return res.json({ loginHistory: p.rows.map(mapLoginHistoryFromDb), total: p.total, hasMore: p.hasMore });
    }
    if (requestedTable === "passwordResets") {
      const p = await fetchTablePaginated("password_resets", { orderBy: { column: "requested_at", ascending: false }, limit: limitNum, offset: offsetNum });
      return res.json({ passwordResets: p.rows.map(mapPasswordResetFromDb), total: p.total, hasMore: p.hasMore });
    }
    if (requestedTable === "sessions") {
      const p = await fetchTablePaginated("sessions", { orderBy: { column: "created_at", ascending: false }, limit: limitNum, offset: offsetNum });
      return res.json({ sessions: p.rows.map(mapSanitizedSession), total: p.total, hasMore: p.hasMore });
    }
    if (requestedTable === "notifications") {
      const p = await fetchTablePaginated("notifications", { orderBy: { column: "created_at", ascending: false }, limit: limitNum, offset: offsetNum });
      return res.json({ notifications: p.rows.map(mapNotificationFromDb), total: p.total, hasMore: p.hasMore });
    }
    return res.status(400).json({ error: `Unknown table: ${requestedTable}` });
  }

  const [
    userRows,
    productRows,
    categoryRows,
    orderRows,
    addressRows,
    reviewRows,
    loginRows,
    resetRows,
    sessionRows,
    notificationRows
  ] = await Promise.all([
    fetchTable("users", { limit: limitNum, offset: offsetNum }),
    fetchTable("products", { orderBy: { column: "id", ascending: true }, limit: limitNum, offset: offsetNum }),
    fetchAllRows("categories"),
    fetchTable("orders", { orderBy: { column: "created_at", ascending: false }, limit: limitNum, offset: offsetNum }),
    fetchTable("addresses", { limit: limitNum, offset: offsetNum }),
    fetchTable("reviews", { orderBy: { column: "created_at", ascending: false }, limit: limitNum, offset: offsetNum }),
    fetchTable("login_history", { orderBy: { column: "timestamp", ascending: false }, limit: limitNum, offset: offsetNum }),
    fetchTable("password_resets", { orderBy: { column: "requested_at", ascending: false }, limit: limitNum, offset: offsetNum }),
    fetchTable("sessions", { orderBy: { column: "created_at", ascending: false }, limit: limitNum, offset: offsetNum }),
    fetchTable("notifications", { orderBy: { column: "created_at", ascending: false }, limit: limitNum, offset: offsetNum })
  ]);

  const mappedOrders = orderRows.map(normalizeOrderFromDb).filter(Boolean);
  const paymentsTable = mappedOrders.map((o: any) => ({
    id: o.transactionId || "PAY_" + o.id,
    orderId: o.id,
    customer: o.userName || o.userEmail || "Guest",
    amount: o.total,
    method: o.payment || "UPI",
    date: o.createdAt,
    status: o.paymentStatus || "Pending"
  }));

  res.json({
    users: userRows.map((u: any) => sanitizeUserForResponse(normalizeUser(u))),
    products: productRows.map(normalizeProductFromDb).filter(Boolean),
    categories: categoryRows.map(mapCategoryFromDb),
    orders: mappedOrders,
    payments: paymentsTable,
    addresses: addressRows.map(mapAddressFromDb),
    reviews: reviewRows.map(mapReviewFromDb),
    loginHistory: loginRows.map(mapLoginHistoryFromDb),
    passwordResets: resetRows.map(mapPasswordResetFromDb),
    sessions: sessionRows.map(mapSanitizedSession),
    notifications: notificationRows.map(mapNotificationFromDb)
  });
}));

router.put("/api/admin/database/:table/:id", asyncHandler(async (req, res) => {
  const { table, id } = req.params;
  const updatedRecord = req.body || {};

  if (table === "users") {
    const existing = await getUserByIdFromDb(id);
    if (!existing) return res.status(404).json({ error: "User not found." });
    if (id === "admin_greensabjies" && ((updatedRecord.role && updatedRecord.role !== "admin") || (updatedRecord.status && updatedRecord.status !== "Active"))) {
      return res.status(400).json({ error: "Primary master administrator account cannot be demoted or deactivated." });
    }
    const rawPwd = updatedRecord.password ? String(updatedRecord.password).trim() : "";
    const nextPassword = rawPwd
      ? (isScryptHash(rawPwd) ? rawPwd : hashPassword(rawPwd))
      : existing.password;
    await syncUserToSupabase({ ...existing, ...updatedRecord, id, password: nextPassword });
  } else if (table === "products") {
    const numId = Number(id);
    await upsertTable("products", [{ ...updatedRecord, id: numId }], "id");
    bumpCatalogVersion();
    broadcastRealtimeEvent({ table: "products", eventType: "UPDATE", new: { ...updatedRecord, id: numId } });
  } else if (table === "categories") {
    await upsertTable("categories", [{ ...updatedRecord, id }], "id");
    bumpCatalogVersion();
  } else if (table === "orders") {
    await upsertTable("orders", [{ ...updatedRecord, id }], "id");
  } else if (table === "addresses") {
    await upsertTable("addresses", [{ ...updatedRecord, id }], "id");
  } else if (table === "reviews") {
    await upsertTable("reviews", [{ ...updatedRecord, id: Number(id) }], "id");
  } else {
    return res.status(400).json({ error: "This system table is read-only." });
  }

  res.json({ success: true });
}));

router.delete("/api/admin/database/:table/:id", asyncHandler(async (req, res) => {
  const { table, id } = req.params;

  if (table === "users") {
    if (id === "admin_greensabjies") {
      return res.status(400).json({ error: "The primary master owner account cannot be deleted." });
    }
    await revokeAllUserSessions(id);
    await deleteFromTable("users", "id", id);
  } else if (table === "products") {
    const numId = Number(id);
    if (isNaN(numId)) return res.status(400).json({ error: "Invalid product ID" });
    await deleteFromTable("products", "id", numId);
    bumpCatalogVersion();
    broadcastRealtimeEvent({ table: "products", eventType: "DELETE", old: { id: numId } });
  } else if (table === "categories") {
    if (id === "all") return res.status(400).json({ error: "Cannot delete master default category." });
    await deleteFromTable("categories", "id", id);
    bumpCatalogVersion();
  } else if (table === "orders") {
    await deleteFromTable("orders", "id", id);
  } else if (table === "addresses") {
    await deleteFromTable("addresses", "id", id);
  } else if (table === "reviews") {
    const numId = Number(id);
    await deleteFromTable("reviews", "id", isNaN(numId) ? id : numId);
  } else if (table === "notifications") {
    await deleteFromTable("notifications", "id", id);
  } else {
    return res.status(400).json({ error: "This system table record cannot be deleted." });
  }

  res.json({ success: true });
}));

async function importRowsToTable(table: string, items: any[]) {
  const allowed = ["users", "products", "orders", "addresses", "reviews", "categories"];
  if (!allowed.includes(table)) {
    return false;
  }
  if (items.length === 0) return true;
  const prepared = table === "users"
    ? items.map((u: any) => {
        const rawPwd = u?.password ? String(u.password).trim() : "";
        return rawPwd && !isScryptHash(rawPwd)
          ? { ...u, password: hashPassword(rawPwd) }
          : u;
      })
    : items;
  await upsertTable(table, prepared, "id");
  if (table === "products" || table === "categories") {
    bumpCatalogVersion();
  }
  return true;
}

router.post("/api/admin/database/import", asyncHandler(async (req, res) => {
  const { table, data } = req.body || {};
  if (!table || !Array.isArray(data)) {
    return res.status(400).json({ error: "Invalid import dataset." });
  }
  const ok = await importRowsToTable(table, data);
  if (!ok) {
    return res.status(400).json({ error: "Table import is not supported for system logs." });
  }
  res.json({ success: true, count: data.length });
}));

router.post("/api/admin/database/:table/bulk-import", asyncHandler(async (req, res) => {
  const { table } = req.params;
  const { items } = req.body || {};
  if (!table || !Array.isArray(items)) {
    return res.status(400).json({ error: "Invalid payload." });
  }
  const ok = await importRowsToTable(table, items);
  if (!ok) {
    return res.status(400).json({ error: "Table import is not supported for system logs." });
  }
  res.json({ success: true, count: items.length });
}));

async function handleBulkDelete(table: string, ids: any[], res: express.Response) {
  const cleanIds = ids.map((x) => String(x));
  if (table === "users") {
    const userIdsToDelete = cleanIds.filter((id) => id !== "admin_greensabjies");
    if (userIdsToDelete.length > 0) {
      await deleteManyFromTable("users", "id", userIdsToDelete);
    }
  } else if (table === "products") {
    const numericIds = cleanIds.map((x) => Number(x)).filter((x) => !isNaN(x));
    if (numericIds.length > 0) {
      await deleteManyFromTable("products", "id", numericIds);
      bumpCatalogVersion();
      numericIds.forEach((id) => broadcastRealtimeEvent({ table: "products", eventType: "DELETE", old: { id } }));
    }
  } else if (table === "orders") {
    if (cleanIds.length > 0) {
      await deleteManyFromTable("orders", "id", cleanIds);
    }
  } else if (table === "addresses") {
    if (cleanIds.length > 0) {
      await deleteManyFromTable("addresses", "id", cleanIds);
    }
  } else if (table === "reviews") {
    const numericIds = cleanIds.map((x) => Number(x)).filter((x) => !isNaN(x));
    if (numericIds.length > 0) {
      await deleteManyFromTable("reviews", "id", numericIds);
    }
  } else if (table === "categories") {
    const catIdsToDelete = cleanIds.filter((id) => id !== "all");
    if (catIdsToDelete.length > 0) {
      await deleteManyFromTable("categories", "id", catIdsToDelete);
      bumpCatalogVersion();
    }
  } else {
    return res.status(400).json({ error: "Bulk delete is not supported for system logs." });
  }
  return res.json({ success: true, count: cleanIds.length });
}

router.post("/api/admin/database/:table/bulk-delete", asyncHandler(async (req, res) => {
  const { table } = req.params;
  const { ids } = req.body || {};
  if (!table || !Array.isArray(ids)) {
    return res.status(400).json({ error: "Invalid payload." });
  }
  return await handleBulkDelete(table, ids, res);
}));

router.post("/api/admin/database/bulk-delete", asyncHandler(async (req, res) => {
  const { table, ids } = req.body || {};
  if (!table || !Array.isArray(ids)) {
    return res.status(400).json({ error: "Invalid payload." });
  }
  return await handleBulkDelete(table, ids, res);
}));

router.post("/api/admin/database/bulk-update", asyncHandler(async (req, res) => {
  const { table, ids, update } = req.body || {};
  if (!table || !Array.isArray(ids) || !update) {
    return res.status(400).json({ error: "Invalid payload." });
  }

  const allowed = ["users", "products", "orders", "addresses", "reviews"];
  if (!allowed.includes(table)) {
    return res.status(400).json({ error: "Bulk update is not supported for system logs." });
  }

  const cleanIds = ids.map((x: any) => (table === "products" || table === "reviews" ? Number(x) : String(x)));
  const safeUpdate = { ...update };
  if (table === "users" && safeUpdate.password && String(safeUpdate.password).trim()) {
    const rawPwd = String(safeUpdate.password).trim();
    safeUpdate.password = isScryptHash(rawPwd) ? rawPwd : hashPassword(rawPwd);
  }

  if (cleanIds.length > 0) {
    await updateRows(table, safeUpdate, (q) => q.in("id", cleanIds));
    if (table === "products") bumpCatalogVersion();
  }
  res.json({ success: true });
}));

export default router;
