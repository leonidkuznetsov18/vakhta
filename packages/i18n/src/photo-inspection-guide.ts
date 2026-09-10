import type { SectionGuide } from './messages.js';

export const inspectionGuideUk: SectionGuide = {
  title: 'Перевірка фото',
  purpose:
    'Допоможіть системі зрозуміти, як має виглядати робоче місце після зміни. Ви позначаєте на фото видимі проблеми та описуєте їх. Так ми збираємо перевірені приклади для майбутнього автоматичного пошуку проблем; зараз остаточну оцінку дає людина.',
  steps: [
    'Відкрийте «Чистота і передача», розгорніть звіт і натисніть на фото. Перегляньте його повністю; за потреби натисніть «Збільшити».',
    'У «Вимоги до цього робочого місця» запишіть відомі правила: наприклад, «Після зміни стіл має бути порожнім, інструменти — на панелі». Не вигадуйте вимог, яких немає.',
    'Якщо бачите проблему, оберіть «Прямокутник» і обведіть її, або «Багатокутник» — натискайте на вершини та замкніть контур. Для кожної області виберіть категорію та запишіть у «Що не так» конкретне спостереження: «Брудна ганчірка залишена на столі».',
    'Оберіть результат: «Є проблеми» — позначили недоліки; «Проблем не знайдено» — перевірили видиму зону й недоліків немає; «Не можна оцінити» — поясніть, чого не видно. Якщо перевірку ще не завершено, залиште «Ще не перевірено».',
    'Натисніть «Зберегти перевірку». Фото не змінюється: окремо зберігаються області, ваші описи та результат. Перед переходом до іншого фото збережіть зміни.',
    'За бажанням натисніть «Аналізувати з Gemma 4» після збереження коментаря, вимог або описаної області. Прочитайте припущення AI. Лише правильні додайте кнопкою «Додати до моєї розмітки», виправте неточності й збережіть перевірку ще раз.',
  ],
  faq: [
    {
      q: 'Що таке розмітка або анотація фото?',
      a: 'Це область на фото плюс короткий опис того, що ви бачите. Наприклад, рамка навколо ганчірки та текст «Брудна ганчірка на столі». Оригінал фото залишається незмінним.',
    },
    {
      q: 'Для чого витрачати час на ці позначки?',
      a: 'Саме фото не пояснює, що вважати проблемою на вашому робочому місці. Позначки дають перевірені приклади. Мета — згодом навчити й перевірити модель, яка сама знаходить та описує проблеми й зменшує ручну перевірку.',
    },
    {
      q: 'Модель навчається після кожного збереження?',
      a: 'Ні. Зараз ми накопичуємо перевірені дані, а Gemma 4 дає підказки як уже готова модель. Відбір прикладів, навчання та оцінка точності будуть окремим етапом. Завантаження фото саме по собі не навчає модель.',
    },
    {
      q: 'Що саме обводити: предмет чи всю фотографію?',
      a: 'Обводьте конкретний предмет або забруднену ділянку, залишаючи мінімум зайвого фону. Для різних проблем створюйте окремі області. Прямокутника зазвичай достатньо; багатокутник корисний для нерівної ділянки бруду.',
    },
    {
      q: 'Як написати хороший коментар?',
      a: 'Пишіть, що видно і де: «Пил на нижній полиці», «Ключ залишено в зоні, яка має бути вільною». Не пишіть лише «погано» або «не прибрали» й не приписуйте людині наміри. Якщо категорія не підходить, оберіть «Інша проблема».',
    },
    {
      q: 'Інструмент на фото — це завжди проблема?',
      a: 'Ні. Важливе правило для цієї зони. На робочій панелі інструмент може бути на своєму місці, а на столі, який має бути порожнім, — порушувати вимогу. Опишіть правило в полі вимог.',
    },
    {
      q: 'Що робити з чистим фото без проблем?',
      a: 'Перегляньте всю доступну зону, оберіть «Проблем не знайдено» та збережіть. Області не потрібні. Такі приклади потрібні нарівні з проблемними. Порожня розмітка зі статусом «Ще не перевірено» не означає чисте робоче місце.',
    },
    {
      q: 'Фото темне, розмите або стан обладнання незрозумілий. Що обрати?',
      a: 'Оберіть «Не можна оцінити» й поясніть причину: «Не видно підлогу» або «Індикатор живлення не читається». Не робіть висновок про вимкнення чи безпечність станка лише тому, що не видно ознак роботи. За потреби потрібне краще фото або інша перевірка.',
    },
    {
      q: 'Чому кнопка аналізу вимкнена?',
      a: 'Додайте й збережіть хоча б коментар, вимоги або опис області. Самі пробіли не рахуються. Кнопка також недоступна під час збереження, незбережених змін або вже запущеного аналізу. Наведіть на неї курсор для підказки.',
    },
    {
      q: 'Чи можна довіряти висновку AI без перевірки?',
      a: 'Ні. AI може пропустити проблему, помилково назвати нормальний предмет порушенням або неточно обвести область. Зіставте кожну підказку з фото та правилами. Не додавайте хибні висновки; правильні виправте за потреби та збережіть самостійно.',
    },
    {
      q: 'AI не намалював область або аналіз не завершився.',
      a: 'Якщо координат немає, позначте видиму проблему вручну. При помилці спробуйте пізніше; ручна перевірка залишається доступною. Ліміт — 5 аналізів одного фото і 200 загалом за 24 години. Збережені людські описи не зникають через помилку AI.',
    },
    {
      q: 'Збереження розмітки схвалює звіт або впливає на бали?',
      a: 'Ні. Перевірка фото для набору прикладів — окремий запис. Рішення «Схвалити» або «Зауваження» в самому звіті виконується окремо. Розмітка не надсилає працівнику повідомлення й не змінює бали.',
    },
    {
      q: 'Чи потрібно майстру експортувати файли щодня?',
      a: 'Ні. Після «Зберегти перевірку» дані вже в системі. Експорт потрібен відповідальному за підготовку навчального набору: він отримує опис областей і посилання на оригінал. Неперевірені фото не стають навчальними прикладами автоматично.',
    },
    {
      q: 'Що робити, якщо фото не завантажується або перевірку змінив колега?',
      a: 'Для фото натисніть «Оновити», щоб отримати нове посилання. При конфлікті ваш текст залишається у формі: за потреби скопіюйте його, завантажте останню версію й внесіть зміни повторно. Не закривайте форму з незбереженими змінами.',
    },
  ],
  video: {
    url: '/guides/photo-inspection.uk.mp4',
    description: 'Пояснення також є текстом у FAQ. На телефоні розгорніть відео на весь екран.',
    label: 'Відеопояснення за 1 хвилину (без звуку)',
  },
  document: { url: '/guides/photo-inspection.uk.html', label: 'Відкрити повну інструкцію' },
};

export const inspectionGuideEn: SectionGuide = {
  title: 'Photo inspection',
  purpose:
    'Help the system understand how a workplace should look after a shift. Mark visible problems and describe them. These verified examples support future automatic problem detection; a person makes the final assessment today.',
  steps: [
    'Open Cleanliness and handover, expand a report and select a photo. Inspect the whole image; use Zoom in when needed.',
    'Enter known rules in Workplace requirements, such as “The table must be clear after the shift; tools belong on the panel.” Do not invent rules.',
    'For a visible problem, choose Rectangle and drag around it, or choose Polygon, click its corners and close the outline. Select a category and describe each region in What is wrong, for example “Dirty rag left on the table.”',
    'Choose the outcome: Problems found for marked issues; No problems found after inspecting the visible area; Not assessable with an explanation of missing evidence. Leave Not reviewed if your inspection is incomplete.',
    'Select Save review. The original photo is unchanged; regions, descriptions and your outcome are saved separately. Save before moving to another photo.',
    'Optionally select Analyze with Gemma 4 after saving a comment, requirements or a described region. Read its suggestions. Use Add to my annotations only for correct findings, correct any inaccuracies and save the review again.',
  ],
  faq: [
    {
      q: 'What is a photo annotation?',
      a: 'A region on a photo with a short description of what you see. For example, a box around a rag and “Dirty rag on the table.” The original image stays unchanged.',
    },
    {
      q: 'Why spend time adding these marks?',
      a: 'An image alone does not explain your workplace rules. Human labels provide verified examples. The goal is to train and evaluate a model that finds and describes problems automatically and reduces manual review.',
    },
    {
      q: 'Does the model learn after every save?',
      a: 'No. We are collecting verified data; Gemma 4 currently provides suggestions as an existing model. Selecting examples, training and measuring accuracy are separate future steps. Uploading an image does not train the model by itself.',
    },
    {
      q: 'Should I outline an object or the whole image?',
      a: 'Mark the specific object or dirty area with as little unrelated background as possible. Use separate regions for separate problems. A rectangle is usually enough; polygons help with irregular dirty areas.',
    },
    {
      q: 'What makes a useful comment?',
      a: 'State what is visible and where: “Dust on the lower shelf” or “Wrench left in an area that must stay clear.” Avoid only “bad” or “not cleaned,” and do not infer someone’s intentions. Use Other problem when no category fits.',
    },
    {
      q: 'Is a visible tool always a problem?',
      a: 'No. The rule for that area matters. A tool may belong on its panel but violate a clear-table rule. Describe the known rule in Workplace requirements.',
    },
    {
      q: 'What if the photo shows no problems?',
      a: 'Inspect the whole visible area, choose No problems found and save. No regions are needed. Normal examples matter alongside problematic ones. Empty annotations marked Not reviewed do not mean the workplace is clean.',
    },
    {
      q: 'What if the image is dark, blurred or equipment state is unclear?',
      a: 'Choose Not assessable and explain: “Floor not visible” or “Power indicator unreadable.” Do not infer that equipment is off or safe just because no activity is visible. A better image or another check may be needed.',
    },
    {
      q: 'Why is Analyze disabled?',
      a: 'Add and save at least a comment, requirements or a region description. Whitespace does not count. The action is also unavailable while saving, while changes are unsaved or during an active analysis. Hover over it for an explanation.',
    },
    {
      q: 'Can I trust AI without checking?',
      a: 'No. AI may miss a problem, flag an allowed object or locate a region poorly. Compare each suggestion against the photo and rules. Do not copy false findings; correct useful ones and save them yourself.',
    },
    {
      q: 'AI did not locate a region or analysis failed.',
      a: 'Mark the visible problem manually when coordinates are missing. Retry later after an error; manual inspection remains available. Limits are 5 analyses per photo and 200 in total per 24 hours. AI failure does not erase saved human descriptions.',
    },
    {
      q: 'Does saving annotations approve the handover or affect scores?',
      a: 'No. Dataset photo review is separate. Approve and Remark on the report remain separate operational actions. Annotations do not send employee messages or change scores.',
    },
    {
      q: 'Must a master export files every day?',
      a: 'No. Save review already stores the data in the system. Export is for the person preparing a training dataset; it supplies region descriptions and access to the original image. Unreviewed photos do not automatically become training examples.',
    },
    {
      q: 'What if an image fails to load or another reviewer changes the review?',
      a: 'Use Refresh to get a new image link. On a conflict, your text remains in the form: copy it if needed, load the latest review and apply your changes again. Do not close a form with unsaved changes.',
    },
  ],
  video: {
    url: '/guides/photo-inspection.en.mp4',
    description: 'The explanations are also written in the FAQ. On a phone, use full screen.',
    label: 'One-minute illustrated explanation (no sound)',
  },
  document: { url: '/guides/photo-inspection.en.html', label: 'Open the full instructions' },
};

export const inspectionGuideRu: SectionGuide = {
  title: 'Проверка фото',
  purpose:
    'Помогите системе понять, как должно выглядеть рабочее место после смены. Отмечайте видимые проблемы и описывайте их. Так мы собираем проверенные примеры для будущего автоматического поиска проблем; сейчас окончательную оценку даёт человек.',
  steps: [
    'Откройте «Чистота и передача», разверните отчёт и нажмите на фото. Просмотрите его целиком; при необходимости нажмите «Увеличить».',
    'В «Требования к рабочему месту» запишите известные правила: например, «После смены стол должен быть пустым, инструменты — на панели». Не придумывайте требований.',
    'Если видите проблему, выберите «Прямоугольник» и обведите её, или «Многоугольник» — нажимайте на вершины и замкните контур. Для каждой области выберите категорию и опишите в «Что не так» конкретное наблюдение: «Грязная тряпка оставлена на столе».',
    'Выберите результат: «Есть проблемы» — отметили недостатки; «Проблем не найдено» — проверили видимую зону и недостатков нет; «Нельзя оценить» — объясните, чего не видно. Если проверка не завершена, оставьте «Ещё не проверено».',
    'Нажмите «Сохранить проверку». Фото не меняется: отдельно сохраняются области, описания и результат. Сохраните изменения перед переходом к другому фото.',
    'При желании нажмите «Анализировать с Gemma 4» после сохранения комментария, требований или описанной области. Прочитайте предположения AI. Только верные добавьте кнопкой «Добавить в мою разметку», исправьте неточности и сохраните проверку ещё раз.',
  ],
  faq: [
    {
      q: 'Что такое разметка или аннотация фото?',
      a: 'Это область на фото и короткое описание того, что вы видите. Например, рамка вокруг тряпки и текст «Грязная тряпка на столе». Исходное фото остаётся неизменным.',
    },
    {
      q: 'Зачем тратить время на эти отметки?',
      a: 'Само фото не объясняет правила вашего рабочего места. Человеческая разметка даёт проверенные примеры. Цель — позже обучить и проверить модель, которая сама находит и описывает проблемы и сокращает ручную проверку.',
    },
    {
      q: 'Модель обучается после каждого сохранения?',
      a: 'Нет. Сейчас мы собираем проверенные данные, а Gemma 4 даёт подсказки как готовая модель. Отбор примеров, обучение и оценка точности — отдельный будущий этап. Загрузка фото сама по себе не обучает модель.',
    },
    {
      q: 'Что обводить: предмет или всю фотографию?',
      a: 'Обводите конкретный предмет или загрязнённый участок, оставляя минимум лишнего фона. Для разных проблем создавайте отдельные области. Обычно достаточно прямоугольника; многоугольник удобен для неровного участка грязи.',
    },
    {
      q: 'Как написать полезный комментарий?',
      a: 'Пишите, что видно и где: «Пыль на нижней полке», «Ключ оставлен в зоне, которая должна быть пустой». Избегайте только «плохо» или «не убрали» и не приписывайте человеку намерения. Если категория не подходит, выберите «Другая проблема».',
    },
    {
      q: 'Инструмент на фото — всегда проблема?',
      a: 'Нет. Важно правило этой зоны. На панели инструмент может быть на своём месте, а на столе, который должен быть пустым, — нарушать требование. Опишите известное правило в поле требований.',
    },
    {
      q: 'Что делать с чистым фото без проблем?',
      a: 'Просмотрите всю видимую зону, выберите «Проблем не найдено» и сохраните. Области не нужны. Нормальные примеры важны наравне с проблемными. Пустая разметка со статусом «Ещё не проверено» не означает чистое рабочее место.',
    },
    {
      q: 'Фото тёмное, размытое или состояние оборудования непонятно. Что выбрать?',
      a: 'Выберите «Нельзя оценить» и объясните: «Не видно пол» или «Индикатор питания не читается». Не делайте вывод о выключении или безопасности станка только потому, что не видно работы. Может потребоваться лучшее фото или другая проверка.',
    },
    {
      q: 'Почему кнопка анализа выключена?',
      a: 'Добавьте и сохраните хотя бы комментарий, требования или описание области. Пробелы не считаются. Кнопка также недоступна при сохранении, несохранённых изменениях или уже запущенном анализе. Наведите курсор для подсказки.',
    },
    {
      q: 'Можно ли доверять AI без проверки?',
      a: 'Нет. AI может пропустить проблему, ошибочно назвать допустимый предмет нарушением или неточно выделить область. Сравните каждую подсказку с фото и правилами. Не добавляйте ложные выводы; полезные исправьте и сохраните самостоятельно.',
    },
    {
      q: 'AI не выделил область или анализ не завершился.',
      a: 'Если координат нет, отметьте видимую проблему вручную. При ошибке попробуйте позже; ручная проверка остаётся доступной. Лимит — 5 анализов одного фото и 200 всего за 24 часа. Ошибка AI не удаляет сохранённые человеческие описания.',
    },
    {
      q: 'Сохранение разметки одобряет отчёт или влияет на баллы?',
      a: 'Нет. Проверка фото для набора примеров — отдельная запись. Решения «Одобрить» или «Замечание» в отчёте выполняются отдельно. Разметка не отправляет сообщения сотруднику и не меняет баллы.',
    },
    {
      q: 'Нужно ли мастеру экспортировать файлы каждый день?',
      a: 'Нет. После «Сохранить проверку» данные уже в системе. Экспорт нужен ответственному за подготовку обучающего набора: он получает описания областей и доступ к оригиналу. Непроверенные фото не становятся обучающими примерами автоматически.',
    },
    {
      q: 'Что делать, если фото не загружается или проверку изменил коллега?',
      a: 'Для фото нажмите «Обновить», чтобы получить новую ссылку. При конфликте ваш текст остаётся в форме: при необходимости скопируйте его, загрузите последнюю версию и внесите изменения повторно. Не закрывайте форму с несохранёнными изменениями.',
    },
  ],
  video: {
    url: '/guides/photo-inspection.ru.mp4',
    description: 'Объяснения также есть текстом в FAQ. На телефоне разверните видео на весь экран.',
    label: 'Видеообъяснение за 1 минуту (без звука)',
  },
  document: { url: '/guides/photo-inspection.ru.html', label: 'Открыть полную инструкцию' },
};
