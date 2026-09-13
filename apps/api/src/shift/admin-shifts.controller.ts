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
  ShiftMessageCommand,
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
import type { WebRole } from '@vakhta/domain';
import { assertInScope, scopedEvents, scopeOf } from '../common/access-scope.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ShiftChanges } from './shift-changes.js';
import { ShiftService } from './shift.service.js';

const VIEWERS: readonly WebRole[] = [
  'ADMIN',
  'PRODUCTION_HEAD',
  'SHIFT_MASTER',
  'HR',
  'PLANNER',
  'CLEANLINESS_CONTROLLER',
  'AUDITOR',
];
const MASTERS: readonly WebRole[] = ['ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER'];

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
    @CurrentUser() user: WebUser,
  ): Promise<ActiveShiftView[]> {
    return this.shifts.listActive(q, new Date(), scopeOf(user, VIEWERS));
  }

  /** SSE: панель перечитує список при кожній зміні стану; ping тримає зʼєднання. */
  @Sse('stream')
  stream(@CurrentUser() user: WebUser): Observable<MessageEvent> {
    const events = scopedEvents(this.changes.stream(), scopeOf(user, VIEWERS), (e) =>
      this.shifts.placeOf(e.sessionId),
    );
    return merge(
      events.pipe(map((e) => ({ type: 'shift', data: e }) as MessageEvent)),
      interval(25_000).pipe(map(() => ({ type: 'ping', data: '' }) as MessageEvent)),
    );
  }

  @Get(':id')
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: WebUser,
  ): Promise<ShiftDetailView> {
    await this.assertShift(user, VIEWERS, id);
    return this.shifts.detail(id);
  }

  /** Master actions and reads by identifier stay inside the grant that allows them. */
  private async assertShift(user: WebUser, roles: readonly WebRole[], id: string): Promise<void> {
    const scope = scopeOf(user, roles);
    if (scope.all) return;
    const place = await this.shifts.placeOf(id);
    if (!place) return; // the service answers SHIFT_NOT_FOUND
    assertInScope(scope, place);
  }

  @Post('start')
  @HttpCode(200)
  @Roles(...MASTERS)
  async start(
    @Body(new ZodValidationPipe(MasterStartShiftCommand)) body: MasterStartShiftCommand,
    @CurrentUser() user: WebUser,
  ): Promise<TransitionResponse> {
    const scope = scopeOf(user, MASTERS);
    if (!scope.all) assertInScope(scope, await this.shifts.employeePlace(body.employeeId));
    return this.shifts.masterStart(body.employeeId, body, webUserActor(user));
  }

  @Post(':id/transition')
  @HttpCode(200)
  @Roles(...MASTERS)
  async transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(MasterTransitionCommand)) body: MasterTransitionCommand,
    @CurrentUser() user: WebUser,
  ): Promise<TransitionResponse> {
    await this.assertShift(user, MASTERS, id);
    return this.shifts.masterTransition(id, body, webUserActor(user));
  }

  /** Words, not a transition: the shift only says whom to write to. */
  @Post(':id/message')
  @HttpCode(204)
  @Roles(...MASTERS)
  async message(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ShiftMessageCommand)) body: ShiftMessageCommand,
    @CurrentUser() user: WebUser,
  ): Promise<void> {
    await this.assertShift(user, MASTERS, id);
    await this.shifts.message(id, body.text, webUserActor(user));
  }

  @Post(':id/clarify')
  @HttpCode(200)
  @Roles(...MASTERS)
  async clarify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ClarifyShiftCommand)) body: ClarifyShiftCommand,
    @CurrentUser() user: WebUser,
  ): Promise<ShiftSessionView> {
    await this.assertShift(user, MASTERS, id);
    return this.shifts.flagClarification(id, body.reason, webUserActor(user));
  }
}
