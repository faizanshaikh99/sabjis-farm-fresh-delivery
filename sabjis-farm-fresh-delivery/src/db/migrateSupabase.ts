import {
  supabase,
  isSupabaseConfigured,
  upsertTable
} from './supabaseService';

export async function runSupabaseMigration(stores: {
  usersStore: any[];
  productsStore: any[];
  ordersStore: any[];
  offersStore: any[];
  reviewsStore: any[];
  paymentSettingsStore: any;
  businessSettingsStore: any;
  couponsStore: any[];
  notificationsStore: any[];
  addressesStore: any[];
  loginHistoryStore: any[];
  passwordResetsStore: any[];
  sessionsStore: any[];
  redemptionLogsStore: any[];
}): Promise<{ success: boolean; message: string }> {
  if (!supabase || !isSupabaseConfigured) {
    return {
      success: false,
      message: 'Supabase environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are not configured.'
    };
  }

  console.log('🚀 Starting automatic migration of all JSON stores to Supabase PostgreSQL...');

  try {
    const validUserIds = new Set((stores.usersStore || []).map(u => String(u.id)));
    const validOrderIds = new Set((stores.ordersStore || []).map(o => String(o.id)));
    const validCouponCodes = new Set((stores.couponsStore || []).map(c => String(c.code).toUpperCase()));

    // 1. Users
    if (stores.usersStore && stores.usersStore.length > 0) {
      const userRows = stores.usersStore.map(u => ({
        id: String(u.id),
        name: u.name,
        email: u.email,
        phone: u.phone || '',
        password: u.password,
        role: u.role || 'user',
        addresses: u.addresses || [],
        joined_at: u.joinedAt || new Date().toISOString(),
        status: u.status || 'Active',
        must_change_password: u.mustChangePassword || false
      }));
      await upsertTable('users', userRows, 'id');
    }

    // 2. Products
    if (stores.productsStore && stores.productsStore.length > 0) {
      const productRows = stores.productsStore.map(p => ({
        id: p.id,
        name: p.name,
        cat: p.cat,
        type: p.type || 'organic',
        cp: p.cp || 0,
        sp: p.sp || 0,
        weight: p.weight || 'per kg',
        discount: p.discount || '',
        img: p.img || '',
        emoji: p.emoji || '🥬',
        rating: p.rating || 5.0,
        reviews: p.reviews || 0,
        stock_qty: p.stockQty !== undefined ? p.stockQty : 50,
        low_at: p.lowAt !== undefined ? p.lowAt : 10
      }));
      await upsertTable('products', productRows, 'id');
    }

    // 3. Offers
    if (stores.offersStore && stores.offersStore.length > 0) {
      const offerRows = stores.offersStore.map(o => ({
        id: o.id,
        title: o.title,
        desc_text: o.desc || o.desc_text || '',
        tag: o.tag || 'HOT DEAL',
        tag_color: o.tagColor || o.tag_color || '#f97316',
        img: o.img || ''
      }));
      await upsertTable('offers', offerRows, 'id');
    }

    // 4. Reviews
    if (stores.reviewsStore && stores.reviewsStore.length > 0) {
      const reviewRows = stores.reviewsStore.map(r => ({
        id: r.id,
        author_name: r.authorName || r.author_name || 'Customer',
        location: r.location || '',
        rating: r.rating || 5,
        body: r.body || '',
        created_at: r.createdAt || r.created_at || new Date().toISOString()
      }));
      await upsertTable('reviews', reviewRows, 'id');
    }

    // 5. Orders
    if (stores.ordersStore && stores.ordersStore.length > 0) {
      const orderRows = stores.ordersStore.map(o => {
        const uIdStr = o.userId ? String(o.userId) : null;
        const validUid = (uIdStr && uIdStr !== 'guest' && validUserIds.has(uIdStr)) ? uIdStr : null;
        return {
          id: String(o.id),
          user_id: validUid,
          user_email: o.userEmail || '',
          user_name: o.userName || o.customerName || 'Customer',
          items: o.items || [],
          subtotal: o.subtotal || 0,
          delivery: o.delivery || 0,
          discount_applied: o.discountApplied || 0,
          coupon_applied: o.couponApplied || '',
          total: o.total || 0,
          payment: o.payment || 'COD',
          payment_status: o.paymentStatus || 'Pending',
          utr_number: o.utrNumber || o.utr || o.transactionId || '',
          payment_screenshot: o.paymentScreenshot || o.screenshotUrl || '',
          status: o.status || 'Processing',
          address: o.address || '',
          phone: o.phone || '',
          created_at: o.createdAt || new Date().toISOString(),
          cancellation_reason: o.cancellationReason || '',
          cancelled_at: o.cancelledAt || null,
          refunded_at: o.refundedAt || null,
          refund_note: o.refundNote || '',
          cashier: o.cashier || 'Online Order'
        };
      });
      await upsertTable('orders', orderRows, 'id');
    }

    // 6. Payment Settings
    if (stores.paymentSettingsStore) {
      const ps = stores.paymentSettingsStore;
      await upsertTable('payment_settings', [{
        id: 1,
        business_name: ps.businessName || 'Sabjies Fresh Grocery',
        upi_id: ps.upiId || 'sabjies@upi',
        qr_code_url: ps.qrCodeUrl || '',
        qr_code_file_name: ps.qrCodeFileName || '',
        qr_code_uploaded: ps.qrCodeUploaded || false,
        instructions: ps.instructions || '',
        enable_upi: ps.enableUpi !== undefined ? ps.enableUpi : true,
        enable_cod: ps.enableCod !== undefined ? ps.enableCod : true,
        auto_approve_upi: ps.autoApproveUpi || false
      }], 'id');
    }

    // 7. Business Settings
    if (stores.businessSettingsStore) {
      const bs = stores.businessSettingsStore;
      await upsertTable('business_settings', [{
        id: 1,
        min_free_delivery: bs.minFreeDelivery || 299,
        standard_shipping: bs.standardShipping || 30,
        gst_percentage: bs.gstPercentage || 5,
        operational_hours_start: bs.operationalHoursStart || '09:00 AM',
        operational_hours_end: bs.operationalHoursEnd || '09:00 PM',
        is_open: bs.isOpen !== undefined ? bs.isOpen : true,
        support_phone: bs.supportPhone || '99203 24172',
        address: bs.address || 'Ghatkopar East, Mumbai, Maharashtra 400075',
        business_name: bs.businessName || 'Sabjies',
        support_email: bs.supportEmail || 'greensabjies@gmail.com',
        website: bs.website || 'www.sabjies.in',
        gst_number: bs.gstNumber || '',
        fssai_license: bs.fssaiLicense || '',
        business_registration_number: bs.businessRegistrationNumber || '',
        enable_ig_banner: bs.enableIgBanner !== undefined ? bs.enableIgBanner : true,
        ig_profile_url: bs.igProfileUrl || 'https://www.instagram.com/sabjies?igsh=MWp6cDQ2NHZtcnE0Zw',
        ig_banner_text: bs.igBannerText || '🎁 Follow us on Instagram for exclusive discount codes.'
      }], 'id');
    }

    // 8. Coupons
    if (stores.couponsStore && stores.couponsStore.length > 0) {
      const couponRows = stores.couponsStore.map(c => ({
        code: c.code,
        discount: c.discount || 0,
        min_order: c.minOrder || 0,
        usage: c.usage || 0,
        type: c.type || 'flat',
        expiry: c.expiry || '2026-12-31'
      }));
      await upsertTable('coupons', couponRows, 'code');
    }

    // 9. Notifications
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
          read: n.read || false,
          created_at: n.createdAt || new Date().toISOString()
        };
      });
      await upsertTable('notifications', notificationRows, 'id');
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
          landmark: a.landmark || ''
        };
      });
      await upsertTable('addresses', addressRows, 'id');
    }

    // 11. Login History
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
      await upsertTable('login_history', loginRows, 'id');
    }

    // 12. Password Resets
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
          temp_password_hash: pr.tempPasswordHash || pr.temp_password_hash || '',
          temp_password: pr.tempPassword || pr.temp_password || '',
          token: pr.token || String(pr.id) || '',
          expires_at: pr.expiresAt || pr.expires_at || null,
          notification_status: pr.notificationStatus || pr.notification_status || 'Pending',
          used: pr.used || false
        };
      });
      await upsertTable('password_resets', resetRows, 'id');
    }

    // 13. Sessions
    if (stores.sessionsStore && stores.sessionsStore.length > 0) {
      const sessionRows = stores.sessionsStore.map(s => {
        const uIdStr = s.userId ? String(s.userId) : null;
        const validUid = (uIdStr && validUserIds.has(uIdStr)) ? uIdStr : null;
        return {
          id: String(s.id),
          user_id: validUid,
          token: s.token || String(s.id),
          created_at: s.createdAt || new Date().toISOString(),
          expires_at: s.expiresAt || null
        };
      });
      await upsertTable('sessions', sessionRows, 'id');
    }

    // 14. Redemption Logs
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
          coupon_code: validCouponCode,
          order_id: validOid,
          discount_amount: Number(rl.discountAmount || rl.discount || rl.discount_amount || 0),
          timestamp: rl.timestamp || new Date().toISOString()
        };
      });
      await upsertTable('redemption_logs', logRows, 'id');
    }

    console.log('✅ Supabase PostgreSQL migration completed successfully!');
    return {
      success: true,
      message: 'All local data successfully migrated and synced to Supabase PostgreSQL database.'
    };
  } catch (err: any) {
    console.error('❌ Supabase migration failed:', err);
    return {
      success: false,
      message: `Migration error: ${err.message || err}`
    };
  }
}
