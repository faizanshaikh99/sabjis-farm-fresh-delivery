/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Review, User } from '../types';
import { Star, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ReviewSectionProps {
  reviews: Review[];
  currentUser?: User | null;
  onSubmitReview: (name: string, location: string, rating: number, body: string) => void;
}

export const ReviewSection: React.FC<ReviewSectionProps> = ({ reviews, currentUser, onSubmitReview }) => {
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [body, setBody] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const authorName = currentUser?.name || 'Verified Buyer';
    const authorLocation = currentUser?.addresses?.[0]?.area || 'Ghatkopar East';

    onSubmitReview(authorName, authorLocation, rating, body.trim());
    setSubmitted(true);
    setRating(5);
    setBody('');
    setTimeout(() => {
      setSubmitted(false);
      setShowForm(false);
    }, 3000);
  };

  const colors = ['bg-green-600', 'bg-blue-600', 'bg-purple-600', 'bg-orange-600', 'bg-pink-600'];

  return (
    <section className="py-12 border-t border-[var(--border)] bg-[var(--bg)]" id="reviews">
      <div className="mx-auto max-w-7xl px-4">
        {/* Section Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-[var(--fg)]">Customer Reviews</h2>
            <p className="text-xs text-[var(--muted-fg)] mt-1">Real feedback from verified buyers in Ghatkopar</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs font-bold text-[var(--fg)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all duration-200"
          >
            ✏️ Write a Review
          </button>
        </div>

        {/* Review Submission Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-8"
            >
              {submitted ? (
                <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-800">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white">✓</div>
                  <div>
                    <h4 className="font-bold">Thank you!</h4>
                    <p className="text-xs text-green-700 font-normal">Your review has been successfully submitted and published.</p>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm flex flex-col gap-4"
                >
                  <h3 className="text-sm font-bold text-[var(--fg)]">Share your farm-fresh experience</h3>
                  <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3 text-xs">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)] text-white font-black text-xs">
                      {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : '👤'}
                    </div>
                    <div>
                      <p className="font-bold text-[var(--fg)]">Posting as {currentUser?.name || 'Verified Buyer'}</p>
                      <p className="text-[10px] text-[var(--muted-fg)]">Location: {currentUser?.addresses?.[0]?.area || 'Ghatkopar East'} (Extracted from your profile)</p>
                    </div>
                  </div>

                  {/* Rating Selector */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-[var(--muted-fg)]">Rating *</label>
                    <div className="flex gap-1 py-1">
                      {Array.from({ length: 5 }).map((_, i) => {
                        const starVal = i + 1;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setRating(starVal)}
                            onMouseEnter={() => setHoverRating(starVal)}
                            onMouseLeave={() => setHoverRating(0)}
                            className="text-2xl transition-all hover:scale-110"
                          >
                            {starVal <= (hoverRating || rating) ? '⭐' : '☆'}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Review Content */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-baseline">
                      <label className="text-xs font-bold text-[var(--muted-fg)]">Your Review (Optional)</label>
                      <span className="text-[10px] text-[var(--muted-fg)]">{body.length}/1000</span>
                    </div>
                    <textarea
                      maxLength={1000}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={3}
                      placeholder="Tell us about the freshness, delivery, and quality of your veggies (optional)..."
                      className="rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-4 py-2 text-sm text-[var(--fg)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-sh)] transition-all resize-none"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--muted-fg)] hover:text-red-500 hover:border-red-200 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-full bg-[var(--primary)] px-6 py-2 text-xs font-bold text-white hover:opacity-95 transition-all"
                    >
                      Submit Review
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reviews Grid */}
        {reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--card)]">
            <MessageSquare className="h-10 w-10 text-[var(--muted-fg)] opacity-40 mb-3" />
            <h4 className="font-bold text-[var(--fg)] mb-1">No reviews yet</h4>
            <p className="text-xs text-[var(--muted-fg)] mb-4">Be the first to review Sabjies and share the love!</p>
            <button
              onClick={() => setShowForm(true)}
              className="rounded-full bg-[var(--primary)] px-5 py-2 text-xs font-bold text-white"
            >
              Write First Review
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r, idx) => {
              const author = r.authorName || (r as any).author_name || 'Customer';
              const initials = author
                .split(' ')
                .map((w) => w[0] || '')
                .join('')
                .slice(0, 2)
                .toUpperCase();
              const avatarColor = colors[idx % colors.length];
              const dateString = new Date(r.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });

              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm"
                >
                  {/* Rating Stars */}
                  <div className="flex text-amber-500">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${i < r.rating ? 'fill-current' : 'opacity-25'}`}
                      />
                    ))}
                  </div>

                  {/* Body */}
                  {r.body ? (
                    <p className="flex-1 text-xs leading-relaxed text-[var(--fg)] italic">
                      "{r.body}"
                    </p>
                  ) : (
                    <p className="flex-1 text-xs text-[var(--muted-fg)] italic">
                      (Rated {r.rating} stars)
                    </p>
                  )}

                  {/* Footer Author Info */}
                  <div className="flex items-center gap-3 border-t border-[var(--border)] pt-3 mt-1">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor}`}>
                      {initials}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[var(--fg)]">{r.authorName}</h4>
                      {r.location && <p className="text-[10px] text-[var(--muted-fg)]">{r.location}</p>}
                    </div>
                    <span className="ml-auto text-[10px] text-[var(--muted-fg)]">{dateString}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
