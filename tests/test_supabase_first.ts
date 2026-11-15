import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";

process.env.SKIP_SERVER_LISTEN = "true";

// Lightweight in-memory PostgREST / Supabase client simulator for integration tests
function createMockSupabase(initialTables: Record<string, any[]> = {}, options?: { failTable?: string }) {
  const tables: Record<string, any[]> = {
    users: [],
    sessions: [],
    addresses: [],
    products: [],
    categories: [],
    orders: [],
    offers: [],
    reviews: [],
    coupons: [],
    redemption_logs: [],
    payment_method_discounts: [],
    payment_transactions: [],
    payment_audit_trail: [],
    password_resets: [],
    business_settings: [{ id: 1, min_free_delivery: 299, standard_shipping: 30, gst_percentage: 5, is_open: true }],
    payment_settings: [{ id: 1, business_name: "Sabjies", upi_id: "sabjies@upi", enable_upi: true, enable_cod: true, enable_razorpay: false, auto_approve_upi: false }],
    notifications: [],
    login_history: [],
    audit_logs: [],
    ...initialTables
  };

  function parseOrExpr(expr: string): Array<(row: any) => boolean> {
    // Split on top-level commas outside quotes
    const parts: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (ch === '"') inQuotes = !inQuotes;
      if (ch === "," && !inQuotes) {
        parts.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());

    return parts.map((p) => {
      const m = p.match(/^([^.]+)\.(eq|ilike)\.(.+)$/i);
      if (!m) return () => false;
      const [, col, op, rawVal] = m;
      const val = rawVal.replace(/^"|"$/g, "");
      if (op.toLowerCase() === "eq") {
        return (row: any) => String(row?.[col] ?? "") === val;
      }
      if (op.toLowerCase() === "ilike") {
        const needle = val.replace(/%/g, "").toLowerCase();
        return (row: any) => String(row?.[col] ?? "").toLowerCase().includes(needle);
      }
      return () => false;
    });
  }

  function makeBuilder(table: string) {
    let op: "select" | "upsert" | "insert" | "update" | "delete" = "select";
    let payload: any = null;
    let conflictCol: string | undefined;
    let ignoreDuplicates = false;
    let countMode: string | undefined;
    let headMode = false;
    let filters: Array<(row: any) => boolean> = [];
    let orderSpec: { col: string; asc: boolean } | null = null;
    let rangeSpec: { start: number; end: number } | null = null;
    let limitNum: number | null = null;
    let returnSingle: "single" | "maybeSingle" | null = null;

    const getConflictKey = (col?: string) => col || (table === "coupons" ? "code" : "id");

    const execute = async (): Promise<{ data: any; error: any; count?: number }> => {
      if (options?.failTable && (options.failTable === "*" || options.failTable === table)) {
        return { data: null, error: { message: `Simulated connection failure on ${table}`, code: "ECONNREFUSED" } };
      }

      if (!tables[table]) tables[table] = [];
      const rows = tables[table];

      if (op === "select") {
        let matched = rows.filter((r) => filters.every((fn) => fn(r))).map((r) => ({ ...r }));
        const total = matched.length;
        if (orderSpec) {
          const { col, asc } = orderSpec;
          matched.sort((a, b) => {
            const va = a?.[col];
            const vb = b?.[col];
            if (va === vb) return 0;
            if (va === undefined || va === null) return 1;
            if (vb === undefined || vb === null) return -1;
            return (va < vb ? -1 : 1) * (asc ? 1 : -1);
          });
        }
        if (rangeSpec) {
          matched = matched.slice(rangeSpec.start, rangeSpec.end + 1);
        } else if (limitNum !== null) {
          matched = matched.slice(0, limitNum);
        }
        if (headMode) {
          return { data: null, error: null, count: total };
        }
        if (returnSingle === "maybeSingle") {
          return { data: matched[0] || null, error: null, count: countMode ? total : undefined };
        }
        if (returnSingle === "single") {
          if (matched.length === 0) {
            return { data: null, error: { message: "Row not found", code: "PGRST116" } };
          }
          return { data: matched[0], error: null, count: countMode ? total : undefined };
        }
        return { data: matched, error: null, count: countMode ? total : undefined };
      }

      if (op === "upsert" || op === "insert") {
        const items = Array.isArray(payload) ? payload : [payload];
        const keyCol = getConflictKey(conflictCol);
        const affected: any[] = [];

        for (const item of items) {
          const clone = { ...item };
          const keyVal = clone[keyCol];
          const existingIdx = keyVal !== undefined && keyVal !== null
            ? rows.findIndex((r) => String(r[keyCol]) === String(keyVal))
            : -1;

          if (existingIdx !== -1) {
            if (op === "insert") {
              return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
            }
            if (!ignoreDuplicates) {
              rows[existingIdx] = { ...rows[existingIdx], ...clone };
            }
            affected.push({ ...rows[existingIdx] });
          } else {
            if (clone[keyCol] === undefined) {
              clone[keyCol] = rows.length + 1;
            }
            rows.push(clone);
            affected.push({ ...clone });
          }
        }
        return { data: affected, error: null };
      }

      if (op === "update") {
        const updated: any[] = [];
        for (let i = 0; i < rows.length; i++) {
          if (filters.every((fn) => fn(rows[i]))) {
            rows[i] = { ...rows[i], ...payload };
            updated.push({ ...rows[i] });
          }
        }
        return { data: updated, error: null };
      }

      if (op === "delete") {
        const kept: any[] = [];
        const removed: any[] = [];
        for (const r of rows) {
          if (filters.every((fn) => fn(r))) {
            removed.push(r);
          } else {
            kept.push(r);
          }
        }
        tables[table] = kept;
        return { data: removed, error: null };
      }

      return { data: [], error: null };
    };

    const builder: any = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (op === "select") {
          countMode = opts?.count;
          headMode = Boolean(opts?.head);
        }
        return builder;
      },
      upsert(data: any, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
        op = "upsert";
        payload = data;
        conflictCol = opts?.onConflict;
        ignoreDuplicates = Boolean(opts?.ignoreDuplicates);
        return builder;
      },
      insert(data: any) {
        op = "insert";
        payload = data;
        return builder;
      },
      update(data: any) {
        op = "update";
        payload = data;
        return builder;
      },
      delete() {
        op = "delete";
        return builder;
      },
      eq(col: string, val: any) {
        filters.push((r) => String(r?.[col]) === String(val));
        return builder;
      },
      neq(col: string, val: any) {
        filters.push((r) => String(r?.[col]) !== String(val));
        return builder;
      },
      in(col: string, vals: any[]) {
        const set = new Set(vals.map((v) => String(v)));
        filters.push((r) => set.has(String(r?.[col])));
        return builder;
      },
      gt(col: string, val: any) {
        filters.push((r) => Number(r?.[col] ?? 0) > Number(val));
        return builder;
      },
      gte(col: string, val: any) {
        filters.push((r) => Number(r?.[col] ?? 0) >= Number(val));
        return builder;
      },
      lt(col: string, val: any) {
        filters.push((r) => Number(r?.[col] ?? 0) < Number(val));
        return builder;
      },
      lte(col: string, val: any) {
        filters.push((r) => Number(r?.[col] ?? 0) <= Number(val));
        return builder;
      },
      ilike(col: string, pattern: string) {
        const needle = String(pattern).replace(/%/g, "").toLowerCase();
        filters.push((r) => String(r?.[col] ?? "").toLowerCase().includes(needle));
        return builder;
      },
      or(expr: string) {
        const fns = parseOrExpr(expr);
        filters.push((r) => fns.some((fn) => fn(r)));
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderSpec = { col, asc: opts?.ascending !== false };
        return builder;
      },
      range(start: number, end: number) {
        rangeSpec = { start, end };
        return builder;
      },
      limit(n: number) {
        limitNum = n;
        return builder;
      },
      maybeSingle() {
        returnSingle = "maybeSingle";
        return builder;
      },
      single() {
        returnSingle = "single";
        return builder;
      },
      then(resolve: any, reject: any) {
        return execute().then(resolve, reject);
      }
    };
    return builder;
  }

  return {
    tables,
    from(table: string) {
      return makeBuilder(table);
    },
    storage: {
      from() {
        return {
          upload: async () => ({ error: null }),
          getPublicUrl: (p: string) => ({ data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${p}` } })
        };
      }
    }
  };
}

async function runTests() {
  const {
    setSupabaseClientForTesting,
    syncOrderToSupabase
  } = await import("../src/db/supabaseService");
  const {
    app,
    hashPassword,
    verifyPassword,
    isScryptHash,
    isLegacySha256Hash,
    reserveOrderStock,
    releaseOrderStock,
    permanentlyConsumeOrderStock
  } = await import("../server");

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. Strict Configuration Gate: unconfigured Supabase must fail closed with 503
    setSupabaseClientForTesting(null, false);
    const unconfProducts = await fetch(`${baseUrl}/api/products`);
    assert.equal(unconfProducts.status, 503, "GET /api/products must return 503 when Supabase is unconfigured");
    const unconfProdJson = await unconfProducts.json();
    assert.equal(unconfProdJson.code, "SUPABASE_NOT_CONFIGURED");

    const unconfHealth = await fetch(`${baseUrl}/api/health`);
    assert.equal(unconfHealth.status, 503, "GET /api/health must return 503 when Supabase is unconfigured");

    const unconfOrders = await fetch(`${baseUrl}/api/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(unconfOrders.status, 503, "POST /api/orders must return 503 when Supabase is unconfigured");

    // 2. Database Outage: Supabase errors propagate cleanly as 503 (never silent JSON/empty fallback)
    const failingClient = createMockSupabase({}, { failTable: "products" });
    setSupabaseClientForTesting(failingClient, true);
    const failedProducts = await fetch(`${baseUrl}/api/products`);
    assert.equal(failedProducts.status, 503, "GET /api/products must return 503 on database error");
    const failedProdJson = await failedProducts.json();
    assert.equal(failedProdJson.code, "SUPABASE_UNAVAILABLE");

    // 3. Healthy Supabase Reads & Auth (Signup + Legacy SHA-256 Login & Auto-Upgrade)
    const legacyPassword = "LegacyUser@2024";
    const legacyHash = crypto.createHash("sha256").update(legacyPassword).digest("hex");
    assert.equal(isLegacySha256Hash(legacyHash), true);
    assert.equal(verifyPassword(legacyPassword, legacyHash), true);

    const mockClient = createMockSupabase({
      users: [
        {
          id: "cust_legacy_001",
          name: "Legacy Customer",
          email: "legacy@sabjies.in",
          phone: "9876543210",
          password: legacyHash,
          role: "user",
          permissions: [],
          status: "Active",
          addresses: [],
          joined_at: "2024-01-01T00:00:00.000Z"
        }
      ],
      products: [
        {
          id: 1,
          name: "Fresh Tomato",
          cat: "veg",
          type: "regular",
          cp: 30,
          sp: 50,
          base_price_per_kg: 50,
          unit: "kg",
          weight: "1 kg",
          stock_qty: 10,
          reserved_qty: 0,
          sold_qty: 0,
          low_at: 2,
          pricing_mode: "auto",
          weight_slabs: []
        },
        {
          id: 2,
          name: "Organic Spinach",
          cat: "leafy",
          type: "organic",
          cp: 20,
          sp: 40,
          base_price_per_kg: 40,
          unit: "kg",
          weight: "1 kg",
          stock_qty: 2,
          reserved_qty: 0,
          sold_qty: 0,
          low_at: 1,
          pricing_mode: "auto",
          weight_slabs: []
        }
      ],
      categories: [{ id: "veg", label: "Vegetables", emoji: "🥦" }]
    });
    setSupabaseClientForTesting(mockClient, true);

    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const prodRes = await fetch(`${baseUrl}/api/products`);
    assert.equal(prodRes.status, 200);
    const prodList = await prodRes.json();
    assert.equal(prodList.length, 2);
    assert.equal(prodList[0].name, "Fresh Tomato");

    // Test Signup stores scrypt hash and never exposes password
    const signupRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New Buyer",
        email: "newbuyer@sabjies.in",
        phone: "9812345678",
        password: "StrongPassword@9"
      })
    });
    assert.equal(signupRes.status, 201);
    const signupJson = await signupRes.json();
    assert.equal(signupJson.success, true);
    assert.ok(signupJson.sessionId, "Signup must return a sessionId");
    assert.equal((signupJson.user as any).password, undefined, "Password must never be leaked in response");
    const createdUserInDb = mockClient.tables.users.find((u) => u.email === "newbuyer@sabjies.in");
    assert.ok(createdUserInDb && isScryptHash(createdUserInDb.password), "Signup must store scrypt hash in DB");

    // Test Legacy SHA-256 Login preserves customer ID & automatically upgrades hash to scrypt
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: "legacy@sabjies.in",
        password: legacyPassword
      })
    });
    assert.equal(loginRes.status, 200, "Legacy SHA-256 customer must still be able to log in");
    const loginJson = await loginRes.json();
    assert.equal(loginJson.user.id, "cust_legacy_001", "Existing customer ID must be preserved");
    assert.ok(loginJson.sessionId, "Login must create a Supabase session");

    const upgradedUser = mockClient.tables.users.find((u) => u.id === "cust_legacy_001");
    assert.ok(upgradedUser && isScryptHash(upgradedUser.password), "Legacy SHA-256 hash must be upgraded to scrypt on login");
    assert.equal(verifyPassword(legacyPassword, upgradedUser.password), true, "Upgraded scrypt hash must verify original password");

    // Re-login after upgrade
    const loginAgainRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: "legacy@sabjies.in",
        password: legacyPassword
      })
    });
    assert.equal(loginAgainRes.status, 200, "Customer must still be able to log in after hash upgrade");

    // 4. Atomic Stock Reservation & Rollback
    const rollbackReserve = await reserveOrderStock([
      { id: 1, name: "Fresh Tomato", weight: "1 kg", qty: 3 },
      { id: 2, name: "Organic Spinach", weight: "1 kg", qty: 5 } // Exceeds stock_qty: 2
    ]);
    assert.equal(rollbackReserve.success, false, "Stock reservation must fail when second item lacks inventory");
    const tomatoAfterRollback = mockClient.tables.products.find((p) => p.id === 1);
    assert.equal(Number(tomatoAfterRollback.reserved_qty), 0, "Item 1 reserved_qty must be rolled back to 0");

    // 5. Order Placement via HTTP + Single-Release & Single-Deduction Guards
    const orderRes = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": loginJson.sessionId
      },
      body: JSON.stringify({
        userId: "cust_legacy_001",
        userEmail: "legacy@sabjies.in",
        userName: "Legacy Customer",
        phone: "9876543210",
        address: "101 Green St, Ghatkopar East, 400075",
        payment: "Cash on Delivery",
        items: [{ id: 1, name: "Fresh Tomato", weight: "1 kg", qty: 2 }]
      })
    });
    assert.equal(orderRes.status, 201, "Valid COD order should return 201 Created");
    const orderJson = await orderRes.json();
    assert.ok(orderJson.id, "Created order response must contain id");
    assert.equal(mockClient.tables.orders.length, 1, "Order must be persisted in Supabase orders table");
    assert.equal(orderJson.total, 130, "2x ₹50 tomato + ₹30 delivery (<299) = ₹130");

    // Verify single-deduction and single-release guards directly on an order object
    mockClient.tables.products.find((p) => p.id === 1).reserved_qty = 2;
    const testOrderObj: any = {
      id: "ORD_GUARD_1",
      items: [{ id: 1, name: "Fresh Tomato", weight: "1 kg", qty: 2 }],
      stockReserved: true,
      stockDeducted: false,
      stockReleased: false
    };
    const consume1 = await permanentlyConsumeOrderStock(testOrderObj);
    assert.equal(consume1, true, "First permanent consumption must return true");
    const consume2 = await permanentlyConsumeOrderStock(testOrderObj);
    assert.equal(consume2, false, "Second permanent consumption must be a no-op returning false");

    const releaseOrderObj: any = {
      id: "ORD_GUARD_2",
      items: [{ id: 2, name: "Organic Spinach", weight: "1 kg", qty: 1 }],
      stockReserved: true,
      stockDeducted: false,
      stockReleased: false
    };
    mockClient.tables.products.find((p) => p.id === 2).reserved_qty = 1;
    const rel1 = await releaseOrderStock(releaseOrderObj, "Customer cancelled");
    assert.equal(rel1, true, "First stock release must return true");
    const rel2 = await releaseOrderStock(releaseOrderObj, "Duplicate release");
    assert.equal(rel2, false, "Second release must be a no-op returning false");

    // 6. Verify syncOrderToSupabase throws DatabaseError when Supabase fails (no silent swallow)
    setSupabaseClientForTesting(createMockSupabase({}, { failTable: "orders" }), true);
    await assert.rejects(
      () => syncOrderToSupabase({ id: "ORD_FAIL", items: [], total: 100 }),
      (err: any) => err?.name === "DatabaseError" && err?.code === "SUPABASE_UNAVAILABLE" && err?.statusCode === 503
    );

    // 7. Audit Regression Suite: IDOR, Spoofable Headers, Razorpay 503, ETag/Filter/Pagination, SSE Isolation, Coupons, Image Integrity
    const adminPass = "AdminStrong@999";
    const auditMockClient = createMockSupabase({
      users: [
        ...mockClient.tables.users,
        {
          id: "admin_greensabjies",
          name: "Store Admin",
          email: "greensabjies@gmail.com",
          phone: "99203 24172",
          password: hashPassword(adminPass),
          role: "admin",
          permissions: ["all"],
          status: "Active",
          addresses: [],
          joined_at: "2024-01-01T00:00:00.000Z"
        }
      ],
      products: mockClient.tables.products,
      categories: mockClient.tables.categories,
      orders: mockClient.tables.orders,
      coupons: [
        { code: "SAVE10", type: "percent", discount: 10, min_order: 50, max_discount: 40, status: "Active", expiry: "2099-12-31", usage: 0, max_redemptions: 100 },
        { code: "EXPIRED99", type: "flat", discount: 99, min_order: 0, max_discount: null, status: "Disabled", expiry: "2099-12-31", usage: 0, max_redemptions: 100 }
      ],
      notifications: [
        { id: "notif_cust_1", user_id: "cust_legacy_001", title: "Order Update", body: "Your tomatoes are packed", type: "order", read: false, created_at: "2026-01-01T00:00:00.000Z" },
        { id: "notif_other_1", user_id: createdUserInDb.id, title: "Welcome", body: "Welcome to Sabjies", type: "account", read: false, created_at: "2026-01-01T00:00:00.000Z" }
      ],
      sessions: mockClient.tables.sessions
    });
    setSupabaseClientForTesting(auditMockClient, true);

    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "greensabjies@gmail.com", password: adminPass })
    });
    assert.equal(adminLoginRes.status, 200);
    const adminLoginJson = await adminLoginRes.json();
    const adminSessionId = adminLoginJson.sessionId;
    const customerSessionId = loginJson.sessionId;
    const otherSessionId = signupJson.sessionId;
    const placedOrderId = orderJson.id;

    // 7a. Catalog filtering, compact mode, ETag / 304
    const catFilterRes = await fetch(`${baseUrl}/api/products?category=veg&compact=true&limit=1`);
    assert.equal(catFilterRes.status, 200);
    const catFilterList = await catFilterRes.json();
    assert.equal(catFilterList.length, 1);
    assert.equal(catFilterList[0].cat, "veg");

    const allProdRes = await fetch(`${baseUrl}/api/products`);
    assert.equal(allProdRes.status, 200);
    const etag = allProdRes.headers.get("etag");
    assert.ok(etag, "GET /api/products must emit ETag header");
    assert.match(allProdRes.headers.get("cache-control") || "", /no-cache/);
    const notModRes = await fetch(`${baseUrl}/api/products`, { headers: { "if-none-match": etag! } });
    assert.equal(notModRes.status, 304, "Matching If-None-Match must return 304 Not Modified");

    // 7b. Active coupons endpoint + removed FREE90 bypass
    const activeCouponsRes = await fetch(`${baseUrl}/api/coupons/active`);
    assert.equal(activeCouponsRes.status, 200);
    const activeCouponsJson = await activeCouponsRes.json();
    assert.equal(activeCouponsJson.coupons.length, 1);
    assert.equal(activeCouponsJson.coupons[0].code, "SAVE10");

    const free90Check = await fetch(`${baseUrl}/api/cart/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ id: 1, name: "Fresh Tomato", weight: "1 kg", qty: 2 }],
        couponCode: "FREE90",
        userId: "cust_legacy_001"
      })
    });
    const free90Json = await free90Check.json();
    assert.equal(free90Check.status, 200);
    assert.equal(free90Json.couponDiscount, 0, "Hardcoded FREE90 bypass must be removed");
    assert.equal(free90Json.delivery, 30, "Delivery fee must not be bypassed by removed FREE90 coupon");

    // 7c. Unconfigured Razorpay must return 503 (never fake order_* or rfnd_sim_*)
    const prevRzpId = process.env.RAZORPAY_KEY_ID;
    const prevRzpSecret = process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    try {
      const noRzpCreate = await fetch(`${baseUrl}/api/payments/razorpay/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-id": customerSessionId },
        body: JSON.stringify({
          items: [{ id: 1, name: "Fresh Tomato", weight: "1 kg", qty: 1 }],
          address: "Ghatkopar East"
        })
      });
      assert.equal(noRzpCreate.status, 503, "Unconfigured Razorpay create-order must fail closed with 503");

      // Mark order Paid with a Razorpay payment ID in DB and verify unconfigured refund fails with 503 (never rfnd_sim_*)
      auditMockClient.tables.orders[0].payment_status = "Paid";
      auditMockClient.tables.orders[0].payment = "Razorpay";
      auditMockClient.tables.orders[0].razorpay_payment_id = "pay_test_123";
      const noRzpRefund = await fetch(`${baseUrl}/api/payments/razorpay/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-id": adminSessionId },
        body: JSON.stringify({ orderId: placedOrderId, amount: 10, reason: "Audit test" })
      });
      assert.equal(noRzpRefund.status, 503, "Unconfigured Razorpay refund must fail closed with 503 instead of returning rfnd_sim_*");
    } finally {
      if (prevRzpId !== undefined) process.env.RAZORPAY_KEY_ID = prevRzpId;
      if (prevRzpSecret !== undefined) process.env.RAZORPAY_KEY_SECRET = prevRzpSecret;
    }

    // 7d. IDOR & Auth Protection + Spoofable Header Rejection
    const unauthPostOrder = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ id: 1, weight: "1 kg", qty: 1 }] })
    });
    assert.equal(unauthPostOrder.status, 401, "POST /api/orders without session must return 401");

    const unauthOrdersList = await fetch(`${baseUrl}/api/orders/user/cust_legacy_001`);
    assert.equal(unauthOrdersList.status, 401);

    const otherOrdersList = await fetch(`${baseUrl}/api/orders/user/cust_legacy_001`, {
      headers: { "x-session-id": otherSessionId }
    });
    assert.equal(otherOrdersList.status, 403, "Customer cannot read another customer's order history");

    const ownOrdersList = await fetch(`${baseUrl}/api/orders/user/cust_legacy_001`, {
      headers: { "x-session-id": customerSessionId }
    });
    assert.equal(ownOrdersList.status, 200);

    const otherOrderDetail = await fetch(`${baseUrl}/api/orders/${placedOrderId}`, {
      headers: { "x-session-id": otherSessionId }
    });
    assert.equal(otherOrderDetail.status, 403);

    const customerPatchPaid = await fetch(`${baseUrl}/api/orders/${placedOrderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-session-id": customerSessionId },
      body: JSON.stringify({ paymentStatus: "Paid" })
    });
    assert.equal(customerPatchPaid.status, 403, "Customer cannot mark order Paid");

    const unauthNotifs = await fetch(`${baseUrl}/api/notifications?userId=cust_legacy_001`);
    assert.equal(unauthNotifs.status, 401);
    const otherNotifs = await fetch(`${baseUrl}/api/notifications?userId=cust_legacy_001`, {
      headers: { "x-session-id": otherSessionId }
    });
    assert.equal(otherNotifs.status, 403);
    const ownNotifs = await fetch(`${baseUrl}/api/notifications?userId=cust_legacy_001`, {
      headers: { "x-session-id": customerSessionId }
    });
    assert.equal(ownNotifs.status, 200);

    const spoofedAdminRes = await fetch(`${baseUrl}/api/products/validate-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "admin_greensabjies",
        "x-admin-email": "greensabjies@gmail.com"
      },
      body: JSON.stringify({ imageUrl: "https://example.com/a.jpg" })
    });
    assert.equal(spoofedAdminRes.status, 403, "Spoofable x-user-id / x-admin-email headers must never bypass admin auth");

    // 7e. Admin Product Creation (no Unsplash / no synthetic Cover image), Delete (deletedId only), Masked DB tokens
    const createNoImgRes = await fetch(`${baseUrl}/api/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": adminSessionId },
      body: JSON.stringify({ name: "Plain Okra", cat: "veg", sp: 35, unit: "kg", stockQty: 15 })
    });
    assert.equal(createNoImgRes.status, 201);
    const createdNoImg = await createNoImgRes.json();
    assert.equal(createdNoImg.img, "", "Empty img must stay empty rather than injecting Unsplash");
    assert.equal((createdNoImg.images || []).length, 0, "Empty img must not fabricate synthetic Cover image entries");

    const delProdRes = await fetch(`${baseUrl}/api/products/${createdNoImg.id}`, {
      method: "DELETE",
      headers: { "x-session-id": adminSessionId }
    });
    assert.equal(delProdRes.status, 200);
    const delProdJson = await delProdRes.json();
    assert.equal(delProdJson.success, true);
    assert.equal(Number(delProdJson.deletedId), Number(createdNoImg.id));
    assert.equal(delProdJson.products, undefined, "DELETE /api/products/:id should not refetch full catalog");

    const dbSessionsRes = await fetch(`${baseUrl}/api/admin/database?table=sessions&limit=50`, {
      headers: { "x-session-id": adminSessionId }
    });
    assert.equal(dbSessionsRes.status, 200);
    const dbSessionsJson = await dbSessionsRes.json();
    assert.ok(Array.isArray(dbSessionsJson.sessions) && dbSessionsJson.sessions.length > 0);
    for (const s of dbSessionsJson.sessions) {
      if (s.token) {
        assert.ok(s.token.endsWith("..."), "Admin database sessions response must mask raw session tokens");
      }
    }

    // 7f. SSE Realtime Order Event Scoping (owner + admin only, never leaked to other customers)
    const { broadcastRealtimeEvent } = await import("../src/server/dbQueries");
    const sseAc1 = new AbortController();
    const sseAc2 = new AbortController();
    const [sseOwnerRes, sseOtherRes] = await Promise.all([
      fetch(`${baseUrl}/api/realtime/events?sessionId=${encodeURIComponent(customerSessionId)}`, { signal: sseAc1.signal }),
      fetch(`${baseUrl}/api/realtime/events?sessionId=${encodeURIComponent(otherSessionId)}`, { signal: sseAc2.signal })
    ]);
    assert.equal(sseOwnerRes.status, 200);
    assert.equal(sseOtherRes.status, 200);

    const ownerReader = sseOwnerRes.body!.getReader();
    const otherReader = sseOtherRes.body!.getReader();
    await ownerReader.read(); // connected event
    await otherReader.read(); // connected event

    broadcastRealtimeEvent({
      table: "orders",
      eventType: "INSERT",
      new: { id: "ORD_SSE_PRIVATE", userId: "cust_legacy_001" }
    });
    broadcastRealtimeEvent({
      table: "products",
      eventType: "UPDATE",
      new: { id: 1, name: "Fresh Tomato" }
    });

    const ownerChunk = await ownerReader.read();
    const otherChunk = await otherReader.read();
    const ownerText = new TextDecoder().decode(ownerChunk.value);
    const otherText = new TextDecoder().decode(otherChunk.value);
    assert.ok(ownerText.includes("ORD_SSE_PRIVATE"), "Order owner SSE stream must receive their own order event");
    assert.ok(!otherText.includes("ORD_SSE_PRIVATE"), "Other customer SSE stream must NOT receive another customer's order event");
    assert.ok(otherText.includes("Fresh Tomato"), "Non-PII catalog event must still broadcast to customers");
    sseAc1.abort();
    sseAc2.abort();

    // Confirm hashPassword works cleanly
    const hashed = hashPassword("CheckPass1");
    assert.equal(isScryptHash(hashed), true);
    assert.equal(verifyPassword("CheckPass1", hashed), true);

    console.log("✅ All Supabase-first & audit regression checks passed!");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runTests().catch((err) => {
  console.error("❌ Supabase-first test suite failed:", err);
  process.exit(1);
});
