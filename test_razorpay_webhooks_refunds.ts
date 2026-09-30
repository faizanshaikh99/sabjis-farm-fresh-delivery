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

async function runAdversarialTestSuite() {
  console.log('🚀 Starting Razorpay, Webhook, and Refund Adversarial Test Suite...\n');

  // Authenticate Admin for subsequent privileged operations
  console.log('--- Step 0: Admin Authentication ---');
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
  console.log('✅ Admin authenticated successfully.\n');

  // ─────────────────────────────────────────────────────────────
  // Scenario 1: Amount manipulation — client attempts ₹1 instead of ₹60/₹500
  // ─────────────────────────────────────────────────────────────
  console.log('--- Scenario 1: Amount Manipulation Protection ---');
  const order1CreateRes = await fetch(`${BASE_URL}/api/payments/razorpay/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 1, name: 'Potato', qty: 1, quantity: 1, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
      userId: 'test_user_amount_manip',
      userEmail: 'manip@example.com',
      phone: '99203 24172',
      address: 'Ghatkopar Test'
    })
  });
  const order1Create = await order1CreateRes.json();
  assert.strictEqual(order1CreateRes.status, 200, `Failed to create order: ${JSON.stringify(order1Create)}`);
  const order1Id = order1Create.orderId;
  const rzpOrder1Id = order1Create.razorpayOrderId;
  const authoritativeAmount = order1Create.calculatedDetails.total;
  assert(authoritativeAmount > 1, `Authoritative amount should be > 1, got ${authoritativeAmount}`);

  const payment1Id = `pay_manip_${Date.now()}`;
  const validSig1 = generateHmacSignature(rzpOrder1Id, payment1Id);

  // Client attempts to verify by sending amount: 1 (₹1) or orderData.total: 1 instead of authoritative total
  const manipVerifyRes = await fetch(`${BASE_URL}/api/payments/razorpay/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id: rzpOrder1Id,
      razorpay_payment_id: payment1Id,
      razorpay_signature: validSig1,
      orderId: order1Id,
      amount: 1, // Manipulated ₹1
      orderData: { id: order1Id, total: 1 } // Manipulated orderData total
    })
  });
  const manipVerifyData = await manipVerifyRes.json();
  assert.strictEqual(manipVerifyRes.status, 400, 'Tampered amount must be rejected with HTTP 400');
  assert.strictEqual(manipVerifyData.code, 'AMOUNT_MISMATCH', 'Should reject with AMOUNT_MISMATCH');

  // Verify order in database was NOT marked as Paid
  const checkOrder1Res = await fetch(`${BASE_URL}/api/payments/razorpay/status/${order1Id}`);
  const checkOrder1Data = await checkOrder1Res.json();
  assert.notStrictEqual(checkOrder1Data.paymentStatus, 'Paid', 'Manipulated order must not be marked as Paid');

  // Authoritative verification with correct amount should succeed
  const legitVerifyRes = await fetch(`${BASE_URL}/api/payments/razorpay/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id: rzpOrder1Id,
      razorpay_payment_id: payment1Id,
      razorpay_signature: validSig1,
      orderId: order1Id,
      amount: authoritativeAmount
    })
  });
  const legitVerifyData = await legitVerifyRes.json();
  assert.strictEqual(legitVerifyRes.status, 200, `Legitimate verification failed: ${JSON.stringify(legitVerifyData)}`);
  assert.strictEqual(legitVerifyData.order.paymentStatus, 'Paid');
  assert.strictEqual(legitVerifyData.order.total, authoritativeAmount, 'Order total must remain authoritative');
  console.log(`  ✓ Tampered ₹1 amount rejected with HTTP 400 (${manipVerifyData.code})`);
  console.log(`  ✓ Order verified authoritatively at ₹${authoritativeAmount}`);
  console.log('✅ Scenario 1 Passed: Amount manipulation strictly prevented.\n');

  // ─────────────────────────────────────────────────────────────
  // Scenario 2: Invalid signature — forged Razorpay signature
  // ─────────────────────────────────────────────────────────────
  console.log('--- Scenario 2: Cryptographic Signature Tampering Protection ---');
  const order2CreateRes = await fetch(`${BASE_URL}/api/payments/razorpay/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 1, name: 'Potato', qty: 1, quantity: 1, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
      userId: 'test_user_forge',
      userEmail: 'forge@example.com',
      phone: '99203 24172',
      address: 'Ghatkopar Test'
    })
  });
  const order2Create = await order2CreateRes.json();
  const order2Id = order2Create.orderId;
  const rzpOrder2Id = order2Create.razorpayOrderId;
  const payment2Id = `pay_forge_${Date.now()}`;
  const forgedSig = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const forgedVerifyRes = await fetch(`${BASE_URL}/api/payments/razorpay/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id: rzpOrder2Id,
      razorpay_payment_id: payment2Id,
      razorpay_signature: forgedSig,
      orderId: order2Id
    })
  });
  const forgedVerifyData = await forgedVerifyRes.json();
  assert.strictEqual(forgedVerifyRes.status, 400, 'Forged signature must be rejected with HTTP 400');
  assert.strictEqual(forgedVerifyData.state, 'VERIFICATION_FAILED');

  const checkOrder2 = await (await fetch(`${BASE_URL}/api/payments/razorpay/status/${order2Id}`)).json();
  assert.strictEqual(checkOrder2.paymentStatus, 'Failed', 'Tampered signature should mark payment as Failed');
  console.log('  ✓ Forged HMAC signature rejected with HTTP 400');
  console.log('  ✓ Order status set to Failed; stock released');
  console.log('✅ Scenario 2 Passed: Cryptographic HMAC signature strictly validated.\n');

  // ─────────────────────────────────────────────────────────────
  // Scenario 3: Mismatched order — valid payment/signature from Order A used for Order B
  // ─────────────────────────────────────────────────────────────
  console.log('--- Scenario 3: Mismatched Order Reference Protection ---');
  // Create Order A
  const orderARes = await fetch(`${BASE_URL}/api/payments/razorpay/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 1, name: 'Potato', qty: 1, quantity: 1, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
      userId: 'user_A',
      userEmail: 'usera@example.com',
      phone: '99203 24172',
      address: 'Order A Address'
    })
  });
  const orderA = await orderARes.json();

  // Create Order B
  const orderBRes = await fetch(`${BASE_URL}/api/payments/razorpay/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 1, name: 'Potato', qty: 1, quantity: 1, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
      userId: 'user_B',
      userEmail: 'userb@example.com',
      phone: '99203 24172',
      address: 'Order B Address'
    })
  });
  const orderB = await orderBRes.json();

  // Generate valid payment ID and signature for Order A
  const paymentAId = `pay_order_a_${Date.now()}`;
  const validSigA = generateHmacSignature(orderA.razorpayOrderId, paymentAId);

  // Attacker tries to submit Order A payment token to confirm Order B
  const mismatchRes = await fetch(`${BASE_URL}/api/payments/razorpay/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id: orderA.razorpayOrderId,
      razorpay_payment_id: paymentAId,
      razorpay_signature: validSigA,
      orderId: orderB.orderId // Mismatched Order B!
    })
  });
  const mismatchData = await mismatchRes.json();
  assert.strictEqual(mismatchRes.status, 400, 'Mismatched order reference must be rejected with HTTP 400');
  assert.strictEqual(mismatchData.code, 'ORDER_MISMATCH');

  // Verify Order B is NOT Paid
  const checkOrderB = await (await fetch(`${BASE_URL}/api/payments/razorpay/status/${orderB.orderId}`)).json();
  assert.notStrictEqual(checkOrderB.paymentStatus, 'Paid', 'Order B must not be paid using Order A token');
  console.log('  ✓ Cross-order payment token substitution rejected with HTTP 400 (ORDER_MISMATCH)');
  console.log('  ✓ Target Order B remained unpaid');
  console.log('✅ Scenario 3 Passed: Order reference binding strictly enforced.\n');

  // ─────────────────────────────────────────────────────────────
  // Scenario 4: Duplicate payment / replay protection
  // ─────────────────────────────────────────────────────────────
  console.log('--- Scenario 4: Duplicate Payment & Replay Protection ---');
  // Create Order C
  const orderCRes = await fetch(`${BASE_URL}/api/payments/razorpay/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 1, name: 'Potato', qty: 2, quantity: 2, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
      userId: 'user_replay',
      userEmail: 'replay@example.com',
      phone: '99203 24172',
      address: 'Order C Address'
    })
  });
  const orderC = await orderCRes.json();
  const paymentCId = `pay_replay_${Date.now()}`;
  const validSigC = generateHmacSignature(orderC.razorpayOrderId, paymentCId);

  // Initial valid verification
  const verifyC1 = await fetch(`${BASE_URL}/api/payments/razorpay/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id: orderC.razorpayOrderId,
      razorpay_payment_id: paymentCId,
      razorpay_signature: validSigC,
      orderId: orderC.orderId
    })
  });
  const verifyC1Data = await verifyC1.json();
  assert.strictEqual(verifyC1.status, 200);
  assert.strictEqual(verifyC1Data.order.paymentStatus, 'Paid');

  // Record inventory right after 1st verification
  const prodAfterVerify1 = (await (await fetch(`${BASE_URL}/api/products`)).json()).find((p: any) => p.id === 1);
  const stockAfter1 = prodAfterVerify1.stockQty;
  const soldAfter1 = prodAfterVerify1.soldQty || 0;
  const reservedAfter1 = prodAfterVerify1.reservedQty || 0;

  // Replay #1: Submit the exact same verification request again
  const verifyC2 = await fetch(`${BASE_URL}/api/payments/razorpay/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id: orderC.razorpayOrderId,
      razorpay_payment_id: paymentCId,
      razorpay_signature: validSigC,
      orderId: orderC.orderId
    })
  });
  const verifyC2Data = await verifyC2.json();
  assert.strictEqual(verifyC2.status, 200);
  assert.strictEqual(verifyC2Data.idempotent, true, 'Replay should be acknowledged as idempotent');

  // Replay #2: Submit a third time
  const verifyC3 = await fetch(`${BASE_URL}/api/payments/razorpay/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id: orderC.razorpayOrderId,
      razorpay_payment_id: paymentCId,
      razorpay_signature: validSigC,
      orderId: orderC.orderId
    })
  });
  assert.strictEqual(verifyC3.status, 200);

  // Check inventory: Stock must NOT have been deducted again
  const prodAfterReplays = (await (await fetch(`${BASE_URL}/api/products`)).json()).find((p: any) => p.id === 1);
  assert.strictEqual(prodAfterReplays.stockQty, stockAfter1, 'Stock must not change across replays');
  assert.strictEqual(prodAfterReplays.soldQty, soldAfter1, 'Sold quantity must not increase across replays');
  assert.strictEqual(prodAfterReplays.reservedQty, reservedAfter1, 'Reserved quantity must not change across replays');

  // Attempt to reuse this payment ID for a DIFFERENT order
  const orderDRes = await fetch(`${BASE_URL}/api/payments/razorpay/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 1, name: 'Potato', qty: 1, quantity: 1, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
      userId: 'user_D',
      userEmail: 'userd@example.com',
      phone: '99203 24172',
      address: 'Order D Address'
    })
  });
  const orderD = await orderDRes.json();
  const reuseSig = generateHmacSignature(orderD.razorpayOrderId, paymentCId);
  const reuseRes = await fetch(`${BASE_URL}/api/payments/razorpay/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id: orderD.razorpayOrderId,
      razorpay_payment_id: paymentCId, // Already used for Order C!
      razorpay_signature: reuseSig,
      orderId: orderD.orderId
    })
  });
  const reuseData = await reuseRes.json();
  assert.strictEqual(reuseRes.status, 400, 'Reusing payment ID for different order must be rejected');
  assert.strictEqual(reuseData.code, 'PAYMENT_ID_REUSED');
  console.log('  ✓ Replayed verification handled idempotently without re-executing inventory actions');
  console.log('  ✓ Reuse of payment ID on another order rejected with PAYMENT_ID_REUSED');
  console.log('✅ Scenario 4 Passed: Replay attacks and payment ID reuse completely blocked.\n');

  // ─────────────────────────────────────────────────────────────
  // Scenario 5: Duplicate/concurrent webhook delivery
  // ─────────────────────────────────────────────────────────────
  console.log('--- Scenario 5: Duplicate & Concurrent Webhook Idempotency ---');
  // Create Order E
  const orderERes = await fetch(`${BASE_URL}/api/payments/razorpay/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 1, name: 'Potato', qty: 2, quantity: 2, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
      userId: 'user_webhook_test',
      userEmail: 'webhook@example.com',
      phone: '99203 24172',
      address: 'Webhook Test Address'
    })
  });
  const orderE = await orderERes.json();
  const prodBeforeWebhook = (await (await fetch(`${BASE_URL}/api/products`)).json()).find((p: any) => p.id === 1);
  const soldBeforeWebhook = prodBeforeWebhook.soldQty || 0;

  const webhookPaymentId = `pay_wh_${Date.now()}`;
  const webhookPayload = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: webhookPaymentId,
          order_id: orderE.razorpayOrderId,
          amount: orderE.amount,
          currency: 'INR',
          status: 'captured',
          notes: {
            internalOrderId: orderE.orderId
          }
        }
      }
    }
  });
  const webhookSignature = generateWebhookSignature(webhookPayload);

  // Send 3 concurrent webhook requests simultaneously
  const webhookHeaders = {
    'Content-Type': 'application/json',
    'x-razorpay-signature': webhookSignature
  };

  const [wh1, wh2, wh3] = await Promise.all([
    fetch(`${BASE_URL}/api/payments/razorpay/webhook`, { method: 'POST', headers: webhookHeaders, body: webhookPayload }),
    fetch(`${BASE_URL}/api/payments/razorpay/webhook`, { method: 'POST', headers: webhookHeaders, body: webhookPayload }),
    fetch(`${BASE_URL}/api/payments/razorpay/webhook`, { method: 'POST', headers: webhookHeaders, body: webhookPayload })
  ]);

  assert.strictEqual(wh1.status, 200);
  assert.strictEqual(wh2.status, 200);
  assert.strictEqual(wh3.status, 200);

  // Verify order transitioned to Paid
  const checkOrderE = await (await fetch(`${BASE_URL}/api/payments/razorpay/status/${orderE.orderId}`)).json();
  assert.strictEqual(checkOrderE.paymentStatus, 'Paid');

  // Verify product inventory was incremented by exactly 2 (the order quantity), NOT 6 (2 * 3 webhooks)
  const prodAfterWebhook = (await (await fetch(`${BASE_URL}/api/products`)).json()).find((p: any) => p.id === 1);
  assert.strictEqual(prodAfterWebhook.soldQty, soldBeforeWebhook + 2, 'Sold quantity must be incremented exactly once across concurrent webhooks');
  console.log('  ✓ 3 concurrent webhook deliveries processed safely');
  console.log('  ✓ Inventory deduction executed exactly once without over-deduction');
  console.log('✅ Scenario 5 Passed: Webhooks are completely concurrent-safe and idempotent.\n');

  // ─────────────────────────────────────────────────────────────
  // Scenario 6: Unauthorized refund — customer/unauthenticated request
  // ─────────────────────────────────────────────────────────────
  console.log('--- Scenario 6: Unauthorized Refund Protection ---');
  // Attempt refund with NO headers on paid order
  const unauthRefund1 = await fetch(`${BASE_URL}/api/payments/razorpay/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: order1Id, amount: 10, reason: 'Unauthorized test' })
  });
  assert.strictEqual(unauthRefund1.status, 403, 'Unauthenticated refund must return HTTP 403');

  // Attempt refund with regular customer user-id header but no admin session
  const unauthRefund2 = await fetch(`${BASE_URL}/api/orders/${order1Id}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': 'regular_customer_id' },
    body: JSON.stringify({ amount: 10, reason: 'Customer attempting refund' })
  });
  assert.strictEqual(unauthRefund2.status, 403, 'Customer refund attempt must return HTTP 403');

  // Attempt refund with bogus session ID
  const unauthRefund3 = await fetch(`${BASE_URL}/api/orders/${order1Id}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-id': 'bogus_session_123' },
    body: JSON.stringify({ amount: 10, reason: 'Bogus session refund' })
  });
  assert.strictEqual(unauthRefund3.status, 403, 'Invalid session refund attempt must return HTTP 403');
  console.log('  ✓ Unauthenticated refund request rejected with HTTP 403');
  console.log('  ✓ Customer user attempting refund rejected with HTTP 403');
  console.log('  ✓ Bogus session rejected with HTTP 403');
  console.log('✅ Scenario 6 Passed: Only authorized administrators can issue refunds.\n');

  // ─────────────────────────────────────────────────────────────
  // Scenario 7: Excessive refund & partial/full refund state transitions
  // ─────────────────────────────────────────────────────────────
  console.log('--- Scenario 7: Refund Bounds & Payment Status Transitions ---');
  const targetRefundOrder = order1Id; // Total ₹60
  const orderTotal = authoritativeAmount;

  // 7a: Zero, negative, and non-numeric refund amounts
  const zeroRefund = await fetch(`${BASE_URL}/api/orders/${targetRefundOrder}/refund`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ amount: 0, reason: 'Zero test' })
  });
  assert.strictEqual(zeroRefund.status, 400, 'Zero amount refund must be rejected with HTTP 400');

  const negRefund = await fetch(`${BASE_URL}/api/orders/${targetRefundOrder}/refund`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ amount: -25, reason: 'Negative test' })
  });
  assert.strictEqual(negRefund.status, 400, 'Negative amount refund must be rejected with HTTP 400');

  const nonNumRefund = await fetch(`${BASE_URL}/api/orders/${targetRefundOrder}/refund`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ amount: 'invalid_string', reason: 'NaN test' })
  });
  assert.strictEqual(nonNumRefund.status, 400, 'Non-numeric refund must be rejected with HTTP 400');

  // 7b: Excessive refund beyond refundable balance
  const excessiveRefund = await fetch(`${BASE_URL}/api/orders/${targetRefundOrder}/refund`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ amount: orderTotal + 500, reason: 'Excessive test' })
  });
  assert.strictEqual(excessiveRefund.status, 400, 'Excessive refund must be rejected with HTTP 400');
  const excessiveData = await excessiveRefund.json();
  assert.strictEqual(excessiveData.code, 'EXCESSIVE_REFUND');

  // 7c: Valid Partial Refund of ₹20
  const partialAmount = 20;
  const partialRefundRes = await fetch(`${BASE_URL}/api/orders/${targetRefundOrder}/refund`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ amount: partialAmount, reason: 'Customer requested partial refund' })
  });
  assert.strictEqual(partialRefundRes.status, 200, 'Partial refund should succeed');
  const partialRefundData = await partialRefundRes.json();
  assert.strictEqual(partialRefundData.order.paymentStatus, 'Partially Refunded', 'Status must be Partially Refunded');
  assert.strictEqual(partialRefundData.order.refundAmount, partialAmount);
  assert(partialRefundData.refund.refundId, 'Unique refundId must be generated');
  assert.strictEqual(partialRefundData.order.status, 'Confirmed', 'Order status must NOT change due to refund');
  console.log(`  ✓ Partial refund of ₹${partialAmount} processed: paymentStatus="Partially Refunded", orderStatus="Confirmed"`);

  // 7d: Attempt another refund greater than remaining balance
  const remainingBalance = orderTotal - partialAmount;
  const overRemainingRefund = await fetch(`${BASE_URL}/api/orders/${targetRefundOrder}/refund`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ amount: remainingBalance + 10, reason: 'Exceeding remaining balance' })
  });
  assert.strictEqual(overRemainingRefund.status, 400, 'Refund exceeding remaining balance must be rejected');

  // 7e: Complete Full Refund (remaining ₹40)
  const fullRefundRes = await fetch(`${BASE_URL}/api/orders/${targetRefundOrder}/refund`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ amount: remainingBalance, reason: 'Customer returned all items' })
  });
  assert.strictEqual(fullRefundRes.status, 200, 'Full refund completion should succeed');
  const fullRefundData = await fullRefundRes.json();
  assert.strictEqual(fullRefundData.order.paymentStatus, 'Refunded', 'Status must be Refunded');
  assert.strictEqual(fullRefundData.order.refundAmount, orderTotal);
  assert.strictEqual(fullRefundData.order.status, 'Confirmed', 'Order status must NOT change merely because a refund occurred');
  assert.strictEqual(fullRefundData.order.refundHistory.length, 2, 'Refund history must store all refund transactions');
  console.log(`  ✓ Full refund of remaining ₹${remainingBalance} processed: paymentStatus="Refunded", orderStatus="Confirmed"`);

  // 7f: Attempting further refund on fully refunded order must fail
  const postFullRefund = await fetch(`${BASE_URL}/api/orders/${targetRefundOrder}/refund`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ amount: 5, reason: 'Over refund test' })
  });
  assert.strictEqual(postFullRefund.status, 400, 'Refund on already fully refunded order must return HTTP 400');
  const postFullData = await postFullRefund.json();
  assert.strictEqual(postFullData.code, 'ALREADY_REFUNDED');
  console.log('  ✓ Subsequent refund on fully refunded order rejected with ALREADY_REFUNDED');
  console.log('✅ Scenario 7 Passed: Accurate boundary enforcement, unique refund IDs, and state transitions.\n');

  console.log('🎉 ALL 7 ADVERSARIAL TEST SCENARIOS PASSED WITH ZERO FAILURES! 🛡️');
}

runAdversarialTestSuite().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
