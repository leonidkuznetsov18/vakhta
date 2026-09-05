import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
  UseGuards,
  type MessageEvent,
} from '@nestjs/common';
import { interval, map, merge, type Observable } from 'rxjs';
import {
  ActiveShiftsQuery,
  ClarifyShiftCommand,
  MasterStartShiftCommand,
  MasterTransitionCommand,
  type ActiveShiftView,
  type ShiftDetailView,
  type ShiftSessionView,
  type TransitionResponse,
} from '@vakhta/contracts';
import {
  CurrentUser,
  Roles,
  WebAuthGuard,
  webUserActor,
  type WebUser,
} from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ShiftChanges } from './shift-changes.js';
import { ShiftService } from './shift.service.js';

const VIEWERS = [
  'ADMIN',
  'PRODUCTION_HEAD',
  'SHIFT_MASTER',
  'HR',
  'PLANNER',
  'CLEANLINESS_CONTROLLER',
  'AUDITOR',
] as const;
const MASTERS = ['ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER'] as const;

/** Оперативний екран і дії майстра над зміною (ТЗ 9.2, FR-COR-01/04). */
@Controller('admin/shifts')
@UseGuards(WebAuthGuard)
@Roles(...VIEWERS)
export class AdminShiftsController {
  constructor(
    private readonly shifts: ShiftService,
    private readonly changes: ShiftChanges,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ActiveShiftsQuery)) q: ActiveShiftsQuery,
  ): Promise<ActiveShiftView[]> {
    return this.shifts.listActive(q);
  }

  /** SSE: панель перечитує список при кожній зміні стану; ping тримає зʼєднання. */
  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return merge(
      this.changes.stream().pipe(map((e) => ({ type: 'shift', data: e }) as MessageEvent)),
      interval(25_000).pipe(map(() => ({ type: 'ping', data: '' }) as MessageEvent)),
    );
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<ShiftDetailView> {
    return this.shifts.detail(id);
  }

  @Post('start')
  @HttpCode(200)
  @Roles(...MASTERS)
  start(
    @Body(new ZodValidationPipe(MasterStartShiftCommand)) body: MasterStartShiftCommand,
    @CurrentUser() user: WebUser,
  ): Promise<TransitionResponse> {
    return this.shifts.masterStart(body.employeeId, body, webUserActor(user));
  }

  @Post(':id/transition')
  @HttpCode(200)
  @Roles(...MASTERS)
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(MasterTransitionCommand)) body: MasterTransitionCommand,
    @CurrentUser() user: WebUser,
  ): Promise<TransitionResponse> {
    return this.shifts.masterTransition(id, body, webUserActor(user));
  }

  @Post(':id/clarify')
  @HttpCode(200)
  @Roles(...MASTERS)
  clarify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ClarifyShiftCommand)) body: ClarifyShiftCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ShiftSessionView> {
    return this.shifts.flagClarification(id, body.reason, webUserActor(user));
  }
}
