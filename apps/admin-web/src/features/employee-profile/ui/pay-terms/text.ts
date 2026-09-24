/**
 * Prototype copy for the card section «Должности и оплата», Russian only. The production change
 * moves every key into `@vakhta/i18n` (uk/en/ru).
 */
export const text = {
  title: 'Должности и оплата',
  hint: 'Назначения сотрудника и условия оплаты по каждому из них. Значение показывает свой источник: группа, таблица уровней, узел структуры или личное условие. Изменения датированы и проходят согласование.',
  employment: {
    contract: 'Договор',
    currency: 'Валюта',
    since: 'с {date}',
  },
  assignment: {
    add: 'Добавить назначение',
    primary: 'Основное',
    share: 'доля {n} %',
    fte: 'ставка {n}',
    level: 'Уровень',
    noLevel: 'Уровень не выбран',
    group: 'Группа',
    noGroup: 'Без группы оплаты',
    transfer: 'Перевести',
    changeLevel: 'Изменить уровень',
    end: 'Завершить',
    states: { ACTIVE: 'Действует', SCHEDULED: 'С даты', ENDED: 'Завершено' },
  },
  components: {
    heading: 'Компоненты оплаты',
    component: 'Компонент',
    fromGroup: 'Из группы',
    personal: 'Персонально',
    applied: 'Применено',
    validFrom: 'Действует с',
    inherit: 'Наследовать',
    replace: 'Заменить на {value}',
    add: 'Добавлено {value}',
    disabled: 'Отключено',
    none: '—',
    draft: 'Черновик',
    approved: 'Утверждено',
    path: 'Путь разрешения',
    change: 'Изменить для сотрудника',
    addSupplement: 'Добавить доплату',
    disable: 'Отключить',
    revert: 'Вернуть условия группы',
    keys: {
      BASE_SALARY: 'Оклад за месяц',
      HOURLY_RATE: 'Ставка за час',
      LEVEL_SUPPLEMENT: 'Доплата уровня',
      POINT_PRICE: 'Цена балла',
      NIGHT_COEFFICIENT: 'Ночной коэффициент',
      LEAD_SUPPLEMENT: 'Доплата за бригаду',
    },
    units: {
      PER_MONTH: '/ мес',
      PER_HOUR: '/ час',
      PER_POINT: '/ балл',
      COEFFICIENT: '×',
    },
    sources: {
      GROUP_LEVEL: 'таблица уровней',
      GROUP_POSITION: 'группа, должность',
      GROUP: 'группа',
      NODE: 'узел структуры',
      CENTER: 'центр → группа',
      PERSONAL: 'персонально',
      DISABLED: 'отключено',
      MISSING: 'нет данных',
    },
  },
  preview: {
    heading: 'Предпросмотр · {month}',
    hint: 'Управленческая оценка по плановым часам месяца и действующим условиям. Не является расчётом зарплаты: налоги, удержания и выплаты считает расчётный модуль.',
    hours: '{n} ч по графику',
    base: 'база',
    level: 'доплата уровня',
    adjustments: 'разовые',
    total: 'всего до удержаний',
    was: 'было',
    becomes: 'станет',
    diff: 'разница',
  },
  adjustments: {
    heading: 'Разовые корректировки',
    add: 'Разовая корректировка',
    kind: 'Вид',
    kinds: {
      BONUS: 'Разовая премия',
      RECALC: 'Перерасчёт',
      DEDUCTION_REQUEST: 'Заявка на удержание',
    },
    amount: 'Сумма',
    sourcePeriod: 'Исходный период',
    period: 'Отражаемый период',
    reason: 'Причина',
    attachment: 'Документ',
    attachmentHint:
      'Приказ, акт или другое основание. Обязателен для уменьшения ранее начисленного.',
    empty: 'Разовых корректировок нет',
    save: 'Создать черновик',
  },
  editor: {
    replaceTitle: 'Изменить для сотрудника',
    addTitle: 'Добавить доплату',
    value: 'Значение',
    unit: 'Единица',
    validFrom: 'Действует с',
    validTo: 'Действует по',
    validToHint:
      'Пусто — бессрочно. Для временного условия укажите, что применяется после окончания.',
    afterEnd: 'После окончания',
    afterEndGroup: 'Условия группы на дату',
    afterEndKeep: 'Прежнее личное условие',
    reason: 'Основание',
    reasonHint: 'Причина, документ или аттестация. Попадает в историю и согласование.',
    draft: 'Сохранить черновик',
    submit: 'Отправить на согласование',
    cancel: 'Отмена',
    approvalHint:
      'Черновик не влияет на начисление. Утверждает руководитель подразделения или администратор.',
  },
  level: {
    title: 'Изменить уровень',
    pick: 'Уровень из шкалы должности',
    date: 'Действует с',
    reason: 'Основание',
    segments: 'По месяцам',
    before: 'до',
    after: 'после',
    keepPersonal: 'Личные условия: сохранить совместимые',
    submit: 'Отправить на согласование',
  },
  transfer: {
    title: 'Перевести назначение',
    target: 'Новое подразделение',
    position: 'Должность',
    date: 'Дата перевода',
    sources: 'Источники условий',
    old: 'Сейчас',
    new: 'После перевода',
    exceptions: 'Личные условия',
    decision: 'Решение',
    keep: 'Сохранить',
    replace: 'Заменить',
    inherit: 'Наследовать новое',
    decisionHint: 'Ни одно личное условие не сбрасывается молча: по каждому нужен явный выбор.',
    openBlocks: 'Открытые рабочие блоки',
    openBlocksNote:
      'Сентябрь: табель не утверждён. История до даты перевода остаётся у прежнего подразделения.',
    submit: 'Отправить на согласование',
  },
  history: {
    heading: 'История условий',
    empty: 'Изменений ещё не было',
  },
  access: {
    readonly: 'Только просмотр',
    namesOnly:
      'Суммы скрыты: доступ к суммам есть у администратора, HR, бухгалтера и руководителя подразделения.',
  },
} as const;

export function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}

export function money(value: number | null, currency = 'UAH'): string {
  if (value === null) return '—';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}
