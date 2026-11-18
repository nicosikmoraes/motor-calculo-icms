import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../decorators/public.decorator.js';

@ApiTags('saúde')
@Controller()
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Confere se o processo da API está no ar' })
  @ApiResponse({ status: 200, description: 'API respondendo', schema: { example: { data: { status: 'ok' } } } })
  getStatus(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
