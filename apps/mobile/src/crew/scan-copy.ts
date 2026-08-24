import type { Lang } from '@restaurant/surfaces/crew/data';

/**
 * The scanner's own sentences — the ones a camera needs and a web page does not.
 *
 * `@restaurant/surfaces/crew/copy` carries everything the design drew:
 * `scanTitle`, `scanHint`, `scanFound`, `scanUnknown`, `finish`, `countSaved`.
 * All of that is still read from there. What is missing from it is missing for
 * a structural reason rather than an oversight — the design was drawn as a web
 * page, and a web page has no camera permission to be refused, no simulator
 * with no camera in it, and no lens to fail to open. Those states exist only in
 * a binary, so their words live beside the binary's screen.
 *
 * They would move to the shared catalogue the day a browser build grows a
 * decoder. Until then a key there would be a key no web screen ever prints.
 */
type Line = Readonly<Record<Lang, string>>;

const LINES: Readonly<Record<string, Line>> = {
  /* ------------------------------------------------------------ permission */

  /*
   * Asked with a sentence in front of it, never on mount.
   *
   * iOS raises this prompt once per install and never again. Spending it the
   * instant a screen appears, before the person knows what the camera is for,
   * is how an app collects a permanent refusal — and then the only way back is
   * a trip to Settings that most people never make.
   */
  allowTitle: { uz: 'Kamera kerak', ru: 'Нужна камера', en: 'The camera is needed' },
  allowBody: {
    uz: 'Shtrix-kodni o‘qish uchun kamera ochiladi. Surat saqlanmaydi va hech qayerga yuborilmaydi.',
    ru: 'Камера откроется, чтобы считать штрих-код. Снимки не сохраняются и никуда не отправляются.',
    en: 'The camera opens to read the barcode. Nothing is photographed, saved or sent anywhere.',
  },
  allow: { uz: 'Kameraga ruxsat berish', ru: 'Разрешить камеру', en: 'Allow the camera' },

  deniedTitle: { uz: 'Kamera yopiq', ru: 'Камера закрыта', en: 'The camera is blocked' },
  deniedBody: {
    uz: 'Telefon boshqa so‘ramaydi. Sozlamalardan ruxsat bering yoki kodni qo‘lda kiriting.',
    ru: 'Телефон больше не спросит. Разрешите в настройках или введите код вручную.',
    en: 'The phone will not ask again. Allow it in Settings, or type the code in by hand.',
  },
  settings: { uz: 'Sozlamalarni ochish', ru: 'Открыть настройки', en: 'Open Settings' },

  /* ---------------------------------------------------------- no camera */

  /*
   * A simulator, or a handset whose lens the OS would not hand over.
   *
   * Told apart from a refused permission because the way out is different:
   * nobody can grant a camera that is not there, and the only useful control is
   * the keyboard. A screen that offered "allow" here would be a button that
   * does nothing, forever.
   */
  noCameraTitle: {
    uz: 'Kamera ochilmadi',
    ru: 'Камера не открылась',
    en: 'The camera did not open',
  },
  noCameraBody: {
    uz: 'Bu qurilmada kamera yo‘q yoki band. Kodni qo‘lda kiriting.',
    ru: 'На этом устройстве нет камеры или она занята. Введите код вручную.',
    en: 'This device has no camera, or it is in use. Type the code in instead.',
  },

  /* -------------------------------------------------------- manual entry */

  typeIt: { uz: 'Kodni qo‘lda kiritish', ru: 'Ввести код вручную', en: 'Type the code' },
  typeLabel: { uz: 'Shtrix-kod', ru: 'Штрих-код', en: 'Barcode' },
  look: { uz: 'Qidirish', ru: 'Найти', en: 'Look it up' },
  useCamera: { uz: 'Kameraga qaytish', ru: 'Вернуться к камере', en: 'Back to the camera' },

  /* -------------------------------------------------------------- lookup */

  looking: { uz: 'Qidirilmoqda…', ru: 'Идёт поиск…', en: 'Looking it up…' },
  /*
   * A network failure, and it is NOT the same sentence as "no such code".
   *
   * A stockroom is the one room in a restaurant where the signal dies, so this
   * is the ordinary failure here rather than the rare one. Told that a code is
   * unknown when the truth is that the request never left the building, a
   * storekeeper writes the item off as unregistered and books the delivery
   * against nothing.
   */
  offline: {
    uz: 'Serverga ulanib bo‘lmadi. Kod o‘qildi — qayta urinib ko‘ring.',
    ru: 'Нет связи с сервером. Код считан — попробуйте ещё раз.',
    en: 'Could not reach the server. The code was read — try again.',
  },
  refused: {
    uz: 'Omborni ko‘rishga ruxsat yo‘q. Menejerga ayting.',
    ru: 'Нет доступа к складу. Скажите менеджеру.',
    en: 'No permission to read the store. Tell a manager.',
  },
  retry: { uz: 'Qayta urinish', ru: 'Повторить', en: 'Try again' },

  /* --------------------------------------------------------------- lines */

  onHand: { uz: 'Tizimda', ru: 'В системе', en: 'On the books' },
  /** The field the storekeeper types into. Always in the unit written on the box. */
  countLabel: { uz: 'Sanalgan miqdor', ru: 'Посчитано', en: 'Counted' },
  /*
   * The typed figure echoed in base units, under the field.
   *
   * The one guard against the mistake that matters: `5` kilos is `5 000` grams
   * and the ledger holds grams, so an inverted factor would post a write-off of
   * an entire shelf. The person is shown the number that will actually be sent
   * before they can send it.
   */
  asBase: { uz: '{n} {unit} yoziladi', ru: 'Запишется {n} {unit}', en: 'Records {n} {unit}' },
  low: { uz: 'Kam qoldi', ru: 'Мало осталось', en: 'Running low' },
  /*
   * The variance, shown only once a figure has been typed — see the screen's
   * docblock for why the book quantity stays hidden until then.
   */
  varianceUp: {
    uz: 'Ortiq chiqdi: +{n} {unit}',
    ru: 'Излишек: +{n} {unit}',
    en: 'Over by {n} {unit}',
  },
  varianceDown: {
    uz: 'Kam chiqdi: −{n} {unit}',
    ru: 'Недостача: −{n} {unit}',
    en: 'Short by {n} {unit}',
  },
  varianceNone: { uz: 'Tizim bilan bir xil', ru: 'Совпадает с системой', en: 'Matches the books' },
  already: {
    uz: 'Bu pozitsiya ro‘yxatda bor — miqdorni o‘zgartiring',
    ru: 'Эта позиция уже в списке — измените количество',
    en: 'That line is already on the list — change the quantity instead',
  },
  remove: { uz: 'O‘chirish', ru: 'Убрать', en: 'Remove' },
  keep: { uz: 'Ro‘yxatga qo‘shish', ru: 'Добавить в список', en: 'Add to the list' },
  /** How many lines are waiting to be saved. */
  waiting: { uz: '{n} pozitsiya sanaldi', ru: 'Посчитано позиций: {n}', en: '{n} lines counted' },
  empty: {
    uz: 'Hali hech narsa o‘qilmadi',
    ru: 'Пока ничего не считано',
    en: 'Nothing has been read yet',
  },
  /*
   * Where a saved count actually goes, said plainly.
   *
   * It joins the phone's queue rather than posting on the spot, which is the
   * whole reason the staff app has a queue: the walk-in freezer has no signal
   * and the count has to survive being taken there. `drain()` hands it over as
   * `count_submit`, and the queue screen shows it until the server has it.
   */
  queued: {
    uz: 'Sanoq navbatga qo‘shildi — aloqa tiklanganda yuboriladi.',
    ru: 'Пересчёт поставлен в очередь — уйдёт, как только появится связь.',
    en: 'The count is queued — it goes as soon as there is a connection.',
  },
};

export const scanWord = (key: string, lang: Lang): string => {
  const line = LINES[key];

  return line === undefined ? '' : line[lang];
};

/** `'{n} lines counted'` with its one number. */
export const fillScan = (template: string, values: Readonly<Record<string, string | number>>) =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = values[key];

    return value === undefined ? whole : String(value);
  });
