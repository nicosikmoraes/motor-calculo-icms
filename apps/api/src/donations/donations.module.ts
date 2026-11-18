import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../generated/prisma/client.js';
import { CreateDonation } from './application/create-donation.js';
import { HandlePaymentEvent } from './application/handle-payment-event.js';
import { InspectDonation } from './application/inspect-donation.js';
import { RetryDonation } from './application/retry-donation.js';
import { AdminDonationsController } from '../http/controllers/donations/admin-donations.controller.js';
import { DonationOrdersController } from '../http/controllers/donations/donation-orders.controller.js';
import { StripeWebhookController } from '../http/controllers/donations/stripe-webhook.controller.js';
import { DonationsReturnController } from '../http/controllers/donations/donations-return.controller.js';
import { PrismaDonationCreationRepository } from './adapters/prisma/donation-creation-repository.js';
import { PrismaDonationRepository } from './adapters/prisma/prisma-donation-repository.js';
import { PrismaAdminDonationsQuery } from './adapters/prisma/queries/prisma-admin-donations-query.js';
import { PrismaDonationOrderQueries } from './adapters/prisma/queries/prisma-donation-order-queries.js';
import { ADMIN_DONATIONS_QUERY } from './ports/admin-donations-query.js';
import { StripeCheckoutAdapter } from './adapters/stripe/stripe-checkout.adapter.js';
import { StripeWebhookAdapter } from './adapters/stripe/stripe-webhook.adapter.js';
import { createStripeClient, readStripeTestKey } from './adapters/stripe/stripe-client.js';
import { STRIPE_CLIENT } from './adapters/stripe/stripe.tokens.js';
import { DONATION_CREATION_REPOSITORY, type DonationCreationRepository } from './ports/donation-creation-repository.js';
import { DONATION_ORDER_QUERIES, type DonationOrderQueries } from './ports/donation-order-queries.js';
import { DONATION_REPOSITORY } from './ports/donation-repository.js';
import { STRIPE_CHECKOUT_GATEWAY, type StripeCheckoutGateway } from './ports/stripe-checkout-gateway.js';

function configuredStripeTestKey(config: ConfigService): string | undefined {
  return readStripeTestKey(config.get('STRIPE_SECRET_KEY'));
}

function readCheckoutConfiguration(config: ConfigService) {
  const testKey = configuredStripeTestKey(config);
  return {
    testCheckoutConfigured: testKey !== undefined,
    // Preserve the fallback used to sign operation keys for existing orders.
    identitySecret: config.get<string>('DONATION_IDENTITY_SECRET') ?? testKey ?? 'unconfigured',
  };
}

@Module({
  controllers: [DonationOrdersController, StripeWebhookController, DonationsReturnController, AdminDonationsController],
  providers: [
    { provide: DONATION_CREATION_REPOSITORY, inject: [PrismaClient],
      useFactory: (prisma: PrismaClient) => new PrismaDonationCreationRepository(prisma) },
    { provide: ADMIN_DONATIONS_QUERY, inject: [PrismaClient], useFactory: (prisma: PrismaClient) => new PrismaAdminDonationsQuery(prisma) },
    { provide: DONATION_ORDER_QUERIES, inject: [PrismaClient], useFactory: (prisma: PrismaClient) => new PrismaDonationOrderQueries(prisma) },
    { provide: DONATION_REPOSITORY, inject: [PrismaClient],
      useFactory: (prisma: PrismaClient) => new PrismaDonationRepository(prisma) },
    { provide: STRIPE_CLIENT, inject: [ConfigService], useFactory: (config: ConfigService) =>
      createStripeClient(configuredStripeTestKey(config) ?? 'sk_test_unconfigured') },
    StripeCheckoutAdapter,
    StripeWebhookAdapter,
    { provide: STRIPE_CHECKOUT_GATEWAY, useExisting: StripeCheckoutAdapter },
    { provide: HandlePaymentEvent, inject: [DONATION_REPOSITORY, STRIPE_CHECKOUT_GATEWAY],
      useFactory: (repository: PrismaDonationRepository, gateway: StripeCheckoutGateway) => new HandlePaymentEvent(repository, gateway) },
    { provide: InspectDonation, inject: [DONATION_ORDER_QUERIES, DONATION_CREATION_REPOSITORY, STRIPE_CHECKOUT_GATEWAY, ConfigService],
      useFactory: (queries: DonationOrderQueries, repository: DonationCreationRepository, gateway: StripeCheckoutGateway, config: ConfigService) =>
        new InspectDonation(queries, repository, gateway, { testCheckoutConfigured: configuredStripeTestKey(config) !== undefined }) },
    { provide: RetryDonation, inject: [DONATION_CREATION_REPOSITORY, DONATION_ORDER_QUERIES, STRIPE_CHECKOUT_GATEWAY, ConfigService],
      useFactory: (repository: DonationCreationRepository, queries: DonationOrderQueries, gateway: StripeCheckoutGateway, config: ConfigService) =>
        new RetryDonation(repository, queries, gateway, readCheckoutConfiguration(config)) },
    {
      provide: CreateDonation,
      inject: [DONATION_CREATION_REPOSITORY, STRIPE_CHECKOUT_GATEWAY, ConfigService],
      useFactory: (repository: PrismaDonationCreationRepository, gateway: StripeCheckoutGateway, config: ConfigService) =>
        new CreateDonation(repository, gateway, {
          get testCheckoutConfigured() { return readCheckoutConfiguration(config).testCheckoutConfigured; },
          get identitySecret() { return readCheckoutConfiguration(config).identitySecret; },
          get successUrl() { return config.get<string>('DONATION_SUCCESS_URL'); },
          get cancelUrl() { return config.get<string>('DONATION_CANCEL_URL'); },
        }),
    },
  ],
})
export class DonationsModule {}
