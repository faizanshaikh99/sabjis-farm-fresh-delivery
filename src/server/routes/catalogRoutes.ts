import express from "express";
import {
  isSupabaseConfigured,
  fetchTable,
  fetchAllRows,
  fetchOneRow,
  fetchTablePaginated,
  upsertTable,
  deleteFromTable,
  syncProductToSupabase,
  updateProductInSupabase,
  normalizeProductFromDb,
  verifySupabaseConnection
} from "../../db/supabaseService";
import {
  normalizeProduct,
  mapReviewFromDb,
  mapOfferFromDb,
  mapCouponFromDb,
  sanitizePostgrestValue
} from "../mappers";
import {
  asyncHandler,
  realtimeClients,
  broadcastRealtimeEvent,
  getCategoriesFromDb,
  getAllProductsFromDb,
  getProductByIdFromDb,
  getUserIdFromRequestAsync,
  verifyAdminRequest
} from "../dbQueries";
import {
  verifyCartAndCalculatePricing,
  validateProductImageWithAI
} from "../inventoryAndPricing";
import {
  calculateWeightPrice,
  parseWeightToGrams,
  formatWeight,
  isKgProduct,
  getProductSellingUnit
} from "../../utils/weightParser";

const router = express.Router();

export let catalogVersion = Date.now();
export function bumpCatalogVersion() {
  catalogVersion = Date.now();
}

// Health check: strictly read-only, returns 503 if Supabase is unconfigured or unreachable
router.get("/api/health", asyncHandler(async (_req, res) => {
  const health = await verifySupabaseConnection();
  if (!health.isConfigured || !health.connected) {
    return res.status(503).json({
      status: "error",
      configured: health.isConfigured,
      connected: false,
      message: health.message || "Supabase PostgreSQL connection unavailable.",
      timestamp: new Date().toISOString()
    });
  }
  res.json({
    status: "ok",
    configured: true,
    connected: true,
    message: health.message || "Connected",
    timestamp: new Date().toISOString()
  });
}));

// Real-time SSE hub (with authenticated user/admin scope for PII filtering)
router.get(["/api/realtime/events", "/api/realtime/orders"], asyncHandler(async (req, res) => {
  let userId: string | null = null;
  let isAdmin = false;
  if (isSupabaseConfigured) {
    try {
      userId = await getUserIdFromRequestAsync(req);
      isAdmin = await verifyAdminRequest(req);
    } catch {
      userId = null;
      isAdmin = false;
    }
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const client = { res, userId, isAdmin };
  res.write(`event: connected\ndata: {"status":"connected","authenticated":${Boolean(userId)},"timestamp":"${new Date().toISOString()}"}\n\n`);
  realtimeClients.add(client);

  const keepAliveTimer = setInterval(() => {
    try {
      res.write(": keepalive\n\n");
    } catch {
      clearInterval(keepAliveTimer);
      realtimeClients.delete(client);
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(keepAliveTimer);
    realtimeClients.delete(client);
  });
}));

// Reviews
router.get("/api/reviews", asyncHandler(async (_req, res) => {
  const rows = await fetchAllRows("reviews", {
    orderBy: { column: "created_at", ascending: false }
  });
  res.json(rows.map(mapReviewFromDb));
}));

router.post("/api/reviews", asyncHandler(async (req, res) => {
  const newReview = {
    id: Date.now(),
    authorName: req.body?.authorName || "Anonymous",
    location: req.body?.location || "Ghatkopar",
    rating: Number(req.body?.rating) || 5,
    body: req.body?.body || "",
    createdAt: new Date().toISOString()
  };

  await upsertTable("reviews", [{
    id: newReview.id,
    author_name: newReview.authorName,
    location: newReview.location,
    rating: newReview.rating,
    body: newReview.body,
    created_at: newReview.createdAt
  }], "id");

  res.status(201).json(newReview);
}));

router.delete("/api/reviews/:id", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ error: "Unauthorized. Admin authorization required." });
  }
  const id = Number(req.params.id);
  await deleteFromTable("reviews", "id", id);
  const rows = await fetchAllRows("reviews", { orderBy: { column: "created_at", ascending: false } });
  res.json({ success: true, reviews: rows.map(mapReviewFromDb) });
}));

// Categories
router.get("/api/categories", asyncHandler(async (req, res) => {
  const etag = `"categories-${catalogVersion}"`;
  res.setHeader("Cache-Control", "no-cache, must-revalidate");
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) {
    return res.status(304).end();
  }
  const liveCats = await getCategoriesFromDb();
  res.json(liveCats);
}));

router.post("/api/categories", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ error: "Unauthorized. Admin authorization required." });
  }

  const { label, emoji } = req.body || {};
  if (!label || typeof label !== "string" || !label.trim()) {
    return res.status(400).json({ error: "Category name cannot be empty." });
  }

  const cleanLabel = label.trim();
  const generatedId = cleanLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || ("cat_" + Date.now());

  const existing = await getCategoriesFromDb();
  const isDuplicate = existing.some(
    (c: any) => c.label.trim().toLowerCase() === cleanLabel.toLowerCase() || c.id.toLowerCase() === generatedId.toLowerCase()
  );
  if (isDuplicate) {
    return res.status(400).json({ error: `Category "${cleanLabel}" already exists.` });
  }

  const newCategory = {
    id: generatedId,
    label: cleanLabel,
    emoji: (emoji && typeof emoji === "string" && emoji.trim()) ? emoji.trim() : "🥦"
  };

  await upsertTable("categories", [{
    id: newCategory.id,
    label: newCategory.label,
    emoji: newCategory.emoji
  }], "id");

  bumpCatalogVersion();
  const updatedCategories = await getCategoriesFromDb();
  return res.status(201).json({ success: true, category: newCategory, categories: updatedCategories });
}));

router.delete("/api/categories/:id", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ error: "Unauthorized. Admin authorization required." });
  }

  const { id } = req.params;
  if (id === "all") {
    return res.status(400).json({ error: "Cannot delete default master category." });
  }

  await deleteFromTable("categories", "id", id);
  bumpCatalogVersion();
  const updatedCategories = await getCategoriesFromDb();
  return res.json({ success: true, categories: updatedCategories });
}));

// Products (with optional category/search filtering, pagination, and ETag validation)
router.get("/api/products", asyncHandler(async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const limitParam = req.query.limit !== undefined ? Math.min(200, Math.max(1, Number(req.query.limit))) : undefined;
  const offsetParam = req.query.offset !== undefined ? Math.max(0, Number(req.query.offset)) : 0;
  const compact = req.query.compact === "true";

  const hasFilter = Boolean((category && category !== "all") || search || limitParam !== undefined || compact);
  res.setHeader("Cache-Control", "no-cache, must-revalidate");

  if (!hasFilter) {
    const etag = `"products-${catalogVersion}"`;
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }
    const liveProducts = await getAllProductsFromDb();
    return res.json(liveProducts.map(normalizeProduct));
  }

  const columns = compact
    ? "id,name,cat,type,sp,base_price_per_kg,unit,weight,discount,img,emoji,rating,reviews,stock_qty,reserved_qty,sold_qty,low_at,pricing_mode,weight_slabs"
    : undefined;

  const filterFn = (q: any) => {
    let fq = q;
    if (category && category !== "all") {
      fq = fq.eq("cat", sanitizePostgrestValue(category));
    }
    if (search) {
      const safeSearch = sanitizePostgrestValue(search);
      fq = fq.ilike("name", `%${safeSearch}%`);
    }
    return fq;
  };

  if (limitParam !== undefined && !isNaN(limitParam)) {
    const page = await fetchTablePaginated("products", {
      columns,
      filter: filterFn,
      orderBy: { column: "id", ascending: true },
      limit: limitParam,
      offset: offsetParam
    });
    return res.json(page.rows.map((r: any) => normalizeProduct(normalizeProductFromDb(r))));
  }

  const rows = await fetchAllRows("products", {
    columns,
    filter: filterFn,
    orderBy: { column: "id", ascending: true }
  });
  return res.json(rows.map((r: any) => normalizeProduct(normalizeProductFromDb(r))));
}));

router.get("/api/products/:id", asyncHandler(async (req, res) => {
  const numId = Number(req.params.id);
  if (isNaN(numId)) {
    return res.status(404).json({ success: false, error: "Product not found" });
  }

  const product = await getProductByIdFromDb(numId);
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found" });
  }
  return res.json(normalizeProduct(product));
}));

// Vegetable pricing quotation
router.get("/api/products/:id/pricing", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const product = !isNaN(id) ? await getProductByIdFromDb(id) : null;
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found" });
  }

  const basePricePerKg = Number(product.basePricePerKg !== undefined ? product.basePricePerKg : product.sp);
  const weightSlabs = Array.isArray(product.weightSlabs) ? product.weightSlabs : [];
  const queryWeight = req.query.weight as string;
  const queryGrams = req.query.grams ? Number(req.query.grams) : undefined;

  let requestedQuote = null;
  if (queryGrams || queryWeight) {
    let targetGrams = queryGrams;
    if (!targetGrams && queryWeight) {
      const parsed = parseWeightToGrams(queryWeight);
      if (parsed.isValid) targetGrams = parsed.grams;
    }
    if (targetGrams && targetGrams > 0) {
      const calc = calculateWeightPrice(basePricePerKg, product.weight, targetGrams, weightSlabs);
      requestedQuote = {
        weightInGrams: targetGrams,
        weightLabel: calc.displayWeight,
        pricingType: calc.isCustomSlab ? "slab" : "base_rate",
        actualPurchasedPrice: calc.price,
        formulaText: calc.formulaText,
        isCustomSlab: calc.isCustomSlab,
        pricingSource: calc.pricingSource
      };
    }
  }

  const standardWeights = [100, 250, 500, 750, 1000, 1500, 2000, 5000];
  const standardTiers = standardWeights.map((g) => {
    const calc = calculateWeightPrice(basePricePerKg, product.weight, g, weightSlabs);
    return {
      weightInGrams: g,
      weightLabel: calc.displayWeight,
      actualPurchasedPrice: calc.price,
      pricingType: calc.isCustomSlab ? "slab" : "base_rate",
      formulaText: calc.formulaText,
      isCustomSlab: calc.isCustomSlab
    };
  });

  res.json({
    success: true,
    productId: product.id,
    name: product.name,
    basePricePerKg,
    base_price_per_kg: basePricePerKg,
    weight: product.weight,
    weightSlabs,
    requestedQuote,
    tiers: standardTiers
  });
}));

// Weight slabs
router.get("/api/products/:id/slabs", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const product = !isNaN(id) ? await getProductByIdFromDb(id) : null;
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found" });
  }
  const weightSlabs = Array.isArray(product.weightSlabs) ? product.weightSlabs : [];
  res.json({ success: true, productId: product.id, weightSlabs });
}));

router.post("/api/products/:id/slabs", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ success: false, error: "Unauthorized. Administrative authorization required." });
  }

  const id = Number(req.params.id);
  const product = !isNaN(id) ? await getProductByIdFromDb(id) : null;
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found" });
  }

  if (!isKgProduct(product)) {
    return res.status(400).json({
      success: false,
      error: `Weight slabs are only supported for products sold in "kg". Product "${product.name}" is sold by "${product.unit || product.weight}".`
    });
  }

  const { grams, weightLabel, price, enabled } = req.body || {};
  const numGrams = Number(grams);
  const numPrice = Number(price);

  if (isNaN(numGrams) || numGrams < 10) {
    return res.status(400).json({ success: false, error: "Valid weight in grams (minimum 10g) is required." });
  }
  if (isNaN(numPrice) || numPrice < 0) {
    return res.status(400).json({ success: false, error: "Valid price (non-negative number) is required." });
  }

  const slabs = Array.isArray(product.weightSlabs) ? [...product.weightSlabs] : [];
  const existingIdx = slabs.findIndex((s) => s.grams === numGrams || (req.body.id && s.id === req.body.id));
  const newSlab = {
    id: req.body.id || `slab_${numGrams}g_${Date.now()}`,
    grams: numGrams,
    weightLabel: weightLabel || formatWeight(numGrams),
    price: numPrice,
    enabled: enabled !== undefined ? Boolean(enabled) : true
  };

  if (existingIdx >= 0) {
    slabs[existingIdx] = newSlab;
  } else {
    slabs.push(newSlab);
  }
  slabs.sort((a, b) => a.grams - b.grams);

  product.weightSlabs = slabs;
  product.weight_slabs = slabs;
  product.pricingMode = slabs.length > 0 ? "slabs" : "auto";

  await syncProductToSupabase(product);
  bumpCatalogVersion();
  broadcastRealtimeEvent({ table: "products", eventType: "UPDATE", new: product });

  res.status(201).json({
    success: true,
    productId: product.id,
    weightSlabs: product.weightSlabs,
    product: normalizeProduct(product)
  });
}));

const handleSlabUpdate = asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ success: false, error: "Unauthorized. Administrative authorization required." });
  }

  const id = Number(req.params.id);
  const slabId = req.params.slabId;
  const product = !isNaN(id) ? await getProductByIdFromDb(id) : null;
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found" });
  }

  if (!isKgProduct(product)) {
    return res.status(400).json({
      success: false,
      error: `Weight slabs are only supported for products sold in "kg". Product "${product.name}" is sold by "${product.unit || product.weight}".`
    });
  }

  const slabs = Array.isArray(product.weightSlabs) ? [...product.weightSlabs] : [];
  const slabIdx = slabs.findIndex((s) => String(s.id) === String(slabId) || String(s.grams) === String(slabId));
  if (slabIdx === -1) {
    return res.status(404).json({ success: false, error: "Weight slab not found for this product" });
  }

  const existing = slabs[slabIdx];
  const { grams, weightLabel, price, enabled } = req.body || {};
  const updatedSlab = {
    ...existing,
    grams: grams !== undefined ? Number(grams) : existing.grams,
    weightLabel: weightLabel !== undefined ? weightLabel : (grams !== undefined ? formatWeight(Number(grams)) : existing.weightLabel),
    price: price !== undefined ? Number(price) : existing.price,
    enabled: enabled !== undefined ? Boolean(enabled) : existing.enabled
  };

  slabs[slabIdx] = updatedSlab;
  slabs.sort((a, b) => a.grams - b.grams);
  product.weightSlabs = slabs;
  product.weight_slabs = slabs;

  await syncProductToSupabase(product);
  bumpCatalogVersion();
  broadcastRealtimeEvent({ table: "products", eventType: "UPDATE", new: product });

  res.json({
    success: true,
    productId: product.id,
    weightSlabs: product.weightSlabs,
    updatedSlab,
    product: normalizeProduct(product)
  });
});

router.put("/api/products/:id/slabs/:slabId", handleSlabUpdate);
router.patch("/api/products/:id/slabs/:slabId", handleSlabUpdate);

router.delete("/api/products/:id/slabs/:slabId", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ success: false, error: "Unauthorized. Administrative authorization required." });
  }

  const id = Number(req.params.id);
  const slabId = req.params.slabId;
  const product = !isNaN(id) ? await getProductByIdFromDb(id) : null;
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found" });
  }

  const slabs = Array.isArray(product.weightSlabs) ? product.weightSlabs : [];
  const initialLen = slabs.length;
  product.weightSlabs = slabs.filter((s) => String(s.id) !== String(slabId) && String(s.grams) !== String(slabId));
  product.weight_slabs = product.weightSlabs;
  if (product.weightSlabs.length === 0) {
    product.pricingMode = "auto";
  }

  await syncProductToSupabase(product);
  bumpCatalogVersion();
  broadcastRealtimeEvent({ table: "products", eventType: "UPDATE", new: product });

  res.json({
    success: true,
    deleted: product.weightSlabs.length < initialLen,
    productId: product.id,
    weightSlabs: product.weightSlabs,
    product: normalizeProduct(product)
  });
}));

router.put("/api/products/:id/slabs", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ success: false, error: "Unauthorized. Administrative authorization required." });
  }

  const id = Number(req.params.id);
  const product = !isNaN(id) ? await getProductByIdFromDb(id) : null;
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found" });
  }

  if (!isKgProduct(product)) {
    return res.status(400).json({
      success: false,
      error: `Weight slabs are only supported for products sold in "kg". Product "${product.name}" is sold by "${product.unit || product.weight}".`
    });
  }

  const rawSlabs = Array.isArray(req.body) ? req.body : (Array.isArray(req.body?.slabs) ? req.body.slabs : req.body?.weightSlabs);
  if (!Array.isArray(rawSlabs)) {
    return res.status(400).json({ success: false, error: "Expected array of weight slabs" });
  }

  const cleanSlabs = rawSlabs.map((s: any) => {
    const grams = Number(s.grams !== undefined ? s.grams : s.weightInGrams);
    return {
      id: s.id || `slab_${grams}g_${Date.now()}`,
      grams,
      weightInGrams: grams,
      weightLabel: s.weightLabel || s.weight || formatWeight(grams),
      price: Number(s.price),
      enabled: s.enabled !== undefined ? Boolean(s.enabled) : true
    };
  }).filter((s) => !isNaN(s.grams) && s.grams > 0 && !isNaN(s.price) && s.price >= 0);

  cleanSlabs.sort((a, b) => a.grams - b.grams);
  product.weightSlabs = cleanSlabs;
  product.weight_slabs = cleanSlabs;
  product.pricingMode = cleanSlabs.length > 0 ? "slabs" : "auto";

  await syncProductToSupabase(product);
  bumpCatalogVersion();
  broadcastRealtimeEvent({ table: "products", eventType: "UPDATE", new: product });

  res.json({ success: true, productId: product.id, weightSlabs: product.weightSlabs, product: normalizeProduct(product) });
}));

const handleUpdateBasePrice = asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ success: false, error: "Unauthorized. Administrative authorization required." });
  }

  const id = Number(req.params.id);
  const product = !isNaN(id) ? await getProductByIdFromDb(id) : null;
  if (!product) {
    return res.status(404).json({ success: false, error: "Product not found" });
  }

  const body = req.body || {};
  const newBasePrice = Number(
    body.basePricePerKg !== undefined
      ? body.basePricePerKg
      : (body.base_price_per_kg !== undefined
          ? body.base_price_per_kg
          : (body.basePrice !== undefined ? body.basePrice : body.sp))
  );

  if (isNaN(newBasePrice) || newBasePrice <= 0) {
    return res.status(400).json({ success: false, error: "Base price per kg must be a positive number." });
  }

  product.sp = newBasePrice;
  product.basePricePerKg = newBasePrice;
  product.base_price_per_kg = newBasePrice;

  await syncProductToSupabase(product);
  bumpCatalogVersion();
  broadcastRealtimeEvent({ table: "products", eventType: "UPDATE", new: product });

  res.json({
    success: true,
    productId: product.id,
    basePricePerKg: newBasePrice,
    sp: newBasePrice,
    product: normalizeProduct(product)
  });
});

router.patch("/api/products/:id/base-price", handleUpdateBasePrice);
router.put("/api/products/:id/base-price", handleUpdateBasePrice);

router.post("/api/products/validate-image", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ success: false, error: "Unauthorized. Administrative authorization required." });
  }
  const { imageUrl, productName, categoryName } = req.body || {};
  if (!imageUrl) {
    return res.status(400).json({ error: "Image URL or base64 data is required" });
  }
  const result = await validateProductImageWithAI(imageUrl, productName || "Vegetable", categoryName);
  return res.json({ success: true, validation: result });
}));

router.post("/api/products", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ success: false, error: "Unauthorized. Administrative authorization required to create products." });
  }

  const body = req.body || {};
  const incomingImg = body.img !== undefined
    ? body.img
    : (body.image !== undefined ? body.image : body.image_url);
  let primaryImg = incomingImg !== undefined ? String(incomingImg).trim() : "";

  const images = Array.isArray(body.images) && body.images.length > 0
    ? [...body.images]
    : (Array.isArray(body.image) ? [...body.image] : []);

  if (!primaryImg && images.length > 0) {
    const first = images[0];
    primaryImg = typeof first === "string" ? first : (first?.url || "");
  }

  const resolvedSp = Number(
    body.basePricePerKg !== undefined
      ? body.basePricePerKg
      : (body.base_price_per_kg !== undefined
          ? body.base_price_per_kg
          : (body.sp !== undefined ? body.sp : 40))
  );

  const unit = body.unit || (isKgProduct({ unit: body.unit, weight: body.weight }) ? "kg" : getProductSellingUnit({ weight: body.weight }));
  const isKg = isKgProduct({ unit, weight: body.weight });
  const rawSlabs = isKg
    ? (Array.isArray(body.weightSlabs) ? body.weightSlabs : (Array.isArray(body.weight_slabs) ? body.weight_slabs : []))
    : [];
  const resolvedSlabs = isKg ? rawSlabs : [];

  const newProduct = normalizeProduct({
    id: Date.now(),
    name: body.name || "New Vegetable",
    cat: body.cat || "root",
    type: body.type || "organic",
    cp: Number(body.cp) || 20,
    sp: resolvedSp,
    basePricePerKg: resolvedSp,
    unit,
    weight: body.weight || (isKg ? "per kg" : `per ${unit}`),
    discount: body.discount || "",
    img: primaryImg,
    images,
    emoji: body.emoji || "🥬",
    rating: 5.0,
    reviews: 0,
    stockQty: Number(body.stockQty ?? 50),
    lowAt: Number(body.lowAt ?? 10),
    pricingMode: isKg ? (body.pricingMode || (resolvedSlabs.length > 0 ? "slabs" : "auto")) : "auto",
    weightSlabs: resolvedSlabs
  });

  await syncProductToSupabase(newProduct);
  bumpCatalogVersion();
  broadcastRealtimeEvent({ table: "products", eventType: "INSERT", new: newProduct });
  res.status(201).json(newProduct);
}));

const handleProductUpdate = asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ success: false, error: "Unauthorized. Administrative authorization required to update products." });
  }

  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ success: false, error: "Invalid product ID" });
  }

  const sbResult = await updateProductInSupabase(id, req.body || {});
  if (!sbResult.success) {
    const status = sbResult.error?.toLowerCase().includes("not found") ? 404 : 500;
    return res.status(status).json({
      success: false,
      error: sbResult.error || "Failed to update product in Supabase database"
    });
  }

  const verifiedProduct = sbResult.product;
  bumpCatalogVersion();
  broadcastRealtimeEvent({ table: "products", eventType: "UPDATE", new: verifiedProduct });
  return res.json({
    success: true,
    product: verifiedProduct
  });
});

router.patch("/api/products/:id", handleProductUpdate);
router.put("/api/products/:id", handleProductUpdate);

router.delete("/api/products/:id", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ success: false, error: "Unauthorized. Administrative authorization required to delete products." });
  }

  const id = Number(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ success: false, error: "Invalid product ID" });
  }

  await deleteFromTable("products", "id", id);
  bumpCatalogVersion();
  broadcastRealtimeEvent({ table: "products", eventType: "DELETE", old: { id } });
  return res.json({ success: true, deletedId: id, message: "Product deleted successfully" });
}));

// Active Public Coupons
router.get("/api/coupons/active", asyncHandler(async (_req, res) => {
  const rows = await fetchAllRows("coupons");
  const todayStr = new Date().toISOString().split("T")[0];
  const activeCoupons = rows
    .map(mapCouponFromDb)
    .filter((c) => {
      if (String(c.status || "Active").toLowerCase() !== "active") return false;
      if (c.startDate && todayStr < c.startDate) return false;
      if (c.expiry && todayStr > c.expiry) return false;
      if (c.maxRedemptions && Number(c.maxRedemptions) > 0 && (c.usage || 0) >= Number(c.maxRedemptions)) return false;
      return true;
    })
    .map((c) => ({
      code: c.code,
      desc: c.campaignName || (
        c.type === "free_delivery"
          ? `Free Delivery${c.minOrder ? ` on orders ₹${c.minOrder}+` : ""}`
          : c.type === "percent"
            ? `${c.discount}% OFF${c.maxDiscount ? ` up to ₹${c.maxDiscount}` : ""}${c.minOrder ? ` on orders ₹${c.minOrder}+` : ""}`
            : `₹${c.discount} OFF${c.minOrder ? ` on orders ₹${c.minOrder}+` : ""}`
      ),
      discountType: c.type,
      discountValue: c.discount,
      minSubtotal: c.minOrder,
      discount: c.discount,
      minOrder: c.minOrder,
      maxDiscount: c.maxDiscount,
      type: c.type,
      expiry: c.expiry,
      campaignName: c.campaignName || ""
    }));
  res.json({ coupons: activeCoupons });
}));

// Offers
router.get("/api/offers", asyncHandler(async (_req, res) => {
  const rows = await fetchAllRows("offers", {
    orderBy: { column: "id", ascending: false }
  });
  res.json(rows.map(mapOfferFromDb));
}));

router.post("/api/offers", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ error: "Unauthorized. Admin authorization required." });
  }

  const body = req.body || {};
  const newOffer = {
    id: Date.now(),
    title: body.title || "Sabjies Special Offer",
    desc: body.desc || body.description || "Fresh harvest direct from APMC to your doorstep.",
    tag: body.tag || "HOT DEAL",
    tagColor: body.tagColor || "#1a9c5b",
    img: (body.img && String(body.img).trim() !== "") ? String(body.img).trim() : ""
  };

  await upsertTable("offers", [{
    id: newOffer.id,
    title: newOffer.title,
    desc_text: newOffer.desc,
    tag: newOffer.tag,
    tag_color: newOffer.tagColor,
    img: newOffer.img
  }], "id");

  res.status(201).json(newOffer);
}));

router.put("/api/offers/:id", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ error: "Unauthorized. Admin authorization required." });
  }

  const id = Number(req.params.id);
  const existingRow = await fetchOneRow("offers", (q) => q.eq("id", id));
  if (!existingRow) {
    return res.status(404).json({ error: "Offer not found." });
  }
  const existing = mapOfferFromDb(existingRow);
  const body = req.body || {};

  const targetOffer = {
    id: existing.id,
    title: body.title !== undefined ? body.title : existing.title,
    desc: body.desc !== undefined ? body.desc : (body.description !== undefined ? body.description : existing.desc),
    tag: body.tag !== undefined ? body.tag : existing.tag,
    tagColor: body.tagColor !== undefined ? body.tagColor : existing.tagColor,
    img: body.img !== undefined ? String(body.img).trim() : (existing.img || "")
  };

  await upsertTable("offers", [{
    id: targetOffer.id,
    title: targetOffer.title,
    desc_text: targetOffer.desc,
    tag: targetOffer.tag,
    tag_color: targetOffer.tagColor,
    img: targetOffer.img
  }], "id");

  const rows = await fetchAllRows("offers", { orderBy: { column: "id", ascending: false } });
  res.json({ success: true, offers: rows.map(mapOfferFromDb) });
}));

router.delete("/api/offers/:id", asyncHandler(async (req, res) => {
  const isAdmin = await verifyAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ error: "Unauthorized. Admin authorization required." });
  }

  const id = Number(req.params.id);
  await deleteFromTable("offers", "id", id);
  const rows = await fetchAllRows("offers", { orderBy: { column: "id", ascending: false } });
  res.json({ success: true, offers: rows.map(mapOfferFromDb) });
}));

// Authoritative real-time cart & checkout verification
router.post("/api/cart/verify", asyncHandler(async (req, res) => {
  const { items, couponCode, userId, userEmail, phone, paymentMethod } = req.body || {};
  const verification = await verifyCartAndCalculatePricing(items, couponCode, userId, userEmail, phone, paymentMethod);
  if (!verification.valid) {
    return res.status(400).json(verification);
  }
  res.json(verification);
}));

export default router;
