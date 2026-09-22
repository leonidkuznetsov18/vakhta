export interface OperatorInvitationMessages {
  add: string;
  createHint: string;
  roleHint: string;
  createLink: string;
  ready: string;
  shareHint: string;
  link: string;
  copy: string;
  copied: string;
  copyFailed: string;
  expires: string;
  close: string;
  reissue: string;
  reissueHint: string;
  pending: string;
  active: string;
  disabled: string;
  exists: string;
  unavailable: string;
  failed: string;
  nameRule: string;
  emailRule: string;
  setPassword: string;
  confirmPassword: string;
  passwordRule: string;
  mismatch: string;
  saved: string;
  signInHint: string;
  offline: string;
  refreshing: string;
  empty: string;
  count: string;
  previous: string;
  next: string;
  actions: string;
}
export const operatorInvitationsUk: OperatorInvitationMessages = {
  add: 'Додати оператора',
  createHint: 'Оператор самостійно встановить пароль за посиланням запрошення.',
  roleHint: 'Перегляд дозволяє читати дані. Адміністратор керує клієнтами та доступом операторів.',
  createLink: 'Створити посилання',
  ready: 'Запрошення готове',
  shareHint:
    'Скопіюйте й надішліть посилання оператору приватно. Пароль задається один раз; під час першого входу потрібно налаштувати двофакторну перевірку.',
  link: 'Посилання запрошення',
  copy: 'Копіювати посилання',
  copied: 'Скопійовано',
  copyFailed: 'Не вдалося скопіювати. Виділіть і скопіюйте посилання вручну.',
  expires: 'Діє до {date}',
  close: 'Закрити',
  reissue: 'Нове запрошення',
  reissueHint: 'Попереднє посилання перестане діяти. Пароль можна встановити лише один раз.',
  pending: 'Очікує встановлення пароля',
  active: 'Активний',
  disabled: 'Вимкнений',
  exists:
    'Оператор із цим email уже існує. Для незавершеного запрошення створіть нове посилання у списку.',
  unavailable:
    'Запрошення недійсне, прострочене або вже використане. Зверніться до адміністратора.',
  failed: 'Не вдалося завершити дію. Перевірте з’єднання та повторіть спробу.',
  nameRule: 'Введіть ім’я від 2 до 120 символів.',
  emailRule: 'Введіть коректну email-адресу.',
  setPassword: 'Встановити пароль',
  confirmPassword: 'Повторіть пароль',
  passwordRule: 'Пароль має містити від 12 до 128 символів.',
  mismatch: 'Паролі не збігаються.',
  saved: 'Пароль встановлено',
  signInHint: 'Увійдіть зі своїм email і новим паролем, потім налаштуйте двофакторну перевірку.',
  offline: 'Немає з’єднання. Спробуйте ще раз після відновлення мережі.',
  refreshing: 'Оновлення…',
  empty: 'Операторів немає',
  count: 'Усього операторів: {count}',
  previous: 'Назад',
  next: 'Далі',
  actions: 'Дії',
};
export const operatorInvitationsEn: OperatorInvitationMessages = {
  add: 'Add operator',
  createHint: 'The operator will choose their own password using the invitation link.',
  roleHint: 'Viewers can read data. Administrators manage clients and operator access.',
  createLink: 'Create link',
  ready: 'Invitation ready',
  shareHint:
    'Copy and send this link privately to the operator. The password can be set once; two-factor setup is required at first sign-in.',
  link: 'Invitation link',
  copy: 'Copy link',
  copied: 'Copied',
  copyFailed: 'Could not copy. Select the link and copy it manually.',
  expires: 'Expires {date}',
  close: 'Close',
  reissue: 'New invitation',
  reissueHint: 'The previous link will stop working. The password can only be set once.',
  pending: 'Awaiting password',
  active: 'Active',
  disabled: 'Disabled',
  exists:
    'An operator with this email already exists. For an unfinished invitation, create a new link from the list.',
  unavailable: 'This invitation is invalid, expired or already used. Contact your administrator.',
  failed: 'Could not complete the action. Check your connection and try again.',
  nameRule: 'Enter a name with 2–120 characters.',
  emailRule: 'Enter a valid email address.',
  setPassword: 'Set password',
  confirmPassword: 'Confirm password',
  passwordRule: 'Use 12–128 characters for your password.',
  mismatch: 'Passwords do not match.',
  saved: 'Password set',
  signInHint: 'Sign in with your email and new password, then set up two-factor authentication.',
  offline: 'You are offline. Try again after reconnecting.',
  refreshing: 'Refreshing…',
  empty: 'No operators',
  count: 'Total operators: {count}',
  previous: 'Previous',
  next: 'Next',
  actions: 'Actions',
};
export const operatorInvitationsRu: OperatorInvitationMessages = {
  add: 'Добавить оператора',
  createHint: 'Оператор самостоятельно установит пароль по ссылке приглашения.',
  roleHint:
    'Просмотр позволяет читать данные. Администратор управляет клиентами и доступом операторов.',
  createLink: 'Создать ссылку',
  ready: 'Приглашение готово',
  shareHint:
    'Скопируйте и отправьте ссылку оператору лично. Пароль задаётся один раз; при первом входе необходимо настроить двухфакторную проверку.',
  link: 'Ссылка приглашения',
  copy: 'Копировать ссылку',
  copied: 'Скопировано',
  copyFailed: 'Не удалось скопировать. Выделите и скопируйте ссылку вручную.',
  expires: 'Действует до {date}',
  close: 'Закрыть',
  reissue: 'Новое приглашение',
  reissueHint: 'Предыдущая ссылка перестанет действовать. Пароль можно установить только один раз.',
  pending: 'Ожидает установки пароля',
  active: 'Активен',
  disabled: 'Отключён',
  exists:
    'Оператор с этим email уже существует. Для незавершённого приглашения создайте новую ссылку в списке.',
  unavailable:
    'Приглашение недействительно, просрочено или уже использовано. Обратитесь к администратору.',
  failed: 'Не удалось завершить действие. Проверьте соединение и повторите попытку.',
  nameRule: 'Введите имя от 2 до 120 символов.',
  emailRule: 'Введите корректный email-адрес.',
  setPassword: 'Установить пароль',
  confirmPassword: 'Повторите пароль',
  passwordRule: 'Пароль должен содержать от 12 до 128 символов.',
  mismatch: 'Пароли не совпадают.',
  saved: 'Пароль установлен',
  signInHint: 'Войдите со своим email и новым паролем, затем настройте двухфакторную проверку.',
  offline: 'Нет соединения. Повторите после восстановления сети.',
  refreshing: 'Обновление…',
  empty: 'Операторов нет',
  count: 'Всего операторов: {count}',
  previous: 'Назад',
  next: 'Далее',
  actions: 'Действия',
};
