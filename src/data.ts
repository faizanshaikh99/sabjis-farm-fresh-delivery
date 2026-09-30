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
    basePricePerKg: 30,
    base_price_per_kg: 30,
    unit: 'kg',
    weight: 'per kg',
    discount: '-10%',
    img: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&q=80&w=400',
    image: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&q=80&w=400',
    image_url: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&q=80&w=400',
    images: [
      { id: 'img_1_1', url: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&q=80&w=600', tag: 'Cover', isConfirmed: true, isMatch: true, detectedObject: 'Potato' }
    ],
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
    basePricePerKg: 38,
    base_price_per_kg: 38,
    unit: 'kg',
    weight: 'per kg',
    discount: '-15%',
    img: 'https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&q=80&w=400',
    image: 'https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&q=80&w=400',
    image_url: 'https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&q=80&w=400',
    images: [
      { id: 'img_2_1', url: 'https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&q=80&w=600', tag: 'Cover', isConfirmed: true, isMatch: true, detectedObject: 'Onion' }
    ],
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
    cp: 60,
    sp: 100,
    basePricePerKg: 100,
    base_price_per_kg: 100,
    unit: 'kg',
    weight: 'per kg',
    discount: '',
    img: 'https://images.unsplash.com/photo-1607305387299-a3d9611cd469?auto=format&fit=crop&q=80&w=400',
    image: 'https://images.unsplash.com/photo-1607305387299-a3d9611cd469?auto=format&fit=crop&q=80&w=400',
    image_url: 'https://images.unsplash.com/photo-1607305387299-a3d9611cd469?auto=format&fit=crop&q=80&w=400',
    images: [
      { id: 'img_3_1', url: 'https://images.unsplash.com/photo-1607305387299-a3d9611cd469?auto=format&fit=crop&q=80&w=600', tag: 'Cover', isConfirmed: true, isMatch: true, detectedObject: 'Tomato' }
    ],
    emoji: '🍅',
    rating: 4.9,
    reviews: 52,
    stockQty: 45,
    lowAt: 10,
    pricingMode: 'slabs',
    weightSlabs: [
      { id: 'slab_500g', grams: 500, weightLabel: '500g', price: 40, enabled: true },
      { id: 'slab_1000g', grams: 1000, weightLabel: '1kg', price: 100, enabled: true },
      { id: 'slab_2000g', grams: 2000, weightLabel: '2kg', price: 180, enabled: true }
    ],
    weight_slabs: [
      { id: 'slab_500g', grams: 500, weightLabel: '500g', price: 40, enabled: true },
      { id: 'slab_1000g', grams: 1000, weightLabel: '1kg', price: 100, enabled: true },
      { id: 'slab_2000g', grams: 2000, weightLabel: '2kg', price: 180, enabled: true }
    ]
  },
  {
    id: 4,
    name: 'Fresh Bhindi (Okra)',
    cat: 'gourd',
    type: 'organic',
    cp: 35,
    sp: 60,
    basePricePerKg: 60,
    base_price_per_kg: 60,
    unit: 'kg',
    weight: 'per kg',
    discount: '',
    img: 'https://images.unsplash.com/photo-1425543103986-22abb7d7e8d2?auto=format&fit=crop&q=80&w=400',
    image: 'https://images.unsplash.com/photo-1425543103986-22abb7d7e8d2?auto=format&fit=crop&q=80&w=400',
    image_url: 'https://images.unsplash.com/photo-1425543103986-22abb7d7e8d2?auto=format&fit=crop&q=80&w=400',
    images: [
      { id: 'img_4_1', url: 'https://images.unsplash.com/photo-1425543103986-22abb7d7e8d2?auto=format&fit=crop&q=80&w=600', tag: 'Cover', isConfirmed: true, isMatch: true, detectedObject: 'Okra' }
    ],
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
    basePricePerKg: 35,
    base_price_per_kg: 35,
    unit: 'kg',
    weight: 'per kg',
    discount: '-20%',
    img: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&q=80&w=400',
    image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&q=80&w=400',
    image_url: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&q=80&w=400',
    images: [
      { id: 'img_5_1', url: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&q=80&w=600', tag: 'Cover', isConfirmed: true, isMatch: true, detectedObject: 'Eggplant' }
    ],
    emoji: '🍆',
    rating: 4.2,
    reviews: 19,
    stockQty: 25,
    lowAt: 8
  },
  {
    id: 6,
    name: 'Palak (Spinach)',
    cat: 'leafy',
    type: 'organic',
    cp: 12,
    sp: 25,
    basePricePerKg: 25,
    base_price_per_kg: 25,
    unit: 'kg',
    weight: '250g bundle',
    discount: '',
    img: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&q=80&w=400',
    image: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&q=80&w=400',
    image_url: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&q=80&w=400',
    images: [
      { id: 'img_6_1', url: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&q=80&w=600', tag: 'Cover', isConfirmed: true, isMatch: true, detectedObject: 'Spinach' }
    ],
    emoji: '🥬',
    rating: 4.9,
    reviews: 64,
    stockQty: 50,
    lowAt: 12
  },
  {
    id: 7,
    name: 'Methi (Fenugreek)',
    cat: 'leafy',
    type: 'organic',
    cp: 15,
    sp: 28,
    basePricePerKg: 28,
    base_price_per_kg: 28,
    unit: 'kg',
    weight: '250g bundle',
    discount: '',
    img: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&q=80&w=400',
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&q=80&w=400',
    image_url: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&q=80&w=400',
    images: [
      { id: 'img_7_1', url: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&q=80&w=600', tag: 'Cover', isConfirmed: true, isMatch: true, detectedObject: 'Fenugreek' }
    ],
    emoji: '🌿',
    rating: 4.6,
    reviews: 21,
    stockQty: 40,
    lowAt: 10
  },
  {
    id: 8,
    name: 'Shimla Mirch (Capsicum)',
    cat: 'gourd',
    type: 'organic',
    cp: 40,
    sp: 70,
    basePricePerKg: 70,
    base_price_per_kg: 70,
    unit: 'kg',
    weight: 'per kg',
    discount: '',
    img: 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&q=80&w=400',
    image: 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&q=80&w=400',
    image_url: 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&q=80&w=400',
    images: [
      { id: 'img_8_1', url: 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&q=80&w=600', tag: 'Cover', isConfirmed: true, isMatch: true, detectedObject: 'Capsicum' }
    ],
    emoji: '🫑',
    rating: 4.5,
    reviews: 33,
    stockQty: 35,
    lowAt: 8
  },
  {
    id: 9,
    name: 'Phool Gobhi (Cauliflower / Flower)',
    cat: 'gourd',
    type: 'deal',
    cp: 25,
    sp: 45,
    basePricePerKg: 45,
    base_price_per_kg: 45,
    unit: 'piece',
    weight: 'per pc',
    discount: '-12%',
    img: 'https://images.unsplash.com/photo-1568584711270-dcae6f3af5ef?auto=format&fit=crop&q=80&w=400',
    image: 'https://images.unsplash.com/photo-1568584711270-dcae6f3af5ef?auto=format&fit=crop&q=80&w=400',
    image_url: 'https://images.unsplash.com/photo-1568584711270-dcae6f3af5ef?auto=format&fit=crop&q=80&w=400',
    images: [
      { id: 'img_9_1', url: 'https://images.unsplash.com/photo-1568584711270-dcae6f3af5ef?auto=format&fit=crop&q=80&w=600', tag: 'Cover', isConfirmed: true, isMatch: true, detectedObject: 'Cauliflower' }
    ],
    emoji: '🥦',
    rating: 4.7,
    reviews: 41,
    stockQty: 28,
    lowAt: 6
  },
  {
    id: 10,
    name: 'Broccoli Exotic',
    cat: 'exotic',
    type: 'organic',
    cp: 65,
    sp: 110,
    basePricePerKg: 110,
    base_price_per_kg: 110,
    unit: 'piece',
    weight: 'per pc',
    discount: '',
    img: 'https://images.unsplash.com/photo-1584270354949-c26b0d5b4a0c?auto=format&fit=crop&q=80&w=400',
    image: 'https://images.unsplash.com/photo-1584270354949-c26b0d5b4a0c?auto=format&fit=crop&q=80&w=400',
    image_url: 'https://images.unsplash.com/photo-1584270354949-c26b0d5b4a0c?auto=format&fit=crop&q=80&w=400',
    images: [
      { id: 'img_10_1', url: 'https://images.unsplash.com/photo-1584270354949-c26b0d5b4a0c?auto=format&fit=crop&q=80&w=600', tag: 'Cover', isConfirmed: true, isMatch: true, detectedObject: 'Broccoli' }
    ],
    emoji: '🥦',
    rating: 4.9,
    reviews: 38,
    stockQty: 20,
    lowAt: 5
  },
  {
    id: 11,
    name: 'Hari Mirch (Green Chili)',
    cat: 'herbs',
    type: 'organic',
    cp: 20,
    sp: 40,
    basePricePerKg: 40,
    base_price_per_kg: 40,
    unit: 'packet',
    weight: '200g pack',
    discount: '',
    img: 'https://images.unsplash.com/photo-1588880331179-bc9b93a8cb5e?auto=format&fit=crop&q=80&w=400',
    image: 'https://images.unsplash.com/photo-1588880331179-bc9b93a8cb5e?auto=format&fit=crop&q=80&w=400',
    image_url: 'https://images.unsplash.com/photo-1588880331179-bc9b93a8cb5e?auto=format&fit=crop&q=80&w=400',
    images: [
      { id: 'img_11_1', url: 'https://images.unsplash.com/photo-1588880331179-bc9b93a8cb5e?auto=format&fit=crop&q=80&w=600', tag: 'Cover', isConfirmed: true, isMatch: true, detectedObject: 'Green Chili' }
    ],
    emoji: '🌶️',
    rating: 4.8,
    reviews: 27,
    stockQty: 50,
    lowAt: 10
  },
  {
    id: 12,
    name: 'Adrak (Ginger)',
    cat: 'herbs',
    type: 'deal',
    cp: 50,
    sp: 90,
    basePricePerKg: 90,
    base_price_per_kg: 90,
    unit: 'kg',
    weight: '500g',
    discount: '-15%',
    img: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&q=80&w=400',
    image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&q=80&w=400',
    image_url: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&q=80&w=400',
    images: [
      { id: 'img_12_1', url: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&q=80&w=600', tag: 'Cover', isConfirmed: true, isMatch: true, detectedObject: 'Ginger' }
    ],
    emoji: '🫚',
    rating: 4.7,
    reviews: 45,
    stockQty: 30,
    lowAt: 8
  },
  {
    id: 1788092167331,
    name: 'melon',
    cat: 'exotic',
    type: 'organic',
    cp: 20,
    sp: 30,
    basePricePerKg: 30,
    base_price_per_kg: 30,
    unit: 'kg',
    weight: 'per kg',
    discount: '',
    img: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&q=80&w=400',
    image: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&q=80&w=400',
    image_url: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&q=80&w=400',
    images: [
      { id: 'img_1788092167331_0', url: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&q=80&w=600', tag: 'Cover', isConfirmed: true, isMatch: true, detectedObject: 'Melon' }
    ],
    emoji: '🍈',
    rating: 5.0,
    reviews: 1,
    stockQty: 50,
    lowAt: 10
  },
  {
    id: 1789884645785,
    name: 'Fresh Orange (Santra)',
    cat: 'exotic',
    type: 'organic',
    cp: 40,
    sp: 70,
    basePricePerKg: 70,
    base_price_per_kg: 70,
    unit: 'kg',
    weight: 'per kg',
    discount: '',
    img: 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?auto=format&fit=crop&q=80&w=400',
    image: 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?auto=format&fit=crop&q=80&w=400',
    image_url: 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?auto=format&fit=crop&q=80&w=400',
    images: [
      { id: 'img_1789884645785_0', url: 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?auto=format&fit=crop&q=80&w=600', tag: 'Cover', isConfirmed: true, isMatch: true, detectedObject: 'Orange' }
    ],
    emoji: '🍊',
    rating: 4.8,
    reviews: 12,
    stockQty: 40,
    lowAt: 10
  },
  {
    id: 1789884645786,
    name: 'Tindli (Ivy Gourd / Kundru)',
    cat: 'gourd',
    type: 'organic',
    cp: 25,
    sp: 45,
    basePricePerKg: 45,
    base_price_per_kg: 45,
    unit: 'kg',
    weight: 'per kg',
    discount: '',
    img: 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?auto=format&fit=crop&q=80&w=400',
    image: 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?auto=format&fit=crop&q=80&w=400',
    image_url: 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?auto=format&fit=crop&q=80&w=400',
    images: [
      { id: 'img_1789884645786_0', url: 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?auto=format&fit=crop&q=80&w=600', tag: 'Cover', isConfirmed: true, isMatch: true, detectedObject: 'Tindli' }
    ],
    emoji: '🥒',
    rating: 4.6,
    reviews: 15,
    stockQty: 35,
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
