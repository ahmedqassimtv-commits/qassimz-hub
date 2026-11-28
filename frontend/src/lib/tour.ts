/**
 * Dynamically imported Driver.js Guided Onboarding Tour (loaded on-demand ONLY).
 */
export async function launchGuidedTour(lang: "en" | "ar"): Promise<void> {
  const [{ driver }] = await Promise.all([
    import("driver.js"),
    import("driver.js/dist/driver.css"),
  ]);

  const isAr = lang === "ar";
  const steps = [
    {
      element: '[data-tour="brand"]',
      popover: {
        title: isAr ? "مرحباً بك في QASSIMZ Hub" : "Welcome to QASSIMZ Hub",
        description: isAr
          ? "المركز الموحّد لإدارة وتحديث جميع برامج منظومة قَاسِمز وإضافات أدوبي بضغطة واحدة."
          : "Your unified command center for installing, launching, and updating the QASSIMZ Creative Suite.",
      },
    },
    {
      element: '[data-tour="search"]',
      popover: {
        title: isAr ? "لوحة الأوامر والبحث (Ctrl+K)" : "Command Palette & Search (Ctrl+K)",
        description: isAr
          ? "ابحث عن أي تطبيق أو أمر سريع فوراً باستخدام البحث الضبابي واختصارات لوحة المفاتيح."
          : "Instantly jump to any app, action, or setting with fuzzy search and frecency ranking.",
      },
    },
    {
      element: '[data-tour="sidebar"]',
      popover: {
        title: isAr ? "التصفية الذكية" : "Smart Views & Categories",
        description: isAr
          ? "بدّل بسلاسة بين كل البرامج، المثبّتة، التحديثات، وبرامج سطح المكتب أو إضافات قاسمز."
          : "Switch effortlessly between All Apps, Installed, Updates, Desktop Apps, and QASSIMZ Plugins panels.",
      },
    },
    {
      element: '[data-tour="activity"]',
      popover: {
        title: isAr ? "التحديثات الذكية في الخلفية" : "Silent Smart Delta Updates",
        description: isAr
          ? "تابع التحديثات التفاضلية السريعة بصمت تام من الحلقة الدائرية العلوية دون مقاطعة عملك."
          : "Track fast differential updates silently from the circular progress ring without interrupting your workflow.",
      },
    },
  ].filter((s) => Boolean(document.querySelector(s.element)));

  if (!steps.length) return;

  const tour = driver({
    showProgress: true,
    allowClose: true,
    animate: !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    nextBtnText: isAr ? "التالي" : "Next",
    prevBtnText: isAr ? "السابق" : "Back",
    doneBtnText: isAr ? "ابدأ الآن" : "Get Started",
    steps,
  });
  tour.drive();
}
