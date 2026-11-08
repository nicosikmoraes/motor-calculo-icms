import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { CreateDonation } from './application/create-donation.js';
import { DonationOrdersController } from './adapters/http/donation-orders.controller.js';
import { PrismaDonationCreationRepository } from './adapters/prisma/donation-creation-repository.js';
import { StripeCheckoutAdapter } from './adapters/stripe/stripe-checkout.adapter.js';
import { createStripeClient } from './adapters/stripe/stripe-client.js';
import { STRIPE_CLIENT } from './adapters/stripe/stripe.tokens.js';
import { DONATION_CREATION_REPOSITORY } from './ports/donation-creation-repository.js';
import { STRIPE_CHECKOUT_GATEWAY, type StripeCheckoutGateway } from './ports/stripe-checkout-gateway.js';

const prismaProvider = {
  provide: PrismaClient,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.get<string>('DATABASE_URL') ?? 'postgresql://none:none@127.0.0.1:5433/none' }),
  }),
};

@Module({
  controllers: [DonationOrdersController],
  providers: [
    prismaProvider,
    { provide: DONATION_CREATION_REPOSITORY, inject: [PrismaClient],
      useFactory: (prisma: PrismaClient) => new PrismaDonationCreationRepository(prisma) },
    { provide: STRIPE_CLIENT, inject: [ConfigService], useFactory: (config: ConfigService) =>
      createStripeClient(config.get<string>('STRIPE_SECRET_KEY') ?? 'sk_test_unconfigured') },
    StripeCheckoutAdapter,
    { provide: STRIPE_CHECKOUT_GATEWAY, useExisting: StripeCheckoutAdapter },
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
