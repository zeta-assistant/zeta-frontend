'use client';

import React from 'react';
import Image from 'next/image';

export type Plan = 'free' | 'premium';

type MarkProps = {
  /** 'free' shows /zeta-avatar.png, 'premium' shows /zeta-premium.png */
  plan?: Plan;
  /** Pixel size of the square image area */
  size?: number;
  /** Optional click (e.g., open /settings) */
  onClick?: () => void;
  /** Tooltip/title text */
  title?: string;
  /** Extra classes for container */
  className?: string;
  /** Show a tiny label below the image (Premium/Free) */
  showLabel?: boolean;
  /** Image src overrides */
  srcFree?: string;
  srcPremium?: string;
};

/**
 * ZetaPremiumMark
 * - Premium: golden glow, crown/bolt accents, /zeta-premium.png
 * - Free: subtle slate glow, /zeta-avatar.png
 *
 * Place images in `/public/zeta-avatar.png` and `/public/zeta-premium.png`.
 */
export default function ZetaPremiumMark({
  plan = 'premium',
  size = 96,
  onClick,
  title,
  className = '',
  showLabel = true,
  srcFree = '/zeta-avatar.png',
  srcPremium = '/zeta-premium.png',
}: MarkProps) {
  const isPremium = plan === 'premium';
  const src = isPremium ? srcPremium : srcFree;

  return (
    <div className="inline-flex flex-col items-center">
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`relative rounded-2xl transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          isPremium ? 'focus:ring-amber-400' : 'focus:ring-slate-300'
        } ${className}`}
        style={{ width: size, height: size }}
      >
        {/* Glow */}
        <div
          className={`absolute inset-0 rounded-2xl blur-xl ${
            isPremium ? 'bg-amber-300/40 animate-pulse' : 'bg-slate-300/25'
          }`}
        />

        {/* Image */}
        <Image
          src={src}
          alt={isPremium ? 'Zeta Premium' : 'Zeta'}
          width={size}
          height={size}
          className="relative z-10 rounded-2xl select-none pointer-events-none"
          priority
        />

        {/* Premium crown */}
        {isPremium && (
          <svg
            className="absolute -top-3 -right-3 z-20 drop-shadow"
            width={Math.round(size * 0.42)}
            height={Math.round(size * 0.42)}
            viewBox="0 0 120 120"
            aria-hidden
          >
            <defs>
              <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#FDE68A" />
                <stop offset="50%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#FDE68A" />
              </linearGradient>
            </defs>
            <path
              d="M10 85 L30 35 L60 70 L90 25 L110 85 Z"
              fill="url(#goldGrad)"
              stroke="#B45309"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <rect
              x="18"
              y="85"
              width="84"
              height="16"
              rx="6"
              fill="#FCD34D"
              stroke="#B45309"
              strokeWidth="4"
            />
          </svg>
        )}

        {/* Lightning spark */}
        {isPremium && (
          <svg
            className="absolute -left-3 -bottom-6 z-20 animate-bounce"
            width={Math.round(size * 0.3)}
            height={Math.round(size * 0.3)}
            viewBox="0 0 80 80"
            aria-hidden
          >
            <path d="M48 6 L18 42 H40 L30 74 L62 36 H40 Z" fill="#F59E0B" />
          </svg>
        )}
      </button>

      {showLabel && (
        <span
          className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
            isPremium
              ? 'border-amber-400 bg-white text-amber-700'
              : 'border-slate-300 bg-white text-slate-700'
          }`}
        >
          {isPremium ? '👑 Premium' : '🟢 Free'}
        </span>
      )}
    </div>
  );
}

/* ──────────────────────────────
   Optional: tiny plan pill tag
────────────────────────────── */
export function PlanTag({
  plan,
  onClick,
  className = '',
  title = 'Open Settings',
}: {
  plan: Plan;
  onClick?: () => void;
  className?: string;
  title?: string;
}) {
  const isPremium = plan === 'premium';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition ${
        isPremium
          ? 'border-amber-400 bg-white hover:bg-amber-50 text-amber-700'
          : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
      } ${className}`}
    >
      <span aria-hidden>{isPremium ? '👑' : '🟢'}</span>
      <span className="font-medium">{isPremium ? 'Premium' : 'Free'}</span>
    </button>
  );
}
