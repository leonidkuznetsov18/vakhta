import {
  Body,
  Delete,
  Patch,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AdjustScoreCommand,
  CancelAdjustmentCommand,
  ReviewScoreCommand,
  UpdateAdjustmentCommand,
  BonusMonthQuery,
  ClosePeriodCommand,
  CreateRuleVersionCommand,
  SecondApprovalCommand,
  SetBaseAmountsCommand,
  type BonusPeriodView,
  type BonusRuleVersionView,
  type ShiftScoreView,
} from '@vakhta/contracts';
import {
  CurrentUser,
  Roles,
  WebAuthGuard,
  webUserActor,
  type WebUser,
} from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { BonusService } from './bonus.service.js';

const VIEWERS = [
  'ADMIN',
  'PRODUCTION_HEAD',
  'SHIFT_MASTER',
  'HR',
  'ACCOUNTANT',
  'AUDITOR',
] as const;

/** Панель «Бонус» (ТЗ 9.1): розшифровка, коригування з другим підтвердженням, закриття періоду, експорт. */
@Controller('admin/bonus')
@UseGuards(WebAuthGuard)
@Roles(...VIEWERS)
export class AdminBonusController {
  constructor(private readonly bonus: BonusService) {}

  @Get('period')
  period(
    @Query(new ZodValidationPipe(BonusMonthQuery)) q: BonusMonthQuery,
  ): Promise<BonusPeriodView> {
    return this.bonus.period(q.siteId, q.month, q.employeeId);
  }

  @Get('rules')
  rules(): Promise<BonusRuleVersionView[]> {
    return this.bonus.listRuleVersions();
  }

  @Post('rules')
  @HttpCode(201)
  @Roles('ADMIN', 'PRODUCTION_HEAD')
  createRules(
    @Body(new ZodValidationPipe(CreateRuleVersionCommand)) body: CreateRuleVersionCommand,
    @CurrentUser() user: WebUser,
  ): Promise<BonusRuleVersionView> {
    return this.bonus.createRuleVersion(body, webUserActor(user));
  }

  @Post('scores/:sessionId/recompute')
  @HttpCode(200)
  @Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER')
  recompute(@Param('sessionId', ParseUUIDPipe) sessionId: string): Promise<ShiftScoreView | null> {
    return this.bonus.evaluate(sessionId);
  }

  @Post('scores/:scoreId/adjust')
  @HttpCode(200)
  @Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER')
  adjust(
    @Param('scoreId', ParseUUIDPipe) scoreId: string,
    @Body(new ZodValidationPipe(AdjustScoreCommand)) body: AdjustScoreCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ShiftScoreView> {
    return this.bonus.adjust(scoreId, body, webUserActor(user));
  }

  @Post('scores/:scoreId/review')
  @HttpCode(200)
  @Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER')
  review(
    @Param('scoreId', ParseUUIDPipe) scoreId: string,
    @Body(new ZodValidationPipe(ReviewScoreCommand)) body: ReviewScoreCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ShiftScoreView> {
    return this.bonus.review(scoreId, body, webUserActor(user));
  }

  @Patch('adjustments/:id')
  @Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER')
  updateAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateAdjustmentCommand)) body: UpdateAdjustmentCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ShiftScoreView> {
    return this.bonus.updateAdjustment(id, body, webUserActor(user));
  }

  @Delete('adjustments/:id')
  @HttpCode(200)
  @Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER')
  cancelAdjustment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CancelAdjustmentCommand)) body: CancelAdjustmentCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ShiftScoreView> {
    return this.bonus.cancelAdjustment(id, body, webUserActor(user));
  }

  @Post('adjustments/:id/second')
  @HttpCode(200)
  @Roles('ADMIN', 'PRODUCTION_HEAD')
  second(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SecondApprovalCommand)) body: SecondApprovalCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ShiftScoreView> {
    return this.bonus.secondApprove(id, body, webUserActor(user));
  }

  @Post('period/:siteId/:month/close')
  @HttpCode(200)
  @Roles('ADMIN', 'PRODUCTION_HEAD')
  close(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('month') month: string,
    @Body(new ZodValidationPipe(ClosePeriodCommand)) body: ClosePeriodCommand,
    @CurrentUser() user: WebUser,
  ): Promise<BonusPeriodView> {
    return this.bonus.closePeriod(siteId, month, body, webUserActor(user));
  }

  @Post('period/:periodId/base')
  @HttpCode(200)
  @Roles('ADMIN', 'HR')
  base(
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Body(new ZodValidationPipe(SetBaseAmountsCommand)) body: SetBaseAmountsCommand,
    @CurrentUser() user: WebUser,
  ): Promise<BonusPeriodView> {
    return this.bonus.setBaseAmounts(periodId, body, webUserActor(user));
  }

  @Get('period/:periodId/export.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Roles('ADMIN', 'HR', 'ACCOUNTANT', 'PRODUCTION_HEAD')
  export(
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @CurrentUser() user: WebUser,
  ): Promise<string> {
    return this.bonus.exportCsv(periodId, webUserActor(user));
  }
}
