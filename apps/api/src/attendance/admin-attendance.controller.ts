import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ReserveCheckInCommand,
  type CheckInResult,
  type OpenPresenceView,
} from '@vakhta/contracts';
import {
  CurrentUser,
  Roles,
  WebAuthGuard,
  webUserActor,
  type WebUser,
} from '../auth/web-auth.guard.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AttendanceService } from './attendance.service.js';

/** Резервні відмітки майстра і список присутніх (FR-QR-06, ТЗ 9.2). */
@Controller('admin/attendance')
@UseGuards(WebAuthGuard)
@Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER')
export class AdminAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('open')
  @Roles('ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER', 'HR', 'PLANNER', 'CLEANLINESS_CONTROLLER')
  open(): Promise<OpenPresenceView[]> {
    return this.attendance.listOpen();
  }

  @Post('reserve')
  @HttpCode(200)
  reserve(
    @Body(new ZodValidationPipe(ReserveCheckInCommand)) body: ReserveCheckInCommand,
    @CurrentUser() user: WebUser,
  ): Promise<CheckInResult> {
    return this.attendance.reserveCheckIn(body, webUserActor(user));
  }
}
