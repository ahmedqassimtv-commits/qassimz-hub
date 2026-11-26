<div align="center" dir="rtl">

<img src="assets/logo.svg" width="116" height="116" alt="QASSIMZ Hub Logo" />

# QASSIMZ Hub — مركز قَاسِمز الرسمي

**اللانشر والمركز الرسمي لتصفّح وتثبيت وتشغيل وتحديث جميع برامج وإضافات منظومة QASSIMZ مجاناً وبدون تسجيل دخول.**

[![أحدث إصدار](https://img.shields.io/github/v/release/ahmedqassimtv-commits/qassimz-hub?style=for-the-badge&color=38BDF8&label=QASSIMZ%20Hub)](https://github.com/ahmedqassimtv-commits/qassimz-hub/releases/latest)
[![المنصة](https://img.shields.io/badge/Windows-10%20%2F%2011%20x64-0EA5E9?style=for-the-badge)](https://github.com/ahmedqassimtv-commits/qassimz-hub/releases/latest)

</div>

---

## نظرة عامة

يوفّر **QASSIMZ Hub** نقطة انطلاق موحّدة لجميع أدوات صناعة المحتوى، المونتاج، الموشن جرافيك، الصوتيات، وتنظيم المشاريع من **قَاسِمز**، مع توزيع عام مباشر لجميع حزم التثبيت (`Setup .exe`) والتحديثات عبر إصدارات هذا المستودع العام ليعمل التحميل والتحديث للجميع بدون الحاجة إلى حساب أو تسجيل دخول.

### أبرز المميزات
- **تثبيت وتحديث بضغطة زر واحدة (One-Click Silent Install & Update All)**: تحميل متعدد القطع مع شريط تقدّم حي وسرعة التحميل والتحقّق من سلامة الملفات (`SHA-256`).
- **دعم متكامل لإضافات Adobe CEP**: كشف تلقائي لبرامج **Adobe Premiere Pro** و **Adobe After Effects** المثبّتة، وتفعيل مفتاح `PlayerDebugMode` لإصدارات `CSXS 9–16` بضغطة زر.
- **خط رسمي موحّد أوفلاين**: تضمين حزمة خطوط **Google Sans & Google Sans Flex** الكاملة (العربية واللاتينية `WOFF2`) محلياً للعمل بدون اتصال إنترنت.
- **اختصارات لوحة مفاتيح شاملة (`e.code`)**: تعمل جميع الاختصارات بسلاسة مع لوحة المفاتيح العربية والإنجليزية معاً.

---

## البرامج والإضافات المتوفّرة في المركز (13 أداة)

### 1. تطبيقات سطح المكتب المستقلة (Windows 10/11)
| الرمز | البرنامج | الوظيفة |
| :---: | :--- | :--- |
| **St** | **QASSIMZ Studio** | جناح المونتاج المتعدّد المسارات (Edit) والموشن جرافيك (Motion) ومؤثرات VOX FX |
| **Pd** | **QASSIMZ Producer** | غرفة تحكّم صناعة المحتوى: كانبان، سبورة أفكار، سكريبت، تلقين، ومساعد AI |
| **Mu** | **QASSIMZ Music** | مشغّل موسيقى وراديو عالمي حي مع معادل صوتي 10 قنوات ومحلّل طيف |
| **Qd** | **QDM** | مدير التحميلات الذكي متعدّد الاتصالات مع دعم الفيديو وإضافة المتصفّح |
| **Th** | **QASSIMZ Thumbs** | عرض مصغّرات PSD و AI و MOGRT و RAW في مستكشف الويندوز + عارض فوري |
| **Or** | **QASSIMZ Organizer** | تنظيم آلي ذكي للملفات والمجلدات مع كشف التكرار وسجلّ تراجع كامل |
| **Sd** | **QASSIMZ Study · ذاكِر** | بيئة مذاكرة PDF تفاعلية مع تظليل، بطاقات استذكار، اختبارات، وبودكاست |

### 2. إضافات ومحرّكات Adobe الاحترافية (Premiere Pro & After Effects)
| الرمز | الإضافة | البرنامج المضيف | الوظيفة |
| :---: | :--- | :---: | :--- |
| **Vx** | **QASSIMZ VOX FX** | After Effects | ترسانة الموشن الوثائقي + إضافات `.aex` أصلية + مختبر ذكاء اصطناعي |
| **Cc** | **QASSIMZ Captions** | Premiere Pro | تفريغ صوتي عربي/إنجليزي دقيق، مونتاج من النص، وكابشن متحرّك |
| **Ft** | **QASSIMZ Footage** | Premiere & AE | باحث اللقطات والأرشيف بالوصف العربي أو الصورة عبر الذكاء الاصطناعي |
| **Mh** | **QASSIMZ MOGRT Hub** | Premiere Pro | مكتبة قوالب `.mogrt` بمعاينة حية ودمج جداول CSV وتعديل فوري |
| **Mm** | **QASSIMZ MOGRT Maker** | After Effects | بناء وتجهيز وتصدير قوالب الموشن جرافيك المتجاوبة (Auto-Rig) |
| **Ex** | **QASSIMZ Export** | After Effects | تصدير سريع MP4 / ProRes / GIF / Alpha مع إعادة تأطير ذكي 9:16 |

---

## التشغيل التطويري المحلي

```bash
pip install -r requirements.txt
python app/main.py
```

جميع الحقوق محفوظة © **Ahmed Qassim — QASSIMZ**
