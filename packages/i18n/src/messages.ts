import type {
  BonusCriterion,
  BonusSection,
  ChecklistItemKind,
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
export type GuideKey =
  | 'overview'
  | 'operations'
  | 'schedule'
  | 'incidents'
  | 'handover'
  | 'requests'
  | 'bonus'
  | 'reports'
  | 'audit'
  | 'administration'
  | 'employees'
  | 'users'
  | 'directories'
  | 'terminals'
  | 'checklists';

export interface SectionGuide {
  /** One sentence: what the section is for. */
  readonly purpose: string;
  /** Numbered steps of the normal use. */
  readonly steps: readonly string[];
  /** Questions people ask in the first week, with short answers naming the buttons. */
  readonly faq: readonly { readonly q: string; readonly a: string }[];
}

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
    /** Shown on the home screen while no arrival is recorded: how presence is marked. */
    readonly checkInHint: string;
    readonly helpButton: string;
    /** Button and /help line that open the support assistant bot. */
    readonly supportButton: string;
    /** Placeholder: {url} */
    readonly supportHint: string;
    /** Help text of /help: what the bot does and where the guide is; {url} may be empty. */
    readonly help: string;
    /** Descriptions for the Telegram command menu. */
    readonly commands: Readonly<
      Record<'start' | 'plan' | 'scores' | 'requests' | 'language' | 'help', string>
    >;
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
  /** The support assistant bot (docs/features/12-support-bot.md). */
  readonly support: {
    readonly greeting: string;
    readonly noAccess: string;
    readonly rateLimited: string;
    readonly voiceOff: string;
    readonly unavailable: string;
    readonly error: string;
    readonly reset: string;
    readonly notHeard: string;
    /** Placeholder: {text} */
    readonly transcribed: string;
    readonly textOnly: string;
    readonly commands: Readonly<Record<'start' | 'reset', string>>;
  };
  readonly handover: {
    readonly items: Readonly<Record<ChecklistKey, string>>;
    readonly angles: Readonly<Record<HandoverAngle, string>>;
    readonly needs: Readonly<Record<RemarkNeed, string>>;
    readonly statuses: Readonly<Record<HandoverStatus, string>>;
    readonly resolutions: Readonly<Record<HandoverResolution, string>>;
    readonly quality: Readonly<Record<MediaQualityStatus, string>>;
    readonly issues: Readonly<Record<HandoverIssueCode, string>>;
    /** Name of the checklist the system creates when admins have not defined one (spec 5.6). */
    readonly defaultName: string;
    /** Button on the shift screen that opens the checklist while in HANDOVER. */
    readonly openButton: string;
    readonly header: string;
    /** Header of the checklist screen when the shift has no zone. */
    readonly headerNoZone: string;
    /** Placeholders: {done}, {total}, {photos}, {photosTotal} */
    readonly progress: string;
    readonly okButton: string;
    readonly remarkButton: string;
    readonly noteButton: string;
    /** Placeholder: {item} (label of the photo item) */
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
    /** Placeholder: {decision}; the report of a shift without a zone. */
    readonly resolvedNotificationNoZone: string;
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
    /** Placeholders: {points}, {date}, {comment} */
    readonly bonusAddedNotification: string;
    readonly bonusRemovedNotification: string;
    /** Placeholders: {date}, {score}, {comment} */
    readonly reviewedNotification: string;
    readonly excludedNotification: string;
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
        | 'overview'
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
    readonly overview: {
      readonly title: string;
      readonly attention: string;
      readonly allClear: string;
      readonly openIncidents: string;
      readonly slaBreached: string;
      readonly disputes: string;
      readonly overdueAcceptances: string;
      readonly requestsForMe: string;
      readonly overdueRequests: string;
      readonly overtimePending: string;
      readonly unlinkedEmployees: string;
      readonly unpairedTerminals: string;
      readonly onShift: string;
      readonly inDowntime: string;
      readonly open: string;
      /** Placeholder: {time} */
      readonly refreshedAt: string;
    };
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
      /** Button on a published version: a draft copy is created to change the schedule. */
      readonly editPublished: string;
      readonly editPublishedHint: string;
      /** Editing a published month in place (production head, administrator). */
      readonly revisingTitle: string;
      readonly revisingHint: string;
      readonly publishChanges: string;
      readonly reviseConfirm: string;
      /** Placeholder: {no} */
      readonly revised: string;
      readonly discardChanges: string;
      /** Placeholder: {no} */
      readonly openDraft: string;
      /** Placeholders: {no}, {from} */
      readonly versionCreatedFrom: string;
      /** Placeholder: {no} */
      readonly versionCreated: string;
      readonly unsaved: string;
      readonly deleteVersion: string;
      /** Placeholder: {no} */
      readonly deleteConfirm: string;
      /** Placeholder: {no}; a superseded version. */
      readonly deleteHistoryConfirm: string;
      readonly versionInUse: string;
      /** Placeholders: {no}, {status}, {date} — one option of the version select. */
      readonly versionOption: string;
      /** Placeholder: {count} */
      readonly versionsCount: string;
      /** Placeholder: {count} */
      readonly employeesInVersion: string;
      readonly employeesReadOnly: string;
      readonly removeFromVersion: string;
      readonly addEmployeePlaceholder: string;
      readonly allEmployeesAdded: string;
      /** Labels of the validation detail keys (nightShifts, restMinutes, …). */
      readonly issueDetails: Readonly<Record<string, string>>;
      readonly deleted: string;
      readonly noEmployees: string;
      readonly goToEmployees: string;
      /** Placeholder: {n} rows without a zone. */
      readonly zoneMissing: string;
      /** Footer row of the grid: {day} day shifts, {night} night shifts on that date. */
      readonly dayTotals: string;
      readonly createdOn: string;
      readonly remind: string;
      /** Placeholder: {n} */
      readonly reminded: string;
      readonly pattern: string;
      readonly patternStart: string;
      readonly patternApply: string;
      readonly patterns: Readonly<
        Record<'DAY_2_2' | 'NIGHT_2_2' | 'DAY_NIGHT_OFF_OFF' | 'WEEKDAYS_DAY', string>
      >;
      readonly hours: string;
      /** Placeholder: {max} */
      readonly limitHours: string;
      /** Placeholder: {max} */
      readonly limitConsecutive: string;
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
      readonly startZone: string;
      readonly startZoneNone: string;
      readonly start: string;
      readonly started: string;
      readonly detail: string;
      readonly intervals: string;
      readonly events: string;
      readonly summary: string;
      readonly empty: string;
      readonly stale: string;
      /** State groups for the KPI chips above the live table. */
      readonly groups: Readonly<
        Record<
          | 'ALL'
          | 'WORKING'
          | 'BREAK'
          | 'MEAL'
          | 'SERVICE_TIME'
          | 'DOWNTIME'
          | 'NOT_STARTED'
          | 'CLOSED',
          string
        >
      >;
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
      readonly closeSelected: string;
      /** Placeholder: {n} */
      readonly bulkClosed: string;
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
      readonly noZone: string;
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
      readonly photoBefore: string;
      readonly photoAfter: string;
      readonly photoLoading: string;
      readonly compare: string;
      readonly empty: string;
      readonly live: string;
      readonly cannotComplete: string;
      readonly safe: string;
      readonly unsafe: string;
      readonly note: string;
      /** Header of the notes block (NOTE items) in the report detail. */
      readonly notes: string;
      readonly noPhotos: string;
      readonly prevPhoto: string;
      readonly nextPhoto: string;
      /** Placeholders: {index}, {total} */
      readonly photoCounter: string;
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
      /** Who decides the current step of the route. */
      readonly steps: Readonly<Record<'ADMIN' | 'COUNTERPART' | 'HEAD' | 'HR' | 'MASTER', string>>;
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
      readonly summary: string;
      readonly employeesCount: string;
      readonly onReview: string;
      readonly secondPending: string;
      readonly periodStatuses: Readonly<Record<'OPEN' | 'CLOSING' | 'CLOSED', string>>;
      readonly periodHelp: Readonly<Record<'OPEN' | 'CLOSING' | 'CLOSED', string>>;
      readonly leaderboard: string;
      readonly rank: string;
      readonly noLeaderboard: string;
      readonly detailTitle: string;
      readonly addPoints: string;
      readonly pointsDialog: string;
      readonly pointsKind: string;
      readonly pointsKinds: Readonly<Record<'BONUS' | 'PENALTY', string>>;
      readonly pointsAmount: string;
      readonly shift: string;
      readonly advanced: string;
      readonly criterionOptional: string;
      readonly wholeScore: string;
      readonly editAdjustment: string;
      readonly deleteAdjustment: string;
      /** Placeholder: {delta} */
      readonly deleteConfirm: string;
      readonly deleted: string;
      readonly adjustmentStatuses: Readonly<
        Record<'PENDING_SECOND' | 'APPLIED' | 'REJECTED' | 'CANCELLED', string>
      >;
      readonly finishReview: string;
      readonly reviewTitle: string;
      /** Placeholders: {applicable}, {missing} */
      readonly reviewExplain: string;
      readonly reviewDecision: string;
      readonly reviewDecisions: Readonly<Record<'SCORE' | 'EXCLUDE', string>>;
      readonly reviewScore: string;
      /** Placeholder: {score} */
      readonly reviewSuggested: string;
      readonly reviewed: string;
      /** Placeholder: {score} */
      readonly reviewedBadge: string;
      readonly statusHelp: Readonly<
        Record<
          'PRELIMINARY' | 'PENDING' | 'MANUAL_REVIEW' | 'APPEALED' | 'CONFIRMED' | 'NOT_EVALUATED',
          string
        >
      >;
      readonly adjustmentsTitle: string;
      readonly noAdjustments: string;
      readonly secondThresholdHint: string;
      readonly periodClosedTitle: string;
      readonly periodClosedHint: string;
      readonly reopenPeriod: string;
      readonly reopenConfirm: string;
      readonly reopened: string;
      readonly addBonus: string;
      readonly takePoints: string;
      readonly changeReview: string;
      readonly restoreShift: string;
      readonly whatToDo: string;
      /** Steps shown on a shift under manual review. */
      readonly reviewSteps: readonly string[];
      /** Placeholders: {applicable}, {missing} */
      readonly reviewReason: string;
      readonly closedActions: string;
      readonly maxReached: string;
      /** Placeholder: {max} */
      readonly pointsLimit: string;
      /** Placeholders: {current}, {max} — room left up to 100 for a reward. */
      readonly pointsRoom: string;
      /** Placeholders: {current}, {max} — points that can be taken from the shift. */
      readonly pointsAvailable: string;
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
      readonly preset: string;
      readonly presets: Readonly<
        Record<'thisMonth' | 'lastMonth' | 'last7' | 'last30' | 'custom', string>
      >;
      readonly options: string;
      readonly chartType: string;
      readonly chartTypes: Readonly<Record<'bar' | 'line' | 'stacked', string>>;
      readonly series: string;
      readonly tableColumns: string;
      readonly top: string;
      readonly topAll: string;
      /** Placeholder: {n} */
      readonly rowsCount: string;
      readonly search: string;
      readonly summary: string;
      readonly noSeries: string;
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
      readonly all: string;
      readonly actorTypes: Readonly<
        Record<'EMPLOYEE' | 'WEB_USER' | 'SYSTEM' | 'TERMINAL', string>
      >;
      readonly details: string;
      readonly objectId: string;
      readonly changes: string;
      readonly field: string;
      readonly noChanges: string;
      /** Placeholder: {count} */
      readonly changedFields: string;
      readonly rawJson: string;
      readonly copyJson: string;
      readonly copyId: string;
      /** Human labels for the audit action codes written by the API. */
      readonly actions: Readonly<Record<string, string>>;
    };
    readonly administration: {
      readonly tabs: Readonly<
        Record<'employees' | 'users' | 'directories' | 'terminals' | 'checklists', string>
      >;
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
        readonly checklist: string;
        readonly noChecklist: string;
        /** Section of the employee card: checklists bound to the current position. */
        readonly checklists: string;
        readonly addChecklist: string;
        readonly checklistAdded: string;
        readonly removeChecklist: string;
        readonly checklistRemoved: string;
        readonly replaceChecklist: string;
        /** Placeholder: {name} — the checklist that gives way. */
        readonly replaceConfirm: string;
        readonly checklistReplaced: string;
        /** Placeholder: {name} */
        readonly removeConfirm: string;
        readonly onePerPosition: string;
        /** Shown instead of the replace select when no other active checklist exists. */
        readonly noOtherChecklists: string;
        readonly noChecklistHint: string;
        readonly assignPosition: string;
        readonly positionAssigned: string;
        readonly block: string;
        readonly unblock: string;
        readonly terminate: string;
        readonly statusChanged: string;
        readonly relink: string;
        readonly relinkUserId: string;
        readonly relinked: string;
        readonly import: string;
        readonly importHint: string;
        readonly importFile: string;
        readonly importPreview: string;
        /** Placeholders: {rows}, {invalid} */
        readonly importSummary: string;
        readonly importRun: string;
        /** Placeholders: {created}, {skipped} */
        readonly importDone: string;
        readonly importSkippedTitle: string;
        readonly importReasons: Readonly<Record<'DUPLICATE' | 'INVALID', string>>;
        readonly importTemplate: string;
        readonly qrHint: string;
        readonly search: string;
        readonly statusFilter: string;
        readonly issueCodesSelected: string;
        /** Placeholder: {n} */
        readonly codesIssued: string;
        readonly printCodes: string;
        readonly codeSheetTitle: string;
        readonly codeSheetHint: string;
        readonly statuses: Readonly<Record<'ACTIVE' | 'BLOCKED' | 'TERMINATED', string>>;
        readonly email: string;
        readonly phone: string;
        readonly telegramUsername: string;
        readonly personnelNumberPlaceholder: string;
        readonly fullNamePlaceholder: string;
        readonly emailPlaceholder: string;
        readonly phonePlaceholder: string;
        readonly telegramPlaceholder: string;
        readonly invalidPhone: string;
        readonly invalidTelegram: string;
        readonly contacts: string;
        readonly noContacts: string;
        /** Activation block of the employee card. */
        readonly activation: string;
        readonly activationIntro: string;
        readonly activationSteps: readonly string[];
        readonly issueCodeButton: string;
        readonly reissueCodeButton: string;
        /** Placeholder: {expires} */
        readonly codeValidUntil: string;
        readonly activationLinked: string;
        readonly activationUnavailable: string;
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
        readonly generate: string;
        readonly createdOnce: string;
        readonly copyPassword: string;
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
        readonly active: string;
        readonly edit: string;
        readonly updated: string;
        readonly delete: string;
        /** Placeholder: {name} */
        readonly deleteConfirm: string;
        readonly deleted: string;
        readonly inUse: string;
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
        readonly pair: string;
        /** Placeholders: {code}, {expires} */
        readonly pairIssued: string;
        readonly pairLink: string;
        readonly pairHint: string;
        readonly paired: string;
        readonly notPaired: string;
        readonly disable: string;
        readonly enable: string;
        readonly statusChanged: string;
        readonly edit: string;
        readonly updated: string;
        readonly delete: string;
        /** Placeholder: {name} */
        readonly deleteConfirm: string;
        readonly deleted: string;
        readonly hasHistory: string;
        readonly checkpoints: Readonly<Record<'ENTRY' | 'EXIT' | 'BOTH', string>>;
        readonly statuses: Readonly<Record<'ACTIVE' | 'DISABLED', string>>;
      };
      readonly checklists: {
        readonly intro: string;
        readonly position: string;
        readonly positions: string;
        readonly anyPosition: string;
        readonly noPositions: string;
        /** Placeholder: {name} — shown next to a position bound to another checklist. */
        readonly positionTaken: string;
        readonly positionsReplaceHint: string;
        readonly zoneType: string;
        readonly anyZoneType: string;
        readonly items: string;
        /** Placeholders: {items}, {photos} */
        readonly itemsSummary: string;
        readonly version: string;
        /** Placeholder: {n} */
        readonly versionLabel: string;
        readonly status: string;
        readonly active: string;
        readonly inactive: string;
        /** Placeholder: {n} */
        readonly usedIn: string;
        readonly create: string;
        readonly created: string;
        readonly edit: string;
        readonly updated: string;
        readonly delete: string;
        /** Placeholder: {name} */
        readonly deleteConfirm: string;
        readonly deleted: string;
        readonly inUse: string;
        readonly disable: string;
        readonly enable: string;
        readonly statusChanged: string;
        readonly itemLabel: string;
        readonly kind: string;
        readonly kinds: Readonly<Record<ChecklistItemKind, string>>;
        readonly kindHints: Readonly<Record<ChecklistItemKind, string>>;
        readonly addItem: string;
        readonly addPhoto: string;
        readonly removeItem: string;
        readonly moveUp: string;
        readonly moveDown: string;
        readonly fillDefault: string;
        readonly preview: string;
        readonly noPhoto: string;
        readonly noItems: string;
        readonly emptyLabel: string;
        readonly search: string;
      };
    };
  };
  /** Shared panel chrome: pagination, dialogs, generic labels and information tooltips. */
  readonly ui: {
    /** Relative time next to deadlines: {value} is "2 ч 15 мин" or "40 мин". */
    readonly time: {
      readonly in: string;
      readonly overdueBy: string;
      readonly hours: string;
      readonly minutes: string;
      readonly now: string;
    };
    readonly pagination: {
      /** Placeholders: {from}, {to}, {total} */
      readonly showing: string;
      readonly pageSize: string;
      readonly previous: string;
      readonly next: string;
      /** Placeholders: {page}, {pages} */
      readonly page: string;
    };
    readonly common: {
      readonly actions: string;
      readonly search: string;
      readonly filters: string;
      readonly apply: string;
      readonly reset: string;
      readonly cancel: string;
      readonly confirm: string;
      readonly close: string;
      readonly save: string;
      readonly loading: string;
      readonly noResults: string;
      readonly details: string;
      readonly hide: string;
      readonly yes: string;
      readonly no: string;
      readonly optional: string;
      readonly required: string;
      /** Placeholder: {min} */
      readonly minLength: string;
      /** Placeholder: {max} */
      readonly maxLength: string;
      readonly invalidValue: string;
      readonly invalidEmail: string;
      readonly invalidNumber: string;
      readonly moreInfo: string;
      /** Under a comment box: how to submit without leaving the keyboard. */
      readonly submitShortcut: string;
      readonly copy: string;
      readonly copied: string;
      readonly openInNewTab: string;
      readonly menu: string;
      readonly version: string;
      readonly add: string;
      readonly loading_rows: string;
      readonly nothingHere: string;
      readonly searchPlaceholder: string;
      readonly sortAsc: string;
      readonly sortDesc: string;
      readonly noMatches: string;
      readonly closePanel: string;
      readonly howItWorks: string;
      readonly faq: string;
      /** Placeholder: {section} */
      readonly helpFor: string;
      readonly openGuide: string;
      readonly purpose: string;
      readonly theme: string;
      readonly themes: Readonly<Record<'system' | 'light' | 'dark', string>>;
      readonly density: string;
      readonly densities: Readonly<Record<'comfortable' | 'compact', string>>;
      readonly commandPalette: string;
      readonly commandPlaceholder: string;
      readonly commandSections: string;
      readonly commandEmployees: string;
      readonly commandActions: string;
      readonly commandChecklists: string;
      readonly commandTerminals: string;
      /** Placeholder: {n} */
      readonly selected: string;
      readonly selectAll: string;
      readonly clearSelection: string;
      readonly print: string;
      readonly chart: string;
    };
    /** "How it works" blocks and the FAQ behind the help button, per section and administration tab. */
    readonly guide: Readonly<Record<GuideKey, SectionGuide>>;
    readonly hints: {
      readonly language: string;
      readonly operationsIncludeClosed: string;
      readonly operationsMasterAction: string;
      readonly operationsClarify: string;
      readonly operationsStartFor: string;
      readonly operationsStartZone: string;
      readonly operationsLive: string;
      readonly scheduleVersions: string;
      readonly scheduleEditPublished: string;
      readonly scheduleRevise: string;
      readonly scheduleAddEmployee: string;
      readonly scheduleSubmit: string;
      readonly schedulePublish: string;
      readonly scheduleReturn: string;
      readonly scheduleZone: string;
      readonly scheduleAck: string;
      readonly scheduleIssues: string;
      readonly incidentsScope: string;
      readonly incidentsSla: string;
      readonly incidentsDuplicate: string;
      readonly incidentsStats: string;
      readonly handoverScope: string;
      readonly handoverDeadline: string;
      readonly handoverDecision: string;
      readonly handoverPhoto: string;
      readonly requestsScope: string;
      readonly requestsStep: string;
      readonly requestsApprovedMinutes: string;
      readonly requestsProposal: string;
      readonly requestsOvertime: string;
      readonly requestsMedical: string;
      readonly bonusSMonth: string;
      readonly bonusBase: string;
      readonly bonusClose: string;
      readonly bonusAdjust: string;
      readonly bonusSecond: string;
      readonly bonusRecompute: string;
      readonly bonusPoints: string;
      readonly bonusReview: string;
      readonly bonusLeaderboard: string;
      readonly bonusStatus: string;
      readonly reportsKind: string;
      readonly reportsExport: string;
      readonly reportsDataVersion: string;
      readonly auditTabs: string;
      readonly employeesActivation: string;
      readonly employeesRelink: string;
      readonly employeesStatus: string;
      readonly employeesPosition: string;
      readonly usersPassword: string;
      readonly usersScope: string;
      readonly usersTwoFactor: string;
      readonly directoriesShared: string;
      readonly directoriesZoneType: string;
      readonly directoriesTimezone: string;
      readonly directoriesCode: string;
      readonly terminalsPair: string;
      readonly terminalsStatus: string;
      readonly terminalsDelete: string;
      readonly terminalsCheckpoint: string;
      readonly checklists: string;
      readonly checklistsPosition: string;
      readonly checklistsZoneType: string;
      readonly checklistsItems: string;
      readonly checklistsPhoto: string;
      readonly checklistsVersion: string;
      readonly checklistsDelete: string;
      readonly scheduleDelete: string;
      readonly employeesPositionColumn: string;
      readonly employeesPersonnelNumber: string;
      readonly employeesFullName: string;
      readonly employeesEmail: string;
      readonly employeesPhone: string;
      readonly employeesTelegram: string;
      readonly employeesChecklistColumn: string;
      readonly employeesChecklists: string;
      readonly employeesImport: string;
      readonly employeesQr: string;
      readonly directoriesDelete: string;
      readonly usersGenerate: string;
      readonly overview: string;
      readonly tableSearch: string;
      readonly profileTheme: string;
      readonly profileDensity: string;
      readonly commandPalette: string;
      readonly scheduleKeyboard: string;
      readonly schedulePattern: string;
      readonly scheduleRemind: string;
      readonly employeesBulkCodes: string;
      readonly incidentsBulkClose: string;
      readonly reportsChart: string;
      readonly reportsOptions: string;
      readonly reportsSeries: string;
      readonly reportsColumns: string;
      readonly profileTwoFactor: string;
    };
  };
  readonly kiosk: {
    readonly title: string;
    readonly hint: string;
    readonly offline: string;
    readonly unauthorized: string;
    readonly pairTitle: string;
    readonly pairHint: string;
    readonly pairCode: string;
    readonly pairButton: string;
    readonly pairing: string;
    readonly pairInvalid: string;
    readonly repair: string;
    readonly refreshIn: string;
    readonly seconds: string;
    readonly lastSync: string;
    readonly fullscreen: string;
  };
}
