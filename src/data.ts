/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product, Category, Offer, Review } from './types';

export const CATEGORIES: Category[] = [
  { id: 'all', label: 'All Sabjies', emoji: '🥗' },
  { id: 'root', label: 'Root Veggies', emoji: '🥔' },
  { id: 'leafy', label: 'Leafy Greens', emoji: '🥬' },
  { id: 'gourd', label: 'Gourds & Pods', emoji: '🫑' },
  { id: 'nightshade', label: 'Nightshades', emoji: '🍅' },
  { id: 'exotic', label: 'Exotic', emoji: '🥦' },
  { id: 'herbs', label: 'Herbs & Spices', emoji: '🌿' },
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 1,
    name: 'Fresh Aloo (Potato)',
    cat: 'root',
    type: 'deal',
    cp: 18,
    sp: 30,
    weight: 'per kg',
    discount: '-10%',
    img: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&q=80&w=400',
    emoji: '🥔',
    rating: 4.8,
    reviews: 48,
    stockQty: 80,
    lowAt: 15
  },
  {
    id: 2,
    name: 'Desi Pyaz (Onion)',
    cat: 'root',
    type: 'deal',
    cp: 22,
    sp: 38,
    weight: 'per kg',
    discount: '-15%',
    img: 'https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&q=80&w=400',
    emoji: '🧅',
    rating: 4.3,
    reviews: 35,
    stockQty: 60,
    lowAt: 10
  },
  {
    id: 3,
    name: 'Hybrid Tamatar (Tomato)',
    cat: 'nightshade',
    type: 'organic',
    cp: 28,
    sp: 50,
    weight: 'per kg',
    discount: '',
    img: 'https://images.unsplash.com/photo-1607305387299-a3d9611cd469?auto=format&fit=crop&q=80&w=400',
    emoji: '🍅',
    rating: 4.9,
    reviews: 52,
    stockQty: 45,
    lowAt: 10
  },
  {
    id: 4,
    name: 'Fresh Bhindi (Okra)',
    cat: 'gourd',
    type: 'organic',
    cp: 35,
    sp: 60,
    weight: 'per kg',
    discount: '',
    img: 'https://images.unsplash.com/photo-1425543103986-22abb7d7e8d2?auto=format&fit=crop&q=80&w=400',
    emoji: '🫑',
    rating: 4.7,
    reviews: 29,
    stockQty: 30,
    lowAt: 8
  },
  {
    id: 5,
    name: 'Baingan (Eggplant)',
    cat: 'nightshade',
    type: 'deal',
    cp: 20,
    sp: 35,
    weight: 'per kg',
    discount: '-20%',
    img: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&q=80&w=400',
    emoji: '🍆',
    rating: 4.2,
    reviews: 19,
    stockQty: 25,
    lowAt: 8
  },
  {
    id: 6,
    name: 'Organic Palak (Spinach)',
    cat: 'leafy',
    type: 'organic',
    cp: 12,
    sp: 22,
    weight: 'per bunch',
    discount: '',
    img: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&q=80&w=400',
    emoji: '🥬',
    rating: 5.0,
    reviews: 64,
    stockQty: 55,
    lowAt: 12
  },
  {
    id: 7,
    name: 'Green Broccoli',
    cat: 'exotic',
    type: 'organic',
    cp: 55,
    sp: 90,
    weight: 'per kg',
    discount: '',
    img: 'https://images.unsplash.com/photo-1568584711271-6c929fb49b60?auto=format&fit=crop&q=80&w=400',
    emoji: '🥦',
    rating: 4.4,
    reviews: 31,
    stockQty: 20,
    lowAt: 6
  },
  {
    id: 8,
    name: 'Desi Gajar (Carrot)',
    cat: 'root',
    type: 'organic',
    cp: 20,
    sp: 36,
    weight: 'per kg',
    discount: '',
    img: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?auto=format&fit=crop&q=80&w=400',
    emoji: '🥕',
    rating: 4.9,
    reviews: 42,
    stockQty: 70,
    lowAt: 15
  },
  {
    id: 9,
    name: 'Lauki (Bottle Gourd)',
    cat: 'gourd',
    type: 'all',
    cp: 15,
    sp: 28,
    weight: 'per piece',
    discount: '',
    img: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&q=80&w=400',
    emoji: '🥒',
    rating: 4.1,
    reviews: 18,
    stockQty: 35,
    lowAt: 8
  },
  {
    id: 10,
    name: 'Hari Mirchi (Green Chilli)',
    cat: 'herbs',
    type: 'all',
    cp: 8,
    sp: 18,
    weight: '100g pack',
    discount: '',
    img: 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?auto=format&fit=crop&q=80&w=400',
    emoji: '🌶️',
    rating: 4.6,
    reviews: 77,
    stockQty: 90,
    lowAt: 20
  },
  {
    id: 11,
    name: 'Fresh Methi (Fenugreek)',
    cat: 'leafy',
    type: 'organic',
    cp: 10,
    sp: 20,
    weight: 'per bunch',
    discount: '',
    img: 'https://images.unsplash.com/photo-1603569283847-aa295f0d016a?auto=format&fit=crop&q=80&w=400',
    emoji: '🌿',
    rating: 4.5,
    reviews: 33,
    stockQty: 40,
    lowAt: 10
  },
  {
    id: 12,
    name: 'Shimla Mirch (Capsicum)',
    cat: 'nightshade',
    type: 'deal',
    cp: 30,
    sp: 55,
    weight: 'per kg',
    discount: '-12%',
    img: 'https://images.unsplash.com/photo-1525607551316-4a8e16d1f9ba?auto=format&fit=crop&q=80&w=400',
    emoji: '🫑',
    rating: 4.7,
    reviews: 41,
    stockQty: 0,
    lowAt: 8
  },
  {
    id: 13,
    name: 'Kheera (Cucumber)',
    cat: 'gourd',
    type: 'all',
    cp: 12,
    sp: 22,
    weight: 'per kg',
    discount: '',
    img: 'https://images.unsplash.com/photo-1449300079323-02e209d9d3a6?auto=format&fit=crop&q=80&w=400',
    emoji: '🥒',
    rating: 4.3,
    reviews: 26,
    stockQty: 50,
    lowAt: 12
  },
  {
    id: 14,
    name: 'Lehsun (Garlic)',
    cat: 'herbs',
    type: 'all',
    cp: 60,
    sp: 100,
    weight: 'per kg',
    discount: '',
    img: 'https://images.unsplash.com/photo-1540148426945-6cf22a6b2383?auto=format&fit=crop&q=80&w=400',
    emoji: '🧄',
    rating: 4.8,
    reviews: 55,
    stockQty: 22,
    lowAt: 8
  },
  {
    id: 15,
    name: 'Adrak (Ginger)',
    cat: 'herbs',
    type: 'all',
    cp: 40,
    sp: 70,
    weight: 'per kg',
    discount: '',
    img: 'https://images.unsplash.com/photo-1515023115689-589c33041d3c?auto=format&fit=crop&q=80&w=400',
    emoji: '🫚',
    rating: 4.6,
    reviews: 38,
    stockQty: 18,
    lowAt: 6
  },
  {
    id: 16,
    name: 'Baby Corn',
    cat: 'exotic',
    type: 'organic',
    cp: 45,
    sp: 80,
    weight: 'per pack',
    discount: '',
    img: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&q=80&w=400',
    emoji: '🌽',
    rating: 4.4,
    reviews: 22,
    stockQty: 28,
    lowAt: 8
  }
];

export const INITIAL_OFFERS: Offer[] = [
  {
    id: 1,
    title: 'Green Chillies & Dhaniya',
    desc: 'Free mix pack on orders above ₹299',
    tag: 'HOT DEAL',
    tagColor: '#f97316',
    img: 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?auto=format&fit=crop&q=80&w=600'
  },
  {
    id: 2,
    title: 'Weekly Sabji Basket Combo',
    desc: 'Essential household combo — save 25%',
    tag: 'COMBO',
    tagColor: '#1a9c5b',
    img: 'https://images.unsplash.com/photo-1566385101042-1a0aa0c1268c?auto=format&fit=crop&q=80&w=600'
  }
];

export const INITIAL_REVIEWS: Review[] = [
  {
    id: 1,
    authorName: 'Priya Sharma',
    location: 'Pant Nagar',
    rating: 5,
    body: 'Absolutely beautiful vegetables! Sourced super fresh. The Spinach is still crisp after three days. Super fast delivery in 45 minutes.',
    createdAt: '2026-06-28T14:30:00Z'
  },
  {
    id: 2,
    authorName: 'Ramesh Mehta',
    location: 'Garodia Nagar',
    rating: 4,
    body: 'Very convenient and direct. No hassle of bargaining at local markets. Onions and potatoes are top tier.',
    createdAt: '2026-06-29T09:15:00Z'
  },
  {
    id: 3,
    authorName: 'Anjali Desai',
    location: 'Amrut Nagar',
    rating: 5,
    body: 'The baby corn and exotic broccoli were super fresh! Love the Day/Night themes as well. Truly premium service.',
    createdAt: '2026-06-30T18:45:00Z'
  }
];

export const DELIVERY_ZONES = [
  'Pant Nagar',
  'Garodia Nagar',
  'LBS Marg',
  'Amrut Nagar',
  'Cama Lane',
  'Vallabh Baug Lane',
  'Ghatkopar East',
  'Ghatkopar West',
  'Vikhroli West'
];
