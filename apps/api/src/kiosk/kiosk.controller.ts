import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import {
  PairTerminalCommand,
  type KioskChallengeResponse,
  type TerminalPaired,
} from '@vakhta/contracts';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { KioskService } from './kiosk.service.js';

/** Reachable from the site network; authentication is the device token or a one-time pairing code. */
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

  /** The tablet types the code the administrator got in the panel; the token comes back once. */
  @Post('pair')
  async pair(
    @Body(new ZodValidationPipe(PairTerminalCommand)) body: PairTerminalCommand,
  ): Promise<TerminalPaired> {
    const paired = await this.kiosk.pair(body.code);
    if (!paired) throw new UnauthorizedException();
    return paired;
  }
}
