import type {
  ScheduleStatus,
  ScopeType,
  ActivationFailure,
  CheckInFailure,
  EmployeeAccess,
  ShiftAction,
  ShiftState,
  CommandErrorCode,
  ValidationIssueCode,
  WebRole,
} from '@vakhta/domain';

/** Повна форма каталогу: типи гарантують, що жодна дія, стан чи помилка не лишилась без тексту. */
export interface Messages {
  readonly bot: {
    readonly welcome: string;
    readonly askCode: string;
    readonly alreadyRegistered: string;
    readonly notReady: string;
    readonly useButtons: string;
    readonly serverTimeLabel: string;
    /** Плейсхолдери: {name}, {personnelNumber} */
    readonly home: string;
    readonly homeNoSchedule: string;
    readonly access: Readonly<Record<Exclude<EmployeeAccess, 'ALLOWED'>, string>>;
  };
  readonly activation: {
    /** Плейсхолдери: {name}, {personnelNumber}, {position} */
    readonly preview: string;
    /** Плейсхолдери: {position}, {orgUnit} */
    readonly positionLine: string;
    readonly noPosition: string;
    readonly confirm: string;
    readonly cancel: string;
    readonly success: string;
    readonly alreadyLinked: string;
    readonly cancelled: string;
    readonly failures: Readonly<Record<ActivationFailure, string>>;
  };
  readonly attendance: {
    readonly activateFirst: string;
    /** Плейсхолдер: {terminal} */
    readonly promptArrive: string;
    readonly promptDepart: string;
    readonly arriveButton: string;
    readonly departButton: string;
    /** Плейсхолдери: {time}, {terminal} */
    readonly arrived: string;
    readonly arrivedAlready: string;
    readonly departed: string;
    readonly departedAlready: string;
    /** Плейсхолдер: {time} */
    readonly presenceLine: string;
    readonly failures: Readonly<Record<CheckInFailure, string>>;
  };
  readonly actions: Readonly<Record<ShiftAction, string>>;
  readonly states: Readonly<Record<ShiftState, string>>;
  readonly errors: Readonly<Record<CommandErrorCode, string>>;
  readonly roles: Readonly<Record<WebRole, string>>;
  readonly shift: {
    /** Плейсхолдери: {state}, {since} */
    readonly stateLine: string;
    /** Плейсхолдер: {resume} */
    readonly resumeLine: string;
    /** Плейсхолдери: {start}, {end} */
    readonly planLine: string;
    /** Плейсхолдер: {zone} */
    readonly zoneLine: string;
    readonly zoneNotAccepted: string;
    readonly acceptZone: string;
    readonly zoneAccepted: string;
    readonly chooseDowntimeReason: string;
    readonly chooseEmergencyReason: string;
    readonly backToShift: string;
    readonly noReasons: string;
    readonly staleButton: string;
    readonly closedHeader: string;
    readonly emergencyHeader: string;
    /** Плейсхолдери: {total}, {work}, {breaks}, {meal}, {downtime} */
    readonly summaryTotals: string;
    /** Плейсхолдер: {minutes} */
    readonly summaryLate: string;
    readonly summaryEarly: string;
    readonly summaryOvertime: string;
    readonly summaryOvertimePending: string;
    readonly flagged: string;
    /** Плейсхолдери: {state}, {limit} */
    readonly returnReminder: string;
    /** Плейсхолдери: {name}, {minutes}, {reason} */
    readonly downtimeEscalation: string;
    readonly resumeIntoDowntimeQuestion: string;
    readonly resumeIntoDowntimeYes: string;
    readonly resumeIntoDowntimeNo: string;
  };
  readonly schedule: {
    /** Назви місяців у називному відмінку, індекс 0 = січень. */
    readonly months: readonly string[];
    /** Короткі дні тижня, індекс 0 = понеділок. */
    readonly weekdaysShort: readonly string[];
    readonly dayKinds: Readonly<Record<'DAY' | 'NIGHT' | 'OFF', string>>;
    readonly kindNames: Readonly<Record<'DAY' | 'NIGHT', string>>;
    /** Плейсхолдери: {month}, {year} */
    readonly planHeader: string;
    /** Плейсхолдери: {shifts}, {hours}, {day}, {night} */
    readonly planTotals: string;
    readonly planEmpty: string;
    readonly myPlanButton: string;
    readonly prevMonth: string;
    readonly nextMonth: string;
    readonly ackButton: string;
    readonly ackDone: string;
    readonly ackNothing: string;
    readonly ackRequired: string;
    /** Плейсхолдери: {date}, {weekday}, {kind}, {start}, {end}, {zone} */
    readonly nextShift: string;
    readonly noNextShift: string;
    /** Плейсхолдери: {month}, {year}, {shifts} */
    readonly published: string;
    /** Плейсхолдери: {month}, {year}, {added}, {removed}, {changed} */
    readonly changed: string;
    /** Плейсхолдери: {kind}, {date}, {start}, {zone} */
    readonly shiftReminder: string;
    /** Плейсхолдери: {month}, {year} */
    readonly ackReminder: string;
    readonly issues: Readonly<Record<ValidationIssueCode, string>>;
  };
  readonly admin: {
    readonly productName: string;
    readonly sections: Readonly<
      Record<
        | 'operations'
        | 'schedule'
        | 'incidents'
        | 'handover'
        | 'requests'
        | 'bonus'
        | 'reports'
        | 'administration'
        | 'audit',
        string
      >
    >;
    readonly placeholder: string;
    readonly auth: {
      readonly signInTitle: string;
      readonly email: string;
      readonly password: string;
      readonly signIn: string;
      readonly signOut: string;
      readonly invalidCredentials: string;
      readonly totpTitle: string;
      readonly totpHint: string;
      readonly code: string;
      readonly verify: string;
      readonly invalidCode: string;
      readonly networkError: string;
      readonly profile: string;
      readonly roles: string;
      readonly noRoles: string;
      readonly twoFactorOn: string;
      readonly twoFactorOff: string;
      readonly enableTwoFactor: string;
      readonly confirmPassword: string;
      readonly scanQr: string;
      readonly backupCodes: string;
      readonly twoFactorEnabled: string;
    };
    readonly schedule: {
      readonly site: string;
      readonly orgUnit: string;
      readonly month: string;
      readonly versions: string;
      readonly noVersions: string;
      readonly newVersion: string;
      readonly version: string;
      readonly statuses: Readonly<Record<ScheduleStatus, string>>;
      readonly employee: string;
      readonly zone: string;
      readonly noZone: string;
      readonly shifts: string;
      readonly addEmployee: string;
      readonly remove: string;
      readonly emptyGrid: string;
      readonly save: string;
      readonly saved: string;
      readonly submit: string;
      readonly returnToDraft: string;
      readonly returnComment: string;
      readonly publish: string;
      readonly publishReason: string;
      readonly publishConfirm: string;
      readonly published: string;
      readonly submitted: string;
      readonly returned: string;
      readonly issuesTitle: string;
      readonly noIssues: string;
      readonly error: string;
      readonly warning: string;
      readonly ackTitle: string;
      readonly acknowledged: string;
      readonly readOnlyHint: string;
      readonly unsaved: string;
      readonly forbidden: string;
      readonly noTemplates: string;
    };
    readonly operations: {
      readonly site: string;
      readonly orgUnit: string;
      readonly includeClosed: string;
      readonly live: string;
      readonly offline: string;
      readonly employee: string;
      readonly state: string;
      readonly since: string;
      readonly minutes: string;
      readonly plan: string;
      readonly zone: string;
      readonly presence: string;
      readonly flags: string;
      readonly needsClarification: string;
      readonly zoneNotAccepted: string;
      readonly masterAction: string;
      readonly comment: string;
      readonly apply: string;
      readonly applied: string;
      readonly clarify: string;
      readonly clarified: string;
      readonly startFor: string;
      readonly start: string;
      readonly started: string;
      readonly detail: string;
      readonly intervals: string;
      readonly events: string;
      readonly summary: string;
      readonly empty: string;
      readonly stale: string;
    };
    readonly administration: {
      readonly tabs: Readonly<Record<'employees' | 'users' | 'directories' | 'terminals', string>>;
      readonly common: {
        readonly add: string;
        readonly added: string;
        readonly code: string;
        readonly name: string;
        readonly site: string;
        readonly orgUnit: string;
        readonly team: string;
        readonly none: string;
        readonly copy: string;
        readonly copied: string;
        readonly reason: string;
        readonly cancel: string;
        readonly empty: string;
      };
      readonly employees: {
        readonly personnelNumber: string;
        readonly fullName: string;
        readonly status: string;
        readonly telegram: string;
        readonly linked: string;
        readonly notLinked: string;
        readonly create: string;
        readonly issueCode: string;
        /** Плейсхолдери: {code}, {expires} */
        readonly codeIssued: string;
        readonly deepLink: string;
        readonly position: string;
        readonly currentPosition: string;
        readonly noPosition: string;
        readonly assignPosition: string;
        readonly positionAssigned: string;
        readonly block: string;
        readonly unblock: string;
        readonly terminate: string;
        readonly statusChanged: string;
        readonly relink: string;
        readonly relinkUserId: string;
        readonly relinked: string;
        readonly statuses: Readonly<Record<'ACTIVE' | 'BLOCKED' | 'TERMINATED', string>>;
      };
      readonly users: {
        readonly email: string;
        readonly name: string;
        readonly password: string;
        readonly passwordHint: string;
        readonly twoFactor: string;
        readonly roles: string;
        readonly create: string;
        readonly grantRole: string;
        readonly role: string;
        readonly scopeType: string;
        readonly scope: string;
        readonly grant: string;
        readonly revoke: string;
        readonly granted: string;
        readonly revoked: string;
        readonly scopeTypes: Readonly<Record<ScopeType, string>>;
      };
      readonly directories: {
        readonly sites: string;
        readonly orgUnits: string;
        readonly teams: string;
        readonly positions: string;
        readonly zones: string;
        readonly timezone: string;
        readonly parent: string;
        readonly type: string;
        readonly shared: string;
        readonly zoneTypes: Readonly<
          Record<'AREA' | 'POST' | 'PACKAGING' | 'FILLING' | 'CLEANING' | 'OTHER', string>
        >;
      };
      readonly terminals: {
        readonly checkpoint: string;
        readonly status: string;
        readonly lastSeen: string;
        readonly never: string;
        readonly register: string;
        readonly registered: string;
        readonly tokenHint: string;
        readonly checkpoints: Readonly<Record<'ENTRY' | 'EXIT' | 'BOTH', string>>;
        readonly statuses: Readonly<Record<'ACTIVE' | 'DISABLED', string>>;
      };
    };
  };
  readonly kiosk: {
    readonly title: string;
    readonly hint: string;
    readonly offline: string;
    readonly unauthorized: string;
    readonly notConfigured: string;
    readonly refreshIn: string;
    readonly seconds: string;
  };
}
