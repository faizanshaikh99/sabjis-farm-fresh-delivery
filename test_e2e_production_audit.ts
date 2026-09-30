import assert from 'assert';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'SabjiesFreshRazorpaySecret2026';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'SabjiesFreshWebhookSecret2026';

function generateHmacSignature(orderId: string, paymentId: string, secret: string = KEY_SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

function generateWebhookSignature(rawBody: string, secret: string = WEBHOOK_SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
}

async function runE2EProductionAudit() {
  console.log('🛡️  BEGINNING COMPREHENSIVE END-TO-END PRODUCTION AUDIT...\n');

  // Step 0: Admin Authentication
  console.log('--- Step 0: Admin Authentication & Baseline Checks ---');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'greensabjies@gmail.com', password: 'Pizza@999' })
  });
  const loginData = await loginRes.json();
  assert.strictEqual(loginData.success, true, 'Admin login failed');
  const adminSessionId = loginData.sessionId;
  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-session-id': adminSessionId
  };
  console.log('✅ Admin login verified.\n');

  // Baseline stock
  const productsRes = await fetch(`${BASE_URL}/api/products`);
  const products = await productsRes.json();
  let potato = products.find((p: any) => p.id === 1);
  assert(potato, 'Product #1 Potato must exist');
  
  // Ensure sufficient baseline stock for repeated adversarial runs
  if (potato.stockQty < 50) {
    await fetch(`${BASE_URL}/api/products/1`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ stockQty: 100 })
    });
    const refreshed = await (await fetch(`${BASE_URL}/api/products`)).json();
    potato = refreshed.find((p: any) => p.id === 1);
  }
  console.log(`Potato catalog state: stockQty=${potato.stockQty}, sp=${potato.sp}\n`);

  // ─────────────────────────────────────────────────────────────
  // 1. Manipulated Price Protection
  // ─────────────────────────────────────────────────────────────
  console.log('--- Test 1: Manipulated Price in Cart ---');
  // Client attempts to buy Potato (sp ₹30) by asserting price: 1
  const manipPriceRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 1, name: 'Potato', qty: 1, quantity: 1, sp: 1, price: 1, weightInGrams: 1000, weight: '1 kg' }],
      userId: 'test_price_tamper',
      userEmail: 'tamper@example.com',
      phone: '99203 24172',
      address: 'Ghatkopar Test',
      paymentMethod: 'Cash on Delivery',
      subtotal: 1,
      total: 1
    })
  });
  const manipPriceRaw = await manipPriceRes.json();
  const manipPriceOrder = manipPriceRaw.order || manipPriceRaw;
  assert(manipPriceRes.status === 201 || manipPriceRes.status === 200, `Expected 201 Created or 200 OK, got ${manipPriceRes.status}`);
  // Server MUST use authoritative price (₹30) and delivery (₹30), so total must be ₹60, NEVER ₹1!
  assert.strictEqual(manipPriceOrder.items[0].sp, 30, 'Server must enforce authoritative unit price');
  assert.strictEqual(manipPriceOrder.subtotal, 30, 'Server must enforce authoritative subtotal');
  assert.strictEqual(manipPriceOrder.total, 60, 'Server must enforce authoritative total');
  assert.strictEqual(manipPriceOrder.paymentStatus, 'Pending', 'COD paymentStatus must be Pending');
  console.log('  ✓ Client tried price=₹1, total=₹1 -> Server enforced authoritative sp=₹30, total=₹60');
  console.log('✅ Test 1 Passed: Price manipulation overridden with authoritative catalog values.\n');

  // ─────────────────────────────────────────────────────────────
  // 2. Manipulated Discount Protection
  // ─────────────────────────────────────────────────────────────
  console.log('--- Test 2: Manipulated Discount Protection ---');
  const manipDiscountRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 1, name: 'Potato', qty: 10, quantity: 10, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
      userId: 'test_disc_tamper',
      userEmail: 'tamper2@example.com',
      phone: '99203 24172',
      address: 'Ghatkopar Test',
      paymentMethod: 'Cash on Delivery',
      discountApplied: 250, // Fake claimed discount of ₹250 without valid coupon!
      couponApplied: '',
      total: 50
    })
  });
  const manipDiscountRaw = await manipDiscountRes.json();
  const manipDiscountOrder = manipDiscountRaw.order || manipDiscountRaw;
  assert(manipDiscountRes.status === 201 || manipDiscountRes.status === 200);
  assert.strictEqual(manipDiscountOrder.discountApplied, 0, 'Fake unearned coupon discount must be discarded');
  // Authoritative total: subtotal ₹300, delivery ₹0 (>=200), COD discount 2% (₹6) -> ₹294. Total cannot be ₹50!
  assert.strictEqual(manipDiscountOrder.total, 294, 'Total must be authoritative (₹294 with legitimate 2% COD discount)');
  console.log('  ✓ Client attempted fraudulent discount=₹250, total=₹50 -> Server enforced authoritative couponDiscount=₹0, paymentDiscount=₹6, total=₹294');
  console.log('✅ Test 2 Passed: Fraudulent discount claims discarded and authoritative pricing enforced.\n');

  // ─────────────────────────────────────────────────────────────
  // 3. Manipulated Delivery Fee Protection
  // ─────────────────────────────────────────────────────────────
  console.log('--- Test 3: Manipulated Delivery Fee Protection ---');
  // Order below ₹200 threshold requires ₹30 delivery fee. Client sends delivery: 0.
  const manipDeliveryRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 1, name: 'Potato', qty: 1, quantity: 1, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
      userId: 'test_deliv_tamper',
      userEmail: 'tamper3@example.com',
      phone: '99203 24172',
      address: 'Ghatkopar Test',
      paymentMethod: 'Cash on Delivery',
      delivery: 0, // Tried to avoid delivery fee
      total: 30
    })
  });
  const manipDeliveryRaw = await manipDeliveryRes.json();
  const manipDeliveryOrder = manipDeliveryRaw.order || manipDeliveryRaw;
  assert(manipDeliveryRes.status === 201 || manipDeliveryRes.status === 200);
  assert.strictEqual(manipDeliveryOrder.delivery, 30, 'Server must enforce ₹30 delivery fee for orders < ₹200');
  assert.strictEqual(manipDeliveryOrder.total, 60, 'Total must include required delivery fee');
  console.log('  ✓ Client attempted delivery=₹0 on subtotal ₹30 -> Server enforced authoritative delivery=₹30');
  console.log('✅ Test 3 Passed: Delivery fee cannot be bypassed by client.\n');

  // ─────────────────────────────────────────────────────────────
  // 4. Invalid Coupon Rejection
  // ─────────────────────────────────────────────────────────────
  console.log('--- Test 4: Invalid Coupon Protection ---');
  const invalidCouponRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 1, name: 'Potato', qty: 2, quantity: 2, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
      userId: 'test_coupon_user',
      userEmail: 'coupon@example.com',
      phone: '99203 24172',
      address: 'Ghatkopar Test',
      paymentMethod: 'Cash on Delivery',
      couponCode: 'NON_EXISTENT_COUPON_999'
    })
  });
  const invalidCouponRaw = await invalidCouponRes.json();
  const invalidCouponOrder = invalidCouponRaw.order || invalidCouponRaw;
  assert(invalidCouponRes.status === 201 || invalidCouponRes.status === 200);
  assert(!invalidCouponOrder.couponApplied, 'Invalid coupon must not be applied');
  assert.strictEqual(invalidCouponOrder.discountApplied, 0, 'Discount for invalid coupon must be 0');
  console.log('  ✓ Invalid coupon code NON_EXISTENT_COUPON_999 discarded');
  console.log('✅ Test 4 Passed: Invalid coupons cannot grant discounts.\n');

  // ─────────────────────────────────────────────────────────────
  // 5. Insufficient Stock Protection
  // ─────────────────────────────────────────────────────────────
  console.log('--- Test 5: Insufficient Stock Protection ---');
  const excessiveQtyRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 1, name: 'Potato', qty: 999999, quantity: 999999, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
      userId: 'test_stock_user',
      userEmail: 'stock@example.com',
      phone: '99203 24172',
      address: 'Ghatkopar Test',
      paymentMethod: 'Cash on Delivery'
    })
  });
  const excessiveQtyData = await excessiveQtyRes.json();
  assert.strictEqual(excessiveQtyRes.status, 400, 'Excessive quantity exceeding stock must be rejected');
  assert(
    excessiveQtyData.code === 'INSUFFICIENT_STOCK' ||
    excessiveQtyData.code === 'VERIFICATION_FAILED' ||
    (excessiveQtyData.error && excessiveQtyData.error.includes('stock')),
    `Expected stock failure code or message, got: ${JSON.stringify(excessiveQtyData)}`
  );
  console.log('  ✓ Request for 999,999 units rejected with HTTP 400 (INSUFFICIENT_STOCK)');
  console.log('✅ Test 5 Passed: Stock boundaries strictly respected.\n');

  // ─────────────────────────────────────────────────────────────
  // 6. Duplicate Order Idempotency
  // ─────────────────────────────────────────────────────────────
  console.log('--- Test 6: Duplicate Order Idempotency ---');
  const idempotencyKey = `idem_${Date.now()}_${Math.random()}`;
  const orderOrderData = {
    items: [{ id: 1, name: 'Potato', qty: 1, quantity: 1, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
    userId: 'user_idem',
    userEmail: 'idem@example.com',
    phone: '99203 24172',
    address: 'Ghatkopar Test',
    paymentMethod: 'Cash on Delivery',
    idempotencyKey
  };

  const firstRaw = await (await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderOrderData)
  })).json();
  const firstOrder = firstRaw.order || firstRaw;

  const secondRaw = await (await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderOrderData)
  })).json();
  const secondOrder = secondRaw.order || secondRaw;

  assert.strictEqual(firstOrder.id, secondOrder.id, 'Duplicate submission with same idempotency key must return same order');
  assert.strictEqual(secondRaw.idempotent, true);
  console.log(`  ✓ Identical order submission returned existing order #${firstOrder.id} without creating duplicate`);
  console.log('✅ Test 6 Passed: Order submission idempotency verified.\n');

  // ─────────────────────────────────────────────────────────────
  // 7. Duplicate UTR Protection
  // ─────────────────────────────────────────────────────────────
  console.log('--- Test 7: Duplicate UTR Reference Protection ---');
  const testUtr = `BANK-REF-${Date.now()}`;
  const upi1Res = await fetch(`${BASE_URL}/api/payments/upi/submit-proof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utr: testUtr,
      paymentApp: 'gpay',
      orderData: {
        items: [{ id: 1, name: 'Potato', qty: 1, quantity: 1, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
        userId: 'upi_user_1',
        userEmail: 'upi1@example.com',
        phone: '99203 24172',
        address: 'Ghatkopar Test'
      }
    })
  });
  assert.strictEqual(upi1Res.status, 200);

  // Attempt to submit identical UTR for a second order
  const upi2Res = await fetch(`${BASE_URL}/api/payments/upi/submit-proof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utr: testUtr,
      paymentApp: 'phonepe',
      orderData: {
        items: [{ id: 1, name: 'Potato', qty: 1, quantity: 1, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
        userId: 'upi_user_2',
        userEmail: 'upi2@example.com',
        phone: '99203 24172',
        address: 'Ghatkopar Test'
      }
    })
  });
  const upi2Data = await upi2Res.json();
  assert.strictEqual(upi2Res.status, 400, 'Duplicate UTR must be rejected');
  assert.strictEqual(upi2Data.code, 'DUPLICATE_UTR');
  console.log('  ✓ Reused bank UTR rejected with HTTP 400 (DUPLICATE_UTR)');
  console.log('✅ Test 7 Passed: Duplicate transaction reference reuse prevented.\n');

  // ─────────────────────────────────────────────────────────────
  // 8. Payment Status Cannot be Customer-Manipulated to "Paid"
  // ─────────────────────────────────────────────────────────────
  console.log('--- Test 8: Tamper Protection on Payment Status ---');
  // Customer attempts to place an order with paymentStatus: "Paid"
  const fakePaidOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 1, name: 'Potato', qty: 1, quantity: 1, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
      userId: 'test_fake_paid',
      userEmail: 'fakepaid@example.com',
      phone: '99203 24172',
      address: 'Ghatkopar Test',
      paymentMethod: 'Cash on Delivery',
      paymentStatus: 'Paid' // Untrusted client asserts Paid!
    })
  });
  const fakePaidOrderRaw = await fakePaidOrderRes.json();
  const fakePaidOrder = fakePaidOrderRaw.order || fakePaidOrderRaw;
  assert.strictEqual(fakePaidOrder.paymentStatus, 'Pending', 'Server must ignore client asserting Paid');

  // Customer attempts to PATCH order to "Paid" without admin credentials
  const patchPaidRes = await fetch(`${BASE_URL}/api/orders/${fakePaidOrder.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentStatus: 'Paid' })
  });
  assert.strictEqual(patchPaidRes.status, 403, 'Unauthenticated patch to Paid must return 403');
  console.log('  ✓ Client asserting paymentStatus="Paid" on order creation was forced to "Pending"');
  console.log('  ✓ Unauthenticated PATCH order to "Paid" rejected with HTTP 403');
  console.log('✅ Test 8 Passed: Payment status transitions restricted to verified channels.\n');

  // ─────────────────────────────────────────────────────────────
  // 9. Secrets Leakage Audit
  // ─────────────────────────────────────────────────────────────
  console.log('--- Test 9: Public Endpoints Secrets Leakage Audit ---');
  const keyEndpoint = await (await fetch(`${BASE_URL}/api/payments/razorpay/key`)).json();
  assert.strictEqual(keyEndpoint.secret, undefined, 'Razorpay secret must never be exposed');
  assert.strictEqual(keyEndpoint.keySecret, undefined);
  assert.strictEqual(keyEndpoint.webhookSecret, undefined);

  const settingsEndpoint = await (await fetch(`${BASE_URL}/api/payment-settings`)).json();
  assert.strictEqual(settingsEndpoint.keySecret, undefined);
  assert.strictEqual(settingsEndpoint.webhookSecret, undefined);
  assert.strictEqual(settingsEndpoint.serviceRoleKey, undefined);
  console.log('  ✓ Public key endpoints confirmed to contain zero secrets');
  console.log('✅ Test 9 Passed: Server credentials strictly contained server-side.\n');

  // ─────────────────────────────────────────────────────────────
  // 10. Audit Logging on Sensitive Administrative Actions
  // ─────────────────────────────────────────────────────────────
  console.log('--- Test 10: Audit Trail Verification ---');
  // Admin changes paymentStatus on fakePaidOrder to Paid
  const adminApproveRaw = await (await fetch(`${BASE_URL}/api/orders/${fakePaidOrder.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ paymentStatus: 'Paid', adminRemarks: 'Cash collected by driver' })
  })).json();
  const adminApprove = adminApproveRaw.order || adminApproveRaw;
  assert.strictEqual(adminApprove.paymentStatus, 'Paid');

  // Check audit trail
  const trail = adminApprove.paymentAuditTrail || [];
  assert(trail.length > 0, 'Audit trail must record payment verification');
  const verifyEntry = trail.find((e: any) => e.action === 'PAYMENT_VERIFIED');
  assert(verifyEntry, 'PAYMENT_VERIFIED must be recorded in paymentAuditTrail');
  assert(verifyEntry.performedBy.includes('greensabjies@gmail.com'), 'Audit trail must record admin email');
  console.log(`  ✓ Audit trail logged PAYMENT_VERIFIED by: ${verifyEntry.performedBy}`);
  console.log('✅ Test 10 Passed: Administrative audit logging verified.\n');

  console.log('🌟 ALL 10 END-TO-END PRODUCTION AUDIT TESTS PASSED WITH ZERO FAILURES! 🌟');
}

runE2EProductionAudit().catch(err => {
  console.error('❌ E2E Audit Failed:', err);
  process.exit(1);
});
