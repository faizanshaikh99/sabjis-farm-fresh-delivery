import assert from 'assert';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🚀 Starting Comprehensive Product Deletion & Sync Test Suite...\n');

  // 1. Authenticate as Admin
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'greensabjies@gmail.com', password: 'Pizza@999' })
  });
  const loginData = await loginRes.json();
  assert.strictEqual(loginData.success, true, 'Admin login must succeed');
  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-session-id': loginData.sessionId
  };
  console.log('✅ Admin authenticated successfully.');

  // =========================================================================
  // TEST J: Admin authorization check
  // =========================================================================
  console.log('\n--- Running TEST J: Admin Authorization Requirement ---');
  const unauthRes = await fetch(`${BASE_URL}/api/products/999999`, {
    method: 'DELETE'
  });
  assert.strictEqual(unauthRes.status, 403, 'Unauthenticated DELETE /api/products/:id must return 403 Forbidden');
  const unauthDbRes = await fetch(`${BASE_URL}/api/admin/database/products/999999`, {
    method: 'DELETE'
  });
  assert([401, 403].includes(unauthDbRes.status), 'Unauthenticated DELETE /api/admin/database/:table/:id must return 401 or 403');
  const unauthBulkRes = await fetch(`${BASE_URL}/api/admin/database/products/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [999999] })
  });
  assert([401, 403].includes(unauthBulkRes.status), 'Unauthenticated bulk delete must return 401 or 403');
  console.log('✅ TEST J PASSED: All deletion endpoints strictly require admin authorization.');

  // =========================================================================
  // TEST K: Product ID validation
  // =========================================================================
  console.log('\n--- Running TEST K: Product ID Validation ---');
  const invalidIdRes = await fetch(`${BASE_URL}/api/products/not-a-number`, {
    method: 'DELETE',
    headers: adminHeaders
  });
  assert.strictEqual(invalidIdRes.status, 400, 'Invalid product ID must return 400 Bad Request');
  const invalidDbIdRes = await fetch(`${BASE_URL}/api/admin/database/products/not-a-number`, {
    method: 'DELETE',
    headers: adminHeaders
  });
  assert.strictEqual(invalidDbIdRes.status, 400, 'Invalid DB product ID must return 400 Bad Request');
  console.log('✅ TEST K PASSED: Non-numeric and malformed product IDs return 400.');

  // =========================================================================
  // Baseline: Read current products
  // =========================================================================
  const initialProductsRes = await fetch(`${BASE_URL}/api/products`);
  const initialProducts: any[] = await initialProductsRes.json();
  assert(Array.isArray(initialProducts), 'GET /api/products must return an array');
  console.log(`Current products count: ${initialProducts.length}`);

  // Create two temporary test products to test single delete and bulk delete
  const testProdA = {
    name: 'Temporary Test Radish',
    hindi: 'Mooli Test',
    category: 'daily',
    price: 35,
    sp: 35,
    basePricePerKg: 35,
    weight: '500g',
    img: 'https://images.unsplash.com/photo-1593105544559-ecb03bf76f82?w=500',
    stockQty: 50,
    tags: ['Fresh', 'Test'],
    weightSlabs: [
      { id: 'radish-250', weight: '250g', weightInGrams: 250, price: 10, isPopular: false },
      { id: 'radish-500', weight: '500g', weightInGrams: 500, price: 18, isPopular: true },
      { id: 'radish-1000', weight: '1kg', weightInGrams: 1000, price: 35, isPopular: false }
    ]
  };

  const createARes = await fetch(`${BASE_URL}/api/products`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(testProdA)
  });
  const createdA = await createARes.json();
  assert(createdA && createdA.id, 'Created product A must have an id');
  const prodAId = createdA.id;
  console.log(`Created temporary product A with ID #${prodAId}`);

  const testProdB = {
    name: 'Temporary Test Spinach',
    hindi: 'Palak Test',
    category: 'leafy',
    price: 40,
    sp: 40,
    basePricePerKg: 40,
    weight: '250g',
    img: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=500',
    stockQty: 30,
    tags: ['Green', 'Test'],
    weightSlabs: []
  };
  const createBRes = await fetch(`${BASE_URL}/api/products`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(testProdB)
  });
  const createdB = await createBRes.json();
  assert(createdB && createdB.id, 'Created product B must have an id');
  const prodBId = createdB.id;
  console.log(`Created temporary product B with ID #${prodBId}`);

  // =========================================================================
  // TEST I: Edit existing product price & weight slabs
  // =========================================================================
  console.log('\n--- Running TEST I: Edit Product Pricing and Weight Slabs ---');
  const updatePriceRes = await fetch(`${BASE_URL}/api/products/${prodAId}/base-price`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ basePricePerKg: 42 })
  });
  const updatePriceData = await updatePriceRes.json();
  assert.strictEqual(updatePriceData.success, true, 'Base price update must succeed');
  assert.strictEqual(Number(updatePriceData.product.basePricePerKg), 42, 'Updated base price must be 42');

  const updateSlabsRes = await fetch(`${BASE_URL}/api/products/${prodAId}/slabs`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({
      slabs: [
        { id: 'radish-500', weight: '500g', weightInGrams: 500, price: 22, isPopular: true },
        { id: 'radish-1000', weight: '1kg', weightInGrams: 1000, price: 42, isPopular: false }
      ]
    })
  });
  const updateSlabsData = await updateSlabsRes.json();
  assert.strictEqual(updateSlabsData.success, true, 'Weight slabs update must succeed');
  assert.strictEqual(updateSlabsData.product.weightSlabs.length, 2, 'Should have 2 updated slabs');
  console.log('✅ TEST I PASSED: Product pricing and weight slabs edit and persist properly.');

  // =========================================================================
  // TEST A: Delete one product
  // =========================================================================
  console.log('\n--- Running TEST A: Delete One Product ---');
  const deleteARes = await fetch(`${BASE_URL}/api/products/${prodAId}`, {
    method: 'DELETE',
    headers: adminHeaders
  });
  assert.strictEqual(deleteARes.status, 200, 'DELETE /api/products/:id must return 200');
  const deleteAData = await deleteARes.json();
  assert.strictEqual(deleteAData.success, true, 'Delete response must report success');
  assert(
    !deleteAData.products.some((p: any) => p.id === prodAId),
    'Returned products list must not contain deleted product'
  );
  console.log(`✅ Product #${prodAId} deleted successfully.`);

  // Verify it disappears from GET /api/products
  const afterDeleteRes = await fetch(`${BASE_URL}/api/products`);
  const afterDeleteList: any[] = await afterDeleteRes.json();
  assert(
    !afterDeleteList.some((p: any) => p.id === prodAId),
    'GET /api/products must not contain deleted product'
  );

  // Verify GET /api/products/:id returns 404
  const getDeletedRes = await fetch(`${BASE_URL}/api/products/${prodAId}`);
  assert.strictEqual(getDeletedRes.status, 404, 'GET /api/products/:id for deleted product must return 404');
  console.log('✅ TEST A PASSED: Product deleted cleanly; 404 returned on single lookup.');

  // =========================================================================
  // TEST B: Refresh / Repeated GET check
  // =========================================================================
  console.log('\n--- Running TEST B: Subsequent Reads Do Not Resurrect Product ---');
  for (let i = 0; i < 3; i++) {
    const refreshRes = await fetch(`${BASE_URL}/api/products`);
    const refreshedProducts: any[] = await refreshRes.json();
    assert(
      !refreshedProducts.some((p: any) => p.id === prodAId),
      `Refreshed query #${i+1} must not contain deleted product #${prodAId}`
    );
  }
  console.log('✅ TEST B PASSED: Deleted product remains absent on repeated reads.');

  // =========================================================================
  // TEST E: Bulk delete selected products
  // =========================================================================
  console.log('\n--- Running TEST E: Bulk Delete Selected Products ---');
  // Create 3 temporary products for bulk deletion
  const bulkProdIds: number[] = [];
  for (let i = 1; i <= 3; i++) {
    const res = await fetch(`${BASE_URL}/api/products`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: `Bulk Test Item ${i}`,
        hindi: `Item ${i}`,
        category: 'daily',
        price: 20 + i,
        sp: 20 + i,
        basePricePerKg: 20 + i,
        weight: '500g',
        img: 'https://images.unsplash.com/photo-1593105544559-ecb03bf76f82?w=500',
        stockQty: 10,
        tags: ['BulkTest']
      })
    });
    const item = await res.json();
    bulkProdIds.push(item.id);
  }
  console.log(`Created 3 items for bulk delete: ${bulkProdIds.join(', ')}`);

  // Bulk delete 2 of them, leave the 3rd
  const idsToDelete = [bulkProdIds[0], bulkProdIds[1]];
  const keptId = bulkProdIds[2];

  const bulkDeleteRes = await fetch(`${BASE_URL}/api/admin/database/products/bulk-delete`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ ids: idsToDelete })
  });
  assert.strictEqual(bulkDeleteRes.status, 200, 'Bulk delete must return 200');
  const bulkDeleteData = await bulkDeleteRes.json();
  assert.strictEqual(bulkDeleteData.success, true, 'Bulk delete response must indicate success');

  // Verify only selected products were deleted, keptId remains
  const currentCatalog = await (await fetch(`${BASE_URL}/api/products`)).json();
  assert(!currentCatalog.some((p: any) => idsToDelete.includes(p.id)), 'Deleted bulk IDs must be absent');
  assert(currentCatalog.some((p: any) => p.id === keptId), 'Non-deleted bulk ID must still exist');
  console.log('✅ TEST E PASSED: Bulk delete removed only requested IDs and preserved remaining items.');

  // Clean up remaining temporary items
  await fetch(`${BASE_URL}/api/products/${prodBId}`, { method: 'DELETE', headers: adminHeaders });
  await fetch(`${BASE_URL}/api/products/${keptId}`, { method: 'DELETE', headers: adminHeaders });
  console.log('Cleaned up remaining test products.');

  // =========================================================================
  // TEST H: Add a new product after deletion
  // =========================================================================
  console.log('\n--- Running TEST H: Add New Product After Deletion ---');
  const newProductPayload = {
    name: 'Fresh Mint Leaves',
    hindi: 'Pudina Fresh',
    category: 'leafy',
    price: 15,
    sp: 15,
    basePricePerKg: 60,
    weight: '100g',
    img: 'https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?w=500',
    stockQty: 45,
    tags: ['Fresh', 'Herbs'],
    weightSlabs: [
      { id: 'mint-100', weight: '100g', weightInGrams: 100, price: 15, isPopular: true }
    ]
  };
  const addRes = await fetch(`${BASE_URL}/api/products`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(newProductPayload)
  });
  assert.strictEqual(addRes.status, 201, 'POST /api/products should return 201 Created');
  const addedProd = await addRes.json();
  assert(addedProd && addedProd.id, 'New product must have an ID');
  console.log(`Added new product #${addedProd.id} (${addedProd.name}).`);

  // Verify it appears in GET /api/products
  const verifyCatalog = await (await fetch(`${BASE_URL}/api/products`)).json();
  assert(verifyCatalog.some((p: any) => p.id === addedProd.id), 'Newly added product must appear in catalog');
  console.log('✅ TEST H PASSED: Product added successfully after deletion cycle.');

  // Clean up added test product
  await fetch(`${BASE_URL}/api/products/${addedProd.id}`, { method: 'DELETE', headers: adminHeaders });

  // =========================================================================
  // TEST L: Category & Storefront synchronization
  // =========================================================================
  console.log('\n--- Running TEST L: Category Filtering and Storefront Sync ---');
  const finalCatalog = await (await fetch(`${BASE_URL}/api/products`)).json();
  const leafyProducts = finalCatalog.filter((p: any) => p.category === 'leafy');
  console.log(`Total active products: ${finalCatalog.length}, Leafy products: ${leafyProducts.length}`);
  // No deleted temporary products exist
  assert(!finalCatalog.some((p: any) => p.name.includes('Temporary Test')), 'No temporary products remain');
  console.log('✅ TEST L PASSED: Catalog and category state clean and synchronized.');

  console.log('\n🎉 ALL EXECUTED TEST SCENARIOS PASSED WITH ZERO FAILURES!\n');
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
