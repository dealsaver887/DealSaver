import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Search, ArrowUpRight, ShieldCheck, SlidersHorizontal, RotateCw, Sparkles, Flame } from 'lucide-react';
import { getGetDealsQueryKey, useGetDeals } from '@workspace/api-client-react';
import type { Deal, DealCategory } from '@workspace/api-client-react';

const categories: Array<'All' | DealCategory> = ['All', 'Electronics', 'Home', 'Beauty', 'Health', 'Clothing', 'Kids', 'Grocery', 'Pets', 'Other'];
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const percentOff = (deal: Deal) => Math.max(0, Math.round((1 - deal.sale_price / deal.original_price) * 100));

function DealArtwork({ deal }: { deal: Deal }) {
  const [failed, setFailed] = useState(false);
  if (!deal.image_url || failed) {
    return <div className="deal-artwork-fallback" data-testid={`fallback-image-${deal.id}`} aria-label={`${deal.category} illustration`}>
      <div className="fallback-sun" />
      <div className="fallback-shape shape-one" /><div className="fallback-shape shape-two" />
      <span>{deal.category}</span>
      <small>DEALSAVER / OBJECT STUDY</small>
    </div>;
  }
  return <img src={deal.image_url} alt={deal.product_name} className="deal-image" loading="lazy" onError={() => setFailed(true)} data-testid={`image-deal-${deal.id}`} />;
}

function DealCard({ deal }: { deal: Deal }) {
  const savings = Math.max(0, deal.original_price - deal.sale_price);
  return <a className="deal-card" href={deal.affiliate_url} target="_blank" rel="noopener noreferrer" data-testid={`card-deal-${deal.id}`} aria-label={`Shop ${deal.product_name} at ${deal.store}`}>
    <div className="deal-visual">
      <DealArtwork deal={deal} />
      <div className="deal-badges">
        {deal.is_featured && <span className="deal-badge featured" data-testid={`badge-featured-${deal.id}`}>Editor’s pick</span>}
        {deal.is_hot && <span className="deal-badge hot" data-testid={`badge-hot-${deal.id}`}>Trending</span>}
      </div>
      <div className="discount-stamp"><strong>{percentOff(deal)}%</strong><span>OFF</span></div>
    </div>
    <div className="deal-card-body">
      <div className="deal-card-kicker"><span>{deal.store}</span><span>{deal.category}</span></div>
      <h3>{deal.product_name}</h3>
      {deal.description && <p className="deal-description">{deal.description}</p>}
      <div className="deal-card-bottom">
        <div className="deal-prices"><strong>{money(deal.sale_price)}</strong><del>{money(deal.original_price)}</del></div>
        <span className="save-amount">Save {money(savings)} <ArrowUpRight size={16} /></span>
      </div>
      {deal.end_date && <div className="deal-card-expiry">Offer ends {new Date(`${deal.end_date.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>}
    </div>
  </a>;
}

export default function HomePage() {
  const [category, setCategory] = useState<'All' | DealCategory>('All');
  const [search, setSearch] = useState('');
  const dealsQuery = useGetDeals(undefined, { query: { queryKey: getGetDealsQueryKey(), retry: false } });
  const apiDeals = dealsQuery.data ?? [];
  const deals = useMemo(() => apiDeals.filter((deal) => {
    const matchesCategory = category === 'All' || deal.category === category;
    const term = search.trim().toLocaleLowerCase();
    const matchesSearch = !term || `${deal.product_name} ${deal.store} ${deal.category} ${deal.description ?? ''}`.toLocaleLowerCase().includes(term);
    return matchesCategory && matchesSearch;
  }), [apiDeals, category, search]);
  return <main className="public-shell">
    <header className="site-header">
      <Link href="/" className="wordmark" data-testid="link-home"><span className="brand-mark"><i /><i /><i /></span><span>deal<span className="wordmark-accent">saver</span></span></Link>
      <small>Test</small>
      <nav className="header-nav" aria-label="Main navigation">
        <span className="header-note"><span className="live-dot" /> Hand-picked, never scraped</span>
        <Link href="/admin" className="quiet-link" data-testid="link-admin">Owner access <ArrowUpRight size={14} /></Link>
      </nav>
    </header>
    <section className="home-intro">
      <div className="intro-copy">
        <span className="eyebrow"><span className="eyebrow-line" /> THE GOOD FINDS, RIGHT NOW</span>
        <h1>Good things.<br /><em>Better prices.</em></h1>
        <p>A small, considered edit of deals worth your attention. Checked by a real person, updated as things change.</p>
        <div className="intro-trust"><ShieldCheck size={16} /><span>Every offer is hand-checked before it lands here.</span></div>
      </div>
      <aside className="intro-aside">
        <div className="intro-orbit"><div className="orbit-inner"><span>DS</span><i /></div></div>
        <p>LESS SCROLLING.<br /><b>MORE SAVING.</b></p>
        <span className="aside-index">CURATION NO. 01 / DAILY EDIT</span>
      </aside>
    </section>
    <section className="deals-section" aria-labelledby="deals-title">
      <div className="section-heading">
        <div><span className="eyebrow"><span className="eyebrow-line" /> THE LIVE EDIT</span><h2 id="deals-title"><Flame className="section-flame" size={25} aria-hidden="true" /> Today’s Hottest Deals<span>.</span></h2></div>
        <div className="deal-count" data-testid="count-active-deals"><strong>{dealsQuery.isLoading ? '—' : apiDeals.length.toString().padStart(2, '0')}</strong><span>ACTIVE<br />OFFERS</span></div>
      </div>
      <div className="browse-tools">
        <label className="search-control"><Search size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a good thing..." aria-label="Search deals" data-testid="input-search-deals" /><kbd>/</kbd></label>
        <span className="filter-caption"><SlidersHorizontal size={15} /> FILTER BY</span>
      </div>
      <div className="category-list" role="group" aria-label="Filter deals by category">
        {categories.map((item) => <button key={item} className={`category-chip ${category === item ? 'selected' : ''}`} onClick={() => setCategory(item)} data-testid={`filter-category-${item.toLowerCase()}`} aria-pressed={category === item}>{item}</button>)}
      </div>
      {dealsQuery.isLoading && <div className="deal-grid" data-testid="loading-deals">{Array.from({ length: 4 }).map((_, index) => <div className="deal-skeleton" key={index}><div className="skeleton-art" /><div className="skeleton-line wide" /><div className="skeleton-line" /><div className="skeleton-line short" /></div>)}</div>}
      {dealsQuery.isError && <div className="state-panel error-panel" data-testid="error-deals"><div className="state-icon"><RotateCw size={19} /></div><div><h3>Couldn’t load the current edit.</h3><p>{dealsQuery.error instanceof Error ? dealsQuery.error.message : 'Something interrupted the connection. Your filters are right where you left them.'}</p></div><button className="outline-button" onClick={() => dealsQuery.refetch()} data-testid="button-retry-deals">Try again <RotateCw size={14} /></button></div>}
      {!dealsQuery.isLoading && !dealsQuery.isError && deals.length > 0 && <div className="deal-grid" data-testid="grid-deals">{deals.map((deal) => <DealCard key={deal.id} deal={deal} />)}</div>}
      {!dealsQuery.isLoading && !dealsQuery.isError && deals.length === 0 && <div className="state-panel empty-panel" data-testid="empty-deals"><div className="empty-mark"><Sparkles size={22} /></div><span className="eyebrow">A LITTLE BREATHER</span><h3>{search || category !== 'All' ? 'Nothing in this corner just yet.' : 'The next good find is on its way.'}</h3><p>{search || category !== 'All' ? 'Try another search or category. We only show offers the owner has actually added.' : 'No active deals at the moment. Check back soon for the next hand-picked edit.'}</p>{(search || category !== 'All') && <button className="outline-button" onClick={() => { setSearch(''); setCategory('All'); }} data-testid="button-clear-filters">Clear filters</button>}</div>}
      <footer className="deals-footer"><span>MADE FOR PEOPLE WHO LIKE A GOOD FIND.</span><span>Prices and availability may change at the retailer.</span></footer>
    </section>
    <footer className="site-footer"><Link href="/" className="wordmark small-wordmark" data-testid="link-footer-home"><span className="brand-mark"><i /><i /><i /></span><span>deal<span className="wordmark-accent">saver</span></span></Link><span>Good finds, thoughtfully gathered.</span><Link href="/sign-in" className="footer-owner" data-testid="link-owner-sign-in">Owner sign in</Link></footer>
  </main>;
}