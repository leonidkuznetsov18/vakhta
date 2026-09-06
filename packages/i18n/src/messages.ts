import type {
  BonusCriterion,
  BonusSection,
  ChecklistKey,
  HandoverAngle,
  HandoverIssueCode,
  HandoverResolution,
  HandoverStatus,
  IncidentSeverity,
  IncidentStatus,
  MediaQualityStatus,
  RemarkNeed,
  RequestStatus,
  RequestType,
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
  Locale,
} from '@vakhta/domain';

/** Full catalog shape: the types guarantee that no action, state or error is left without text. */
export interface Messages {
  readonly language: {
    /** Button on the home screen that opens the language picker. */
    readonly menuButton: string;
    readonly choose: string;
    readonly changed: string;
    /** Native names shown on the picker buttons. */
    readonly names: Readonly<Record<Locale, string>>;
  };
  readonly bot: {
    readonly welcome: string;
    readonly askCode: string;
    readonly alreadyRegistered: string;
    readonly notReady: string;
    readonly useButtons: string;
    readonly serverTimeLabel: string;
    /** Placeholders: {name}, {personnelNumber} */
    readonly home: string;
    readonly homeNoSchedule: string;
    readonly access: Readonly<Record<Exclude<EmployeeAccess, 'ALLOWED'>, string>>;
  };
  readonly activation: {
    /** Placeholders: {name}, {personnelNumber}, {position} */
    readonly preview: string;
    /** Placeholders: {position}, {orgUnit} */
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
    /** Placeholder: {terminal} */
    readonly promptArrive: string;
    readonly promptDepart: string;
    readonly arriveButton: string;
    readonly departButton: string;
    /** Placeholders: {time}, {terminal} */
    readonly arrived: string;
    readonly arrivedAlready: string;
    readonly departed: string;
    readonly departedAlready: string;
    /** Placeholder: {time} */
    readonly presenceLine: string;
    readonly failures: Readonly<Record<CheckInFailure, string>>;
  };
  readonly actions: Readonly<Record<ShiftAction, string>>;
  readonly states: Readonly<Record<ShiftState, string>>;
  readonly errors: Readonly<Record<CommandErrorCode, string>>;
  readonly roles: Readonly<Record<WebRole, string>>;
  readonly shift: {
    /** Placeholders: {state}, {since} */
    readonly stateLine: string;
    /** Placeholder: {resume} */
    readonly resumeLine: string;
    /** Placeholders: {start}, {end} */
    readonly planLine: string;
    /** Placeholder: {zone} */
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
    /** Placeholders: {total}, {work}, {breaks}, {meal}, {downtime} */
    readonly summaryTotals: string;
    /** Placeholder: {minutes} */
    readonly summaryLate: string;
    readonly summaryEarly: string;
    readonly summaryOvertime: string;
    readonly summaryOvertimePending: string;
    readonly flagged: string;
    /** Placeholders: {state}, {limit} */
    readonly returnReminder: string;
    /** Placeholders: {name}, {minutes}, {reason} */
    readonly downtimeEscalation: string;
    readonly resumeIntoDowntimeQuestion: string;
    readonly resumeIntoDowntimeYes: string;
    readonly resumeIntoDowntimeNo: string;
  };
  readonly incidents: {
    readonly reportButton: string;
    readonly chooseReason: string;
    readonly askComment: string;
    readonly askPhoto: string;
    readonly skipPhoto: string;
    readonly askStopped: string;
    readonly stoppedYes: string;
    readonly stoppedNo: string;
    readonly cancel: string;
    readonly cancelled: string;
    readonly expired: string;
    readonly noShift: string;
    /** Placeholder: {reason} */
    readonly reported: string;
    readonly linked: string;
    readonly masterNotified: string;
    readonly safetyEscalated: string;
    readonly downtimeOpened: string;
    /** Placeholder: {error} */
    readonly downtimeNotOpened: string;
    readonly resolvedNotice: string;
    readonly statuses: Readonly<Record<IncidentStatus, string>>;
    readonly severities: Readonly<Record<IncidentSeverity, string>>;
  };
  readonly handover: {
    readonly items: Readonly<Record<ChecklistKey, string>>;
    readonly angles: Readonly<Record<HandoverAngle, string>>;
    readonly needs: Readonly<Record<RemarkNeed, string>>;
    readonly statuses: Readonly<Record<HandoverStatus, string>>;
    readonly resolutions: Readonly<Record<HandoverResolution, string>>;
    readonly quality: Readonly<Record<MediaQualityStatus, string>>;
    readonly issues: Readonly<Record<HandoverIssueCode, string>>;
    /** Button on the shift screen that opens the checklist while in HANDOVER. */
    readonly openButton: string;
    readonly header: string;
    readonly progress: string;
    readonly okButton: string;
    readonly remarkButton: string;
    readonly noteButton: string;
    readonly photoButton: string;
    readonly photoDone: string;
    readonly askPhoto: string;
    readonly photoSaved: string;
    readonly photoQualityHint: string;
    readonly askNote: string;
    readonly chooseRemarkCategory: string;
    readonly askRemarkText: string;
    readonly askSafe: string;
    readonly safeYes: string;
    readonly safeNo: string;
    readonly askNeeds: string;
    readonly needsNone: string;
    readonly remarkSaved: string;
    readonly cannotComplete: string;
    readonly cannotCompleteReason: string;
    readonly cannotCompleteSaved: string;
    readonly submit: string;
    readonly submitted: string;
    readonly notReady: string;
    readonly superseded: string;
    readonly cancel: string;
    readonly cancelled: string;
    readonly pendingHeader: string;
    readonly pendingLine: string;
    readonly pendingRemarks: string;
    readonly pendingNotes: string;
    readonly acceptButton: string;
    readonly issueButton: string;
    readonly reviewAccepted: string;
    readonly reviewIssueSaved: string;
    readonly reviewOwn: string;
    readonly reviewCategory: string;
    readonly reviewComment: string;
    readonly reviewPhoto: string;
    readonly cleaningReminder: string;
    readonly pendingNotification: string;
    readonly reviewedNotification: string;
    readonly resolvedNotification: string;
    readonly timeoutNotification: string;
  };
  readonly requests: {
    readonly types: Readonly<Record<RequestType, string>>;
    readonly statuses: Readonly<Record<RequestStatus, string>>;
    readonly menuButton: string;
    readonly chooseType: string;
    readonly myRequests: string;
    readonly noRequests: string;
    readonly askPeriod: string;
    readonly badPeriod: string;
    readonly chooseShift: string;
    readonly noShifts: string;
    readonly askMinutes: string;
    readonly badMinutes: string;
    readonly askComment: string;
    readonly askMedical: string;
    readonly skip: string;
    readonly cancel: string;
    readonly cancelled: string;
    readonly submitted: string;
    /** Placeholders: {type}, {status} */
    readonly line: string;
    readonly counterpartAsk: string;
    readonly counterpartYes: string;
    readonly counterpartNo: string;
    /** Placeholders: {type}, {decision}, {comment} */
    readonly decidedNotification: string;
    readonly scheduleChangedNotification: string;
    readonly chooseCounterpart: string;
    readonly chooseCounterpartShift: string;
    readonly chooseTemplate: string;
    readonly stepOf: string;
    readonly rejectedShort: string;
    readonly approvedShort: string;
  };
  readonly bonus: {
    readonly criteria: Readonly<Record<BonusCriterion, string>>;
    readonly sections: Readonly<Record<BonusSection, string>>;
    readonly statuses: Readonly<
      Record<
        'PRELIMINARY' | 'PENDING' | 'MANUAL_REVIEW' | 'APPEALED' | 'CONFIRMED' | 'NOT_EVALUATED',
        string
      >
    >;
    readonly criterionStatuses: Readonly<
      Record<'earned' | 'missed' | 'not_applicable' | 'pending' | 'appealed' | 'confirmed', string>
    >;
    readonly myScoresButton: string;
    /** Placeholders: {month}, {year} */
    readonly header: string;
    /** Placeholder: {score} */
    readonly monthLine: string;
    readonly monthPending: string;
    readonly noScores: string;
    /** Placeholders: {date}, {score}, {status} */
    readonly shiftLine: string;
    readonly manualReview: string;
    readonly appealButton: string;
    /** Placeholder: {days} */
    readonly appealHint: string;
    readonly appealSubmitted: string;
    readonly detailsButton: string;
    /** Placeholders: {month}, {score} */
    readonly periodClosed: string;
  };
  readonly schedule: {
    /** Month names in the nominative case, index 0 = January. */
    readonly months: readonly string[];
    /** Short weekday names, index 0 = Monday. */
    readonly weekdaysShort: readonly string[];
    readonly dayKinds: Readonly<Record<'DAY' | 'NIGHT' | 'OFF', string>>;
    readonly kindNames: Readonly<Record<'DAY' | 'NIGHT', string>>;
    /** Placeholders: {month}, {year} */
    readonly planHeader: string;
    /** Placeholders: {shifts}, {hours}, {day}, {night} */
    readonly planTotals: string;
    readonly planEmpty: string;
    readonly myPlanButton: string;
    readonly prevMonth: string;
    readonly nextMonth: string;
    readonly ackButton: string;
    readonly ackDone: string;
    readonly ackNothing: string;
    readonly ackRequired: string;
    /** Placeholders: {date}, {weekday}, {kind}, {start}, {end}, {zone} */
    readonly nextShift: string;
    readonly noNextShift: string;
    /** Placeholders: {month}, {year}, {shifts} */
    readonly published: string;
    /** Placeholders: {month}, {year}, {added}, {removed}, {changed} */
    readonly changed: string;
    /** Placeholders: {kind}, {date}, {start}, {zone} */
    readonly shiftReminder: string;
    /** Placeholders: {month}, {year} */
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
    /** Label of the language switcher in the panel header. */
    readonly language: string;
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
    readonly incidents: {
      readonly site: string;
      readonly scopeOpen: string;
      readonly scopeAll: string;
      readonly opened: string;
      readonly severity: string;
      readonly reason: string;
      readonly zone: string;
      readonly reports: string;
      readonly stoppedNow: string;
      readonly status: string;
      readonly sla: string;
      readonly slaBreached: string;
      readonly assignee: string;
      readonly comment: string;
      readonly commentRequired: string;
      readonly transitions: Readonly<Record<IncidentStatus, string>>;
      readonly duplicateOf: string;
      readonly apply: string;
      readonly applied: string;
      readonly detail: string;
      readonly history: string;
      readonly reportsTitle: string;
      readonly stoppedWork: string;
      readonly notStopped: string;
      readonly photo: string;
      readonly empty: string;
      readonly stats: string;
      readonly byReason: string;
      readonly byZone: string;
      readonly from: string;
      readonly to: string;
      readonly colIncidents: string;
      readonly colReports: string;
      readonly colDowntime: string;
      readonly colResolution: string;
      readonly colBreached: string;
      readonly totals: string;
      readonly live: string;
    };
    readonly handover: {
      readonly site: string;
      readonly scopePending: string;
      readonly scopeOverdue: string;
      readonly scopeAll: string;
      readonly submitted: string;
      readonly zone: string;
      readonly submitter: string;
      readonly status: string;
      readonly remarks: string;
      readonly photos: string;
      readonly deadline: string;
      readonly overdue: string;
      readonly review: string;
      readonly detail: string;
      readonly checklist: string;
      readonly reviews: string;
      readonly resolutions: string;
      readonly resolve: string;
      readonly decision: string;
      readonly comment: string;
      readonly reasonCode: string;
      readonly apply: string;
      readonly applied: string;
      readonly openPhoto: string;
      readonly empty: string;
      readonly live: string;
      readonly cannotComplete: string;
      readonly safe: string;
      readonly unsafe: string;
      readonly note: string;
    };
    readonly requests: {
      readonly scopeInbox: string;
      readonly scopeAll: string;
      readonly type: string;
      readonly status: string;
      readonly employee: string;
      readonly submitted: string;
      readonly period: string;
      readonly step: string;
      readonly deadline: string;
      readonly overdue: string;
      readonly comment: string;
      readonly decision: string;
      readonly approve: string;
      readonly reject: string;
      readonly decided: string;
      readonly approvedMinutes: string;
      readonly detail: string;
      readonly history: string;
      readonly medical: string;
      readonly openMedical: string;
      readonly empty: string;
      readonly overtimeTitle: string;
      readonly overtimeMinutes: string;
      readonly overtimeEmpty: string;
      readonly correctionTitle: string;
      readonly proposalKind: string;
      readonly proposalInterval: string;
      readonly proposalTime: string;
      readonly proposalState: string;
      readonly applyCorrection: string;
      readonly corrected: string;
      readonly reasonCode: string;
      readonly live: string;
    };
    readonly bonus: {
      readonly site: string;
      readonly month: string;
      readonly employee: string;
      readonly shifts: string;
      readonly evaluated: string;
      readonly pending: string;
      readonly sMonth: string;
      readonly base: string;
      readonly amount: string;
      readonly period: string;
      readonly ruleVersion: string;
      readonly closePeriod: string;
      readonly closed: string;
      readonly closeConfirm: string;
      readonly setBase: string;
      readonly baseSaved: string;
      readonly exportCsv: string;
      readonly detail: string;
      readonly criterion: string;
      readonly points: string;
      readonly basis: string;
      readonly adjust: string;
      readonly delta: string;
      readonly reasonCode: string;
      readonly comment: string;
      readonly adjusted: string;
      readonly needsSecond: string;
      readonly secondQueue: string;
      readonly approve: string;
      readonly reject: string;
      readonly recompute: string;
      readonly recomputed: string;
      readonly empty: string;
    };
    readonly reports: {
      readonly kinds: Readonly<
        Record<'hours' | 'time-structure' | 'downtime' | 'handover' | 'bot-usage' | 'bonus', string>
      >;
      readonly site: string;
      readonly orgUnit: string;
      readonly from: string;
      readonly to: string;
      readonly build: string;
      readonly exportCsv: string;
      readonly exportXlsx: string;
      readonly empty: string;
      readonly totals: string;
      readonly generatedAt: string;
      readonly dataVersion: string;
      readonly columns: Readonly<Record<string, string>>;
    };
    readonly audit: {
      readonly tabs: Readonly<Record<'audit' | 'events', string>>;
      readonly at: string;
      readonly actor: string;
      readonly action: string;
      readonly object: string;
      readonly reason: string;
      readonly before: string;
      readonly after: string;
      readonly type: string;
      readonly source: string;
      readonly employee: string;
      readonly payload: string;
      readonly filterAction: string;
      readonly filterType: string;
      readonly filterObject: string;
      readonly apply: string;
      readonly empty: string;
      readonly corrects: string;
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
        /** Placeholders: {code}, {expires} */
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
