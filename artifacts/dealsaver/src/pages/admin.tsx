import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { useClerk } from '@clerk/react';
import { useCreateDeal, useDeleteDeal, useGetAdminDeals, useGetAdminSummary, useUpdateDeal, useUploadDealImage, getGetAdminDealsQueryKey, getGetAdminSummaryQueryKey } from '@workspace/api-client-react';
import type { Deal, DealCategory, DealInput, DealUpdate } from '@workspace/api-client-react';
import { ArrowLeft, ArrowUpRight, BadgeCheck, CalendarDays, Check, ChevronDown, CircleAlert, Eye, EyeOff, Flame, ImagePlus, LoaderCircle, Pencil, Plus, RotateCw, ShieldCheck, Star, Trash2, UploadCloud, X } from 'lucide-react';

const categories: DealCategory[] = ['Electronics', 'Home', 'Beauty', 'Health', 'Clothing', 'Kids', 'Grocery', 'Pets', 'Other'];
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
type FormValues = {
  product_name: string; store: string; category: DealCategory; original_price: string; sale_price: string;
  affiliate_url: string; description: string; start_date: string; end_date: string;
  is_featured: boolean; is_hot: boolean; is_active: boolean; image_url: string;
};
const blankForm = (): FormValues => ({
  product_name: '', store: '', category: 'Electronics', original_price: '', sale_price: '',
  affiliate_url: '', description: '', start_date: new Date().toISOString().slice(0, 10), end_date: '',
  is_featured: false, is_hot: false, is_active: true, image_url: '',
});
const formatMoney = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const dateValue = (value: string) => value ? value.slice(0, 10) : '';

function AdminDealImage({ deal }: { deal: Deal }) {
  const [failed, setFailed] = useState(false);
  return deal.image_url && !failed
    ? <img className="admin-thumb-image" src={deal.image_url} alt="" onError={() => setFailed(true)} />
    : <div className="admin-thumb-fallback"><ImagePlus size={20} /><span>{deal.category}</span></div>;
}

function DealEditor({ deal, onClose, onSave, busy }: { deal: Deal | null; onClose: () => void; onSave: (values: FormValues, image: File | null, editingId?: string) => Promise<void>; busy: boolean }) {
  const form = useForm<FormValues>({ defaultValues: deal ? {
    product_name: deal.product_name, store: deal.store, category: deal.category, original_price: String(deal.original_price),
    sale_price: String(deal.sale_price), affiliate_url: deal.affiliate_url, description: deal.description ?? '',
    start_date: dateValue(deal.start_date), end_date: dateValue(deal.end_date ?? ''),
    is_featured: deal.is_featured, is_hot: deal.is_hot, is_active: deal.is_active, image_url: deal.image_url ?? '',
  } : blankForm() });
  const values = form.watch();
  const [image, setImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => image ? URL.createObjectURL(image) : '', [image]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => form.setValue(key, value as never, { shouldDirty: true });
  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type.toLowerCase()) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
      setImageError('Choose a JPEG, PNG, WEBP, HEIC or HEIF image.');
      event.target.value = '';
      return;
    }
    setImageError('');
    setPreviewFailed(false);
    setImage(file);
  };
  const removeImage = () => {
    setImage(null);
    set('image_url', '');
    setPreviewFailed(false);
    if (fileRef.current) fileRef.current.value = '';
  };
  const submit = async (submittedValues: FormValues) => {
    setSubmitError('');
    if (!submittedValues.product_name.trim() || !submittedValues.store.trim() || !submittedValues.affiliate_url.trim() || !submittedValues.start_date) {
      setSubmitError('Add a product, store, valid retailer link and start date to continue.');
      return;
    }
    const original = Number(submittedValues.original_price), sale = Number(submittedValues.sale_price);
    if (!Number.isFinite(original) || original <= 0 || !Number.isFinite(sale) || sale < 0 || sale > original) {
      setSubmitError('Sale price must be zero or more and no higher than the original price.');
      return;
    }
    if (submittedValues.end_date && submittedValues.end_date < submittedValues.start_date) {
      setSubmitError('The end date must be on or after the start date.');
      return;
    }
    if (!/^https?:\/\//i.test(submittedValues.affiliate_url.trim())) {
      setSubmitError('Use a full retailer URL beginning with https://');
      return;
    }
    try { await onSave(submittedValues, image, deal?.id); }
    catch (error) { setSubmitError(error instanceof Error ? error.message : 'Couldn’t save this deal. Try again.'); }
  };
  const preview = previewUrl || (!previewFailed ? values.image_url : '');
  return <div className="editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="editor-panel" role="dialog" aria-modal="true" aria-labelledby="editor-title" data-testid="dialog-deal-editor">
      <header className="editor-header"><div><span className="eyebrow"><span className="eyebrow-line" /> DEAL DETAILS</span><h2 id="editor-title">{deal ? 'Refine this find' : 'Add a good find'}</h2></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close editor" data-testid="button-close-editor"><X size={19} /></button></header>
      <Form {...form}><form className="editor-form" onSubmit={form.handleSubmit(submit)}>
        <div className="editor-main-fields">
          <label className="form-field span-two"><span>Product name <b>*</b></span><input value={values.product_name} onChange={(event) => set('product_name', event.target.value)} maxLength={180} required placeholder="e.g. Everyday Ceramic Pour-over" data-testid="input-product-name" /></label>
          <label className="form-field"><span>Store <b>*</b></span><input value={values.store} onChange={(event) => set('store', event.target.value)} maxLength={100} required placeholder="Retailer name" data-testid="input-store" /></label>
          <label className="form-field"><span>Category</span><span className="select-wrap"><select value={values.category} onChange={(event) => set('category', event.target.value as DealCategory)} data-testid="select-category">{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select><ChevronDown size={15} /></span></label>
          <label className="form-field"><span>Original price <b>*</b></span><span className="money-input"><span>$</span><input type="number" min="0.01" step="0.01" value={values.original_price} onChange={(event) => set('original_price', event.target.value)} required placeholder="0.00" data-testid="input-original-price" /></span></label>
          <label className="form-field"><span>Sale price <b>*</b></span><span className="money-input"><span>$</span><input type="number" min="0" step="0.01" value={values.sale_price} onChange={(event) => set('sale_price', event.target.value)} required placeholder="0.00" data-testid="input-sale-price" /></span></label>
          <label className="form-field span-two"><span>Retailer / affiliate URL <b>*</b></span><input type="url" value={values.affiliate_url} onChange={(event) => set('affiliate_url', event.target.value)} required placeholder="https://retailer.com/product" data-testid="input-affiliate-url" /></label>
          <label className="form-field span-two"><span>Description <small>Optional</small></span><textarea value={values.description} onChange={(event) => set('description', event.target.value)} rows={3} maxLength={500} placeholder="A short note about why this one is worth it." data-testid="input-description" /></label>
          <label className="form-field"><span>Starts <b>*</b></span><span className="date-input"><CalendarDays size={15} /><input type="date" value={values.start_date} onChange={(event) => set('start_date', event.target.value)} required data-testid="input-start-date" /></span></label>
          <label className="form-field"><span>Ends <small>Optional</small></span><span className="date-input"><CalendarDays size={15} /><input type="date" value={values.end_date} onChange={(event) => set('end_date', event.target.value)} data-testid="input-end-date" /></span></label>
        </div>
        <div className="image-upload-block">
          <div className="upload-copy"><span className="eyebrow">PRODUCT IMAGE</span><p>Add a clear image from your device. JPEG, PNG, WEBP, HEIC or HEIF.</p></div>
          <div className="image-picker">
            {preview && !previewFailed ? <img src={preview} alt="Selected product preview" className="editor-preview" onError={() => setPreviewFailed(true)} data-testid="image-preview" /> : <div className="editor-image-empty"><ImagePlus size={22} /><span>{previewFailed ? 'Preview unavailable' : 'No image selected'}</span></div>}
            <div className="image-picker-actions"><button type="button" className="outline-button" onClick={() => fileRef.current?.click()} data-testid="button-choose-image"><UploadCloud size={15} /> {image || values.image_url ? 'Replace image' : 'Choose image'}</button>{(image || values.image_url) && <button type="button" className="remove-image-button" onClick={removeImage} data-testid="button-remove-image"><Trash2 size={14} /> Remove</button>}<input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" onChange={chooseImage} className="visually-hidden" aria-label="Choose product image" data-testid="input-image-file" /></div>
          </div>
          {imageError && <p className="form-error" role="alert" data-testid="error-image">{imageError}</p>}
        </div>
        <div className="editor-toggles">
          {[['is_active', 'Visible to shoppers', Eye], ['is_featured', 'Editor’s pick', Star], ['is_hot', 'Trending', Flame]].map(([key, label, Icon]) => {
            const field = key as 'is_active' | 'is_featured' | 'is_hot';
            const IconComponent = Icon as typeof Eye;
            return <label className="toggle-option" key={key as string}><input type="checkbox" checked={values[field]} onChange={(event) => set(field, event.target.checked)} data-testid={`toggle-${field}`} /><span className="toggle-switch" /><IconComponent size={15} /><span>{label as string}</span></label>;
          })}
        </div>
        {submitError && <p className="form-error submit-error" role="alert" data-testid="error-save-deal"><CircleAlert size={16} />{submitError}</p>}
        <footer className="editor-footer"><span className="required-note">* Required fields</span><button type="button" className="text-button" onClick={onClose} disabled={busy} data-testid="button-cancel-editor">Cancel</button><button type="submit" className="primary-button" disabled={busy} data-testid="button-save-deal">{busy ? <><LoaderCircle size={16} className="spin" /> Saving…</> : <><Check size={16} /> {deal ? 'Save changes' : 'Add deal'}</>}</button></footer>
      </form></Form>
    </section>
  </div>;
}

export default function AdminPage() {
  const { signOut } = useClerk();
  const client = useQueryClient();
  const dealsQuery = useGetAdminDeals({ query: { queryKey: getGetAdminDealsQueryKey(), retry: false } });
  const summaryQuery = useGetAdminSummary({ query: { queryKey: getGetAdminSummaryQueryKey(), retry: false } });
  const createDeal = useCreateDeal();
  const updateDeal = useUpdateDeal();
  const deleteDeal = useDeleteDeal();
  const uploadImage = useUploadDealImage();
  const [editing, setEditing] = useState<Deal | null | undefined>(undefined);
  const [actionError, setActionError] = useState('');
  const pendingCreatedDealId = useRef<string | null>(null);
  const busy = createDeal.isPending || updateDeal.isPending || deleteDeal.isPending || uploadImage.isPending;
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: getGetAdminDealsQueryKey() }),
      client.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() }),
    ]);
  };
  const saveDeal = async (values: FormValues, image: File | null, editingId?: string) => {
    const payload: DealInput = {
      product_name: values.product_name.trim(), store: values.store.trim(), category: values.category,
      original_price: Number(values.original_price), sale_price: Number(values.sale_price),
      affiliate_url: values.affiliate_url.trim(), description: values.description.trim() || null,
      start_date: values.start_date, end_date: values.end_date || null,
      is_featured: values.is_featured, is_hot: values.is_hot, is_active: values.is_active,
      image_url: image ? (editingId ? undefined : null) : (values.image_url || null),
    };
    const targetId = editingId ?? pendingCreatedDealId.current ?? undefined;
    const saved = targetId
      ? await updateDeal.mutateAsync({ id: targetId, data: payload as DealUpdate })
      : await createDeal.mutateAsync({ data: payload });
    if (!editingId && !pendingCreatedDealId.current) pendingCreatedDealId.current = saved.id;
    if (image) {
      await uploadImage.mutateAsync({ id: saved.id, data: { file: image } });
    }
    await refresh();
    pendingCreatedDealId.current = null;
    setEditing(undefined);
    setActionError('');
  };
  const updateField = async (deal: Deal, data: DealUpdate) => {
    setActionError('');
    try { await updateDeal.mutateAsync({ id: deal.id, data }); await refresh(); }
    catch { setActionError(`Could not update “${deal.product_name}”. Try again.`); }
  };
  const removeDeal = async (deal: Deal) => {
    if (!window.confirm(`Delete “${deal.product_name}”? This cannot be undone.`)) return;
    setActionError('');
    try { await deleteDeal.mutateAsync({ id: deal.id }); await refresh(); }
    catch { setActionError(`Could not delete “${deal.product_name}”. Try again.`); }
  };
  const deals = dealsQuery.data ?? [];
  const summary = summaryQuery.data;
  const stats = [
    { label: 'All deals', value: summary?.total, sub: 'In the collection', id: 'total' },
    { label: 'Live now', value: summary?.active, sub: 'Visible to shoppers', id: 'active' },
    { label: 'Editor’s picks', value: summary?.featured, sub: 'Featured offers', id: 'featured' },
    { label: 'Hidden', value: summary?.hidden, sub: 'Not on the storefront', id: 'hidden' },
  ];
  return <main className="admin-shell">
    <header className="admin-topbar"><Link href="/" className="wordmark" data-testid="link-admin-home"><span className="brand-mark"><i /><i /><i /></span><span>deal<span className="wordmark-accent">saver</span></span></Link><div className="admin-top-right"><span className="admin-secure"><ShieldCheck size={15} /> SECURE OWNER AREA</span><Link href="/" className="back-store" data-testid="link-view-store"><ArrowLeft size={15} /> View storefront</Link><button className="admin-sign-out" onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL || '/' })} data-testid="button-sign-out">Sign out</button></div></header>
    <div className="admin-content">
      <section className="admin-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> THE CURATION DESK</span><h1>Deal manager<span>.</span></h1><p>Your hand-picked edit, all in one place.</p></div><button className="primary-button add-deal-button" onClick={() => setEditing(null)} data-testid="button-add-deal"><Plus size={17} /> Add a deal</button></section>
      <section className="summary-grid" aria-label="Deal summary" data-testid="summary-deals">
        {stats.map((item) => <div className="summary-stat" key={item.id} data-testid={`stat-${item.id}`}><span>{item.label}</span><strong>{summaryQuery.isLoading ? <i className="stat-skeleton" /> : item.value ?? 0}</strong><small>{item.sub}</small></div>)}
      </section>
      <section className="manager-section">
        <div className="manager-title"><div><span className="eyebrow"><span className="eyebrow-line" /> YOUR COLLECTION</span><h2>Every deal, accounted for.</h2></div><button className="icon-button refresh-button" onClick={() => { void dealsQuery.refetch(); void summaryQuery.refetch(); }} aria-label="Refresh deals" data-testid="button-refresh-deals"><RotateCw size={17} /></button></div>
        {actionError && <div className="admin-alert" role="alert" data-testid="error-admin-action"><CircleAlert size={17} />{actionError}<button onClick={() => setActionError('')} aria-label="Dismiss error" data-testid="button-dismiss-error"><X size={15} /></button></div>}
        {dealsQuery.isLoading && <div className="admin-list-skeleton" data-testid="loading-admin-deals">{Array.from({ length: 4 }).map((_, i) => <div className="admin-row-skeleton" key={i}><i /><span /><span /><span /></div>)}</div>}
        {dealsQuery.isError && <div className="state-panel admin-state" data-testid="error-admin-deals"><div className="state-icon"><RotateCw size={19} /></div><div><h3>Couldn’t open the deal collection.</h3><p>{dealsQuery.error instanceof Error ? dealsQuery.error.message : 'The manager could not reach the server. Try again in a moment.'}</p></div><button className="outline-button" onClick={() => dealsQuery.refetch()} data-testid="button-retry-admin">Retry <RotateCw size={14} /></button></div>}
        {!dealsQuery.isLoading && !dealsQuery.isError && deals.length === 0 && <div className="state-panel admin-empty" data-testid="empty-admin-deals"><div className="empty-mark"><BadgeCheck size={22} /></div><span className="eyebrow">READY WHEN YOU ARE</span><h3>Your edit starts with one good find.</h3><p>No deals have been added yet. Add a real retailer offer to publish it here.</p><button className="primary-button" onClick={() => setEditing(null)} data-testid="button-add-first-deal"><Plus size={16} /> Add your first deal</button></div>}
        {!dealsQuery.isLoading && !dealsQuery.isError && deals.length > 0 && <div className="admin-deal-list" data-testid="list-admin-deals">
          {deals.map((deal) => <article className={`admin-deal-row ${!deal.is_active ? 'row-hidden' : ''}`} key={deal.id} data-testid={`row-deal-${deal.id}`}>
            <div className="admin-thumb"><AdminDealImage deal={deal} /></div>
            <div className="admin-deal-identity"><div className="row-labels"><span className={`visibility-tag ${deal.is_active ? 'visible' : 'hidden'}`}>{deal.is_active ? <><i /> Live</> : <><EyeOff size={11} /> Hidden</>}</span>{deal.is_featured && <span className="mini-tag featured-mini"><Star size={11} /> Featured</span>}{deal.is_hot && <span className="mini-tag hot-mini"><Flame size={11} /> Trending</span>}</div><h3 data-testid={`text-product-${deal.id}`}>{deal.product_name}</h3><span className="row-store">{deal.store} <i>/</i> {deal.category}</span></div>
            <div className="admin-prices"><strong>{formatMoney(deal.sale_price)}</strong><del>{formatMoney(deal.original_price)}</del></div>
            <div className="row-enddate">{deal.end_date ? <><CalendarDays size={13} /> Ends {new Date(`${deal.end_date.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</> : <><CalendarDays size={13} /> No end date</>}</div>
            <div className="row-actions">
              <button className={`icon-button toggle-feature ${deal.is_featured ? 'active' : ''}`} title={deal.is_featured ? 'Remove featured badge' : 'Mark as featured'} aria-label={deal.is_featured ? 'Remove featured badge' : 'Mark as featured'} onClick={() => void updateField(deal, { is_featured: !deal.is_featured })} data-testid={`button-feature-${deal.id}`}><Star size={16} /></button>
              <button className={`icon-button toggle-hot ${deal.is_hot ? 'active' : ''}`} title={deal.is_hot ? 'Remove trending badge' : 'Mark as trending'} aria-label={deal.is_hot ? 'Remove trending badge' : 'Mark as trending'} onClick={() => void updateField(deal, { is_hot: !deal.is_hot })} data-testid={`button-hot-${deal.id}`}><Flame size={16} /></button>
              <button className="icon-button" title={deal.is_active ? 'Hide deal' : 'Show deal'} aria-label={deal.is_active ? 'Hide deal' : 'Show deal'} onClick={() => void updateField(deal, { is_active: !deal.is_active })} data-testid={`button-visibility-${deal.id}`}>{deal.is_active ? <Eye size={16} /> : <EyeOff size={16} />}</button>
              <button className="icon-button" title="Edit deal" aria-label="Edit deal" onClick={() => setEditing(deal)} data-testid={`button-edit-${deal.id}`}><Pencil size={15} /></button>
              <button className="icon-button danger-icon" title="Delete deal" aria-label="Delete deal" onClick={() => void removeDeal(deal)} disabled={deleteDeal.isPending} data-testid={`button-delete-${deal.id}`}><Trash2 size={15} /></button>
              <a className="icon-button retailer-link" href={deal.affiliate_url} target="_blank" rel="noopener noreferrer" aria-label="Open retailer link" data-testid={`link-retailer-${deal.id}`}><ArrowUpRight size={16} /></a>
            </div>
          </article>)}
        </div>}
        <div className="manager-footnote"><span><ShieldCheck size={15} /> Only deals you add appear in the public edit.</span><span>{deals.length} {deals.length === 1 ? 'record' : 'records'}</span></div>
      </section>
      <footer className="admin-footer"><span>DEALSAVER / CURATION DESK</span><span>Thoughtful finds. Kept current.</span></footer>
    </div>
    {editing !== undefined && <DealEditor deal={editing} busy={busy} onClose={() => { pendingCreatedDealId.current = null; setEditing(undefined); }} onSave={saveDeal} />}
  </main>;
}