import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { FeedService } from './feed.service.js';

/**
 * Public iCalendar feed (SC-44): the token is the only credential, resolves to one employee and
 * can be revoked from the bot. Unknown and revoked tokens answer the same 404 without a body hint.
 */
@Controller('calendar')
export class CalendarFeedController {
  constructor(private readonly feed: FeedService) {}

  @Get('feed/:token')
  @Header('content-type', 'text/calendar; charset=utf-8')
  @Header('cache-control', 'private, max-age=600')
  async feedByToken(@Param('token') raw: string): Promise<string> {
    const token = raw.endsWith('.ics') ? raw.slice(0, -4) : raw;
    const employeeId = await this.feed.resolve(token);
    if (!employeeId) throw new NotFoundException();
    return this.feed.ics(employeeId);
  }
}
