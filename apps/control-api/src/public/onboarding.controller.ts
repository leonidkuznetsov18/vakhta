import { BadRequestException, Body, Controller, Header, Post } from '@nestjs/common';
import { AcceptOnboarding, OnboardingRequest, type OnboardingView } from '@vakhta/contracts';
import { OnboardingService } from './onboarding.service.js';

@Controller('public/onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('inspect')
  @Header('Cache-Control', 'no-store')
  inspect(@Body() body: unknown): Promise<OnboardingView> {
    const parsed = OnboardingRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'INVALID_INPUT' });
    return this.onboarding.open(parsed.data);
  }

  @Post('accept')
  @Header('Cache-Control', 'no-store')
  accept(@Body() body: unknown): Promise<OnboardingView> {
    const parsed = AcceptOnboarding.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'INVALID_INPUT' });
    return this.onboarding.open(parsed.data);
  }
}
