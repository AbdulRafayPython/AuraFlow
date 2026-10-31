// Five stars: shows an average, or lets the person pick their own rating.
import React from 'react';
import { Star } from 'lucide-react';

interface Props {
  /** The value to fill (an average may be fractional: it is rounded to the nearest star). */
  value: number | null;
  /** When given, the stars are buttons that call this with 1 to 5. */
  onRate?: (stars: number) => void;
  disabled?: boolean;
  label: string;
}

const StarRating: React.FC<Props> = ({ value, onRate, disabled, label }) => {
  const filled = Math.round(value ?? 0);
  return (
    <span className="inline-flex items-center gap-0.5" role={onRate ? 'group' : 'img'} aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => {
        const star = <Star className={`h-4 w-4 ${n <= filled ? 'fill-warning text-warning' : 'text-[hsl(var(--theme-text-muted))]'}`} aria-hidden="true" />;
        return onRate ? (
          <button key={n} type="button" disabled={disabled} onClick={() => onRate(n)} aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  aria-pressed={n === filled} className="rounded p-0.5 hover:bg-[hsl(var(--theme-bg-hover))] disabled:opacity-50">
            {star}
          </button>
        ) : <span key={n}>{star}</span>;
      })}
    </span>
  );
};

export default StarRating;
