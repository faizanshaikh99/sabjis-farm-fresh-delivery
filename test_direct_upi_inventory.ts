import assert from 'assert';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🚀 Starting Direct UPI & Inventory Separation Integration Test Suite...\n');

  // Step 0: Admin Login
  console.log('--- Step 0: Authenticating Admin ---');
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

  // Check initial stock for Product #1 (Potato)
  const initialProdRes = await fetch(`${BASE_URL}/api/products`);
  const initialProducts = await initialProdRes.json();
  const potato = initialProducts.find((p: any) => p.id === 1);
  assert(potato, 'Product #1 Potato must exist');
  const initialPotatoStock = potato.stockQty;
  const initialPotatoReserved = potato.reservedQty || 0;
  console.log(`Initial Potato Stock: available=${initialPotatoStock}, reserved=${initialPotatoReserved}\n`);

  // ─────────────────────────────────────────────────────────────
  // Test 1: Reasonable UTR text validation (not assuming 12 digits)
  // ─────────────────────────────────────────────────────────────
  console.log('--- Test 1: UPI Reference Text Formats (Non-12 digits) ---');
  
  // Non-12 digit references: 8-char bank ref, 16-char IMPS ref, alphanumeric ref
  const runId = Math.floor(Math.random() * 10000);
  const validNon12Refs = [
    `BARB${runId}`,                  // 8 characters
    `HDFC00123456${runId}`,          // 16 characters
    `UPI-${runId}-SBI`,              // Alphanumeric with hyphens
    `ICIC/${runId}/PAY`              // Alphanumeric with slashes
  ];

  for (const testRef of validNon12Refs) {
    const initOrderRes = await fetch(`${BASE_URL}/api/payments/upi/submit-proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        utr: testRef,
        paymentApp: 'gpay',
        orderData: {
          items: [{ id: 1, name: 'Potato', qty: 1, quantity: 1, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
          userId: 'test_user_ref',
          userEmail: 'user_ref@example.com',
          phone: '99203 24172',
          address: 'Test Address'
        }
      })
    });
    const initOrderData = await initOrderRes.json();
    assert.strictEqual(initOrderRes.status, 200, `Failed to submit legitimate non-12-digit UTR: ${testRef} - error: ${JSON.stringify(initOrderData)}`);
    assert.strictEqual(initOrderData.order.utr, testRef, `UTR should be stored as original text: ${testRef}`);
    assert.strictEqual(initOrderData.paymentStatus, 'PENDING_VERIFICATION');
    console.log(`  ✓ Accepted legitimate reference format: "${testRef}"`);
  }
  console.log('✅ Test 1 Passed: Legitimate non-12-digit UPI/bank references accepted and stored as text.\n');

  // ─────────────────────────────────────────────────────────────
  // Test 2 & 3: Clear separation of RESERVED vs DEDUCTED on pending payment
  // ─────────────────────────────────────────────────────────────
  console.log('--- Test 2 & 3: Pending UPI Payment Reserves Stock (Not a Sale) ---');
  
  // Fetch current stock
  const preOrderProdRes = await fetch(`${BASE_URL}/api/products`);
  const preProducts = await preOrderProdRes.json();
  const prePotato = preProducts.find((p: any) => p.id === 1);
  const preStock = prePotato.stockQty;
  const preReserved = prePotato.reservedQty || 0;

  const testUtr = `TXN-REF-${Date.now()}`;
  const orderSubmissionRes = await fetch(`${BASE_URL}/api/payments/upi/submit-proof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utr: testUtr,
      paymentApp: 'phonepe',
      orderData: {
        items: [{ id: 1, name: 'Potato', qty: 2, quantity: 2, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
        userId: 'test_inventory_user',
        userEmail: 'inventory_user@example.com',
        phone: '99203 24172',
        address: 'Ghatkopar Test'
      }
    })
  });
  const orderSubmission = await orderSubmissionRes.json();
  assert.strictEqual(orderSubmissionRes.status, 200, `Order submission failed: ${orderSubmission.error}`);
  const createdOrderId = orderSubmission.order.id;

  // Verify Order entity fields: RESERVED, NOT DEDUCTED, NOT RELEASED
  assert.strictEqual(orderSubmission.order.stockReserved, true, 'order.stockReserved must be true');
  assert.strictEqual(orderSubmission.order.stockDeducted, false, 'order.stockDeducted must be false for pending payment');
  assert.strictEqual(orderSubmission.order.stockReleased, false, 'order.stockReleased must be false');
  assert.strictEqual(orderSubmission.order.inventoryStatus, 'RESERVED', 'order.inventoryStatus must be RESERVED');
  assert.strictEqual(orderSubmission.order.paymentStatus, 'PENDING_VERIFICATION');

  // Verify Product inventory levels: stockQty decremented by 2, reservedQty incremented by 2
  const postOrderProdRes = await fetch(`${BASE_URL}/api/products`);
  const postProducts = await postOrderProdRes.json();
  const postPotato = postProducts.find((p: any) => p.id === 1);
  assert.strictEqual(postPotato.stockQty, preStock - 2, `Available stock should decrease by reserved amount: expected ${preStock - 2}, got ${postPotato.stockQty}`);
  assert.strictEqual(postPotato.reservedQty, preReserved + 2, `Reserved stock should increase by 2: expected ${preReserved + 2}, got ${postPotato.reservedQty}`);

  // Verify Audit Trail records STOCK_RESERVED
  const auditEntries = orderSubmission.order.paymentAuditTrail || [];
  const reserveEntry = auditEntries.find((e: any) => e.action === 'STOCK_RESERVED');
  assert(reserveEntry, 'Must log STOCK_RESERVED in audit trail');
  console.log(`  ✓ Order #${createdOrderId} placed with stockReserved=true, stockDeducted=false, inventoryStatus=RESERVED`);
  console.log(`  ✓ Available stock decremented (${preStock} -> ${postPotato.stockQty}), Reserved stock incremented (${preReserved} -> ${postPotato.reservedQty})`);
  console.log('✅ Test 2 & 3 Passed: Pending payment reserves inventory without treating as completed sale.\n');

  // ─────────────────────────────────────────────────────────────
  // Test 4: Rejection releases reservation exactly once
  // ─────────────────────────────────────────────────────────────
  console.log('--- Test 4: Payment Rejection Releases Reservation Exactly Once ---');
  
  // Admin rejects payment
  const rejectRes = await fetch(`${BASE_URL}/api/orders/${createdOrderId}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      paymentStatus: 'Rejected',
      adminRemarks: 'Invalid transaction reference, funds not received'
    })
  });
  const rejectData = await rejectRes.json();
  assert.strictEqual(rejectRes.status, 200, 'Admin rejection failed');
  assert.strictEqual(rejectData.order.paymentStatus, 'Rejected');
  assert.strictEqual(rejectData.order.stockReserved, false, 'stockReserved should be false after release');
  assert.strictEqual(rejectData.order.stockReleased, true, 'stockReleased should be true after release');
  assert.strictEqual(rejectData.order.inventoryStatus, 'RELEASED', 'inventoryStatus should be RELEASED');

  // Verify product inventory was restored
  const postRejectProdRes = await fetch(`${BASE_URL}/api/products`);
  const postRejectProducts = await postRejectProdRes.json();
  const postRejectPotato = postRejectProducts.find((p: any) => p.id === 1);
  assert.strictEqual(postRejectPotato.stockQty, preStock, `Stock should be restored back to ${preStock}`);
  assert.strictEqual(postRejectPotato.reservedQty, preReserved, `Reserved stock should be decremented back to ${preReserved}`);

  // Try duplicate release / duplicate rejection -> Must NOT double release
  const duplicateRejectRes = await fetch(`${BASE_URL}/api/orders/${createdOrderId}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      paymentStatus: 'Rejected',
      adminRemarks: 'Duplicate reject attempt'
    })
  });
  assert.strictEqual(duplicateRejectRes.status, 200);

  const postDupRejectProdRes = await fetch(`${BASE_URL}/api/products`);
  const postDupRejectPotato = (await postDupRejectProdRes.json()).find((p: any) => p.id === 1);
  assert.strictEqual(postDupRejectPotato.stockQty, preStock, 'Duplicate rejection must not double-restore stock!');
  assert.strictEqual(postDupRejectPotato.reservedQty, preReserved, 'Duplicate rejection must not alter reserved stock!');
  console.log(`  ✓ Payment rejected: Reserved stock released exactly once back to available inventory.`);
  console.log(`  ✓ Duplicate rejection attempt prevented double release.`);
  console.log('✅ Test 4 Passed: Reservation released exactly once on rejection.\n');

  // ─────────────────────────────────────────────────────────────
  // Test 5: Only confirmed/paid state permanently consumes stock
  // ─────────────────────────────────────────────────────────────
  console.log('--- Test 5: Confirmed / Paid Permanently Consumes Stock ---');
  
  const testUtr2 = `PAID-REF-${Date.now()}`;
  const order2Res = await fetch(`${BASE_URL}/api/payments/upi/submit-proof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utr: testUtr2,
      paymentApp: 'gpay',
      orderData: {
        items: [{ id: 1, name: 'Potato', qty: 3, quantity: 3, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
        userId: 'test_paid_user',
        userEmail: 'paid_user@example.com',
        phone: '99203 24172',
        address: 'Ghatkopar Test'
      }
    })
  });
  const order2Data = await order2Res.json();
  const order2Id = order2Data.order.id;
  assert.strictEqual(order2Data.order.stockReserved, true);
  assert.strictEqual(order2Data.order.stockDeducted, false);

  // Stock is now reserved for 3 units
  const duringOrder2Prod = (await (await fetch(`${BASE_URL}/api/products`)).json()).find((p: any) => p.id === 1);
  assert.strictEqual(duringOrder2Prod.stockQty, preStock - 3);
  assert.strictEqual(duringOrder2Prod.reservedQty, preReserved + 3);

  // Admin approves payment -> Confirmed / Paid
  const approveRes = await fetch(`${BASE_URL}/api/orders/${order2Id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      paymentStatus: 'Paid',
      adminRemarks: 'Payment confirmed in merchant bank statement'
    })
  });
  const approveData = await approveRes.json();
  assert.strictEqual(approveRes.status, 200);
  assert.strictEqual(approveData.order.paymentStatus, 'Paid');
  assert.strictEqual(approveData.order.stockReserved, false, 'stockReserved must become false on payment confirmation');
  assert.strictEqual(approveData.order.stockDeducted, true, 'stockDeducted must become true on payment confirmation');
  assert.strictEqual(approveData.order.inventoryStatus, 'DEDUCTED', 'inventoryStatus must be DEDUCTED');

  // Verify Product: reservedQty reduced by 3, stockQty remains decremented by 3 (permanently consumed)
  const postApproveProd = (await (await fetch(`${BASE_URL}/api/products`)).json()).find((p: any) => p.id === 1);
  assert.strictEqual(postApproveProd.stockQty, preStock - 3, 'Available stock remains deducted');
  assert.strictEqual(postApproveProd.reservedQty, preReserved, 'Reserved stock is freed as deduction is finalized');

  // Verify Audit Trail has STOCK_DEDUCTED
  const order2Audit = approveData.order.paymentAuditTrail || [];
  const deductedAudit = order2Audit.find((a: any) => a.action === 'STOCK_DEDUCTED');
  assert(deductedAudit, 'Audit trail must contain STOCK_DEDUCTED upon payment confirmation');
  console.log(`  ✓ Order #${order2Id} paid: Transitioned from RESERVED to permanently DEDUCTED.`);
  console.log(`  ✓ Reserved stock cleared; permanent consumption recorded in audit trail.`);
  console.log('✅ Test 5 Passed: Stock becomes permanently consumed only upon confirmed payment.\n');

  // ─────────────────────────────────────────────────────────────
  // Test 6: Prevent double deduction & double release across retries/duplicates
  // ─────────────────────────────────────────────────────────────
  console.log('--- Test 6: Prevent Double Deduction & Duplicate Submission ---');
  
  // 6a: Duplicate payment confirmation attempt on order2
  const reApproveRes = await fetch(`${BASE_URL}/api/orders/${order2Id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      paymentStatus: 'Paid',
      adminRemarks: 'Second approve attempt'
    })
  });
  assert.strictEqual(reApproveRes.status, 200);
  const postReApproveProd = (await (await fetch(`${BASE_URL}/api/products`)).json()).find((p: any) => p.id === 1);
  assert.strictEqual(postReApproveProd.stockQty, preStock - 3, 'Double deduction prevented: stockQty unchanged!');

  // 6b: Duplicate UTR rejection
  const dupUtrRes = await fetch(`${BASE_URL}/api/payments/upi/submit-proof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utr: testUtr2, // Already used for order2!
      paymentApp: 'gpay',
      orderData: {
        items: [{ id: 1, name: 'Potato', qty: 1, quantity: 1, sp: 30, weightInGrams: 1000, weight: '1 kg' }],
        userId: 'another_user',
        userEmail: 'another@example.com',
        phone: '99203 24172',
        address: 'Test'
      }
    })
  });
  assert.strictEqual(dupUtrRes.status, 400, 'Duplicate UTR must be rejected with HTTP 400');
  const dupUtrData = await dupUtrRes.json();
  assert.strictEqual(dupUtrData.code, 'DUPLICATE_UTR');
  console.log('  ✓ Duplicate UTR submission correctly rejected.');
  console.log('  ✓ Repeated Paid status transition correctly prevented double deduction.');
  console.log('✅ Test 6 Passed: Complete protection against duplicate deduction and reuse.\n');

  console.log('🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! 🚀');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
