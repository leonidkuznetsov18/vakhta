import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CreateCommunication,
  CommunicationAudienceQuery,
  SaveQuestionnaire,
} from '@vakhta/contracts';
import { CurrentUser, Roles, WebAuthGuard, type WebUser } from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { DomainError } from '../common/domain-error.js';
import type { Env } from '../config/env.js';
import { CommunicationsService } from './communications.service.js';
import { CommunicationMediaService } from './media.service.js';
import { QuestionnaireService } from './questionnaire.service.js';
import { questionnaireIdentity } from './questionnaire-auth.js';
import { TenantModule } from '@vakhta/domain';
import { RequiresModule } from '../infra/module-guard.js';

@Controller('admin/communications')
@UseGuards(WebAuthGuard)
@Roles('ADMIN', 'HR', 'PRODUCTION_HEAD', 'SHIFT_MASTER')
export class CommunicationsController {
  constructor(
    private readonly service: CommunicationsService,
    private readonly media: CommunicationMediaService,
  ) {}
  @Get('audience')
  audience(
    @CurrentUser() user: WebUser,
    @Query(new ZodValidationPipe(CommunicationAudienceQuery)) query: CommunicationAudienceQuery,
  ) {
    return this.service.audience(user, query);
  }
  @Get('audience/ids')
  async ids(
    @CurrentUser() user: WebUser,
    @Query(new ZodValidationPipe(CommunicationAudienceQuery)) query: CommunicationAudienceQuery,
  ) {
    return this.service.audience(user, query, true);
  }
  @Post('attachments')
  async upload(@CurrentUser() user: WebUser, @Req() request: FastifyRequest) {
    const file = await request.file();
    if (!file) throw new DomainError('COMMUNICATION_FILE_INVALID', 400, 'A file is required');
    let bytes: Buffer;
    try {
      bytes = await file.toBuffer();
    } catch {
      throw new DomainError('COMMUNICATION_FILE_SIZE', 413, 'File exceeds 10 MiB');
    }
    return this.media.upload(user, file.filename, bytes);
  }
  @Get('attachments/:id')
  link(@CurrentUser() user: WebUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.media.link(user, id);
  }
  @Delete('attachments/:id')
  async discard(@CurrentUser() user: WebUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.media.discard(user, id);
    return { id };
  }
  @Post()
  create(
    @CurrentUser() user: WebUser,
    @Body(new ZodValidationPipe(CreateCommunication)) command: CreateCommunication,
  ) {
    return this.service.create(user, command);
  }
  @Get()
  history(
    @CurrentUser() user: WebUser,
    @Query('page', new ZodValidationPipe(z.coerce.number().int().min(1).default(1))) page: number,
  ) {
    return this.service.history(user, page);
  }
  @Get(':id')
  detail(@CurrentUser() user: WebUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(user, id);
  }
  @Post(':id/close')
  close(@CurrentUser() user: WebUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.close(user, id);
  }
  @Post(':id/retry/:partId')
  retry(
    @CurrentUser() user: WebUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('partId', ParseUUIDPipe) partId: string,
  ) {
    return this.service.retry(user, id, partId);
  }
}

/** Telegram identity is separate from admin cookies and never creates a panel session. */
@Controller('questionnaires')
@RequiresModule(TenantModule.WORKER_BOT)
export class QuestionnaireController {
  constructor(
    private readonly service: QuestionnaireService,
    private readonly config: ConfigService<Env, true>,
  ) {}
  private identity(authorization: string | undefined) {
    if (!authorization?.startsWith('tma '))
      throw new DomainError('QUESTIONNAIRE_AUTH_EXPIRED', 401, 'Open from Telegram');
    return questionnaireIdentity(
      authorization.slice(4),
      this.config.get('TELEGRAM_BOT_TOKEN', { infer: true }) ?? '',
    );
  }
  @Get(':id')
  read(@Headers('authorization') auth: string | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.read(id, this.identity(auth));
  }
  @Post(':id')
  save(
    @Headers('authorization') auth: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SaveQuestionnaire)) command: SaveQuestionnaire,
  ) {
    return this.service.save(id, this.identity(auth), command);
  }
}
