import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; service: 'control-api'; serverTime: string } {
    return { status: 'ok', service: 'control-api', serverTime: new Date().toISOString() };
  }
}
