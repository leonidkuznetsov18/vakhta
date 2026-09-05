import type {
  ActivationFailure,
  CheckInFailure,
  EmployeeAccess,
  ShiftAction,
  ShiftState,
  TransitionErrorCode,
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
  readonly errors: Readonly<Record<TransitionErrorCode, string>>;
  readonly roles: Readonly<Record<WebRole, string>>;
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
