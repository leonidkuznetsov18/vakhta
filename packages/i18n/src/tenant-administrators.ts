export interface TenantAdministratorMessages {
  title: string;
  passwordHint: string;
  empty: string;
  notReady: string;
  count: string;
  mfaEnabled: string;
  mfaDisabled: string;
  changePassword: string;
  resetPassword: string;
  remove: string;
  removeHint: string;
  lastAdmin: string;
  newPassword: string;
  passwordRule: string;
  show: string;
  hide: string;
  copy: string;
  copied: string;
  save: string;
  saved: string;
  removed: string;
  cancel: string;
  close: string;
  confirmRemove: string;
  previous: string;
  next: string;
  page: string;
  failed: string;
  unchanged: string;
  offline: string;
  refreshing: string;
}
export const tenantAdministratorsEn: TenantAdministratorMessages = {
  title: 'Tenant administrators',
  passwordHint:
    'Current passwords cannot be viewed. Set a new password or reset it to a generated one.',
  empty: 'No administrators found.',
  notReady: 'Administrators will appear after the database is provisioned.',
  count: 'Administrators: {count}',
  mfaEnabled: 'MFA enabled',
  mfaDisabled: 'MFA not enabled',
  changePassword: 'Change password',
  resetPassword: 'Reset password',
  remove: 'Delete administrator',
  removeHint:
    'This removes all panel access and signs the administrator out. Recorded history is preserved.',
  lastAdmin: 'The last enterprise administrator cannot be deleted.',
  newPassword: 'New password',
  passwordRule:
    'Use 12–128 characters. Saving signs out all current sessions and invalidates earlier setup links.',
  show: 'Show password',
  hide: 'Hide password',
  copy: 'Copy password',
  copied: 'Password copied',
  save: 'Save password',
  saved: 'Password saved. Keep the new password before closing this window.',
  removed: 'Administrator access deleted.',
  cancel: 'Cancel',
  close: 'Close',
  confirmRemove: 'Confirm deletion',
  previous: 'Previous',
  next: 'Next',
  page: 'Page {page}',
  failed:
    'The action could not be confirmed. Refresh the list before retrying; keep the new password if you were saving it.',
  unchanged: 'Choose a password different from the current password.',
  offline: 'Connection unavailable. Reconnect and retry.',
  refreshing: 'Refreshing administrators…',
};
export const tenantAdministratorsUk: TenantAdministratorMessages = {
  title: 'Адміністратори клієнта',
  passwordHint:
    'Поточні паролі недоступні для перегляду. Встановіть новий пароль або скиньте його на згенерований.',
  empty: 'Адміністраторів не знайдено.',
  notReady: 'Адміністратори з’являться після створення бази даних.',
  count: 'Адміністраторів: {count}',
  mfaEnabled: 'MFA увімкнено',
  mfaDisabled: 'MFA не увімкнено',
  changePassword: 'Змінити пароль',
  resetPassword: 'Скинути пароль',
  remove: 'Видалити адміністратора',
  removeHint:
    'Буде відкликано весь доступ до панелі та завершено сесії адміністратора. Історія записів збережеться.',
  lastAdmin: 'Останнього адміністратора підприємства не можна видалити.',
  newPassword: 'Новий пароль',
  passwordRule:
    'Від 12 до 128 символів. Збереження завершить усі поточні сесії та скасує попередні посилання налаштування.',
  show: 'Показати пароль',
  hide: 'Приховати пароль',
  copy: 'Копіювати пароль',
  copied: 'Пароль скопійовано',
  save: 'Зберегти пароль',
  saved: 'Пароль збережено. Збережіть новий пароль перед закриттям цього вікна.',
  removed: 'Доступ адміністратора видалено.',
  cancel: 'Скасувати',
  close: 'Закрити',
  confirmRemove: 'Підтвердити видалення',
  previous: 'Назад',
  next: 'Далі',
  page: 'Сторінка {page}',
  failed:
    'Не вдалося підтвердити дію. Оновіть список перед повтором; якщо зберігали пароль, збережіть його у себе.',
  unchanged: 'Виберіть пароль, що відрізняється від поточного.',
  offline: 'Немає з’єднання. Відновіть його та повторіть.',
  refreshing: 'Оновлення адміністраторів…',
};
export const tenantAdministratorsRu: TenantAdministratorMessages = {
  title: 'Администраторы клиента',
  passwordHint:
    'Текущие пароли недоступны для просмотра. Установите новый пароль или сбросьте его на сгенерированный.',
  empty: 'Администраторы не найдены.',
  notReady: 'Администраторы появятся после создания базы данных.',
  count: 'Администраторов: {count}',
  mfaEnabled: 'MFA включена',
  mfaDisabled: 'MFA не включена',
  changePassword: 'Изменить пароль',
  resetPassword: 'Сбросить пароль',
  remove: 'Удалить администратора',
  removeHint:
    'Будет отозван весь доступ к панели и завершены сессии администратора. История записей сохранится.',
  lastAdmin: 'Последнего администратора предприятия нельзя удалить.',
  newPassword: 'Новый пароль',
  passwordRule:
    'От 12 до 128 символов. Сохранение завершит все текущие сессии и отменит прежние ссылки настройки.',
  show: 'Показать пароль',
  hide: 'Скрыть пароль',
  copy: 'Копировать пароль',
  copied: 'Пароль скопирован',
  save: 'Сохранить пароль',
  saved: 'Пароль сохранён. Сохраните новый пароль перед закрытием этого окна.',
  removed: 'Доступ администратора удалён.',
  cancel: 'Отмена',
  close: 'Закрыть',
  confirmRemove: 'Подтвердить удаление',
  previous: 'Назад',
  next: 'Далее',
  page: 'Страница {page}',
  failed:
    'Не удалось подтвердить действие. Обновите список перед повтором; если сохраняли пароль, сохраните его у себя.',
  unchanged: 'Выберите пароль, отличающийся от текущего.',
  offline: 'Нет соединения. Восстановите его и повторите.',
  refreshing: 'Обновление администраторов…',
};
