/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { supabaseClient } from './lib/supabaseClient';
import { Product, Order, User, Offer, Review, Address, CartItem, Category } from './types';
import { CATEGORIES, INITIAL_PRODUCTS, INITIAL_OFFERS, INITIAL_REVIEWS, DELIVERY_ZONES } from './data';
import { ProductCard } from './components/ProductCard';
import { HeroSection } from './components/HeroSection';
import { ReviewSection } from './components/ReviewSection';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { ProfileModal } from './components/ProfileModal';
import { AuthModal } from './components/AuthModal';
import { AdminPanel } from './components/AdminPanel';
import { OrderSuccessModal } from './components/OrderSuccessModal';
import { ProductDetailsModal } from './components/ProductDetailsModal';
import sabjisLogo from './assets/images/sabjis_logo_1783085736930.jpg';
import sabjiesHeroBanner from './assets/images/sabjies_hero_banner_1785949302966.jpg';
import sabjiesFarmHeroBg from './assets/images/sabjies_farm_hero_bg_1785950585057.jpg';
import sabjiesMascotBasket from './assets/images/sabjies_mascot_basket_1785950836197.jpg';
import confetti from 'canvas-confetti';
import { safeJson } from './utils/apiHelper';
import {
  Heart,
  ShoppingBag,
  User as UserIcon,
  Search,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Info,
  Calendar,
  X,
  Menu,
  Plus,
  Mail,
  Linkedin,
  ExternalLink,
  Bell,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  // Theme state
  const [theme, setTheme] = useState<'organic' | 'tomato' | 'citrus'>('organic');

  // Core Entity States (seeded or loaded from localStorage)
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>(CATEGORIES);
  const [orders, setOrders] = useState<Order[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Auth / session
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Cart & Wishlist & RV
  const [cart, setCart] = useState<{ [id: number]: CartItem }>({});
  const [isCartBouncing, setIsCartBouncing] = useState(false);
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<number[]>([]);

  // Coupon, Delivery instructions, Recent searches, Saved for later states
  const [appliedCoupon, setAppliedCoupon] = useState<string>('');
  const [couponDiscount, setCouponDiscount] = useState<number>(0);
  const [deliveryInstructions, setDeliveryInstructions] = useState<string>('');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('sabjies_recent_searches');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [savedForLater, setSavedForLater] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem('sabjies_saved_for_later');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [businessSettings, setBusinessSettings] = useState<{
    enableIgBanner: boolean;
    igProfileUrl: string;
    igBannerText: string;
  }>({
    enableIgBanner: true,
    igProfileUrl: 'https://www.instagram.com/sabjies?igsh=MWp6cDQ2NHZtcnE0Zw',
    igBannerText: '🎁 Follow us on Instagram for exclusive discount codes.',
  });

  // Navigation / Search Filtering
  const [selectedCat, setSelectedCat] = useState('all');
  const [selectedTab, setSelectedTab] = useState('all'); // all, organic, deal
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedProductId, setHighlightedProductId] = useState<number | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Modals / Drawer toggles
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isDevInfoOpen, setIsDevInfoOpen] = useState(false);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [newOrderBadgeCount, setNewOrderBadgeCount] = useState<number>(0);

  // Detailed Product View State
  const [selectedDetailedProduct, setSelectedDetailedProduct] = useState<Product | null>(null);
  const [isProductDetailsOpen, setIsProductDetailsOpen] = useState(false);

  // Custom non-blocking notification toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Notifications State & Auto-polling
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const handleMarkNotificationsAsRead = async () => {
    if (!currentUser) return;
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (e) {}
  };

  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      return;
    }

    const fetchLatestData = () => {
      // 1. Fetch Orders and check for state changes (e.g., rejection)
      fetch('/api/orders')
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (Array.isArray(data)) {
            setOrders((prevOrders) => {
              // Only trigger alerts if there were already orders loaded
              if (prevOrders.length > 0) {
                data.forEach((newOrder) => {
                  const oldOrder = prevOrders.find((o) => String(o.id) === String(newOrder.id));
                  if (oldOrder) {
                    const statusChanged = oldOrder.status !== newOrder.status;
                    const paymentStatusChanged = oldOrder.paymentStatus !== newOrder.paymentStatus;

                    if (newOrder.userId === currentUser.id) {
                      if (paymentStatusChanged) {
                        if (newOrder.paymentStatus === 'Rejected' || newOrder.paymentStatus === 'Failed') {
                          showToast(
                            `❌ Payment Rejected for Order #${newOrder.id}! Your payment is not showing. Please add screenshot or double check payment details.`,
                            'error'
                          );
                        } else if (newOrder.paymentStatus === 'Paid') {
                          showToast(
                            `✅ Payment Approved! Your order #${newOrder.id} is now confirmed.`,
                            'success'
                          );
                        }
                      } else if (statusChanged) {
                        showToast(
                          `📦 Order #${newOrder.id} status updated to ${newOrder.status.toUpperCase()}!`,
                          'info'
                        );
                      }
                    }
                  }
                });
              }
              return data;
            });
          }
        })
        .catch(() => {});

      // 2. Fetch Notifications
      fetch(`/api/notifications?userId=${currentUser.id}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (Array.isArray(data)) {
            setNotifications(data);
          }
        })
        .catch(() => {});
    };

    fetchLatestData();

    // Supabase Realtime instant event subscription
    const channel = supabaseClient
      .channel('app-client-orders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        () => {
          console.log('⚡ [App Realtime] Order event received via Supabase Realtime');
          fetchLatestData();
        }
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [currentUser]);

  // Suggested search terms
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Prevent background scroll when any modal or drawer is open
  const isAnyModalOpen = isCartOpen || isWishlistOpen || isAuthOpen || isCheckoutOpen || isProfileOpen || isAdminOpen || isDevInfoOpen || successOrder !== null;

  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isAnyModalOpen]);

  // Initialize and Seed Storage on Mount
  const [appLoading, setAppLoading] = useState(true);
  const [appError, setAppError] = useState<string | null>(null);

  const initData = async () => {
    setAppLoading(true);
    setAppError(null);
    try {
      // 1. Theme loading
      const savedTheme = localStorage.getItem('sabjies_theme') as any;
      const validThemes = ['organic', 'tomato', 'citrus'];
      if (savedTheme && validThemes.includes(savedTheme)) {
        setTheme(savedTheme);
        document.documentElement.setAttribute('data-theme', savedTheme);
      } else {
        setTheme('organic');
        document.documentElement.setAttribute('data-theme', 'organic');
      }

      // Parallel fetching for performance
      const [productsRes, categoriesRes, offersRes, reviewsRes, ordersRes] = await Promise.all([
        fetch('/api/products').then(r => safeJson(r, INITIAL_PRODUCTS)).catch(() => INITIAL_PRODUCTS),
        fetch('/api/categories').then(r => safeJson(r, CATEGORIES)).catch(() => CATEGORIES),
        fetch('/api/offers').then(r => safeJson(r, INITIAL_OFFERS)).catch(() => INITIAL_OFFERS),
        fetch('/api/reviews').then(r => safeJson(r, INITIAL_REVIEWS)).catch(() => INITIAL_REVIEWS),
        fetch('/api/orders').then(r => safeJson(r, [])).catch(() => [])
      ]);

      setProducts(Array.isArray(productsRes) && productsRes.length > 0 ? productsRes : INITIAL_PRODUCTS);
      if (Array.isArray(categoriesRes) && categoriesRes.length > 0) {
        setCategories(categoriesRes);
      }
      setOffers(Array.isArray(offersRes) && offersRes.length > 0 ? offersRes : INITIAL_OFFERS);
      setReviews(Array.isArray(reviewsRes) && reviewsRes.length > 0 ? reviewsRes : INITIAL_REVIEWS);
      setOrders(Array.isArray(ordersRes) ? ordersRes : []);

      // 5. Load Users
      const localUsers = localStorage.getItem('sabjies_users');
      let loadedUsers: User[] = [];
      if (localUsers) {
        try {
          const parsed = JSON.parse(localUsers);
          if (Array.isArray(parsed)) {
            loadedUsers = parsed.filter((u: any) => u.id !== 'u_pree' && u.email !== 'priya@sabjies.in');
          }
        } catch (e) {}
      }
      setUsers(loadedUsers);
      if (loadedUsers.length > 0) {
        localStorage.setItem('sabjies_users', JSON.stringify(loadedUsers));
      } else {
        localStorage.removeItem('sabjies_users');
      }

      // 6. Current User Session & live profile/addresses refresh
      const sessionId = localStorage.getItem('sabjies_session_id');
      const localSession = localStorage.getItem('sabjies_current_user');

      if (sessionId) {
        // Fetch fresh verified user profile and addresses strictly from server-side session
        fetch('/api/auth/me', {
          headers: { 'x-session-id': sessionId }
        })
        .then(async res => {
          if (res.ok) {
            return await safeJson(res, null);
          } else {
            // Session expired or invalid on server - purge stale client cache
            setCurrentUser(null);
            localStorage.removeItem('sabjies_current_user');
            localStorage.removeItem('sabjies_session_id');
            return null;
          }
        })
        .then(data => {
          if (data && data.user) {
            setCurrentUser(data.user);
            localStorage.setItem('sabjies_current_user', JSON.stringify(data.user));
          }
        })
        .catch(() => {
          // If offline, use local cached session ONLY if non-mock
          if (localSession) {
            try {
              const parsed = JSON.parse(localSession);
              if (parsed && parsed.id !== 'u_pree') {
                setCurrentUser(parsed);
              } else {
                setCurrentUser(null);
                localStorage.removeItem('sabjies_current_user');
              }
            } catch (e) {}
          }
        });
      } else {
        // No session token present - ensure guest mode
        setCurrentUser(null);
        localStorage.removeItem('sabjies_current_user');
      }

      // 8. Load Cart, Wishlist, RV
      setCart(JSON.parse(localStorage.getItem('sabjies_cart') || '{}'));
      setWishlist(JSON.parse(localStorage.getItem('sabjies_wishlist') || '[]'));
      setRecentlyViewed(JSON.parse(localStorage.getItem('sabjies_rv') || '[]'));

      fetch('/api/business-settings')
        .then(res => safeJson(res, null))
        .then(data => {
          if (data) {
            setBusinessSettings({
              enableIgBanner: data.enableIgBanner !== undefined ? data.enableIgBanner : true,
              igProfileUrl: data.igProfileUrl || 'https://www.instagram.com/sabjies?igsh=MWp6cDQ2NHZtcnE0Zw',
              igBannerText: data.igBannerText || '🎁 Follow us on Instagram for exclusive discount codes.',
            });
          }
        })
        .catch(() => {});

      setTimeout(() => {
        setAppLoading(false);
      }, 600);

    } catch (error: any) {
      console.error("Initialization error:", error);
      setAppError("Unable to connect to Sabjies Fresh Server. Please check your internet connection.");
      setAppLoading(false);
    }
  };

  useEffect(() => {
    initData();
  }, []);

  // Sync state to local storage when changed
  useEffect(() => {
    if (products.length > 0) localStorage.setItem('sabjies_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    if (offers.length > 0) localStorage.setItem('sabjies_offers', JSON.stringify(offers));
  }, [offers]);

  useEffect(() => {
    if (reviews.length > 0) localStorage.setItem('sabjies_reviews', JSON.stringify(reviews));
  }, [reviews]);

  useEffect(() => {
    if (users.length > 0) localStorage.setItem('sabjies_users', JSON.stringify(users));
  }, [users]);



  // Handle Theme Switching
  const handleThemeChange = (newTheme: 'organic' | 'tomato' | 'citrus') => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('sabjies_theme', newTheme);
  };

  // CART LOGIC
  const handleAddToCart = (id: number) => {
    const p = products.find((prod) => prod.id === id);
    if (!p || p.stockQty === 0) return;

    const newCart = { ...cart };
    const isFirstTime = !newCart[id];
    if (newCart[id]) {
      newCart[id].qty += 1;
    } else {
      newCart[id] = {
        id: p.id,
        name: p.name,
        qty: 1,
        sp: p.sp,
        emoji: p.emoji,
        weight: p.weight,
        stockQty: p.stockQty,
        img: p.img
      };
    }
    setCart(newCart);
    localStorage.setItem('sabjies_cart', JSON.stringify(newCart));
    handleAddToRV(id);
    setIsCartBouncing(true);
    setTimeout(() => setIsCartBouncing(false), 700);
    showToast(`Added ${p.name} to cart!`, 'success');
  };

  const handleUpdateQuantity = (id: number, delta: number) => {
    const newCart = { ...cart };
    if (!newCart[id]) return;

    newCart[id].qty += delta;
    if (newCart[id].qty <= 0) {
      delete newCart[id];
    }
    setCart(newCart);
    localStorage.setItem('sabjies_cart', JSON.stringify(newCart));
  };

  const handleRemoveFromCart = (id: number) => {
    const newCart = { ...cart };
    delete newCart[id];
    setCart(newCart);
    localStorage.setItem('sabjies_cart', JSON.stringify(newCart));
  };

  const handleClearCart = () => {
    setCart({});
    localStorage.setItem('sabjies_cart', '{}');
  };

  // WISHLIST LOGIC (Fev/ Whitelist is fully supported here)
  const handleToggleWishlist = (id: number) => {
    let newWishlist = [...wishlist];
    if (newWishlist.includes(id)) {
      newWishlist = newWishlist.filter((w) => w !== id);
    } else {
      newWishlist.push(id);
    }
    setWishlist(newWishlist);
    localStorage.setItem('sabjies_wishlist', JSON.stringify(newWishlist));
  };

  // RECENTLY VIEWED LOGIC
  const handleAddToRV = (id: number) => {
    let newRV = recentlyViewed.filter((item) => item !== id);
    newRV.unshift(id);
    if (newRV.length > 8) newRV.pop();
    setRecentlyViewed(newRV);
    localStorage.setItem('sabjies_rv', JSON.stringify(newRV));
  };

  // REVIEWS SUBMISSION
  const handleSubmitReview = async (name: string, location: string, rating: number, body: string) => {
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorName: name, location, rating, body })
      });
      if (res.ok) {
        const newRev = await res.json();
        setReviews(prev => [newRev, ...prev]);
        showToast('Thank you! Your feedback has been saved to the server.', 'success');
      }
    } catch (e) {
      console.error('Error submitting review to backend', e);
      const newReview: Review = {
        id: Date.now(),
        authorName: name,
        location: location,
        rating,
        body,
        createdAt: new Date().toISOString(),
      };
      setReviews([newReview, ...reviews]);
      showToast('Thank you! Review submitted.', 'success');
    }
  };

  // CHECKOUT CONFIRMATION
  const handleConfirmCheckout = (
    address: Address,
    paymentMethod: string,
    paymentStatus: 'Pending' | 'Paid' = 'Pending',
    transactionId: string = '',
    extra?: { upiIdUsed?: string; utr?: string; screenshotUrl?: string }
  ) => {
    if (!currentUser) return;

    const cartItems = Object.values(cart) as CartItem[];
    const subtotal = cartItems.reduce((acc, i) => acc + i.sp * i.qty, 0);
    const delivery = subtotal >= 299 ? 0 : 30;
    const finalTotal = Math.max(0, subtotal + delivery - couponDiscount);

    const newOrder: Order = {
      id: 'ORD' + Math.floor(100000 + Math.random() * 900000),
      userId: currentUser.id,
      userEmail: currentUser.email,
      userName: currentUser.name,
      phone: currentUser.phone || '',
      items: cartItems.map((c) => ({ id: c.id, name: c.name, qty: c.qty, sp: c.sp, emoji: c.emoji })),
      address: `${address.flat}, ${address.street}, ${address.area} — ${address.pin}`,
      payment: paymentMethod,
      paymentStatus: paymentStatus,
      transactionId: transactionId || (paymentMethod === 'Cash on Delivery' ? 'COD-' + Math.floor(10000 + Math.random() * 90000) : 'txn_' + Date.now()),
      subtotal,
      delivery,
      total: finalTotal,
      status: 'processing',
      createdAt: new Date().toISOString(),
      upiIdUsed: extra?.upiIdUsed,
      utr: extra?.utr || transactionId,
      screenshotUrl: extra?.screenshotUrl,
      deliveryInstructions: deliveryInstructions || undefined,
      couponApplied: appliedCoupon || undefined,
      discountApplied: couponDiscount > 0 ? couponDiscount : undefined,
    };

    // Update inventory stock levels
    const updatedProducts = products.map((p) => {
      const cartItem = cart[p.id];
      if (cartItem) {
        return { ...p, stockQty: Math.max(0, p.stockQty - cartItem.qty) };
      }
      return p;
    });

    setProducts(updatedProducts);
    localStorage.setItem('sabjies_products', JSON.stringify(updatedProducts));

    const updatedOrders = [...orders, newOrder];
    setOrders(updatedOrders);
    
    // Post to backend
    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOrder)
    }).catch(e => console.error('Error posting order to backend', e));

    // Clear cart & coupon
    setCart({});
    localStorage.setItem('sabjies_cart', '{}');
    setAppliedCoupon('');
    setCouponDiscount(0);
    setDeliveryInstructions('');
    setIsCheckoutOpen(false);

    // Show success modal and admin notification badge
    setSuccessOrder(newOrder);
    setNewOrderBadgeCount((prev) => prev + 1);
    showToast(`🎉 Order #${newOrder.id} placed successfully! (${paymentMethod})`, 'success');
  };

  // UPDATE USER PROFILE
  const handleUpdateProfile = (name: string, phone: string) => {
    if (!currentUser) return;
    const updatedUser = { ...currentUser, name, phone };
    setCurrentUser(updatedUser);
    localStorage.setItem('sabjies_current_user', JSON.stringify(updatedUser));

    const updatedUsers = users.map((u) => (u.id === currentUser.id ? updatedUser : u));
    setUsers(updatedUsers);
    localStorage.setItem('sabjies_users', JSON.stringify(updatedUsers));
  };

  // UPDATE ADDRESSES
  const handleUpdateAddresses = (addresses: Address[]) => {
    if (!currentUser) return;
    const updatedUser = { ...currentUser, addresses };
    setCurrentUser(updatedUser);
    localStorage.setItem('sabjies_current_user', JSON.stringify(updatedUser));

    const updatedUsers = users.map((u) => (u.id === currentUser.id ? updatedUser : u));
    setUsers(updatedUsers);
    localStorage.setItem('sabjies_users', JSON.stringify(updatedUsers));

    // Sync with server & Supabase database securely via server session
    const sessionId = localStorage.getItem('sabjies_session_id') || '';
    if (!sessionId) {
      console.warn('⚠️ [Session Warning] Attempted address sync without an active session ID. Changes saved to local store.');
      return;
    }

    fetch('/api/users/addresses/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      },
      body: JSON.stringify({ addresses })
    }).then(async (res) => {
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('Failed to sync addresses with server:', errorData.error || res.statusText);
      }
    }).catch(err => console.error('Address sync network error:', err));
  };

  // LOGOUT
  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('sabjies_current_user');
    localStorage.removeItem('sabjies_session_id');
    setIsProfileOpen(false);
    setIsAdminOpen(false);
  };

  // LOGIN SUCCESS
  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('sabjies_current_user', JSON.stringify(user));

    // Seed session user if not existing in master list
    const updatedUsers = [...users];
    if (!updatedUsers.some((u) => u.email === user.email)) {
      updatedUsers.push(user);
      setUsers(updatedUsers);
      localStorage.setItem('sabjies_users', JSON.stringify(updatedUsers));
    }

    if (user.role === 'admin') {
      setIsAdminOpen(true);
    }
  };

  // ADMIN OPERATIONS
  const handleUpdateOrderStatus = async (orderId: string, status: any) => {
    const updated = orders.map((o) => (o.id === orderId ? { ...o, status } : o));
    setOrders(updated);
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
    } catch (e) {}
  };

  const handleUpdateOrderPaymentStatus = async (
    orderId: string,
    paymentStatus: 'Pending' | 'Paid' | 'Failed' | 'Rejected',
    adminRemarks?: string
  ) => {
    const updated = orders.map((o) => {
      if (o.id === orderId) {
        return {
          ...o,
          paymentStatus,
          status: paymentStatus === 'Paid' ? ('confirmed' as const) : o.status,
          adminRemarks: adminRemarks !== undefined ? adminRemarks : o.adminRemarks,
          updatedAt: new Date().toISOString(),
        };
      }
      return o;
    });
    setOrders(updated);
    localStorage.setItem('sabjies_orders', JSON.stringify(updated));
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentStatus,
          status: paymentStatus === 'Paid' ? 'confirmed' : undefined,
          adminRemarks,
        }),
      });
    } catch (e) {}
  };

  const handleResubmitOrderPayment = async (orderId: string, utr: string, screenshotUrl?: string) => {
    const updated = orders.map((o) => {
      if (o.id === orderId) {
        return {
          ...o,
          paymentStatus: 'Pending' as const,
          utr,
          screenshotUrl,
          adminRemarks: '',
          updatedAt: new Date().toISOString(),
        };
      }
      return o;
    });
    setOrders(updated);
    localStorage.setItem('sabjies_orders', JSON.stringify(updated));
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentStatus: 'Pending',
          utr,
          screenshotUrl,
          adminRemarks: '',
        }),
      });
      showToast(`🔄 Payment details resubmitted for Order #${orderId}! Admin will re-verify.`, 'success');
    } catch (e) {}
  };

  const handleUpdateProductStock = async (id: number, qty: number) => {
    const updated = products.map((p) => (p.id === id ? { ...p, stockQty: qty } : p));
    setProducts(updated);
    try {
      await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockQty: qty })
      });
    } catch (e) {}
  };

  const handleUpdateProductPrice = async (id: number, price: number) => {
    const updated = products.map((p) => (p.id === id ? { ...p, sp: price } : p));
    setProducts(updated);
    try {
      await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sp: price })
      });
    } catch (e) {}
  };

  const handleAddProduct = async (newP: Omit<Product, 'id'>) => {
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newP)
      });
      if (res.ok) {
        const created = await res.json();
        setProducts(prev => [created, ...prev]);
        showToast('Vegetable added & saved to backend server!', 'success');
        return;
      }
    } catch (e) {
      console.error('Error posting product to backend', e);
    }
    const productItem: Product = {
      ...newP,
      id: products.length > 0 ? Math.max(...products.map((p) => p.id)) + 1 : 1,
    };
    setProducts([...products, productItem]);
    showToast('Vegetable added successfully', 'success');
  };

  const handleRemoveProduct = async (id: number) => {
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        if (data.products) {
          setProducts(data.products);
        } else {
          setProducts(products.filter((p) => p.id !== id));
        }
        showToast('Vegetable removed from backend server', 'info');
        return;
      }
    } catch (e) {
      console.error('Error removing product', e);
    }
    setProducts(products.filter((p) => p.id !== id));
    showToast('Vegetable removed successfully', 'info');
  };

  const handleRemoveUser = async (id: string) => {
    try {
      await fetch('/api/admin/users/' + id, { method: 'DELETE' });
    } catch (e) {
      console.error('Error removing user', e);
    }
    setUsers(users.filter((u) => u.id !== id));
    showToast('User account removed successfully', 'info');
  };

  const handleAddOffer = async (newO: Omit<Offer, 'id'>) => {
    const defaultImg = 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&q=80&w=800';
    const payload = {
      ...newO,
      img: newO.img?.trim() ? newO.img.trim() : defaultImg,
      tag: newO.tag || 'HOT DEAL',
      tagColor: newO.tagColor || '#1a9c5b'
    };
    try {
      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const created = await res.json();
        setOffers(prev => [created, ...prev]);
        showToast('Promotion banner launched successfully!', 'success');
        return;
      }
    } catch (e) {}
    const offerItem: Offer = {
      ...payload,
      id: Date.now(),
    };
    setOffers([offerItem, ...offers]);
    showToast('Promotion banner launched successfully!', 'success');
  };

  const handleUpdateOffer = async (id: number, updatedData: Partial<Offer>) => {
    try {
      const res = await fetch(`/api/offers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.offers) setOffers(data.offers);
        else setOffers(prev => prev.map(o => o.id === id ? { ...o, ...updatedData } : o));
        showToast('Promotion banner updated successfully!', 'success');
        return;
      }
    } catch (e) {}
    setOffers(prev => prev.map(o => o.id === id ? { ...o, ...updatedData } : o));
    showToast('Promotion banner updated successfully!', 'success');
  };

  const handleRemoveOffer = async (id: number) => {
    try {
      const res = await fetch(`/api/offers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        if (data.offers) setOffers(data.offers);
        else setOffers(offers.filter(o => o.id !== id));
        showToast('Offer removed', 'info');
        return;
      }
    } catch (e) {}
    setOffers(offers.filter((o) => o.id !== id));
    showToast('Offer removed', 'info');
  };

  const handleRemoveReview = async (id: number) => {
    try {
      const res = await fetch(`/api/reviews/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.reviews) {
          setReviews(data.reviews);
        } else {
          setReviews(reviews.filter((r) => r.id !== id));
        }
        showToast('Review removed from backend server successfully', 'info');
      }
    } catch (e) {
      console.error('Error removing review from backend', e);
      setReviews(reviews.filter((r) => r.id !== id));
      showToast('Review removed successfully', 'info');
    }
  };

  const handleUpdateProduct = async (id: number, updates: Partial<Product>) => {
    const updated = products.map((p) => (p.id === id ? { ...p, ...updates } : p));
    setProducts(updated);
    try {
      await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      showToast('Product updated successfully!', 'success');
    } catch (e) {
      console.error('Error updating product', e);
    }
  };

  const refreshAllData = async () => {
    try {
      const categoriesRes = await fetch('/api/categories');
      if (categoriesRes.ok) {
        const catData = await safeJson(categoriesRes, null);
        if (Array.isArray(catData) && catData.length > 0) {
          setCategories(catData);
        }
      }
      const productsRes = await fetch('/api/products');
      if (productsRes.ok) {
        const data = await safeJson(productsRes, null);
        if (Array.isArray(data)) setProducts(data);
      }
      const ordersRes = await fetch('/api/orders');
      if (ordersRes.ok) {
        const data = await safeJson(ordersRes, null);
        if (Array.isArray(data)) setOrders(data);
      }
      const reviewsRes = await fetch('/api/reviews');
      if (reviewsRes.ok) {
        const data = await safeJson(reviewsRes, null);
        if (Array.isArray(data)) setReviews(data);
      }
      const offersRes = await fetch('/api/offers');
      if (offersRes.ok) {
        const data = await safeJson(offersRes, null);
        if (Array.isArray(data)) setOffers(data);
      }
      const dbRes = await fetch('/api/admin/database');
      if (dbRes.ok) {
        const dbData = await safeJson(dbRes, null);
        if (dbData && dbData.users) {
          setUsers(dbData.users);
          if (currentUser) {
            const foundCurrentUser = dbData.users.find((u: any) => u.id === currentUser.id);
            if (foundCurrentUser) {
              setCurrentUser(foundCurrentUser);
              localStorage.setItem('sabjies_current_user', JSON.stringify(foundCurrentUser));
            }
          }
        }
      }
    } catch (e) {
      console.error('Error refreshing all application states:', e);
    }
  };

  // SCROLL TO CATALOG & HIGHLIGHT MATCHES
  const scrollToShop = () => {
    setTimeout(() => {
      const shopEl = document.getElementById('shop');
      if (shopEl) {
        const yOffset = -70; // height of sticky navbar & category bar
        const y = shopEl.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }, 50);
  };

  const handleSelectCategory = (catId: string) => {
    setSelectedCat(catId);
    scrollToShop();
    const firstMatch = products.filter((p) => {
      const catOk = catId === 'all' || p.cat === catId;
      const tabOk = selectedTab === 'all' || p.type === selectedTab;
      return catOk && tabOk;
    })[0];
    if (firstMatch) {
      setHighlightedProductId(firstMatch.id);
      setTimeout(() => setHighlightedProductId(null), 2000);
    }
  };

  const handleSearchSubmit = () => {
    scrollToShop();
    const firstMatch = filteredProducts[0];
    if (firstMatch) {
      setHighlightedProductId(firstMatch.id);
      setTimeout(() => setHighlightedProductId(null), 2000);
    }
    setShowSuggestions(false);
  };

  // FILTERED CATALOG SELECTION
  const filteredProducts = products.filter((p) => {
    const catOk = selectedCat === 'all' || p.cat === selectedCat;
    const tabOk = selectedTab === 'all' || p.type === selectedTab;
    
    const category = categories.find((c) => c.id === p.cat);
    const catLabel = category ? category.label : '';

    const searchOk =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.cat.toLowerCase().includes(searchQuery.toLowerCase()) ||
      catLabel.toLowerCase().includes(searchQuery.toLowerCase());
    return catOk && tabOk && searchOk;
  });

  const bestSellers = [...products]
    .sort((a, b) => b.reviews - a.reviews)
    .slice(0, 8);

  const cartTotalQty = (Object.values(cart) as CartItem[]).reduce((acc, item) => acc + item.qty, 0);
  const cartSubtotal = (Object.values(cart) as CartItem[]).reduce((acc, item) => acc + item.sp * item.qty, 0);

  // Search autocomplete help terms
  const searchHelpTerms = ['Tomato', 'Potato', 'Spinach', 'Broccoli', 'Onion', 'Chilli', 'Ginger'];

  if (appLoading) {
    return (
      <div className="min-h-screen bg-[#fafaf9] dark:bg-[#0c0a09] flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-emerald-500/10 border-t-emerald-500 animate-spin" style={{ animationDuration: '1.2s' }} />
          <div className="relative h-20 w-20 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/50 shadow-xl flex items-center justify-center p-3.5">
            <img
              src={sabjisLogo}
              alt="Sabjies Logo"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover rounded-full animate-pulse"
            />
          </div>
        </div>

        <h1 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
          Harvesting Farm-Fresh Goodness <span className="animate-bounce">🥬</span>
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mt-2 leading-relaxed font-semibold">
          Sourcing the finest crops from Maharashtra's local farms directly to Ghatkopar...
        </p>

        <div className="w-48 h-1.5 bg-zinc-200/70 dark:bg-zinc-800 rounded-full overflow-hidden mt-6">
          <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 animate-infinite-loading rounded-full" />
        </div>
      </div>
    );
  }

  if (appError) {
    return (
      <div className="min-h-screen bg-[#fafaf9] dark:bg-[#0c0a09] flex flex-col items-center justify-center p-6 text-center">
        <div className="h-16 w-16 rounded-3xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-6 border border-amber-500/20">
          <AlertTriangle className="h-8 w-8 animate-bounce" />
        </div>

        <h1 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
          Connection Interrupted
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mt-3 leading-relaxed font-semibold font-mono">
          {appError}
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs">
          <button
            onClick={initData}
            className="w-full flex items-center justify-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 px-6 text-xs transition-all duration-200 shadow-md active:scale-95 cursor-pointer"
          >
            <span className="font-bold">Retry Connection</span>
          </button>
          <button
            onClick={() => {
              setAppLoading(false);
              setAppError(null);
              setProducts(INITIAL_PRODUCTS);
              setOffers(INITIAL_OFFERS);
              setReviews(INITIAL_REVIEWS);
            }}
            className="w-full rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-bold py-2.5 px-6 text-xs transition-all duration-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
          >
            Work Offline
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)] selection:bg-[var(--primary)] selection:text-white">
      {/* ── COLD RUN TICKER HEADER ── */}
      <div className="bg-[var(--primary)] text-[var(--primary-fg)] font-bold text-[10px] tracking-wider py-1.5 overflow-hidden whitespace-nowrap uppercase">
        <div className="flex animate-marquee gap-8">
          <span>🥦 Ghatkopar East & West Express 90-Min Delivery</span>
          <span>🚚 Free express delivery on shopping above ₹299</span>
          <span>🌿 Directly Sourced from farmers with no middleman</span>
          <span>🥦 Ghatkopar East & West Express 90-Min Delivery</span>
          <span>🚚 Free express delivery on shopping above ₹299</span>
          <span>🌿 Directly Sourced from farmers with no middleman</span>
        </div>
      </div>

      {/* ── NAVIGATION BAR ── */}
      <header className="sticky top-0 z-400 bg-[var(--navbar-bg)] backdrop-blur-md border-b border-[var(--border)] shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-2 cursor-pointer select-none flex-shrink-0" onClick={() => { setSelectedCat('all'); setSelectedTab('all'); setSearchQuery(''); }}>
            <img
              src={sabjisLogo}
              alt="Sabjies Logo"
              referrerPolicy="no-referrer"
              className="h-9 w-9 sm:h-10 sm:w-10 object-cover rounded-full border border-[var(--border)] shadow-sm bg-white"
            />
            <span className="text-base sm:text-lg font-black tracking-tight text-[var(--fg)]">Sabjies</span>
          </div>

          {/* Unified Action Row */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-2.5">
              {/* Theme Emoji Switcher */}
              <div className="flex items-center gap-0.5 sm:gap-1 bg-[var(--muted)] border border-[var(--border)] rounded-full p-0.5 sm:p-1">
                {([
                  { key: 'organic', emoji: '🥦', label: 'Organic Broccoli' },
                  { key: 'tomato', emoji: '🍅', label: 'Red Tomato' },
                  { key: 'citrus', emoji: '🍋', label: 'Sunny Citrus' },
                ] as const).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => handleThemeChange(t.key)}
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs transition-all hover:scale-125 duration-300 active:scale-95 ${
                      theme === t.key
                        ? 'bg-[var(--card)] border border-[var(--primary)] shadow-sm scale-110'
                        : 'opacity-75 hover:opacity-100'
                    }`}
                    title={`Switch to ${t.label} theme`}
                  >
                    {t.emoji}
                  </button>
                ))}
              </div>

              {/* Wishlist Icon Button */}
              <button
                onClick={() => setIsWishlistOpen(true)}
                className={`relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted-fg)] transition-all hover:border-[var(--primary)] hover:text-[var(--primary)] ${
                  wishlist.length > 0 ? 'text-red-500 border-red-200 bg-red-50/20' : ''
                }`}
                title="My Wishlist"
              >
                <Heart className={`h-4.5 w-4.5 ${wishlist.length > 0 ? 'fill-red-500 text-red-500' : ''}`} />
                {wishlist.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-black text-white">
                    {wishlist.length}
                  </span>
                )}
              </button>

              {/* Notification Bell Icon Button with Dropdown */}
              {currentUser && (
                <div className="relative">
                  <button
                    onClick={() => {
                      setIsNotificationsOpen(!isNotificationsOpen);
                      if (!isNotificationsOpen) {
                        handleMarkNotificationsAsRead();
                      }
                    }}
                    className={`relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted-fg)] transition-all hover:border-[var(--primary)] hover:text-[var(--primary)] ${
                      notifications.filter(n => !n.read).length > 0 ? 'text-amber-500 border-amber-200 bg-amber-50/20' : ''
                    }`}
                    title="My Notifications"
                  >
                    <Bell className={`h-4.5 w-4.5 ${notifications.filter(n => !n.read).length > 0 ? 'fill-amber-500 text-amber-500' : ''}`} />
                    {notifications.filter(n => !n.read).length > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-black text-white">
                        {notifications.filter(n => !n.read).length}
                      </span>
                    )}
                  </button>

                  <AnimatePresence>
                    {isNotificationsOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsNotificationsOpen(false)} />
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute right-0 mt-2 w-80 rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl p-4 z-50 space-y-3"
                        >
                          <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                            <span className="text-[11px] font-black text-[var(--fg)] uppercase tracking-wider flex items-center gap-1">
                              🔔 Notifications
                            </span>
                            {notifications.filter(n => !n.read).length > 0 && (
                              <button
                                onClick={handleMarkNotificationsAsRead}
                                className="text-[9px] font-bold text-[var(--primary)] hover:underline"
                              >
                                Clear Badges
                              </button>
                            )}
                          </div>

                          <div className="max-h-64 overflow-y-auto space-y-2.5 pr-1">
                            {notifications.length === 0 ? (
                              <div className="text-center py-6 text-[var(--muted-fg)] text-[10px] italic">
                                No new notifications.
                              </div>
                            ) : (
                              notifications.map((n) => (
                                <div
                                  key={n.id}
                                  className={`p-2.5 rounded-xl border text-[11px] leading-relaxed transition-all ${
                                    !n.read
                                      ? 'bg-amber-500/5 border-amber-500/20'
                                      : 'bg-[var(--muted)]/25 border-[var(--border)]'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-[var(--fg)]">{n.title}</span>
                                    <span className="text-[8px] text-[var(--muted-fg)] font-mono whitespace-nowrap">
                                      {new Date(n.createdAt).toLocaleTimeString('en-IN', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-[var(--muted-fg)] mt-1 font-medium">{n.body}</p>
                                </div>
                              ))
                            )}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Cart Button with Shake/Bounce animation */}
              <motion.button
                id="header-cart-button"
                onClick={() => setIsCartOpen(true)}
                animate={
                  isCartBouncing
                    ? {
                        scale: [1, 1.22, 0.92, 1.12, 0.98, 1],
                        rotate: [0, -7, 7, -4, 4, 0],
                        y: [0, -4, 2, -2, 0],
                      }
                    : { scale: 1, rotate: 0, y: 0 }
                }
                transition={{ duration: 0.6, ease: 'easeInOut' }}
                className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] text-white px-4 py-2 text-xs font-bold shadow hover:opacity-90 active:scale-95 transition-all cursor-pointer select-none"
              >
                <ShoppingBag className={`h-4 w-4 ${isCartBouncing ? 'animate-bounce' : ''}`} />
                <span>₹{cartSubtotal}</span>
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-black">
                  {cartTotalQty}
                </span>
              </motion.button>

              {/* User Dropdown Profile Action */}
              {currentUser ? (
                <div className="relative group">
                  <button
                    onClick={() => {
                      if (currentUser.role === 'admin') {
                        setIsAdminOpen(true);
                      } else {
                        setIsProfileOpen(true);
                      }
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)] text-white text-xs font-black shadow-inner cursor-pointer"
                  >
                    {(currentUser?.name || 'User')
                      .split(' ')
                      .map((w) => w[0] || '')
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </button>

                  {currentUser.role === 'admin' && (
                    <button
                      onClick={() => {
                        setNewOrderBadgeCount(0);
                        setIsAdminOpen(true);
                      }}
                      className="absolute -top-1.5 -left-1.5 flex h-5 min-w-[20px] px-1 items-center justify-center rounded-full bg-rose-500 text-white text-[9px] font-black border border-white shadow-md animate-pulse"
                      title="Open Administration Console (New orders received)"
                    >
                      {newOrderBadgeCount > 0 ? newOrderBadgeCount : '🔧'}
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setIsAuthOpen(true)}
                  className="rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs font-bold text-[var(--muted-fg)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all"
                >
                  Sign In
                </button>
              )}
            </div>

            {/* Mobile Actions (Cart + Hamburger Menu) */}
            <div className="flex md:hidden items-center gap-2">
              <motion.button
                id="mobile-header-cart-button"
                onClick={() => setIsCartOpen(true)}
                animate={
                  isCartBouncing
                    ? {
                        scale: [1, 1.22, 0.92, 1.12, 0.98, 1],
                        rotate: [0, -7, 7, -4, 4, 0],
                        y: [0, -4, 2, -2, 0],
                      }
                    : { scale: 1, rotate: 0, y: 0 }
                }
                transition={{ duration: 0.6, ease: 'easeInOut' }}
                className="relative flex items-center gap-1 rounded-full bg-[var(--primary)] text-white px-3 py-1.5 text-xs font-bold shadow active:scale-95 transition-all cursor-pointer"
              >
                <ShoppingBag className={`h-3.5 w-3.5 ${isCartBouncing ? 'animate-bounce' : ''}`} />
                <span>₹{cartSubtotal}</span>
                {cartTotalQty > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[var(--primary)] text-[9px] font-black shadow">
                    {cartTotalQty}
                  </span>
                )}
              </motion.button>

              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--fg)] shadow-sm hover:border-[var(--primary)] active:scale-95 transition-all"
                title="Open Mobile Navigation Menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── INSTAGRAM EXCLUSIVE PROMO BANNER ── */}
      {businessSettings.enableIgBanner && (
        <div className="bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white py-2 px-4 shadow-inner relative z-30">
          <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎁</span>
              <span className="text-xs sm:text-sm font-black tracking-tight">
                {businessSettings.igBannerText}
              </span>
            </div>
            <a
              href={businessSettings.igProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-white text-pink-600 font-extrabold text-[10px] sm:text-xs px-3.5 py-1 rounded-full shadow hover:bg-pink-50 active:scale-95 transition-all uppercase tracking-wider flex-shrink-0"
            >
              Follow Us
            </a>
          </div>
        </div>
      )}

      {/* ── MOBILE SLIDING NAVIGATION DRAWER ── */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-500 md:hidden"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="fixed top-0 right-0 bottom-0 w-[85%] max-w-[320px] bg-[var(--card)] border-l border-[var(--border)] shadow-2xl z-501 p-6 flex flex-col justify-between md:hidden overflow-y-auto backdrop-blur-2xl"
            >
              <div>
                <div className="flex items-center justify-between pb-6 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <img
                      src={sabjisLogo}
                      alt="Sabjies Logo"
                      className="h-8 w-8 object-cover rounded-full border border-[var(--border)] bg-white"
                    />
                    <span className="text-base font-black tracking-tight text-[var(--fg)]">Sabjies Menu</span>
                  </div>
                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-2 rounded-full hover:bg-[var(--muted)] text-[var(--fg)]"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="py-6 space-y-6">
                  {/* User Profile / Auth Section */}
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-4">
                    {currentUser ? (
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-[var(--fg)]">{currentUser.name}</h4>
                          <p className="text-[10px] text-[var(--muted-fg)]">{currentUser.email}</p>
                        </div>
                        <button
                          onClick={() => {
                            setIsMobileMenuOpen(false);
                            if (currentUser.role === 'admin') {
                              setIsAdminOpen(true);
                            } else {
                              setIsProfileOpen(true);
                            }
                          }}
                          className="rounded-full bg-[var(--primary)] text-white text-[11px] font-bold px-3 py-1.5"
                        >
                          {currentUser.role === 'admin' ? 'Admin 🔧' : 'Profile'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-bold text-[var(--fg)]">Welcome to Sabjies</span>
                        <button
                          onClick={() => {
                            setIsMobileMenuOpen(false);
                            setIsAuthOpen(true);
                          }}
                          className="rounded-full bg-[var(--primary)] text-white text-xs font-bold py-2.5 shadow-sm text-center"
                        >
                          Sign In / Register
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Theme Selector */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-[var(--muted-fg)] uppercase tracking-wider">Theme Style</span>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: 'organic', emoji: '🥦', label: 'Organic' },
                        { key: 'tomato', emoji: '🍅', label: 'Tomato' },
                        { key: 'citrus', emoji: '🍋', label: 'Citrus' },
                      ].map((t) => (
                        <button
                          key={t.key}
                          onClick={() => {
                            handleThemeChange(t.key as any);
                          }}
                          className={`flex items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-bold transition-all ${
                            theme === t.key
                              ? 'border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm'
                              : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:border-[var(--primary)]'
                          }`}
                        >
                          <span>{t.emoji}</span>
                          <span>{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quick Links & Wishlist */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-[var(--muted-fg)] uppercase tracking-wider">Quick Actions</span>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          setIsWishlistOpen(true);
                        }}
                        className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-xs font-bold text-[var(--fg)] hover:border-[var(--primary)] transition-all"
                      >
                        <div className="flex items-center gap-2.5">
                          <Heart className="h-4 w-4 text-red-500 fill-red-500" />
                          <span>My Wishlist</span>
                        </div>
                        <span className="rounded-full bg-red-100 text-red-600 px-2 py-0.5 text-[10px] font-black">
                          {wishlist.length}
                        </span>
                      </button>

                      <button
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          setIsCartOpen(true);
                        }}
                        className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-xs font-bold text-[var(--fg)] hover:border-[var(--primary)] transition-all"
                      >
                        <div className="flex items-center gap-2.5">
                          <ShoppingBag className="h-4 w-4 text-[var(--primary)]" />
                          <span>Shopping Cart</span>
                        </div>
                        <span className="rounded-full bg-[var(--primary)] text-white px-2 py-0.5 text-[10px] font-black">
                          {cartTotalQty}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border)] text-center">
                <p className="text-[10px] text-[var(--muted-fg)]">
                  Sabjies Farm Fresh • Ghatkopar, Mumbai
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── MASTER HERO SECTION WITH ANIMATED VEGETABLE VISUALS ── */}
      <HeroSection
        onShopFreshClick={scrollToShop}
        onTodaysDealsClick={() => {
          setSelectedTab('deal');
          scrollToShop();
        }}
      />

      {/* ── CATEGORIES BAR (Pills scroll + Integrated Search Bar) ── */}
      <section className="bg-[var(--card)] border-b border-[var(--border)] py-3.5 sticky top-[58px] sm:top-[60px] z-300 shadow-xs backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 flex flex-col gap-3">
          {/* Header Row: Filter Label & Integrated Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] sm:text-xs font-black text-[var(--fg)] uppercase tracking-wider flex items-center gap-1.5">
                <span className="text-sm">🥦</span>
                <span>Filter Catalog Categories:</span>
              </span>

              {/* Active Filter Reset Indicator */}
              {(selectedCat !== 'all' || searchQuery.trim() !== '') && (
                <button
                  onClick={() => {
                    setSelectedCat('all');
                    setSelectedTab('all');
                    setSearchQuery('');
                  }}
                  className="text-[10px] font-bold text-[var(--primary)] hover:underline flex items-center gap-1 cursor-pointer bg-[var(--primary)]/10 px-2 py-0.5 rounded-full transition-all"
                  title="Reset all search and category filters"
                >
                  <span>Reset All</span>
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Integrated Search Input */}
            <div className="relative w-full sm:w-72 md:w-80 lg:w-96 flex-shrink-0 z-20">
              <div
                onClick={() => searchInputRef.current?.focus()}
                className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--muted)]/80 px-3.5 py-1.5 sm:py-2 cursor-text w-full transition-all duration-200 focus-within:border-[var(--primary)] focus-within:bg-[var(--card)] focus-within:shadow-md"
              >
                <Search className="h-4 w-4 text-[var(--muted-fg)] flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search fresh vegetables, greens..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                    if (e.target.value.trim() !== '') {
                      setSelectedCat('all');
                      setSelectedTab('all');
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      scrollToShop();
                      setShowSuggestions(false);
                    }
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full bg-transparent text-xs text-[var(--fg)] outline-none placeholder-[var(--muted-fg)] font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSearchQuery('');
                    }}
                    className="p-0.5 rounded-full hover:bg-[var(--border)] text-[var(--muted-fg)] hover:text-[var(--fg)] transition-colors cursor-pointer"
                    title="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Autocomplete Suggestions dropdown */}
              {showSuggestions && searchQuery === '' && (
                <div className="absolute top-full left-0 right-0 mt-1.5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-xl z-50 flex flex-wrap gap-1.5 backdrop-blur-md">
                  <span className="text-[10px] font-bold text-[var(--muted-fg)] w-full mb-1">
                    Helpful search ideas:
                  </span>
                  {searchHelpTerms.map((term) => (
                    <button
                      key={term}
                      onClick={() => {
                        setSearchQuery(term);
                        setSelectedCat('all');
                        setSelectedTab('all');
                        setShowSuggestions(false);
                        scrollToShop();
                      }}
                      className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-[10px] font-semibold text-[var(--fg)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all cursor-pointer"
                    >
                      {term}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowSuggestions(false)}
                    className="absolute top-2 right-2 text-[10px] font-bold text-red-500 hover:underline cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Category Filter Pills Scroll */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 pt-0.5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleSelectCategory(cat.id)}
                className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  selectedCat === cat.id
                    ? 'border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm scale-102'
                    : 'border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] hover:border-gray-300'
                }`}
              >
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── MAIN PRODUCT CATALOG ── */}
      <main className="mx-auto max-w-7xl px-4 py-8 space-y-8" id="shop">
        {/* Active Order Logistics Tracker Banner */}
        {currentUser && currentUser.role !== 'admin' && (
          (() => {
            const activeOrders = orders.filter(
              (o) => o.userEmail === currentUser.email && o.status !== 'delivered' && o.status !== 'cancelled'
            );
            if (activeOrders.length === 0) return null;
            
            return (
              <div className="space-y-4">
                {activeOrders.map((order) => {
                  const getStatusStepIndex = (status: string) => {
                    switch (status) {
                      case 'processing': return 0;
                      case 'confirmed': return 1;
                      case 'packing': return 2;
                      case 'dispatched': return 3;
                      default: return 0;
                    }
                  };
                  const stepIdx = getStatusStepIndex(order.status);
                  const steps = [
                    { label: 'Placed', icon: '📝' },
                    { label: 'Confirmed', icon: '✓' },
                    { label: 'Packing', icon: '📦' },
                    { label: 'Dispatched', icon: '🚚' },
                  ];

                  return (
                    <div key={order.id} className="rounded-3xl border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 p-5 shadow-sm space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 dark:border-emerald-900/50 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl animate-bounce">🚚</span>
                          <div>
                            <h4 className="text-xs font-extrabold text-emerald-950 dark:text-emerald-100 uppercase tracking-wider flex items-center gap-1.5">
                              Active Order Logistics Tracker
                              <span className="rounded-full bg-emerald-600 text-white text-[9px] px-2 py-0.5 animate-pulse font-bold font-mono">LIVE UPDATE</span>
                            </h4>
                            <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                              Order <strong className="text-emerald-950 dark:text-emerald-100">#{order.id}</strong> status: <strong className="uppercase">{order.status}</strong>
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setIsProfileOpen(true);
                          }}
                          className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-4 py-1.5 shadow transition-all"
                        >
                          Track Detailed Timeline →
                        </button>
                      </div>

                      {/* Progress visual bar */}
                      <div className="relative pt-2">
                        <div className="flex items-center justify-between text-[10px] font-extrabold text-emerald-800 dark:text-emerald-300 relative z-10 px-2">
                          {steps.map((step, idx) => (
                            <div key={idx} className="flex flex-col items-center gap-1">
                              <div className={`h-7 w-7 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                                idx <= stepIdx 
                                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' 
                                  : 'bg-white dark:bg-zinc-800 border-emerald-200 text-emerald-300'
                              }`}>
                                <span className="text-xs font-mono">{step.icon}</span>
                              </div>
                              <span className={idx <= stepIdx ? 'text-emerald-950 dark:text-emerald-100 font-black' : 'opacity-60'}>
                                {step.label}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Line connector */}
                        <div className="absolute top-5 left-8 right-8 h-0.5 bg-emerald-200 dark:bg-emerald-900 -z-0">
                          <div 
                            className="h-full bg-emerald-600 transition-all duration-500" 
                            style={{ width: `${(stepIdx / (steps.length - 1)) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}

        {/* Catalog Header bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <h2 className="text-xl font-extrabold text-[var(--fg)] flex items-center gap-1.5">
              <span>Today's Fresh Harvest</span>
              <Sparkles className="h-4.5 w-4.5 text-[var(--primary)]" />
            </h2>
            <p className="text-xs text-[var(--muted-fg)]">Filtered from Maharashtra farmer shipments of the past 24 hours</p>
          </div>

          {/* Filtering tabs */}
          <div className="flex rounded-full bg-[var(--muted)] border border-[var(--border)] p-1 gap-1 text-xs font-bold">
            <button
              onClick={() => setSelectedTab('all')}
              className={`rounded-full px-4 py-1.5 transition-all ${
                selectedTab === 'all' ? 'bg-[var(--card)] text-[var(--fg)] shadow-sm' : 'text-[var(--muted-fg)]'
              }`}
            >
              All Harvest
            </button>
            <button
              onClick={() => setSelectedTab('organic')}
              className={`rounded-full px-4 py-1.5 transition-all ${
                selectedTab === 'organic' ? 'bg-[var(--card)] text-[var(--fg)] shadow-sm' : 'text-[var(--muted-fg)]'
              }`}
            >
              Organic
            </button>
            <button
              onClick={() => setSelectedTab('deal')}
              className={`rounded-full px-4 py-1.5 transition-all ${
                selectedTab === 'deal' ? 'bg-[var(--card)] text-[var(--fg)] shadow-sm' : 'text-[var(--muted-fg)]'
              }`}
            >
              Hot Deals
            </button>
          </div>
        </div>

        {/* Dynamic Catalog Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filteredProducts.map((prod) => (
            <ProductCard
              key={prod.id}
              product={prod}
              quantityInCart={cart[prod.id]?.qty || 0}
              isWishlisted={wishlist.includes(prod.id)}
              onAddToCart={handleAddToCart}
              onRemoveFromCart={handleRemoveFromCart}
              onUpdateQuantity={handleUpdateQuantity}
              onToggleWishlist={handleToggleWishlist}
              isHighlighted={highlightedProductId === prod.id}
              onViewProduct={(id) => {
                const found = products.find(p => p.id === id);
                if (found) {
                  setSelectedDetailedProduct(found);
                  setIsProductDetailsOpen(true);
                }
              }}
            />
          ))}

          {filteredProducts.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="col-span-full text-center py-16 px-4 bg-[var(--card)] rounded-3xl border border-[var(--border)] shadow-sm max-w-md mx-auto flex flex-col items-center"
            >
              <div className="h-16 w-16 rounded-full bg-[var(--muted)] text-[var(--primary)] flex items-center justify-center mb-4 text-2xl">
                🥦
              </div>
              <h3 className="text-sm font-black text-[var(--fg)] tracking-tight">No Fresh Harvests Match</h3>
              <p className="text-[11px] text-[var(--muted-fg)] mt-1.5 leading-relaxed max-w-xs font-semibold">
                We couldn't find any farm-fresh items matching your selected criteria. Try resetting the filters or modifying your search.
              </p>
              <button
                onClick={() => { setSelectedCat('all'); setSelectedTab('all'); setSearchQuery(''); }}
                className="mt-5 rounded-full bg-[var(--primary)] text-white px-5 py-2 text-xs font-bold shadow hover:opacity-90 transition-all active:scale-95 cursor-pointer"
              >
                Reset Store Filters
              </button>
            </motion.div>
          )}
        </div>
      </main>

      {/* ── BEST SELLERS SECTION ── */}
      <section className="bg-[var(--card)] border-t border-b border-[var(--border)] py-8">
        <div className="mx-auto max-w-7xl px-4 space-y-6">
          <div>
            <h3 className="text-base font-extrabold text-[var(--fg)]">🔥 Bestseller Fresh Produce</h3>
            <p className="text-xs text-[var(--muted-fg)] mt-0.5">Most purchased by families in the Ghatkopar Region</p>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide no-scrollbar">
            {bestSellers.map((prod) => (
              <div key={prod.id} className="w-[160px] flex-shrink-0 bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-3 flex flex-col items-center gap-1 text-center group">
                <span className="text-3xl select-none group-hover:scale-110 transition-transform duration-200">{prod.emoji}</span>
                <h4 className="text-xs font-bold text-[var(--fg)] truncate w-full mt-1">{prod.name}</h4>
                <p className="text-[10px] text-[var(--muted-fg)]">{prod.weight}</p>
                <span className="text-xs font-extrabold text-[var(--primary)] mt-1">₹{prod.sp}</span>
                <button
                  onClick={() => handleAddToCart(prod.id)}
                  disabled={prod.stockQty === 0}
                  className="rounded-full bg-[var(--primary)] text-white text-[10px] font-bold w-full py-1 mt-2 hover:opacity-90 disabled:opacity-40 transition-all"
                >
                  {prod.stockQty === 0 ? 'OOS' : '+ Add'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURED OFFERS SECTION ── */}
      <section className="mx-auto max-w-7xl px-4 py-8 space-y-6" id="offers">
        <div>
          <h3 className="text-base font-extrabold text-[var(--fg)]">🎁 Featured Combos & Special Offers</h3>
          <p className="text-xs text-[var(--muted-fg)] mt-0.5">Discounts automatically active in checkout when criteria are fulfilled</p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {offers.map((off) => {
            const defaultImg = 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&q=80&w=800';
            const bannerImg = (off.img && off.img.trim() !== '') ? off.img.trim() : defaultImg;
            return (
              <div
                key={off.id}
                className="group overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-md hover:shadow-xl transition-all duration-300 flex flex-col sm:flex-row relative"
              >
                <div className="relative w-full sm:w-[220px] h-[160px] bg-[var(--muted)] flex-shrink-0 overflow-hidden">
                  <img
                    src={bannerImg}
                    alt={off.title}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.src = defaultImg;
                    }}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute top-3 left-3 rounded-full bg-emerald-600/95 backdrop-blur-md px-3 py-1 text-[10px] font-black text-white uppercase tracking-wider shadow-md">
                    {off.tag || 'HOT DEAL'}
                  </span>
                </div>
                <div className="p-6 flex flex-col justify-between flex-1">
                  <div>
                    <h4 className="text-sm font-black text-[var(--fg)] tracking-tight">{off.title}</h4>
                    <p className="text-xs text-[var(--muted-fg)] mt-2 leading-relaxed">{off.desc}</p>
                  </div>
                  <button
                    onClick={() => showToast(`Promotion "${off.title}" applied to your order!`, 'success')}
                    className="rounded-full bg-[var(--muted)] border border-[var(--border)] text-[var(--primary)] text-xs font-extrabold px-4 py-2 self-start mt-4 hover:bg-[var(--primary)] hover:text-white transition-all shadow-sm active:scale-95"
                  >
                    Apply Offer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── COVERAGE ZONES INFO BANNER ── */}
      <section className="mx-auto max-w-7xl px-4 pb-8">
        <div className="rounded-3xl bg-[var(--primary)] text-white p-6 shadow flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-lg">
            <h4 className="text-sm font-black uppercase tracking-wider text-green-300">📍 Active Delivery Logistics Zone</h4>
            <h3 className="text-lg font-black leading-tight">Express 90-Minute Home Delivery Across Ghatkopar</h3>
            <p className="text-xs text-green-100/90 leading-relaxed">
              Our specialized express delivery associates cover primary blocks, societies, and sectors. Fresh produce continues to travel directly to you within refrigerator compartments.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start">
            {DELIVERY_ZONES.map((zone) => (
              <span key={zone} className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-white border border-white/20 uppercase tracking-wide">
                ✓ {zone}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── RECENTLY VIEWED SECTION ── */}
      {recentlyViewed.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-8">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
            <h4 className="text-xs font-bold text-[var(--fg)] uppercase tracking-wider flex items-center gap-1.5">
              <span>Recently Viewed Veggies</span>
            </h4>
            <div className="flex gap-4 overflow-x-auto no-scrollbar">
              {recentlyViewed.map((id) => {
                const prod = products.find((p) => p.id === id);
                if (!prod) return null;
                return (
                  <div
                    key={id}
                    onClick={() => handleAddToCart(prod.id)}
                    className="w-[100px] flex-shrink-0 bg-[var(--bg)] border border-[var(--border)] rounded-xl p-2.5 text-center cursor-pointer hover:-translate-y-0.5 transition-all"
                  >
                    <span className="text-2xl">{prod.emoji}</span>
                    <h5 className="text-[10px] font-bold text-[var(--fg)] truncate mt-1">{prod.name}</h5>
                    <span className="text-[10px] font-black text-[var(--primary)]">₹{prod.sp}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── REVIEWS SECTION ── */}
      <ReviewSection reviews={reviews} currentUser={currentUser} onSubmitReview={handleSubmitReview} />

      {/* ── FOOTER BRANDS ── */}
      <footer className="border-t border-[var(--border)] bg-[var(--card)] text-xs text-[var(--muted-fg)] pt-12 pb-6">
        <div className="mx-auto max-w-7xl px-4 grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-12 pb-8">
          <div className="space-y-3 md:col-span-3">
            <div className="flex items-center gap-2">
              <img
                src={sabjisLogo}
                alt="Sabjies Logo"
                referrerPolicy="no-referrer"
                className="h-12 w-12 object-cover rounded-full border border-[var(--border)] shadow-sm bg-white"
              />
              <span className="text-base font-black text-[var(--fg)]">Sabjies</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Farm-to-door fresh vegetable delivery in Ghatkopar, Mumbai. Handpicked, chemical-free organic produce delivered direct from farmers in Maharashtra.
            </p>
          </div>

          <div className="space-y-3 md:col-span-2">
            <h4 className="font-bold text-[var(--fg)] uppercase tracking-wider text-[11px]">Quick Links</h4>
            <div className="flex flex-col gap-1.5">
              <a href="#shop" className="hover:text-[var(--primary)]">Grocery Catalog</a>
              <a href="#offers" className="hover:text-[var(--primary)]">Special Combos</a>
              <a href="#reviews" className="hover:text-[var(--primary)]">Customer Reviews</a>
            </div>
          </div>

          <div className="space-y-3 md:col-span-2">
            <h4 className="font-bold text-[var(--fg)] uppercase tracking-wider text-[11px]">Delivery Coverage</h4>
            <div className="flex flex-col gap-1.5 text-xs text-[var(--muted-fg)]">
              <span>Ghatkopar East &amp; West</span>
              <span>Vikhroli West</span>
              <span>Pant Nagar &amp; Garodia Nagar</span>
              <span>LBS Marg, Amrut Nagar &amp; Cama Lane</span>
              <span>Vallabh Baug Lane</span>
            </div>
          </div>

          <div className="space-y-3 md:col-span-2">
            <h4 className="font-bold text-[var(--fg)] uppercase tracking-wider text-[11px]">Direct Support</h4>
            <div className="flex flex-col gap-1.5 text-xs text-[var(--muted-fg)]">
              <a href="tel:9920324172" className="hover:text-[var(--primary)] transition-colors flex items-center gap-1.5">
                <span>📞</span>
                <strong className="text-[var(--fg)]">99203 24172</strong>
              </a>
              <a href="mailto:greensabjies@gmail.com" className="hover:text-[var(--primary)] transition-colors flex items-center gap-1.5 break-all">
                <span>✉️</span>
                <span className="text-[var(--fg)] font-medium">greensabjies@gmail.com</span>
              </a>
              <span className="flex items-center gap-1.5">
                <span>📍</span>
                <span>Ghatkopar East, Mumbai, Maharashtra 400075</span>
              </span>
            </div>
          </div>

          <div className="space-y-3 md:col-span-3">
            <h4 className="font-bold text-[var(--fg)] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <span>🚀 Hire the Developers</span>
              <span className="inline-flex h-2 w-2 rounded-full bg-[var(--primary)] animate-ping" />
            </h4>
            <p className="text-[10px] leading-relaxed text-[var(--muted-fg)] mb-2">
              Want a beautiful website or app for your shop? Contact us directly!
            </p>
            
            <div className="space-y-3">
              {/* Faizan Card */}
              <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--muted)] p-2.5 transition-all duration-300 hover:border-emerald-500/30 hover:shadow-sm group">
                <div className="font-bold text-[var(--fg)] text-[11px] flex items-center justify-between">
                  <span>Faizan Shaikh</span>
                  <span className="text-[8px] font-bold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">Lead Dev</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <a
                    href="https://www.linkedin.com/in/faizan-shaikh-684509240?utm_source=share_via&utm_content=profile&utm_medium=member_android"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#0077b5] text-white hover:opacity-90 transition-all duration-200 transform hover:scale-110"
                    title="Faizan's LinkedIn"
                  >
                    <Linkedin className="h-3.5 w-3.5" />
                  </a>
                  <a
                    href="mailto:faizanshaikh786511@gmail.com"
                    className="inline-flex h-6 items-center gap-1 px-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all duration-200 text-[10px] font-bold"
                    title="Email Faizan"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>Email</span>
                  </a>
                </div>
              </div>

              {/* Shubham Card */}
              <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--muted)] p-2.5 transition-all duration-300 hover:border-emerald-500/30 hover:shadow-sm group">
                <div className="font-bold text-[var(--fg)] text-[11px] flex items-center justify-between">
                  <span>Shubham Jadhav</span>
                  <span className="text-[8px] font-bold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">Co-Dev</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <a
                    href="https://www.linkedin.com/in/shubham-jadhav19440?utm_source=share_via&utm_content=profile&utm_medium=member_ios"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#0077b5] text-white hover:opacity-90 transition-all duration-200 transform hover:scale-110"
                    title="Shubham's LinkedIn"
                  >
                    <Linkedin className="h-3.5 w-3.5" />
                  </a>
                  <a
                    href="mailto:Shubhamjadhav19440@gmail.com"
                    className="inline-flex h-6 items-center gap-1 px-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all duration-200 text-[10px] font-bold"
                    title="Email Shubham"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>Email</span>
                  </a>
                </div>
              </div>
            </div>

            <div className="pt-1">
              <button
                onClick={() => setIsDevInfoOpen(true)}
                className="flex items-center gap-1 text-[10px] font-bold text-[var(--primary)] hover:underline transition-all cursor-pointer"
              >
                <Sparkles className="h-3 w-3 text-[var(--primary)] animate-pulse" />
                <span>View Developers details</span>
              </button>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 border-t border-[var(--border)] pt-5 flex flex-wrap items-center justify-between gap-3 text-[10px]">
          <span>© 2026 Sabjies Delivery. Sourced direct from organic Maharashtrian partner farmers.</span>
          <span>Sourced &amp; Packaged with 🌱 in Ghatkopar, Mumbai</span>
        </div>
      </footer>

      {/* ── SYSTEM MODALS & DRAWERS ── */}

      {/* Cart drawer (Quantity update/Clearance is supported) */}
      <CartDrawer
        isOpen={isCartOpen}
        cart={cart}
        offers={offers}
        onClose={() => setIsCartOpen(false)}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveFromCart={handleRemoveFromCart}
        onClearCart={handleClearCart}
        onCheckout={() => {
          setIsCartOpen(false);
          if (!currentUser) {
            showToast('Please sign in to your account to place orders and manage deliveries.', 'info');
            setIsAuthOpen(true);
            return;
          }
          setIsCheckoutOpen(true);
        }}
        onAddToCart={handleAddToCart}
        savedForLater={savedForLater}
        onUpdateSavedForLater={setSavedForLater}
        appliedCoupon={appliedCoupon}
        couponDiscount={couponDiscount}
        onApplyCoupon={(code, disc) => {
          setAppliedCoupon(code);
          setCouponDiscount(disc);
        }}
      />

      {/* Checkout modal dialog */}
      <AnimatePresence>
        {isCheckoutOpen && (
          <CheckoutModal
            user={currentUser}
            cart={cart}
            onClose={() => setIsCheckoutOpen(false)}
            onConfirmOrder={handleConfirmCheckout}
            onUpdateAddresses={handleUpdateAddresses}
            appliedCoupon={appliedCoupon}
            couponDiscount={couponDiscount}
            onApplyCoupon={(code, disc) => {
              setAppliedCoupon(code);
              setCouponDiscount(disc);
            }}
            deliveryInstructions={deliveryInstructions}
            onChangeDeliveryInstructions={setDeliveryInstructions}
          />
        )}
      </AnimatePresence>

      {/* Order Success Modern Modal */}
      <AnimatePresence>
        {successOrder && (
          <OrderSuccessModal
            order={successOrder}
            onClose={() => setSuccessOrder(null)}
            onViewOrders={() => setIsProfileOpen(true)}
          />
        )}
      </AnimatePresence>

      {/* Profile modal (Order list/Update details/Logout/Track Order are supported) */}
      <AnimatePresence>
        {isProfileOpen && (
          <ProfileModal
            user={currentUser}
            orders={orders}
            products={products}
            wishlistIds={wishlist}
            onClose={() => setIsProfileOpen(false)}
            onUpdateProfile={handleUpdateProfile}
            onUpdateAddresses={handleUpdateAddresses}
            onLogout={handleLogout}
            onResubmitPayment={handleResubmitOrderPayment}
            onReorder={(reorderItems) => {
              const updatedCart = { ...cart };
              reorderItems.forEach(item => {
                const foundProd = products.find(p => p.id === item.id);
                if (foundProd) {
                  updatedCart[item.id] = {
                    id: foundProd.id,
                    name: foundProd.name,
                    sp: foundProd.sp,
                    emoji: foundProd.emoji,
                    weight: foundProd.weight,
                    qty: item.qty,
                    stockQty: foundProd.stockQty,
                  };
                }
              });
              setCart(updatedCart);
              localStorage.setItem('sabjies_cart', JSON.stringify(updatedCart));
              setIsProfileOpen(false);
              setIsCartOpen(true);
              showToast('🔄 Restored items from past order to active cart!', 'success');
            }}
            onAddToCart={handleAddToCart}
            onToggleWishlist={handleToggleWishlist}
          />
        )}
      </AnimatePresence>

      {/* Product Details Modal */}
      <AnimatePresence>
        {isProductDetailsOpen && selectedDetailedProduct && (
          <ProductDetailsModal
            product={selectedDetailedProduct}
            isOpen={isProductDetailsOpen}
            onClose={() => {
              setIsProductDetailsOpen(false);
              setSelectedDetailedProduct(null);
            }}
            quantityInCart={cart[selectedDetailedProduct.id]?.qty || 0}
            isWishlisted={wishlist.includes(selectedDetailedProduct.id)}
            onAddToCart={handleAddToCart}
            onRemoveFromCart={handleRemoveFromCart}
            onUpdateQuantity={handleUpdateQuantity}
            onToggleWishlist={handleToggleWishlist}
            showToast={showToast}
            globalReviews={reviews}
          />
        )}
      </AnimatePresence>

      {/* Authentication screen modal (Normal/Admin OTP flows supported) */}
      <AnimatePresence>
        {isAuthOpen && (
          <AuthModal
            onClose={() => setIsAuthOpen(false)}
            onLoginSuccess={handleLoginSuccess}
            onRegisterSuccess={handleLoginSuccess}
          />
        )}
      </AnimatePresence>

      {/* Hidden admin control console (Access lock for owner greensabjies@gmail.com) */}
      <AnimatePresence>
        {isAdminOpen && (
          <AdminPanel
            orders={orders}
            products={products}
            categories={categories}
            users={users}
            offers={offers}
            reviews={reviews}
            onClose={() => setIsAdminOpen(false)}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onUpdateOrderPaymentStatus={handleUpdateOrderPaymentStatus}
            onUpdateProductStock={handleUpdateProductStock}
            onUpdateProductPrice={handleUpdateProductPrice}
            onUpdateProduct={handleUpdateProduct}
            onAddProduct={handleAddProduct}
            onRemoveProduct={handleRemoveProduct}
            onRemoveUser={handleRemoveUser}
            onAddOffer={handleAddOffer}
            onUpdateOffer={handleUpdateOffer}
            onRemoveOffer={handleRemoveOffer}
            onRemoveReview={handleRemoveReview}
            onLogout={handleLogout}
            onRefreshAllData={refreshAllData}
          />
        )}
      </AnimatePresence>

      {/* Custom sliding sidebar for Wishlist/Fev so users can actually view Whitelist entries */}
      <AnimatePresence>
        {isWishlistOpen && (
          <>
            <div className="fixed inset-0 z-500 bg-black/50 backdrop-blur-sm" onClick={() => setIsWishlistOpen(false)} />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="fixed top-0 left-0 bottom-0 z-510 flex w-full max-w-[340px] flex-col bg-[var(--card)] border-r border-[var(--border)] shadow-2xl p-4 backdrop-blur-2xl"
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-red-500">
                  <Heart className="h-4 w-4 fill-current" />
                  <span>Your Fev / Wishlist</span>
                </div>
                <button
                  onClick={() => setIsWishlistOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted-fg)]"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4 space-y-3">
                {wishlist.length === 0 ? (
                  <p className="text-xs text-[var(--muted-fg)] text-center py-12 italic">
                    Your wishlist is currently empty. Toggle the heart icon on any vegetable.
                  </p>
                ) : (
                  wishlist.map((id) => {
                    const prod = products.find((p) => p.id === id);
                    if (!prod) return null;
                    return (
                      <div key={id} className="flex items-center justify-between gap-3 bg-[var(--bg)] border border-[var(--border)] p-2.5 rounded-xl text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{prod.emoji}</span>
                          <div>
                            <h4 className="font-bold text-[var(--fg)]">{prod.name}</h4>
                            <span className="text-[10px] text-[var(--primary)] font-black">₹{prod.sp}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              handleAddToCart(prod.id);
                              setIsWishlistOpen(false);
                            }}
                            className="rounded-full bg-[var(--primary)] text-white text-[9px] font-bold px-2 py-1 hover:opacity-90"
                          >
                            + Cart
                          </button>
                          <button
                            onClick={() => handleToggleWishlist(prod.id)}
                            className="text-red-500 hover:scale-105 transition-all text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Developer Profiles Modal */}
      <AnimatePresence>
        {isDevInfoOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDevInfoOpen(false)}
              className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="fixed inset-x-4 top-[10%] sm:top-[15%] md:top-[20%] mx-auto z-[10001] max-w-lg rounded-3xl bg-[var(--card)] p-6 sm:p-8 shadow-2xl border border-[var(--border)] overflow-y-auto max-h-[85vh]"
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-4 mb-6">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                    <Sparkles className="h-5 w-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight text-[var(--fg)]">Meet the Developers</h3>
                    <p className="text-xs text-[var(--muted-fg)] font-semibold">The minds behind Sabjies Farm Fresh Delivery</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsDevInfoOpen(false)}
                  className="rounded-full p-2 text-[var(--muted-fg)] hover:bg-[var(--muted)] hover:text-[var(--fg)] transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Faizan Shaikh */}
                <div className="group relative rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-5 transition-all hover:shadow-md hover:border-emerald-500/30">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div>
                      <h4 className="text-base font-black text-[var(--fg)] flex items-center gap-2">
                        Faizan Shaikh
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">Lead Developer</span>
                      </h4>
                      <p className="mt-2 text-xs text-[var(--muted-fg)] leading-relaxed italic font-medium bg-[var(--card)] p-3 rounded-xl border border-[var(--border)]">
                        "If you want a website for your shop or something, contact me!"
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2.5">
                    <a
                      href="https://www.linkedin.com/in/faizan-shaikh-684509240?utm_source=share_via&utm_content=profile&utm_medium=member_android"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-full bg-[#0077b5] text-white px-3.5 py-1.5 text-xs font-bold transition-all hover:opacity-90 hover:scale-105"
                    >
                      <Linkedin className="h-3.5 w-3.5" />
                      <span>LinkedIn</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href="mailto:faizanshaikh786511@gmail.com"
                      className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--fg)] px-3.5 py-1.5 text-xs font-bold transition-all hover:bg-[var(--muted)] hover:border-emerald-500/50 hover:scale-105"
                    >
                      <Mail className="h-3.5 w-3.5 text-emerald-500" />
                      <span>faizanshaikh786511@gmail.com</span>
                    </a>
                  </div>
                </div>

                {/* Shubham */}
                <div className="group relative rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-5 transition-all hover:shadow-md hover:border-emerald-500/30">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div>
                      <h4 className="text-base font-black text-[var(--fg)] flex items-center gap-2">
                        Shubham Jadhav
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">Co-Developer</span>
                      </h4>
                      <p className="mt-1 text-xs text-[var(--muted-fg)] font-semibold">
                        Frontend & custom experience specialist.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2.5">
                    <a
                      href="https://www.linkedin.com/in/shubham-jadhav19440?utm_source=share_via&utm_content=profile&utm_medium=member_ios"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-full bg-[#0077b5] text-white px-3.5 py-1.5 text-xs font-bold transition-all hover:opacity-90 hover:scale-105"
                    >
                      <Linkedin className="h-3.5 w-3.5" />
                      <span>LinkedIn</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href="mailto:Shubhamjadhav19440@gmail.com"
                      className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--fg)] px-3.5 py-1.5 text-xs font-bold transition-all hover:bg-[var(--muted)] hover:border-emerald-500/50 hover:scale-105"
                    >
                      <Mail className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Shubhamjadhav19440@gmail.com</span>
                    </a>
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t border-[var(--border)] pt-4 flex items-center justify-end">
                <button
                  onClick={() => setIsDevInfoOpen(false)}
                  className="w-full sm:w-auto rounded-full bg-[var(--primary)] text-white px-6 py-2 text-xs font-bold shadow hover:opacity-95 active:scale-95 transition-all"
                >
                  Close Window
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`fixed bottom-6 right-6 z-[9999] max-w-sm rounded-2xl p-4 shadow-xl border flex items-start gap-3 backdrop-blur-md ${
              toast.type === 'error'
                ? 'bg-red-50/95 border-red-200 text-red-900 dark:bg-red-950/95 dark:border-red-900/50 dark:text-red-100'
                : toast.type === 'info'
                ? 'bg-blue-50/95 border-blue-200 text-blue-900 dark:bg-blue-950/95 dark:border-blue-900/50 dark:text-blue-100'
                : 'bg-emerald-50/95 border-emerald-200 text-emerald-900 dark:bg-emerald-950/95 dark:border-emerald-900/50 dark:text-emerald-100'
            }`}
          >
            <div className="flex-1 text-xs font-semibold leading-relaxed">
              {toast.message}
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-current opacity-60 hover:opacity-100 transition-opacity p-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
