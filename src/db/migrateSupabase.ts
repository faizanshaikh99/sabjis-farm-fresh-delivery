import {
  supabase,
  isSupabaseConfigured,
  upsertTable,
  fetchAllRows,
  cachedSchema,
  tableMissingColumnsMap
} from './supabaseService';

export interface SupabaseMigrationInput {
  usersStore?: any[];
  productsStore?: any[];
  ordersStore?: any[];
  offersStore?: any[];
  reviewsStore?: any[];
  paymentSettingsStore?: any;
  businessSettingsStore?: any;
  couponsStore?: any[];
  notificationsStore?: any[];
  addressesStore?: any[];
  loginHistoryStore?: any[];
  passwordResetsStore?: any[];
  sessionsStore?: any[];
  redemptionLogsStore?: any[];
  categoriesStore?: any[];
  paymentMethodDiscountsStore?: any[];
  paymentTransactionsStore?: any[];
  auditLogsStore?: any[];
}

export async function runSupabaseMigration(
  stores: SupabaseMigrationInput,
  options?: { dryRun?: boolean; preserveExistingUsers?: boolean }
): Promise<{ success: boolean; message: string; counts?: Record<string, number> }> {
  if ((!supabase || !isSupabaseConfigured) && !options?.dryRun) {
    return {
      success: false,
      message: 'Supabase environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are not configured.'
    };
  }

  const dryRun = Boolean(options?.dryRun);
  const preserveExistingUsers = options?.preserveExistingUsers !== false;
  const counts: Record<string, number> = {};

  console.log(`${dryRun ? '🧪 [DRY-RUN]' : '🚀'} Preparing conflict-safe sync of JSON data to Supabase PostgreSQL...`);

  try {
    const validUserIds = new Set((stores.usersStore || []).map(u => String(u.id)));
    const validOrderIds = new Set((stores.ordersStore || []).map(o => String(o.id)));
    const validCouponCodes = new Set((stores.couponsStore || []).map(c => String(c.code).toUpperCase()));

    // 1. Users (conflict-safe: preserve existing user accounts and password hashes)
    if (stores.usersStore && stores.usersStore.length > 0) {
      let existingUsers: any[] = [];
      if (!dryRun && preserveExistingUsers) {
        existingUsers = await fetchAllRows<any>('users', { columns: 'id,email,password' });
      }
      const existingById = new Map(existingUsers.map(u => [String(u.id), u]));
      const existingEmails = new Set(existingUsers.map(u => String(u.email || '').toLowerCase()).filter(Boolean));

      const userRows = stores.usersStore
        .filter(u => {
          if (!preserveExistingUsers) return true;
          const idExists = existingById.has(String(u.id));
          const emailExists = existingEmails.has(String(u.email || '').toLowerCase());
          return !idExists && !emailExists;
        })
        .map(u => ({
          id: String(u.id),
          name: u.name || 'Customer',
          email: u.email,
          phone: u.phone || '',
          password: u.password || '',
          role: u.role || 'user',
          permissions: Array.isArray(u.permissions) ? u.permissions : [],
          addresses: Array.isArray(u.addresses) ? u.addresses : [],
          joined_at: u.joinedAt || u.joined_at || new Date().toISOString(),
          status: u.status || 'Active',
          must_change_password: Boolean(u.mustChangePassword || u.must_change_password)
        }));

      counts.users = userRows.length;
      if (!dryRun && userRows.length > 0) {
        await upsertTable('users', userRows, 'id', { ignoreDuplicates: true });
      }
    }

    // 2. Categories
    if (stores.categoriesStore && stores.categoriesStore.length > 0) {
      const catRows = stores.categoriesStore.map(c => ({
        id: String(c.id),
        label: c.label || String(c.id),
        name: c.name || c.label || String(c.id),
        emoji: c.emoji || '🥦'
      }));
      counts.categories = catRows.length;
      if (!dryRun) await upsertTable('categories', catRows, 'id', { ignoreDuplicates: true });
    }

    // 3. Products
    if (stores.productsStore && stores.productsStore.length > 0) {
      const productRows = stores.productsStore.map(p => {
        const row: Record<string, any> = {
          id: Number(p.id),
          name: p.name,
          cat: p.cat,
          type: p.type || 'organic',
          cp: Number(p.cp || 0),
          sp: Number(p.sp || 0),
          unit: p.unit || 'kg',
          weight: p.weight || 'per kg',
          discount: p.discount || '',
          img: p.img || p.image || p.image_url || '',
          emoji: p.emoji || '🥬',
          rating: Number(p.rating || 5.0),
          reviews: Number(p.reviews || 0),
          stock_qty: p.stockQty !== undefined ? Number(p.stockQty) : (p.stock_qty !== undefined ? Number(p.stock_qty) : 50),
          reserved_qty: Number(p.reservedQty ?? p.reserved_qty ?? 0),
          sold_qty: Number(p.soldQty ?? p.sold_qty ?? 0),
          low_at: p.lowAt !== undefined ? Number(p.lowAt) : (p.low_at !== undefined ? Number(p.low_at) : 10),
          description: p.description || ''
        };
        if (cachedSchema.hasBasePricePerKg) {
          row[cachedSchema.basePriceColName || 'base_price_per_kg'] = Number(p.basePricePerKg ?? p.base_price_per_kg ?? p.sp ?? 0);
        }
        if (cachedSchema.hasImages) {
          row.images = Array.isArray(p.images) ? p.images : [];
        }
        if (cachedSchema.hasWeightSlabs) {
          row[cachedSchema.weightSlabsColName || 'weight_slabs'] = p.weightSlabs || p.weight_slabs || [];
        }
        if (cachedSchema.hasPricingMode) {
          row[cachedSchema.pricingModeColName || 'pricing_mode'] =
            p.pricingMode || p.pricing_mode || ((p.weightSlabs && p.weightSlabs.length > 0) ? 'slabs' : 'auto');
        }
        return row;
      });
      counts.products = productRows.length;
      if (!dryRun) await upsertTable('products', productRows, 'id', { ignoreDuplicates: true });
    }

    // 4. Offers
    if (stores.offersStore && stores.offersStore.length > 0) {
      const offerRows = stores.offersStore.map(o => ({
        id: Number(o.id),
        title: o.title,
        desc_text: o.desc || o.desc_text || '',
        tag: o.tag || 'HOT DEAL',
        tag_color: o.tagColor || o.tag_color || '#f97316',
        img: o.img || ''
      }));
      counts.offers = offerRows.length;
      if (!dryRun) await upsertTable('offers', offerRows, 'id', { ignoreDuplicates: true });
    }

    // 5. Reviews
    if (stores.reviewsStore && stores.reviewsStore.length > 0) {
      const reviewRows = stores.reviewsStore.map(r => ({
        id: Number(r.id),
        author_name: r.authorName || r.author_name || 'Customer',
        location: r.location || '',
        rating: Number(r.rating || 5),
        body: r.body || '',
        created_at: r.createdAt || r.created_at || new Date().toISOString()
      }));
      counts.reviews = reviewRows.length;
      if (!dryRun) await upsertTable('reviews', reviewRows, 'id', { ignoreDuplicates: true });
    }

    // 6. Coupons
    if (stores.couponsStore && stores.couponsStore.length > 0) {
      const couponRows = stores.couponsStore.map(c => ({
        code: String(c.code).toUpperCase(),
        discount: Number(c.discount || 0),
        min_order: Number(c.minOrder ?? c.min_order ?? 0),
        max_discount: c.maxDiscount !== undefined && c.maxDiscount !== null ? Number(c.maxDiscount) : (c.max_discount ?? null),
        usage: Number(c.usage || 0),
        type: c.type || 'flat',
        expiry: c.expiry || '2026-12-31',
        max_per_customer: String(c.maxPerCustomer ?? c.max_per_customer ?? '1'),
        max_redemptions: c.maxRedemptions !== undefined && c.maxRedemptions !== null && c.maxRedemptions !== '' ? Number(c.maxRedemptions) : null,
        campaign_type: c.campaignType || c.campaign_type || 'Regular Promo Code',
        status: c.status || 'Active',
        start_date: c.startDate || c.start_date || null,
        campaign_name: c.campaignName || c.campaign_name || '',
        ig_post_url: c.igPostUrl || c.ig_post_url || '',
        ig_reel_url: c.igReelUrl || c.ig_reel_url || '',
        ig_story_link: c.igStoryLink || c.ig_story_link || '',
        campaign_notes: c.campaignNotes || c.campaign_notes || '',
        internal_description: c.internalDescription || c.internal_description || '',
        created_date: c.createdDate || c.created_date || ''
      }));
      counts.coupons = couponRows.length;
      if (!dryRun) await upsertTable('coupons', couponRows, 'code', { ignoreDuplicates: true });
    }

    // 7. Payment Settings (singleton id=1)
    if (stores.paymentSettingsStore && typeof stores.paymentSettingsStore === 'object') {
      const ps = stores.paymentSettingsStore;
      const psRow = {
        id: 1,
        business_name: ps.businessName || ps.business_name || 'Sabjies Fresh Grocery',
        upi_id: ps.upiId || ps.upi_id || 'sabjies@upi',
        qr_code_url: ps.qrCodeUrl || ps.qr_code_url || '',
        qr_code_data_url: ps.qrCodeDataUrl || ps.qr_code_data_url || '',
        qr_code_file_name: ps.qrCodeFileName || ps.qr_code_file_name || '',
        qr_code_uploaded: Boolean(ps.qrCodeUploaded ?? ps.qr_code_uploaded ?? false),
        qr_code_uploaded_at: ps.qrCodeUploadedAt || ps.qr_code_uploaded_at || null,
        instructions: ps.instructions || '',
        enable_upi: ps.enableUpi !== undefined ? Boolean(ps.enableUpi) : (ps.enable_upi !== undefined ? Boolean(ps.enable_upi) : true),
        enable_cod: ps.enableCod !== undefined ? Boolean(ps.enableCod) : (ps.enable_cod !== undefined ? Boolean(ps.enable_cod) : true),
        enable_razorpay: ps.enableRazorpay !== undefined ? Boolean(ps.enableRazorpay) : (ps.enable_razorpay !== undefined ? Boolean(ps.enable_razorpay) : true),
        auto_approve_upi: Boolean(ps.autoApproveUpi ?? ps.auto_approve_upi ?? false)
      };
      counts.payment_settings = 1;
      if (!dryRun) await upsertTable('payment_settings', [psRow], 'id', { ignoreDuplicates: true });
    }

    // 8. Business Settings (singleton id=1)
    if (stores.businessSettingsStore && typeof stores.businessSettingsStore === 'object') {
      const bs = stores.businessSettingsStore;
      const bsRow = {
        id: 1,
        min_free_delivery: Number(bs.minFreeDelivery ?? bs.min_free_delivery ?? 299),
        standard_shipping: Number(bs.standardShipping ?? bs.standard_shipping ?? 30),
        gst_percentage: Number(bs.gstPercentage ?? bs.gst_percentage ?? 5),
        operational_hours_start: bs.operationalHoursStart || bs.operational_hours_start || '09:00 AM',
        operational_hours_end: bs.operationalHoursEnd || bs.operational_hours_end || '09:00 PM',
        is_open: bs.isOpen !== undefined ? Boolean(bs.isOpen) : (bs.is_open !== undefined ? Boolean(bs.is_open) : true),
        support_phone: bs.supportPhone || bs.support_phone || '99203 24172',
        address: bs.address || 'Ghatkopar East, Mumbai, Maharashtra 400075',
        business_name: bs.businessName || bs.business_name || 'Sabjies',
        support_email: bs.supportEmail || bs.support_email || 'greensabjies@gmail.com',
        website: bs.website || 'www.sabjies.in',
        gst_number: bs.gstNumber || bs.gst_number || '',
        fssai_license: bs.fssaiLicense || bs.fssai_license || '',
        business_registration_number: bs.businessRegistrationNumber || bs.business_registration_number || '',
        enable_ig_banner: bs.enableIgBanner !== undefined ? Boolean(bs.enableIgBanner) : (bs.enable_ig_banner !== undefined ? Boolean(bs.enable_ig_banner) : true),
        ig_profile_url: bs.igProfileUrl || bs.ig_profile_url || 'https://www.instagram.com/sabjies?igsh=MWp6cDQ2NHZtcnE0Zw',
        ig_banner_text: bs.igBannerText || bs.ig_banner_text || '🎁 Follow us on Instagram for exclusive discount codes.'
      };
      counts.business_settings = 1;
      if (!dryRun) await upsertTable('business_settings', [bsRow], 'id', { ignoreDuplicates: true });
    }

    // 9. Payment Method Discounts
    if (stores.paymentMethodDiscountsStore && stores.paymentMethodDiscountsStore.length > 0) {
      const discountRows = stores.paymentMethodDiscountsStore.map(d => ({
        id: String(d.id),
        payment_method: d.paymentMethod || d.payment_method,
        payment_method_name: d.paymentMethodName || d.payment_method_name || d.paymentMethod,
        discount_type: d.discountType || d.discount_type || 'fixed',
        discount_value: Number(d.discountValue ?? d.discount_value ?? 0),
        min_order: d.minOrder !== null && d.minOrder !== undefined && d.minOrder !== '' ? Number(d.minOrder) : null,
        max_discount: d.maxDiscount !== null && d.maxDiscount !== undefined && d.maxDiscount !== '' ? Number(d.maxDiscount) : null,
        start_date: d.startDate || d.start_date || null,
        end_date: d.endDate || d.end_date || null,
        status: d.status || 'active',
        created_at: d.createdAt || d.created_at || new Date().toISOString(),
        updated_at: d.updatedAt || d.updated_at || new Date().toISOString()
      }));
      counts.payment_method_discounts = discountRows.length;
      if (!dryRun) await upsertTable('payment_method_discounts', discountRows, 'id', { ignoreDuplicates: true });
    }

    // 10. Addresses
    if (stores.addressesStore && stores.addressesStore.length > 0) {
      const addressRows = stores.addressesStore.map(a => {
        const uIdStr = a.userId ? String(a.userId) : null;
        const validUid = (uIdStr && validUserIds.has(uIdStr)) ? uIdStr : null;
        return {
          id: String(a.id),
          user_id: validUid,
          name: a.name || '',
          label: a.label || 'Home',
          flat: a.flat || '',
          street: a.street || '',
          area: a.area || 'Ghatkopar East',
          pin: a.pin || '400075',
          city: a.city || 'Mumbai',
          state: a.state || 'Maharashtra',
          landmark: a.landmark || '',
          is_default: Boolean(a.isDefault || a.is_default || false)
        };
      });
      counts.addresses = addressRows.length;
      if (!dryRun) await upsertTable('addresses', addressRows, 'id', { ignoreDuplicates: true });
    }

    // 11. Orders
    if (stores.ordersStore && stores.ordersStore.length > 0) {
      const orderRows = stores.ordersStore.map(o => {
        const uIdStr = o.userId ? String(o.userId) : null;
        const validUid = (uIdStr && uIdStr !== 'guest' && validUserIds.has(uIdStr)) ? uIdStr : null;
        const normalizedItems = (o.items || []).map((it: any) => ({
          id: it.id,
          name: it.name || it.vegetableName || '',
          vegetableName: it.vegetableName || it.name || '',
          weight: it.weight || it.weightLabel || '',
          weightLabel: it.weightLabel || it.weight || '',
          weightInGrams: Number(it.weightInGrams ?? it.weight_in_grams ?? 0),
          weight_in_grams: Number(it.weightInGrams ?? it.weight_in_grams ?? 0),
          pricingType: it.pricingType || it.pricing_type || 'base_rate',
          pricing_type: it.pricingType || it.pricing_type || 'base_rate',
          actualPurchasedPrice: Number(it.actualPurchasedPrice ?? it.price ?? it.sp ?? 0),
          actual_purchased_price: Number(it.actualPurchasedPrice ?? it.price ?? it.sp ?? 0),
          quantity: Number(it.quantity ?? it.qty ?? 1),
          qty: Number(it.quantity ?? it.qty ?? 1),
          itemTotal: Number(it.itemTotal ?? it.lineTotal ?? 0),
          item_total: Number(it.itemTotal ?? it.lineTotal ?? 0),
          emoji: it.emoji || '🥬',
          img: it.img || '',
          formulaText: it.formulaText || ''
        }));

        const row: Record<string, any> = {
          id: String(o.id),
          user_id: validUid,
          customer_id: String(o.customerId || o.userId || 'guest'),
          user_email: o.userEmail || '',
          user_name: o.userName || o.customerName || 'Customer',
          items: normalizedItems,
          subtotal: Number(o.subtotal || 0),
          delivery: Number(o.delivery || 0),
          discount_applied: Number(o.discountApplied || 0),
          coupon_applied: o.couponApplied || '',
          payment_discount_method: o.paymentDiscountMethod || null,
          payment_discount_type: o.paymentDiscountType || null,
          payment_discount_value: o.paymentDiscountValue !== undefined && o.paymentDiscountValue !== null ? Number(o.paymentDiscountValue) : null,
          payment_discount_amount: Number(o.paymentDiscountAmount || 0),
          payment_discount_label: o.paymentDiscountLabel || null,
          total_discount: Number(o.totalDiscount || (o.discountApplied || 0) + (o.paymentDiscountAmount || 0)),
          total: Number(o.total || 0),
          payment: o.payment || 'COD',
          payment_status: o.paymentStatus || 'Pending',
          payment_gateway: o.paymentGateway || '',
          utr_number: o.utrNumber || o.utr || o.transactionId || '',
          utr: o.utrNumber || o.utr || o.transactionId || '',
          upi_id_used: o.upiIdUsed || '',
          payment_screenshot: o.paymentScreenshot || o.screenshotUrl || '',
          razorpay_order_id: o.razorpayOrderId || null,
          razorpay_payment_id: o.razorpayPaymentId || null,
          razorpay_signature: o.razorpaySignature || null,
          idempotency_key: o.idempotencyKey || null,
          stock_deducted: Boolean(o.stockDeducted),
          stock_reserved: Boolean(o.stockReserved),
          stock_released: Boolean(o.stockReleased),
          inventory_status: o.inventoryStatus || '',
          payment_audit_trail: o.paymentAuditTrail || [],
          refund_history: o.refundHistory || [],
          refund_amount: Number(o.refundAmount || 0),
          status: o.status || 'New Orders',
          delivery_instructions: o.deliveryInstructions || '',
          address: o.address || '',
          phone: o.phone || '',
          created_at: o.createdAt || new Date().toISOString(),
          updated_at: o.updatedAt || new Date().toISOString(),
          cancellation_reason: o.cancellationReason || '',
          cancelled_at: o.cancelledAt || null,
          refunded_at: o.refundedAt || null,
          refund_note: o.refundNote || '',
          cashier: o.cashier || 'Online Order'
        };

        if (!tableMissingColumnsMap.get('orders')?.has('admin_remarks') && o.adminRemarks !== undefined) {
          row.admin_remarks = o.adminRemarks || '';
        }
        if (!tableMissingColumnsMap.get('orders')?.has('assigned_rider') && o.assignedRider !== undefined) {
          row.assigned_rider = o.assignedRider || '';
        }

        return row;
      });
      counts.orders = orderRows.length;
      if (!dryRun) await upsertTable('orders', orderRows, 'id', { ignoreDuplicates: true });
    }

    // 12. Payment Transactions
    if (stores.paymentTransactionsStore && stores.paymentTransactionsStore.length > 0) {
      const txnRows = stores.paymentTransactionsStore.map(t => ({
        id: String(t.id),
        order_id: String(t.orderId || t.order_id),
        user_id: t.userId || t.user_id || null,
        user_email: t.userEmail || t.user_email || '',
        amount: Number(t.amount || 0),
        currency: t.currency || 'INR',
        gateway: t.gateway || 'unknown',
        status: t.status || 'Pending',
        transaction_id: t.transactionId || t.transaction_id || null,
        utr: t.utr || null,
        razorpay_order_id: t.razorpayOrderId || t.razorpay_order_id || null,
        razorpay_payment_id: t.razorpayPaymentId || t.razorpay_payment_id || null,
        admin_notes: t.adminNotes || t.admin_notes || '',
        created_at: t.createdAt || t.created_at || new Date().toISOString()
      }));
      counts.payment_transactions = txnRows.length;
      if (!dryRun) await upsertTable('payment_transactions', txnRows, 'id', { ignoreDuplicates: true });
    }

    // 13. Redemption Logs
    if (stores.redemptionLogsStore && stores.redemptionLogsStore.length > 0) {
      const logRows = stores.redemptionLogsStore.map(rl => {
        const uIdStr = rl.userId ? String(rl.userId) : null;
        const validUid = (uIdStr && validUserIds.has(uIdStr)) ? uIdStr : null;
        const oIdStr = (rl.orderId || rl.order_id) ? String(rl.orderId || rl.order_id) : null;
        const validOid = (oIdStr && validOrderIds.has(oIdStr)) ? oIdStr : null;
        const cCodeStr = (rl.couponCode || rl.coupon_code || rl.code) ? String(rl.couponCode || rl.coupon_code || rl.code).toUpperCase() : null;
        const validCouponCode = (cCodeStr && validCouponCodes.has(cCodeStr)) ? cCodeStr : null;
        return {
          id: String(rl.id),
          user_id: validUid,
          user_email: rl.userEmail || rl.user_email || '',
          coupon_code: validCouponCode,
          code: cCodeStr || '',
          order_id: validOid,
          discount_amount: Number(rl.discountAmount || rl.discount || rl.discount_amount || 0),
          timestamp: rl.timestamp || new Date().toISOString()
        };
      });
      counts.redemption_logs = logRows.length;
      if (!dryRun) await upsertTable('redemption_logs', logRows, 'id', { ignoreDuplicates: true });
    }

    // 14. Notifications
    if (stores.notificationsStore && stores.notificationsStore.length > 0) {
      const notificationRows = stores.notificationsStore.map(n => {
        const uIdStr = n.userId ? String(n.userId) : null;
        const validUid = (uIdStr && validUserIds.has(uIdStr)) ? uIdStr : null;
        return {
          id: String(n.id),
          user_id: validUid,
          title: n.title,
          body: n.body || n.message || '',
          type: n.type || 'general',
          read: Boolean(n.read),
          created_at: n.createdAt || new Date().toISOString()
        };
      });
      counts.notifications = notificationRows.length;
      if (!dryRun) await upsertTable('notifications', notificationRows, 'id', { ignoreDuplicates: true });
    }

    // 15. Password Resets (never write plaintext temp passwords)
    if (stores.passwordResetsStore && stores.passwordResetsStore.length > 0) {
      const resetRows = stores.passwordResetsStore.map(pr => {
        const uIdStr = pr.userId ? String(pr.userId) : null;
        const validUid = (uIdStr && validUserIds.has(uIdStr)) ? uIdStr : null;
        return {
          id: String(pr.id),
          user_id: validUid,
          email: pr.email || '',
          phone: pr.phone || pr.mobileNumber || '',
          name: pr.name || '',
          reason: pr.reason || '',
          status: pr.status || 'Pending',
          requested_at: pr.requestedAt || pr.createdAt || pr.requested_at || new Date().toISOString(),
          updated_at: pr.updatedAt || new Date().toISOString(),
          approved_at: pr.approvedAt || pr.approved_at || null,
          approved_by: pr.approvedBy || pr.approved_by || '',
          admin_notes: pr.adminNotes || pr.admin_notes || '',
          temp_password_hash: pr.tempPasswordHash || pr.temp_password_hash || '',
          temp_password: '',
          token: pr.token || String(pr.id) || '',
          expires_at: pr.expiresAt || pr.expires_at || null,
          notification_status: pr.notificationStatus || pr.notification_status || 'Pending',
          last_login: pr.lastLogin || '',
          device_info: pr.deviceInfo || '',
          ip: pr.ip || '',
          audit_trail: Array.isArray(pr.auditTrail) ? pr.auditTrail : [],
          attempts: Number(pr.attempts || 0),
          max_attempts: Number(pr.maxAttempts || 5),
          cooldown_until: pr.cooldownUntil || null,
          verified_at: pr.verifiedAt || null,
          verification_token: pr.verificationToken || null,
          verification_token_expires_at: pr.verificationTokenExpiresAt || null,
          channel: pr.channel || 'email',
          used: Boolean(pr.used)
        };
      });
      counts.password_resets = resetRows.length;
      if (!dryRun) await upsertTable('password_resets', resetRows, 'id', { ignoreDuplicates: true });
    }

    // 16. Sessions
    if (stores.sessionsStore && stores.sessionsStore.length > 0) {
      const sessionRows = stores.sessionsStore
        .filter(s => !s.expiresAt || new Date(s.expiresAt).getTime() > Date.now())
        .map(s => {
          const uIdStr = s.userId ? String(s.userId) : null;
          const validUid = (uIdStr && validUserIds.has(uIdStr)) ? uIdStr : null;
          return {
            id: String(s.id),
            user_id: validUid,
            token: s.token || String(s.id),
            device: s.device || '',
            ip: s.ip || '',
            created_at: s.createdAt || new Date().toISOString(),
            expires_at: s.expiresAt || null
          };
        })
        .filter(s => s.user_id !== null);
      counts.sessions = sessionRows.length;
      if (!dryRun && sessionRows.length > 0) {
        await upsertTable('sessions', sessionRows, 'id', { ignoreDuplicates: true });
      }
    }

    // 17. Login History
    if (stores.loginHistoryStore && stores.loginHistoryStore.length > 0) {
      const loginRows = stores.loginHistoryStore.map(l => ({
        id: String(l.id),
        user_id: l.userId || 'unknown',
        identifier: l.identifier || '',
        status: l.status || 'Success',
        ip: l.ip || '',
        user_agent: l.userAgent || '',
        timestamp: l.timestamp || new Date().toISOString()
      }));
      counts.login_history = loginRows.length;
      if (!dryRun) await upsertTable('login_history', loginRows, 'id', { ignoreDuplicates: true });
    }

    // 18. Audit Logs
    if (stores.auditLogsStore && stores.auditLogsStore.length > 0) {
      const auditRows = stores.auditLogsStore.map(al => ({
        id: String(al.id),
        action: al.action || 'EVENT',
        performed_by: al.performedBy || al.performed_by || al.userId || 'system',
        user_id: al.userId || al.user_id || al.performedBy || 'system',
        details: al.details || {},
        timestamp: al.timestamp || new Date().toISOString()
      }));
      counts.audit_logs = auditRows.length;
      if (!dryRun) await upsertTable('audit_logs', auditRows, 'id', { ignoreDuplicates: true });
    }

    return {
      success: true,
      message: dryRun
        ? 'Dry-run validated all JSON stores for conflict-safe Supabase import (no records written).'
        : 'All JSON data safely imported into Supabase PostgreSQL without overwriting existing accounts.',
      counts
    };
  } catch (err: any) {
    console.error('❌ Supabase migration failed:', err);
    return {
      success: false,
      message: `Migration error: ${err.message || err}`,
      counts
    };
  }
}
