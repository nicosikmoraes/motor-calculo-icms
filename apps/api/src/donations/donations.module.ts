import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { CreateDonation } from './application/create-donation.js';
import { HandleStripeEvent } from './application/handle-stripe-event.js';
import { RetryDonation } from './application/retry-donation.js';
import { DonationOrdersController } from './adapters/http/donation-orders.controller.js';
import { StripeWebhookController } from './adapters/http/stripe-webhook.controller.js';
import { PrismaDonationCreationRepository } from './adapters/prisma/donation-creation-repository.js';
import { PrismaDonationRepository } from './adapters/prisma/prisma-donation-repository.js';
import { StripeCheckoutAdapter } from './adapters/stripe/stripe-checkout.adapter.js';
import { createStripeClient } from './adapters/stripe/stripe-client.js';
import { STRIPE_CLIENT } from './adapters/stripe/stripe.tokens.js';
import { DONATION_CREATION_REPOSITORY } from './ports/donation-creation-repository.js';
import { DONATION_REPOSITORY } from './ports/donation-repository.js';
import { STRIPE_CHECKOUT_GATEWAY, type StripeCheckoutGateway } from './ports/stripe-checkout-gateway.js';

const prismaProvider = {
  provide: PrismaClient,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.get<string>('DATABASE_URL') ?? 'postgresql://none:none@127.0.0.1:5433/none' }),
  }),
};

@Module({
  controllers: [DonationOrdersController, StripeWebhookController],
  providers: [
    prismaProvider,
    { provide: DONATION_CREATION_REPOSITORY, inject: [PrismaClient],
      useFactory: (prisma: PrismaClient) => new PrismaDonationCreationRepository(prisma) },
    { provide: DONATION_REPOSITORY, inject: [PrismaClient],
      useFactory: (prisma: PrismaClient) => new PrismaDonationRepository(prisma) },
    { provide: STRIPE_CLIENT, inject: [ConfigService], useFactory: (config: ConfigService) =>
      createStripeClient(config.get<string>('STRIPE_SECRET_KEY') ?? 'sk_test_unconfigured') },
    StripeCheckoutAdapter,
    { provide: STRIPE_CHECKOUT_GATEWAY, useExisting: StripeCheckoutAdapter },
    { provide: HandleStripeEvent, inject: [DONATION_REPOSITORY, STRIPE_CHECKOUT_GATEWAY],
      useFactory: (repository: PrismaDonationRepository, gateway: StripeCheckoutGateway) => new HandleStripeEvent(repository, gateway) },
    { provide: RetryDonation, inject: [DONATION_CREATION_REPOSITORY, STRIPE_CHECKOUT_GATEWAY, ConfigService],
      useFactory: (repository: PrismaDonationCreationRepository, gateway: StripeCheckoutGateway, config: ConfigService) =>
        new RetryDonation(repository, gateway, config.get<string>('DONATION_IDENTITY_SECRET') ?? config.get<string>('STRIPE_SECRET_KEY') ?? 'unconfigured') },
    {
      provide: CreateDonation,
      inject: [DONATION_CREATION_REPOSITORY, STRIPE_CHECKOUT_GATEWAY, ConfigService],
      useFactory: (repository: PrismaDonationCreationRepository, gateway: StripeCheckoutGateway, config: ConfigService) =>
        new CreateDonation(repository, gateway, {
          get stripeSecretKey() { return config.get<string>('STRIPE_SECRET_KEY'); },
          get successUrl() { return config.get<string>('DONATION_SUCCESS_URL'); },
          get cancelUrl() { return config.get<string>('DONATION_CANCEL_URL'); },
          get identitySecret() { return config.get<string>('DONATION_IDENTITY_SECRET'); },
        }),
    },
  ],
})
export class DonationsModule {}
