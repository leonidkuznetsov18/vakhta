import { Body, Controller, Header, Post } from '@nestjs/common';
import { AcceptOperatorInvitation, OperatorInvitationRequest } from '@vakhta/contracts';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { OperatorInvitationsService } from './operator-invitations.service.js';

@Controller('public/operator-invitations')
export class OperatorInvitationsController {
  constructor(private readonly invitations: OperatorInvitationsService) {}

  @Post('inspect')
  @Header('Cache-Control', 'no-store')
  inspect(@Body(new ZodValidationPipe(OperatorInvitationRequest)) body: { token: string }) {
    return this.invitations.inspect(body.token);
  }

  @Post('accept')
  @Header('Cache-Control', 'no-store')
  accept(@Body(new ZodValidationPipe(AcceptOperatorInvitation)) body: AcceptOperatorInvitation) {
    return this.invitations.accept(body);
  }
}
