import { loadStripe } from '@stripe/stripe-js';

function getStripePublishableKey(): string | undefined {
  const raw = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? '';
  const key = raw.replace(/^["']|["']$/g, '').trim();
  return key || undefined;
}

const stripePublishableKey = getStripePublishableKey();
export const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;
export { getStripePublishableKey };
