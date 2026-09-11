import type { SectionGuide } from './messages.js';

export const inspectionGuideUk: SectionGuide = {
  title: 'Перевірка фото',
  purpose:
    'Допоможіть системі зрозуміти, як має виглядати робоче місце після зміни. Ви позначаєте на фото видимі проблеми та описуєте їх. Так ми збираємо перевірені приклади для майбутнього автоматичного пошуку проблем; зараз остаточну оцінку дає людина.',
  steps: [
    'Відкрийте «Чистота і передача», розгорніть звіт і натисніть на фото. Перегляньте його повністю; за потреби натисніть «Збільшити».',
    'За потреби розгорніть «Правила перевірки»: це обʼєкти з чекліста для цієї зони та уточнення до них. Саме їх шукає AI.',
    'Якщо бачите обʼєкт, оберіть «Прямокутник» і обведіть його. У «Що позначено» оберіть обʼєкт з чекліста або з каталогу. Одна область — один предмет. Потім оберіть значення: «Порушення», «Дозволено тут» або «Не впевнений». «Додати деталі» потрібне лише для додаткового пояснення.',
    'Результат перевірки визначається сам: є порушення — «Є проблеми», лише дозволені області або жодної — «Проблем не знайдено». Якщо фото не дає змоги оцінити робоче місце, увімкніть «Фото не можна оцінити» й оберіть причину.',
    'Натисніть «Зберегти зміни». Фото не змінюється: окремо зберігаються області, їхнє значення та результат. Чисте фото без областей теж зберігайте: такі приклади потрібні нарівні з проблемними. Чисте фото можна позначити як еталон для цієї точки зйомки.',
    'За бажанням натисніть «Аналізувати з AI»: він шукає лише обʼєкти зі списку чекліста для цієї зони. Правильні підказки додайте кнопкою «Додати до моєї розмітки», хибні відхиліть із причиною: так вимірюється точність моделі. Потім збережіть перевірку.',
  ],
  faq: [
    {
      q: 'Що означає значення області: порушення, дозволено, не впевнений?',
      a: '«Порушення» — обʼєкта тут бути не повинно. «Дозволено тут» — обʼєкт є, але це припустимо, наприклад ганчірка на своєму гачку; такі приклади вчать модель відрізняти виняток від порушення. «Не впевнений» — рішення лишається колезі, фото залишається неперевіреним. Результат фото визначається автоматично за цими значеннями.',
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
      a: 'Обводьте конкретний предмет прямокутником, залишаючи мінімум зайвого фону. Кожен предмет — окрема область: пʼять стаканчиків це пʼять областей. Не обводьте групу однією рамкою.',
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
      a: 'Перегляньте всю доступну зону та натисніть «Зберегти зміни»: без областей фото зберігається як «Проблем не знайдено». Такі приклади потрібні нарівні з проблемними. За бажанням позначте його як еталон для цієї точки зйомки.',
    },
    {
      q: 'Фото темне, розмите або стан обладнання незрозумілий. Що обрати?',
      a: 'Увімкніть «Фото не можна оцінити» й оберіть причину: розмите, темне, не той ракурс, огляд перекрито, не те робоче місце. Не робіть висновок про вимкнення чи безпечність станка лише тому, що не видно ознак роботи. Працівнику потрібне краще фото; це не порушення.',
    },
    {
      q: 'Чому кнопка аналізу вимкнена?',
      a: 'AI доступний без попереднього збереження. Він шукає лише обʼєкти, задані в чеклісті для цієї зони; якщо список порожній, кнопка недоступна, поки майстер не заповнить його. Кнопка також тимчасово недоступна під час збереження або вже запущеного аналізу.',
    },
    {
      q: 'Чи можна довіряти висновку AI без перевірки?',
      a: 'Ні. AI може пропустити обʼєкт, помилково назвати нормальний предмет порушенням або неточно обвести область. Зіставте кожну підказку з фото. Правильні додайте, хибні відхиліть із причиною: «обʼєкта немає», «інший обʼєкт», «дозволено тут» або «рамка не там». Так накопичується оцінка точності моделі.',
    },
    {
      q: 'AI не намалював область або аналіз не завершився.',
      a: 'Якщо координат немає, позначте видиму проблему вручну. При помилці спробуйте пізніше; ручна перевірка залишається доступною. Актуальні ліміти й використання показано біля кнопки «Аналізувати з AI». Якщо кнопка заблокована, підказка пояснює причину. Збережені людські описи не зникають через помилку AI.',
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
      a: 'Коліщатко миші змінює масштаб навколо курсора від 100% до 500%. Переміщення доступне одразу: тягніть вільну від областей ділянку фото мишею або одним пальцем, а двома пальцями змінюйте масштаб. Середня кнопка миші переміщує фото в будь-якому режимі. Клацніть область для редагування. Прямокутник вмикає малювання; після створення області переміщення знову доступне. Кнопки масштабу й прокручування з клавіатури залишаються доступними.',
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
    'Open Inspection rules when needed to see the checklist objects for this zone and their notes. AI searches only for these.',
    'For a visible object, choose Rectangle and drag around it. In What is marked, choose the object from the checklist or the catalog. One object per region. Then choose its meaning: Violation, Allowed here or Unsure. Use Add details only for extra context.',
    'The review outcome follows on its own: any violation means Problems found; only allowed regions or none means No problems found. If the photo does not show the workplace well enough, switch on The photo cannot be assessed and choose a reason.',
    'Select Save changes. The original photo is unchanged; regions, their meaning and the outcome are saved separately. Save clean photos without regions too: such examples matter as much as problems. A clean photo can be marked as the reference for this photo point.',
    'Optionally select Analyze with AI: it searches only for the objects listed in the checklist for this zone. Add correct suggestions with Add to my annotations and reject wrong ones with a reason; that is how model precision is measured. Then save the review.',
  ],
  faq: [
    {
      q: 'What do the region meanings violation, allowed and unsure mean?',
      a: 'Violation: the object must not be here. Allowed here: the object is present but permitted, for example a rag on its hook; such examples teach the model to tell an exception from a violation. Unsure: the decision is left to a colleague and the photo stays unreviewed. The photo outcome follows from these meanings automatically.',
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
      a: 'Inspect the whole visible area and select Save changes: without regions the photo is saved as No problems found. Such examples matter as much as problems. Optionally mark it as the reference for this photo point.',
    },
    {
      q: 'What if the image is dark, blurred or equipment state is unclear?',
      a: 'Switch on The photo cannot be assessed and choose a reason: blurred, too dark, wrong angle, view obstructed, wrong workplace. Do not conclude a machine is off or safe just because no signs of operation are visible. The employee needs a better photo; this is not a violation.',
    },
    {
      q: 'Why is Analyze disabled?',
      a: 'AI is available before saving. It searches only for the objects configured in the checklist for this zone; with an empty list the button stays unavailable until the master fills it in. The button is also unavailable while saving or while an analysis is already running.',
    },
    {
      q: 'Can I trust AI without checking?',
      a: 'No. AI may miss a problem, flag an allowed object or locate a region poorly. Compare each suggestion against the photo and rules. Do not copy false findings; correct useful ones and save them yourself.',
    },
    {
      q: 'AI did not locate a region or analysis failed.',
      a: 'Mark the visible problem manually when coordinates are missing. Retry later after an error; manual inspection remains available. Current limits and usage appear beside Analyze with AI. When the button is disabled, its tooltip explains why. AI failure does not erase saved human descriptions.',
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
    'При необходимости раскройте «Правила проверки»: это объекты из чек-листа для этой зоны и уточнения к ним. Именно их ищет AI.',
    'Если видите объект, выберите «Прямоугольник» и обведите его. В «Что отмечено» выберите объект из чек-листа или из каталога. Одна область — один предмет. Затем выберите значение: «Нарушение», «Разрешено здесь» или «Не уверен». «Добавить детали» нужно только для дополнительного пояснения.',
    'Результат проверки определяется сам: есть нарушение — «Есть проблемы», только разрешённые области или ни одной — «Проблем не найдено». Если фото не позволяет оценить рабочее место, включите «Фото нельзя оценить» и выберите причину.',
    'Нажмите «Сохранить изменения». Фото не меняется: отдельно сохраняются области, их значение и результат. Чистое фото без областей тоже сохраняйте: такие примеры нужны наравне с проблемными. Чистое фото можно отметить как эталон для этой точки съёмки.',
    'При желании нажмите «Анализировать с AI»: он ищет только объекты из списка чек-листа для этой зоны. Правильные подсказки добавьте кнопкой «Добавить в мою разметку», ошибочные отклоните с причиной: так измеряется точность модели. Затем сохраните проверку.',
  ],
  faq: [
    {
      q: 'Что означает значение области: нарушение, разрешено, не уверен?',
      a: '«Нарушение» — объекта здесь быть не должно. «Разрешено здесь» — объект есть, но это допустимо, например тряпка на своём крючке; такие примеры учат модель отличать исключение от нарушения. «Не уверен» — решение остаётся коллеге, фото остаётся непроверенным. Результат фото определяется автоматически по этим значениям.',
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
      a: 'Обводите конкретный предмет прямоугольником, оставляя минимум лишнего фона. Каждый предмет — отдельная область: пять стаканчиков это пять областей. Не обводите группу одной рамкой.',
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
      a: 'Включите «Фото нельзя оценить» и выберите причину: размытое, тёмное, не тот ракурс, обзор перекрыт, не то рабочее место. Не делайте вывод о выключении или безопасности станка только потому, что не видно признаков работы. Работнику нужно лучшее фото; это не нарушение.',
    },
    {
      q: 'Почему кнопка анализа выключена?',
      a: 'AI доступен до сохранения. Он ищет только объекты, заданные в чек-листе для этой зоны; если список пуст, кнопка недоступна, пока мастер не заполнит его. Кнопка также временно недоступна во время сохранения или уже запущенного анализа.',
    },
    {
      q: 'Можно ли доверять AI без проверки?',
      a: 'Нет. AI может пропустить объект, ошибочно назвать нормальный предмет нарушением или неточно обвести область. Сопоставьте каждую подсказку с фото. Правильные добавьте, ошибочные отклоните с причиной: «объекта нет», «другой объект», «разрешено здесь» или «рамка не там». Так накапливается оценка точности модели.',
    },
    {
      q: 'AI не выделил область или анализ не завершился.',
      a: 'Если координат нет, отметьте видимую проблему вручную. При ошибке попробуйте позже; ручная проверка остаётся доступной. Текущие лимиты и использование показаны рядом с кнопкой «Анализировать с AI». Если кнопка заблокирована, подсказка объясняет причину. Ошибка AI не удаляет сохранённые человеческие описания.',
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
      a: 'Колёсико мыши меняет масштаб вокруг курсора от 100% до 500%. Перемещение доступно сразу: тяните свободный от областей участок фото мышью или одним пальцем, а двумя пальцами меняйте масштаб. Средняя кнопка мыши перемещает фото в любом режиме. Нажмите на область для редактирования. Прямоугольник включает рисование; после создания области перемещение снова доступно. Кнопки масштаба и прокрутка с клавиатуры остаются доступны.',
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
