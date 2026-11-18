import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { Public } from './auth/guard/public.decorator.js';

@ApiTags('saúde')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Confere se a API está no ar' })
  @ApiResponse({ status: 200, description: 'API respondendo', schema: { example: { data: 'Hello World!' } } })
  getHello(): string {
    return this.appService.getHello();
  }
}
