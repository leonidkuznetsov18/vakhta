import type { SectionGuide } from './messages.js';

export const inspectionGuideUk: SectionGuide = {
  title: 'Перевірка фото',
  purpose:
    'Допоможіть системі зрозуміти, як має виглядати робоче місце після зміни. Ви позначаєте на фото видимі проблеми та описуєте їх. Так ми збираємо перевірені приклади для майбутнього автоматичного пошуку проблем; зараз остаточну оцінку дає людина.',
  steps: [
    'Відкрийте «Чистота і передача», розгорніть звіт і натисніть на фото. Перегляньте його повністю; за потреби натисніть «Збільшити».',
    'За потреби розгорніть «Правила перевірки»: це список із чекліста, включно з уточненнями й дозволеними винятками.',
    'Якщо бачите проблему, оберіть «Прямокутник» і обведіть її, або «Багатокутник» — натискайте на вершини та замкніть контур. У «Що позначено» оберіть назву з чекліста або впишіть свою. Одна область — один предмет або однорідна проблема. «Додати деталі» потрібне лише для додаткового пояснення.',
    'Оберіть результат: «Є проблеми» — позначили недоліки; «Проблем не знайдено» — перевірили видиму зону й недоліків немає; «Не можна оцінити» — поясніть, чого не видно. Якщо перевірку ще не завершено, залиште «Ще не перевірено».',
    'Натисніть «Зберегти зміни». Фото не змінюється: окремо зберігаються області, ваші описи та результат. Перед переходом до іншого фото збережіть зміни. Після збереження біля фото з’явиться позначка, а незавершена перевірка позначатиметься окремо.',
    'За бажанням натисніть «Аналізувати з AI» навіть до збереження чи заповнення полів. Прочитайте припущення AI. Лише правильні додайте кнопкою «Додати до моєї розмітки», виправте неточності й збережіть перевірку ще раз.',
  ],
  faq: [
    {
      q: 'Як працює автоматична перевірка та Master Review?',
      a: 'Майстер задає список заборонених предметів для чекліста й зони. Після надсилання звіту AI перевіряє фото та готує рамки. У Master Review перевірте кожне фото, виправте або видаліть хибні знахідки, оберіть результат і збережіть. Тоді можна завершити перевірку звіту. Навіть якщо AI нічого не знайшов або сталася помилка, потрібен огляд людини.',
    },
    {
      q: 'Що таке розмітка або анотація фото?',
      a: 'Це область на фото та назва предмета чи проблеми. Наприклад, рамка навколо ганчірки й назва «Ганчірки» з чекліста. Деталі необов’язкові; координати й назву не потрібно повторювати в описі. Оригінал фото залишається незмінним.',
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
      a: 'Пишіть, що видно і де: «Пил на нижній полиці», «Ключ залишено в зоні, яка має бути вільною». Не пишіть лише «погано» або «не прибрали» й не приписуйте людині наміри.',
    },
    {
      q: 'Інструмент на фото — це завжди проблема?',
      a: 'Ні. Важливе правило для цієї зони. На робочій панелі інструмент може бути на своєму місці, а на столі, який має бути порожнім, — порушувати вимогу. Перевірте список заборонених предметів для цієї зони в чеклісті.',
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
      a: 'AI доступний без попереднього збереження й навіть із порожніми полями. Він враховує список предметів із чекліста для цієї зони та не зберігає вашу перевірку автоматично. Кнопка тимчасово недоступна під час збереження або вже запущеного аналізу.',
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
      a: 'Ні. Після «Зберегти зміни» дані вже в системі. Експорт потрібен відповідальному за підготовку навчального набору: він отримує опис областей і посилання на оригінал. Неперевірені фото не стають навчальними прикладами автоматично.',
    },
    {
      q: 'Що робити, якщо фото не завантажується або перевірку змінив колега?',
      a: 'Для фото натисніть «Оновити», щоб отримати нове посилання. При конфлікті ваш текст залишається у формі: за потреби скопіюйте його, завантажте останню версію й внесіть зміни повторно. Не закривайте форму з незбереженими змінами.',
    },
    {
      q: 'Як видалити область?',
      a: 'Виберіть область на фото або в списку. Натисніть «Видалити вибрану область» над фото або «Видалити область» у її картці. Також працюють Backspace і Delete, коли ви не вводите текст у полі. Видалення ще потрібно зберегти; після нього знову оберіть результат перевірки.',
    },
    {
      q: 'Як збільшувати й переміщувати фото?',
      a: 'Коліщатко миші змінює масштаб навколо курсора від 100% до 500%. Переміщення доступне одразу: тягніть вільну від областей ділянку фото мишею або одним пальцем, а двома пальцями змінюйте масштаб. Середня кнопка миші переміщує фото в будь-якому режимі. Клацніть область для редагування. Прямокутник і багатокутник вмикають малювання; після створення області переміщення знову доступне. Кнопки масштабу й прокручування з клавіатури залишаються доступними.',
    },
    {
      q: 'Чому додана пропозиція AI зникла?',
      a: 'Її вже додано до вашої розмітки, тому повторне додавання недоступне. Редагуйте область у списку. Якщо видалите її, початкова пропозиція повернеться до списку AI. Збережіть зміни, щоб зберегти результат.',
    },
    {
      q: 'Для чого загальна примітка до фото?',
      a: 'Для пояснення результату всього огляду, наприклад «Фото темне, стан підлоги не видно». Вона необов’язкова, крім результату «Не можна оцінити», коли потрібна причина. Натисніть «Додати примітку до фото», якщо потрібен загальний контекст. Для «Не можна оцінити» поле причини відкриється автоматично. Знахідки називайте й уточнюйте лише біля областей. Це примітка майстра, а не інструкція для AI.',
    },
    {
      q: 'Де змінити список предметів для AI?',
      a: 'У налаштуваннях чекліста виберіть потрібну зону та збережіть список предметів. У редакторі фото він показується для довідки. Ручний аналіз не потребує попереднього збереження розмітки.',
    },
    {
      q: 'Як зіставити область з описом?',
      a: 'Номер на фото відповідає номеру у списку. Натисніть область або її номер у списку: обидва виділяться зеленим, а список прокрутиться до опису. Назви кнопок над фото показуються при наведенні або фокусі з клавіатури.',
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
    'Open Inspection rules when needed to see checklist names, clarifications and allowed exceptions.',
    'For a visible problem, choose Rectangle and drag around it, or choose Polygon, click its corners and close the outline. In What is marked, choose a checklist name or enter your own. Mark one object or one consistent problem per region. Use Add details only for extra context.',
    'Choose the outcome: Problems found for marked issues; No problems found after inspecting the visible area; Not assessable with an explanation of missing evidence. Leave Not reviewed if your inspection is incomplete.',
    'Select Save changes. The original photo is unchanged; regions, descriptions and your outcome are saved separately. Save before moving to another photo. A marker beside the photo shows saved work and distinguishes an unfinished review.',
    'Optionally select Analyze with AI even before saving or filling in fields. Read its suggestions. Use Add to my annotations only for correct findings, correct any inaccuracies and save the review again.',
  ],
  faq: [
    {
      q: 'How do automatic analysis and Master Review work?',
      a: 'The master configures prohibited objects for a checklist and zone. After submission AI inspects the photos and proposes boxes. In Master Review, inspect each photo, correct or delete mistaken findings, choose an outcome and save. Then finish the report review. A person must review even when AI finds nothing or fails.',
    },
    {
      q: 'What is a photo annotation?',
      a: 'A region on a photo with the name of an object or problem. For example, a box around a rag with the checklist name Rags. Details are optional; do not repeat the name or coordinates in prose. The original image stays unchanged.',
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
      a: 'State what is visible and where: “Dust on the lower shelf” or “Wrench left in an area that must stay clear.” Avoid only “bad” or “not cleaned,” and do not infer someone’s intentions.',
    },
    {
      q: 'Is a visible tool always a problem?',
      a: 'No. The rule for that area matters. A tool may belong on its panel but violate a clear-table rule. Check the prohibited-item list for this zone in the checklist.',
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
      a: 'AI is available before saving and with empty fields. It uses the checklist object list for this zone and does not automatically save your review. The button is temporarily unavailable while saving or while an analysis is running.',
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
      a: 'No. Save changes already stores the data in the system. Export is for the person preparing a training dataset; it supplies region descriptions and access to the original image. Unreviewed photos do not automatically become training examples.',
    },
    {
      q: 'What if an image fails to load or another reviewer changes the review?',
      a: 'Use Refresh to get a new image link. On a conflict, your text remains in the form: copy it if needed, load the latest review and apply your changes again. Do not close a form with unsaved changes.',
    },
    {
      q: 'How do I delete a region?',
      a: 'Select a region on the photo or in the list. Use Delete selected region above the photo or Delete region in its card. Backspace and Delete also work when you are not editing a field. Save the deletion and choose the review outcome again.',
    },
    {
      q: 'How do I zoom and pan the photo?',
      a: 'The mouse wheel zooms around the cursor from 100% to 500%. Panning is available immediately: drag an unmarked part of the photo with the mouse or one finger, or pinch with two fingers. The middle mouse button pans in any mode. Click a region to edit it. Rectangle and Polygon enable drawing; panning resumes after creating a region. Zoom buttons and keyboard scrolling remain available.',
    },
    {
      q: 'Why did an AI suggestion disappear after adding it?',
      a: 'It is already in your annotations, so it cannot be added again. Edit its region in the list. Deleting that region returns the original suggestion to the AI list. Save changes to persist the result.',
    },
    {
      q: 'What is the general photo note for?',
      a: 'Explain the overall review outcome, for example “The photo is dark; the floor is not visible.” It is optional except for Not assessable, which requires a reason. Use Add a photo note for general context. Not assessable opens the reason automatically. Name and clarify individual findings only beside their regions. This is the reviewer’s note, not an instruction for AI.',
    },
    {
      q: 'Where can I change the object list for AI?',
      a: 'In checklist settings, select the zone and save its object list. The photo editor displays that list for reference. Manual analysis does not require saving annotations first.',
    },
    {
      q: 'How do I match a region to its description?',
      a: 'The photo number matches the list number. Select a region or its numbered list entry: both turn green and the list scrolls to the description. Toolbar names appear on hover or keyboard focus.',
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
    'При необходимости раскройте «Правила проверки»: список из чек-листа с уточнениями и допустимыми исключениями.',
    'Если видите проблему, выберите «Прямоугольник» и обведите её, или «Многоугольник» — нажимайте на вершины и замкните контур. В «Что отмечено» выберите название из чек-листа или введите своё. Одна область — один предмет или однородная проблема. «Добавить детали» нужно только для дополнительного пояснения.',
    'Выберите результат: «Есть проблемы» — отметили недостатки; «Проблем не найдено» — проверили видимую зону и недостатков нет; «Нельзя оценить» — объясните, чего не видно. Если проверка не завершена, оставьте «Ещё не проверено».',
    'Нажмите «Сохранить изменения». Фото не меняется: отдельно сохраняются области, описания и результат. Сохраните изменения перед переходом к другому фото. После сохранения у фото появится отметка; незавершённая проверка обозначается отдельно.',
    'При желании нажмите «Анализировать с AI» даже до сохранения или заполнения полей. Прочитайте предположения AI. Только верные добавьте кнопкой «Добавить в мою разметку», исправьте неточности и сохраните проверку ещё раз.',
  ],
  faq: [
    {
      q: 'Как работают автоматическая проверка и Master Review?',
      a: 'Мастер задаёт запрещённые предметы для чек-листа и зоны. После отправки отчёта AI проверяет фото и предлагает рамки. В Master Review проверьте каждое фото, исправьте или удалите ошибочные находки, выберите результат и сохраните. Затем завершите проверку отчёта. Осмотр человека нужен даже при пустом результате или ошибке AI.',
    },
    {
      q: 'Что такое разметка или аннотация фото?',
      a: 'Это область на фото и название предмета или проблемы. Например, рамка вокруг тряпки и название «Тряпки» из чек-листа. Детали необязательны; название и координаты не нужно повторять в описании. Исходное фото остаётся неизменным.',
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
      a: 'Пишите, что видно и где: «Пыль на нижней полке», «Ключ оставлен в зоне, которая должна быть пустой». Избегайте только «плохо» или «не убрали» и не приписывайте человеку намерения.',
    },
    {
      q: 'Инструмент на фото — всегда проблема?',
      a: 'Нет. Важно правило этой зоны. На панели инструмент может быть на своём месте, а на столе, который должен быть пустым, — нарушать требование. Проверьте список запрещённых предметов для этой зоны в чек-листе.',
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
      a: 'AI доступен до сохранения и даже с пустыми полями. Он учитывает список предметов из чек-листа для этой зоны и не сохраняет вашу проверку автоматически. Кнопка временно недоступна при сохранении или уже запущенном анализе.',
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
      a: 'Нет. После «Сохранить изменения» данные уже в системе. Экспорт нужен ответственному за подготовку обучающего набора: он получает описания областей и доступ к оригиналу. Непроверенные фото не становятся обучающими примерами автоматически.',
    },
    {
      q: 'Что делать, если фото не загружается или проверку изменил коллега?',
      a: 'Для фото нажмите «Обновить», чтобы получить новую ссылку. При конфликте ваш текст остаётся в форме: при необходимости скопируйте его, загрузите последнюю версию и внесите изменения повторно. Не закрывайте форму с несохранёнными изменениями.',
    },
    {
      q: 'Как удалить область?',
      a: 'Выберите область на фото или в списке. Нажмите «Удалить выбранную область» над фото или «Удалить область» в её карточке. Backspace и Delete также работают, когда вы не вводите текст в поле. Удаление нужно сохранить; после него снова выберите результат проверки.',
    },
    {
      q: 'Как увеличивать и перемещать фото?',
      a: 'Колёсико мыши меняет масштаб вокруг курсора от 100% до 500%. Перемещение доступно сразу: тяните свободный от областей участок фото мышью или одним пальцем, а двумя пальцами меняйте масштаб. Средняя кнопка мыши перемещает фото в любом режиме. Нажмите на область для редактирования. Прямоугольник и многоугольник включают рисование; после создания области перемещение снова доступно. Кнопки масштаба и прокрутка с клавиатуры остаются доступны.',
    },
    {
      q: 'Почему добавленное предложение AI исчезло?',
      a: 'Оно уже добавлено в вашу разметку, поэтому повторное добавление недоступно. Редактируйте область в списке. Если удалить её, исходное предложение вернётся в список AI. Сохраните изменения, чтобы сохранить результат.',
    },
    {
      q: 'Для чего общая заметка к фото?',
      a: 'Для пояснения результата всего осмотра, например «Фото тёмное, состояние пола не видно». Она необязательна, кроме результата «Нельзя оценить», когда нужна причина. Нажмите «Добавить заметку к фото», если нужен общий контекст. Для «Нельзя оценить» поле причины откроется автоматически. Находки называйте и уточняйте только возле областей. Это заметка мастера, а не инструкция для AI.',
    },
    {
      q: 'Где изменить список предметов для AI?',
      a: 'В настройках чек-листа выберите зону и сохраните список предметов. В редакторе фото он показан для справки. Ручной анализ не требует предварительного сохранения разметки.',
    },
    {
      q: 'Как сопоставить область с описанием?',
      a: 'Номер на фото соответствует номеру в списке. Нажмите область или её номер в списке: оба выделятся зелёным, а список прокрутится к описанию. Названия кнопок над фото показаны при наведении или фокусе с клавиатуры.',
    },
  ],
  video: {
    url: '/guides/photo-inspection.ru.mp4',
    description: 'Объяснения также есть текстом в FAQ. На телефоне разверните видео на весь экран.',
    label: 'Видеообъяснение за 1 минуту (без звука)',
  },
  document: { url: '/guides/photo-inspection.ru.html', label: 'Открыть полную инструкцию' },
};
