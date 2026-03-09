import React, { useState } from 'react';

export interface CompletedBookingSnapshot {
  bookingId: string;
  detailerId: string;
  detailerName: string;
  serviceName: string;
}

interface JobCompletionModalProps {
  booking: CompletedBookingSnapshot;
  mode: 'completion' | 'history';
  onSubmit: (tipCents: number, rating: number, reviewText: string) => Promise<void>;
  onTipError?: (message: string) => void;
}

const TIP_PRESETS = [
  { label: '$5', cents: 500 },
  { label: '$10', cents: 1000 },
  { label: '$20', cents: 2000 },
];

const JobCompletionModal: React.FC<JobCompletionModalProps> = ({
  booking,
  mode,
  onSubmit,
  onTipError,
}) => {
  const [tipCents, setTipCents] = useState(0);
  const [customTipDollars, setCustomTipDollars] = useState('');
  const [showCustomTip, setShowCustomTip] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showTipSection = mode === 'completion';

  const getEffectiveTipCents = (): number => {
    if (showCustomTip && customTipDollars.trim()) {
      const d = parseFloat(customTipDollars);
      if (!Number.isNaN(d) && d >= 0) return Math.round(d * 100);
    }
    return tipCents;
  };

  const handleSubmit = async () => {
    if (rating < 1 || rating > 5) {
      setError('Please select a star rating.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const effectiveTip = getEffectiveTipCents();
      await onSubmit(effectiveTip, rating, reviewText.trim());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      if (showTipSection && getEffectiveTipCents() > 0 && onTipError) {
        onTipError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col overflow-y-auto">
      <div className="flex-1 max-w-lg mx-auto w-full px-6 py-8 pb-24">
        {/* Section 1 — Header */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-black tracking-tight mb-2">Job Complete! 🎉</h2>
          <p className="text-lg font-bold text-gray-900">{booking.detailerName}</p>
          <p className="text-gray-600 font-medium">{booking.serviceName}</p>
          <p className="text-gray-500 text-sm mt-2">Thank you for choosing {booking.detailerName}</p>
        </div>

        {/* Section 2 — Tip (optional, completion only) */}
        {showTipSection && (
          <div className="mb-8">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
              Leave a tip for your detailer
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {TIP_PRESETS.map(({ label, cents }) => (
                <button
                  key={cents}
                  type="button"
                  onClick={() => {
                    setShowCustomTip(false);
                    setCustomTipDollars('');
                    setTipCents(tipCents === cents ? 0 : cents);
                  }}
                  className={`px-4 py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${
                    tipCents === cents && !showCustomTip
                      ? 'bg-black text-white border-black'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setTipCents(0);
                  setShowCustomTip(true);
                }}
                className={`px-4 py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${
                  showCustomTip ? 'bg-black text-white border-black' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                Custom
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCustomTip(false);
                  setCustomTipDollars('');
                  setTipCents(0);
                }}
                className={`px-4 py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${
                  tipCents === 0 && !showCustomTip ? 'bg-black text-white border-black' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                No tip
              </button>
            </div>
            {showCustomTip && (
              <div className="mt-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount (e.g. 15)"
                  value={customTipDollars}
                  onChange={(e) => setCustomTipDollars(e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-black"
                />
                <p className="text-xs text-gray-500 mt-1">Enter amount in dollars</p>
              </div>
            )}
          </div>
        )}

        {/* Section 3 — Rate your experience */}
        <div className="mb-8">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
            Rate your experience <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2 mb-4">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className="p-1 focus:outline-none"
                aria-label={`${star} star${star > 1 ? 's' : ''}`}
              >
                <span className={`text-3xl ${rating >= star ? 'text-yellow-400' : 'text-gray-300'}`}>★</span>
              </button>
            ))}
          </div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
            Leave a review (optional)
          </label>
          <textarea
            placeholder="Great job, very thorough..."
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            rows={3}
            className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium focus:outline-none focus:border-black resize-none"
          />
        </div>

        {error && (
          <p className="text-red-600 text-sm font-medium mb-4">{error}</p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || rating < 1}
          className="w-full py-4 rounded-2xl font-black text-lg bg-black text-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
        >
          {submitting ? 'Submitting…' : 'Submit & Done'}
        </button>
      </div>
    </div>
  );
};

export default JobCompletionModal;
