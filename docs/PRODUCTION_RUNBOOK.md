# دليل تشغيل SEALS B2B في الإنتاج

> المرجع التفصيلي للنشر: `docs/DEPLOYMENT.md` و`docs/DOCKER.md`. هذه الوثيقة ملخص التشغيل اليومي.

## 1. المتطلبات

- خادم Linux بذاكرة 2GB على الأقل، Docker وDocker Compose، واسمان للنطاق (تطبيق + API) موجهان إلى الخادم.
- MongoDB Atlas بإعداد Production، مستخدم مخصص للتطبيق، وتقييد الشبكات المسموح لها.
- حساب Cloudinary مخصص للإنتاج.
- SMTP موثوق لإثبات البريد واستعادة كلمة المرور.
- نسخة Android موقعة بمفتاح محفوظ خارج المستودع، وحسابات المتاجر عند النشر العام.

## 2. الأسرار والإعداد

1. انسخ `backend/.env.production.example` إلى `backend/.env.production`.
2. ولّد `NEXTAUTH_SECRET` و`CRON_SECRET` عشوائيين، كل منهما 32 بايت على الأقل: `openssl rand -base64 48`.
3. اجعل `NEXTAUTH_URL` هو رابط API النهائي بـHTTPS، واضبط `APP_ORIGIN` على نطاق واجهة الويب فقط.
4. اضبط `TRUST_PROXY_HEADERS=true` لأن كل الطلبات تمر عبر Caddy الذي يكتب عنوان العميل الحقيقي.
5. لا تضع أسرار MongoDB أو Cloudinary أو SMTP داخل تطبيق Flutter.
6. انسخ `.env.production.example` الجذري إلى `.env.production` واضبط `APP_DOMAIN` و`API_DOMAIN` و`WEB_API_BASE_URL`.
7. في `app/.env` ضع `ENVIRONMENT=production` و`API_BASE_URL_PROD` قبل بناء النسخة النهائية.

تم العثور أثناء التطوير على بيانات اتصال MongoDB قديمة داخل سكربت Scratch وحُذف السكربت والمجلد. **يجب تدوير كلمة مرور مستخدم MongoDB ومفاتيح Cloudinary من لوحات التحكم قبل أي نشر — اعتبرها مكشوفة.** يرفض النظام الآن الإقلاع في الإنتاج بأسرار ضعيفة أو ناقصة (`assertProductionConfig`).

## 3. النشر

```bash
docker compose --env-file .env.production build --pull
docker compose --env-file .env.production up -d
docker compose --env-file .env.production ps
curl -fsS https://$API_DOMAIN/api/health/live
curl -fsS https://$API_DOMAIN/api/health/ready
curl -fsS https://$APP_DOMAIN/healthz   # Flutter Web container
```

أنشئ مدير المنصة مرة واحدة فقط:

```bash
docker compose exec api npm run bootstrap:admin
```

بعدها احذف `ADMIN_BOOTSTRAP_PASSWORD` من البيئة وأعد إنشاء حاوية API. ادخل `/admin/settings` واضبط:

- رسم الطلب: `5000` قرش.
- مهلة إرسال إثبات الدفع (الافتراضي 48 ساعة)، وبعدها يلغى الطلب غير المدفوع وتتحرر الكمية المحجوزة.
- حساب/حسابات تحصيل رسم المنصة.
- خطط وأسعار الاشتراك التي يعتمدها صاحب المشروع.

## 4. المهمة المجدولة

شغّل الطلب التالي مرة كل ساعة من Cron خارجي أو من مراقب الخادم. يحدث الاشتراكات المنتهية، ويلغي الطلبات التي انتهت مهلة دفعها دون أي إثبات، وينفذ طلبات حذف الحساب المستحقة:

```bash
curl --fail --request POST \
  --header "x-cron-secret: $CRON_SECRET" \
  https://DOMAIN/api/internal/maintenance
```

لا تضع قيمة السر في ملف قابل للقراءة العامة أو في سجل الأوامر المشترك.

## 5. النسخ الاحتياطي والاستعادة

- فعّل Continuous Cloud Backup وPoint-in-Time Restore في MongoDB Atlas إن كانت الخطة تدعمهما.
- احتفظ بنسخة مشفرة يومية في موقع منفصل عن الخادم، واختبر الاستعادة شهريًا.
- على Windows يمكن إنشاء أرشيف يدويًا من `backend`:

```powershell
$env:MONGODB_URI='mongodb+srv://...'
.\scripts\backup-mongodb.ps1 -OutputDirectory 'D:\secure-backups\seals'
```

لاختبار الاستعادة استخدم قاعدة بيانات تجريبية جديدة، وليس قاعدة الإنتاج:

```bash
mongorestore --uri="MONGODB_TEST_URI" --archive="seals-TIMESTAMP.archive.gz" --gzip --drop
```

تحقق من SHA256، ثم افحص عدد المنشآت والمنتجات والطلبات والتزامات الدفع. لا تستخدم `--drop` على الإنتاج إلا ضمن خطة تعافٍ معتمدة ونافذة توقف معلنة.

## 6. المراقبة والاستجابة للحوادث

- راقب `/api/health/ready` كل دقيقة، وزمن الاستجابة ونسبة 5xx ومساحة قاعدة البيانات.
- كل طلب API يحمل `x-request-id` وسجلات الخادم JSON منظمة — استخدمها للتتبع.
- فعّل تنبيهات Atlas للاتصالات والتخزين وبطء الاستعلامات.
- اجمع سجلات Caddy وAPI في خدمة مركزية مع حجب الأسرار وبيانات إثبات الدفع.
- عند تسريب سر: دوّره أولًا، ألغِ القديم، راجع AuditLog والجلسات، ثم حدّث الحاويات.
- احتفظ بأثر المراجعة للقبول والرفض والمدفوعات والنزاعات (تسجيل تلقائي في AuditLog).

## 7. ما لا يُفتح للعامة قبل اعتماده

- مراجعة محامٍ مصري لشروط الاستخدام والخصوصية وسياسة النزاعات والاحتفاظ بالسجلات والضرائب والفواتير.
- مراجعة محاسب/مستشار ضرائب لنموذج رسم الـ50 جنيه والاشتراكات.
- تأكيد تعاقدات شركات الشحن ومسؤولية التلف/الفقد.
- اختبار Pilot المكتوب في `MVP_ACCEPTANCE.md` بثلاث منشآت حقيقية على الأقل.
