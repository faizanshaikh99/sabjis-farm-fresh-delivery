import assert from 'node:assert';

const BASE_URL = 'http://localhost:3000';

async function runCheckoutAddressTests() {
  console.log('🚀 Starting Comprehensive Checkout Address & Payment Flow Test Suite...\n');

  // Step 0: Create a unique test customer session
  const testEmail = `checkout_test_${Date.now()}@example.com`;
  const testPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
  const registerRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Pooja Patil',
      email: testEmail,
      phone: testPhone,
      password: 'StrongPassword#123'
    })
  });

  const registerData = await registerRes.json();
  assert.strictEqual(registerRes.status, 201, 'Customer registration should succeed');
  assert(registerData.sessionId, 'Session ID should be returned upon registration');
  const sessionId = registerData.sessionId;
  const user = registerData.user;
  console.log(`✅ Step 0: Test customer registered: ${user.name} (${user.id})`);

  // Test 1: Initially customer has zero addresses
  const getInitialAddrRes = await fetch(`${BASE_URL}/api/users/addresses`, {
    headers: { 'x-session-id': sessionId }
  });
  const initialAddrData = await getInitialAddrRes.json();
  assert.strictEqual(getInitialAddrRes.status, 200);
  assert(Array.isArray(initialAddrData.addresses));
  assert.strictEqual(initialAddrData.addresses.length, 0, 'New customer should have 0 addresses');
  console.log('✅ Test 1 Passed: Initial addresses list correctly returns empty array.');

  // Test 2: Address Validation - missing required fields rejected with clear error
  const invalidAddrRes = await fetch(`${BASE_URL}/api/users/addresses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
    body: JSON.stringify({
      label: 'Home',
      flat: '',
      street: 'Pant Nagar',
      area: 'Ghatkopar East',
      pin: '400075'
    })
  });
  const invalidAddrData = await invalidAddrRes.json();
  assert.strictEqual(invalidAddrRes.status, 400, 'Empty flat should return HTTP 400');
  assert(invalidAddrData.error && invalidAddrData.error.toLowerCase().includes('flat'), 'Error should explain missing flat');
  console.log('✅ Test 2 Passed: Missing address fields properly validated and rejected.');

  // Test 3: Address Validation - invalid pincode rejected with clear error
  const invalidPinRes = await fetch(`${BASE_URL}/api/users/addresses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
    body: JSON.stringify({
      label: 'Home',
      flat: 'B-104, Gokul Residency',
      street: 'Pant Nagar',
      area: 'Ghatkopar East',
      pin: '40007' // Only 5 digits
    })
  });
  const invalidPinData = await invalidPinRes.json();
  assert.strictEqual(invalidPinRes.status, 400, 'Invalid pincode should return HTTP 400');
  assert(invalidPinData.error && invalidPinData.error.toLowerCase().includes('pincode'), 'Error should explain invalid pincode');
  console.log('✅ Test 3 Passed: 6-digit pincode format strictly validated.');

  // Test 4: Save valid address - permanently stored in DB & linked to user account
  const validAddrRes = await fetch(`${BASE_URL}/api/users/addresses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
    body: JSON.stringify({
      label: 'Home',
      flat: 'Flat 402, Sunshine Heights',
      street: 'Cama Lane, Near Jain Temple',
      area: 'Ghatkopar West',
      pin: '400086'
    })
  });
  const validAddrData = await validAddrRes.json();
  assert.strictEqual(validAddrRes.status, 201, 'Valid address saving should succeed');
  assert(validAddrData.addresses && validAddrData.addresses.length === 1);
  assert.strictEqual(validAddrData.addresses[0].flat, 'Flat 402, Sunshine Heights');
  assert.strictEqual(validAddrData.addresses[0].pin, '400086');
  console.log('✅ Test 4 Passed: Valid address successfully saved and linked to user account.');

  // Test 5: Future visits / Reload - /api/auth/me and /api/users/addresses display saved addresses correctly
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'x-session-id': sessionId }
  });
  const meData = await meRes.json();
  assert.strictEqual(meRes.status, 200);
  assert(meData.user.addresses && meData.user.addresses.length === 1);
  assert.strictEqual(meData.user.addresses[0].flat, 'Flat 402, Sunshine Heights');
  assert.strictEqual(meData.user.addresses[0].pin, '400086');
  console.log('✅ Test 5 Passed: Saved addresses persist and correctly display on future visits /auth/me.');

  // Test 6: Cart Verification - authoritative pricing and delivery calculation
  const verifyRes = await fetch(`${BASE_URL}/api/cart/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 1, name: 'Potato', qty: 2, weightInGrams: 1000, weight: '1 kg' }],
      paymentMethod: 'cod',
      userId: user.id
    })
  });
  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyRes.status, 200);
  assert(verifyData.valid === true);
  assert.strictEqual(verifyData.subtotal, 60);
  assert.strictEqual(verifyData.delivery, 30);
  assert.strictEqual(verifyData.total, 90);
  console.log('✅ Test 6 Passed: Cart verification engine authenticates pricing server-side.');

  // Test 7: Place COD order using saved address
  const orderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
    body: JSON.stringify({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      phone: user.phone,
      items: [{ id: 1, name: 'Potato', qty: 2, weightInGrams: 1000, weight: '1 kg' }],
      address: 'Flat 402, Sunshine Heights, Cama Lane, Near Jain Temple, Ghatkopar West — 400086',
      paymentMethod: 'Cash on Delivery',
      paymentStatus: 'Pending',
      idempotencyKey: `idem_test_${Date.now()}`
    })
  });
  const orderData = await orderRes.json();
  assert.strictEqual(orderRes.status, 201);
  assert(orderData.id);
  assert.strictEqual(orderData.total, 90);
  assert.strictEqual(orderData.status, 'New Orders');
  assert.strictEqual(orderData.payment, 'Cash on Delivery');
  console.log(`✅ Test 7 Passed: Order #${orderData.id} placed cleanly with saved address.`);

  // Test 8: Order Idempotency - duplicate submission returns existing order without creating duplicate
  const idemKey = `idem_dup_${Date.now()}`;
  const firstOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
    body: JSON.stringify({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      phone: user.phone,
      items: [{ id: 1, name: 'Potato', qty: 1, weightInGrams: 1000, weight: '1 kg' }],
      address: 'Flat 402, Sunshine Heights, Cama Lane, Near Jain Temple, Ghatkopar West — 400086',
      paymentMethod: 'Cash on Delivery',
      idempotencyKey: idemKey
    })
  });
  const firstOrderData = await firstOrderRes.json();
  const firstId = firstOrderData.id || firstOrderData.order?.id;

  const dupOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
    body: JSON.stringify({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      phone: user.phone,
      items: [{ id: 1, name: 'Potato', qty: 1, weightInGrams: 1000, weight: '1 kg' }],
      address: 'Flat 402, Sunshine Heights, Cama Lane, Near Jain Temple, Ghatkopar West — 400086',
      paymentMethod: 'Cash on Delivery',
      idempotencyKey: idemKey
    })
  });
  const dupOrderData = await dupOrderRes.json();
  const dupId = dupOrderData.id || dupOrderData.order?.id;

  assert.strictEqual(firstId, dupId, 'Duplicate order submission must return the exact same order ID');
  console.log('✅ Test 8 Passed: Idempotency protection prevents duplicate orders.');

  console.log('\n🌟 ALL 8 CHECKOUT ADDRESS & PAYMENT FLOW TESTS PASSED SUCCESSFULLY! 🌟');
}

runCheckoutAddressTests().catch((err) => {
  console.error('❌ Test Failure:', err);
  process.exit(1);
});
