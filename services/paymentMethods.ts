import { supabase } from '../lib/supabase';

export interface PaymentMethodRow {
  id: string;
  user_id: string;
  stripe_payment_method_id: string;
  stripe_customer_id: string | null;
  last4: string;
  brand: string;
  expiry_month: number;
  expiry_year: number;
  is_default: boolean;
  created_at: string;
}

export interface PaymentMethodDisplay {
  id: string;
  stripePaymentMethodId: string;
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
  expiry: string;
  isDefault: boolean;
}

function rowToDisplay(row: PaymentMethodRow): PaymentMethodDisplay {
  return {
    id: row.id,
    stripePaymentMethodId: row.stripe_payment_method_id,
    last4: row.last4,
    brand: row.brand,
    expiryMonth: row.expiry_month,
    expiryYear: row.expiry_year,
    expiry: `${String(row.expiry_month).padStart(2, '0')}/${String(row.expiry_year).slice(-2)}`,
    isDefault: row.is_default,
  };
}

export async function createSetupIntent(): Promise<{ client_secret: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Please log in to add a card.');
  }
  const { data, error } = await supabase.functions.invoke('create-setup-intent', {
    body: {},
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Setup failed');
  if (!data?.client_secret) throw new Error('No client_secret returned');
  return { client_secret: data.client_secret };
}

export async function savePaymentMethod(paymentMethodId: string): Promise<PaymentMethodDisplay> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Please log in to save a card.');
  }
  const { data, error } = await supabase.functions.invoke('save-payment-method', {
    body: { payment_method_id: paymentMethodId },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Save failed');
  const row = { ...data, user_id: '', created_at: '' } as PaymentMethodRow;
  return rowToDisplay(row);
}

export async function listPaymentMethods(): Promise<PaymentMethodDisplay[]> {
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as PaymentMethodRow[]).map(rowToDisplay);
}

export async function setDefaultPaymentMethod(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  await supabase
    .from('payment_methods')
    .update({ is_default: false })
    .eq('user_id', user.id);

  const { error } = await supabase
    .from('payment_methods')
    .update({ is_default: true })
    .eq('id', id);

  if (error) throw error;
}

export async function removePaymentMethod(id: string): Promise<void> {
  const { error } = await supabase.from('payment_methods').delete().eq('id', id);
  if (error) throw error;
}

export interface CreatePaymentIntentResponse {
  id: string;
  status: string;
  client_secret?: string;
  amount_cents?: number;
  subtotal_cents?: number;
  tax_cents?: number;
  total_cents?: number;
}

export async function createPaymentIntent(params: {
  amount_cents: number;
  payment_method_id: string;
  metadata?: Record<string, string>;
  /** When provided with vehicle, server computes amount for fair pricing. */
  service_id?: string;
  vehicle?: { make: string; model: string; year?: string };
  /** Optional address for Stripe Tax calculation; when provided, tax may be added to total. */
  customer_details?: {
    address?: { line1?: string; city?: string; state?: string; postal_code?: string; country?: string };
    address_source?: 'billing' | 'shipping';
  };
  /** Optional discount/coupon code. */
  coupon_code?: string;
}): Promise<CreatePaymentIntentResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Please log in to pay.');
  }
  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: params,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Payment failed');
  return data as CreatePaymentIntentResponse;
}

/** Guest checkout: create PaymentIntent without a saved card; returns client_secret for Stripe.js confirmCardPayment. */
export async function createPaymentIntentForGuest(params: {
  amount_cents: number;
  metadata?: Record<string, string>;
  service_id?: string;
  vehicle?: { make: string; model: string; year?: string };
  customer_details?: {
    address?: { line1?: string; city?: string; state?: string; postal_code?: string; country?: string };
    address_source?: 'billing' | 'shipping';
  };
  /** Optional discount/coupon code. */
  coupon_code?: string;
}): Promise<CreatePaymentIntentResponse> {
  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: { ...params },
  });
  if (error) throw error;
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Payment failed');
  if (!(data as CreatePaymentIntentResponse).client_secret) {
    throw new Error('No client_secret returned');
  }
  return data as CreatePaymentIntentResponse;
}

export interface TaxPreviewResponse {
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
}

/** Get tax/total preview for display before payment. Requires amount_cents and customer_details with address (ZIP + state). */
export async function getTaxPreview(params: {
  amount_cents: number;
  customer_details: {
    address?: { line1?: string; city?: string; state?: string; postal_code?: string; country?: string };
    address_source?: 'billing' | 'shipping';
  };
  service_id?: string;
  vehicle?: { make: string; model: string; year?: string };
  /** Optional discount/coupon code. */
  coupon_code?: string;
}): Promise<TaxPreviewResponse> {
  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: { ...params, preview: true },
  });
  if (error) throw error;
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Tax preview failed');
  return data as TaxPreviewResponse;
}

export async function capturePayment(paymentIntentId: string): Promise<{ id: string; status: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Please log in.');
  }
  const { data, error } = await supabase.functions.invoke('capture-payment', {
    body: { payment_intent_id: paymentIntentId },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Capture failed');
  return data as { id: string; status: string };
}

export async function cancelPayment(paymentIntentId: string): Promise<{ id: string; status: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Please log in.');
  }
  const { data, error } = await supabase.functions.invoke('cancel-payment', {
    body: { payment_intent_id: paymentIntentId },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : 'Cancel failed');
  return data as { id: string; status: string };
}
