import express from "express";
import crypto from "crypto";
import {
  requireSupabase,
  TABLE_SELECT_COLUMNS,
  fetchTable,
  fetchOneRow,
  upsertTable,
  updateRows,
  deleteFromTable,
  deleteWhere
} from "../../db/supabaseService";
import {
  hashPassword,
  isScryptHash,
  verifyPassword,
  isUserAccountActive,
  cleanPhone,
  sanitizePostgrestValue,
  buildPostgrestPhoneFilter,
  maskEmail,
  maskPhone,
  sanitizeUserForResponse,
  mapNotificationFromDb,
  mapPasswordResetFromDb
} from "../mappers";
import {
  asyncHandler,
  markSessionInvalid,
  clearSessionInvalid,
  revokeAllUserSessions,
  getUserByIdFromDb,
  getUserByIdentifierFromDb,
  getAddressesForUserFromDb,
  syncUserToSupabase,
  syncPasswordResetToSupabase,
  syncNotificationToSupabase,
  recordLoginHistoryInDb,
  logAuditEvent,
  extractSessionToken,
  getUserIdFromRequestAsync,
  verifyAdminRequest,
  checkOtpRateLimit,
  isTestSimulationAllowed
} from "../dbQueries";
import {
  isEmailConfigured,
  sendPasswordResetEmail,
  sendPasswordResetOtpEmail,
  recordTestEmailOtp
} from "../../services/emailService";
import {
  isSmsConfigured,
  sendSmsOtp,
  recordTestOtp
} from "../../services/smsService";

const router = express.Router();

// Logout
router.post("/api/auth/logout", asyncHandler(async (req, res) => {
  const sessionId = extractSessionToken(req) || (req.body && req.body.sessionId ? String(req.body.sessionId).trim() : null);

  if (sessionId) {
    markSessionInvalid(sessionId);
    const safeSid = sanitizePostgrestValue(sessionId);
    if (safeSid) {
      await deleteWhere("sessions", (q) => q.or(`id.eq."${safeSid}",token.eq."${safeSid}"`));
    }
  }

  res.json({ success: true, message: "Logged out successfully." });
}));

// Signup
router.post("/api/auth/signup", asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || !email || !phone || !password) {
    return res.status(400).json({ error: "Please fill in all registration fields." });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  const rawPhone = String(phone).trim();
  const cleanedPhone = cleanPhone(rawPhone);
  if (!cleanedPhone || cleanedPhone.length < 10) {
    return res.status(400).json({ error: "Please enter a valid 10-digit mobile number." });
  }

  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long." });
  }

  // Authoritative duplicate email & phone checks in Supabase
  const safeEmail = sanitizePostgrestValue(cleanEmail);
  const existingEmailUser = await fetchOneRow("users", (q) => q.ilike("email", safeEmail), "id,email");
  if (existingEmailUser) {
    return res.status(400).json({ error: "An account with this email address already exists. Please login instead." });
  }

  const phoneFilter = buildPostgrestPhoneFilter(rawPhone, cleanedPhone);
  const existingPhoneUsers = await fetchTable("users", {
    columns: "id,phone",
    filter: (q) => q.or(phoneFilter),
    limit: 10
  });
  if (existingPhoneUsers.some((u: any) => cleanPhone(u.phone || "") === cleanedPhone)) {
    return res.status(400).json({ error: "An account with this phone number already exists. Please login instead." });
  }

  const newUserId = "usr_" + Date.now();
  const nowIso = new Date().toISOString();
  const newUser = {
    id: newUserId,
    name: String(name).trim(),
    email: cleanEmail,
    phone: rawPhone,
    password: hashPassword(password),
    role: "user",
    permissions: [],
    addresses: [],
    joinedAt: nowIso,
    status: "Active",
    mustChangePassword: false
  };

  await syncUserToSupabase(newUser);

  const welcomeNotif = {
    id: "notif_" + Date.now(),
    userId: newUser.id,
    title: "Welcome to Sabjies Family! 🥬",
    body: `Hi ${newUser.name}, welcome to Ghatkopar's premium farm-fresh vegetable delivery app. Savor fresh harvests!`,
    type: "account",
    read: false,
    createdAt: nowIso
  };
  await syncNotificationToSupabase(welcomeNotif);

  const sessionId = "sess_" + crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await upsertTable("sessions", [{
    id: sessionId,
    user_id: newUser.id,
    token: sessionId,
    created_at: nowIso,
    expires_at: expiresAt,
    device: String(req.headers["user-agent"] || "Browser Client"),
    ip: String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1")
  }], "id");
  clearSessionInvalid(sessionId);

  res.status(201).json({
    success: true,
    sessionId,
    user: sanitizeUserForResponse(newUser, [])
  });
}));

// Login
router.post("/api/auth/login", asyncHandler(async (req, res) => {
  const rawIdentifier = String(req.body?.identifier || req.body?.email || req.body?.phone || "").trim();
  const { password } = req.body || {};
  if (!rawIdentifier || !password || typeof password !== "string") {
    return res.status(400).json({ error: "Please enter your login email or phone, and password." });
  }

  const user = await getUserByIdentifierFromDb(rawIdentifier);
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1");
  const userAgent = String(req.headers["user-agent"] || "Mobile App Client");

  if (!user || !user.password || !verifyPassword(password, user.password)) {
    await recordLoginHistoryInDb({
      userId: user ? user.id : "unknown",
      identifier: rawIdentifier,
      status: "Failed",
      ip,
      userAgent
    });
    return res.status(401).json({ error: "Invalid email address, phone number or password. Please try again." });
  }

  if (!isUserAccountActive(user)) {
    return res.status(403).json({ error: "This account has been temporarily blocked or suspended by the administration." });
  }

  // Seamless legacy password hash upgrade to scrypt
  if (!isScryptHash(user.password)) {
    const upgradedHash = hashPassword(password);
    user.password = upgradedHash;
    await updateRows(
      "users",
      { password: upgradedHash, updated_at: new Date().toISOString() },
      (q) => q.eq("id", user.id)
    );
  }

  // Force mandatory password change if logging in with temporary password
  if (user.mustChangePassword) {
    const approvedRows = await fetchTable("password_resets", {
      filter: (q) => q.eq("user_id", user.id).eq("status", "Approved"),
      orderBy: { column: "requested_at", ascending: false },
      limit: 1
    });
    if (approvedRows.length > 0) {
      const request = mapPasswordResetFromDb(approvedRows[0]);
      if (!request.auditTrail.some((a: any) => a.action === "User Logged In")) {
        request.auditTrail.push({
          action: "User Logged In",
          timestamp: new Date().toISOString()
        });
        await syncPasswordResetToSupabase(request);
      }
    }

    return res.json({
      success: true,
      mustChangePassword: true,
      userId: user.id,
      email: user.email,
      phone: user.phone || ""
    });
  }

  const sessionId = "sess_" + crypto.randomBytes(24).toString("hex");
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await upsertTable("sessions", [{
    id: sessionId,
    user_id: user.id,
    token: sessionId,
    created_at: nowIso,
    expires_at: expiresAt,
    device: userAgent,
    ip
  }], "id");
  clearSessionInvalid(sessionId);

  await recordLoginHistoryInDb({
    userId: user.id,
    identifier: rawIdentifier,
    status: "Success",
    ip,
    userAgent
  });

  const userAddresses = await getAddressesForUserFromDb(user.id);
  const cleanAddresses = userAddresses.map((a: any) => ({
    label: a.label,
    flat: a.flat,
    street: a.street,
    area: a.area,
    pin: a.pin,
    landmark: a.landmark || "",
    isDefault: Boolean(a.isDefault)
  }));

  res.json({
    success: true,
    sessionId,
    user: {
      ...sanitizeUserForResponse(user, cleanAddresses),
      joinedAt: user.joinedAt
    }
  });
}));

// ── STEP 1 & 2: FORGOT PASSWORD (INITIATE OTP VIA EMAIL OR SMS) ──
router.post("/api/auth/forgot-password", asyncHandler(async (req, res) => {
  const { identifier } = req.body || {};
  if (!identifier || typeof identifier !== "string" || !identifier.trim()) {
    return res.status(400).json({ error: "Please enter your registered email address or mobile number." });
  }

  const rawId = identifier.trim();
  const cleanId = rawId.toLowerCase();
  const isEmail = cleanId.includes("@");
  const cleanedPhoneId = !isEmail ? cleanPhone(cleanId) : "";

  if (!isEmail && (!cleanedPhoneId || cleanedPhoneId.length !== 10)) {
    return res.status(400).json({ error: "Please enter a valid 10-digit mobile number or email address." });
  }

  const clientIp = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1");
  const rateLimitKey = `otp_req_${clientIp}_${isEmail ? cleanId : cleanedPhoneId}`;
  if (!checkOtpRateLimit(rateLimitKey, 5, 15 * 60 * 1000)) {
    return res.status(429).json({ error: "Too many verification code requests. Please wait 15 minutes before trying again." });
  }

  const isTestSimulation = isTestSimulationAllowed(req) && (req.headers["x-test-simulation"] === "true" || process.env.ALLOW_TEST_OTP_SIMULATION === "true");

  if (isEmail && !isEmailConfigured() && !isTestSimulation) {
    return res.status(503).json({
      error: "Email verification is currently unavailable because the email service is not configured on the server. Please contact support at greensabjies@gmail.com or 99203 24172 for assistance.",
      unconfigured: true,
      channel: "email"
    });
  }
  if (!isEmail && !isSmsConfigured() && !isTestSimulation) {
    return res.status(503).json({
      error: "SMS verification is currently unavailable because the SMS gateway is not configured on the server. Please contact support at greensabjies@gmail.com or 99203 24172 for assistance.",
      unconfigured: true,
      channel: "sms"
    });
  }

  const user = await getUserByIdentifierFromDb(rawId);

  // Account enumeration defense
  if (!user) {
    const maskedTarget = isEmail ? maskEmail(cleanId) : maskPhone(cleanedPhoneId);
    return res.json({
      success: true,
      resetRequestId: "rst_" + Date.now() + "_" + crypto.randomBytes(6).toString("hex"),
      message: `If an account with this ${isEmail ? "email" : "mobile number"} exists, a 6-digit verification code has been dispatched.`,
      channel: isEmail ? "email" : "sms",
      maskedTarget,
      expiresIn: 300,
      cooldownSeconds: 60
    });
  }

  if (!isUserAccountActive(user)) {
    return res.status(403).json({ error: "This account has been temporarily blocked or suspended. Please contact customer support." });
  }

  // Check 60-second cooldown on active pending requests
  const existingPendingRows = await fetchTable("password_resets", {
    filter: (q) => q.eq("user_id", user.id).eq("status", "Pending"),
    orderBy: { column: "requested_at", ascending: false },
    limit: 5
  });
  const activeCooldown = existingPendingRows
    .map(mapPasswordResetFromDb)
    .find((r) => r.cooldownUntil && new Date() < new Date(r.cooldownUntil));

  if (activeCooldown) {
    const waitSecs = Math.max(1, Math.ceil((new Date(activeCooldown.cooldownUntil).getTime() - Date.now()) / 1000));
    return res.status(429).json({ error: `Please wait ${waitSecs} seconds before requesting a new verification code.` });
  }

  // Supersede previous pending requests
  if (existingPendingRows.length > 0) {
    await updateRows(
      "password_resets",
      { status: "Superseded", updated_at: new Date().toISOString() },
      (q) => q.eq("user_id", user.id).eq("status", "Pending")
    );
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const salt = crypto.randomBytes(16).toString("hex");
  const otpHash = crypto.createHash("sha256").update(salt + ":" + otp).digest("hex");

  const resetRequestId = "rst_" + Date.now() + "_" + crypto.randomBytes(8).toString("hex");
  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const cooldownIso = new Date(Date.now() + 60 * 1000).toISOString();

  let dispatchSuccess = false;
  let dispatchError = "";

  if (isEmail) {
    if (isTestSimulation && !isEmailConfigured()) {
      recordTestEmailOtp(user.email, otp);
      dispatchSuccess = true;
    } else {
      const emailResult = await sendPasswordResetOtpEmail(user.email, {
        userName: user.name,
        otp,
        expiresInMinutes: 5
      });
      dispatchSuccess = emailResult.success;
      if (!dispatchSuccess) dispatchError = emailResult.error || "Failed to dispatch email";
    }
  } else {
    if (isTestSimulation && !isSmsConfigured()) {
      recordTestOtp(user.phone || cleanedPhoneId, otp);
      dispatchSuccess = true;
    } else {
      const smsResult = await sendSmsOtp(user.phone || cleanedPhoneId, otp);
      dispatchSuccess = smsResult.success;
      if (!dispatchSuccess) dispatchError = smsResult.error || "Failed to dispatch SMS";
    }
  }

  if (!dispatchSuccess) {
    return res.status(502).json({
      error: `Could not send verification code: ${dispatchError}. Please try again later.`,
      channel: isEmail ? "email" : "sms"
    });
  }

  const resetRecord = {
    id: resetRequestId,
    userId: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || cleanedPhoneId,
    token: `${salt}:${otpHash}`,
    status: "Pending",
    attempts: 0,
    maxAttempts: 5,
    expiresAt: expiresIso,
    cooldownUntil: cooldownIso,
    createdAt: nowIso,
    updatedAt: nowIso,
    channel: isEmail ? "email" : "sms",
    ip: clientIp,
    used: false
  };

  await syncPasswordResetToSupabase(resetRecord);

  const maskedTarget = isEmail ? maskEmail(user.email) : maskPhone(user.phone || cleanedPhoneId);
  res.json({
    success: true,
    resetRequestId,
    message: `A 6-digit verification code has been dispatched to your registered ${isEmail ? "email" : "mobile number"}.`,
    channel: isEmail ? "email" : "sms",
    maskedTarget,
    expiresIn: 300,
    cooldownSeconds: 60
  });
}));

// Resend OTP
router.post("/api/auth/resend-otp", asyncHandler(async (req, res) => {
  const { resetRequestId } = req.body || {};
  if (!resetRequestId) {
    return res.status(400).json({ error: "Reset Request ID is required." });
  }

  const row = await fetchOneRow("password_resets", (q) => q.eq("id", String(resetRequestId)));
  const request = row ? mapPasswordResetFromDb(row) : null;
  if (!request || request.status !== "Pending") {
    return res.status(400).json({ error: "Invalid or expired password reset session. Please request a new verification code." });
  }

  if (isTestSimulationAllowed(req) && req.headers["x-test-simulate-cooldown-expired"] === "true") {
    request.cooldownUntil = new Date(Date.now() - 1000).toISOString();
  }

  if (request.cooldownUntil && new Date() < new Date(request.cooldownUntil)) {
    const waitSecs = Math.max(1, Math.ceil((new Date(request.cooldownUntil).getTime() - Date.now()) / 1000));
    return res.status(429).json({ error: `Please wait ${waitSecs} seconds before requesting a new verification code.` });
  }

  if (request.expiresAt && new Date() > new Date(request.expiresAt)) {
    request.status = "Expired";
    request.updatedAt = new Date().toISOString();
    await syncPasswordResetToSupabase(request);
    return res.status(400).json({ error: "This verification request has expired. Please start over." });
  }

  const user = request.userId ? await getUserByIdFromDb(String(request.userId)) : null;
  if (!user) {
    return res.status(404).json({ error: "User account not found." });
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const salt = crypto.randomBytes(16).toString("hex");
  const otpHash = crypto.createHash("sha256").update(salt + ":" + otp).digest("hex");

  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const cooldownIso = new Date(Date.now() + 60 * 1000).toISOString();

  let dispatchSuccess = false;
  let dispatchError = "";
  const isTestSimulation = isTestSimulationAllowed(req) && (req.headers["x-test-simulation"] === "true" || process.env.ALLOW_TEST_OTP_SIMULATION === "true");

  if (request.channel === "email" && !isEmailConfigured() && !isTestSimulation) {
    return res.status(503).json({
      error: "Email verification is currently unavailable because the email service is not configured on the server. Please contact support at greensabjies@gmail.com or 99203 24172 for assistance.",
      unconfigured: true,
      channel: "email"
    });
  }
  if (request.channel !== "email" && !isSmsConfigured() && !isTestSimulation) {
    return res.status(503).json({
      error: "SMS verification is currently unavailable because the SMS gateway is not configured on the server. Please contact support at greensabjies@gmail.com or 99203 24172 for assistance.",
      unconfigured: true,
      channel: "sms"
    });
  }

  if (request.channel === "email") {
    if (isTestSimulation && !isEmailConfigured()) {
      recordTestEmailOtp(user.email, otp);
      dispatchSuccess = true;
    } else {
      const emailResult = await sendPasswordResetOtpEmail(user.email, {
        userName: user.name,
        otp,
        expiresInMinutes: 5
      });
      dispatchSuccess = emailResult.success;
      if (!dispatchSuccess) dispatchError = emailResult.error || "Failed to dispatch email";
    }
  } else {
    if (isTestSimulation && !isSmsConfigured()) {
      recordTestOtp(user.phone || request.phone, otp);
      dispatchSuccess = true;
    } else {
      const smsResult = await sendSmsOtp(user.phone || request.phone, otp);
      dispatchSuccess = smsResult.success;
      if (!dispatchSuccess) dispatchError = smsResult.error || "Failed to dispatch SMS";
    }
  }

  if (!dispatchSuccess) {
    return res.status(502).json({ error: `Failed to resend verification code: ${dispatchError}` });
  }

  request.token = `${salt}:${otpHash}`;
  request.expiresAt = expiresIso;
  request.cooldownUntil = cooldownIso;
  request.updatedAt = nowIso;
  request.attempts = 0;

  await syncPasswordResetToSupabase(request);

  res.json({
    success: true,
    message: "A new verification code has been dispatched.",
    expiresIn: 300,
    cooldownSeconds: 60
  });
}));

// Verify OTP
router.post("/api/auth/verify-otp", asyncHandler(async (req, res) => {
  const { resetRequestId, otp } = req.body || {};
  if (!resetRequestId || !otp) {
    return res.status(400).json({ error: "Please enter the 6-digit verification code." });
  }

  const cleanOtp = String(otp).trim();
  if (!/^\d{6}$/.test(cleanOtp)) {
    return res.status(400).json({ error: "Verification code must be exactly 6 digits." });
  }

  const row = await fetchOneRow("password_resets", (q) => q.eq("id", String(resetRequestId)));
  const request = row ? mapPasswordResetFromDb(row) : null;
  if (!request) {
    return res.status(400).json({ error: "Invalid or expired password reset request. Please request a new code." });
  }

  if (request.used || request.status === "Completed") {
    return res.status(400).json({ error: "This verification request has already been completed." });
  }

  if (request.status === "Locked" || (request.attempts && request.attempts >= (request.maxAttempts || 5))) {
    request.status = "Locked";
    request.updatedAt = new Date().toISOString();
    await syncPasswordResetToSupabase(request);
    return res.status(429).json({ error: "Too many incorrect attempts. This request has been locked for security. Please request a new verification code." });
  }

  if (isTestSimulationAllowed(req) && req.headers["x-test-simulate-expired"] === "true") {
    request.expiresAt = new Date(Date.now() - 1000).toISOString();
  }

  if (request.expiresAt && new Date() > new Date(request.expiresAt)) {
    request.status = "Expired";
    request.updatedAt = new Date().toISOString();
    await syncPasswordResetToSupabase(request);
    return res.status(400).json({ error: "The verification code has expired. Please request a new one." });
  }

  if (request.status !== "Pending") {
    return res.status(400).json({ error: "Invalid reset request status." });
  }

  const tokenParts = String(request.token || "").split(":");
  if (tokenParts.length !== 2) {
    return res.status(400).json({ error: "Invalid reset token format." });
  }
  const [salt, storedHash] = tokenParts;
  const incomingHash = crypto.createHash("sha256").update(salt + ":" + cleanOtp).digest("hex");

  let isMatch = false;
  try {
    const bufA = Buffer.from(incomingHash, "hex");
    const bufB = Buffer.from(storedHash, "hex");
    if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
      isMatch = true;
    }
  } catch {
    isMatch = false;
  }

  if (!isMatch) {
    request.attempts = (request.attempts || 0) + 1;
    const remaining = Math.max(0, (request.maxAttempts || 5) - request.attempts);
    if (remaining === 0) {
      request.status = "Locked";
    }
    request.updatedAt = new Date().toISOString();
    await syncPasswordResetToSupabase(request);

    if (remaining === 0) {
      return res.status(429).json({ error: "Too many incorrect attempts. This request has been locked. Please request a new code." });
    }
    return res.status(400).json({ error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` });
  }

  const rawVerificationToken = "vtok_" + crypto.randomBytes(24).toString("hex");
  const vtokSalt = crypto.randomBytes(16).toString("hex");
  const vtokHash = crypto.createHash("sha256").update(vtokSalt + ":" + rawVerificationToken).digest("hex");

  request.status = "Verified";
  request.verificationToken = `${vtokSalt}:${vtokHash}`;
  request.verifiedAt = new Date().toISOString();
  request.verificationTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  request.updatedAt = new Date().toISOString();

  await syncPasswordResetToSupabase(request);

  res.json({
    success: true,
    resetRequestId,
    verificationToken: rawVerificationToken,
    message: "Verification code verified successfully. You may now choose your new password."
  });
}));

// Reset Password via verified OTP
router.post("/api/auth/reset-password", asyncHandler(async (req, res) => {
  const { resetRequestId, verificationToken, newPassword, confirmPassword } = req.body || {};

  if (!resetRequestId || !verificationToken || !newPassword) {
    return res.status(400).json({ error: "Incomplete reset password payload." });
  }
  if (confirmPassword && newPassword !== confirmPassword) {
    return res.status(400).json({ error: "New password and confirm password do not match." });
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long." });
  }

  const row = await fetchOneRow("password_resets", (q) => q.eq("id", String(resetRequestId)));
  const request = row ? mapPasswordResetFromDb(row) : null;
  if (!request) {
    return res.status(404).json({ error: "Invalid or non-existent password reset request." });
  }
  if (request.used || request.status === "Completed") {
    return res.status(400).json({ error: "This password reset request has already been completed." });
  }
  if (request.status !== "Verified") {
    return res.status(403).json({ error: "Please verify your OTP code before resetting your password." });
  }
  if (request.verificationTokenExpiresAt && new Date() > new Date(request.verificationTokenExpiresAt)) {
    return res.status(400).json({ error: "Verification window expired. Please request a new OTP code." });
  }

  const vtokParts = String(request.verificationToken || "").split(":");
  if (vtokParts.length !== 2) {
    return res.status(403).json({ error: "Unauthorized or corrupt verification state." });
  }
  const [vtokSalt, storedVtokHash] = vtokParts;
  const incomingVtokHash = crypto.createHash("sha256").update(vtokSalt + ":" + String(verificationToken).trim()).digest("hex");

  let isVtokMatch = false;
  try {
    const bufA = Buffer.from(incomingVtokHash, "hex");
    const bufB = Buffer.from(storedVtokHash, "hex");
    if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
      isVtokMatch = true;
    }
  } catch {
    isVtokMatch = false;
  }

  if (!isVtokMatch) {
    return res.status(403).json({ error: "Invalid or forged verification token." });
  }

  const user = request.userId ? await getUserByIdFromDb(String(request.userId)) : null;
  if (!user) {
    return res.status(404).json({ error: "User account not found." });
  }

  const nowIso = new Date().toISOString();
  user.password = hashPassword(newPassword);
  user.mustChangePassword = false;
  await syncUserToSupabase(user);

  request.status = "Completed";
  request.used = true;
  request.updatedAt = nowIso;
  request.token = "";
  request.verificationToken = "";
  await syncPasswordResetToSupabase(request);

  await revokeAllUserSessions(user.id);

  await syncNotificationToSupabase({
    id: "notif_" + Date.now(),
    userId: user.id,
    title: "🔐 Password Changed Successfully",
    body: "Your Sabjies account password was updated successfully. All other active sessions have been signed out.",
    type: "security",
    read: false,
    createdAt: nowIso
  });

  logAuditEvent(user.id, "Password Changed Via OTP", { resetRequestId, email: user.email });

  res.json({
    success: true,
    message: "Your password has been reset successfully! Please log in with your new password."
  });
}));

// Customer Password Reset Request (Admin Approval / Email Link)
router.post("/api/auth/request-password-reset", asyncHandler(async (req, res) => {
  const { identifier, reason } = req.body || {};
  if (!identifier) {
    return res.status(400).json({ error: "Please enter your registered email address or mobile number." });
  }

  const user = await getUserByIdentifierFromDb(String(identifier));
  if (!user) {
    return res.status(404).json({ error: "No registered account found with this email or mobile number." });
  }

  const existingPendingRows = await fetchTable("password_resets", {
    filter: (q) => q.eq("user_id", user.id).eq("status", "Pending"),
    limit: 1
  });
  if (existingPendingRows.length > 0) {
    const existingActive = mapPasswordResetFromDb(existingPendingRows[0]);
    return res.json({
      success: true,
      isDuplicate: true,
      message: `A password reset request is already pending for your account (Request ID: ${existingActive.id}). Please wait for administrator approval or check status using your Request ID.`,
      requestId: existingActive.id
    });
  }

  const requestId = "rst_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  const rawResetToken = crypto.randomBytes(32).toString("hex");
  const hashedResetToken = crypto.createHash("sha256").update(rawResetToken).digest("hex");

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
  const userAgent = req.headers["user-agent"] || "Browser Client";

  const lastLoginRows = await fetchTable("login_history", {
    filter: (q) => q.eq("user_id", user.id).eq("status", "Success"),
    orderBy: { column: "timestamp", ascending: false },
    limit: 1
  });
  const lastLoginTime = lastLoginRows[0]?.timestamp || user.joinedAt || new Date().toISOString();

  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const newRequest: any = {
    id: requestId,
    userId: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    reason: reason ? String(reason).trim() : "Password reset requested by customer",
    status: "Pending",
    createdAt: nowIso,
    updatedAt: nowIso,
    approvedAt: null,
    approvedBy: "",
    adminNotes: "",
    tempPasswordHash: "",
    token: hashedResetToken,
    expiresAt: expiresIso,
    notificationStatus: isEmailConfigured() ? "Email Dispatched" : "Pending Review",
    lastLogin: lastLoginTime,
    deviceInfo: String(userAgent),
    ip: String(ip),
    auditTrail: [
      { action: "Request Created", timestamp: nowIso, notes: "Submitted via customer portal" }
    ],
    used: false
  };

  const clientOrigin = (req.headers.origin as string) || process.env.FRONTEND_URL || "https://sabjies.in";
  const resetUrl = `${clientOrigin.replace(/\/+$/, "")}/#reset-password?token=${rawResetToken}&requestId=${requestId}`;

  let emailDispatched = false;
  if (isEmailConfigured()) {
    try {
      const emailResult = await sendPasswordResetEmail(user.email, {
        userName: user.name,
        resetUrl,
        token: rawResetToken,
        requestId
      });
      emailDispatched = emailResult.success;
      if (emailDispatched) {
        newRequest.notificationStatus = "Email Sent";
      }
    } catch (e) {
      console.error("Password reset email dispatch error:", e);
    }
  }

  await syncPasswordResetToSupabase(newRequest);

  await syncNotificationToSupabase({
    id: "notif_" + Date.now() + "_admin",
    userId: "admin_greensabjies",
    title: "🔔 New Password Reset Request",
    body: `${user.name} (${user.email}) submitted a password reset request. Email sent: ${emailDispatched ? "Yes" : "No (SMTP pending)"}.`,
    type: "security",
    read: false,
    createdAt: nowIso
  });

  logAuditEvent(user.id, "Password Reset Requested", { requestId, email: user.email, emailDispatched, ip });

  const userMessage = emailDispatched
    ? `A secure password reset link has been dispatched to your registered email address (${user.email}). Please check your inbox and click the link to reset your password.`
    : `Your password reset request has been submitted successfully (Request ID: ${requestId}). Our store administrator will review your account credentials.`;

  res.json({
    success: true,
    emailSent: emailDispatched,
    message: userMessage,
    requestId
  });
}));

// Reset Password with Email Link Token
router.post("/api/auth/reset-password-with-token", asyncHandler(async (req, res) => {
  const { requestId, token, newPassword } = req.body || {};
  if (!requestId || !token || !newPassword) {
    return res.status(400).json({ error: "Incomplete reset password payload. Request ID, token and new password are required." });
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters long." });
  }

  const row = await fetchOneRow("password_resets", (q) => q.eq("id", String(requestId)));
  const request = row ? mapPasswordResetFromDb(row) : null;
  if (!request) {
    return res.status(404).json({ error: "Invalid or non-existent password reset request." });
  }
  if (request.used || request.status === "Completed") {
    return res.status(400).json({ error: "This password reset link has already been used." });
  }
  if (request.expiresAt && new Date() > new Date(request.expiresAt)) {
    return res.status(400).json({ error: "This password reset link has expired. Please submit a new request." });
  }

  const incomingHash = crypto.createHash("sha256").update(String(token).trim()).digest("hex");
  const storedToken = String(request.token || "").trim();

  let isMatch = false;
  try {
    const bufA = Buffer.from(incomingHash, "hex");
    const bufB = Buffer.from(storedToken, "hex");
    if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
      isMatch = true;
    }
  } catch {
    isMatch = false;
  }

  if (!isMatch) {
    return res.status(403).json({ error: "Invalid or forged password reset token." });
  }

  const user = request.userId ? await getUserByIdFromDb(String(request.userId)) : null;
  if (!user) {
    return res.status(404).json({ error: "User account not found." });
  }

  const nowIso = new Date().toISOString();
  user.password = hashPassword(newPassword);
  user.mustChangePassword = false;
  await syncUserToSupabase(user);

  request.status = "Completed";
  request.used = true;
  request.updatedAt = nowIso;
  request.token = "";
  request.auditTrail.push({ action: "Password Reset Completed Via Secure Email Token", timestamp: nowIso });
  await syncPasswordResetToSupabase(request);

  await revokeAllUserSessions(user.id);
  logAuditEvent(user.id, "Password Reset Via Token", { requestId, email: user.email });

  res.json({
    success: true,
    message: "Your password has been successfully reset! You can now log in with your new password."
  });
}));

// Check Password Reset Request Status (Never exposes plaintext tempPassword or hashed token)
router.post("/api/auth/check-reset-status", asyncHandler(async (req, res) => {
  const { identifier } = req.body || {};
  if (!identifier) {
    return res.status(400).json({ error: "Please enter your Request ID, Email, or Mobile Number." });
  }

  const rawId = String(identifier).trim();
  const cleanId = rawId.toLowerCase();
  const safeCleanId = sanitizePostgrestValue(cleanId);
  const isEmail = cleanId.includes("@");
  const isRequestId = cleanId.startsWith("rst_");
  const cleanedPhoneId = (!isEmail && !isRequestId) ? cleanPhone(cleanId) : "";

  let rows: any[] = [];
  if (isRequestId) {
    rows = await fetchTable("password_resets", {
      filter: (q) => q.ilike("id", safeCleanId),
      limit: 1
    });
  } else if (isEmail) {
    rows = await fetchTable("password_resets", {
      filter: (q) => q.ilike("email", safeCleanId),
      orderBy: { column: "requested_at", ascending: false },
      limit: 1
    });
  } else {
    const safeRaw = sanitizePostgrestValue(rawId);
    const orParts = [`id.ilike."${safeRaw}"`, `phone.eq."${safeRaw}"`];
    if (cleanedPhoneId) {
      orParts.push(`phone.ilike."%${cleanedPhoneId}%"`);
    }
    rows = await fetchTable("password_resets", {
      filter: (q) => q.or(orParts.join(",")),
      orderBy: { column: "requested_at", ascending: false },
      limit: 10
    });
  }

  const matched = rows
    .map(mapPasswordResetFromDb)
    .find((r) =>
      r.id.toLowerCase() === cleanId ||
      (isEmail && r.email && r.email.toLowerCase() === cleanId) ||
      (cleanedPhoneId && cleanPhone(r.phone || "") === cleanedPhoneId) ||
      (!isEmail && !isRequestId && r.phone && r.phone.trim() === cleanId)
    );

  if (!matched) {
    return res.status(404).json({ error: "No password reset request found for this Request ID, Email, or Mobile Number." });
  }

  res.json({
    success: true,
    request: {
      id: matched.id,
      userId: matched.userId,
      name: matched.name,
      email: matched.email,
      phone: matched.phone,
      status: matched.status,
      createdAt: matched.createdAt,
      updatedAt: matched.updatedAt,
      adminNotes: matched.adminNotes || "",
      notificationStatus: matched.notificationStatus || "In-App Sent",
      tempPassword: null,
      token: null,
      expiresAt: matched.expiresAt
    }
  });
}));

// Complete Password Reset / Change Temp Password
router.post("/api/auth/change-temp-password", asyncHandler(async (req, res) => {
  const { userId, requestId, tempPassword, newPassword } = req.body || {};
  if ((!userId && !requestId) || !tempPassword || !newPassword) {
    return res.status(400).json({ error: "Please enter all required fields." });
  }

  let requestRow: any = null;
  if (requestId) {
    requestRow = await fetchOneRow("password_resets", (q) => q.eq("id", String(requestId)));
  }

  const resolvedUserId = userId ? String(userId) : (requestRow?.user_id ? String(requestRow.user_id) : "");
  const user = resolvedUserId ? await getUserByIdFromDb(resolvedUserId) : null;
  if (!user) {
    return res.status(404).json({ error: "User account not found." });
  }

  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters long." });
  }
  if (tempPassword === newPassword) {
    return res.status(400).json({ error: "New password cannot be the same as your temporary password." });
  }

  if (!requestRow) {
    const approved = await fetchTable("password_resets", {
      filter: (q) => q.eq("user_id", user.id).eq("status", "Approved").eq("used", false),
      orderBy: { column: "requested_at", ascending: false },
      limit: 1
    });
    requestRow = approved[0] || null;
  }

  const request = requestRow ? mapPasswordResetFromDb(requestRow) : null;
  if (!request || request.used) {
    return res.status(400).json({ error: "No active approved password reset request was found for this account." });
  }

  const isValidTempPass =
    verifyPassword(tempPassword, user.password) ||
    (request.tempPasswordHash && verifyPassword(tempPassword, request.tempPasswordHash));

  if (!isValidTempPass) {
    return res.status(400).json({ error: "The temporary password or code you entered is invalid or expired." });
  }

  const nowIso = new Date().toISOString();
  user.password = hashPassword(newPassword);
  user.mustChangePassword = false;
  await syncUserToSupabase(user);

  request.status = "Completed";
  request.used = true;
  request.updatedAt = nowIso;
  request.auditTrail.push({
    action: "Password Changed Successfully",
    timestamp: nowIso,
    notes: "Customer set new permanent password"
  });
  await syncPasswordResetToSupabase(request);

  await revokeAllUserSessions(user.id);

  await syncNotificationToSupabase({
    id: "notif_" + Date.now(),
    userId: user.id,
    title: "🔐 Password Updated Successfully",
    body: "Your account password has been updated successfully. If you did not perform this change, please contact support immediately.",
    type: "security",
    read: false,
    createdAt: nowIso
  });

  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1");
  const userAgent = String(req.headers["user-agent"] || "Browser Client");
  await recordLoginHistoryInDb({
    userId: user.id,
    identifier: user.email,
    status: "Success",
    ip,
    userAgent
  });

  const sessionId = "sess_" + crypto.randomBytes(24).toString("hex");
  await upsertTable("sessions", [{
    id: sessionId,
    user_id: user.id,
    token: sessionId,
    created_at: nowIso,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    device: userAgent,
    ip
  }], "id");
  clearSessionInvalid(sessionId);

  logAuditEvent(user.id, "Password Reset Completed", { requestId: request.id, email: user.email, ip });

  const userAddresses = await getAddressesForUserFromDb(user.id);
  res.json({
    success: true,
    sessionId,
    user: {
      ...sanitizeUserForResponse(user, userAddresses),
      joinedAt: user.joinedAt
    }
  });
}));

// Get current authenticated user profile & addresses
router.get("/api/auth/me", asyncHandler(async (req, res) => {
  const userId = await getUserIdFromRequestAsync(req);
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated or session expired." });
  }

  const user = await getUserByIdFromDb(userId);
  if (!user) {
    return res.status(404).json({ error: "User account not found." });
  }

  if (!isUserAccountActive(user)) {
    return res.status(403).json({ error: "This account has been temporarily blocked or suspended." });
  }

  const userAddresses = await getAddressesForUserFromDb(user.id);
  res.json({
    success: true,
    user: {
      ...sanitizeUserForResponse(user, userAddresses),
      joinedAt: user.joinedAt
    }
  });
}));

// Profile details edit
router.post("/api/users/profile", asyncHandler(async (req, res) => {
  const effectiveUserId = await getUserIdFromRequestAsync(req);
  if (!effectiveUserId) {
    return res.status(401).json({ error: "Authentication required to update profile." });
  }

  const user = await getUserByIdFromDb(effectiveUserId);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  if (!isUserAccountActive(user)) {
    return res.status(403).json({ error: "This account has been temporarily blocked or suspended." });
  }

  const { name, email, phone } = req.body || {};
  if (name) user.name = String(name).trim();

  if (email) {
    const cleanEmail = String(email).trim().toLowerCase();
    if (cleanEmail !== (user.email || "").toLowerCase()) {
      const safeEmail = sanitizePostgrestValue(cleanEmail);
      const dupUser = await fetchOneRow(
        "users",
        (q) => q.ilike("email", safeEmail).neq("id", user.id),
        "id,email"
      );
      if (dupUser) {
        return res.status(400).json({ error: "This email is already in use by another account." });
      }
      user.email = cleanEmail;
    }
  }

  if (phone) {
    const rawPhone = String(phone).trim();
    const cleanedPhone = cleanPhone(rawPhone);
    if (cleanedPhone && cleanedPhone !== cleanPhone(user.phone || "")) {
      const phoneFilter = buildPostgrestPhoneFilter(rawPhone, cleanedPhone);
      const dupUsers = await fetchTable("users", {
        columns: "id,phone",
        filter: (q) => q.or(phoneFilter).neq("id", user.id),
        limit: 5
      });
      if (dupUsers.some((du: any) => cleanPhone(du.phone || "") === cleanedPhone)) {
        return res.status(400).json({ error: "This phone number is already registered by another account." });
      }
      user.phone = rawPhone;
    }
  }

  await syncUserToSupabase(user);
  res.json({
    success: true,
    user: sanitizeUserForResponse(user)
  });
}));

// Saved Addresses
router.get("/api/users/addresses", asyncHandler(async (req, res) => {
  const effectiveUserId = await getUserIdFromRequestAsync(req);
  if (!effectiveUserId) {
    return res.status(401).json({ error: "Authentication required to view saved addresses." });
  }

  const userAddresses = await getAddressesForUserFromDb(effectiveUserId);
  res.json({
    success: true,
    addresses: userAddresses
  });
}));

const handleSaveOrUpdateAddress = asyncHandler(async (req, res) => {
  const effectiveUserId = await getUserIdFromRequestAsync(req);
  if (!effectiveUserId) {
    return res.status(401).json({ error: "Authentication required to save an address. Please sign in." });
  }

  const { label, flat, street, area, pin, landmark, city, state, isDefault, id } = req.body || {};
  const paramLabel = req.params?.label;

  const cleanFlat = String(flat || "").trim();
  const cleanStreet = String(street || "").trim();
  const cleanArea = String(area || "").trim();
  const cleanPin = String(pin || "").trim();
  const cleanLabel = String(paramLabel || label || "Home").trim() || "Home";
  const shouldBeDefault = Boolean(isDefault);

  if (!cleanFlat) return res.status(400).json({ error: "Flat / Door / House number is required." });
  if (!cleanStreet) return res.status(400).json({ error: "Street / Building / Society name is required." });
  if (!cleanArea) return res.status(400).json({ error: "Area / Locality is required." });
  if (!cleanPin) return res.status(400).json({ error: "Pincode is required." });
  if (!/^\d{6}$/.test(cleanPin)) {
    return res.status(400).json({ error: "Please provide a valid 6-digit postal pincode (e.g., 400075)." });
  }

  const user = await getUserByIdFromDb(effectiveUserId);
  if (!user) {
    return res.status(404).json({ error: "User account not found." });
  }

  const existingAddresses = await getAddressesForUserFromDb(effectiveUserId);
  const existingMatch = existingAddresses.find((a: any) =>
    (id && String(a.id) === String(id)) ||
    (a.label && a.label.toLowerCase() === cleanLabel.toLowerCase())
  );

  if (shouldBeDefault && existingAddresses.length > 0) {
    await updateRows("addresses", { is_default: false }, (q) => q.eq("user_id", effectiveUserId));
  }

  const targetAddrId = existingMatch?.id || id || `addr_${effectiveUserId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const updatedAddress = {
    id: String(targetAddrId),
    user_id: effectiveUserId,
    name: user.name,
    label: cleanLabel,
    flat: cleanFlat,
    street: cleanStreet,
    area: cleanArea,
    pin: cleanPin,
    city: city || "Mumbai",
    state: state || "Maharashtra",
    landmark: landmark || cleanStreet.split(",")[0] || "",
    is_default: shouldBeDefault
  };

  await upsertTable("addresses", [updatedAddress], "id");

  const updatedList = await getAddressesForUserFromDb(effectiveUserId);
  user.addresses = updatedList.map((a: any) => ({
    ...a,
    isDefault: a.id === targetAddrId ? shouldBeDefault : (shouldBeDefault ? false : Boolean(a.isDefault))
  }));
  await syncUserToSupabase(user);

  res.status(existingMatch && req.method === "PUT" ? 200 : 201).json({
    success: true,
    addresses: user.addresses
  });
});

router.post("/api/users/addresses", handleSaveOrUpdateAddress);
router.put("/api/users/addresses", handleSaveOrUpdateAddress);
router.put("/api/users/addresses/:label", handleSaveOrUpdateAddress);

router.post("/api/users/addresses/sync", asyncHandler(async (req, res) => {
  const effectiveUserId = await getUserIdFromRequestAsync(req);
  if (!effectiveUserId) {
    return res.status(401).json({ error: "Authentication required to sync addresses." });
  }

  const { addresses } = req.body || {};
  if (!Array.isArray(addresses)) {
    return res.status(400).json({ error: "addresses array is required." });
  }

  const user = await getUserByIdFromDb(effectiveUserId);
  if (!user) {
    return res.status(404).json({ error: "User account not found." });
  }

  requireSupabase();
  await deleteFromTable("addresses", "user_id", effectiveUserId);

  const dbRows = addresses.map((addr: any, idx: number) => {
    const rawPin = String(addr.pin || "400075").trim();
    const pin = /^\d{6}$/.test(rawPin) ? rawPin : "400075";
    return {
      id: addr.id ? String(addr.id) : `addr_${effectiveUserId}_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      user_id: effectiveUserId,
      name: user.name,
      label: addr.label || "Home",
      flat: addr.flat || "",
      street: addr.street || "",
      area: addr.area || "Ghatkopar East",
      pin,
      city: addr.city || "Mumbai",
      state: addr.state || "Maharashtra",
      landmark: addr.landmark || "",
      is_default: Boolean(addr.isDefault)
    };
  });

  if (dbRows.length > 0) {
    await upsertTable("addresses", dbRows, "id");
  }

  user.addresses = addresses;
  await syncUserToSupabase(user);

  res.json({
    success: true,
    addresses: user.addresses
  });
}));

const handleDeleteAddress = asyncHandler(async (req, res) => {
  const effectiveUserId = await getUserIdFromRequestAsync(req);
  const targetLabel = req.body?.label || req.params?.label || req.query?.label;
  const targetId = req.body?.id || req.query?.id;
  if (!effectiveUserId) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!targetLabel && !targetId) {
    return res.status(400).json({ error: "Incomplete parameters: label or id is required." });
  }

  const existing = await getAddressesForUserFromDb(effectiveUserId);
  const toDelete = existing.filter((a: any) =>
    (targetId && String(a.id) === String(targetId)) ||
    (targetLabel && String(a.label).toLowerCase() === String(targetLabel).toLowerCase())
  );

  for (const item of toDelete) {
    await deleteFromTable("addresses", "id", item.id);
  }

  const remaining = await getAddressesForUserFromDb(effectiveUserId);
  const user = await getUserByIdFromDb(effectiveUserId);
  if (user) {
    user.addresses = remaining;
    await syncUserToSupabase(user);
  }

  res.json({
    success: true,
    addresses: remaining
  });
});

router.post("/api/users/addresses/delete", handleDeleteAddress);
router.delete("/api/users/addresses", handleDeleteAddress);
router.delete("/api/users/addresses/:label", handleDeleteAddress);

router.get("/api/users/addresses/:userId", asyncHandler(async (req, res) => {
  const requestedUserId = String(req.params.userId);
  const authUserId = await getUserIdFromRequestAsync(req);
  const isAdmin = await verifyAdminRequest(req);
  if (!isAdmin && authUserId !== requestedUserId) {
    return res.status(401).json({ error: "Authentication required to view user addresses." });
  }

  const userAddresses = await getAddressesForUserFromDb(requestedUserId);
  res.json({ success: true, addresses: userAddresses });
}));

// Notifications (Authenticated user or Admin only)
router.get("/api/notifications", asyncHandler(async (req, res) => {
  const authUserId = await getUserIdFromRequestAsync(req);
  if (!authUserId) {
    return res.status(401).json({ error: "Authentication required to access notifications." });
  }

  const requestedUserId = req.query.userId ? String(req.query.userId) : authUserId;
  if (requestedUserId !== String(authUserId)) {
    const isAdmin = await verifyAdminRequest(req);
    if (!isAdmin) {
      return res.status(403).json({ error: "Access denied. Cannot view another user's notifications." });
    }
  }

  const rows = await fetchTable("notifications", {
    filter: (q) => q.eq("user_id", requestedUserId),
    orderBy: { column: "created_at", ascending: false },
    limit: 100
  });
  res.json(rows.map(mapNotificationFromDb));
}));

router.post("/api/notifications/read-all", asyncHandler(async (req, res) => {
  const authUserId = await getUserIdFromRequestAsync(req);
  if (!authUserId) {
    return res.status(401).json({ error: "Authentication required to update notifications." });
  }

  const requestedUserId = req.body?.userId ? String(req.body.userId) : authUserId;
  if (requestedUserId !== String(authUserId)) {
    const isAdmin = await verifyAdminRequest(req);
    if (!isAdmin) {
      return res.status(403).json({ error: "Access denied. Cannot modify another user's notifications." });
    }
  }

  await updateRows(
    "notifications",
    { read: true },
    (q) => q.eq("user_id", requestedUserId)
  );
  res.json({ success: true });
}));

export default router;
