import { Link } from 'react-router-dom';

export default function MarketingBrand({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <Link className={`marketing-brand marketing-brand--${tone}`} to="/" aria-label="AuraFlow home">
      <span className="marketing-brand__mark" aria-hidden="true">
        <img src="/marketing/auraflow-logo-mark-144.webp" alt="" width="144" height="144" />
      </span>
      <span>AuraFlow</span>
    </Link>
  );
}
