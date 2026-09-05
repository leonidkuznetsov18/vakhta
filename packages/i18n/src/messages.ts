import type { ShiftAction, ShiftState, TransitionErrorCode } from '@vakhta/domain';

/** Повна форма каталогу: типи гарантують, що жодна дія, стан чи помилка не лишилась без тексту. */
export interface Messages {
  readonly bot: {
    readonly welcome: string;
    readonly notRegistered: string;
    readonly qrReceivedNotReady: string;
    readonly notReady: string;
    readonly useButtons: string;
    readonly serverTimeLabel: string;
  };
  readonly actions: Readonly<Record<ShiftAction, string>>;
  readonly states: Readonly<Record<ShiftState, string>>;
  readonly errors: Readonly<Record<TransitionErrorCode, string>>;
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
  };
  readonly kiosk: {
    readonly title: string;
    readonly hint: string;
    readonly offline: string;
    readonly refreshIn: string;
    readonly seconds: string;
  };
}
