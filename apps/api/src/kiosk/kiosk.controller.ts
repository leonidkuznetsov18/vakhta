import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import type { KioskChallengeResponse } from '@vakhta/contracts';
import { KioskService } from './kiosk.service.js';

/** Публічний для мережі майданчика ендпоінт; автентифікація лише device token. */
@Controller('kiosk')
export class KioskController {
  constructor(private readonly kiosk: KioskService) {}

  @Get('challenge')
  async challenge(
    @Headers('x-device-token') deviceToken: string | undefined,
  ): Promise<KioskChallengeResponse> {
    if (!deviceToken || deviceToken.length < 16) throw new UnauthorizedException();
    const challenge = await this.kiosk.issueChallenge(deviceToken);
    if (!challenge) throw new UnauthorizedException();
    return challenge;
  }
}
