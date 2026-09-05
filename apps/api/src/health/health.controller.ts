import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; service: 'api'; serverTime: string } {
    return { status: 'ok', service: 'api', serverTime: new Date().toISOString() };
  }
}
