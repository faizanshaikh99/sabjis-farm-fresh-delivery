/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { supabaseClient } from '../lib/supabaseClient';
import { Product, Order, User, Offer, Review, PaymentSettings, Category } from '../types';
import { CATEGORIES } from '../data';
import {
  X,
  TrendingUp,
  ShoppingBag,
  Users,
  MessageSquare,
  AlertCircle,
  Tag,
  Plus,
  Trash2,
  Package,
  Edit,
  DollarSign,
  Map,
  Truck,
  Percent,
  RefreshCw,
  LogOut,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
  Settings,
  Eye,
  EyeOff,
  Phone,
  Layers,
  Bell,
  FileText,
  Sliders,
  Database,
  Activity,
  Key,
  Copy,
  Lock,
  ShieldAlert,
  Calendar,
  Instagram,
  Info,
  ExternalLink,
  Download,
  Printer,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { InvoiceModal } from './InvoiceModal';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  Legend
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

interface AdminPanelProps {
  orders: Order[];
  products: Product[];
  users: User[];
  offers: Offer[];
  reviews: Review[];
  categories?: Category[];
  onClose: () => void;
  onUpdateOrderStatus: (orderId: string, status: any) => void;
  onUpdateOrderPaymentStatus?: (orderId: string, paymentStatus: 'Pending' | 'Paid' | 'Failed' | 'Rejected', remarks?: string) => void;
  onUpdateProductStock: (id: number, qty: number) => void;
  onUpdateProductPrice: (id: number, price: number) => void;
  onUpdateProduct?: (id: number, updates: Partial<Product>) => void;
  onAddProduct: (product: Omit<Product, 'id'>) => void;
  onAddCategory?: (category: Category) => void;
  onRemoveProduct: (id: number) => void;
  onRemoveUser: (id: string) => void;
  onAddOffer: (offer: Omit<Offer, 'id'>) => void;
  onUpdateOffer?: (id: number, offer: Partial<Offer>) => void;
  onRemoveOffer: (id: number) => void;
  onRemoveReview: (id: number) => void;
  onLogout: () => void;
  onRefreshAllData?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  orders: ordersProp,
  products: productsProp,
  users: usersProp,
  offers: offersProp,
  reviews: reviewsProp,
  categories: categoriesProp,
  onClose,
  onUpdateOrderStatus,
  onUpdateOrderPaymentStatus,
  onUpdateProductStock,
  onUpdateProductPrice,
  onUpdateProduct,
  onAddProduct,
  onAddCategory,
  onRemoveProduct,
  onRemoveUser,
  onAddOffer,
  onUpdateOffer,
  onRemoveOffer,
  onRemoveReview,
  onLogout,
  onRefreshAllData,
}) => {
  const [activeTab, setActiveTab] = useState<
    | 'dashboard'
    | 'analytics'
    | 'orders'
    | 'riders'
    | 'products'
    | 'restock'
    | 'coupons'
    | 'users'
    | 'offers'
    | 'reviews'
    | 'payment-settings'
    | 'database'
    | 'password-resets'
  >('dashboard');

  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
  const [pendingConfirmAction, setPendingConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // PASSWORD RESETS REAL-TIME DATA & FILTER STATES
  const [passwordResets, setPasswordResets] = useState<any[]>([]);
  const [resetsFilter, setResetsFilter] = useState<'all' | 'Pending' | 'Approved' | 'Rejected' | 'Today' | 'This Week' | 'This Month'>('all');
  const [resetsSearch, setResetsSearch] = useState('');
  const [selectedReset, setSelectedReset] = useState<any | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [passwordGenMode, setPasswordGenMode] = useState<'auto' | 'custom'>('auto');
  const [customTempPass, setCustomTempPass] = useState('');
  const [generatedTempPass, setGeneratedTempPass] = useState('');

  // USER PASSWORD MANAGEMENT STATE
  const [editingPasswordUser, setEditingPasswordUser] = useState<{ id: string; name: string; email: string; currentPass?: string } | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState<string>('');
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  const generateSecureTempPassword = () => {
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const special = "#@$!&%";
    
    // Ensure at least one of each for strong password guidelines
    let pass = "";
    pass += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
    pass += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
    pass += numbers.charAt(Math.floor(Math.random() * numbers.length));
    pass += special.charAt(Math.floor(Math.random() * special.length));
    
    const allChars = uppercase + lowercase + numbers + special;
    for (let i = 0; i < 5; i++) {
      pass += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }
    
    // Shuffle the characters
    return pass.split('').sort(() => 0.5 - Math.random()).join('');
  };

  const getAuthHeaders = (extraHeaders: Record<string, string> = {}) => {
    return {
      'x-session-id': localStorage.getItem('sabjies_session_id') || '',
      'x-user-id': (() => {
        try {
          const userStr = localStorage.getItem('sabjies_current_user');
          if (userStr) {
            return JSON.parse(userStr).id || '';
          }
        } catch (err) {}
        return '';
      })(),
      ...extraHeaders
    };
  };

  const handleAdminUpdatePassword = async () => {
    if (!editingPasswordUser || !newPasswordInput.trim()) return;
    try {
      const res = await fetch(`/api/admin/users/${editingPasswordUser.id}/update-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ newPassword: newPasswordInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAdminSuccess(`Password updated successfully for ${editingPasswordUser.name}!`);
        setEditingPasswordUser(null);
        setNewPasswordInput('');
        fetchDbTables();
      } else {
        setAdminError(data.error || 'Failed to update password.');
      }
    } catch (err) {
      console.error(err);
      setAdminError('Error updating user password.');
    }
  };

  const fetchPasswordResets = async () => {
    try {
      const res = await fetch('/api/admin/password-resets', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setPasswordResets(data);
        }
      }
    } catch (e) {
      console.error('Error fetching password resets', e);
    }
  };

  // Security Guard: Restrict the entire Admin Panel to authenticated administrators only
  useEffect(() => {
    const storedUser = localStorage.getItem('sabjies_current_user');
    let isAdmin = false;
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed.role === 'admin') {
          isAdmin = true;
        }
      } catch (err) {}
    }
    if (!isAdmin) {
      onClose();
    }
  }, [onClose]);

  // Real-time polling for password resets (Step 2 and Step 10 notification trigger)
  useEffect(() => {
    fetchPasswordResets();
    const interval = setInterval(fetchPasswordResets, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (adminSuccess || adminError) {
      const timer = setTimeout(() => {
        setAdminSuccess(null);
        setAdminError(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [adminSuccess, adminError]);

  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>({
    businessName: 'Sabjies Fresh Grocery',
    upiId: 'sabjies@upi',
    qrCodeUrl: '',
    instructions:
      '1. Scan the QR code or tap "Pay via UPI App".\n2. Pay the exact amount shown.\n3. Copy the UTR/Transaction ID from your UPI app.\n4. Paste the UTR/Transaction ID into the website.\n5. Click "Submit Payment".',
    enableUpi: true,
    enableCod: true,
    autoApproveUpi: false,
  });

  useEffect(() => {
    fetch('/api/payment-settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.upiId) {
          setPaymentSettings(data);
        }
      })
      .catch(() => {});
  }, []);

  // Supabase Database State
  const [supabaseStatus, setSupabaseStatus] = useState<{
    configured: boolean;
    provider: string;
    databaseUrl: string;
    totalUsersCount: number;
    totalProductsCount: number;
    totalOrdersCount: number;
    totalCouponsCount: number;
  } | null>(null);
  const [isSyncingSupabase, setIsSyncingSupabase] = useState(false);

  const checkSupabaseStatus = () => {
    fetch('/api/admin/supabase-status', { headers: getAuthHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setSupabaseStatus(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    checkSupabaseStatus();
  }, []);

  const handleSyncSupabase = async () => {
    setIsSyncingSupabase(true);
    try {
      const res = await fetch('/api/admin/supabase-sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setAdminSuccess('Successfully synchronized all database tables to Supabase PostgreSQL!');
        checkSupabaseStatus();
      } else {
        setAdminError(data.message || 'Supabase sync failed.');
      }
    } catch (e) {
      setAdminError('Failed to trigger Supabase sync.');
    } finally {
      setIsSyncingSupabase(false);
    }
  };


  // Master Database state
  const [dbTables, setDbTables] = useState<any>({
    users: [],
    products: [],
    orders: [],
    payments: [],
    addresses: [],
    reviews: [],
    loginHistory: [],
    passwordResets: [],
    sessions: [],
    notifications: []
  });
  const [dbActiveSubTable, setDbActiveSubTable] = useState<string>('users');
  const [dbSearch, setDbSearch] = useState<string>('');
  const [dbIsLoading, setDbIsLoading] = useState<boolean>(false);
  const [dbSelectedRowIds, setDbSelectedRowIds] = useState<string[]>([]);
  const [dbEditRow, setDbEditRow] = useState<any | null>(null);
  const [dbViewRow, setDbViewRow] = useState<any | null>(null);
  const [dbImportText, setDbImportText] = useState<string>('');
  const [dbShowImportModal, setDbShowImportModal] = useState<boolean>(false);

  // Advanced features state variables
  const [dbSortColumn, setDbSortColumn] = useState<string | null>(null);
  const [dbSortDirection, setDbSortDirection] = useState<'asc' | 'desc'>('asc');
  const [dbPage, setDbPage] = useState<number>(1);
  const [dbPageSize, setDbPageSize] = useState<number>(10);
  const [dbStartDate, setDbStartDate] = useState<string>('');
  const [dbEndDate, setDbEndDate] = useState<string>('');
  const [dbColumnVisibility, setDbColumnVisibility] = useState<{ [table: string]: string[] }>({});
  const [dbAdvancedFilters, setDbAdvancedFilters] = useState<{
    status?: string;
    stockLevel?: string;
    priceLevel?: string;
    datePeriod?: string;
    paymentStatus?: string;
    ratingLevel?: string;
    verified?: string;
    role?: string;
  }>({
    status: 'all',
    stockLevel: 'all',
    priceLevel: 'all',
    datePeriod: 'all',
    paymentStatus: 'all',
    ratingLevel: 'all',
    verified: 'all',
    role: 'all',
  });

  // Bulk update states
  const [dbShowBulkUpdateModal, setDbShowBulkUpdateModal] = useState<boolean>(false);
  const [dbBulkUpdateField, setDbBulkUpdateField] = useState<string>('');
  const [dbBulkUpdateValue, setDbBulkUpdateValue] = useState<string>('');

  const fetchDbTables = async () => {
    setDbIsLoading(true);
    try {
      const res = await fetch('/api/admin/database', { headers: getAuthHeaders() });
      const data = await res.json();
      setDbTables(data);
    } catch (e) {
      console.error('Error fetching admin database tables', e);
    } finally {
      setDbIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDbTables();
    if (activeTab === 'database') {
      setDbSelectedRowIds([]);
    }
  }, [activeTab, dbActiveSubTable]);

  // Realtime Live Status & Subscription
  const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(false);
  const [realtimeNotification, setRealtimeNotification] = useState<string | null>(null);

  // Subscribe to Supabase Realtime postgres_changes on orders & products
  useEffect(() => {
    console.log('⚡ Initializing Supabase Realtime channel for Admin Panel...');

    const channel = supabaseClient
      .channel('admin-panel-orders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          console.log('⚡ [Supabase Realtime] Received order change payload:', payload);
          const eventType = payload.eventType;
          const newOrder = payload.new as any;

          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

          if (eventType === 'INSERT') {
            const notifMsg = `⚡ [${timeStr}] NEW ORDER PLACED! Order #${newOrder?.id || ''} (₹${newOrder?.total || 0})`;
            setRealtimeNotification(notifMsg);
            setAdminSuccess(notifMsg);
          } else if (eventType === 'UPDATE') {
            const notifMsg = `⚡ [${timeStr}] ORDER #${newOrder?.id || ''} STATUS CHANGED to "${(newOrder?.status || '').toUpperCase()}" (Payment: ${newOrder?.payment_status || newOrder?.paymentStatus || 'Pending'})`;
            setRealtimeNotification(notifMsg);
            setAdminSuccess(notifMsg);
          }

          // Instantly refresh admin database tables without page refresh or polling!
          fetchDbTables();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products'
        },
        () => {
          fetchDbTables();
        }
      )
      .subscribe((status) => {
        console.log('📡 Supabase Realtime status:', status);
        setIsRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, []);

  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<Order | null>(null);
  const [isConfirmingLogout, setIsConfirmingLogout] = useState(false);
  const [analyticsSubTab, setAnalyticsSubTab] = useState<'sales' | 'revenue' | 'customers' | 'products' | 'forecast'>('sales');
  const [forecastGrowthFactor, setForecastGrowthFactor] = useState<number>(1.15);

  // Coupons state (Suggestion 5)
  const [coupons, setCoupons] = useState<Array<any>>([]);
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponDiscount, setNewCouponDiscount] = useState(15);
  const [newCouponMinOrder, setNewCouponMinOrder] = useState(250);

  // Advanced Coupon inputs state
  const [newCouponCampaignType, setNewCouponCampaignType] = useState('Regular Promo Code');
  const [newCouponDiscountType, setNewCouponDiscountType] = useState('flat');
  const [newCouponMaxRedemptions, setNewCouponMaxRedemptions] = useState<number | ''>('');
  const [newCouponMaxPerCustomer, setNewCouponMaxPerCustomer] = useState<string>('Unlimited');
  const [newCouponStartDate, setNewCouponStartDate] = useState('');
  const [newCouponExpiry, setNewCouponExpiry] = useState('');
  const [newCouponStatus, setNewCouponStatus] = useState('Active');
  const [newCouponCampaignName, setNewCouponCampaignName] = useState('');
  const [newCouponIgPostUrl, setNewCouponIgPostUrl] = useState('');
  const [newCouponIgReelUrl, setNewCouponIgReelUrl] = useState('');
  const [newCouponIgStoryLink, setNewCouponIgStoryLink] = useState('');
  const [newCouponCampaignNotes, setNewCouponCampaignNotes] = useState('');
  const [newCouponInternalDescription, setNewCouponInternalDescription] = useState('');

  // Coupon Sub-tabs and loaded analytics
  const [couponSubTab, setCouponSubTab] = useState<'campaigns' | 'redemptions' | 'analytics'>('campaigns');
  const [couponAnalytics, setCouponAnalytics] = useState<any>(null);
  const [redemptionLogs, setRedemptionLogs] = useState<any[]>([]);

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isQrUploading, setIsQrUploading] = useState(false);
  const [qrUploadError, setQrUploadError] = useState<string | null>(null);

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/admin/audit-logs', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setAuditLogs(data);
        }
      }
    } catch (e) {
      console.error('Error fetching audit logs:', e);
    }
  };

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setQrUploadError(null);
    setIsQrUploading(true);

    // Validate type first
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setQrUploadError("Invalid file type. Only PNG, JPG, JPEG, and WebP images are allowed.");
      setIsQrUploading(false);
      return;
    }

    // Modern Canvas-based Image Compression to guarantee ultra-small payload sizes (typically <50KB)
    // This fully prevents the reverse proxy (Nginx) or server from rejecting large base64 entity uploads.
    const compressAndResize = (imgFile: File, maxWidth = 500, maxHeight = 500, quality = 0.8): Promise<{ dataUrl: string; finalType: string }> => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              }
            } else {
              if (height > maxHeight) {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve({ dataUrl: event.target?.result as string, finalType: imgFile.type });
              return;
            }

            ctx.drawImage(img, 0, 0, width, height);
            const finalType = imgFile.type === 'image/png' ? 'image/png' : 'image/jpeg';
            const dataUrl = canvas.toDataURL(finalType, quality);
            resolve({ dataUrl, finalType });
          };
          img.onerror = () => {
            resolve({ dataUrl: event.target?.result as string, finalType: imgFile.type });
          };
          img.src = event.target?.result as string;
        };
        reader.onerror = () => {
          resolve({ dataUrl: '', finalType: imgFile.type });
        };
        reader.readAsDataURL(imgFile);
      });
    };

    try {
      const { dataUrl, finalType } = await compressAndResize(file);
      if (!dataUrl) {
        setQrUploadError("Failed to process and compress the image.");
        setIsQrUploading(false);
        return;
      }

      const res = await fetch('/api/admin/payment-settings/qr-code', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          fileName: file.name,
          fileType: finalType,
          fileData: dataUrl
        })
      });

      const data = await res.json();
      if (data.success && data.settings) {
        setPaymentSettings(data.settings);
        setAdminSuccess("Payment QR Code uploaded and active successfully! 📸");
        fetchAuditLogs();
      } else {
        setQrUploadError(data.error || "Failed to upload QR Code.");
      }
    } catch (err) {
      console.error("QR Code upload failed:", err);
      setQrUploadError("Network error or server rejected the payload size. Please try a smaller QR code image.");
    } finally {
      setIsQrUploading(false);
    }
  };

  const handleQrDelete = async () => {
    if (!window.confirm("Are you sure you want to delete the payment QR code? Customers will see a 'Payment QR is currently unavailable' message.")) {
      return;
    }

    try {
      const res = await fetch('/api/admin/payment-settings/qr-code', {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.settings) {
        setPaymentSettings(data.settings);
        setAdminSuccess("Payment QR Code deleted successfully. 🗑️");
        fetchAuditLogs();
      } else {
        setAdminError(data.error || "Failed to delete QR Code.");
      }
    } catch (err) {
      setAdminError("Failed to delete QR Code. Check server connection.");
    }
  };

  useEffect(() => {
    if (activeTab === 'payment-settings') {
      fetchAuditLogs();
    }
  }, [activeTab]);

  const [shopSettings, setShopSettings] = useState({
    minFreeDelivery: 299,
    standardShipping: 30,
    gstPercentage: 5,
    operationalHoursStart: "09:00 AM",
    operationalHoursEnd: "09:00 PM",
    isOpen: true,
    supportPhone: "99203 24172",
    address: "Ghatkopar East, Mumbai, Maharashtra 400075",
    businessName: "Sabjies",
    supportEmail: "greensabjies@gmail.com",
    website: "www.sabjies.in",
    gstNumber: "",
    fssaiLicense: "",
    businessRegistrationNumber: "",
    enableIgBanner: true,
    igProfileUrl: "https://www.instagram.com/sabjies?igsh=MWp6cDQ2NHZtcnE0Zw",
    igBannerText: "🎁 Follow us on Instagram for exclusive discount codes.",
  });

  const fetchCouponAnalytics = () => {
    fetch('/api/admin/coupon-analytics', { headers: getAuthHeaders() })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setCouponAnalytics(data.analytics);
        }
      })
      .catch(e => console.error('Error fetching coupon analytics:', e));
  };

  const fetchRedemptionLogs = () => {
    fetch('/api/admin/coupon-redemptions', { headers: getAuthHeaders() })
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.redemptions)) {
          setRedemptionLogs(data.redemptions);
        }
      })
      .catch(e => console.error('Error fetching coupon redemptions:', e));
  };

  useEffect(() => {
    // Load dynamic coupons
    fetch('/api/admin/coupons', { headers: getAuthHeaders() })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setCoupons(data);
      })
      .catch(e => console.error('Error fetching coupons:', e));

    // Load business settings
    fetch('/api/admin/business-settings', { headers: getAuthHeaders() })
      .then(res => res.json())
      .then(data => {
        if (data && data.minFreeDelivery !== undefined) setShopSettings(data);
      })
      .catch(e => console.error('Error fetching settings:', e));

    // Fetch Coupon analytics & redemption logs
    fetchCouponAnalytics();
    fetchRedemptionLogs();

    // Load master database tables
    fetchDbTables();
  }, []);

  // Auto-Restock states (Suggestion 4)
  const [restockLogs, setRestockLogs] = useState<Array<{ id: number; timestamp: string; items: string; cost: number; status: 'Pending' | 'Completed' }>>([
    { id: 1, timestamp: '03 Jul, 08:30 AM', items: 'Potato (50kg), Onion (40kg)', cost: 1800, status: 'Completed' },
    { id: 2, timestamp: '02 Jul, 04:15 PM', items: 'Tomato (30kg), Coriander (10kg)', cost: 1100, status: 'Completed' },
  ]);
  const [isRestocking, setIsRestocking] = useState(false);

  // Live Riders states (Suggestion 2)
  const [riders, setRiders] = useState([
    { id: 1, name: 'Sohail Khan', phone: '+91 98332 21104', status: 'Delivering', zone: 'Ghatkopar East', activeOrder: '#1052', lat: 75, lng: 95 },
    { id: 2, name: 'Faizan Merchant', phone: '+91 97723 88129', status: 'Idle', zone: 'Ghatkopar West', activeOrder: 'None', lat: 140, lng: 110 },
    { id: 3, name: 'Rahul Chawla', phone: '+91 91672 55431', status: 'Delivering', zone: 'Vikhroli West', activeOrder: '#1051', lat: 210, lng: 130 },
    { id: 4, name: 'Amit Shinde', phone: '+91 98210 99423', status: 'Returning', zone: 'Pant Nagar', activeOrder: 'None', lat: 90, lng: 220 },
  ]);

  // Add Product form states
  const [newProdName, setNewProdName] = useState('');
  const [newProdCat, setNewProdCat] = useState('root');
  const [newProdType, setNewProdType] = useState('all');
  const [newProdCp, setNewProdCp] = useState(20);
  const [newProdSp, setNewProdSp] = useState(30);
  const [newProdWeight, setNewProdWeight] = useState('per kg');
  const [newProdEmoji, setNewProdEmoji] = useState('🥕');
  const [newProdImg, setNewProdImg] = useState('');
  const [newProdStock, setNewProdStock] = useState(50);
  const [showAddProduct, setShowAddProduct] = useState(false);

  // Dynamic Categories State
  const [categoriesList, setCategoriesList] = useState<Category[]>(categoriesProp || CATEGORIES);
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [customCategoryEmoji, setCustomCategoryEmoji] = useState('🥦');
  const [customCategoryError, setCustomCategoryError] = useState<string | null>(null);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [categoryTargetForm, setCategoryTargetForm] = useState<'add' | 'edit' | 'tab'>('add');

  // Edit Product Modal State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showEditProductModal, setShowEditProductModal] = useState(false);

  useEffect(() => {
    if (categoriesProp && categoriesProp.length > 0) {
      setCategoriesList(categoriesProp);
    }
  }, [categoriesProp]);

  // Fetch categories on mount
  useEffect(() => {
    fetch('/api/categories')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategoriesList(data);
        }
      })
      .catch(() => {});
  }, []);

  // Add Offer form states
  const [newOfferTitle, setNewOfferTitle] = useState('');
  const [newOfferDesc, setNewOfferDesc] = useState('');
  const [newOfferTag, setNewOfferTag] = useState('HOT DEAL');
  const [newOfferImg, setNewOfferImg] = useState('');
  const [editingOfferId, setEditingOfferId] = useState<number | null>(null);

  // ── DATA UNIFICATION - SINGLE SOURCE OF TRUTH FROM DATABASE ──
  const orders = dbTables.orders && dbTables.orders.length > 0 ? dbTables.orders : (ordersProp || []);
  const products = dbTables.products && dbTables.products.length > 0 ? dbTables.products : (productsProp || []);
  const users = dbTables.users && dbTables.users.length > 0 ? dbTables.users : (usersProp || []);
  const offers = dbTables.offers && dbTables.offers.length > 0 ? dbTables.offers : (offersProp || []);
  const reviews = dbTables.reviews && dbTables.reviews.length > 0 ? dbTables.reviews : (reviewsProp || []);

  // ── ANALYTICS DATA GENERATION ──
  // Compute analytics
  const totalRevenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((acc, o) => acc + o.total, 0);

  const totalCost = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((acc, o) => {
      // sum up cost price * qty for items in order
      const orderCost = o.items.reduce((sum, item) => {
        const prod = products.find((p) => p.id === item.id);
        const costPrice = prod ? prod.cp : item.sp * 0.6; // fallback 60%
        return sum + costPrice * item.qty;
      }, 0);
      return acc + orderCost;
    }, 0);

  const profit = totalRevenue - totalCost;
  const oosCount = products.filter((p) => p.stockQty === 0).length;
  const lowStockCount = products.filter((p) => p.stockQty > 0 && p.stockQty <= p.lowAt).length;

  // Chart 1: Revenue trend over time
  // Group orders by date (e.g. DD-MM)
  const revenueTrendMap: { [date: string]: number } = {};
  orders
    .filter((o) => o.status !== 'cancelled')
    .forEach((o) => {
      const date = new Date(o.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
      });
      revenueTrendMap[date] = (revenueTrendMap[date] || 0) + o.total;
    });

  // Ensure some default points if empty
  const revenueTrendData = Object.keys(revenueTrendMap).map((date) => ({
    date,
    Sales: revenueTrendMap[date],
  })).slice(-7); // Last 7 days

  if (revenueTrendData.length === 0) {
    revenueTrendData.push(
      { date: '25 Jun', Sales: 1800 },
      { date: '26 Jun', Sales: 2400 },
      { date: '27 Jun', Sales: 3100 },
      { date: '28 Jun', Sales: 2900 },
      { date: '29 Jun', Sales: 4200 },
      { date: '30 Jun', Sales: 3800 },
      { date: '01 Jul', Sales: 5200 }
    );
  }

  // ── SALES & VOLUME TRENDS COMPUTATION ──
  const salesTrendMap: { [date: string]: { revenue: number; volume: number } } = {};
  orders
    .filter((o) => o.status !== 'cancelled')
    .forEach((o) => {
      const date = new Date(o.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
      });
      if (!salesTrendMap[date]) {
        salesTrendMap[date] = { revenue: 0, volume: 0 };
      }
      salesTrendMap[date].revenue += o.total;
      salesTrendMap[date].volume += 1;
    });

  const salesTrendData = Object.keys(salesTrendMap).map((date) => ({
    date,
    revenue: salesTrendMap[date].revenue,
    volume: salesTrendMap[date].volume,
  })).sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  if (salesTrendData.length === 0) {
    salesTrendData.push(
      { date: '25 Jun', revenue: 1800, volume: 12 },
      { date: '26 Jun', revenue: 2400, volume: 18 },
      { date: '27 Jun', revenue: 3100, volume: 22 },
      { date: '28 Jun', revenue: 2900, volume: 15 },
      { date: '29 Jun', revenue: 4200, volume: 29 },
      { date: '30 Jun', revenue: 3800, volume: 25 },
      { date: '01 Jul', revenue: 5200, volume: 35 }
    );
  }

  const avgOrderValue = orders.filter((o) => o.status !== 'cancelled').length > 0 
    ? Math.round(totalRevenue / orders.filter((o) => o.status !== 'cancelled').length) 
    : 0;
  const maxRevenuePoint = salesTrendData.reduce((max, d) => d.revenue > max ? d.revenue : max, 0);
  const totalVolume = salesTrendData.reduce((sum, d) => sum + d.volume, 0);

  // Chart 2: Section-wise / Category Sales Analysis
  const categorySalesMap: { [cat: string]: number } = {};
  orders
    .filter((o) => o.status !== 'cancelled')
    .forEach((o) => {
      o.items.forEach((item) => {
        const prod = products.find((p) => p.id === item.id);
        const catId = prod ? prod.cat : 'all';
        const catLabel = CATEGORIES.find((c) => c.id === catId)?.label || 'Other';
        categorySalesMap[catLabel] = (categorySalesMap[catLabel] || 0) + item.sp * item.qty;
      });
    });

  const categorySalesData = Object.keys(categorySalesMap).map((name) => ({
    name,
    Sales: categorySalesMap[name],
  }));

  if (categorySalesData.length === 0) {
    CATEGORIES.filter((c) => c.id !== 'all').forEach((c) => {
      categorySalesData.push({
        name: c.label,
        Sales: Math.floor(Math.random() * 1200) + 400,
      });
    });
  }

  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#f43f5e', '#14b8a6'];

  const handleOfferImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        if (uploadEvent.target?.result) {
          setNewOfferImg(uploadEvent.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        if (uploadEvent.target?.result) {
          setNewProdImg(uploadEvent.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(newProdName || '').trim()) return;

    onAddProduct({
      name: newProdName.trim(),
      cat: newProdCat,
      type: newProdType,
      cp: Number(newProdCp),
      sp: Number(newProdSp),
      weight: newProdWeight,
      discount: '',
      img: (newProdImg || '').trim() || 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=400',
      emoji: (newProdEmoji || '').trim() || '🥦',
      rating: 5.0,
      reviews: 0,
      stockQty: Number(newProdStock),
      lowAt: 10,
    });

    setNewProdName('');
    setNewProdImg('');
    setShowAddProduct(false);
    setAdminSuccess('Product added successfully!');
  };

  // ── SAVE CUSTOM CATEGORY ──
  const handleSaveCustomCategory = async (target: 'add' | 'edit' | 'tab' = 'add') => {
    const trimmedName = (customCategoryName || '').trim();
    if (!trimmedName) {
      setCustomCategoryError('Category name cannot be empty.');
      return;
    }

    // Prevent duplicate category name or generated ID (case-insensitive)
    const normalizedId = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const exists = categoriesList.some(
      (c) => c.label.trim().toLowerCase() === trimmedName.toLowerCase() || c.id.toLowerCase() === normalizedId.toLowerCase()
    );

    if (exists) {
      setCustomCategoryError(`Category "${trimmedName}" already exists.`);
      return;
    }

    setIsSavingCategory(true);
    setCustomCategoryError(null);

    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: trimmedName,
          emoji: customCategoryEmoji || '🥦'
        })
      });

      const data = await res.json();
      if (res.ok && data.category) {
        const newCat: Category = data.category;
        setCategoriesList((prev) => [...prev.filter((c) => c.id !== newCat.id), newCat]);
        onAddCategory?.(newCat);

        // Automatically select the new category in the form
        if (target === 'add') {
          setNewProdCat(newCat.id);
        } else if (target === 'edit' && editingProduct) {
          setEditingProduct({ ...editingProduct, cat: newCat.id });
        }

        setAdminSuccess(`Category "${newCat.label}" added & permanently saved!`);
        setCustomCategoryName('');
        setCustomCategoryEmoji('🥦');
        setShowCreateCategoryModal(false);
        setCustomCategoryError(null);
      } else {
        setCustomCategoryError(data.error || 'Failed to create category.');
      }
    } catch (err) {
      setCustomCategoryError('Network error saving category.');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (id: string, label: string) => {
    if (id === 'all') {
      setAdminError('Cannot delete the default Master category.');
      return;
    }

    setPendingConfirmAction({
      message: `Are you sure you want to permanently delete category "${label}"?`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.success) {
            setCategoriesList(prev => prev.filter(c => c.id !== id));
            setAdminSuccess(`Category "${label}" deleted.`);
            onRefreshAllData?.();
          } else {
            setAdminError(data.error || 'Failed to delete category.');
          }
        } catch (e) {
          setAdminError('Network error deleting category.');
        }
      }
    });
  };

  // ── EDIT PRODUCT SUBMIT ──
  const handleEditProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !(editingProduct.name || '').trim()) return;

    const updates: Partial<Product> = {
      name: editingProduct.name.trim(),
      cat: editingProduct.cat,
      type: editingProduct.type,
      cp: Number(editingProduct.cp),
      sp: Number(editingProduct.sp),
      weight: editingProduct.weight,
      discount: editingProduct.discount || '',
      img: (editingProduct.img || '').trim() || 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=400',
      emoji: (editingProduct.emoji || '').trim() || '🥦',
      stockQty: Number(editingProduct.stockQty),
      lowAt: Number(editingProduct.lowAt || 10),
    };

    if (onUpdateProduct) {
      onUpdateProduct(editingProduct.id, updates);
    } else {
      try {
        await fetch(`/api/products/${editingProduct.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
      } catch (e) {}
    }

    setShowEditProductModal(false);
    setEditingProduct(null);
    setAdminSuccess('Product updated successfully!');
    fetchDbTables();
    onRefreshAllData?.();
  };

  const handleDbRowDelete = (table: string, id: string | number) => {
    setPendingConfirmAction({
      message: `Are you sure you want to delete row #${id} from ${table}? This action is permanent.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/database/${table}/${id}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.success) {
            setAdminSuccess('Deleted successfully.');
            fetchDbTables();
            onRefreshAllData?.();
          } else {
            setAdminError('Delete failed: ' + data.message);
          }
        } catch (err) {
          setAdminError('Network error deleting row.');
        }
      }
    });
  };

  const handleDbBulkDelete = () => {
    if (dbSelectedRowIds.length === 0) return;
    setPendingConfirmAction({
      message: `Delete ${dbSelectedRowIds.length} selected row(s) from ${dbActiveSubTable}?`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/database/${dbActiveSubTable}/bulk-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: dbSelectedRowIds })
          });
          const data = await res.json();
          if (data.success) {
            setAdminSuccess(`Successfully deleted ${data.count} rows!`);
            setDbSelectedRowIds([]);
            fetchDbTables();
            onRefreshAllData?.();
          } else {
            setAdminError('Bulk delete failed.');
          }
        } catch (err) {
          setAdminError('Network error during bulk delete.');
        }
      }
    });
  };

  const handleDbRowEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbEditRow) return;
    try {
      const res = await fetch(`/api/admin/database/${dbActiveSubTable}/${dbEditRow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbEditRow)
      });
      const data = await res.json();
      if (data.success) {
        setAdminSuccess('Row updated and synchronized successfully! ✨');
        setDbEditRow(null);
        fetchDbTables();
        onRefreshAllData?.();
      } else {
        setAdminError('Update failed: ' + data.message);
      }
    } catch (err) {
      setAdminError('Network error during update.');
    }
  };

  const handleDbBulkUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dbSelectedRowIds.length === 0 || !dbBulkUpdateField) return;
    try {
      let parsedVal: any = dbBulkUpdateValue;
      if (dbBulkUpdateValue === 'true') parsedVal = true;
      else if (dbBulkUpdateValue === 'false') parsedVal = false;
      else if (!isNaN(Number(dbBulkUpdateValue))) parsedVal = Number(dbBulkUpdateValue);

      const res = await fetch(`/api/admin/database/${dbActiveSubTable}/bulk-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: dbSelectedRowIds,
          update: { [dbBulkUpdateField]: parsedVal }
        })
      });
      const data = await res.json();
      if (data.success) {
        setAdminSuccess(`Successfully updated ${data.count} selected records in real-time! ✨`);
        setDbSelectedRowIds([]);
        setDbShowBulkUpdateModal(false);
        setDbBulkUpdateField('');
        setDbBulkUpdateValue('');
        fetchDbTables();
        onRefreshAllData?.();
      } else {
        setAdminError('Bulk update failed: ' + data.message);
      }
    } catch (err) {
      setAdminError('Network error during bulk update.');
    }
  };

  const handleDbBulkImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbImportText.trim()) return;
    try {
      let items: any[] = [];
      try {
        items = JSON.parse(dbImportText);
        if (!Array.isArray(items)) {
          setAdminError('Input must be a valid JSON Array of objects.');
          return;
        }
      } catch (err) {
        const lines = dbImportText.split('\n').filter(l => l.trim());
        if (lines.length < 2) {
          setAdminError('CSV must contain a header row and at least one data row.');
          return;
        }
        const headers = lines[0].split(',').map(h => h.trim());
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim());
          const obj: any = {};
          headers.forEach((h, idx) => {
            let val: any = values[idx];
            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else if (!isNaN(Number(val))) val = Number(val);
            obj[h] = val;
          });
          items.push(obj);
        }
      }

      const res = await fetch(`/api/admin/database/${dbActiveSubTable}/bulk-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json();
      if (data.success) {
        setAdminSuccess(`Successfully imported ${data.count} items!`);
        setDbImportText('');
        setDbShowImportModal(false);
        fetchDbTables();
        onRefreshAllData?.();
      } else {
        setAdminError('Import failed: ' + data.message);
      }
    } catch (err) {
      setAdminError('Error parsing or uploading imported items.');
    }
  };

  const exportDbTableToCsv = () => {
    const rows = dbTables[dbActiveSubTable] || [];
    if (rows.length === 0) {
      setAdminError('No data to export.');
      return;
    }
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(','),
      ...rows.map((row: any) =>
        headers.map(h => {
          let val = row[h];
          if (typeof val === 'object') val = JSON.stringify(val);
          val = String(val).replace(/"/g, '""');
          return `"${val}"`;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `sabjies_db_${dbActiveSubTable}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setAdminSuccess('CSV Export compiled and downloaded successfully!');
  };

  const handleOfferFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(newOfferTitle || '').trim() || !(newOfferDesc || '').trim()) return;

    const defaultImg = 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&q=80&w=800';
    const trimmedOfferImg = (newOfferImg || '').trim();
    const finalImg = trimmedOfferImg ? trimmedOfferImg : defaultImg;

    if (editingOfferId !== null && onUpdateOffer) {
      onUpdateOffer(editingOfferId, {
        title: newOfferTitle.trim(),
        desc: newOfferDesc.trim(),
        tag: (newOfferTag || '').trim() || 'HOT DEAL',
        tagColor: '#1a9c5b',
        img: finalImg,
      });
      setEditingOfferId(null);
      setAdminSuccess('Promotion banner updated successfully!');
    } else {
      onAddOffer({
        title: newOfferTitle.trim(),
        desc: newOfferDesc.trim(),
        tag: (newOfferTag || '').trim() || 'HOT DEAL',
        tagColor: '#1a9c5b',
        img: finalImg,
      });
      setAdminSuccess('Promotion banner launched successfully!');
    }

    setNewOfferTitle('');
    setNewOfferDesc('');
    setNewOfferTag('HOT DEAL');
    setNewOfferImg('');
  };

  const handleStartEditOffer = (off: Offer) => {
    setEditingOfferId(off.id);
    setNewOfferTitle(off.title);
    setNewOfferDesc(off.desc);
    setNewOfferTag(off.tag);
    setNewOfferImg(off.img);
  };

  const simulateGps = () => {
    setRiders(prev => prev.map(r => {
      if (r.status === 'Idle') return r;
      // move coordinate slightly
      const dLat = (Math.random() * 16 - 8);
      const dLng = (Math.random() * 16 - 8);
      let newLat = r.lat + dLat;
      let newLng = r.lng + dLng;
      // keep within map boundary box
      if (newLat < 40) newLat = 50;
      if (newLat > 260) newLat = 250;
      if (newLng < 40) newLng = 50;
      if (newLng > 210) newLng = 200;
      return { ...r, lat: Math.round(newLat), lng: Math.round(newLng) };
    }));
  };

  const handleAutoRestock = () => {
    const lowStockItems = products.filter(p => p.stockQty <= p.lowAt);
    if (lowStockItems.length === 0) {
      setAdminSuccess('All products have healthy inventory! No auto-restock needed at this time.');
      return;
    }
    
    setIsRestocking(true);
    setTimeout(() => {
      // replenish each low stock item to 100
      lowStockItems.forEach(p => {
        onUpdateProductStock(p.id, 100);
      });
      
      const names = lowStockItems.map(p => p.name).join(', ');
      const totalCostCalculated = lowStockItems.length * 800; // estimated wholesale cost
      
      setRestockLogs(prev => [
        {
          id: prev.length + 1,
          timestamp: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ', ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          items: names + ' (Restocked to 100kg)',
          cost: totalCostCalculated,
          status: 'Completed' as const
        },
        ...prev
      ]);
      
      setIsRestocking(false);
      setAdminSuccess('AI-Engine has dispatched purchase orders to APMC wholesales. Stock of ' + lowStockItems.length + ' products replenished successfully!');
    }, 1200);
  };

  const handleCreateCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(newCouponCode || '').trim()) return;
    
    const codeUpper = (newCouponCode || '').trim().toUpperCase();
    
    fetch('/api/admin/coupons', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        code: codeUpper,
        discount: Number(newCouponDiscount),
        minOrder: Number(newCouponMinOrder),
        type: newCouponDiscountType,
        campaignType: newCouponCampaignType,
        maxRedemptions: newCouponMaxRedemptions !== '' ? Number(newCouponMaxRedemptions) : null,
        maxPerCustomer: newCouponMaxPerCustomer === 'Unlimited' ? null : Number(newCouponMaxPerCustomer),
        startDate: newCouponStartDate || null,
        expiry: newCouponExpiry || '2026-12-31',
        status: newCouponStatus,
        campaignName: newCouponCampaignName || '',
        igPostUrl: newCouponIgPostUrl || '',
        igReelUrl: newCouponIgReelUrl || '',
        igStoryLink: newCouponIgStoryLink || '',
        campaignNotes: newCouponCampaignNotes || '',
        internalDescription: newCouponInternalDescription || ''
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success && Array.isArray(data.coupons)) {
        setCoupons(data.coupons);
        setNewCouponCode('');
        setNewCouponCampaignName('');
        setNewCouponIgPostUrl('');
        setNewCouponIgReelUrl('');
        setNewCouponIgStoryLink('');
        setNewCouponCampaignNotes('');
        setNewCouponInternalDescription('');
        setNewCouponMaxRedemptions('');
        setNewCouponMaxPerCustomer('Unlimited');
        setNewCouponStartDate('');
        setNewCouponExpiry('');
        setAdminSuccess(`Campaign Coupon ${codeUpper} deployed successfully on the server! ✨`);
        fetchCouponAnalytics();
      } else if (data.error) {
        setAdminError(data.error);
      }
    })
    .catch(e => setAdminError('Error deploying coupon: ' + e));
  };

  const handleRemoveCoupon = (code: string) => {
    const codeUpper = code.trim().toUpperCase();
    fetch(`/api/admin/coupons/${codeUpper}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    })
    .then(res => res.json())
    .then(data => {
      if (data.success && Array.isArray(data.coupons)) {
        setCoupons(data.coupons);
        setAdminSuccess(`Coupon ${codeUpper} removed from the database.`);
        fetchCouponAnalytics();
      }
    })
    .catch(e => setAdminError('Error removing coupon: ' + e));
  };

  // PASSWORD RESET REQUEST ADMIN ACTIONS
  const handleViewResetRequest = async (requestId: string) => {
    try {
      const res = await fetch(`/api/admin/password-resets/${requestId}/view`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedReset(data.request);
        fetchPasswordResets();
      }
    } catch (e) {
      console.error('Error recording admin view', e);
    }
  };

  const handleApproveResetRequest = async (requestId: string) => {
    const finalPassword = passwordGenMode === 'auto' ? generatedTempPass : customTempPass;
    if (!finalPassword || finalPassword.length < 6) {
      setAdminError('Please provide a secure temporary password of at least 6 characters.');
      return;
    }

    try {
      const res = await fetch(`/api/admin/password-resets/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempPassword: finalPassword })
      });
      if (res.ok) {
        setAdminSuccess('Password reset request approved successfully. Temporary password issued.');
        setShowApproveModal(false);
        setSelectedReset(null);
        fetchPasswordResets();
      } else {
        const errData = await res.json();
        setAdminError(errData.error || 'Failed to approve request.');
      }
    } catch (err) {
      setAdminError('Connection error while approving reset.');
    }
  };

  const handleRejectResetRequest = async (requestId: string) => {
    try {
      const res = await fetch(`/api/admin/password-resets/${requestId}/reject`, {
        method: 'POST'
      });
      if (res.ok) {
        setAdminSuccess('Password reset request rejected successfully.');
        setSelectedReset(null);
        fetchPasswordResets();
      } else {
        const errData = await res.json();
        setAdminError(errData.error || 'Failed to reject request.');
      }
    } catch (err) {
      setAdminError('Connection error while rejecting reset.');
    }
  };

  const handleInitiateRazorpayRefund = async (orderId: string, amount: number) => {
    if (!confirm(`Are you sure you want to issue an online Razorpay refund of ₹${amount} for order #${orderId}?`)) return;
    try {
      const res = await fetch('/api/payments/razorpay/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, amount, reason: 'Admin initiated refund from Admin Panel' })
      });
      const data = await res.json();
      if (data.success) {
        setAdminSuccess(`Razorpay Refund of ₹${amount} initiated successfully! Refund ID: ${data.refund?.id || 'Processed'}`);
        if (onUpdateOrderPaymentStatus) {
          onUpdateOrderPaymentStatus(orderId, 'Failed', 'Razorpay Refunded by Admin');
        }
        fetchDbTables();
      } else {
        setAdminError(data.error || 'Failed to process Razorpay refund.');
      }
    } catch (err: any) {
      setAdminError('Error processing Razorpay refund: ' + err.message);
    }
  };

  const orderStatuses = ['processing', 'confirmed', 'packing', 'dispatched', 'delivered', 'cancelled'];

  return (
    <div className="fixed inset-0 z-550 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

      {/* Custom Confirmation Modal Overlay */}
      <AnimatePresence>
        {pendingConfirmAction && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setPendingConfirmAction(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-sm rounded-3xl bg-[var(--card)] border border-[var(--border)] p-6 shadow-2xl z-10 space-y-4"
            >
              <h3 className="text-sm font-black text-[var(--fg)] flex items-center gap-2">
                <span>⚠️</span>
                <span>Confirm Action</span>
              </h3>
              <p className="text-xs text-[var(--muted-fg)] leading-relaxed font-semibold">{pendingConfirmAction.message}</p>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setPendingConfirmAction(null)}
                  className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--muted-fg)] hover:bg-[var(--muted)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    pendingConfirmAction.onConfirm();
                    setPendingConfirmAction(null);
                  }}
                  className="rounded-full bg-rose-500 hover:bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm cursor-pointer"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Window container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-[960px] rounded-3xl bg-[var(--card)] border border-[var(--border)] shadow-2xl overflow-hidden z-10 flex flex-col h-[85vh]"
      >
        {/* Floating Top Status Toast */}
        <AnimatePresence>
          {(adminSuccess || adminError) && (
            <motion.div
              initial={{ opacity: 0, y: -40, x: '-50%' }}
              animate={{ opacity: 1, y: 16, x: '-50%' }}
              exit={{ opacity: 0, y: -40, x: '-50%' }}
              className={`absolute top-0 left-1/2 z-[999] flex items-center gap-2 px-5 py-2.5 rounded-full shadow-lg border text-[11px] font-bold max-w-[90%] whitespace-nowrap overflow-hidden backdrop-blur-md ${
                adminSuccess
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
              }`}
            >
              <span>{adminSuccess ? '✅' : '⚠️'}</span>
              <span className="truncate max-w-[280px] md:max-w-[450px]">{adminSuccess || adminError}</span>
              <button
                onClick={() => {
                  setAdminSuccess(null);
                  setAdminError(null);
                }}
                className="ml-2 hover:opacity-80 p-0.5 cursor-pointer"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Header bar */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)] bg-gray-50 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔧</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-extrabold text-[var(--fg)]">Sabjies Control Center</h2>
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black border transition-all ${isRealtimeConnected ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' : 'bg-amber-500/10 text-amber-600 border-amber-500/30'}`}>
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isRealtimeConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${isRealtimeConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                  </span>
                  <span>{isRealtimeConnected ? 'Supabase Realtime Live' : 'Connecting Realtime...'}</span>
                </div>
              </div>
              <p className="text-[10px] text-[var(--muted-fg)]">
                {realtimeNotification || 'Manage inventory, monitor analytics, track orders in real-time'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted-fg)] hover:text-red-500 hover:border-red-200 transition-all shadow-sm"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sidebar + Main Body row */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Left Vertical Menu - Custom Sleek Theme */}
          <aside className="w-full md:w-56 bg-emerald-950 flex flex-row md:flex-col border-b md:border-b-0 md:border-r border-emerald-800 shrink-0 text-white overflow-x-auto md:overflow-y-auto no-scrollbar">
            <div className="p-4 border-b border-emerald-900/50 hidden md:block">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-black text-sm">S</div>
                <span className="text-emerald-50 font-extrabold text-sm tracking-tight">GreenSabjies</span>
              </div>
              <div className="mt-1 text-[8px] text-emerald-400 uppercase tracking-widest font-semibold">Admin Terminal</div>
            </div>

            <nav className="flex flex-row md:flex-col flex-1 p-2 md:p-3 gap-1 md:space-y-1 overflow-x-auto md:overflow-x-visible no-scrollbar shrink-0 min-w-max md:min-w-0">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                <span>Dashboard</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'analytics'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <DollarSign className="h-3.5 w-3.5 shrink-0" />
                <span>Sales Analytics</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('orders')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'orders'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
                <span>Orders</span>
                {orders.filter((o) => o.status === 'processing').length > 0 && (
                  <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] font-black text-white">
                    {orders.filter((o) => o.status === 'processing').length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('riders')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'riders'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <Map className="h-3.5 w-3.5 shrink-0" />
                <span>Riders Live</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('products')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'products'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <Package className="h-3.5 w-3.5 shrink-0" />
                <span>Products</span>
                {lowStockCount > 0 && (
                  <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[8px] font-black text-white">
                    {lowStockCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('restock')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'restock'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin-slow" />
                <span>Auto-Restock</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('coupons')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'coupons'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <Percent className="h-3.5 w-3.5 shrink-0" />
                <span>Coupons</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'users'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <Users className="h-3.5 w-3.5 shrink-0" />
                <span>Users</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('offers')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'offers'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <Tag className="h-3.5 w-3.5 shrink-0" />
                <span>Offers Promo</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('reviews')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'reviews'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <span>Reviews</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('payment-settings')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'payment-settings'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <Settings className="h-3.5 w-3.5 shrink-0" />
                <span>Payment Settings</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('categories')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'categories'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <Layers className="h-3.5 w-3.5 shrink-0" />
                <span>Categories (CRUD)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'notifications'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <Bell className="h-3.5 w-3.5 shrink-0" />
                <span>System Notifications</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('password-resets')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'password-resets'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <Key className="h-3.5 w-3.5 shrink-0" />
                <span>Password Resets</span>
                {passwordResets.filter(r => r.status === 'Pending').length > 0 && (
                  <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] font-black text-white animate-pulse shrink-0">
                    {passwordResets.filter(r => r.status === 'Pending').length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('reports')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'reports'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span>Business Reports</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'settings'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <Sliders className="h-3.5 w-3.5 shrink-0" />
                <span>Store Settings</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('activity-logs')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'activity-logs'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <Activity className="h-3.5 w-3.5 shrink-0" />
                <span>Audit Activity Logs</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('database')}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all ${
                  activeTab === 'database'
                    ? 'bg-emerald-800/60 text-emerald-50 border border-emerald-700/50 shadow-sm'
                    : 'text-emerald-400 hover:bg-emerald-900/50 hover:text-emerald-100'
                }`}
              >
                <Database className="h-3.5 w-3.5 shrink-0" />
                <span>Master Database</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isConfirmingLogout) {
                    onClose();
                    onLogout();
                  } else {
                    setIsConfirmingLogout(true);
                    setTimeout(() => {
                      setIsConfirmingLogout(false);
                    }, 4000);
                  }
                }}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 md:py-2 text-[11px] font-bold transition-all cursor-pointer mt-4 border ${
                  isConfirmingLogout
                    ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
                    : 'text-rose-300 hover:bg-rose-950/40 hover:text-rose-100 border-rose-900/50'
                }`}
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                <span>{isConfirmingLogout ? 'Confirm Logout?' : 'Sign Out'}</span>
              </button>
            </nav>

            <div className="p-3 border-t border-emerald-900/50 bg-emerald-950 mt-auto hidden md:block">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                <span className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider">Encrypted Session</span>
              </div>
              <div className="text-[9px] text-emerald-500 truncate font-mono">greensabjies@gmail.com</div>
            </div>
          </aside>

          {/* Right Main Panel Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-[var(--card)]">
            <AnimatePresence mode="wait">
              {/* 1. DASHBOARD VIEW */}
              {activeTab === 'dashboard' && (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-[var(--fg)]">📊 Master Business Analytics</h3>
                    {passwordResets.filter(r => r.status === 'Pending').length > 0 && (
                      <span className="px-2.5 py-1 bg-red-100 text-red-800 text-[10px] font-black rounded-full animate-bounce">
                        ⚠️ {passwordResets.filter(r => r.status === 'Pending').length} Pending Password Resets
                      </span>
                    )}
                  </div>

                  {/* Step 2 Notification banners */}
                  {passwordResets.filter(r => r.status === 'Pending').map((request) => (
                    <motion.div
                      key={request.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 rounded-xl text-amber-700 shrink-0">
                          <ShieldAlert className="h-5 w-5 animate-pulse" />
                        </div>
                        <div>
                          <strong className="text-xs font-black text-amber-900 block uppercase tracking-wider">🔔 New Password Reset Request</strong>
                          <p className="text-xs font-bold text-amber-800">
                            "{request.name} has requested a password reset."
                          </p>
                          <div className="text-[10px] text-amber-600 space-y-0.5 mt-1 font-medium">
                            <div><span className="font-bold">Email:</span> {request.email}</div>
                            <div><span className="font-bold">Mobile:</span> {request.mobileNumber}</div>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setActiveTab('password-resets');
                          handleViewResetRequest(request.id);
                        }}
                        className="w-full sm:w-auto px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white font-black rounded-xl text-xs shadow-sm transition-all cursor-pointer shrink-0"
                      >
                        Review Request
                      </button>
                    </motion.div>
                  ))}

                  {/* Summary grid */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-center">
                      <span className="text-[10px] font-bold text-[var(--muted-fg)] block uppercase">Revenue</span>
                      <strong className="text-lg font-black text-[var(--primary)] block mt-1">₹{totalRevenue}</strong>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-center">
                      <span className="text-[10px] font-bold text-[var(--muted-fg)] block uppercase">Net Profit</span>
                      <strong className="text-lg font-black text-emerald-600 block mt-1">₹{profit}</strong>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-center">
                      <span className="text-[10px] font-bold text-[var(--muted-fg)] block uppercase">All Orders</span>
                      <strong className="text-lg font-black text-[var(--fg)] block mt-1">{orders.length}</strong>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-center">
                      <span className="text-[10px] font-bold text-[var(--muted-fg)] block uppercase">Customers</span>
                      <strong className="text-lg font-black text-[var(--fg)] block mt-1">{users.length}</strong>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-center">
                      <span className="text-[10px] font-bold text-[var(--muted-fg)] block uppercase">Out Of Stock</span>
                      <strong className="text-lg font-black text-red-500 block mt-1">{oosCount}</strong>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-center">
                      <span className="text-[10px] font-bold text-[var(--muted-fg)] block uppercase">Low Stock</span>
                      <strong className="text-lg font-black text-amber-500 block mt-1">{lowStockCount}</strong>
                    </div>
                    <div
                      onClick={() => setActiveTab('password-resets')}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-center cursor-pointer hover:border-red-500 transition-all group"
                    >
                      <span className="text-[10px] font-bold text-[var(--muted-fg)] block uppercase group-hover:text-red-500">Resets Pending</span>
                      <strong className="text-lg font-black text-red-500 block mt-1">
                        {passwordResets.filter(r => r.status === 'Pending').length}
                      </strong>
                    </div>
                  </div>

                  {/* Charts row */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* Revenue Trend Area Chart */}
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-3 shadow-sm">
                      <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider">📈 Revenue Trend Analysis</h4>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={revenueTrendData}>
                            <defs>
                              <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                            <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                            <Area type="monotone" dataKey="Sales" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Section-Wise Sales analysis */}
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-3 shadow-sm">
                      <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider">🥦 Section-Wise (Category) Revenue</h4>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={categorySalesData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                            <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                            <Bar dataKey="Sales" radius={[6, 6, 0, 0]}>
                              {categorySalesData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* 1.5. SALES ANALYTICS VIEW */}
              {activeTab === 'analytics' && (
                <motion.div
                  key="analytics"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6 animate-fade-in"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
                    <div>
                      <h3 className="text-sm font-black text-[var(--fg)] flex items-center gap-1.5">
                        📈 Business Intelligence Cockpit
                      </h3>
                      <p className="text-[10px] text-[var(--muted-fg)]">Dynamic analytics compiled directly from database records</p>
                    </div>

                    {/* Sub-tab selection row */}
                    <div className="flex flex-wrap gap-1 bg-gray-100 dark:bg-zinc-800 p-1 rounded-xl text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => setAnalyticsSubTab('sales')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                          analyticsSubTab === 'sales'
                            ? 'bg-white dark:bg-zinc-700 text-[var(--fg)] shadow-sm'
                            : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
                        }`}
                      >
                        📊 Sales Trends
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnalyticsSubTab('revenue')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                          analyticsSubTab === 'revenue'
                            ? 'bg-white dark:bg-zinc-700 text-[var(--fg)] shadow-sm'
                            : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
                        }`}
                      >
                        💰 Profit &amp; Tax
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnalyticsSubTab('customers')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                          analyticsSubTab === 'customers'
                            ? 'bg-white dark:bg-zinc-700 text-[var(--fg)] shadow-sm'
                            : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
                        }`}
                      >
                        👥 Customers
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnalyticsSubTab('products')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                          analyticsSubTab === 'products'
                            ? 'bg-white dark:bg-zinc-700 text-[var(--fg)] shadow-sm'
                            : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
                        }`}
                      >
                        🥦 Products
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnalyticsSubTab('forecast')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                          analyticsSubTab === 'forecast'
                            ? 'bg-white dark:bg-zinc-700 text-[var(--fg)] shadow-sm'
                            : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
                        }`}
                      >
                        🔮 Forecast
                      </button>
                    </div>
                  </div>

                  {/* SUBTAB 1: SALES & TRENDS */}
                  {analyticsSubTab === 'sales' && (
                    <div className="space-y-6">
                      {/* Interval Sales Aggregates */}
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-sm">
                          <span className="text-[9px] font-bold text-[var(--muted-fg)] block uppercase tracking-wider">Today's Sales</span>
                          <strong className="text-base font-black text-[var(--primary)] block mt-1">
                            ₹{orders
                              .filter(o => o.status !== 'cancelled' && new Date(o.createdAt).toDateString() === new Date().toDateString())
                              .reduce((sum, o) => sum + o.total, 0)}
                          </strong>
                          <span className="text-[8px] text-[var(--muted-fg)] block mt-0.5">Live current-day bookings</span>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-sm">
                          <span className="text-[9px] font-bold text-[var(--muted-fg)] block uppercase tracking-wider">Weekly Sales (7D)</span>
                          <strong className="text-base font-black text-emerald-600 block mt-1">
                            ₹{orders
                              .filter(o => o.status !== 'cancelled' && Date.now() - new Date(o.createdAt).getTime() <= 7 * 86400000)
                              .reduce((sum, o) => sum + o.total, 0)}
                          </strong>
                          <span className="text-[8px] text-emerald-600 block mt-0.5">Moving 7 days volume</span>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-sm">
                          <span className="text-[9px] font-bold text-[var(--muted-fg)] block uppercase tracking-wider">Monthly Sales (30D)</span>
                          <strong className="text-base font-black text-[var(--fg)] block mt-1">
                            ₹{orders
                              .filter(o => o.status !== 'cancelled' && Date.now() - new Date(o.createdAt).getTime() <= 30 * 86400000)
                              .reduce((sum, o) => sum + o.total, 0)}
                          </strong>
                          <span className="text-[8px] text-[var(--muted-fg)] block mt-0.5">Fiscal 30 days window</span>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-sm">
                          <span className="text-[9px] font-bold text-[var(--muted-fg)] block uppercase tracking-wider">Yearly Sales (365D)</span>
                          <strong className="text-base font-black text-[var(--fg)] block mt-1">
                            ₹{orders
                              .filter(o => o.status !== 'cancelled')
                              .reduce((sum, o) => sum + o.total, 0)}
                          </strong>
                          <span className="text-[8px] text-[var(--muted-fg)] block mt-0.5">Accumulated annual revenue</span>
                        </div>
                      </div>

                      {/* Charts Row */}
                      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-3 shadow-sm">
                          <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider">📈 Daily Revenue Timeline (₹)</h4>
                          <div className="h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={salesTrendData}>
                                <defs>
                                  <linearGradient id="salesSubTabSales" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                                <Tooltip formatter={(value) => [`₹${value}`, 'Revenue']} contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#salesSubTabSales)" />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-3 shadow-sm">
                          <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider">📦 Dispatch Volumes (Counts)</h4>
                          <div className="h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={salesTrendData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                                <Tooltip formatter={(value) => [`${value} Orders`, 'Volume']} contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                                <Bar dataKey="volume" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>

                      {/* Tabular breakdowns */}
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                        <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider mb-3">📅 Daily Performance Audit</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-[var(--border)] text-[var(--muted-fg)] font-bold text-[10px] uppercase">
                                <th className="pb-2">Calendar Date</th>
                                <th className="pb-2">Gross Revenue</th>
                                <th className="pb-2">Dispatches Placed</th>
                                <th className="pb-2">AOV (Ticket Average)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                              {salesTrendData.slice().reverse().map((row) => (
                                <tr key={row.date} className="hover:bg-gray-50/50 dark:hover:bg-zinc-900/40">
                                  <td className="py-2 text-[var(--fg)] font-bold">{row.date}</td>
                                  <td className="py-2 text-emerald-600 font-extrabold">₹{row.revenue}</td>
                                  <td className="py-2 text-[var(--fg)] font-medium">{row.volume} orders</td>
                                  <td className="py-2 text-[var(--muted-fg)] font-mono">
                                    ₹{row.volume > 0 ? Math.round(row.revenue / row.volume) : 0}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUBTAB 2: REVENUE & PROFITABILITY */}
                  {analyticsSubTab === 'revenue' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-center">
                          <span className="text-[9px] font-bold text-[var(--muted-fg)] block uppercase">Gross Sales</span>
                          <strong className="text-base font-black text-[var(--fg)] block mt-1">₹{totalRevenue}</strong>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-center">
                          <span className="text-[9px] font-bold text-[var(--muted-fg)] block uppercase">Product COGS</span>
                          <strong className="text-base font-black text-rose-500 block mt-1">₹{totalCost}</strong>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-center">
                          <span className="text-[9px] font-bold text-[var(--muted-fg)] block uppercase">Net Profit</span>
                          <strong className="text-base font-black text-emerald-600 block mt-1">₹{profit}</strong>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-center">
                          <span className="text-[9px] font-bold text-[var(--muted-fg)] block uppercase">GST Liability</span>
                          <strong className="text-base font-black text-amber-600 block mt-1">
                            ₹{Math.round(totalRevenue * ((shopSettings.gstPercentage || 5) / 100))}
                          </strong>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-center">
                          <span className="text-[9px] font-bold text-[var(--muted-fg)] block uppercase">Delivery Fees</span>
                          <strong className="text-base font-black text-blue-600 block mt-1">
                            ₹{orders.filter(o => o.status !== 'cancelled' && o.deliveryCharge > 0).reduce((sum, o) => sum + o.deliveryCharge, 0)}
                          </strong>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-center">
                          <span className="text-[9px] font-bold text-[var(--muted-fg)] block uppercase">Net Margins</span>
                          <strong className="text-base font-black text-emerald-600 block mt-1">
                            {totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 0}%
                          </strong>
                        </div>
                      </div>

                      {/* Revenue breakdown matrix table */}
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                        <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider mb-3">🧾 Transaction Ledger &amp; Tax Audit Sheets</h4>
                        <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-[var(--border)] text-[var(--muted-fg)] font-bold text-[10px] uppercase sticky top-0 bg-[var(--card)]">
                                <th className="pb-2">Order ID</th>
                                <th className="pb-2">Payment Mode</th>
                                <th className="pb-2">Gross Receipt</th>
                                <th className="pb-2">Coupons Discount</th>
                                <th className="pb-2">GST Component ({shopSettings.gstPercentage || 5}%)</th>
                                <th className="pb-2">Delivery Charge</th>
                                <th className="pb-2">Est. Profit</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                              {orders.slice().reverse().map((o) => {
                                const appliedDiscount = o.couponApplied ? (o.discountAmount || 0) : 0;
                                const gstTaxValue = Math.round((o.total - o.deliveryCharge) * ((shopSettings.gstPercentage || 5) / (100 + (shopSettings.gstPercentage || 5))));
                                const orderProfit = Math.round(o.total * 0.4); // Approx 40% margin

                                return (
                                  <tr key={o.id} className="hover:bg-gray-50/50 dark:hover:bg-zinc-900/40">
                                    <td className="py-2 font-mono font-bold text-gray-700 dark:text-gray-300">#{o.id}</td>
                                    <td className="py-2 text-[var(--muted-fg)]">{o.payment || 'Direct UPI'}</td>
                                    <td className="py-2 font-black text-[var(--fg)]">₹{o.total}</td>
                                    <td className="py-2 text-rose-500 font-medium">{appliedDiscount > 0 ? `-₹${appliedDiscount}` : '₹0'}</td>
                                    <td className="py-2 text-amber-600 font-mono">₹{gstTaxValue}</td>
                                    <td className="py-2 text-blue-500 font-mono">₹{o.deliveryCharge || 0}</td>
                                    <td className="py-2 text-emerald-600 font-extrabold">+₹{orderProfit}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUBTAB 3: CUSTOMER COHORT GROWTH */}
                  {analyticsSubTab === 'customers' && (
                    <div className="space-y-6">
                      {/* Customer cohorts summary */}
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-sm">
                          <span className="text-[9px] font-bold text-[var(--muted-fg)] block uppercase tracking-wider">Registered Users</span>
                          <strong className="text-base font-black text-[var(--fg)] block mt-1">{users.length} accounts</strong>
                          <span className="text-[8px] text-emerald-600 block mt-0.5">↑ Dynamic database pool</span>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-sm">
                          <span className="text-[9px] font-bold text-[var(--muted-fg)] block uppercase tracking-wider">Active Cohort (At least 1 Order)</span>
                          <strong className="text-base font-black text-emerald-600 block mt-1">
                            {users.filter(u => orders.some(o => o.userEmail === u.email || o.userId === u.id)).length} accounts
                          </strong>
                          <span className="text-[8px] text-[var(--muted-fg)] block mt-0.5">Active buyers</span>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-sm">
                          <span className="text-[9px] font-bold text-[var(--muted-fg)] block uppercase tracking-wider">Repeat Customer Base</span>
                          <strong className="text-base font-black text-emerald-600 block mt-1">
                            {users.filter(u => orders.filter(o => o.userEmail === u.email || o.userId === u.id).length > 1).length} accounts
                          </strong>
                          <span className="text-[8px] text-emerald-600 block mt-0.5">Retained loyalists</span>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-sm">
                          <span className="text-[9px] font-bold text-[var(--muted-fg)] block uppercase tracking-wider">Cohort Retention Rate</span>
                          <strong className="text-base font-black text-blue-600 block mt-1">
                            {users.length > 0
                              ? Math.round((users.filter(u => orders.filter(o => o.userEmail === u.email || o.userId === u.id).length > 1).length / users.length) * 100)
                              : 0}%
                          </strong>
                          <span className="text-[8px] text-[var(--muted-fg)] block mt-0.5">Returning purchases ratio</span>
                        </div>
                      </div>

                      {/* Top Spenders Leaderboard */}
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                        <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider mb-3">👑 Top Spenders &amp; Client Loyalty Rankings</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-[var(--border)] text-[var(--muted-fg)] font-bold text-[10px] uppercase">
                                <th className="pb-2">Customer Profile</th>
                                <th className="pb-2">Account email</th>
                                <th className="pb-2">Phone No</th>
                                <th className="pb-2">Orders Placed</th>
                                <th className="pb-2">Lifetime Investment</th>
                                <th className="pb-2">Account Role</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                              {users
                                .map((u) => {
                                  const userOrders = orders.filter(o => o.userEmail === u.email || o.userId === u.id);
                                  const totalSpent = userOrders.reduce((sum, o) => sum + o.total, 0);
                                  return { ...u, orderCount: userOrders.length, totalSpent };
                                })
                                .sort((a, b) => b.totalSpent - a.totalSpent)
                                .slice(0, 10)
                                .map((u) => (
                                  <tr key={u.id} className="hover:bg-gray-50/50 dark:hover:bg-zinc-900/40">
                                    <td className="py-2.5 font-bold text-[var(--fg)] flex items-center gap-1.5">
                                      <span className="text-sm">👤</span>
                                      {u.name || 'Anonymous client'}
                                    </td>
                                    <td className="py-2.5 text-[var(--muted-fg)] font-mono">{u.email}</td>
                                    <td className="py-2.5 text-[var(--muted-fg)] font-mono">{u.mobile || 'N/A'}</td>
                                    <td className="py-2.5 font-semibold text-[var(--fg)]">{u.orderCount} purchases</td>
                                    <td className="py-2.5 text-emerald-600 font-extrabold">₹{u.totalSpent}</td>
                                    <td className="py-2.5">
                                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                                        u.role === 'admin' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-gray-500/10 text-gray-600'
                                      }`}>
                                        {u.role || 'customer'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUBTAB 4: PRODUCT & CATEGORY MARKET SHARES */}
                  {analyticsSubTab === 'products' && (
                    <div className="space-y-6">
                      {/* Category distribution mapping */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-4">
                          <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider">🥦 Category Market Shares (Revenue Distribution)</h4>
                          <div className="space-y-3.5">
                            {CATEGORIES.filter(c => c.id !== 'all').map((cat, idx) => {
                              // Calculate dynamic revenue for this cat
                              const catOrdersSum = orders
                                .filter(o => o.status !== 'cancelled')
                                .reduce((acc, o) => {
                                  const orderCatSum = o.items.reduce((sum, item) => {
                                    const prod = products.find(p => p.id === item.id);
                                    if (prod && prod.cat === cat.id) {
                                      return sum + item.sp * item.qty;
                                    }
                                    return sum;
                                  }, 0);
                                  return acc + orderCatSum;
                                }, 0);
                              
                              const pct = totalRevenue > 0 ? Math.round((catOrdersSum / totalRevenue) * 100) : 20;

                              return (
                                <div key={cat.id} className="space-y-1">
                                  <div className="flex items-center justify-between text-[10px] font-bold text-[var(--fg)]">
                                    <span className="capitalize">{cat.emoji} {cat.label} Section</span>
                                    <span>₹{catOrdersSum} ({pct}%)</span>
                                  </div>
                                  <div className="w-full bg-gray-100 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all duration-500"
                                      style={{
                                        width: `${pct}%`,
                                        backgroundColor: COLORS[idx % COLORS.length]
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Top Products Volume Leaderboard */}
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-3">
                          <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider">📊 Top 5 Best Selling Fresh Items</h4>
                          <div className="divide-y divide-[var(--border)]">
                            {products
                              .map((p) => {
                                const qtySold = orders
                                  .filter(o => o.status !== 'cancelled')
                                  .reduce((sum, o) => {
                                    const orderItem = o.items.find(item => item.id === p.id);
                                    return sum + (orderItem ? orderItem.qty : 0);
                                  }, 0);
                                return { ...p, qtySold };
                              })
                              .sort((a, b) => b.qtySold - a.qtySold)
                              .slice(0, 5)
                              .map((p, index) => (
                                <div key={p.id} className="flex items-center justify-between py-2 text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-[10px] font-black text-emerald-700">
                                      #{index + 1}
                                    </span>
                                    <span className="text-[11px] font-bold text-[var(--fg)]">{p.emoji} {p.name}</span>
                                  </div>
                                  <div className="text-[10px] font-mono text-[var(--muted-fg)]">
                                    <strong className="text-[var(--fg)] font-black">{p.qtySold} kg</strong> sold • ₹{p.qtySold * p.sp} revenue
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUBTAB 5: PREDICTIVE SALES FORECASTING */}
                  {analyticsSubTab === 'forecast' && (
                    <div className="space-y-6">
                      <div className="rounded-2xl border border-emerald-800/40 bg-emerald-950/20 p-5 space-y-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">🔮</span>
                          <div>
                            <h4 className="text-xs font-black text-emerald-500 uppercase tracking-widest">Moving-Average Predictive Forecasting Engine</h4>
                            <p className="text-[10px] text-emerald-400">Apply seasonal festival coefficients to calculate dynamic inventory procurement forecasts and targeted revenues</p>
                          </div>
                        </div>

                        {/* Interactive Growth Slider */}
                        <div className="space-y-2 max-w-lg">
                          <div className="flex items-center justify-between text-[10px] font-bold text-emerald-400 uppercase">
                            <span>Festivals seasonal multiplier coefficient</span>
                            <span className="bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-300 border border-emerald-500/30 font-mono text-xs">
                              {forecastGrowthFactor.toFixed(2)}x Growth
                            </span>
                          </div>
                          <input
                            type="range"
                            min="1.0"
                            max="2.5"
                            step="0.05"
                            value={forecastGrowthFactor}
                            onChange={(e) => setForecastGrowthFactor(parseFloat(e.target.value))}
                            className="w-full accent-emerald-500 h-1.5 bg-emerald-950 rounded-lg cursor-pointer"
                          />
                          <p className="text-[9px] text-[var(--muted-fg)] italic">Defaults: 1.15x for Monsoons, 1.5x for Diwali/Ganesh Chaturthi, 2.0x for wedding peak weeks.</p>
                        </div>
                      </div>

                      {/* Forecast values grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-sm">
                          <span className="text-[9px] font-bold text-[var(--muted-fg)] block uppercase tracking-wider">7-Day Rolling Revenue Base</span>
                          <strong className="text-lg font-black text-[var(--fg)] block mt-1">
                            ₹{Math.round(totalRevenue / Math.max(1, Math.min(30, salesTrendData.length)))} / day
                          </strong>
                          <span className="text-[8px] text-[var(--muted-fg)] block mt-0.5">Calculated from dynamic billing days</span>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-sm">
                          <span className="text-[9px] font-bold text-[var(--muted-fg)] block uppercase tracking-wider">Projected Next-Week Sales (7D)</span>
                          <strong className="text-lg font-black text-emerald-600 block mt-1">
                            ₹{Math.round((totalRevenue / Math.max(1, Math.min(30, salesTrendData.length))) * 7 * forecastGrowthFactor)}
                          </strong>
                          <span className="text-[8px] text-emerald-600 block mt-0.5">Applied {forecastGrowthFactor.toFixed(2)}x factor model</span>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-sm">
                          <span className="text-[9px] font-bold text-[var(--muted-fg)] block uppercase tracking-wider">Projected Profit Model (7D)</span>
                          <strong className="text-lg font-black text-emerald-600 block mt-1">
                            ₹{Math.round(((totalRevenue / Math.max(1, Math.min(30, salesTrendData.length))) * 7 * forecastGrowthFactor) * (profit / Math.max(1, totalRevenue)))}
                          </strong>
                          <span className="text-[8px] text-[var(--muted-fg)] block mt-0.5">Retaining historical {totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 40}% profit margin</span>
                        </div>
                      </div>

                      {/* Predictive inventory chart */}
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-3">
                        <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider">🥕 APMC Procurement Restock Recommendations (Based on {forecastGrowthFactor.toFixed(2)}x Demand)</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-[var(--border)] text-[var(--muted-fg)] font-bold text-[10px] uppercase">
                                <th className="pb-2">Fresh Item</th>
                                <th className="pb-2">Category</th>
                                <th className="pb-2">Current Stock</th>
                                <th className="pb-2">Recommended Procurement order</th>
                                <th className="pb-2">Procurement cost (₹ CP)</th>
                                <th className="pb-2">Logistics status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                              {products.slice(0, 5).map((p) => {
                                const currentStock = p.stockQty;
                                const baseTargetStock = p.lowAt * 4;
                                const recommendedProcurementQty = Math.max(0, Math.round(baseTargetStock * forecastGrowthFactor - currentStock));
                                return (
                                  <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-zinc-900/40">
                                    <td className="py-2.5 font-bold text-[var(--fg)]">{p.emoji} {p.name}</td>
                                    <td className="py-2.5 capitalize text-[var(--muted-fg)]">{p.cat}</td>
                                    <td className="py-2.5 font-bold text-gray-800 dark:text-gray-200">{currentStock} kg</td>
                                    <td className="py-2.5 text-emerald-600 font-extrabold">{recommendedProcurementQty} kg restock</td>
                                    <td className="py-2.5 font-mono text-[var(--fg)]">₹{recommendedProcurementQty * p.cp}</td>
                                    <td className="py-2.5">
                                      <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase ${
                                        recommendedProcurementQty > 30 ? 'bg-rose-500/10 text-rose-600' : 'bg-emerald-500/10 text-emerald-600'
                                      }`}>
                                        {recommendedProcurementQty > 30 ? 'CRITICAL APMC PO' : 'NORMAL RESTOCK'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* 2. ORDERS LIST VIEW WITH STATUS CONTROLS */}
              {activeTab === 'orders' && (
                <motion.div
                  key="orders"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  <h3 className="text-sm font-black text-[var(--fg)]">📦 Active Delivery Logistics</h3>

                  <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-zinc-900 border-b border-[var(--border)] text-[var(--muted-fg)] uppercase tracking-wider text-[10px] font-bold">
                          <th className="p-3">Order ID</th>
                          <th className="p-3">Customer</th>
                          <th className="p-3">Products</th>
                          <th className="p-3">Total Cost</th>
                          <th className="p-3">Payment Info</th>
                          <th className="p-3">Invoice & Logistics</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {orders.slice().reverse().map((o) => (
                          <tr key={o.id} className="hover:bg-gray-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                            <td className="p-3 font-extrabold text-[var(--primary)]">#{o.id}</td>
                            <td className="p-3 max-w-[130px]">
                              <div className="font-bold text-[var(--fg)] truncate">{o.userName || 'Customer'}</div>
                              <div className="text-[10px] text-[var(--muted-fg)] truncate">{o.userEmail}</div>
                              {o.phone && <div className="text-[10px] text-[var(--muted-fg)]">{o.phone}</div>}
                            </td>
                            <td className="p-3 max-w-[150px] truncate text-[var(--muted-fg)]">
                              {(o.items || []).map((it: any) => {
                                const raw = it.name || it.productName || it.title || it.itemName || 'Product';
                                const clean = (raw === '()' || raw === '( )') ? 'Product' : raw;
                                return `${clean} ×${it.qty || 1}`;
                              }).join(', ')}
                            </td>
                            <td className="p-3 font-bold text-[var(--fg)]">₹{o.total}</td>
                            <td className="p-3 space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold uppercase text-[var(--fg)]">{o.paymentGateway === 'razorpay' || o.razorpayPaymentId ? 'Razorpay Online' : o.payment}</span>
                                <span className={`text-[9px] px-2 py-0.5 rounded-full font-extrabold uppercase ${
                                  o.paymentStatus === 'Paid' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' :
                                  o.paymentStatus === 'Pending' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' :
                                  'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
                                }`}>
                                  {o.paymentStatus || 'Paid'}
                                </span>
                              </div>
                              {o.razorpayPaymentId && (
                                <div className="text-[9px] text-emerald-700 dark:text-emerald-400 font-mono font-bold truncate max-w-[150px]" title={o.razorpayPaymentId}>
                                  Pay ID: {o.razorpayPaymentId}
                                </div>
                              )}
                              <div className="text-[9px] text-[var(--muted-fg)] font-mono truncate max-w-[140px]" title={o.transactionId || o.razorpayOrderId}>
                                Txn: {o.transactionId || o.razorpayOrderId || 'N/A'}
                              </div>

                              {(o.razorpayPaymentId || o.paymentGateway === 'razorpay' || (o.payment || '').toLowerCase().includes('razorpay')) && o.paymentStatus === 'Paid' && (
                                <div className="pt-1">
                                  <button
                                    type="button"
                                    onClick={() => handleInitiateRazorpayRefund(o.id, o.total)}
                                    className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/30 text-[9px] font-black transition-all cursor-pointer"
                                  >
                                    💸 Issue Refund
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="p-3 space-y-2">
                              <select
                                value={o.status}
                                onChange={(e) => onUpdateOrderStatus(o.id, e.target.value as any)}
                                className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-1.5 text-[11px] font-bold text-[var(--fg)] outline-none w-full"
                              >
                                {orderStatuses.map((st) => (
                                  <option key={st} value={st}>
                                    {st.toUpperCase()}
                                  </option>
                                ))}
                              </select>

                              <button
                                type="button"
                                onClick={() => setSelectedInvoiceOrder(o)}
                                className="flex items-center justify-center gap-1.5 w-full px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--muted)] text-[10px] font-bold text-[var(--primary)] hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-all cursor-pointer"
                              >
                                <Printer className="h-3 w-3" />
                                <span>View / Print Invoice</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                        {orders.length === 0 && (
                          <tr>
                            <td colSpan={7} className="text-center p-8 text-[var(--muted-fg)] italic">
                              No customer orders recorded yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}

              {/* 3. PRODUCTS MANAGEMENT VIEW */}
              {activeTab === 'products' && (
                <motion.div
                  key="products"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-[var(--fg)]">🥦 Catalog & Stock Logistics</h3>
                    <button
                      onClick={() => setShowAddProduct(!showAddProduct)}
                      className="rounded-full bg-[var(--primary)] text-white px-4 py-2 text-xs font-bold flex items-center gap-1.5 hover:opacity-95 shadow-sm"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Create New Vegetable</span>
                    </button>
                  </div>

                  {/* Add Product form slider */}
                  <AnimatePresence>
                    {showAddProduct && (
                      <motion.form
                        onSubmit={handleAddProductSubmit}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-5 grid grid-cols-1 gap-4 sm:grid-cols-3 overflow-hidden"
                      >
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Veg Name *</label>
                          <input
                            type="text"
                            required
                            value={newProdName || ''}
                            onChange={(e) => setNewProdName(e.target.value)}
                            placeholder="e.g., Organic Lemon"
                            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4.5 py-2 text-xs text-[var(--fg)] outline-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Category *</label>
                            <button
                              type="button"
                              onClick={() => {
                                setCategoryTargetForm('add');
                                setCustomCategoryError(null);
                                setShowCreateCategoryModal(true);
                              }}
                              className="text-[10px] font-bold text-[var(--primary)] hover:underline cursor-pointer flex items-center gap-0.5"
                            >
                              <Plus className="h-3 w-3" />
                              <span>+ New Category</span>
                            </button>
                          </div>
                          <select
                            value={newProdCat}
                            onChange={(e) => {
                              if (e.target.value === '__CREATE_CUSTOM__') {
                                setCategoryTargetForm('add');
                                setCustomCategoryError(null);
                                setShowCreateCategoryModal(true);
                              } else {
                                setNewProdCat(e.target.value);
                              }
                            }}
                            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4.5 py-2 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                          >
                            {categoriesList.filter((c) => c.id !== 'all').map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.emoji} {c.label}
                              </option>
                            ))}
                            <option value="__CREATE_CUSTOM__" className="font-bold text-[var(--primary)] bg-emerald-50 dark:bg-emerald-950">
                              ➕ + Create Custom Category...
                            </option>
                          </select>
                        </div>

                        {/* Inline Create Custom Category for Add Product */}
                        {showCreateCategoryModal && categoryTargetForm === 'add' && (
                          <div className="sm:col-span-3 rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/30 p-4 space-y-3 shadow-sm">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--primary)] text-white text-xs font-black">
                                  +
                                </span>
                                <h4 className="text-xs font-black text-[var(--fg)]">Create New Custom Category</h4>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowCreateCategoryModal(false);
                                  setCustomCategoryError(null);
                                }}
                                className="text-xs font-bold text-[var(--muted-fg)] hover:text-[var(--fg)]"
                              >
                                ✕
                              </button>
                            </div>

                            {customCategoryError && (
                              <div className="rounded-xl bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-800 p-2.5 text-xs text-red-700 dark:text-red-300 font-semibold flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                                <span>{customCategoryError}</span>
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                              <div className="sm:col-span-1 flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Emoji</label>
                                <input
                                  type="text"
                                  value={customCategoryEmoji}
                                  onChange={(e) => setCustomCategoryEmoji(e.target.value)}
                                  maxLength={4}
                                  className="text-center text-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 outline-none"
                                  placeholder="🥦"
                                />
                              </div>

                              <div className="sm:col-span-3 flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">New Category Name *</label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={customCategoryName}
                                    onChange={(e) => {
                                      setCustomCategoryName(e.target.value);
                                      if (customCategoryError) setCustomCategoryError(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSaveCustomCategory('add');
                                      }
                                    }}
                                    placeholder="e.g. Exotic Herbs, Microgreens, Dry Fruits"
                                    className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    disabled={isSavingCategory || !customCategoryName.trim()}
                                    onClick={() => handleSaveCustomCategory('add')}
                                    className="rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-sm"
                                  >
                                    {isSavingCategory ? (
                                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    )}
                                    <span>Save & Select</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Type Class</label>
                          <select
                            value={newProdType}
                            onChange={(e) => setNewProdType(e.target.value)}
                            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4.5 py-2 text-xs text-[var(--fg)] outline-none"
                          >
                            <option value="all">Standard Catalog</option>
                            <option value="organic">100% Certified Organic</option>
                            <option value="deal">Daily Fresh Deals</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Cost Price (CP)</label>
                          <input
                            type="number"
                            required
                            value={newProdCp}
                            onChange={(e) => setNewProdCp(Number(e.target.value))}
                            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4.5 py-2 text-xs text-[var(--fg)] outline-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Selling Price (SP)</label>
                          <input
                            type="number"
                            required
                            value={newProdSp}
                            onChange={(e) => setNewProdSp(Number(e.target.value))}
                            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4.5 py-2 text-xs text-[var(--fg)] outline-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Weight Metric</label>
                          <input
                            type="text"
                            required
                            value={newProdWeight || ''}
                            onChange={(e) => setNewProdWeight(e.target.value)}
                            placeholder="e.g. per kg or 250g pack"
                            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4.5 py-2 text-xs text-[var(--fg)] outline-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Veg Emoji *</label>
                          <input
                            type="text"
                            required
                            value={newProdEmoji || ''}
                            onChange={(e) => setNewProdEmoji(e.target.value)}
                            placeholder="e.g. 🍋"
                            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4.5 py-2 text-xs text-[var(--fg)] outline-none text-center"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Initial Stock (Qty) *</label>
                          <input
                            type="number"
                            required
                            value={newProdStock}
                            onChange={(e) => setNewProdStock(Number(e.target.value))}
                            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4.5 py-2 text-xs text-[var(--fg)] outline-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5 sm:col-span-3">
                          <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Product Image (Enter URL or Upload from Device)</label>
                          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                            <input
                              type="text"
                              value={newProdImg || ''}
                              onChange={(e) => setNewProdImg(e.target.value)}
                              placeholder="https://images.unsplash.com/... or upload below"
                              className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4.5 py-2 text-xs text-[var(--fg)] outline-none"
                            />
                            <div className="flex items-center gap-2">
                              <label className="cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs font-bold text-[var(--fg)] hover:bg-[var(--muted)] transition-all flex items-center gap-2">
                                <span>📁 Upload Local File</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleImageFileChange}
                                  className="hidden"
                                />
                              </label>
                              {newProdImg && (
                                <div className="relative h-10 w-10 rounded-lg overflow-hidden border border-[var(--border)] shadow-sm bg-white flex-shrink-0">
                                  <img src={newProdImg} alt="Preview" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="sm:col-span-3 flex justify-end gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => setShowAddProduct(false)}
                            className="rounded-full border border-[var(--border)] bg-[var(--card)] px-5 py-2 text-xs font-bold text-[var(--muted-fg)]"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="rounded-full bg-[var(--primary)] px-6 py-2 text-xs font-bold text-white shadow"
                          >
                            Add to Catalog
                          </button>
                        </div>
                      </motion.form>
                    )}
                  </AnimatePresence>

                  {/* Products stock management grid list */}
                  <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                    {products.map((p) => {
                      const oos = p.stockQty === 0;
                      const low = p.stockQty > 0 && p.stockQty <= p.lowAt;

                      return (
                        <div
                          key={p.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-sm"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{p.emoji}</span>
                            <div>
                              <h4 className="text-xs font-bold text-[var(--fg)]">{p.name}</h4>
                              <p className="text-[10px] text-[var(--muted-fg)] mt-0.5">{p.weight}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            {/* Stock warnings */}
                            <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded ${
                              oos ? 'bg-red-100 text-red-700' : low ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {oos ? 'OOS' : `${p.stockQty} left`}
                            </span>

                            {/* Direct stock edit */}
                            <div className="flex items-center gap-1 text-[11px]">
                              <span className="text-[10px] font-bold text-[var(--muted-fg)]">Stock:</span>
                              <input
                                type="number"
                                min={0}
                                value={p.stockQty}
                                onChange={(e) => onUpdateProductStock(p.id, Number(e.target.value))}
                                className="w-[55px] rounded border border-[var(--border)] bg-[var(--bg)] p-1 text-center font-bold text-[var(--fg)]"
                              />
                            </div>

                            {/* Direct price edit */}
                            <div className="flex items-center gap-1 text-[11px]">
                              <span className="text-[10px] font-bold text-[var(--muted-fg)]">Price:</span>
                              <input
                                type="number"
                                min={1}
                                value={p.sp}
                                onChange={(e) => onUpdateProductPrice(p.id, Number(e.target.value))}
                                className="w-[55px] rounded border border-[var(--border)] bg-[var(--bg)] p-1 text-center font-bold text-[var(--primary)]"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setEditingProduct({ ...p });
                                setShowEditProductModal(true);
                                setShowCreateCategoryModal(false);
                                setCustomCategoryError(null);
                              }}
                              className="text-gray-400 hover:text-[var(--primary)] transition-colors cursor-pointer p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800"
                              title="Edit product details & category"
                            >
                              <Edit className="h-4 w-4" />
                            </button>

                            <button
                              onClick={() => {
                                setPendingConfirmAction({
                                  message: `Remove ${p.name} from public catalog?`,
                                  onConfirm: () => onRemoveProduct(p.id)
                                });
                              }}
                              className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800"
                              title="Delete product"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Edit Product Modal */}
                  {showEditProductModal && editingProduct && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                      <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
                      >
                        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl">{editingProduct.emoji}</span>
                            <div>
                              <h3 className="text-base font-black text-[var(--fg)]">Edit Product Details</h3>
                              <p className="text-[10px] text-[var(--muted-fg)]">Update name, pricing, category, or media for #{editingProduct.id}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setShowEditProductModal(false);
                              setEditingProduct(null);
                            }}
                            className="rounded-full p-1.5 text-[var(--muted-fg)] hover:bg-[var(--muted)]"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>

                        <form onSubmit={handleEditProductSubmit} className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Product Name *</label>
                              <input
                                type="text"
                                required
                                value={editingProduct.name}
                                onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                                className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Category *</label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCategoryTargetForm('edit');
                                    setCustomCategoryError(null);
                                    setShowCreateCategoryModal(true);
                                  }}
                                  className="text-[10px] font-bold text-[var(--primary)] hover:underline cursor-pointer flex items-center gap-0.5"
                                >
                                  <Plus className="h-3 w-3" />
                                  <span>+ New Category</span>
                                </button>
                              </div>
                              <select
                                value={editingProduct.cat}
                                onChange={(e) => {
                                  if (e.target.value === '__CREATE_CUSTOM__') {
                                    setCategoryTargetForm('edit');
                                    setCustomCategoryError(null);
                                    setShowCreateCategoryModal(true);
                                  } else {
                                    setEditingProduct({ ...editingProduct, cat: e.target.value });
                                  }
                                }}
                                className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                              >
                                {categoriesList.filter((c) => c.id !== 'all').map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.emoji} {c.label}
                                  </option>
                                ))}
                                <option value="__CREATE_CUSTOM__" className="font-bold text-[var(--primary)] bg-emerald-50 dark:bg-emerald-950">
                                  ➕ + Create Custom Category...
                                </option>
                              </select>
                            </div>
                          </div>

                          {/* Inline Create Custom Category inside Edit Product Modal */}
                          {showCreateCategoryModal && categoryTargetForm === 'edit' && (
                            <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/30 p-3.5 space-y-2.5 shadow-sm">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-[var(--primary)] text-white text-[10px] font-black">
                                    +
                                  </span>
                                  <h4 className="text-xs font-black text-[var(--fg)]">Create New Custom Category</h4>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowCreateCategoryModal(false);
                                    setCustomCategoryError(null);
                                  }}
                                  className="text-xs font-bold text-[var(--muted-fg)] hover:text-[var(--fg)]"
                                >
                                  ✕
                                </button>
                              </div>

                              {customCategoryError && (
                                <div className="rounded-xl bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-800 p-2 text-xs text-red-700 dark:text-red-300 font-semibold flex items-center gap-2">
                                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                                  <span>{customCategoryError}</span>
                                </div>
                              )}

                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                                <div className="sm:col-span-1 flex flex-col gap-1">
                                  <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">Emoji</label>
                                  <input
                                    type="text"
                                    value={customCategoryEmoji}
                                    onChange={(e) => setCustomCategoryEmoji(e.target.value)}
                                    maxLength={4}
                                    className="text-center text-base rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 outline-none"
                                    placeholder="🥦"
                                  />
                                </div>

                                <div className="sm:col-span-3 flex flex-col gap-1">
                                  <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">Category Name *</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={customCategoryName}
                                      onChange={(e) => {
                                        setCustomCategoryName(e.target.value);
                                        if (customCategoryError) setCustomCategoryError(null);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          handleSaveCustomCategory('edit');
                                        }
                                      }}
                                      placeholder="e.g. Organic Greens, Exotic Fruits"
                                      className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                                    />
                                    <button
                                      type="button"
                                      disabled={isSavingCategory || !customCategoryName.trim()}
                                      onClick={() => handleSaveCustomCategory('edit')}
                                      className="rounded-xl bg-[var(--primary)] px-3.5 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1 shadow-sm"
                                    >
                                      {isSavingCategory ? (
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <CheckCircle2 className="h-3 w-3" />
                                      )}
                                      <span>Save & Apply</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Cost Price (CP)</label>
                              <input
                                type="number"
                                required
                                value={editingProduct.cp}
                                onChange={(e) => setEditingProduct({ ...editingProduct, cp: Number(e.target.value) })}
                                className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--fg)] outline-none"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Selling Price (SP)</label>
                              <input
                                type="number"
                                required
                                value={editingProduct.sp}
                                onChange={(e) => setEditingProduct({ ...editingProduct, sp: Number(e.target.value) })}
                                className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--fg)] outline-none"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Stock (Qty)</label>
                              <input
                                type="number"
                                required
                                min={0}
                                value={editingProduct.stockQty}
                                onChange={(e) => setEditingProduct({ ...editingProduct, stockQty: Number(e.target.value) })}
                                className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--fg)] outline-none"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Weight Metric</label>
                              <input
                                type="text"
                                required
                                value={editingProduct.weight}
                                onChange={(e) => setEditingProduct({ ...editingProduct, weight: e.target.value })}
                                className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--fg)] outline-none"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Type Class</label>
                              <select
                                value={editingProduct.type}
                                onChange={(e) => setEditingProduct({ ...editingProduct, type: e.target.value })}
                                className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--fg)] outline-none"
                              >
                                <option value="all">Standard Catalog</option>
                                <option value="organic">100% Certified Organic</option>
                                <option value="deal">Daily Fresh Deals</option>
                              </select>
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Emoji</label>
                              <input
                                type="text"
                                value={editingProduct.emoji}
                                onChange={(e) => setEditingProduct({ ...editingProduct, emoji: e.target.value })}
                                className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--fg)] text-center outline-none"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Discount Tag</label>
                              <input
                                type="text"
                                value={editingProduct.discount || ''}
                                placeholder="e.g. -15%"
                                onChange={(e) => setEditingProduct({ ...editingProduct, discount: e.target.value })}
                                className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--fg)] outline-none"
                              />
                            </div>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Product Image URL</label>
                            <input
                              type="text"
                              value={editingProduct.img}
                              onChange={(e) => setEditingProduct({ ...editingProduct, img: e.target.value })}
                              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2 text-xs text-[var(--fg)] outline-none"
                            />
                          </div>

                          <div className="flex justify-end gap-2.5 pt-2 border-t border-[var(--border)]">
                            <button
                              type="button"
                              onClick={() => {
                                setShowEditProductModal(false);
                                setEditingProduct(null);
                              }}
                              className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--muted-fg)] hover:bg-[var(--muted)]"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="rounded-xl bg-[var(--primary)] px-5 py-2 text-xs font-bold text-white shadow hover:opacity-95"
                            >
                              Save Changes
                            </button>
                          </div>
                        </form>
                      </motion.div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* 4. USERS MANAGEMENT VIEW */}
              {activeTab === 'users' && (
                <motion.div
                  key="users"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-[var(--fg)] flex items-center gap-2">
                        <span>👥 Registered Accounts & Customers</span>
                        <span className="text-[10px] bg-[var(--primary)]/10 text-[var(--primary)] px-2 py-0.5 rounded-full font-extrabold">{users.length} Total</span>
                      </h3>
                      <p className="text-[11px] text-[var(--muted-fg)] mt-0.5">
                        Manage user accounts, inspect saved delivery addresses, and update security credentials securely.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-50/80 dark:bg-zinc-900/80 border-b border-[var(--border)] text-[var(--muted-fg)] uppercase tracking-wider text-[10px] font-bold">
                          <th className="p-3">Customer Name</th>
                          <th className="p-3">Email Address</th>
                          <th className="p-3">Contact</th>
                          <th className="p-3">🔑 Password</th>
                          <th className="p-3">📍 Saved Addresses</th>
                          <th className="p-3">Orders</th>
                          <th className="p-3">Joined Date</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {users.map((u) => {
                          const userOrders = orders.filter((o) => o.userId === u.id || o.userEmail === u.email);
                          return (
                            <tr key={u.id} className="hover:bg-gray-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                              <td className="p-3">
                                <div className="font-bold text-[var(--fg)] flex items-center gap-1.5">
                                  <span>{u.name}</span>
                                  {u.role === 'admin' && (
                                    <span className="text-[8px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black uppercase px-1.5 py-0.5 rounded">
                                      Admin
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-[var(--muted-fg)] font-mono text-[11px]">{u.email}</td>
                              <td className="p-3 text-[var(--muted-fg)] font-mono text-[11px]">{u.phone || '—'}</td>
                              <td className="p-3 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-300 dark:border-zinc-700 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider shadow-sm inline-block max-w-[150px] truncate">
                                    {visiblePasswords[u.id] ? (u.password || '••••••••') : '•••••••• (Encrypted)'}
                                  </span>
                                  <button
                                    onClick={() => setVisiblePasswords(prev => ({ ...prev, [u.id]: !prev[u.id] }))}
                                    className="p-1 text-[var(--muted-fg)] hover:text-[var(--fg)] hover:bg-[var(--muted)] rounded transition-colors cursor-pointer"
                                    title={visiblePasswords[u.id] ? "Hide Password / Hash" : "Show Stored Password / Hash"}
                                  >
                                    {visiblePasswords[u.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                                  </button>
                                </div>
                              </td>
                              <td className="p-3 max-w-[240px]">
                                {u.addresses && u.addresses.length > 0 ? (
                                  <div className="space-y-1">
                                    {u.addresses.map((addr, idx) => (
                                      <div key={idx} className="text-[10px] bg-[var(--muted)]/60 border border-[var(--border)] p-1.5 rounded-lg leading-tight">
                                        <span className="font-extrabold text-[var(--primary)] uppercase text-[9px] mr-1">[{addr.label}]</span>
                                        <span>{addr.flat}, {addr.street}, {addr.area} ({addr.pin}){addr.landmark ? ` — Near ${addr.landmark}` : ''}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : userOrders.length > 0 && userOrders[0].address ? (
                                  <div className="text-[10px] bg-[var(--muted)]/60 border border-[var(--border)] p-1.5 rounded-lg leading-tight">
                                    <span className="font-extrabold text-blue-600 uppercase text-[9px] mr-1">[Last Order]</span>
                                    <span>{userOrders[0].address}</span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-[var(--muted-fg)] italic">No saved address</span>
                                )}
                              </td>
                              <td className="p-3 font-semibold text-[var(--fg)]">
                                <span className="inline-flex items-center justify-center bg-[var(--muted)] px-2 py-0.5 rounded-full text-[11px] font-bold">
                                  {userOrders.length}
                                </span>
                              </td>
                              <td className="p-3 text-[var(--muted-fg)] whitespace-nowrap">
                                {u.joinedAt ? new Date(u.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                              </td>
                              <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                                <button
                                  onClick={() => {
                                    setEditingPasswordUser({ id: u.id, name: u.name, email: u.email });
                                    setNewPasswordInput('');
                                  }}
                                  className="rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/60 px-2.5 py-1 text-[10px] font-bold hover:bg-amber-500 hover:text-white transition-all shadow-sm cursor-pointer"
                                >
                                  🔑 Change Pass
                                </button>
                                {u.email !== 'greensabjies@gmail.com' ? (
                                  <button
                                    onClick={() => {
                                      setPendingConfirmAction({
                                        message: `Revoke membership and remove account for ${u.name}?`,
                                        onConfirm: () => onRemoveUser(u.id)
                                      });
                                    }}
                                    className="rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 px-2.5 py-1 text-[10px] font-bold hover:bg-red-500 hover:text-white transition-all shadow-sm cursor-pointer"
                                  >
                                    Revoke
                                  </button>
                                ) : (
                                  <span className="text-[9px] text-emerald-600 font-extrabold uppercase bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded">
                                    Owner
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* ADMIN EDIT USER PASSWORD MODAL */}
                  {editingPasswordUser && (
                    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                      <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl shadow-2xl p-6 max-w-md w-full space-y-4">
                        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                          <h3 className="text-sm font-extrabold text-[var(--fg)] flex items-center gap-2">
                            <span>🔑 Update User Password</span>
                          </h3>
                          <button onClick={() => setEditingPasswordUser(null)} className="text-xs font-bold text-[var(--muted-fg)] hover:text-[var(--fg)]">✕</button>
                        </div>
                        <div className="space-y-3">
                          <p className="text-xs text-[var(--muted-fg)] leading-relaxed">
                            Updating login password for <strong className="text-[var(--fg)]">{editingPasswordUser.name}</strong> ({editingPasswordUser.email}).
                          </p>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-wider text-[var(--muted-fg)]">New Password</label>
                            <input
                              type="text"
                              value={newPasswordInput}
                              onChange={(e) => setNewPasswordInput(e.target.value)}
                              placeholder="Enter new password"
                              className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] font-mono outline-none focus:border-[var(--primary)] font-bold tracking-wide"
                            />
                          </div>
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/50">
                            ⚡ Changes will immediately take effect in memory, local storage, and Supabase PostgreSQL.
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                          <button
                            onClick={() => setEditingPasswordUser(null)}
                            className="px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--muted-fg)] hover:bg-[var(--muted)] transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleAdminUpdatePassword}
                            className="px-5 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-bold shadow-md hover:opacity-90 transition-opacity"
                          >
                            Save New Password
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* RIDERS LIVE PANEL VIEW (Suggestion 2) */}
              {activeTab === 'riders' && (
                <motion.div
                  key="riders"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-black text-[var(--fg)]">🛵 Live Delivery Rider Dispatch & Zone Tracking</h3>
                      <p className="text-[10px] text-[var(--muted-fg)]">Ghatkopar active fleet tracking and live coordinate movement telemetry</p>
                    </div>
                    <button
                      type="button"
                      onClick={simulateGps}
                      className="rounded-full bg-[var(--primary)] text-white px-4 py-1.5 text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm flex items-center gap-1.5"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Simulate GPS Movement
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Live Tracking Map Component */}
                    <div className="rounded-2xl border border-[var(--border)] p-4 bg-gray-50/50 dark:bg-zinc-900/50 space-y-3 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase text-[var(--fg)]">🌐 Ghatkopar Delivery Zones GPS</span>
                        <span className="text-[9px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full animate-pulse font-extrabold uppercase">Live Satellite Connected</span>
                      </div>

                      {/* Simulated interactive map using coordinates state */}
                      <div className="relative w-full h-[220px] bg-emerald-950/10 dark:bg-emerald-950/40 rounded-xl overflow-hidden border border-[var(--border)] flex items-center justify-center">
                        <svg className="w-full h-full" viewBox="0 0 300 250">
                          {/* Zone lines to simulate grid roads */}
                          <line x1="40" y1="60" x2="260" y2="60" stroke="rgba(16,185,129,0.15)" strokeWidth="4" strokeLinecap="round" />
                          <line x1="40" y1="130" x2="260" y2="130" stroke="rgba(16,185,129,0.15)" strokeWidth="4" strokeLinecap="round" />
                          <line x1="40" y1="200" x2="260" y2="200" stroke="rgba(16,185,129,0.15)" strokeWidth="4" strokeLinecap="round" />
                          
                          <line x1="75" y1="30" x2="75" y2="220" stroke="rgba(16,185,129,0.15)" strokeWidth="4" strokeLinecap="round" />
                          <line x1="140" y1="30" x2="140" y2="220" stroke="rgba(16,185,129,0.15)" strokeWidth="4" strokeLinecap="round" />
                          <line x1="210" y1="30" x2="210" y2="220" stroke="rgba(16,185,129,0.15)" strokeWidth="4" strokeLinecap="round" />

                          {/* Map Landmarks */}
                          <text x="75" y="45" fontSize="8" fontWeight="bold" fill="var(--muted-fg)" textAnchor="middle" opacity="0.6">Pant Nagar</text>
                          <text x="75" y="180" fontSize="8" fontWeight="bold" fill="var(--muted-fg)" textAnchor="middle" opacity="0.6">Cama Lane</text>
                          <text x="210" y="45" fontSize="8" fontWeight="bold" fill="var(--muted-fg)" textAnchor="middle" opacity="0.6">Garodia Nagar</text>
                          <text x="210" y="180" fontSize="8" fontWeight="bold" fill="var(--muted-fg)" textAnchor="middle" opacity="0.6">Ghatkopar Stn</text>

                          {/* Riders coordinate markers */}
                          {riders.map(r => (
                            <g key={r.id}>
                              {r.status !== 'Idle' && (
                                <circle cx={r.lat} cy={r.lng} r="12" fill="var(--primary)" className="animate-ping opacity-25" />
                              )}
                              <circle cx={r.lat} cy={r.lng} r="6" fill={r.status === 'Idle' ? '#64748b' : 'var(--primary)'} />
                              <text x={r.lat} y={r.lng - 10} fontSize="8" fontWeight="extrabold" fill="var(--fg)" textAnchor="middle">
                                {(r.name || 'Rider').split(' ')[0]} {r.status === 'Idle' ? '💤' : '🛵'}
                              </text>
                            </g>
                          ))}
                        </svg>
                      </div>
                    </div>

                    {/* Riders Fleet List */}
                    <div className="space-y-3">
                      <span className="text-[11px] font-black uppercase text-[var(--fg)]">📋 Active Fleet Status</span>
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {riders.map(r => (
                          <div key={r.id} className="p-3 border border-[var(--border)] rounded-xl flex items-center justify-between text-xs bg-[var(--card)] hover:shadow-sm transition-all">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[var(--fg)]">{r.name}</span>
                                <span className={`px-1.5 py-0.5 text-[8px] rounded-full font-extrabold uppercase ${
                                  r.status === 'Delivering'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : r.status === 'Returning'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {r.status}
                                </span>
                              </div>
                              <div className="text-[10px] text-[var(--muted-fg)]">
                                Zone: <span className="font-semibold text-[var(--fg)]">{r.zone}</span> | Order: <span className="font-bold text-[var(--primary)]">{r.activeOrder}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <a href={`tel:${r.phone}`} className="text-[10px] font-bold text-[var(--primary)] hover:underline block">{r.phone}</a>
                              <span className="text-[9px] text-[var(--muted-fg)] font-mono">GPS: {r.lat}, {r.lng}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* AUTO-RESTOCK MANAGER VIEW (Suggestion 4) */}
              {activeTab === 'restock' && (
                <motion.div
                  key="restock"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-black text-[var(--fg)]">⚙ AI Inventory Optimizer & Bulk Restock Trigger</h3>
                      <p className="text-[10px] text-[var(--muted-fg)]">Monitor real-time vegetable levels and trigger smart wholesales bulk orders</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAutoRestock}
                      disabled={isRestocking}
                      className="rounded-full bg-[var(--primary)] text-white px-5 py-2 text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow flex items-center gap-1.5"
                    >
                      {isRestocking ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          AI Dispacthing Restock...
                        </>
                      ) : (
                        <>
                          ⚡ Trigger AI Auto-Restock
                        </>
                      )}
                    </button>
                  </div>

                  {/* Stock Levels Status Indicators */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 border border-[var(--border)] rounded-2xl bg-amber-50/50 dark:bg-amber-950/10 flex items-center gap-3">
                      <div className="text-2xl">⚠️</div>
                      <div>
                        <div className="text-[10px] font-black text-amber-800 uppercase tracking-wider">Low Stock Warnings</div>
                        <div className="text-lg font-black text-amber-900 dark:text-amber-200">
                          {products.filter(p => p.stockQty <= p.lowAt).length} Vegetables
                        </div>
                      </div>
                    </div>

                    <div className="p-4 border border-[var(--border)] rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/10 flex items-center gap-3">
                      <div className="text-2xl">🥬</div>
                      <div>
                        <div className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">Healthy Vegetables</div>
                        <div className="text-lg font-black text-emerald-900 dark:text-emerald-200">
                          {products.filter(p => p.stockQty > p.lowAt).length} Products
                        </div>
                      </div>
                    </div>

                    <div className="p-4 border border-[var(--border)] rounded-2xl bg-blue-50/50 dark:bg-blue-950/10 flex items-center gap-3">
                      <div className="text-2xl">🚛</div>
                      <div>
                        <div className="text-[10px] font-black text-blue-800 uppercase tracking-wider">Direct Wholesale Partner</div>
                        <div className="text-lg font-black text-blue-900 dark:text-blue-200">Vashi APMC Market</div>
                      </div>
                    </div>
                  </div>

                  {/* List of critical low items */}
                  <div className="rounded-2xl border border-[var(--border)] p-4 bg-gray-50/50 dark:bg-zinc-900/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase text-[var(--fg)]">🔥 Critical Inventory Shortages (<span className="text-amber-600">≤ 10kg limit</span>)</span>
                      <span className="text-[10px] font-bold text-[var(--muted-fg)]">Refills up to 100 kg automatically on AI Trigger</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {products.filter(p => p.stockQty <= p.lowAt).map(p => (
                        <div key={p.id} className="p-3 border border-red-200 bg-red-50/30 rounded-xl flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{p.emoji}</span>
                            <div>
                              <div className="font-bold text-[var(--fg)]">{p.name}</div>
                              <div className="text-[9px] text-red-600 font-extrabold uppercase">Critical: {p.stockQty} {p.weight} left</div>
                            </div>
                          </div>
                          <span className="text-[10px] text-[var(--muted-fg)] font-mono">ID: #{p.id}</span>
                        </div>
                      ))}
                      {products.filter(p => p.stockQty <= p.lowAt).length === 0 && (
                        <div className="col-span-full text-center py-6 text-[var(--muted-fg)] text-xs italic">
                          🎉 All vegetables have healthy stock levels above 10kg! No shortages detected.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Procurement Logs */}
                  <div className="space-y-3">
                    <span className="text-[11px] font-black uppercase text-[var(--fg)]">📜 AI Bulk Procurement Log (Vashi APMC Wholesales dispatch)</span>
                    <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-zinc-900 border-b border-[var(--border)] text-[var(--muted-fg)] uppercase tracking-wider text-[10px] font-bold">
                            <th className="p-3">Log ID</th>
                            <th className="p-3">Procurement Dispatch Time</th>
                            <th className="p-3">Procured Vegetables</th>
                            <th className="p-3">Wholesale Price Paid</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {restockLogs.map(log => (
                            <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                              <td className="p-3 font-bold text-[var(--fg)]">#RESTOCK-00{log.id}</td>
                              <td className="p-3 text-[var(--muted-fg)]">{log.timestamp}</td>
                              <td className="p-3 text-[var(--fg)] font-semibold">{log.items}</td>
                              <td className="p-3 font-bold text-[var(--fg)]">₹{log.cost}</td>
                              <td className="p-3">
                                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase">
                                  {log.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* COUPONS & CAMPAIGNS VIEW (Suggestion 5) */}
              {activeTab === 'coupons' && (
                <motion.div
                  key="coupons"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Top Header & Sub-Navigation */}
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
                    <div>
                      <h3 className="text-sm font-black text-[var(--fg)] flex items-center gap-2">
                        <span>🏷️</span> Coupons & Campaigns Manager
                      </h3>
                      <p className="text-[10px] text-[var(--muted-fg)]">Deploy advanced Instagram and regular coupon campaigns, track redemptions, and view live ROI metrics.</p>
                    </div>

                    <div className="flex rounded-lg bg-[var(--muted)] p-0.5 border border-[var(--border)] self-stretch md:self-auto text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => setCouponSubTab('campaigns')}
                        className={`flex-1 md:flex-none px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                          couponSubTab === 'campaigns'
                            ? 'bg-[var(--card)] text-[var(--fg)] shadow-sm'
                            : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
                        }`}
                      >
                        📂 Campaigns
                      </button>
                      <button
                        type="button"
                        onClick={() => setCouponSubTab('redemptions')}
                        className={`flex-1 md:flex-none px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                          couponSubTab === 'redemptions'
                            ? 'bg-[var(--card)] text-[var(--fg)] shadow-sm'
                            : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
                        }`}
                      >
                        📜 Redemptions Log
                      </button>
                      <button
                        type="button"
                        onClick={() => setCouponSubTab('analytics')}
                        className={`flex-1 md:flex-none px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                          couponSubTab === 'analytics'
                            ? 'bg-[var(--card)] text-[var(--fg)] shadow-sm'
                            : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
                        }`}
                      >
                        📊 ROI Analytics
                      </button>
                    </div>
                  </div>

                  {/* 📂 SUBTAB 1: CAMPAIGNS LIST & CREATION */}
                  {couponSubTab === 'campaigns' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      
                      {/* Left Side: Create Campaign Form */}
                      <form onSubmit={handleCreateCoupon} className="rounded-2xl border border-[var(--border)] bg-gray-50/50 dark:bg-zinc-900/50 p-4 space-y-4 self-start">
                        <span className="text-[11px] font-black uppercase text-[var(--fg)] flex items-center gap-1.5">
                          <span>🚀</span> Deploy Campaign Code
                        </span>

                        <div className="space-y-3.5 text-[10px]">
                          {/* Code and Discount Type */}
                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="flex flex-col gap-1">
                              <label className="font-black text-[var(--muted-fg)] uppercase tracking-wider">Coupon Code *</label>
                              <input
                                type="text"
                                required
                                placeholder="e.g. INSTA30"
                                value={newCouponCode}
                                onChange={(e) => setNewCouponCode(e.target.value)}
                                className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-mono uppercase tracking-wider text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="font-black text-[var(--muted-fg)] uppercase tracking-wider">Campaign Type</label>
                              <select
                                value={newCouponCampaignType}
                                onChange={(e) => setNewCouponCampaignType(e.target.value)}
                                className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--fg)] outline-none cursor-pointer focus:border-[var(--primary)]"
                              >
                                <option value="Regular Promo Code">Regular Promo Code</option>
                                <option value="Instagram Exclusive">Instagram Exclusive</option>
                                <option value="Festival Campaign">Festival Campaign</option>
                                <option value="Referral Campaign">Referral Campaign</option>
                                <option value="Limited-Time Offer">Limited-Time Offer</option>
                              </select>
                            </div>
                          </div>

                          {/* Discount value and Min Order */}
                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="flex flex-col gap-1">
                              <label className="font-black text-[var(--muted-fg)] uppercase tracking-wider">Discount Value *</label>
                              <div className="relative">
                                <input
                                  type="number"
                                  required
                                  min="1"
                                  placeholder="e.g. 50"
                                  value={newCouponDiscount}
                                  onChange={(e) => setNewCouponDiscount(Number(e.target.value))}
                                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] pl-3 pr-8 py-2 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                                />
                                <span className="absolute right-3 top-2.5 font-bold text-[var(--muted-fg)]">
                                  {newCouponDiscountType === 'percent' ? '%' : '₹'}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="font-black text-[var(--muted-fg)] uppercase tracking-wider">Discount Mode</label>
                              <select
                                value={newCouponDiscountType}
                                onChange={(e) => setNewCouponDiscountType(e.target.value)}
                                className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--fg)] outline-none cursor-pointer"
                              >
                                <option value="flat">Flat Cash (₹)</option>
                                <option value="percent">Percentage (%)</option>
                                <option value="free_delivery">Free Delivery</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="flex flex-col gap-1">
                              <label className="font-black text-[var(--muted-fg)] uppercase tracking-wider">Min Order (₹) *</label>
                              <input
                                type="number"
                                required
                                min="0"
                                placeholder="e.g. 299"
                                value={newCouponMinOrder}
                                onChange={(e) => setNewCouponMinOrder(Number(e.target.value))}
                                className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="font-black text-[var(--muted-fg)] uppercase tracking-wider">Coupon Status</label>
                              <select
                                value={newCouponStatus}
                                onChange={(e) => setNewCouponStatus(e.target.value)}
                                className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--fg)] outline-none"
                              >
                                <option value="Active">🟢 Active</option>
                                <option value="Disabled">🔴 Disabled</option>
                              </select>
                            </div>
                          </div>

                          {/* Redemption limits */}
                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="flex flex-col gap-1">
                              <label className="font-black text-[var(--muted-fg)] uppercase tracking-wider">Redemption Limit</label>
                              <input
                                type="number"
                                placeholder="Unlimited"
                                value={newCouponMaxRedemptions}
                                onChange={(e) => setNewCouponMaxRedemptions(e.target.value !== '' ? Number(e.target.value) : '')}
                                className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="font-black text-[var(--muted-fg)] uppercase tracking-wider">Per User Limit</label>
                              <select
                                value={newCouponMaxPerCustomer}
                                onChange={(e) => setNewCouponMaxPerCustomer(e.target.value)}
                                className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--fg)] outline-none cursor-pointer"
                              >
                                <option value="Unlimited">Unlimited Uses</option>
                                <option value="1">Once Per User</option>
                                <option value="2">Twice Per User</option>
                              </select>
                            </div>
                          </div>

                          {/* Dates */}
                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="flex flex-col gap-1">
                              <label className="font-black text-[var(--muted-fg)] uppercase tracking-wider">Start Date</label>
                              <input
                                type="date"
                                value={newCouponStartDate}
                                onChange={(e) => setNewCouponStartDate(e.target.value)}
                                className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--fg)] outline-none cursor-pointer"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="font-black text-[var(--muted-fg)] uppercase tracking-wider">Expiry Date</label>
                              <input
                                type="date"
                                value={newCouponExpiry}
                                onChange={(e) => setNewCouponExpiry(e.target.value)}
                                className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--fg)] outline-none cursor-pointer"
                              />
                            </div>
                          </div>

                          {/* Campaign Details */}
                          <div className="flex flex-col gap-1">
                            <label className="font-black text-[var(--muted-fg)] uppercase tracking-wider">Campaign / Friendly Name</label>
                            <input
                              type="text"
                              placeholder="e.g. Instagram Launch Exclusive"
                              value={newCouponCampaignName}
                              onChange={(e) => setNewCouponCampaignName(e.target.value)}
                              className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                            />
                          </div>

                          {/* Instagram Campaign Collapsible block */}
                          {newCouponCampaignType === 'Instagram Exclusive' && (
                            <div className="bg-pink-50/65 dark:bg-pink-950/10 p-3 rounded-2xl border border-pink-100 dark:border-pink-900/30 space-y-2.5">
                              <span className="text-[9px] font-black uppercase text-pink-700 dark:text-pink-400 flex items-center gap-1">
                                <Instagram className="h-3 w-3" /> Instagram Content URLs
                              </span>
                              
                              <div className="flex flex-col gap-1">
                                <label className="text-[8px] font-bold text-pink-800 dark:text-pink-300 uppercase">IG Post URL</label>
                                <input
                                  type="url"
                                  placeholder="https://instagram.com/p/..."
                                  value={newCouponIgPostUrl}
                                  onChange={(e) => setNewCouponIgPostUrl(e.target.value)}
                                  className="rounded-lg border border-pink-200 dark:border-pink-900 bg-[var(--card)] px-2.5 py-1 text-xs text-[var(--fg)] outline-none focus:border-pink-500"
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[8px] font-bold text-pink-800 dark:text-pink-300 uppercase">IG Reel URL</label>
                                <input
                                  type="url"
                                  placeholder="https://instagram.com/reel/..."
                                  value={newCouponIgReelUrl}
                                  onChange={(e) => setNewCouponIgReelUrl(e.target.value)}
                                  className="rounded-lg border border-pink-200 dark:border-pink-900 bg-[var(--card)] px-2.5 py-1 text-xs text-[var(--fg)] outline-none focus:border-pink-500"
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[8px] font-bold text-pink-800 dark:text-pink-300 uppercase">IG Story Link</label>
                                <input
                                  type="url"
                                  placeholder="https://instagram.com/stories/..."
                                  value={newCouponIgStoryLink}
                                  onChange={(e) => setNewCouponIgStoryLink(e.target.value)}
                                  className="rounded-lg border border-pink-200 dark:border-pink-900 bg-[var(--card)] px-2.5 py-1 text-xs text-[var(--fg)] outline-none focus:border-pink-500"
                                />
                              </div>
                            </div>
                          )}

                          <div className="flex flex-col gap-1">
                            <label className="font-black text-[var(--muted-fg)] uppercase tracking-wider">Internal Notes</label>
                            <textarea
                              rows={2}
                              placeholder="Describe this marketing campaign..."
                              value={newCouponCampaignNotes}
                              onChange={(e) => setNewCouponCampaignNotes(e.target.value)}
                              className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)] resize-none"
                            />
                          </div>

                          <button
                            type="submit"
                            className="w-full rounded-xl bg-[var(--primary)] text-white px-4 py-2.5 text-xs font-black hover:bg-emerald-700 transition-all shadow flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <span>🚀</span> Deploy Promo Campaign
                          </button>
                        </div>
                      </form>

                      {/* Right Side: Campaigns list */}
                      <div className="lg:col-span-2 space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-black uppercase text-[var(--fg)] flex items-center gap-1.5">
                            <span>🎫</span> Live Campaign Coupons ({coupons.length})
                          </span>
                        </div>

                        <div className="space-y-3">
                          {coupons.map((c) => {
                            const isIg = c.campaignType === 'Instagram Exclusive';
                            const hasRedemptionLimit = c.maxRedemptions !== null && c.maxRedemptions !== undefined && c.maxRedemptions > 0;
                            const progressPercent = hasRedemptionLimit ? Math.min(100, Math.round((c.usage / c.maxRedemptions) * 100)) : 0;
                            const isSoldOut = hasRedemptionLimit && c.usage >= c.maxRedemptions;
                            const isCampDisabled = c.status === 'Disabled';

                            return (
                              <div
                                key={c.code}
                                className={`p-4 rounded-2xl border bg-[var(--card)] shadow-sm relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-[var(--primary)]/50 ${
                                  isCampDisabled ? 'opacity-65 border-[var(--border)]' : isIg ? 'border-pink-200 dark:border-pink-900/50' : 'border-[var(--border)]'
                                }`}
                              >
                                <div className="space-y-1.5 flex-1 min-w-0">
                                  {/* Badge & Promo Code */}
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-extrabold text-sm tracking-tight text-[var(--primary)] bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-0.5 rounded-lg border border-emerald-100 dark:border-emerald-900/40 font-mono uppercase">
                                      {c.code}
                                    </span>
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                                      isIg 
                                        ? 'bg-pink-100 text-pink-700' 
                                        : c.campaignType === 'Festival Campaign'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-slate-100 text-slate-800'
                                    }`}>
                                      {c.campaignType || 'Regular Promo'}
                                    </span>

                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                                      isCampDisabled ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                                    }`}>
                                      {isCampDisabled ? 'Disabled' : 'Active'}
                                    </span>

                                    {isSoldOut && (
                                      <span className="text-[9px] font-black bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                                        SOLD OUT
                                      </span>
                                    )}
                                  </div>

                                  {/* Details */}
                                  <div className="text-xs font-black text-[var(--fg)]">
                                    {c.campaignName || 'Unnamed Promo Offer'}
                                  </div>

                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-[var(--muted-fg)]">
                                    <div>
                                      Discount:{' '}
                                      <span className="font-bold text-[var(--fg)]">
                                        {c.type === 'percent' ? `${c.discount}%` : `₹${c.discount}`} {c.type === 'free_delivery' ? '(Free Delivery)' : 'OFF'}
                                      </span>
                                    </div>
                                    <div>
                                      Min Spend: <span className="font-bold text-[var(--fg)]">₹{c.minOrder}</span>
                                    </div>
                                    <div>
                                      Applied: <span className="font-extrabold text-[var(--fg)]">{c.usage} times</span>
                                    </div>
                                    <div>
                                      Per User: <span className="font-extrabold text-[var(--fg)]">{c.maxPerCustomer ? `Max ${c.maxPerCustomer}` : 'Unlimited'}</span>
                                    </div>
                                  </div>

                                  {/* Live Progress Bar for limits */}
                                  {hasRedemptionLimit && (
                                    <div className="space-y-1 pt-1 max-w-xs">
                                      <div className="flex justify-between text-[9px] font-black uppercase text-[var(--muted-fg)]">
                                        <span>Redemption Limit</span>
                                        <span>{c.usage} / {c.maxRedemptions} ({progressPercent}%)</span>
                                      </div>
                                      <div className="h-1.5 w-full bg-[var(--muted)] rounded-full overflow-hidden">
                                        <div 
                                          className={`h-full transition-all duration-500 ${progressPercent > 80 ? 'bg-red-500' : 'bg-[var(--primary)]'}`}
                                          style={{ width: `${progressPercent}%` }}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {/* Instagram URLs info if any */}
                                  {isIg && (c.igPostUrl || c.igReelUrl || c.igStoryLink) && (
                                    <div className="flex items-center gap-2 pt-1">
                                      <span className="text-[9px] font-bold text-pink-600 uppercase">IG Content:</span>
                                      <div className="flex gap-1.5">
                                        {c.igPostUrl && (
                                          <a href={c.igPostUrl} target="_blank" rel="noopener noreferrer" className="p-1 bg-pink-50 hover:bg-pink-100 rounded text-pink-600 transition-colors" title="Instagram Post">
                                            <Instagram className="h-3 w-3" />
                                          </a>
                                        )}
                                        {c.igReelUrl && (
                                          <a href={c.igReelUrl} target="_blank" rel="noopener noreferrer" className="p-1 bg-pink-50 hover:bg-pink-100 rounded text-pink-600 transition-colors" title="Instagram Reel">
                                            <ExternalLink className="h-3 w-3" />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2">
                                  {/* Toggle Status */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextStatus = c.status === 'Disabled' ? 'Active' : 'Disabled';
                                      fetch('/api/admin/coupons', {
                                        method: 'POST',
                                        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                                        body: JSON.stringify({ ...c, status: nextStatus })
                                      })
                                      .then(res => res.json())
                                      .then(data => {
                                        if (data.success) {
                                          setCoupons(data.coupons);
                                          setAdminSuccess(`Coupon status updated successfully!`);
                                        }
                                      })
                                      .catch(err => setAdminError('Error updating status: ' + err));
                                    }}
                                    className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
                                      isCampDisabled 
                                        ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-600 hover:text-white' 
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                                    }`}
                                  >
                                    {isCampDisabled ? 'Activate' : 'Deactivate'}
                                  </button>

                                  {/* Delete */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPendingConfirmAction({
                                        message: `Deactivate and remove the coupon code ${c.code}? This action cannot be reversed.`,
                                        onConfirm: () => handleRemoveCoupon(c.code)
                                      });
                                    }}
                                    className="rounded-full bg-red-50 text-red-600 p-2 hover:bg-red-500 hover:text-white transition-all shadow-sm flex-shrink-0 cursor-pointer"
                                    title="Delete Coupon"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {coupons.length === 0 && (
                            <div className="text-center py-12 rounded-2xl border-2 border-dashed border-[var(--border)] text-[var(--muted-fg)] italic text-xs">
                              🎁 No coupon codes deployed yet. Deploy your first marketing campaign code from the left panel!
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 📜 SUBTAB 2: REDEMPTIONS LOG */}
                  {couponSubTab === 'redemptions' && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-[11px] font-black uppercase text-[var(--fg)]">📜 Checkout Redemptions History</span>
                          <p className="text-[9px] text-[var(--muted-fg)]">Chronological audit of all coupons processed at user checkouts.</p>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-zinc-900 border-b border-[var(--border)] text-[var(--muted-fg)] uppercase tracking-wider text-[10px] font-bold">
                              <th className="p-3">Redemption ID</th>
                              <th className="p-3">Order ID</th>
                              <th className="p-3">User ID / Email</th>
                              <th className="p-3">Processed Coupon</th>
                              <th className="p-3">Savings Granted</th>
                              <th className="p-3">Timestamp</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {redemptionLogs.map((log) => (
                              <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                                <td className="p-3 font-mono font-bold text-[var(--fg)]">#RED-00{log.id}</td>
                                <td className="p-3 font-semibold text-[var(--fg)]">#{log.orderId}</td>
                                <td className="p-3 font-medium text-[var(--muted-fg)]">
                                  {log.userId === 'guest' ? '👤 Guest Customer' : log.userEmail || log.userId}
                                </td>
                                <td className="p-3">
                                  <span className="bg-pink-50 text-pink-700 px-2 py-0.5 rounded font-bold font-mono border border-pink-100">
                                    {log.code || log.couponCode}
                                  </span>
                                </td>
                                <td className="p-3 font-black text-emerald-600">₹{log.discount}</td>
                                <td className="p-3 text-[var(--muted-fg)] font-medium">
                                  {new Date(log.timestamp).toLocaleString()}
                                </td>
                              </tr>
                            ))}

                            {redemptionLogs.length === 0 && (
                              <tr>
                                <td colSpan={6} className="text-center py-12 text-[var(--muted-fg)] italic">
                                  No coupon redemptions recorded yet. Log entries appear automatically on user checkouts.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 📊 SUBTAB 3: ROI PERFORMANCE ANALYTICS */}
                  {couponSubTab === 'analytics' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm text-xs space-y-1">
                          <p className="text-[9px] font-bold text-[var(--muted-fg)] uppercase tracking-wider">Total Redemptions</p>
                          <p className="text-2xl font-black text-[var(--fg)]">{couponAnalytics?.totalRedemptions || 0}</p>
                          <p className="text-[9px] text-emerald-600 font-extrabold flex items-center gap-0.5">
                            <TrendingUp className="h-3 w-3" /> Active Checkouts
                          </p>
                        </div>

                        <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm text-xs space-y-1">
                          <p className="text-[9px] font-bold text-[var(--muted-fg)] uppercase tracking-wider">Discounts Distributed</p>
                          <p className="text-2xl font-black text-[var(--fg)]">₹{couponAnalytics?.totalRevenueGenerated || 0}</p>
                          <p className="text-[9px] text-[var(--muted-fg)] font-bold">Total Customer Savings</p>
                        </div>

                        <div className="p-4 rounded-2xl border border-pink-200 bg-pink-50/20 shadow-sm text-xs space-y-1">
                          <p className="text-[9px] font-bold text-pink-600 uppercase tracking-wider">Instagram Campaign ROI</p>
                          <p className="text-2xl font-black text-pink-700">{couponAnalytics?.igRedemptions || 0} Uses</p>
                          <p className="text-[9px] text-pink-600 font-extrabold">IG Referral checkouts</p>
                        </div>

                        <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm text-xs space-y-1">
                          <p className="text-[9px] font-bold text-[var(--muted-fg)] uppercase tracking-wider">Campaign Conversion</p>
                          <p className="text-2xl font-black text-emerald-600">{couponAnalytics?.conversionRate || '0%'}</p>
                          <p className="text-[9px] text-[var(--muted-fg)] font-bold">Total Promo Conversion Rate</p>
                        </div>
                      </div>

                      {/* Performance list */}
                      <div className="p-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm space-y-4">
                        <span className="text-[11px] font-black uppercase text-[var(--fg)] tracking-wider flex items-center gap-1.5">
                          <span>🏆</span> Top Performing Promo Campaigns
                        </span>

                        <div className="space-y-4">
                          {coupons.map((c, idx) => {
                            const maxRedeem = coupons.reduce((max, x) => x.usage > max ? x.usage : max, 1);
                            const percentOfMax = Math.round((c.usage / maxRedeem) * 100);

                            return (
                              <div key={c.code} className="space-y-1.5">
                                <div className="flex justify-between items-center text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="h-5 w-5 bg-gray-100 rounded-full flex items-center justify-center font-black text-[10px] text-[var(--muted-fg)]">
                                      #{idx + 1}
                                    </span>
                                    <span className="font-mono font-black text-[var(--fg)]">{c.code}</span>
                                    <span className="text-[10px] text-[var(--muted-fg)]">({c.campaignName || 'Regular Offer'})</span>
                                  </div>
                                  <span className="font-extrabold text-[var(--fg)]">{c.usage} Redemptions</span>
                                </div>
                                <div className="h-2 w-full bg-[var(--muted)] rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                                    style={{ width: `${Math.max(4, percentOfMax)}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}

                          {coupons.length === 0 && (
                            <div className="text-center py-6 text-[var(--muted-fg)] text-xs italic">
                              Analytics will populate automatically as users redeem deployed coupons.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* 5. OFFERS/PROMOS MANAGEMENT VIEW */}
              {activeTab === 'offers' && (
                <motion.div
                  key="offers"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <h3 className="text-sm font-black text-[var(--fg)]">🏷 Promotional Banners & Combos</h3>

                  {/* List of active offers */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {offers.map((off) => (
                      <div
                        key={off.id}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 flex gap-3 items-center shadow-sm relative group overflow-hidden"
                      >
                          <div className="h-14 w-14 rounded-xl overflow-hidden bg-[var(--muted)] flex-shrink-0 border border-[var(--border)] relative flex items-center justify-center text-xl">
                            <span>🎁</span>
                            {off.img && (
                              <img
                                src={off.img}
                                alt={off.title}
                                className="h-full w-full object-cover absolute inset-0 z-10"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            )}
                          </div>
                        <div className="space-y-1 z-10 flex-1 min-w-0 pr-2">
                          <span className="rounded bg-orange-100 text-orange-700 px-2 py-0.5 text-[9px] font-extrabold uppercase">
                            {off.tag}
                          </span>
                          <h4 className="text-xs font-bold text-[var(--fg)] truncate">{off.title}</h4>
                          <p className="text-[10px] text-[var(--muted-fg)] line-clamp-1">{off.desc}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEditOffer(off)}
                            className="rounded-full bg-blue-50 text-blue-600 p-2 hover:bg-blue-500 hover:text-white transition-all shadow-sm"
                            title="Edit promo banner"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveOffer(off.id)}
                            className="rounded-full bg-red-50 text-red-600 p-2 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                            title="Remove promo banner"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Create New Promo Form */}
                  <form onSubmit={handleOfferFormSubmit} className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-5 space-y-4">
                    <h4 className="text-xs font-bold text-[var(--fg)]">Create New Promotion Banner</h4>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Offer Title *</label>
                        <input
                          type="text"
                          required
                          value={newOfferTitle || ''}
                          onChange={(e) => setNewOfferTitle(e.target.value)}
                          placeholder="e.g., Organic Lemon Basket"
                          className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Promo Badge Tag</label>
                        <input
                          type="text"
                          value={newOfferTag || ''}
                          onChange={(e) => setNewOfferTag(e.target.value)}
                          placeholder="e.g. SPECIAL COMBO"
                          className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Description Detail *</label>
                        <input
                          type="text"
                          required
                          value={newOfferDesc || ''}
                          onChange={(e) => setNewOfferDesc(e.target.value)}
                          placeholder="e.g., Save 20% on our premium citric mix"
                          className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Offer Banner Image (URL or Upload from PC)</label>
                      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                        <input
                          type="text"
                          value={newOfferImg || ''}
                          onChange={(e) => setNewOfferImg(e.target.value)}
                          placeholder="https://images.unsplash.com/... (auto-assigned if empty)"
                          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs text-[var(--fg)] outline-none"
                        />
                        <div className="flex items-center gap-2">
                          <label className="cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs font-bold text-[var(--fg)] hover:bg-[var(--muted)] transition-all flex items-center gap-2">
                            <span>📁 Upload Local File</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleOfferImageFileChange}
                              className="hidden"
                            />
                          </label>
                          {newOfferImg && (
                            <div className="relative h-10 w-10 rounded-lg overflow-hidden border border-[var(--border)] shadow-sm bg-white flex-shrink-0">
                              <img src={newOfferImg} alt="Preview" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        className="rounded-full bg-[var(--primary)] px-6 py-2 text-xs font-bold text-white shadow"
                      >
                        Launch Promo Banner
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {/* 6. REVIEWS MODERATION VIEW */}
              {activeTab === 'reviews' && (
                <motion.div
                  key="reviews"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  <h3 className="text-sm font-black text-[var(--fg)]">⭐ Review Moderation Center</h3>

                  <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                    {reviews.map((rev) => (
                      <div
                        key={rev.id}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-2 shadow-sm relative group flex justify-between items-start gap-4"
                      >
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[var(--fg)]">
                              {rev.authorName} {rev.location ? `(${rev.location})` : ''}
                            </span>
                            <span className="text-[10px] text-[var(--muted-fg)]">
                              {new Date(rev.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                          <div className="text-amber-500 text-[11px]">{'⭐'.repeat(rev.rating)}</div>
                          <p className="text-xs text-[var(--fg)] italic">"{rev.body}"</p>
                        </div>

                        <button
                          onClick={() => {
                            onRemoveReview(rev.id);
                          }}
                          className="rounded-full bg-red-50 text-red-600 p-2 hover:bg-red-500 hover:text-white transition-all shadow-sm flex-shrink-0 cursor-pointer"
                          title="Delete review"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {reviews.length === 0 && (
                      <p className="text-center py-8 text-[var(--muted-fg)] italic text-xs">
                        No reviews posted by users.
                      </p>
                    )}
                  </div>
                </motion.div>
              )}

              {/* 7. PAYMENT SETTINGS VIEW */}
              {activeTab === 'payment-settings' && (
                <motion.div
                  key="payment-settings"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-5"
                >
                  <div>
                    <h3 className="text-sm font-black text-[var(--fg)]">⚙️ Payment Gateway & Checkout Settings</h3>
                    <p className="text-[11px] text-[var(--muted-fg)]">Configure Razorpay credentials, store details, and available payment methods</p>
                  </div>

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        const res = await fetch('/api/payment-settings', {
                          method: 'POST',
                          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                          body: JSON.stringify(paymentSettings),
                        });
                        const data = await res.json();
                        if (data.success) {
                          localStorage.setItem('sabjies_payment_settings', JSON.stringify(paymentSettings));
                          setAdminSuccess('Payment settings saved and synchronized to the server successfully! ✨');
                        } else {
                          setAdminError('Failed to save settings on the server.');
                        }
                      } catch (err) {
                        localStorage.setItem('sabjies_payment_settings', JSON.stringify(paymentSettings));
                        setAdminSuccess('Saved settings locally. Server is offline, but changes will take effect.');
                      }
                    }}
                    className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Business / Store Name *</label>
                        <input
                          type="text"
                          required
                          value={paymentSettings.businessName}
                          onChange={(e) => setPaymentSettings({ ...paymentSettings, businessName: e.target.value })}
                          className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Merchant UPI ID *</label>
                        <input
                          type="text"
                          required
                          value={paymentSettings.upiId}
                          onChange={(e) => setPaymentSettings({ ...paymentSettings, upiId: e.target.value })}
                          placeholder="e.g. merchant@upi"
                          className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs font-mono text-[var(--fg)] font-bold outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase">Step-by-Step Payment Instructions *</label>
                      <textarea
                        rows={4}
                        required
                        value={paymentSettings.instructions}
                        onChange={(e) => setPaymentSettings({ ...paymentSettings, instructions: e.target.value })}
                        className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none font-medium leading-relaxed"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                      {/* Razorpay Toggle */}
                      <label className="flex items-center gap-3 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={paymentSettings.enableRazorpay !== false}
                          onChange={(e) => setPaymentSettings({ ...paymentSettings, enableRazorpay: e.target.checked })}
                          className="h-4.5 w-4.5 rounded accent-emerald-600"
                        />
                        <div>
                          <span className="text-xs font-black text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                            <span>Enable Razorpay Payment Gateway</span>
                            <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[8px] font-black text-white uppercase">Instant</span>
                          </span>
                          <span className="text-[10px] text-[var(--muted-fg)]">Accept UPI, GPay, Cards, NetBanking, Paytm & Wallets</span>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--muted)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={paymentSettings.enableCod !== false}
                          onChange={(e) => setPaymentSettings({ ...paymentSettings, enableCod: e.target.checked })}
                          className="h-4.5 w-4.5 rounded accent-[var(--primary)]"
                        />
                        <div>
                          <span className="text-xs font-extrabold text-[var(--fg)] block">Enable Cash on Delivery (COD)</span>
                          <span className="text-[10px] text-[var(--muted-fg)] font-medium">Allow cash payment upon doorstep delivery</span>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--muted)] opacity-60 cursor-not-allowed">
                        <input
                          type="checkbox"
                          disabled
                          readOnly
                          checked={false}
                          className="h-4.5 w-4.5 rounded"
                        />
                        <div>
                          <span className="text-xs font-extrabold text-[var(--muted-fg)] flex items-center gap-1">
                            <span>Direct Manual QR Scan</span>
                            <span className="rounded bg-gray-500 px-1 py-0.5 text-[8px] font-black text-white">REMOVED</span>
                          </span>
                          <span className="text-[10px] text-[var(--muted-fg)] font-medium">Replaced with automated Razorpay checkout</span>
                        </div>
                      </label>
                    </div>

                    {/* Razorpay Setup & Credentials Info Box */}
                    <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 space-y-2 mt-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">💳</span>
                          <h5 className="text-xs font-black text-blue-900 dark:text-blue-200 uppercase tracking-wider">
                            Razorpay Server Credentials Status
                          </h5>
                        </div>
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                          paymentSettings.razorpayKeyIdConfigured ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
                        }`}>
                          {paymentSettings.razorpayKeyIdConfigured ? '✓ Credentials Configured' : '⚡ Action Needed in .env'}
                        </span>
                      </div>
                      <p className="text-[11px] text-blue-800 dark:text-blue-300 font-medium leading-relaxed">
                        To enable live payments from customers, open your project's <code className="bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.5 rounded font-mono font-bold text-[10px]">.env</code> file and paste your credentials:
                      </p>
                      <div className="bg-slate-900 text-slate-100 p-3 rounded-lg font-mono text-[10px] space-y-1 overflow-x-auto">
                        <div><span className="text-emerald-400 font-bold">RAZORPAY_KEY_ID</span>=rzp_test_YourKeyHere</div>
                        <div><span className="text-emerald-400 font-bold">RAZORPAY_KEY_SECRET</span>=YourSecretHere</div>
                        <div><span className="text-emerald-400 font-bold">RAZORPAY_WEBHOOK_SECRET</span>=YourWebhookSecretHere</div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-3">
                      <button
                        type="submit"
                        className="rounded-full bg-[var(--primary)] px-6 py-2.5 text-xs font-bold text-white shadow-md hover:opacity-95 transition-all"
                      >
                        Save Payment Settings
                      </button>
                    </div>
                  </form>

                  {/* 📸 PAYMENT QR CODE MANAGEMENT SECTION */}
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-4">
                    <div>
                      <h4 className="text-xs font-black text-[var(--fg)] uppercase tracking-wider flex items-center gap-1.5">
                        <span>📸</span>
                        <span>Payment QR Code Image</span>
                      </h4>
                      <p className="text-[10px] text-[var(--muted-fg)] mt-0.5">Upload, replace, or delete the payment QR image scanned by customers during checkout.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                      {/* Left side: current QR image display */}
                      <div className="flex flex-col items-center justify-center p-4 border border-[var(--border)] bg-[var(--muted)] rounded-xl text-center space-y-3 min-h-[220px]">
                        {paymentSettings.qrCodeUploaded ? (
                          <>
                            <div className="p-2 bg-white rounded-lg border border-gray-200">
                              <img
                                src={`${paymentSettings.qrCodeUrl || '/api/payment-settings/qr-image'}?t=${Date.now()}`}
                                alt="Active payment QR code"
                                className="h-32 w-32 object-contain"
                              />
                            </div>
                            <div className="text-center space-y-1">
                              <span className="text-[9px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-2 py-0.5 rounded font-black uppercase block animate-pulse">Active QR</span>
                              {paymentSettings.qrCodeUploadedAt && (
                                <span className="text-[8px] text-[var(--muted-fg)] block">Uploaded: {new Date(paymentSettings.qrCodeUploadedAt).toLocaleString()}</span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={handleQrDelete}
                              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 border border-rose-500/25 rounded-xl px-4 py-1.5 text-[10px] font-black transition-all"
                            >
                              Delete QR Code
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="h-32 w-32 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 dark:border-zinc-800 p-4 bg-gray-50/50 dark:bg-zinc-900/50">
                              <span className="text-xl">⚠️</span>
                              <span className="text-[10px] font-black text-rose-500 mt-2 uppercase tracking-wide">Unavailable</span>
                            </div>
                            <p className="text-[10px] text-red-500 font-semibold px-2">No payment QR uploaded. Customers will see a "Payment QR is currently unavailable" message.</p>
                          </>
                        )}
                      </div>

                      {/* Right side: Uploader box */}
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-[var(--muted-fg)] uppercase block">Upload New QR Code Image</label>
                        <div className="border-2 border-dashed border-[var(--border)] hover:border-[var(--primary)] rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer relative bg-[var(--bg)] min-h-[160px] transition-all">
                          <input
                            type="file"
                            accept="image/png, image/jpeg, image/jpg, image/webp"
                            onChange={handleQrUpload}
                            disabled={isQrUploading}
                            className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                          />
                          {isQrUploading ? (
                            <div className="space-y-2">
                              <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--primary)] border-t-transparent mx-auto" />
                              <span className="text-xs font-bold text-[var(--muted-fg)] block">Uploading QR code...</span>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <span className="text-2xl block">📤</span>
                              <span className="text-xs font-bold text-[var(--fg)] block">Drag & drop or Click to browse</span>
                              <span className="text-[9px] text-[var(--muted-fg)] block">PNG, JPG, JPEG, or WebP up to 5MB</span>
                            </div>
                          )}
                        </div>

                        {qrUploadError && (
                          <p className="text-[10px] text-red-500 font-bold bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-2.5 rounded-lg flex items-center gap-1.5 animate-bounce">
                            <span>⚠️</span>
                            <span>{qrUploadError}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 🛡️ SECURITY & BILLING AUDIT TRAIL */}
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-3">
                    <div>
                      <h4 className="text-xs font-black text-[var(--fg)] uppercase tracking-wider flex items-center gap-1.5">
                        <span>🛡️</span>
                        <span>Billing & Security Audit Trail</span>
                      </h4>
                      <p className="text-[10px] text-[var(--muted-fg)] mt-0.5">Live immutable ledger recording all QR uploads, config updates, and order status adjustments.</p>
                    </div>

                    <div className="overflow-x-auto max-h-[220px] overflow-y-auto border border-[var(--border)] rounded-xl">
                      {auditLogs.length > 0 ? (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-[var(--muted)] border-b border-[var(--border)] text-[var(--muted-fg)] font-bold text-[9px] uppercase sticky top-0">
                              <th className="p-2.5">Timestamp</th>
                              <th className="p-2.5">User/Admin ID</th>
                              <th className="p-2.5">Action Event</th>
                              <th className="p-2.5">Operation Details</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)] text-[10px]">
                            {auditLogs.map((log) => (
                              <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-zinc-900/40">
                                <td className="p-2.5 font-mono text-[9px] text-[var(--muted-fg)]">{new Date(log.timestamp).toLocaleString()}</td>
                                <td className="p-2.5 font-mono font-bold text-gray-700 dark:text-gray-300">#{log.userId}</td>
                                <td className="p-2.5 font-bold text-[var(--fg)]">
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                    log.action.includes('Delete') ? 'bg-rose-500/10 text-rose-600' :
                                    log.action.includes('Upload') ? 'bg-emerald-500/10 text-emerald-600' : 'bg-blue-500/10 text-blue-600'
                                  }`}>
                                    {log.action}
                                  </span>
                                </td>
                                <td className="p-2.5 font-mono text-[9px] text-[var(--muted-fg)] break-all max-w-xs md:max-w-md">
                                  {JSON.stringify(log.details)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="p-6 text-center text-[var(--muted-fg)] text-xs">
                          No billing or QR code changes logged in this session.
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* CATEGORIES CRUD VIEW */}
              {activeTab === 'categories' && (
                <motion.div
                  key="categories"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-[var(--fg)]">📂 Category Matrix & Inventory Taxonomies</h3>
                      <p className="text-[10px] text-[var(--muted-fg)]">Manage product categories, emojis, and system tags across the store</p>
                    </div>
                  </div>
                  {/* Category List */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* List of current categories */}
                    <div className="md:col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-[var(--fg)]">Active Categories ({categoriesList.length})</h4>
                        <span className="text-[10px] text-[var(--muted-fg)]">Synced to Cloud Database</span>
                      </div>
                      <div className="divide-y divide-[var(--border)] font-medium text-xs max-h-[480px] overflow-y-auto pr-1">
                        {categoriesList.map((cat) => {
                          const count = products.filter(p => p.cat === cat.id).length;
                          const isMaster = cat.id === 'all';
                          return (
                            <div key={cat.id} className="flex items-center justify-between py-3">
                              <div className="flex items-center gap-2.5">
                                <span className="text-xl">{cat.emoji || '📦'}</span>
                                <div>
                                  <span className="font-extrabold text-[var(--fg)]">{cat.label}</span>
                                  <span className="text-[9px] font-mono text-[var(--muted-fg)] block">ID: {cat.id}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-fg)] font-bold">{count} Products</span>
                                {!isMaster ? (
                                  <button
                                    onClick={() => handleDeleteCategory(cat.id, cat.label)}
                                    className="text-[10px] font-bold text-rose-500 hover:text-rose-700 hover:underline cursor-pointer flex items-center gap-1 p-1"
                                    title="Delete category"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    <span>Delete</span>
                                  </button>
                                ) : (
                                  <span className="text-[9px] font-semibold text-[var(--muted-fg)] italic px-1">Master</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* Add Category form */}
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-4 h-fit">
                      <h4 className="text-xs font-bold text-[var(--fg)]">➕ Create Custom Category</h4>

                      {customCategoryError && (
                        <div className="rounded-xl bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-800 p-2.5 text-xs text-red-700 dark:text-red-300 font-semibold flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                          <span>{customCategoryError}</span>
                        </div>
                      )}

                      <div className="space-y-3 text-xs">
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold uppercase text-[var(--muted-fg)]">Category Display Label *</label>
                          <input
                            type="text"
                            value={customCategoryName}
                            onChange={(e) => {
                              setCustomCategoryName(e.target.value);
                              if (customCategoryError) setCustomCategoryError(null);
                            }}
                            placeholder="e.g. Exotic Berries, Organic Roots"
                            className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--input-bg)] outline-none text-xs text-[var(--fg)] focus:border-[var(--primary)]"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold uppercase text-[var(--muted-fg)]">Category Emoji Icon</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              maxLength={4}
                              value={customCategoryEmoji}
                              onChange={(e) => setCustomCategoryEmoji(e.target.value)}
                              placeholder="🥬"
                              className="w-12 text-center p-2 rounded-xl border border-[var(--border)] bg-[var(--input-bg)] outline-none text-base"
                            />
                            <div className="flex gap-1 flex-wrap">
                              {['🥦', '🥕', '🍓', '🍄', '🥑', '🌽', '🧄', '🥜'].map(em => (
                                <button
                                  key={em}
                                  type="button"
                                  onClick={() => setCustomCategoryEmoji(em)}
                                  className="text-sm hover:scale-125 transition-transform p-0.5 rounded cursor-pointer"
                                >
                                  {em}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isSavingCategory || !customCategoryName.trim()}
                          onClick={() => handleSaveCustomCategory('tab')}
                          className="w-full py-2.5 rounded-xl bg-[var(--primary)] text-white font-bold text-xs cursor-pointer hover:opacity-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                        >
                          {isSavingCategory ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          <span>Save & Sync Category</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* SYSTEM NOTIFICATIONS TAB */}
              {activeTab === 'notifications' && (
                <motion.div
                  key="notifications"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div>
                    <h3 className="text-sm font-black text-[var(--fg)]">📣 System Notifications & Broadcast Announcements</h3>
                    <p className="text-[10px] text-[var(--muted-fg)]">Send alerts, push-style alerts, order statuses, or discount banners to customers</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* History log of notifications */}
                    <div className="md:col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm space-y-4">
                      <h4 className="text-xs font-bold text-[var(--fg)]">Broadcast Log History</h4>
                      <div className="divide-y divide-[var(--border)] max-h-[400px] overflow-y-auto font-medium text-xs">
                        {(dbTables.notifications || []).length === 0 ? (
                          <p className="text-center py-6 text-[var(--muted-fg)] italic">No notifications dispatched yet.</p>
                        ) : (
                          [...(dbTables.notifications || [])].reverse().map((notif: any) => (
                            <div key={notif.id} className="py-3 flex justify-between items-start">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-extrabold text-[var(--fg)]">{notif.title || 'Notification Alert'}</span>
                                  <span className={`text-[8px] px-1.5 py-0.2 rounded font-black text-white ${notif.type === 'alert' ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                                    {notif.type || 'info'}
                                  </span>
                                </div>
                                <p className="text-[11px] text-[var(--muted-fg)]">{notif.message}</p>
                                <span className="text-[9px] font-mono text-[var(--muted-fg)] block">Target User ID: {notif.userId || 'Global'} • {new Date(notif.createdAt || Date.now()).toLocaleDateString('en-IN')}</span>
                              </div>
                              <button
                                onClick={() => handleDbRowDelete('notifications', notif.id)}
                                className="text-[10px] font-bold text-rose-500 hover:underline"
                              >
                                Recall
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    {/* Send announcement card */}
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm space-y-4">
                      <h4 className="text-xs font-bold text-[var(--fg)]">Dispatch Global Alert</h4>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const form = e.target as HTMLFormElement;
                          const title = (form.elements.namedItem('notif_title') as HTMLInputElement).value;
                          const message = (form.elements.namedItem('notif_msg') as HTMLInputElement).value;
                          const type = (form.elements.namedItem('notif_type') as HTMLSelectElement).value;
                          const userId = (form.elements.namedItem('notif_user') as HTMLInputElement).value || 'all';

                          try {
                            const res = await fetch('/api/admin/database/notifications/bulk-import', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                items: [{
                                  id: 'notif_' + Date.now(),
                                  title,
                                  message,
                                  type,
                                  userId,
                                  read: false,
                                  createdAt: new Date().toISOString()
                                }]
                              })
                            });
                            if (res.ok) {
                              setAdminSuccess('Notification broadcasted and synchronized to client instances successfully! 📣');
                              form.reset();
                              fetchDbTables();
                              onRefreshAllData?.();
                            }
                          } catch (err) {
                            setAdminError('Error broadcasting notification.');
                          }
                        }}
                        className="space-y-3 text-xs"
                      >
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold uppercase text-[var(--muted-fg)]">Notification Title *</label>
                          <input name="notif_title" required type="text" placeholder="e.g. 🌧️ Heavy Rain Alert!" className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--input-bg)] outline-none" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold uppercase text-[var(--muted-fg)]">Announcement Message *</label>
                          <textarea name="notif_msg" required rows={3} placeholder="e.g. Due to extreme rain, delivery may be delayed." className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--input-bg)] outline-none" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold uppercase text-[var(--muted-fg)]">Alert Type</label>
                          <select name="notif_type" className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--input-bg)] outline-none">
                            <option value="info">Information ℹ️</option>
                            <option value="alert">System Alert ⚠️</option>
                            <option value="promo">Promo Offer 🎁</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-bold uppercase text-[var(--muted-fg)]">Target User Email/ID (Optional)</label>
                          <input name="notif_user" type="text" placeholder="e.g. usr_12345 (or blank for global)" className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--input-bg)] outline-none" />
                        </div>
                        <button type="submit" className="w-full py-2.5 rounded-xl bg-[var(--primary)] text-white font-bold text-xs shadow-md">
                          Broadcast Notice Now
                        </button>
                      </form>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* FINANCIAL & MARGIN REPORTS TAB */}
              {activeTab === 'reports' && (
                <motion.div
                  key="reports"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div>
                    <h3 className="text-sm font-black text-[var(--fg)]">📊 Financial Reports & Data Exporters</h3>
                    <p className="text-[10px] text-[var(--muted-fg)]">Audited business sheets, payment histories, and product margin breakdowns</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm text-center">
                      <span className="text-[10px] uppercase font-bold text-[var(--muted-fg)]">Gross Revenue</span>
                      <span className="text-base font-black text-emerald-600 block">₹{totalRevenue.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm text-center">
                      <span className="text-[10px] uppercase font-bold text-[var(--muted-fg)]">Estimated Cost of Goods</span>
                      <span className="text-base font-black text-amber-600 block">₹{Math.round(totalCost).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm text-center">
                      <span className="text-[10px] uppercase font-bold text-[var(--muted-fg)]">Net Merchant Profit</span>
                      <span className="text-base font-black text-[var(--primary)] block">₹{Math.round(profit).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm text-center">
                      <span className="text-[10px] uppercase font-bold text-[var(--muted-fg)]">Avg. Order Value</span>
                      <span className="text-base font-black text-blue-600 block">
                        ₹{orders.length > 0 ? Math.round(totalRevenue / orders.length).toLocaleString('en-IN') : 0}
                      </span>
                    </div>
                  </div>

                  {/* Export Reports section */}
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-4">
                    <h4 className="text-xs font-bold text-[var(--fg)]">💾 Generate Master Data Sheets</h4>
                    <p className="text-[11px] text-[var(--muted-fg)]">Download pristine CSV/Excel-compatible formats containing full session tables, user accounts, and financial books directly compiled from the Cloud Run instance.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <button
                        onClick={() => {
                          setDbActiveSubTable('users');
                          setTimeout(exportDbTableToCsv, 100);
                        }}
                        className="p-4 rounded-xl border border-[var(--border)] bg-[var(--muted)] hover:bg-[var(--border)] text-left space-y-1"
                      >
                        <span className="font-extrabold text-xs text-[var(--fg)] block">👥 Users Audit Ledger</span>
                        <span className="text-[9px] text-[var(--muted-fg)]">Full user profiles, registration times, and account roles</span>
                      </button>
                      <button
                        onClick={() => {
                          setDbActiveSubTable('orders');
                          setTimeout(exportDbTableToCsv, 100);
                        }}
                        className="p-4 rounded-xl border border-[var(--border)] bg-[var(--muted)] hover:bg-[var(--border)] text-left space-y-1"
                      >
                        <span className="font-extrabold text-xs text-[var(--fg)] block">📦 Orders Sales Matrix</span>
                        <span className="text-[9px] text-[var(--muted-fg)]">Item breakdowns, delivery steps, addresses, and pricing details</span>
                      </button>
                      <button
                        onClick={() => {
                          setDbActiveSubTable('payments');
                          setTimeout(exportDbTableToCsv, 100);
                        }}
                        className="p-4 rounded-xl border border-[var(--border)] bg-[var(--muted)] hover:bg-[var(--border)] text-left space-y-1"
                      >
                        <span className="font-extrabold text-xs text-[var(--fg)] block">💳 Payments Ledger</span>
                        <span className="text-[9px] text-[var(--muted-fg)]">Bank UPI UTR tracking codes, amounts, and approvals status</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STORE CONFIGURATIONS TAB */}
              {activeTab === 'settings' && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div>
                    <h3 className="text-sm font-black text-[var(--fg)]">🛠️ Shop Configurations, Tax Levels & Service Thresholds</h3>
                    <p className="text-[10px] text-[var(--muted-fg)]">Adjust delivery operational limits, State GST tax, shipping costs, and support parameters dynamically in the database.</p>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      fetch('/api/admin/business-settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(shopSettings)
                      })
                      .then(res => res.json())
                      .then(data => {
                        if (data.success) {
                          setAdminSuccess('Store operational and tax parameters updated successfully on the server! ✨');
                        }
                      })
                      .catch(err => setAdminError('Error saving shop configurations: ' + err));
                    }}
                    className="space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm text-xs font-medium"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">Minimum Order Value for Free Delivery (₹)</label>
                        <input
                          type="number"
                          value={shopSettings.minFreeDelivery}
                          onChange={(e) => setShopSettings(prev => ({ ...prev, minFreeDelivery: Number(e.target.value) }))}
                          className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">Standard Shipping Charge (₹)</label>
                        <input
                          type="number"
                          value={shopSettings.standardShipping}
                          onChange={(e) => setShopSettings(prev => ({ ...prev, standardShipping: Number(e.target.value) }))}
                          className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">Default State Goods &amp; Services Tax (GST %)</label>
                        <input
                          type="number"
                          min="0"
                          max="28"
                          value={shopSettings.gstPercentage || 5}
                          onChange={(e) => setShopSettings(prev => ({ ...prev, gstPercentage: Number(e.target.value) }))}
                          className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">Operational Hours (Start Time)</label>
                        <input
                          type="text"
                          value={shopSettings.operationalHoursStart}
                          onChange={(e) => setShopSettings(prev => ({ ...prev, operationalHoursStart: e.target.value }))}
                          className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">Operational Hours (End Time)</label>
                        <input
                          type="text"
                          value={shopSettings.operationalHoursEnd}
                          onChange={(e) => setShopSettings(prev => ({ ...prev, operationalHoursEnd: e.target.value }))}
                          className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">Live Hotline/Support Phone</label>
                        <input
                          type="text"
                          value={shopSettings.supportPhone || ""}
                          placeholder="99203 24172"
                          onChange={(e) => setShopSettings(prev => ({ ...prev, supportPhone: e.target.value }))}
                          className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">Official Shop/Business Name</label>
                        <input
                          type="text"
                          value={shopSettings.businessName || ""}
                          placeholder="Sabjies"
                          onChange={(e) => setShopSettings(prev => ({ ...prev, businessName: e.target.value }))}
                          className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">Customer Support Email</label>
                        <input
                          type="email"
                          value={shopSettings.supportEmail || ""}
                          placeholder="greensabjies@gmail.com"
                          onChange={(e) => setShopSettings(prev => ({ ...prev, supportEmail: e.target.value }))}
                          className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">Official Website</label>
                        <input
                          type="text"
                          value={shopSettings.website || ""}
                          onChange={(e) => setShopSettings(prev => ({ ...prev, website: e.target.value }))}
                          className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">GST Number (GSTIN)</label>
                        <input
                          type="text"
                          value={shopSettings.gstNumber || ""}
                          onChange={(e) => setShopSettings(prev => ({ ...prev, gstNumber: e.target.value }))}
                          className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">FSSAI License Number</label>
                        <input
                          type="text"
                          value={shopSettings.fssaiLicense || ""}
                          onChange={(e) => setShopSettings(prev => ({ ...prev, fssaiLicense: e.target.value }))}
                          className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">Business Registration Number</label>
                        <input
                          type="text"
                          value={shopSettings.businessRegistrationNumber || ""}
                          onChange={(e) => setShopSettings(prev => ({ ...prev, businessRegistrationNumber: e.target.value }))}
                          className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 md:col-span-2">
                        <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">APMC Warehouse Base Address</label>
                        <input
                          type="text"
                          value={shopSettings.address || ""}
                          onChange={(e) => setShopSettings(prev => ({ ...prev, address: e.target.value }))}
                          className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-3 md:col-span-2 pt-2">
                        <input
                          type="checkbox"
                          id="isOpenToggle"
                          checked={shopSettings.isOpen}
                          onChange={(e) => setShopSettings(prev => ({ ...prev, isOpen: e.target.checked }))}
                          className="h-4.5 w-4.5 rounded text-[var(--primary)] border-[var(--border)] outline-none cursor-pointer"
                        />
                        <label htmlFor="isOpenToggle" className="text-xs font-bold text-[var(--fg)] cursor-pointer">
                          🟢 Store Front is OPEN &amp; Accepting New Cart Checkout Orders
                        </label>
                      </div>

                      <div className="md:col-span-2 border-t border-[var(--border)] pt-4 mt-2">
                        <span className="text-[10px] font-black uppercase text-[var(--fg)] tracking-wider block mb-3">📸 Instagram Campaign Settings (Banners & Profile)</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex items-center gap-3 pt-1">
                            <input
                              type="checkbox"
                              id="enableIgBannerToggle"
                              checked={shopSettings.enableIgBanner}
                              onChange={(e) => setShopSettings(prev => ({ ...prev, enableIgBanner: e.target.checked }))}
                              className="h-4.5 w-4.5 rounded text-[var(--primary)] border-[var(--border)] outline-none cursor-pointer"
                            />
                            <label htmlFor="enableIgBannerToggle" className="text-xs font-bold text-[var(--fg)] cursor-pointer">
                              🎁 Enable Instagram Promo Banner (Home, Checkout, Success)
                            </label>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">Instagram Profile/Campaign URL</label>
                            <input
                              type="url"
                              value={shopSettings.igProfileUrl || ""}
                              onChange={(e) => setShopSettings(prev => ({ ...prev, igProfileUrl: e.target.value }))}
                              placeholder="e.g. https://www.instagram.com/sabjies?igsh=MWp6cDQ2NHZtcnE0Zw"
                              className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5 md:col-span-2">
                            <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">Instagram Promo Banner Text</label>
                            <input
                              type="text"
                              value={shopSettings.igBannerText || ""}
                              onChange={(e) => setShopSettings(prev => ({ ...prev, igBannerText: e.target.value }))}
                              placeholder="e.g. 🎁 Follow us on Instagram for exclusive discount codes."
                              className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs text-[var(--fg)] outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end pt-2">
                      <button type="submit" className="rounded-full bg-[var(--primary)] px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-700 transition-all cursor-pointer">
                        Save Shop Configurations
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {/* SECURITY & ACTIVITY AUDIT TAB */}
              {activeTab === 'activity-logs' && (
                <motion.div
                  key="activity-logs"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div>
                    <h3 className="text-sm font-black text-[var(--fg)]">🛡️ Security Logs & Authentication Audits</h3>
                    <p className="text-[10px] text-[var(--muted-fg)]">Track login attempts, active sessions, and credential resets</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Login history */}
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm space-y-3">
                      <h4 className="text-xs font-bold text-[var(--fg)]">Recent Login Attempts</h4>
                      <div className="divide-y divide-[var(--border)] max-h-[300px] overflow-y-auto font-mono text-[10px] space-y-2">
                        {(dbTables.loginHistory || []).length === 0 ? (
                          <p className="text-center py-6 text-[var(--muted-fg)] italic">No security history available.</p>
                        ) : (
                          [...(dbTables.loginHistory || [])].reverse().slice(0, 50).map((log: any, idx: number) => (
                            <div key={idx} className="py-2 text-[10px] text-[var(--muted-fg)]">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-[var(--fg)]">{log.identifier || log.email || 'System user'}</span>
                                <span className={`text-[8px] px-1 rounded ${log.success ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                                  {log.success ? 'SUCCESS' : 'FAILED'}
                                </span>
                              </div>
                              <p className="text-[9px] mt-0.5">IP: {log.ip || 'Localhost'} • Agent: {log.userAgent?.slice(0, 40) || 'API Probe'}</p>
                              <span className="text-[8px] block mt-0.5">{new Date(log.timestamp || log.createdAt).toLocaleString('en-IN')}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Password reset & session audit */}
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm space-y-3">
                      <h4 className="text-xs font-bold text-[var(--fg)]">Active Sessions & Token Vault</h4>
                      <div className="divide-y divide-[var(--border)] max-h-[300px] overflow-y-auto font-mono text-[10px] space-y-2">
                        {(dbTables.sessions || []).length === 0 ? (
                          <p className="text-center py-6 text-[var(--muted-fg)] italic">No active tokens registered.</p>
                        ) : (
                          [...(dbTables.sessions || [])].reverse().slice(0, 50).map((sess: any, idx: number) => (
                            <div key={idx} className="py-2 text-[10px] text-[var(--muted-fg)]">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-[var(--fg)]">Session ID: {String(sess.id).slice(0, 10)}...</span>
                                <span className="text-[8px] px-1 rounded bg-blue-500/10 text-blue-600">ACTIVE</span>
                              </div>
                              <p className="text-[9px] mt-0.5">User ID: {sess.userId || 'Guest'}</p>
                              <span className="text-[8px] block mt-0.5 font-mono">Expires: {new Date(sess.expiresAt || Date.now() + 86400000).toLocaleString('en-IN')}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'database' && (
                <motion.div
                  key="database"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-black text-[var(--fg)]">⚙️ Master Relational Database Management</h3>
                      <p className="text-[10px] text-[var(--muted-fg)]">Direct local file-system transactional tables & audit logs</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={fetchDbTables}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[10px] font-bold text-[var(--fg)] hover:bg-[var(--muted)]"
                      >
                        <RefreshCw className={`h-3 w-3 ${dbIsLoading ? 'animate-spin' : ''}`} />
                        <span>Force Sync</span>
                      </button>
                      <button
                        onClick={exportDbTableToCsv}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-[10px] font-bold hover:opacity-90"
                      >
                        <span>Export CSV</span>
                      </button>
                      <button
                        onClick={() => setDbShowImportModal(true)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-[10px] font-bold hover:opacity-90"
                      >
                        <span>Import Bulk</span>
                      </button>
                    </div>
                  </div>

                  {/* Supabase Status Banner */}
                  <div className={`p-4 rounded-2xl border ${supabaseStatus?.configured ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'} space-y-3`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl ${supabaseStatus?.configured ? 'bg-emerald-500/20 text-emerald-600' : 'bg-amber-500/20 text-amber-600'}`}>
                          <Database className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-black text-[var(--fg)] uppercase tracking-wider">
                              Supabase PostgreSQL Integration
                            </h4>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold ${supabaseStatus?.configured ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                              {supabaseStatus?.configured ? 'Connected & Active' : 'Setup Required'}
                            </span>
                          </div>
                          <p className="text-[10px] text-[var(--muted-fg)] font-medium mt-0.5">
                            {supabaseStatus?.configured
                              ? `Database Endpoint: ${supabaseStatus.databaseUrl}`
                              : 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment variables to enable durable PostgreSQL storage.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={checkSupabaseStatus}
                          className="px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[10px] font-bold text-[var(--fg)] hover:bg-[var(--muted)]"
                        >
                          Check Status
                        </button>
                        {supabaseStatus?.configured && (
                          <button
                            type="button"
                            onClick={handleSyncSupabase}
                            disabled={isSyncingSupabase}
                            className="px-3 py-1.5 rounded-xl bg-[var(--primary)] text-white text-[10px] font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <RefreshCw className={`h-3 w-3 ${isSyncingSupabase ? 'animate-spin' : ''}`} />
                            <span>{isSyncingSupabase ? 'Syncing...' : 'Sync All JSON to Supabase'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Table Selection Pills */}

                  <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] pb-3">
                    {Object.keys(dbTables).map((tbl) => {
                      const count = (dbTables[tbl] || []).length;
                      return (
                        <button
                          key={tbl}
                          onClick={() => {
                            setDbActiveSubTable(tbl);
                            setDbSelectedRowIds([]);
                          }}
                          className={`px-3 py-1.5 rounded-full text-[10px] font-bold capitalize transition-all ${
                            dbActiveSubTable === tbl
                              ? 'bg-[var(--primary)] text-white shadow-sm'
                              : 'bg-[var(--muted)] text-[var(--muted-fg)] hover:text-[var(--fg)]'
                          }`}
                        >
                          {tbl.replace(/([A-Z])/g, ' $1')} ({count})
                        </button>
                      );
                    })}
                  </div>

                  {/* Advanced Filter and Control Section */}
                  <div className="bg-[var(--muted)]/50 p-4 rounded-2xl border border-[var(--border)] space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Global Search */}
                      <div className="flex-1 min-w-[200px]">
                        <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase block mb-1">Global Query Search</label>
                        <input
                          type="text"
                          placeholder={`Search table fields...`}
                          value={dbSearch}
                          onChange={(e) => {
                            setDbSearch(e.target.value);
                            setDbPage(1);
                          }}
                          className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                        />
                      </div>

                      {/* Date Range Start */}
                      <div className="w-full sm:w-auto">
                        <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase block mb-1">Start Date</label>
                        <input
                          type="date"
                          value={dbStartDate}
                          onChange={(e) => {
                            setDbStartDate(e.target.value);
                            setDbPage(1);
                          }}
                          className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-1.5 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>

                      {/* Date Range End */}
                      <div className="w-full sm:w-auto">
                        <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase block mb-1">End Date</label>
                        <input
                          type="date"
                          value={dbEndDate}
                          onChange={(e) => {
                            setDbEndDate(e.target.value);
                            setDbPage(1);
                          }}
                          className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-1.5 text-xs text-[var(--fg)] outline-none"
                        />
                      </div>

                      {/* Action buttons */}
                      <div className="w-full sm:w-auto self-end flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDbStartDate('');
                            setDbEndDate('');
                            setDbSearch('');
                            setDbAdvancedFilters({
                              status: 'all',
                              stockLevel: 'all',
                              priceLevel: 'all',
                              datePeriod: 'all',
                              paymentStatus: 'all',
                              ratingLevel: 'all',
                              verified: 'all',
                              role: 'all',
                            });
                            setDbPage(1);
                          }}
                          className="px-3 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--muted)] text-[10px] font-bold text-[var(--fg)]"
                        >
                          Clear Filters
                        </button>
                      </div>
                    </div>

                    {/* Table-specific Custom Advanced Filters */}
                    <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[var(--border)] text-xs">
                      {dbActiveSubTable === 'users' && (
                        <>
                          <div className="flex flex-col">
                            <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase mb-1">Role Filter</label>
                            <select
                              value={dbAdvancedFilters.role || 'all'}
                              onChange={(e) => {
                                setDbAdvancedFilters({ ...dbAdvancedFilters, role: e.target.value });
                                setDbPage(1);
                              }}
                              className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-1.5 text-xs text-[var(--fg)] outline-none"
                            >
                              <option value="all">All Roles</option>
                              <option value="admin">Admin Only</option>
                              <option value="customer">Customer Only</option>
                            </select>
                          </div>
                          <div className="flex flex-col">
                            <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase mb-1">Verification</label>
                            <select
                              value={dbAdvancedFilters.verified || 'all'}
                              onChange={(e) => {
                                setDbAdvancedFilters({ ...dbAdvancedFilters, verified: e.target.value });
                                setDbPage(1);
                              }}
                              className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-1.5 text-xs text-[var(--fg)] outline-none"
                            >
                              <option value="all">All Status</option>
                              <option value="true">Verified Only</option>
                              <option value="false">Unverified Only</option>
                            </select>
                          </div>
                        </>
                      )}

                      {dbActiveSubTable === 'products' && (
                        <>
                          <div className="flex flex-col">
                            <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase mb-1">Stock Level</label>
                            <select
                              value={dbAdvancedFilters.stockLevel || 'all'}
                              onChange={(e) => {
                                setDbAdvancedFilters({ ...dbAdvancedFilters, stockLevel: e.target.value });
                                setDbPage(1);
                              }}
                              className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-1.5 text-xs text-[var(--fg)] outline-none"
                            >
                              <option value="all">All Inventory</option>
                              <option value="outOfStock">Out of Stock ✕</option>
                              <option value="lowStock">Low Stock (≤ 10)</option>
                              <option value="instock">Good Stock (&gt; 10)</option>
                            </select>
                          </div>
                          <div className="flex flex-col">
                            <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase mb-1">Price tier</label>
                            <select
                              value={dbAdvancedFilters.priceLevel || 'all'}
                              onChange={(e) => {
                                setDbAdvancedFilters({ ...dbAdvancedFilters, priceLevel: e.target.value });
                                setDbPage(1);
                              }}
                              className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-1.5 text-xs text-[var(--fg)] outline-none"
                            >
                              <option value="all">All Prices</option>
                              <option value="budget">Budget (≤ ₹100)</option>
                              <option value="premium">Premium (&gt; ₹100)</option>
                            </select>
                          </div>
                        </>
                      )}

                      {dbActiveSubTable === 'orders' && (
                        <>
                          <div className="flex flex-col">
                            <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase mb-1">Order Status</label>
                            <select
                              value={dbAdvancedFilters.status || 'all'}
                              onChange={(e) => {
                                setDbAdvancedFilters({ ...dbAdvancedFilters, status: e.target.value });
                                setDbPage(1);
                              }}
                              className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-1.5 text-xs text-[var(--fg)] outline-none"
                            >
                              <option value="all">All Orders</option>
                              <option value="Pending">Pending</option>
                              <option value="Accepted">Accepted</option>
                              <option value="Out for Delivery">Out for Delivery</option>
                              <option value="Delivered">Delivered</option>
                              <option value="Cancelled">Cancelled</option>
                            </select>
                          </div>
                          <div className="flex flex-col">
                            <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase mb-1">Payment Status</label>
                            <select
                              value={dbAdvancedFilters.paymentStatus || 'all'}
                              onChange={(e) => {
                                setDbAdvancedFilters({ ...dbAdvancedFilters, paymentStatus: e.target.value });
                                setDbPage(1);
                              }}
                              className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-1.5 text-xs text-[var(--fg)] outline-none"
                            >
                              <option value="all">All Payments</option>
                              <option value="Pending">Pending</option>
                              <option value="Paid">Paid</option>
                              <option value="Failed">Failed</option>
                            </select>
                          </div>
                          <div className="flex flex-col">
                            <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase mb-1">Quick Date</label>
                            <select
                              value={dbAdvancedFilters.datePeriod || 'all'}
                              onChange={(e) => {
                                setDbAdvancedFilters({ ...dbAdvancedFilters, datePeriod: e.target.value });
                                setDbPage(1);
                              }}
                              className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-1.5 text-xs text-[var(--fg)] outline-none"
                            >
                              <option value="all">All Time</option>
                              <option value="today">Today</option>
                              <option value="week">This Week</option>
                              <option value="month">This Month</option>
                            </select>
                          </div>
                        </>
                      )}

                      {dbActiveSubTable === 'payments' && (
                        <div className="flex flex-col">
                          <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase mb-1">Payment Status</label>
                          <select
                            value={dbAdvancedFilters.paymentStatus || 'all'}
                            onChange={(e) => {
                              setDbAdvancedFilters({ ...dbAdvancedFilters, paymentStatus: e.target.value });
                              setDbPage(1);
                            }}
                            className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-1.5 text-xs text-[var(--fg)] outline-none"
                          >
                            <option value="all">All Payments</option>
                            <option value="Pending">Pending</option>
                            <option value="Paid">Paid</option>
                            <option value="Failed">Failed</option>
                            <option value="Rejected">Rejected</option>
                          </select>
                        </div>
                      )}

                      {dbActiveSubTable === 'reviews' && (
                        <div className="flex flex-col">
                          <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase mb-1">Rating Stars</label>
                          <select
                            value={dbAdvancedFilters.ratingLevel || 'all'}
                            onChange={(e) => {
                              setDbAdvancedFilters({ ...dbAdvancedFilters, ratingLevel: e.target.value });
                              setDbPage(1);
                            }}
                            className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-1.5 text-xs text-[var(--fg)] outline-none"
                          >
                            <option value="all">All Stars ⭐</option>
                            <option value="5">5 Stars ⭐⭐⭐⭐⭐</option>
                            <option value="4">4 Stars ⭐⭐⭐⭐</option>
                            <option value="3">3 Stars ⭐⭐⭐</option>
                            <option value="2">2 Stars ⭐⭐</option>
                            <option value="1">1 Star ⭐</option>
                          </select>
                        </div>
                      )}

                      {/* Column Visibility Selector pills */}
                      {(dbTables[dbActiveSubTable] || []).length > 0 && (
                        <div className="flex-1">
                          <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase block mb-1">Column Visibility toggles</label>
                          <div className="flex flex-wrap gap-1">
                            {Object.keys((dbTables[dbActiveSubTable] || [])[0]).map((col) => {
                              const hiddenCols = dbColumnVisibility[dbActiveSubTable] || [];
                              const isVisible = !hiddenCols.includes(col);
                              return (
                                <button
                                  key={col}
                                  type="button"
                                  onClick={() => {
                                    const currentHidden = dbColumnVisibility[dbActiveSubTable] || [];
                                    const nextHidden = currentHidden.includes(col)
                                      ? currentHidden.filter((c) => c !== col)
                                      : [...currentHidden, col];
                                    setDbColumnVisibility({
                                      ...dbColumnVisibility,
                                      [dbActiveSubTable]: nextHidden,
                                    });
                                  }}
                                  className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold transition-all ${
                                    isVisible ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-gray-400/10 text-gray-400 border border-transparent'
                                  }`}
                                >
                                  {isVisible ? '👁️' : '🙈'} {col}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Selected items actions and bulk triggers */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-[var(--muted-fg)] tracking-wider">
                      {dbSelectedRowIds.length} Record(s) Selected
                    </span>
                    <div className="flex gap-2">
                      {dbSelectedRowIds.length > 0 && (
                        <>
                          <button
                            onClick={() => setDbShowBulkUpdateModal(true)}
                            className="px-3.5 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:opacity-95 flex items-center gap-1.5"
                          >
                            <span>Bulk Update</span>
                          </button>
                          <button
                            onClick={handleDbBulkDelete}
                            className="px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:opacity-95 flex items-center gap-1.5"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Delete Selected</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Table view */}
                  <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
                    {dbIsLoading ? (
                      <div className="p-12 text-center text-xs text-[var(--muted-fg)]">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-[var(--primary)]" />
                        <span>Loading transactional tables from server...</span>
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-zinc-900 border-b border-[var(--border)] text-[var(--muted-fg)] uppercase font-bold text-[9px]">
                            <th className="p-3 w-8">
                              <input
                                type="checkbox"
                                checked={
                                  (dbTables[dbActiveSubTable] || []).length > 0 &&
                                  dbSelectedRowIds.length === (dbTables[dbActiveSubTable] || []).length
                                }
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setDbSelectedRowIds((dbTables[dbActiveSubTable] || []).map((r: any) => String(r.id)));
                                  } else {
                                    setDbSelectedRowIds([]);
                                  }
                                }}
                                className="h-3.5 w-3.5 rounded accent-[var(--primary)]"
                              />
                            </th>
                            {/* Dynamic sorted columns */}
                            {(() => {
                              const rows = dbTables[dbActiveSubTable] || [];
                              if (rows.length === 0) return <th className="p-3">No Columns</th>;
                              const hiddenCols = dbColumnVisibility[dbActiveSubTable] || [];

                              return Object.keys(rows[0]).map((col) => {
                                if (hiddenCols.includes(col)) return null;
                                const isSorted = dbSortColumn === col;
                                return (
                                  <th
                                    key={col}
                                    onClick={() => {
                                      if (dbSortColumn === col) {
                                        setDbSortDirection(dbSortDirection === 'asc' ? 'desc' : 'asc');
                                      } else {
                                        setDbSortColumn(col);
                                        setDbSortDirection('asc');
                                      }
                                    }}
                                    className="p-3 cursor-pointer hover:bg-[var(--muted)] select-none whitespace-nowrap"
                                  >
                                    <div className="flex items-center gap-1">
                                      <span>{col}</span>
                                      {isSorted && (
                                        <span>{dbSortDirection === 'asc' ? '▲' : '▼'}</span>
                                      )}
                                    </div>
                                  </th>
                                );
                              });
                            })()}
                            <th className="p-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {(() => {
                            const rawRows = dbTables[dbActiveSubTable] || [];

                            // Filter rows
                            let filtered = rawRows.filter((row: any) => {
                              // Global search
                              if (dbSearch.trim() !== '') {
                                const term = dbSearch.toLowerCase();
                                const matchesSearch = Object.values(row).some((v) =>
                                  String(v).toLowerCase().includes(term)
                                );
                                if (!matchesSearch) return false;
                              }

                              // Date range filter
                              const dateField = row.createdAt || row.date || row.registrationDate || row.timestamp;
                              if (dateField) {
                                const rowTime = new Date(dateField).getTime();
                                if (dbStartDate) {
                                  const startSecs = new Date(dbStartDate).getTime();
                                  if (rowTime < startSecs) return false;
                                }
                                if (dbEndDate) {
                                  const endSecs = new Date(dbEndDate).getTime() + 86400000;
                                  if (rowTime > endSecs) return false;
                                }
                              }

                              // Table-specific filters
                              if (dbActiveSubTable === 'users') {
                                if (dbAdvancedFilters.role && dbAdvancedFilters.role !== 'all') {
                                  if (row.role !== dbAdvancedFilters.role) return false;
                                }
                                if (dbAdvancedFilters.verified && dbAdvancedFilters.verified !== 'all') {
                                  const isVer = dbAdvancedFilters.verified === 'true';
                                  if (row.verified !== isVer) return false;
                                }
                              }

                              if (dbActiveSubTable === 'products') {
                                if (dbAdvancedFilters.stockLevel && dbAdvancedFilters.stockLevel !== 'all') {
                                  const stock = Number(row.stock || 0);
                                  if (dbAdvancedFilters.stockLevel === 'outOfStock' && stock > 0) return false;
                                  if (dbAdvancedFilters.stockLevel === 'lowStock' && (stock === 0 || stock > 10)) return false;
                                  if (dbAdvancedFilters.stockLevel === 'instock' && stock <= 10) return false;
                                }
                                if (dbAdvancedFilters.priceLevel && dbAdvancedFilters.priceLevel !== 'all') {
                                  const price = Number(row.price || 0);
                                  if (dbAdvancedFilters.priceLevel === 'budget' && price > 100) return false;
                                  if (dbAdvancedFilters.priceLevel === 'premium' && price <= 100) return false;
                                }
                              }

                              if (dbActiveSubTable === 'orders') {
                                if (dbAdvancedFilters.status && dbAdvancedFilters.status !== 'all') {
                                  if (row.status !== dbAdvancedFilters.status) return false;
                                }
                                if (dbAdvancedFilters.paymentStatus && dbAdvancedFilters.paymentStatus !== 'all') {
                                  if (row.paymentStatus !== dbAdvancedFilters.paymentStatus) return false;
                                }
                                if (dbAdvancedFilters.datePeriod && dbAdvancedFilters.datePeriod !== 'all') {
                                  const rowDate = new Date(row.date || row.createdAt || Date.now());
                                  const diffMs = Date.now() - rowDate.getTime();
                                  const diffDays = diffMs / (1000 * 60 * 60 * 24);
                                  if (dbAdvancedFilters.datePeriod === 'today' && diffDays > 1) return false;
                                  if (dbAdvancedFilters.datePeriod === 'week' && diffDays > 7) return false;
                                  if (dbAdvancedFilters.datePeriod === 'month' && diffDays > 30) return false;
                                }
                              }

                              if (dbActiveSubTable === 'payments') {
                                if (dbAdvancedFilters.paymentStatus && dbAdvancedFilters.paymentStatus !== 'all') {
                                  if (row.status !== dbAdvancedFilters.paymentStatus) return false;
                                }
                              }

                              if (dbActiveSubTable === 'reviews') {
                                if (dbAdvancedFilters.ratingLevel && dbAdvancedFilters.ratingLevel !== 'all') {
                                  if (String(row.rating) !== dbAdvancedFilters.ratingLevel) return false;
                                }
                              }

                              return true;
                            });

                            // Sort rows
                            if (dbSortColumn) {
                              filtered = [...filtered].sort((a: any, b: any) => {
                                let valA = a[dbSortColumn];
                                let valB = b[dbSortColumn];

                                if (typeof valA === 'string') valA = valA.toLowerCase();
                                if (typeof valB === 'string') valB = valB.toLowerCase();

                                if (valA < valB) return dbSortDirection === 'asc' ? -1 : 1;
                                if (valA > valB) return dbSortDirection === 'asc' ? 1 : -1;
                                return 0;
                              });
                            }

                            // Paginate rows
                            const totalFiltered = filtered.length;
                            const maxPages = Math.ceil(totalFiltered / dbPageSize) || 1;
                            const paginated = filtered.slice((dbPage - 1) * dbPageSize, dbPage * dbPageSize);

                            if (paginated.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={15} className="p-8 text-center text-[var(--muted-fg)] italic">
                                    No records found matching current query filters.
                                  </td>
                                </tr>
                              );
                            }

                            return (
                              <>
                                {paginated.map((row: any, rIdx: number) => {
                                  const hiddenCols = dbColumnVisibility[dbActiveSubTable] || [];
                                  const rowKey = row.id !== undefined && row.id !== null ? String(row.id) : `db-row-${dbActiveSubTable}-${rIdx}`;
                                  return (
                                    <tr key={rowKey} className="hover:bg-[var(--muted)]/40 transition-colors">
                                      <td className="p-3">
                                        <input
                                          type="checkbox"
                                          checked={dbSelectedRowIds.includes(String(row.id))}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setDbSelectedRowIds([...dbSelectedRowIds, String(row.id)]);
                                            } else {
                                              setDbSelectedRowIds(dbSelectedRowIds.filter((id) => id !== String(row.id)));
                                            }
                                          }}
                                          className="h-3.5 w-3.5 rounded accent-[var(--primary)]"
                                        />
                                      </td>
                                      {Object.keys(row).map((col) => {
                                        if (hiddenCols.includes(col)) return null;
                                        const val = row[col];
                                        const isScreenshot = col.toLowerCase().includes('screenshot') || col.toLowerCase().includes('proof') || (typeof val === 'string' && (val.match(/\.(jpg|jpeg|png|webp|gif)/i) || val.startsWith('data:image/')));
                                        return (
                                          <td key={col} className="p-3 max-w-[180px] truncate font-mono text-[10px]">
                                            {typeof val === 'object' ? (
                                              <span className="text-[9px] bg-[var(--muted)] px-1 py-0.5 rounded text-[var(--muted-fg)] font-mono">
                                                {JSON.stringify(val)}
                                              </span>
                                            ) : col === 'status' || col === 'paymentStatus' ? (
                                              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                                val === 'delivered' || val === 'Paid'
                                                  ? 'bg-emerald-500/10 text-emerald-600'
                                                  : val === 'cancelled' || val === 'Failed' || val === 'Rejected'
                                                  ? 'bg-rose-500/10 text-rose-600'
                                                  : 'bg-amber-500/10 text-amber-600'
                                              }`}>
                                                {String(val)}
                                              </span>
                                            ) : isScreenshot && val ? (
                                              <div className="flex items-center gap-1.5">
                                                <img
                                                  src={String(val)}
                                                  alt="Proof"
                                                  className="h-8 w-8 object-cover rounded border border-[var(--border)] shadow-sm bg-[var(--muted)]"
                                                  referrerPolicy="no-referrer"
                                                  onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                  }}
                                                />
                                                <a
                                                  href={String(val)}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="text-[9px] font-bold text-emerald-600 hover:underline"
                                                >
                                                  View
                                                </a>
                                              </div>
                                            ) : String(val).startsWith('http') ? (
                                              <a href={String(val)} target="_blank" rel="noreferrer" className="text-emerald-500 hover:underline">
                                                View Link
                                              </a>
                                            ) : (
                                              String(val)
                                            )}
                                          </td>
                                        );
                                      })}
                                      <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                                        <button
                                          onClick={() => setDbViewRow({ ...row })}
                                          className="text-emerald-600 hover:underline font-bold"
                                        >
                                          View
                                        </button>
                                        <button
                                          onClick={() => setDbEditRow({ ...row })}
                                          className="text-blue-500 hover:underline"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          onClick={() => handleDbRowDelete(dbActiveSubTable, row.id)}
                                          className="text-rose-500 hover:underline font-bold"
                                        >
                                          ✕
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}

                                {/* Pagination controller block */}
                                <tr className="bg-gray-50/50 dark:bg-zinc-900/50">
                                  <td colSpan={15} className="p-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-bold text-[var(--muted-fg)]">
                                      <div className="flex items-center gap-2">
                                        <span>Show Page Size:</span>
                                        <select
                                          value={dbPageSize}
                                          onChange={(e) => {
                                            setDbPageSize(Number(e.target.value));
                                            setDbPage(1);
                                          }}
                                          className="rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-1 text-[var(--fg)] outline-none"
                                        >
                                          <option value={10}>10 records</option>
                                          <option value={25}>25 records</option>
                                          <option value={50}>50 records</option>
                                          <option value={100}>100 records</option>
                                        </select>
                                        <span>• Showing {(dbPage - 1) * dbPageSize + 1} - {Math.min(dbPage * dbPageSize, totalFiltered)} of {totalFiltered} rows</span>
                                      </div>
                                      <div className="flex items-center gap-1.5 self-end sm:self-auto">
                                        <button
                                          type="button"
                                          disabled={dbPage === 1}
                                          onClick={() => setDbPage(p => Math.max(1, p - 1))}
                                          className="px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[10px] hover:bg-[var(--muted)] disabled:opacity-40"
                                        >
                                          Prev
                                        </button>
                                        <span className="px-3">Page {dbPage} of {maxPages}</span>
                                        <button
                                          type="button"
                                          disabled={dbPage >= maxPages}
                                          onClick={() => setDbPage(p => Math.min(maxPages, p + 1))}
                                          className="px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[10px] hover:bg-[var(--muted)] disabled:opacity-40"
                                        >
                                          Next
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              </>
                            );
                          })()}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Edit Row Overlay Modal */}
                  {dbEditRow && (
                    <div className="fixed inset-0 z-600 flex items-center justify-center p-4">
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDbEditRow(null)} />
                      <form
                        onSubmit={handleDbRowEditSubmit}
                        className="relative z-10 max-w-lg w-full bg-[var(--card)] rounded-3xl p-6 shadow-2xl border border-[var(--border)] space-y-4"
                      >
                        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                          <h4 className="text-xs font-extrabold text-[var(--fg)] uppercase tracking-wider">
                            📝 Edit Row #{dbEditRow.id} ({dbActiveSubTable})
                          </h4>
                          <button
                            type="button"
                            onClick={() => setDbEditRow(null)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--muted)] hover:bg-gray-200 transition-all text-[var(--fg)]"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                          {Object.keys(dbEditRow).map((key) => {
                            if (key === 'id') return null; // ID is read-only
                            const val = dbEditRow[key];
                            return (
                              <div key={key} className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">{key}</label>
                                {typeof val === 'boolean' ? (
                                  <select
                                    value={String(dbEditRow[key])}
                                    onChange={(e) => setDbEditRow({ ...dbEditRow, [key]: e.target.value === 'true' })}
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-2 text-xs outline-none focus:border-[var(--primary)]"
                                  >
                                    <option value="true">True</option>
                                    <option value="false">False</option>
                                  </select>
                                ) : typeof val === 'object' ? (
                                  <textarea
                                    value={JSON.stringify(dbEditRow[key])}
                                    onChange={(e) => {
                                      try {
                                        setDbEditRow({ ...dbEditRow, [key]: JSON.parse(e.target.value) });
                                      } catch (err) {
                                        // silent fail or keep as text until submit
                                      }
                                    }}
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-2 text-xs font-mono outline-none focus:border-[var(--primary)]"
                                    rows={3}
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={String(dbEditRow[key])}
                                    onChange={(e) => {
                                      let newVal: any = e.target.value;
                                      if (typeof val === 'number') newVal = Number(e.target.value);
                                      setDbEditRow({ ...dbEditRow, [key]: newVal });
                                    }}
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-2 text-xs outline-none focus:border-[var(--primary)]"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
                          <button
                            type="button"
                            onClick={() => setDbEditRow(null)}
                            className="rounded-xl bg-[var(--muted)] px-4 py-2 text-xs font-bold text-[var(--fg)] hover:opacity-90"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="rounded-xl bg-[var(--primary)] text-white px-4 py-2 text-xs font-bold hover:opacity-90"
                          >
                            Save Changes
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* View Row Details Overlay Modal */}
                  {dbViewRow && (
                    <div className="fixed inset-0 z-600 flex items-center justify-center p-4 overflow-y-auto">
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDbViewRow(null)} />
                      <div className="relative z-10 max-w-2xl w-full bg-[var(--card)] rounded-3xl p-6 shadow-2xl border border-[var(--border)] space-y-5 my-8">
                        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🔍</span>
                            <div>
                              <h4 className="text-xs font-black text-[var(--fg)] uppercase tracking-wider">
                                Record Inspector
                              </h4>
                              <p className="text-[9px] text-[var(--muted-fg)] uppercase font-bold tracking-tight">
                                Table: {dbActiveSubTable} • Row ID: #{dbViewRow.id}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDbViewRow(null)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--muted)] hover:bg-gray-200 dark:hover:bg-zinc-800 transition-all text-[var(--fg)]"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Record Content area */}
                        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
                          
                          {/* Highlighted core payment/order attributes if applicable */}
                          {(dbActiveSubTable === 'orders' || dbActiveSubTable === 'payments') && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl">
                              <div className="space-y-1">
                                <span className="text-[9px] text-[var(--muted-fg)] uppercase font-bold">🎯 Order ID Reference</span>
                                <div className="text-xs font-black text-emerald-855 dark:text-emerald-400 select-all flex items-center gap-1">
                                  <span>{dbViewRow.orderId || dbViewRow.id}</span>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(dbViewRow.orderId || dbViewRow.id);
                                      setAdminSuccess('Copied Order ID Reference!');
                                    }}
                                    title="Copy ID"
                                    className="text-[9px] px-1 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded font-normal cursor-pointer"
                                  >
                                    Copy
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[9px] text-[var(--muted-fg)] uppercase font-bold">👤 Customer Name</span>
                                <div className="text-xs font-bold text-[var(--fg)]">
                                  {dbViewRow.userName || dbViewRow.customer || 'Valued Customer'}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[9px] text-[var(--muted-fg)] uppercase font-bold">📞 Contact Number</span>
                                <div className="text-xs font-bold text-[var(--fg)] flex items-center gap-1.5">
                                  {dbViewRow.phone ? (
                                    <>
                                      <span className="font-mono">{dbViewRow.phone}</span>
                                      <a
                                        href={`tel:${dbViewRow.phone}`}
                                        className="text-emerald-600 hover:underline inline-flex items-center gap-0.5"
                                        title="Call Customer"
                                      >
                                        <Phone className="h-3 w-3 inline" /> Call
                                      </a>
                                      <a
                                        href={`https://wa.me/${dbViewRow.phone.replace(/[^0-9]/g, '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-emerald-500 hover:underline font-bold text-[10px]"
                                        title="WhatsApp Message"
                                      >
                                        💬 WhatsApp
                                      </a>
                                    </>
                                  ) : (
                                    <span className="italic text-[var(--muted-fg)] text-[10px]">No Phone provided</span>
                                  )}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[9px] text-[var(--muted-fg)] uppercase font-bold">💳 Transaction UTR / ID</span>
                                <div className="text-xs font-extrabold text-[var(--fg)] font-mono select-all flex items-center gap-1.5">
                                  {dbViewRow.utr || dbViewRow.transactionId ? (
                                    <>
                                      <span className="bg-[var(--muted)] px-1.5 py-0.5 rounded">{dbViewRow.utr || dbViewRow.transactionId}</span>
                                      <button
                                        onClick={() => {
                                          navigator.clipboard.writeText(dbViewRow.utr || dbViewRow.transactionId);
                                          setAdminSuccess('Copied UTR/Transaction ID!');
                                        }}
                                        className="text-[9px] text-blue-500 hover:underline font-bold cursor-pointer"
                                      >
                                        Copy
                                      </button>
                                    </>
                                  ) : (
                                    <span className="italic text-[var(--muted-fg)] text-[10px]">None</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Attached Payment Screenshot Proof explicitly spotlighted! */}
                          {(dbViewRow.screenshotUrl || dbViewRow.screenshot || dbViewRow.img) && (
                            <div className="border border-[var(--border)] rounded-2xl bg-[var(--muted)]/20 p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-[var(--muted-fg)] uppercase font-black flex items-center gap-1">
                                  📸 ATTACHED SCREENSHOT / PROOF
                                </span>
                                <a
                                  href={dbViewRow.screenshotUrl || dbViewRow.screenshot || dbViewRow.img}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] font-bold text-emerald-600 hover:underline flex items-center gap-1"
                                >
                                  <span>🔎 View Full Size</span>
                                </a>
                              </div>
                              <div className="relative max-h-64 overflow-hidden rounded-xl bg-black/10 border border-[var(--border)] flex items-center justify-center">
                                <a
                                  href={dbViewRow.screenshotUrl || dbViewRow.screenshot || dbViewRow.img}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <img
                                    src={dbViewRow.screenshotUrl || dbViewRow.screenshot || dbViewRow.img}
                                    alt="Attached Proof"
                                    className="max-h-60 w-auto object-contain cursor-pointer hover:scale-[1.02] transition-transform rounded-lg"
                                    referrerPolicy="no-referrer"
                                  />
                                </a>
                              </div>
                            </div>
                          )}

                          {/* Dynamic detailed table layout for itemized view */}
                          {dbViewRow.items && (
                            <div className="border border-[var(--border)] rounded-2xl bg-[var(--card)] overflow-hidden">
                              <div className="bg-gray-100 dark:bg-zinc-800 p-2.5 border-b border-[var(--border)]">
                                <span className="text-[9px] text-[var(--muted-fg)] uppercase font-black">
                                  🛍️ ORDERED ITEM LIST
                                </span>
                              </div>
                              <table className="w-full text-left border-collapse text-[11px]">
                                <thead className="bg-[var(--muted)]/40 text-[var(--muted-fg)] uppercase font-bold text-[9px] border-b border-[var(--border)]">
                                  <tr>
                                    <th className="p-2">Item</th>
                                    <th className="p-2 text-center">Qty</th>
                                    <th className="p-2 text-right">Price</th>
                                    <th className="p-2 text-right">Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                  {(() => {
                                    let itemsArr: any[] = [];
                                    try {
                                      itemsArr = typeof dbViewRow.items === 'string' ? JSON.parse(dbViewRow.items) : dbViewRow.items;
                                    } catch (e) {}
                                    
                                    if (!Array.isArray(itemsArr) || itemsArr.length === 0) {
                                      return (
                                        <tr>
                                          <td colSpan={4} className="p-4 text-center italic text-[var(--muted-fg)]">
                                            No item array found or failed to parse.
                                          </td>
                                        </tr>
                                      );
                                    }

                                    return itemsArr.map((item: any, i: number) => {
                                      const raw = item.name || item.productName || item.title || item.itemName || 'Product';
                                      const displayName = (raw === '()' || raw === '( )') ? 'Product unavailable' : raw;

                                      return (
                                        <tr key={i} className="hover:bg-[var(--muted)]/20">
                                          <td className="p-2 font-bold text-[var(--fg)]">
                                            {item.emoji || '🥬'} {displayName}
                                          </td>
                                          <td className="p-2 text-center font-mono">
                                            {item.qty || 1} {item.weight || ''}
                                          </td>
                                          <td className="p-2 text-right font-mono">
                                            ₹{item.sp || 0}
                                          </td>
                                          <td className="p-2 text-right font-bold font-mono text-emerald-600">
                                            ₹{(item.qty || 1) * (item.sp || 0)}
                                          </td>
                                        </tr>
                                      );
                                    });
                                  })()}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Raw key/value tables */}
                          <div className="border border-[var(--border)] rounded-2xl bg-[var(--card)] divide-y divide-[var(--border)] overflow-hidden">
                            <div className="bg-gray-100 dark:bg-zinc-800 p-2.5 border-b border-[var(--border)]">
                              <span className="text-[9px] text-[var(--muted-fg)] uppercase font-black">
                                📋 ALL SYSTEM ATTRIBUTES
                              </span>
                            </div>
                            {Object.keys(dbViewRow).map((key) => {
                              const value = dbViewRow[key];
                              if (key === 'items') return null; // Already rendered beautifully above
                              return (
                                <div key={key} className="grid grid-cols-3 gap-2 p-2.5 text-xs">
                                  <span className="text-[10px] font-bold text-[var(--muted-fg)] uppercase self-center">
                                    {key}
                                  </span>
                                  <span className="col-span-2 font-mono text-[10px] text-[var(--fg)] break-all select-all self-center">
                                    {typeof value === 'object' ? (
                                      <pre className="bg-[var(--muted)] p-2 rounded text-[9px] whitespace-pre-wrap font-mono">
                                        {JSON.stringify(value, null, 2)}
                                      </pre>
                                    ) : (
                                      String(value)
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                        </div>

                        <div className="flex justify-between items-center border-t border-[var(--border)] pt-3">
                          <button
                            type="button"
                            onClick={() => {
                              setDbEditRow({ ...dbViewRow });
                              setDbViewRow(null);
                            }}
                            className="rounded-xl border border-[var(--border)] hover:bg-[var(--muted)] px-4 py-2 text-xs font-bold text-[var(--fg)] flex items-center gap-1"
                          >
                            <span>📝 Edit Record</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDbViewRow(null)}
                            className="rounded-xl bg-[var(--primary)] text-white px-5 py-2 text-xs font-bold hover:opacity-90 shadow"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bulk Import Modal */}
                  {dbShowImportModal && (
                    <div className="fixed inset-0 z-600 flex items-center justify-center p-4">
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDbShowImportModal(false)} />
                      <form
                        onSubmit={handleDbBulkImportSubmit}
                        className="relative z-10 max-w-lg w-full bg-[var(--card)] rounded-3xl p-6 shadow-2xl border border-[var(--border)] space-y-4"
                      >
                        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                          <h4 className="text-xs font-extrabold text-[var(--fg)] uppercase tracking-wider">
                            📥 Bulk Import Data ({dbActiveSubTable})
                          </h4>
                          <button
                            type="button"
                            onClick={() => setDbShowImportModal(false)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--muted)] hover:bg-gray-200 transition-all text-[var(--fg)]"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[10px] text-[var(--muted-fg)] leading-relaxed">
                            Paste a valid JSON Array of objects OR a standard comma-separated text (CSV) with header values corresponding to the target table columns.
                          </p>
                          <textarea
                            value={dbImportText}
                            onChange={(e) => setDbImportText(e.target.value)}
                            placeholder={dbActiveSubTable === 'products' ? '[\n  {"name": "Green Peas", "sp": 40, "stockQty": 60, "cat": "root", "emoji": "🫛"}\n]' : 'email,password,phone,name\ngreensabjies@gmail.com,Admin123!,9920324172,Faizan'}
                            className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs font-mono outline-none focus:border-[var(--primary)] h-48"
                            required
                          />
                        </div>

                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDbShowImportModal(false);
                              setDbImportText('');
                            }}
                            className="rounded-xl bg-[var(--muted)] px-4 py-2 text-xs font-bold text-[var(--fg)] hover:opacity-90"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="rounded-xl bg-[var(--primary)] text-white px-4 py-2 text-xs font-bold hover:opacity-90"
                          >
                            Execute Import
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Bulk Update Modal */}
                  {dbShowBulkUpdateModal && (
                    <div className="fixed inset-0 z-600 flex items-center justify-center p-4">
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDbShowBulkUpdateModal(false)} />
                      <form
                        onSubmit={handleDbBulkUpdateSubmit}
                        className="relative z-10 max-w-lg w-full bg-[var(--card)] rounded-3xl p-6 shadow-2xl border border-[var(--border)] space-y-4"
                      >
                        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                          <h4 className="text-xs font-extrabold text-[var(--fg)] uppercase tracking-wider">
                            ⚡ Bulk Update Selected ({dbSelectedRowIds.length} items)
                          </h4>
                          <button
                            type="button"
                            onClick={() => setDbShowBulkUpdateModal(false)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--muted)] hover:bg-gray-200 transition-all text-[var(--fg)]"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="space-y-4">
                          <p className="text-[10px] text-[var(--muted-fg)] leading-relaxed">
                            Select a target field to overwrite with the specified new value across all {dbSelectedRowIds.length} selected records.
                          </p>

                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase block">Field to Update</label>
                            <select
                              value={dbBulkUpdateField}
                              onChange={(e) => setDbBulkUpdateField(e.target.value)}
                              className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-2.5 text-xs text-[var(--fg)] outline-none"
                              required
                            >
                              <option value="">-- Choose Field --</option>
                              {(() => {
                                const rows = dbTables[dbActiveSubTable] || [];
                                if (rows.length === 0) return null;
                                return Object.keys(rows[0])
                                  .filter((col) => col !== 'id' && col !== 'createdAt' && col !== 'date' && col !== 'registrationDate')
                                  .map((col) => (
                                    <option key={col} value={col}>{col}</option>
                                  ));
                              })()}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase block">New Overwrite Value</label>
                            <input
                              type="text"
                              value={dbBulkUpdateValue}
                              onChange={(e) => setDbBulkUpdateValue(e.target.value)}
                              placeholder="Enter new value (e.g. Delivered, 150, true/false)"
                              className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] p-2.5 text-xs text-[var(--fg)] outline-none"
                              required
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDbShowBulkUpdateModal(false);
                              setDbBulkUpdateField('');
                              setDbBulkUpdateValue('');
                            }}
                            className="rounded-xl bg-[var(--muted)] px-4 py-2 text-xs font-bold text-[var(--fg)] hover:opacity-90"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={!dbBulkUpdateField}
                            className="rounded-xl bg-amber-600 text-white px-4 py-2 text-xs font-bold hover:opacity-90 disabled:opacity-50"
                          >
                            Apply Bulk Changes
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </motion.div>
              )}

              {/* PASSWORD RESETS TAB VIEW */}
              {activeTab === 'password-resets' && (
                <motion.div
                  key="password-resets"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-black text-[var(--fg)]">🔐 Custom Password Recovery requests</h3>
                      <p className="text-[10px] text-[var(--muted-fg)] font-medium">Review and authorize temporary credentials under strict security protocols</p>
                    </div>
                    <button
                      onClick={fetchPasswordResets}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[10px] font-bold text-[var(--fg)] hover:bg-[var(--muted)] cursor-pointer self-start md:self-auto"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Refresh Requests</span>
                    </button>
                  </div>

                  {/* Filter and Search rail */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between bg-[var(--bg)] p-4 rounded-2xl border border-[var(--border)]">
                    <div className="flex flex-wrap gap-1">
                      {(['all', 'Pending', 'Approved', 'Rejected'] as const).map((status) => {
                        const count = status === 'all' 
                          ? passwordResets.length 
                          : passwordResets.filter(r => r.status === status).length;
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setResetsFilter(status)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                              resetsFilter === status
                                ? 'bg-[var(--primary)] text-white shadow'
                                : 'bg-[var(--card)] text-[var(--fg)] border border-[var(--border)] hover:bg-gray-100'
                            }`}
                          >
                            <span className="capitalize">{status}</span> ({count})
                          </button>
                        );
                      })}
                    </div>

                    <div className="relative max-w-xs w-full">
                      <input
                        type="text"
                        placeholder="Search by name, email or phone..."
                        value={resetsSearch}
                        onChange={(e) => setResetsSearch(e.target.value)}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-xs text-[var(--fg)] font-medium outline-none focus:border-[var(--primary)]"
                      />
                    </div>
                  </div>

                  {/* Table */}
                  <div className="border border-[var(--border)] rounded-2xl bg-[var(--card)] overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-gray-50 text-[var(--muted-fg)] uppercase font-black tracking-wider text-[9px] border-b border-[var(--border)]">
                        <tr>
                          <th className="p-3">Request Info</th>
                          <th className="p-3">User Details</th>
                          <th className="p-3">Reason for Reset</th>
                          <th className="p-3">IP & Device</th>
                          <th className="p-3 text-center">Status</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {(() => {
                          let filtered = passwordResets.filter((row) => {
                            // Status filter
                            if (resetsFilter !== 'all' && row.status !== resetsFilter) return false;
                            
                            // Search query
                            if (resetsSearch.trim()) {
                              const q = resetsSearch.toLowerCase();
                              return (
                                row.name.toLowerCase().includes(q) ||
                                row.email.toLowerCase().includes(q) ||
                                row.mobileNumber.toLowerCase().includes(q)
                              );
                            }
                            return true;
                          });

                          if (filtered.length === 0) {
                            return (
                              <tr>
                                <td colSpan={6} className="p-12 text-center text-[var(--muted-fg)]">
                                  <div className="max-w-sm mx-auto space-y-2">
                                    <ShieldAlert className="h-8 w-8 mx-auto text-gray-300" />
                                    <strong className="text-xs font-black text-[var(--fg)] block">No Reset Requests Found</strong>
                                    <p className="text-[10px] leading-relaxed">No custom password recovery requests match the current filters.</p>
                                  </div>
                                </td>
                              </tr>
                            );
                          }

                          return filtered.map((req) => (
                            <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="p-3 space-y-1">
                                <div className="font-mono text-[9px] text-gray-400 font-bold">REQ-{req.id.slice(0, 8)}</div>
                                <div className="text-[10px] font-mono text-[var(--muted-fg)]">
                                  {new Date(req.createdAt).toLocaleString()}
                                </div>
                              </td>
                              <td className="p-3 space-y-0.5">
                                <div className="font-black text-[var(--fg)]">{req.name}</div>
                                <div className="text-[10px] font-medium text-[var(--muted-fg)]">{req.email}</div>
                                <div className="text-[10px] font-mono font-bold text-[var(--muted-fg)]">{req.mobileNumber}</div>
                              </td>
                              <td className="p-3 max-w-[200px] truncate font-medium text-[var(--fg)]" title={req.reason || 'Not specified'}>
                                {req.reason || <span className="italic text-gray-300">Not specified</span>}
                              </td>
                              <td className="p-3 space-y-0.5 font-mono text-[10px] text-gray-500">
                                <div>IP: {req.ipAddress || 'Unknown'}</div>
                                <div className="max-w-[150px] truncate" title={req.deviceInfo}>{req.deviceInfo || 'Unknown'}</div>
                              </td>
                              <td className="p-3 text-center">
                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase ${
                                  req.status === 'Approved'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : req.status === 'Pending'
                                    ? 'bg-amber-100 text-amber-800 animate-pulse'
                                    : req.status === 'Completed'
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {req.status}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => handleViewResetRequest(req.id)}
                                    className="px-2.5 py-1 text-[10px] font-bold border border-[var(--border)] rounded-lg hover:bg-gray-100 transition-all text-gray-600 cursor-pointer"
                                  >
                                    View Log
                                  </button>

                                  {req.status === 'Pending' && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setSelectedReset(req);
                                          setGeneratedTempPass(generateSecureTempPassword());
                                          setPasswordGenMode('auto');
                                          setShowApproveModal(true);
                                        }}
                                        className="px-2.5 py-1 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition-all cursor-pointer"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (confirm(`Are you sure you want to REJECT ${req.name}'s password reset request?`)) {
                                            handleRejectResetRequest(req.id);
                                          }
                                        }}
                                        className="px-2.5 py-1 text-[10px] font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm transition-all cursor-pointer"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* Approve Modal Dialog Overlay */}
                  {showApproveModal && selectedReset && (
                    <div className="fixed inset-0 z-600 flex items-center justify-center p-4">
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowApproveModal(false)} />
                      <div className="relative z-10 max-w-md w-full bg-[var(--card)] rounded-3xl p-6 shadow-2xl border border-[var(--border)] space-y-4">
                        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                          <h4 className="text-xs font-extrabold text-[var(--fg)] uppercase tracking-wider flex items-center gap-1.5">
                            🔑 Approve Reset & Generate Password
                          </h4>
                          <button
                            type="button"
                            onClick={() => setShowApproveModal(false)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--muted)] hover:bg-gray-200 transition-all text-[var(--fg)] cursor-pointer"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="space-y-3">
                          <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200 text-xs font-medium space-y-1">
                            <div><span className="font-bold text-[var(--muted-fg)]">User:</span> <span className="text-[var(--fg)] font-black">{selectedReset.name}</span></div>
                            <div><span className="font-bold text-[var(--muted-fg)]">Email:</span> <span className="text-[var(--fg)] font-black">{selectedReset.email}</span></div>
                            <div><span className="font-bold text-[var(--muted-fg)]">Mobile:</span> <span className="text-[var(--fg)] font-black">{selectedReset.mobileNumber}</span></div>
                          </div>

                          {/* Generation mode toggle */}
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-bold text-[var(--muted-fg)] uppercase">Password Allocation Protocol</label>
                            <div className="grid grid-cols-2 gap-2 p-1 bg-[var(--input-bg)] rounded-xl border border-[var(--border)]">
                              <button
                                type="button"
                                onClick={() => setPasswordGenMode('auto')}
                                className={`py-1 rounded-lg text-[10px] font-black cursor-pointer transition-all ${
                                  passwordGenMode === 'auto' ? 'bg-[var(--primary)] text-white shadow-sm' : 'text-[var(--muted-fg)]'
                                }`}
                              >
                                Auto-Generate Secure
                              </button>
                              <button
                                type="button"
                                onClick={() => setPasswordGenMode('custom')}
                                className={`py-1 rounded-lg text-[10px] font-black cursor-pointer transition-all ${
                                  passwordGenMode === 'custom' ? 'bg-[var(--primary)] text-white shadow-sm' : 'text-[var(--muted-fg)]'
                                }`}
                              >
                                Custom Entry
                              </button>
                            </div>
                          </div>

                          {passwordGenMode === 'auto' ? (
                            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2">
                              <div>
                                <span className="text-[9px] font-black text-emerald-800 uppercase tracking-widest block">SECURE SYSTEM TEMPORARY PASSWORD</span>
                                <strong className="text-base font-mono font-black text-gray-900 tracking-wider select-all">{generatedTempPass}</strong>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setGeneratedTempPass(generateSecureTempPassword());
                                }}
                                className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[9px] font-black rounded-lg transition-all cursor-pointer"
                              >
                                Re-Gen
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-[var(--muted-fg)] uppercase">Enter Custom Temporary Password (min 6 chars)</label>
                              <input
                                type="text"
                                placeholder="e.g. Faizan@123"
                                value={customTempPass}
                                onChange={(e) => setCustomTempPass(e.target.value)}
                                className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-2 text-xs font-mono font-bold text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                              />
                            </div>
                          )}

                          <div className="p-2.5 bg-yellow-50 border border-yellow-200 rounded-xl text-[9px] text-yellow-800 font-medium leading-relaxed">
                            ⚠️ This temporary password will be shown in the user's "Check Status" page. They will be forced to change it to a strong, personal password upon logging in.
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setShowApproveModal(false)}
                            className="rounded-xl bg-[var(--muted)] px-4 py-2 text-xs font-bold text-[var(--fg)] hover:opacity-90 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveResetRequest(selectedReset.id)}
                            className="rounded-xl bg-emerald-700 text-white px-4 py-2 text-xs font-black hover:bg-emerald-800 shadow-md cursor-pointer"
                          >
                            Issue Password & Approve
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Request Detail log Overlay Modal */}
                  {selectedReset && !showApproveModal && (
                    <div className="fixed inset-0 z-600 flex items-center justify-center p-4">
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedReset(null)} />
                      <div className="relative z-10 max-w-md w-full bg-[var(--card)] rounded-3xl p-6 shadow-2xl border border-[var(--border)] space-y-4">
                        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                          <h4 className="text-xs font-extrabold text-[var(--fg)] uppercase tracking-wider">
                            🛡️ Recovery request audit log
                          </h4>
                          <button
                            type="button"
                            onClick={() => setSelectedReset(null)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--muted)] hover:bg-gray-200 transition-all text-[var(--fg)] cursor-pointer"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="space-y-3 text-xs">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                              <span className="text-[9px] text-gray-400 block uppercase font-bold">Request ID</span>
                              <strong className="font-mono text-[9px] text-gray-900">{selectedReset.id}</strong>
                            </div>
                            <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                              <span className="text-[9px] text-gray-400 block uppercase font-bold">Status</span>
                              <strong className={`font-black uppercase tracking-wide text-[10px] ${
                                selectedReset.status === 'Approved' ? 'text-emerald-700' : selectedReset.status === 'Pending' ? 'text-amber-700' : 'text-red-700'
                              }`}>{selectedReset.status}</strong>
                            </div>
                          </div>

                          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-1.5">
                            <span className="text-[9px] text-gray-400 block uppercase font-extrabold">Account details</span>
                            <div><span className="font-bold text-gray-500">Holder Name:</span> <span className="font-black text-gray-800">{selectedReset.name}</span></div>
                            <div><span className="font-bold text-gray-500">Email:</span> <span className="font-mono text-gray-800">{selectedReset.email}</span></div>
                            <div><span className="font-bold text-gray-500">Mobile Number:</span> <span className="font-mono text-gray-800">{selectedReset.mobileNumber}</span></div>
                          </div>

                          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-1.5">
                            <span className="text-[9px] text-gray-400 block uppercase font-extrabold">Metadata & Audit Trail</span>
                            <div><span className="font-bold text-gray-500">Submitted On:</span> <span className="font-mono text-gray-700">{new Date(selectedReset.createdAt).toLocaleString()}</span></div>
                            <div><span className="font-bold text-gray-500">Reason for Request:</span> <span className="text-gray-700 font-medium italic">"{selectedReset.reason || 'None provided'}"</span></div>
                            <div><span className="font-bold text-gray-500">IP Address:</span> <span className="font-mono text-gray-700">{selectedReset.ipAddress || 'Not recorded'}</span></div>
                            <div><span className="font-bold text-gray-500">Device Signature:</span> <span className="text-gray-700 text-[10px] block mt-0.5 truncate" title={selectedReset.deviceInfo}>{selectedReset.deviceInfo || 'Not recorded'}</span></div>
                          </div>

                          {selectedReset.status === 'Approved' && (
                            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 space-y-1">
                              <span className="text-[9px] text-emerald-800 block uppercase font-extrabold">APPROVED CREDENTIALS</span>
                              <div><span className="font-bold text-emerald-700">Issued Temporary Password:</span> <strong className="font-mono text-sm tracking-wide text-gray-900 select-all font-black bg-white border border-emerald-200 px-2 py-0.5 rounded ml-1">{selectedReset.tempPassword}</strong></div>
                              <div className="text-[9px] text-emerald-600 font-semibold italic mt-1">Authorized by administrator.</div>
                            </div>
                          )}

                          {selectedReset.status === 'Pending' && (
                            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[10px] text-amber-800 font-medium leading-relaxed">
                              This request is pending admin confirmation. You can approve or reject it using the active buttons in the table.
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end pt-2 border-t border-[var(--border)]">
                          <button
                            type="button"
                            onClick={() => setSelectedReset(null)}
                            className="rounded-xl bg-[var(--primary)] text-white px-5 py-2 text-xs font-black hover:opacity-90 shadow cursor-pointer"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Admin Invoice Overlay */}
              {selectedInvoiceOrder && (
                <InvoiceModal 
                  order={selectedInvoiceOrder} 
                  onClose={() => setSelectedInvoiceOrder(null)} 
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
