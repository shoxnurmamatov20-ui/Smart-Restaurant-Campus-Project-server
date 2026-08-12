/**
 * The platform console, in Uzbek.
 *
 * This is the authoring catalogue: every key is written here first and the
 * other two languages are typed against it, so a missing Russian string is a
 * type error rather than a blank label somebody notices in production.
 *
 * Where the handoff prototype has a string, its wording is copied exactly —
 * including its Russian and English — rather than re-translated. The screens
 * the prototype never drew are marked and their copy is this codebase's own.
 *
 * Numbers, ids and proper nouns are NOT here. They live in
 * `src/app/(admin)/platform-data.ts`, because a figure repeated in three
 * catalogues is a figure that will disagree with itself.
 */
export const uz = {
  platform: {
    shell: {
      title: 'Super admin',
      product: 'Smart Restaurant Cloud',
      audit: 'Audit rejimi · barcha amallar yoziladi',
      newTenant: "Restoran qo'shish",
      language: 'Til',
      light: "Yorug'",
      dark: "Qorong'i",
      extra: "Qo'shimcha",
    },

    /**
     * The platform door — handoff §3.12, third tab.
     *
     * Word for word the same strings the staff console shows on its own
     * sign-in card, because it is the same door drawn twice and an operator
     * should not meet two different sentences depending on which URL they
     * opened.
     */
    signin: {
      title: 'Platforma operatori',
      sub: 'Smart Restaurant Cloud xodimlari uchun',
      warn: "Har bir kirish jurnalga yoziladi va restoran egasiga ko'rinadi.",
      fieldMail: 'Elektron pochta',
      fieldCode: 'Tasdiqlash kodi',
      enter: 'Kirish',
      signingIn: 'Tekshirilmoqda…',
      note: 'Kod ilovadan olinadi. Sessiya 30 daqiqada avtomatik yopiladi.',
      failed: "Pochta, parol yoki kod noto'g'ri",
      unreachable: "Server javob bermadi. Ulanishni tekshirib, qayta urinib ko'ring.",
      fieldPass: 'Parol',
    },

    nav: {
      overview: 'Umumiy',
      tenants: 'Restoranlar',
      plans: 'Tariflar',
      billing: "To'lovlar",
      devices: 'Terminallar',
      trials: 'Sinov muddati',
      audit: 'Kirish tarixi',
      team: 'Platforma jamoasi',
      health: 'Tizim holati',
      logs: 'Jurnal',
      settings: 'Platforma sozlamalari',
      users: 'Foydalanuvchilar',
      roles: 'Rollar va ruxsatlar',
      modules: 'Modullar',
      integrations: 'Integratsiyalar',
      telegram: 'Telegram botlar',
      notifications: 'Xabarnomalar',
      statistics: 'Statistika',
      reports: 'Hisobotlar',
      apiKeys: 'API kalitlar',
      backups: 'Zaxira nusxalar',
      security: 'Xavfsizlik',
    },

    columns: {
      restaurant: 'Restoran',
      owner: 'Egasi',
      plan: 'Tarif',
      status: 'Holat',
      branches: 'Filiallar',
      users: 'Foydalanuvchi',
      lastSeen: 'Oxirgi faollik',
      billing: "To'lov",
      monthly: 'Oylik',
      device: 'Qurilma',
      branch: 'Filial',
      type: 'Turi',
      version: 'Versiya',
      sync: 'Oxirgi sinxronizatsiya',
      who: 'Kim',
      action: 'Amal',
      when: 'Qachon',
      invoice: 'Hisob raqami',
      date: 'Sana',
      amount: 'Summa',
      method: 'Usul',
      seats: "O'rin",
      staff: 'Xodim',
      revenue: 'Oylik tushum',
      email: 'Elektron pochta',
      lastLogin: 'Oxirgi kirish',
      total: 'Jami',
    },

    state: {
      active: 'Faol',
      suspended: "To'xtatilgan",
      trial: 'Sinov muddati',
      settingUp: 'Sozlanmoqda',
      paid: "To'langan",
      overdue: "Muddati o'tgan",
      pending: 'Kutilmoqda',
      online: 'Onlayn',
      offline: 'Oflayn',
      updateNeeded: 'Yangilanish kerak',
    },

    empty: {
      title: 'Hech narsa topilmadi',
      hint: "Qidiruv so'zini o'zgartiring yoki filtrni tozalang.",
    },

    overview: {
      restaurants: 'Restoranlar',
      branches: 'Faol filiallar',
      mrr: 'Oylik daromad',
      issues: "Muammoli to'lovlar",
      added: "bu oyda qo'shildi",
      target: 'maqsad',
      ofActive: 'tadan faol',
      ofAll: 'restorandan',
      usersSuffix: 'foydalanuvchi',
      perMonth: "so'm / oy",
      perMonthShort: 'oy',
      unpaid: "so'm to'lanmagan",
      mrrTrend: "Oylik daromad o'sishi",
      mrrTrendSub: "So'nggi 12 oy · so'm, million",
      planMix: "Tariflar bo'yicha taqsimot",
      planMixSub: 'restoran · oylik daromad',
      planTotal: 'jami',
      health: 'Tizim holati',
      logs: 'Tizim jurnali',
    },

    health: {
      uptime: 'Ishlash vaqti, 30 kun',
      latency: 'API javob vaqti',
      dbLoad: "Ma'lumotlar bazasi yuki",
      offlineTerminals: 'Oflayn terminallar',
      syncErrors: 'Sinxronizatsiya xatolari',
      errorRate: 'Xatolik darajasi, 24 soat',
    },

    tenants: {
      search: "Restoran yoki egasi bo'yicha qidirish",
      all: 'Hammasi',
      issues: 'Muammolilar',
      back: "Restoranlar ro'yxatiga",
      impersonate: 'Restoran sifatida kirish',
      changePlan: "Tarifni o'zgartirish",
      markPaid: "To'lovni qayd etish",
      suspend: "To'xtatib turish",
      resume: 'Qayta yoqish',
      subscription: "Obuna to'lovi",
      branchRevenue: 'Filiallar tushumi',
      since: "Ro'yxatdan o'tgan",
      nextBill: "Keyingi to'lov",
      branchesTitle: 'Filiallar',
      usersTitle: 'Foydalanuvchilar',
      invoicesTitle: "To'lovlar tarixi",
      features: 'Funksiya kalitlari',
      actions: 'Restoran bilan amallar',
      actionsSub: "Hisob yuborish, ma'lumot arxivi, o'chirish 90 kundan keyin bajariladi.",
      sendInvoice: 'Hisob yuborish',
      export: "Ma'lumotni eksport qilish",
      delete: "Restoranni o'chirish",
      perMonth: 'oyiga',
    },

    newTenant: {
      title: 'Yangi restoran',
      subtitle: '14 kunlik sinov muddati bilan ochiladi',
      name: 'Restoran nomi',
      namePlaceholder: 'masalan, Osh Xona',
      owner: 'Egasining ismi',
      ownerPlaceholder: 'Ism familiya',
      phone: 'Telefon',
      city: 'Shahar',
      plan: 'Tarif',
      cancel: 'Bekor qilish',
      create: 'Restoranni ochish',
    },

    plans: {
      currency: "so'm",
      perMonth: 'oyiga',
      branches: 'filialgacha',
      users: 'foydalanuvchigacha',
      coreReports: 'Asosiy hisobotlar',
      fullReports: "To'liq tahlil va hisobotlar",
      emailSupport: 'Elektron pochta orqali yordam',
      dedicated: 'Shaxsiy menejer, SLA 99.9%',
      onPlan: 'restoran shu tarifda',
      select: "Shu tarifga o'tkazish",
      current: 'Joriy tarif',
    },

    billing: {
      overdueTotal: "Muddati o'tgan summa",
      collected: "Bu oy yig'ilgan",
      arpu: "O'rtacha to'lov",
      churn: 'Chiqib ketish',
      remind: 'Eslatma yuborish',
      sendInvoice: 'Hisob yuborish',
    },

    devices: {
      total: 'Terminallar',
    },

    platformSettings: {
      autoApprove: {
        label: 'Yangi restoranlarni avtomatik tasdiqlash',
        detail: 'Sinov muddati 14 kun bilan',
      },
      latePayment: {
        label: "To'lov kechikkanda ogohlantirish",
        detail: '3, 7 va 14-kunlarda',
      },
      autoSuspend: {
        label: '14 kundan keyin avtomatik to‘xtatish',
        detail: "Ma'lumotlar 90 kun saqlanadi",
      },
      nightlyBackup: {
        label: 'Kechalik zaxira nusxa',
        detail: '03:00 · Toshkent',
      },
      logSuperAdmin: {
        label: 'Super admin harakatlarini yozib borish',
        detail: "O'chirib bo'lmaydi",
      },
    },

    features: {
      kds: 'Oshxona ekrani',
      delivery: 'Yetkazib berish integratsiyasi',
      loyalty: 'Sodiqlik dasturi',
      multi: "Ko'p filialli hisobot",
    },

    roles: {
      owner: 'Egasi',
      director: 'Direktor',
      cashier: 'Kassir',
      chef: 'Oshpaz',
      waiter: 'Ofitsiant',
      storekeeper: 'Omborchi',
      superAdmin: 'Super admin',
      support: 'Yordam xizmati',
      accounting: 'Buxgalteriya',
      engineer: 'Muhandis',
    },

    method: {
      bank: "Bank o'tkazmasi",
      payme: 'Payme',
      card: 'Karta',
    },

    trials: {
      open: 'Sinovda',
      ending: 'Shu hafta tugaydi',
      conversion: "O'tgan oy konversiya",
      daysLeft: 'kun qoldi',
    },

    audit: {
      note: "Har bir kirish yozib boriladi va o'chirilmaydi.",
    },

    team: {
      invite: 'Xodim taklif qilish',
    },

    settings: {
      general: 'Umumiy',
      email: 'Email (SMTP)',
      sms: 'SMS (Eskiz)',
      localization: 'Tillar',
    },

    /**
     * The screens the handoff never drew.
     *
     * Each is a sentence under the title and an honest empty state saying what
     * will be there. Kept in the catalogue rather than in the page files so an
     * operator reading the console in Russian is not dropped into Uzbek the
     * moment they leave the design's eleven screens.
     */
    extra: {
      apiKeys: {
        intro: 'Tashqi tizimlar uchun API tokenlar · Laravel Sanctum',
        action: 'Yangi kalit',
        stub: "Kalitlar ro'yxati",
        note: 'Har bir kalitning egasi, ruxsat doirasi, oxirgi ishlatilgan vaqti va bekor qilish tugmasi.',
      },
      backups: {
        intro: 'PostgreSQL, MinIO va Redis uchun avtomatik zaxira · har kuni 03:00, Toshkent',
        action: 'Hozir zaxira olish',
        stub: 'Zaxira tarixi va jadval',
        note: "Sana, hajm va holat bo'yicha ro'yxat; tiklash tugmasi bilan.",
      },
      notifications: {
        intro: 'Umumiy xabar · Push, SMS, Email va Telegram orqali',
        action: 'Yangi xabar',
        stub: 'Xabarnoma konstruktori',
        note: 'Sarlavha, matn, qabul qiluvchilar va kanal tanlovi; yuborilganlar tarixi bilan.',
      },
      reports: {
        intro: 'Excel va PDF eksport · rejalashtirilgan yuborish bilan',
        stub: 'Hisobot shablonlari',
        note: "Kunlik tushum, food-cost, ABC tahlil, xodim KPI va ombor qoldig'i.",
      },
      roles: {
        intro: "RBAC tizimi · 15 rol, har biri uchun modul bo'yicha ruxsatlar",
        stub: 'Ruxsatlar matritsasi',
        note: "Har bir rol qatorda, har bir ruxsat ustunda; o'zgarish darhol audit jurnaliga tushadi.",
      },
      users: {
        intro: "Platformadagi barcha hisoblar · rol, holat va oxirgi kirish bo'yicha",
        invite: 'Taklif yuborish',
        create: 'Yangi foydalanuvchi',
        stub: 'Foydalanuvchilar jadvali',
        note: 'Qidiruv, rol va holat filtrlari, oxirgi kirish ustuni bilan.',
      },
      userInvite: {
        intro: "Elektron pochtaga parol o'rnatish havolasi yuboriladi",
        stub: 'Taklif formasi',
        note: "Bitta pochta yoki CSV orqali ko'pchilikni birdaniga taklif qilish.",
      },
      userNew: {
        intro: "Pochta va parol bilan to'g'ridan-to'g'ri yaratish",
        stub: 'Yaratish formasi',
        note: 'Ism, pochta, telefon, rol va ikki bosqichli tasdiq talabi.',
      },
      modules: {
        intro: "Modullarni yoqish va o'chirish · o'zgarish barcha restoranlarga tegishli",
        menu: 'Menyu, taomlar, narxlar, stop-list',
        orders: 'Zal, olib ketish, yetkazish, agregator',
        kitchen: 'Oshxona displeyi, sexlar, tayyorlash vaqti',
        tables: 'Zallar, stollar, bronlar, QR-menyu',
        inventory: 'Ombor, ingredientlar, texnologik kartalar',
        suppliers: 'Yetkazib beruvchilar, xaridlar, kirim',
        staff: 'Xodimlar, smenalar, davomat, ish haqi',
        finance: "Kassa smenasi, to'lovlar, fiskal cheklar",
        crm: 'Mijozlar, sodiqlik, aksiyalar, fikr-mulohaza',
        analytics: 'Sotuv, food-cost, ABC tahlil, KPI',
        telegram: 'Botlar infratuzilmasi · 50 bot',
        pos: 'Kassa terminali, to‘rt rejim, oflayn sotuv',
      },
      integrations: {
        intro: 'Tashqi xizmatlar',
        connected: 'tasi ulangan',
        planned: 'tasi rejada',
        active: 'Ishlayapti',
        plannedState: 'Rejada',
        payment: "To'lov",
        delivery: 'Yetkazib berish',
        messaging: 'Aloqa',
        other: 'Boshqa',
      },
      security: {
        intro: 'Kirish urinishlari, shubhali harakatlar va faol seanslar',
        failedLogins: 'Muvaffaqiyatsiz kirishlar, 24 soat',
        failedLoginsHint: 'Ketma-ket urinishlar bloklanadi',
        suspiciousIps: 'Shubhali IP manzillar',
        suspiciousIpsHint: "Odatiy bo'lmagan hudud yoki tezlik",
        sessions: 'Faol seanslar',
        sessionsHint: "Platforma jamoasi bo'yicha",
        twoFactor: '2FA yoqilgan adminlar',
        twoFactorHint: "Restoranni to'xtata oladiganlar uchun majburiy",
        stub: 'Xavfsizlik jurnali',
        note: 'Muvaffaqiyatsiz kirishlar, shubhali harakatlar, IP ruxsatnomalari va faol seanslar.',
      },
      tgSettings: {
        intro: "Barcha 50 bot uchun umumiy sozlamalar · alohida bot sozlamalari o'z sahifasida",
        sync: 'Reyestrni sinxronlash',
        webhook: 'Webhook',
        url: 'Manzil',
        secret: 'Maxfiy token',
        rateLimit: 'Tezlik chegarasi',
        perUser: 'Foydalanuvchi bo‘yicha',
        perBot: 'Bot bo‘yicha',
        languages: 'Tillar',
        supported: 'Qo‘llab-quvvatlanadi',
        default: 'Standart',
        retry: 'Qayta urinish',
        attempts: 'Urinishlar soni',
        backoff: 'Kutish',
        timeout: 'Vaqt chegarasi',
        channelsTitle: 'Standart kanallar',
        channelsNote:
          "To'qqizta ixtiyoriy kanal modul konfiguratsiyasida e'lon qilinadi; obunachilar soni Obunalar sahifasida.",
      },
      tgUser: {
        back: 'Barcha foydalanuvchilar',
        intro: 'Telegram hisobi',
        link: 'Boshqa botga bog‘lash',
        unlink: 'Bog‘lanishni uzish',
        profile: 'Profil',
        profileNote: 'Ism, telefon, platforma hisobi, til va bloklangan holati.',
        bots: "Bog'langan botlar",
        botsNote: 'Har bir bot bo‘yicha oxirgi faollik va obuna holati.',
        activity: "So'nggi faoliyat",
        activityNote: 'Oxirgi ellik buyruq: bot, buyruq, vaqt va natija.',
        messages: "So'nggi xabarlar",
        messagesNote: 'Oxirgi ellik chiquvchi xabar va ularning holati.',
      },
      tg: {
        analyticsIntro: 'Botlar bo‘yicha xabarlar, buyruqlar va faollik',
        analyticsStub: 'Analitika paneli',
        analyticsNote: 'Real vaqtdagi grafiklar va har bir bot bo‘yicha chuqurlashish.',
        activeUsers24h: 'Faol foydalanuvchilar, 24 soat',
        messages24h: 'Xabarlar, 24 soat',
        topBot: 'Eng faol bot',
        errorRate: 'Xatolik darajasi',
        broadcastIntro: 'Tanlangan bot orqali ko‘p foydalanuvchiga bir vaqtda xabar yuborish',
        broadcastStub: 'Broadcast formasi',
        broadcastNote:
          'Bot tanlash, auditoriya filtri, xabar matni, yuborish vaqti va tezlik chegarasi.',
        messagesIntro: 'Barcha botlardan jo‘natilgan xabarlar',
        messagesStub: 'Xabarlar jadvali',
        messagesNote: 'Vaqt, bot, chat, matn, kanal va holat; xatolarni qayta yuborish bilan.',
        total24h: '24 soatda jami',
        sent: 'Yuborilgan',
        queued: 'Navbatda',
        failed: 'Xato',
        usersIntro: 'Telegram hisobi va platforma foydalanuvchisi bog‘lanishi',
        usersStub: 'Foydalanuvchilar jadvali',
        usersNote: 'Telegram identifikatori, platforma hisobi, telefon va oxirgi faollik.',
        usersExport: 'CSV eksport',
        linked: "Bog'langan",
        botsPerPerson: 'O‘rtacha bot / odam',
        blocked: 'Bloklagan',
        active7d: 'Faol, 7 kun',
        auditIntro: 'Barcha botlardagi buyruqlar tarixi',
        auditStub: 'Buyruqlar jadvali',
        auditNote: 'Bot, foydalanuvchi, buyruq, chat turi, javob vaqti va xato ustunlari.',
        commands24h: 'Buyruqlar, 24 soat',
        topCommand: 'Eng ko‘p ishlatilgan buyruq',
        subscriptionsIntro: 'Ixtiyoriy kanallar va ularga obuna bo‘lgan foydalanuvchilar',
        subscriptionsStub: 'Kanallar va obunalar',
        subscriptionsNote: 'Har bir kanal bo‘yicha obunachilar va yuborilgan xabarlar.',
        channels: 'Kanallar',
        subscriptions: 'Obunalar jami',
        channelsPerPerson: 'O‘rtacha kanal / odam',
        botCommandsIntro: 'Ushbu bot buyruqlari · qanchalik tez-tez ishlatiladi',
        botCommandsStub: 'Buyruqlar jadvali',
        botCommandsNote: 'Chaqiruvlar soni, o‘rtacha javob vaqti va xato ulushi.',
        avgLatency: 'O‘rtacha javob vaqti',
        botMessagesIntro: 'Shu botdan jo‘natilgan xabarlar',
        botUsersIntro: 'Shu botga bog‘langan Telegram hisoblari',
        new7d: 'Yangi, 7 kun',
        botBroadcastIntro: 'Shu botning auditoriyasiga xabar yuborish',
        botSettingsIntro: 'Token, webhook va shu botning holati',
        botSettingsStub: 'Bot sozlamalari',
        botSettingsNote:
          'Token maxfiy saqlanadi; webhook manzili, tili va yoqilgan holati shu yerda.',
        botStub: 'Bot paneli',
        botNote: '24 soatlik faollik grafigi, eng ko‘p ishlatilgan buyruqlar va xatolar.',
        botUsersCount: 'Foydalanuvchilar',
        todayMessages: 'Bugungi xabarlar',
      },
      settingsEmail: {
        intro: 'Chiquvchi pochta sozlamalari · barcha restoranlar uchun umumiy',
        stub: 'SMTP konfiguratsiyasi',
        note: 'Host, port, shifrlash, foydalanuvchi, jo‘natuvchi manzil va sinov xati.',
      },
      settingsSms: {
        intro: 'SMS provayderi sozlamalari · Eskiz.uz',
        stub: 'SMS konfiguratsiyasi',
        note: 'Token, jo‘natuvchi nomi, shablonlar va balans nazorati.',
      },
      settingsLocalization: {
        intro: 'Tillar, valyuta, sana formati va vaqt mintaqasi',
        stub: 'Lokalizatsiya sozlamalari',
        note: "O'zbek, rus va ingliz tillari; so'm, Toshkent vaqti va sana ko'rinishi.",
      },
      statistics: {
        intro: "Platforma bo'yicha chuqur analitika · ClickHouse",
        general: 'Umumiy',
        users: 'Foydalanuvchilar',
        activity: 'Faollik',
        system: 'Tizim resurslari',
        generalStub: 'Umumiy statistika',
        generalNote: "Sotuv, foydalanuvchi va tizim ko'rsatkichlari bir joyda.",
        usersIntro: "Faol foydalanuvchilar, rollar bo'yicha taqsimot va o'sish",
        usersStub: 'Foydalanuvchi paneli',
        usersNote: "Kunlik va oylik faol foydalanuvchilar, rol bo'yicha kesim, yangi hisoblar.",
        activityIntro: 'API chaqiruvlari, kirishlar va eng band soatlar',
        activityStub: 'Faollik paneli',
        activityNote: "Soatlik yuk, kirish urinishlari va hududlar bo'yicha taqsimot.",
        systemIntro: 'Server yuki, javob vaqti va navbatlar',
        systemStub: "Tizim ko'rsatkichlari",
        systemNote: "CPU, xotira, disk, navbat uzunligi va sekin so'rovlar.",
      },
    },

    telegram: {
      intro: 'ta bot · bitta multi-bot dispatcher, Python aiogram 3',
      broadcast: 'Broadcast',
      analytics: 'Analitika',
      totalBots: 'Jami botlar',
      enabled: 'Yoqilgan',
      linkedUsers: "Bog'langan foydalanuvchilar",
      messages24h: "So'nggi 24 soat xabarlar",
      noToken: "Token o'rnatilmagan",
      enableTitle: 'Botni yoqish',
      allBots: 'Barcha botlar',
      forAudience: 'uchun',
      sections: {
        overview: 'Umumiy',
        commands: 'Buyruqlar',
        messages: 'Xabarlar',
        users: 'Foydalanuvchilar',
        broadcast: 'Broadcast',
        settings: 'Sozlamalar',
      },
    },
  },
};

/** The shape the other two catalogues have to satisfy. */
export type AdminMessages = typeof uz;
