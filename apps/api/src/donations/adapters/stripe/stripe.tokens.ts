import type Stripe from 'stripe';

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');
export type StripeClient = Stripe;
