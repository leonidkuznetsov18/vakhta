export interface TenantUsersMessages {
  title: string;
  total: string;
  workers: string;
  panel: string;
  all: string;
  explanation: string;
  overlap: string;
  search: string;
  apply: string;
  refresh: string;
  refreshing: string;
  offline: string;
  unavailable: string;
  notReady: string;
  empty: string;
  name: string;
  email: string;
  roles: string;
  personnelNumber: string;
  noEmail: string;
  count: string;
  previous: string;
  next: string;
  page: string;
  checkedAt: string;
}
export const tenantUsersEn: TenantUsersMessages = {
  title: 'Users',
  total: 'Total seats',
  workers: 'Workers',
  panel: 'Panel users',
  all: 'All users',
  explanation:
    'Active workers + panel accounts with roles and sign-in access. Worker and panel records count separately, even if they belong to the same person.',
  overlap:
    'Each panel account counts once in the total. A user can appear in several role groups. Roles use the shared platform catalog.',
  search: 'Search name, email or personnel number',
  apply: 'Search',
  refresh: 'Refresh',
  refreshing: 'Refreshing users…',
  offline: 'You are offline. Reconnect to refresh users.',
  unavailable: 'Count unavailable',
  notReady: 'Database not ready',
  empty: 'No users match these filters.',
  name: 'Name',
  email: 'Email',
  roles: 'Roles',
  personnelNumber: 'Personnel no.',
  noEmail: 'Email not provided',
  count: 'Showing {shown} of {total}',
  previous: 'Previous',
  next: 'Next',
  page: 'Page {page}',
  checkedAt: 'Updated {time}',
};
export const tenantUsersUk: TenantUsersMessages = {
  title: 'Користувачі',
  total: 'Усього місць',
  workers: 'Працівники',
  panel: 'Користувачі панелі',
  all: 'Усі користувачі',
  explanation:
    'Активні працівники + облікові записи панелі з ролями та можливістю входу. Записи працівника й панелі рахуються окремо, навіть якщо належать одній людині.',
  overlap:
    'Кожен обліковий запис панелі враховано в підсумку один раз. Користувач може входити до кількох груп ролей. Ролі беруться зі спільного довідника платформи.',
  search: 'Пошук за ім’ям, email або табельним номером',
  apply: 'Знайти',
  refresh: 'Оновити',
  refreshing: 'Оновлення користувачів…',
  offline: 'Немає мережі. Відновіть з’єднання для оновлення.',
  unavailable: 'Кількість недоступна',
  notReady: 'База даних ще не готова',
  empty: 'За цими фільтрами користувачів немає.',
  name: 'Ім’я',
  email: 'Email',
  roles: 'Ролі',
  personnelNumber: 'Табельний №',
  noEmail: 'Email не вказано',
  count: 'Показано {shown} із {total}',
  previous: 'Назад',
  next: 'Далі',
  page: 'Сторінка {page}',
  checkedAt: 'Оновлено {time}',
};
export const tenantUsersRu: TenantUsersMessages = {
  title: 'Пользователи',
  total: 'Всего мест',
  workers: 'Работники',
  panel: 'Пользователи панели',
  all: 'Все пользователи',
  explanation:
    'Активные работники + учётные записи панели с ролями и возможностью входа. Записи работника и панели считаются отдельно, даже если принадлежат одному человеку.',
  overlap:
    'Каждая учётная запись панели учтена в итоге один раз. Пользователь может входить в несколько групп ролей. Роли берутся из общего справочника платформы.',
  search: 'Поиск по имени, email или табельному номеру',
  apply: 'Найти',
  refresh: 'Обновить',
  refreshing: 'Обновление пользователей…',
  offline: 'Нет сети. Восстановите соединение для обновления.',
  unavailable: 'Количество недоступно',
  notReady: 'База данных ещё не готова',
  empty: 'По этим фильтрам пользователей нет.',
  name: 'Имя',
  email: 'Email',
  roles: 'Роли',
  personnelNumber: 'Табельный №',
  noEmail: 'Email не указан',
  count: 'Показано {shown} из {total}',
  previous: 'Назад',
  next: 'Далее',
  page: 'Страница {page}',
  checkedAt: 'Обновлено {time}',
};
