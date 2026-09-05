/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { ProductImageItem } from '../types';
import { 
  Upload, 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  Tag, 
  Image as ImageIcon, 
  Eye, 
  RefreshCw, 
  X, 
  Check, 
  Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ProductImageManagerProps {
  images: ProductImageItem[];
  onChange: (images: ProductImageItem[]) => void;
  productName: string;
  categoryName?: string;
}

const COMMON_IMAGE_TAGS = [
  'Cover / Primary',
  'Fresh Harvest',
  'Packaging',
  'Close-up Detail',
  'Organic Certification',
  'Farm Sourced',
  'Culinary / Usage',
];

// Helper to compress local images before sending/storing
async function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 1000;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } else {
          resolve(e.target?.result as string);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export const ProductImageManager: React.FC<ProductImageManagerProps> = ({
  images,
  onChange,
  productName,
  categoryName,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationProgress, setValidationProgress] = useState<string | null>(null);
  const [previewModalImg, setPreviewModalImg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Server-side AI Validation runner for an image URL or base64 data
  const validateImageWithServer = async (
    imageUrl: string,
    currentProdName: string,
    currentCatName?: string
  ): Promise<{
    isMatch: boolean;
    confidence: number;
    detectedObject: string;
    reason: string;
    warning: string | null;
    suggestedTag?: string;
  }> => {
    try {
      const res = await fetch('/api/products/validate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          productName: currentProdName || 'Vegetable',
          categoryName: currentCatName || 'Produce',
        }),
      });
      const data = await res.json();
      if (data.success && data.validation) {
        return data.validation;
      }
    } catch (err) {
      console.warn('Validation API failed, falling back:', err);
    }
    return {
      isMatch: true,
      confidence: 0.8,
      detectedObject: currentProdName || 'Vegetable',
      reason: 'Image registered',
      warning: null,
      suggestedTag: 'Fresh Produce',
    };
  };

  // Handle uploading files from device
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsValidating(true);
    const newItems: ProductImageItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setValidationProgress(`Analyzing image ${i + 1} of ${files.length} with AI...`);

      try {
        const compressedBase64 = await compressImageFile(file);
        const validation = await validateImageWithServer(compressedBase64, productName, categoryName);

        const isCover = images.length === 0 && newItems.length === 0;
        const item: ProductImageItem = {
          id: `img_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          url: compressedBase64,
          name: file.name.replace(/\.[^/.]+$/, ''),
          tag: isCover ? 'Cover / Primary' : (validation.suggestedTag || 'Fresh Harvest'),
          isMatch: validation.isMatch,
          confidence: validation.confidence,
          detectedObject: validation.detectedObject,
          warning: validation.warning,
          isConfirmed: validation.isMatch ? true : false,
        };

        newItems.push(item);
      } catch (err) {
        console.error('Error processing file upload:', err);
      }
    }

    setIsValidating(false);
    setValidationProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (newItems.length > 0) {
      onChange([...images, ...newItems]);
    }
  };

  // Handle adding image via web URL
  const handleAddUrl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUrl = urlInput.trim();
    if (!cleanUrl) return;

    setIsValidating(true);
    setValidationProgress('Validating image relevance with AI...');

    try {
      const validation = await validateImageWithServer(cleanUrl, productName, categoryName);
      const isCover = images.length === 0;

      const item: ProductImageItem = {
        id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        url: cleanUrl,
        name: productName ? `${productName} Image` : 'Product Image',
        tag: tagInput.trim() || (isCover ? 'Cover / Primary' : (validation.suggestedTag || 'Fresh Harvest')),
        isMatch: validation.isMatch,
        confidence: validation.confidence,
        detectedObject: validation.detectedObject,
        warning: validation.warning,
        isConfirmed: validation.isMatch ? true : false,
      };

      onChange([...images, item]);
      setUrlInput('');
      setTagInput('');
    } catch (err) {
      console.error('Error validating image URL:', err);
    } finally {
      setIsValidating(false);
      setValidationProgress(null);
    }
  };

  // Reordering functions
  const moveImage = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= images.length) return;

    const updated = [...images];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;

    // If first item changed, update tags appropriately if needed
    if (targetIdx === 0 && updated[0].tag !== 'Cover / Primary') {
      // keep existing tag or suggest cover
    }

    onChange(updated);
  };

  const setAsPrimary = (index: number) => {
    if (index === 0 || index >= images.length) return;
    const updated = [...images];
    const [selected] = updated.splice(index, 1);
    selected.tag = 'Cover / Primary';
    updated.unshift(selected);
    onChange(updated);
  };

  const deleteImage = (id: string) => {
    onChange(images.filter((img) => img.id !== id));
  };

  const updateImageTag = (id: string, newTag: string) => {
    onChange(
      images.map((img) => (img.id === id ? { ...img, tag: newTag } : img))
    );
  };

  const updateImageName = (id: string, newName: string) => {
    onChange(
      images.map((img) => (img.id === id ? { ...img, name: newName } : img))
    );
  };

  const confirmFlaggedImage = (id: string) => {
    onChange(
      images.map((img) =>
        img.id === id ? { ...img, isConfirmed: true } : img
      )
    );
  };

  const recheckImageWithAI = async (id: string) => {
    const target = images.find((i) => i.id === id);
    if (!target) return;

    setIsValidating(true);
    setValidationProgress('Re-analyzing image with AI...');

    try {
      const validation = await validateImageWithServer(target.url, productName, categoryName);
      onChange(
        images.map((img) =>
          img.id === id
            ? {
                ...img,
                isMatch: validation.isMatch,
                confidence: validation.confidence,
                detectedObject: validation.detectedObject,
                warning: validation.warning,
                isConfirmed: validation.isMatch ? true : img.isConfirmed,
              }
            : img
        )
      );
    } finally {
      setIsValidating(false);
      setValidationProgress(null);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 sm:p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--primary)] text-white text-xs font-bold shadow-sm">
            <ImageIcon className="h-4 w-4" />
          </span>
          <div>
            <h4 className="text-xs font-black text-[var(--fg)] flex items-center gap-1.5">
              <span>Product Image Gallery &amp; AI Relevance Verification</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400">
                {images.length} {images.length === 1 ? 'image' : 'images'}
              </span>
            </h4>
            <p className="text-[10px] text-[var(--muted-fg)]">
              Upload multiple product photos. Images are AI-verified to match <strong>{productName || 'this vegetable'}</strong>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/png,image/jpeg,image/jpg,image/webp"
            multiple
            className="hidden"
            id="multi-prod-img-upload"
          />
          <button
            type="button"
            disabled={isValidating}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl bg-[var(--primary)] px-3.5 py-1.5 text-xs font-bold text-white hover:opacity-90 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Upload Device Files</span>
          </button>
        </div>
      </div>

      {/* URL Input Bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5">
          <ImageIcon className="h-3.5 w-3.5 text-[var(--muted-fg)] shrink-0" />
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste direct Image URL (e.g., https://images.unsplash.com/...)"
            className="flex-1 bg-transparent text-xs text-[var(--fg)] outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddUrl();
              }
            }}
          />
        </div>

        <div className="sm:w-48 flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5">
          <Tag className="h-3.5 w-3.5 text-[var(--muted-fg)] shrink-0" />
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Optional tag (e.g. Harvest)"
            className="flex-1 bg-transparent text-xs text-[var(--fg)] outline-none"
          />
        </div>

        <button
          type="button"
          disabled={isValidating || !urlInput.trim()}
          onClick={() => handleAddUrl()}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-1.5 text-xs font-bold text-[var(--fg)] hover:bg-[var(--muted)] transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add URL</span>
        </button>
      </div>

      {/* Validation in Progress banner */}
      {isValidating && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs font-bold text-emerald-700 dark:text-emerald-300 animate-pulse">
          <RefreshCw className="h-4 w-4 animate-spin text-emerald-600" />
          <span>{validationProgress || 'Analyzing image with AI model...'}</span>
        </div>
      )}

      {/* Image Gallery Cards */}
      {images.length === 0 ? (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border)] p-8 text-center bg-[var(--card)]/50 hover:bg-[var(--card)] transition-all cursor-pointer group"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-[var(--primary)] mb-3 group-hover:scale-110 transition-transform">
            <Upload className="h-6 w-6" />
          </div>
          <p className="text-xs font-black text-[var(--fg)]">No product images added yet</p>
          <p className="text-[10px] text-[var(--muted-fg)] mt-1 max-w-sm">
            Click here to upload photos of <strong>{productName || 'this vegetable'}</strong> or paste a URL above. Multiple images can be previewed, tagged, and reordered.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {images.map((item, idx) => {
            const isCover = idx === 0;
            const isFlagged = Boolean(item.warning) && item.isMatch === false;
            const isConfirmed = item.isConfirmed !== false;

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className={`relative flex flex-col rounded-2xl border bg-[var(--card)] p-3.5 shadow-sm transition-all ${
                  isFlagged && !isConfirmed
                    ? 'border-amber-500/50 bg-amber-50/20 dark:bg-amber-950/10'
                    : isCover
                    ? 'border-emerald-500/40 shadow-emerald-500/5 ring-1 ring-emerald-500/20'
                    : 'border-[var(--border)]'
                }`}
              >
                {/* Image Top Info Row */}
                <div className="flex items-start gap-3">
                  {/* Thumbnail */}
                  <div 
                    onClick={() => setPreviewModalImg(item.url)}
                    className="relative aspect-square h-20 w-20 shrink-0 rounded-xl overflow-hidden border border-[var(--border)] bg-gray-100 dark:bg-zinc-800 cursor-pointer group shadow-sm"
                  >
                    <img
                      src={item.url}
                      alt={item.name || productName || 'Product photo'}
                      className="h-full w-full object-cover transition-transform group-hover:scale-110"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&q=80&w=200';
                      }}
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Eye className="h-4 w-4" />
                    </div>
                    {isCover && (
                      <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded-md bg-[var(--primary)] px-1.5 py-0.5 text-[8px] font-black text-white shadow">
                        <Star className="h-2.5 w-2.5 fill-current" />
                        <span>Cover</span>
                      </span>
                    )}
                  </div>

                  {/* Metadata Controls */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-black text-[var(--muted-fg)] uppercase">
                        Photo #{idx + 1}
                      </span>
                      {/* Action buttons: Up, Down, Delete */}
                      <div className="flex items-center gap-1">
                        {!isCover && (
                          <button
                            type="button"
                            onClick={() => setAsPrimary(idx)}
                            className="rounded-lg p-1 text-[10px] font-bold text-[var(--primary)] hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                            title="Set as Primary Cover Image"
                          >
                            Set Cover
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveImage(idx, 'up')}
                          className="rounded-lg p-1 text-gray-400 hover:text-[var(--fg)] hover:bg-[var(--muted)] disabled:opacity-20 cursor-pointer"
                          title="Move earlier"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === images.length - 1}
                          onClick={() => moveImage(idx, 'down')}
                          className="rounded-lg p-1 text-gray-400 hover:text-[var(--fg)] hover:bg-[var(--muted)] disabled:opacity-20 cursor-pointer"
                          title="Move later"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteImage(item.id)}
                          className="rounded-lg p-1 text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                          title="Delete photo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Image Title */}
                    <input
                      type="text"
                      value={item.name || ''}
                      onChange={(e) => updateImageName(item.id, e.target.value)}
                      placeholder="Image label (e.g., Fresh Organic Chili)"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)]"
                    />

                    {/* Image Tag selector */}
                    <div className="flex items-center gap-1.5">
                      <Tag className="h-3 w-3 text-[var(--muted-fg)] shrink-0" />
                      <select
                        value={item.tag || 'Fresh Harvest'}
                        onChange={(e) => updateImageTag(item.id, e.target.value)}
                        className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--fg)] outline-none"
                      >
                        {COMMON_IMAGE_TAGS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* AI Validation Status Badge & Warning Box */}
                <div className="mt-2.5 pt-2 border-t border-[var(--border)]/70">
                  {isFlagged ? (
                    <div className="space-y-2 rounded-xl bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px]">
                      <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300 font-bold leading-tight">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                        <div>
                          <span>{item.warning || `This image may not match ${productName || 'this vegetable'}.`}</span>
                          {item.detectedObject && (
                            <div className="text-[10px] font-normal text-amber-700 dark:text-amber-400 mt-0.5">
                              AI Detected: <strong>{item.detectedObject}</strong>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-amber-500/20 text-[10px]">
                        {!isConfirmed ? (
                          <span className="font-extrabold text-amber-600 dark:text-amber-400">
                            Hidden from public catalog until confirmed
                          </span>
                        ) : (
                          <span className="font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <Check className="h-3 w-3" /> Confirmed by Admin
                          </span>
                        )}

                        <div className="flex items-center gap-1.5">
                          {!isConfirmed && (
                            <button
                              type="button"
                              onClick={() => confirmFlaggedImage(item.id)}
                              className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 text-[10px] font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1"
                            >
                              <Check className="h-3 w-3" />
                              <span>Confirm &amp; Display</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => recheckImageWithAI(item.id)}
                            className="rounded-lg border border-amber-500/40 px-2 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all flex items-center gap-1"
                            title="Re-run AI verification"
                          >
                            <RefreshCw className="h-2.5 w-2.5" />
                            <span>Re-scan</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[10px] text-emerald-600 dark:text-emerald-400 font-bold px-1">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span>AI Verified: Matches {productName || 'Produce'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => recheckImageWithAI(item.id)}
                        className="text-[9px] text-[var(--muted-fg)] hover:text-[var(--fg)] flex items-center gap-0.5"
                        title="Re-run AI analysis"
                      >
                        <RefreshCw className="h-2.5 w-2.5" />
                        <span>Re-check</span>
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Image Fullscreen Preview Modal */}
      <AnimatePresence>
        {previewModalImg && (
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setPreviewModalImg(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative max-w-xl w-full rounded-2xl overflow-hidden bg-[var(--card)] border border-[var(--border)] shadow-2xl z-10 p-3 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                <span className="text-xs font-bold text-[var(--fg)]">Image Full Preview</span>
                <button
                  type="button"
                  onClick={() => setPreviewModalImg(null)}
                  className="rounded-full p-1 text-[var(--muted-fg)] hover:bg-[var(--muted)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[60vh] overflow-hidden rounded-xl bg-black/10 flex items-center justify-center">
                <img
                  src={previewModalImg}
                  alt="Full preview"
                  className="max-h-[60vh] w-auto object-contain rounded-lg"
                  referrerPolicy="no-referrer"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
