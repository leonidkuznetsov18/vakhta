export interface OnboardingMessages {
  loading: string;
  unavailable: string;
  retry: string;
  title: string;
  intro: string;
  password: string;
  confirmPassword: string;
  passwordHint: string;
  mismatch: string;
  submit: string;
  saving: string;
  success: string;
  signIn: string;
  invalid: string;
  failed: string;
  bot: string;
  botPending: string;
  kiosk: string;
  kioskSteps: string;
}
export const onboardingEn: OnboardingMessages = {
  loading: 'Loading your workspace…',
  unavailable: 'This workspace is unavailable. Check the address or contact your operator.',
  retry: 'Retry',
  title: 'Welcome',
  intro: 'Set a password for your administrator account.',
  password: 'Password',
  confirmPassword: 'Confirm password',
  passwordHint: 'Use 12–128 characters.',
  mismatch: 'Passwords must match.',
  submit: 'Set password',
  saving: 'Saving password…',
  success: 'Your password is set. Sign in to start configuring your workspace.',
  signIn: 'Go to sign in',
  invalid:
    'This invitation has expired or is no longer available. Ask your operator for a new link.',
  failed: 'Could not complete the request. Please retry.',
  bot: 'Open worker bot',
  botPending: 'Your operator is connecting the bot.',
  kiosk: 'Open kiosk',
  kioskSteps:
    'After signing in, open Administration → Terminals. Create a terminal, generate a pairing code and enter it on the kiosk.',
};
export const onboardingUk: OnboardingMessages = {
  loading: 'Завантаження вашого простору…',
  unavailable: 'Цей простір недоступний. Перевірте адресу або зверніться до оператора.',
  retry: 'Повторити',
  title: 'Ласкаво просимо',
  intro: 'Установіть пароль для облікового запису адміністратора.',
  password: 'Пароль',
  confirmPassword: 'Повторіть пароль',
  passwordHint: 'Від 12 до 128 символів.',
  mismatch: 'Паролі мають збігатися.',
  submit: 'Установити пароль',
  saving: 'Зберігаємо пароль…',
  success: 'Пароль установлено. Увійдіть, щоб почати налаштування.',
  signIn: 'Перейти до входу',
  invalid: 'Запрошення прострочене або недоступне. Попросіть оператора створити нове посилання.',
  failed: 'Не вдалося завершити запит. Спробуйте ще раз.',
  bot: 'Відкрити бота працівників',
  botPending: 'Оператор підключає бота.',
  kiosk: 'Відкрити кіоск',
  kioskSteps:
    'Після входу відкрийте Адміністрування → Термінали. Створіть термінал, отримайте код підключення та введіть його на кіоску.',
};
export const onboardingRu: OnboardingMessages = {
  loading: 'Загрузка вашего пространства…',
  unavailable: 'Это пространство недоступно. Проверьте адрес или обратитесь к оператору.',
  retry: 'Повторить',
  title: 'Добро пожаловать',
  intro: 'Установите пароль для учётной записи администратора.',
  password: 'Пароль',
  confirmPassword: 'Повторите пароль',
  passwordHint: 'От 12 до 128 символов.',
  mismatch: 'Пароли должны совпадать.',
  submit: 'Установить пароль',
  saving: 'Сохраняем пароль…',
  success: 'Пароль установлен. Войдите, чтобы начать настройку.',
  signIn: 'Перейти ко входу',
  invalid: 'Приглашение просрочено или недоступно. Попросите оператора создать новую ссылку.',
  failed: 'Не удалось завершить запрос. Попробуйте ещё раз.',
  bot: 'Открыть бота работников',
  botPending: 'Оператор подключает бота.',
  kiosk: 'Открыть киоск',
  kioskSteps:
    'После входа откройте Администрирование → Терминалы. Создайте терминал, получите код подключения и введите его на киоске.',
};
