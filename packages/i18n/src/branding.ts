export interface BrandingMessages {
  title: string;
  hint: string;
  name: string;
  nameError: string;
  logo: string;
  logoHint: string;
  removeLogo: string;
  color: string;
  colorError: string;
  defaultColor: string;
  preview: string;
  previewAction: string;
  save: string;
  saved: string;
  reset: string;
  readOnly: string;
  failed: string;
  invalidLogo: string;
  tooLarge: string;
  storageUnavailable: string;
  conflict: string;
  reload: string;
  edit: string;
  offline: string;
}
export const brandingUk: BrandingMessages = {
  title: 'Брендинг',
  hint: 'Назва, логотип і колір на вході, у панелі та кіоску клієнта. Збережені зміни з’являться після оновлення сторінки.',
  name: 'Назва для користувачів',
  nameError: 'Введіть від 2 до 120 символів.',
  logo: 'Логотип',
  logoHint: 'PNG, JPEG або WebP, до 512 КБ. Логотип буде публічним; пропорції збережуться.',
  removeLogo: 'Прибрати логотип',
  color: 'Колір бренду',
  colorError: 'Введіть колір у форматі #2563eb.',
  defaultColor: 'Стандартний колір',
  preview: 'Попередній перегляд',
  previewAction: 'Увійти в панель',
  save: 'Зберегти бренд',
  saved: 'Брендинг збережено',
  reset: 'Скасувати зміни',
  readOnly: 'У вас доступ лише для перегляду.',
  failed: 'Не вдалося зберегти бренд. Ваші зміни залишилися у формі.',
  invalidLogo: 'Оберіть коректне зображення PNG, JPEG або WebP.',
  tooLarge: 'Логотип має бути не більшим за 512 КБ.',
  storageUnavailable: 'Сховище логотипів недоступне. Спробуйте пізніше.',
  conflict: 'Інший оператор змінив бренд. Завантажте останню версію перед редагуванням.',
  reload: 'Завантажити збережену версію',
  edit: 'Редагувати бренд',
  offline: 'Немає з’єднання. Зміни збережені у формі.',
};
export const brandingEn: BrandingMessages = {
  title: 'Branding',
  hint: 'The name, logo and colour on the client’s sign-in, panel and kiosk. Saved changes appear after reloading the page.',
  name: 'Display name',
  nameError: 'Enter between 2 and 120 characters.',
  logo: 'Logo',
  logoHint:
    'PNG, JPEG or WebP, up to 512 KB. The logo will be public; its proportions are preserved.',
  removeLogo: 'Remove logo',
  color: 'Brand colour',
  colorError: 'Enter a colour such as #2563eb.',
  defaultColor: 'Default colour',
  preview: 'Preview',
  previewAction: 'Sign in to the panel',
  save: 'Save branding',
  saved: 'Branding saved',
  reset: 'Discard changes',
  readOnly: 'You have view-only access.',
  failed: 'Could not save branding. Your changes remain in the form.',
  invalidLogo: 'Choose a valid PNG, JPEG or WebP image.',
  tooLarge: 'The logo must be no larger than 512 KB.',
  storageUnavailable: 'Logo storage is unavailable. Try again later.',
  conflict: 'Another operator changed the branding. Load the latest version before editing.',
  reload: 'Load saved version',
  edit: 'Edit branding',
  offline: 'No connection. Your changes remain in the form.',
};
export const brandingRu: BrandingMessages = {
  title: 'Брендинг',
  hint: 'Название, логотип и цвет на входе, в панели и киоске клиента. Сохранённые изменения появятся после обновления страницы.',
  name: 'Название для пользователей',
  nameError: 'Введите от 2 до 120 символов.',
  logo: 'Логотип',
  logoHint: 'PNG, JPEG или WebP, до 512 КБ. Логотип будет публичным; пропорции сохранятся.',
  removeLogo: 'Убрать логотип',
  color: 'Цвет бренда',
  colorError: 'Введите цвет в формате #2563eb.',
  defaultColor: 'Стандартный цвет',
  preview: 'Предпросмотр',
  previewAction: 'Войти в панель',
  save: 'Сохранить бренд',
  saved: 'Брендинг сохранён',
  reset: 'Отменить изменения',
  readOnly: 'У вас доступ только для просмотра.',
  failed: 'Не удалось сохранить бренд. Ваши изменения остались в форме.',
  invalidLogo: 'Выберите корректное изображение PNG, JPEG или WebP.',
  tooLarge: 'Логотип должен быть не больше 512 КБ.',
  storageUnavailable: 'Хранилище логотипов недоступно. Попробуйте позже.',
  conflict: 'Другой оператор изменил бренд. Загрузите последнюю версию перед редактированием.',
  reload: 'Загрузить сохранённую версию',
  edit: 'Редактировать бренд',
  offline: 'Нет соединения. Изменения сохранены в форме.',
};
