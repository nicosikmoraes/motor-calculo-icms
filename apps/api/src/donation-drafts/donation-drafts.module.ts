import { Module } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.js';
import { DonationDraftsController } from '../http/controllers/donation-drafts/donation-drafts.controller.js';
import { PrismaDonationDraftStore } from './adapters/prisma/prisma-donation-draft-store.js';
import { PrismaDonationDraftQueries } from './adapters/prisma/queries/prisma-donation-draft-queries.js';
import { ManageDonationDrafts } from './application/manage-donation-drafts.js';

@Module({
  controllers: [DonationDraftsController],
  providers: [{
    provide: ManageDonationDrafts,
    inject: [PrismaClient],
    useFactory: (prisma: PrismaClient) => new ManageDonationDrafts(
      new PrismaDonationDraftStore(prisma),
      new PrismaDonationDraftQueries(prisma),
    ),
  }],
})
export class DonationDraftsModule {}
