import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^([^#=]+)=(.*)$/.exec(line);
    if (match && process.env[match[1].trim()] === undefined) process.env[match[1].trim()] = match[2];
  }
}

loadEnv();
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

// Guard: this script upserts VERIFIED demo organizations with a PUBLIC password
// (Demo@12345). It must never run against a production database.
const uri = process.env.MONGODB_URI;
const isLocalDb = /localhost|127\.0\.0\.1/.test(uri);
const isProduction = process.env.NODE_ENV === 'production' || (process.env.MONGODB_ENV ?? '') === 'production';
if ((isProduction || !isLocalDb) && process.env.ALLOW_DEMO_SEED !== 'true') {
  console.error(
    'REFUSING to seed: MONGODB_URI does not look local and/or NODE_ENV=production.\n' +
    'Demo data would create verified logins with a public password.\n' +
    'Set ALLOW_DEMO_SEED=true only if you truly understand the target database.'
  );
  process.exit(1);
}

const now = new Date();
const passwordHash = await bcrypt.hash('Demo@12345', 10);
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection;

const organizations = db.collection('organizations');
const users = db.collection('users');
const members = db.collection('organizationmembers');
const subscriptions = db.collection('subscriptions');
const productsCollection = db.collection('products');
const orders = db.collection('orders');
const obligations = db.collection('paymentobligations');
const conversations = db.collection('conversations');
const messages = db.collection('chatmessages');
const follows = db.collection('follows');
const posts = db.collection('posts');
const interactions = db.collection('interactions');
const ratings = db.collection('ratings');
const shippingRates = db.collection('shippingrates');
const platformSettings = db.collection('platformsettings');

// The real order state machine refuses seller acceptance until both the seller
// and the platform expose an active local payment destination. Seed the QA
// destination explicitly so demo orders exercise the same safe production flow.
await platformSettings.updateOne(
  { key: 'default' },
  {
    $set: {
      order_fee_piasters: 5000,
      trial_days: 14,
      subscription_grace_days: 3,
      payment_deadline_hours: 48,
      platform_payment_accounts: [{
        method: 'instapay',
        label: 'SEALS InstaPay QA',
        account_holder: 'SEALS B2B Marketplace QA',
        account_reference: 'seals.qa@instapay',
        instructions: 'حساب تجريبي فقط. لا تستخدمه في أي تحويل مالي حقيقي.',
        is_active: true,
      }],
      support_email: 'support@seals.demo',
      updatedAt: now,
    },
    $setOnInsert: { key: 'default', createdAt: now },
  },
  { upsert: true }
);

const governorates = ['القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحيرة', 'الشرقية'];
const accountNames = {
  wholesaler: ['النيل للتوريدات', 'دلتا ماركت', 'القاهرة للتجارة', 'الإسكندرية للجملة', 'الأمان للتوزيع', 'رواد المخازن'],
  buyer: ['متاجر المستقبل', 'سوبر ماركت الوفاء', 'المدينة للتجزئة', 'أسواق البيت', 'ميني ماركت النور', 'متاجر مصر'],
  shipper: ['سريع للشحن', 'دلتا لوجستيك', 'وصلني أعمال', 'مصر إكسبريس', 'الأمان للنقل', 'خط الطريق'],
};
const roleMap = { wholesaler: 'Wholesaler', buyer: 'Retailer', shipper: 'Shipper' };

async function seedAccount(type, index) {
  const number = index + 1;
  const slug = `demo-${type}-${number}`;
  const email = `${type}${number}@seals.demo`;
  const displayName = accountNames[type][index];
  await organizations.updateOne(
    { slug },
    {
      $set: {
        seed_key: `mvp-${type}-${number}`,
        type,
        legal_name: displayName,
        display_name: displayName,
        description: `حساب تجريبي موثّق لاختبار تجربة ${type === 'wholesaler' ? 'البيع بالجملة' : type === 'buyer' ? 'الشراء والتوصيات' : 'الشحن وتتبع الطلبات'}.`,
        phone: `0109000${type === 'wholesaler' ? '1' : type === 'buyer' ? '2' : '3'}${String(number).padStart(3, '0')}`,
        email,
        location: { governorate: governorates[index], address: `منطقة الأعمال ${number}` },
        // DiceBear explicitly allows cross-origin image loading, which Flutter
        // Web/CanvasKit requires. pravatar returned images without CORS headers.
        avatar_url: `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(`${type}-${number}`)}&backgroundColor=0f766e,1d4ed8,7c3aed`,
        cover_url: `https://picsum.photos/seed/seals-${type}-${number}/1200/420`,
        verification_status: 'verified',
        verification_documents: [],
        payment_accounts: [{
          _id: new mongoose.Types.ObjectId(),
          method: 'instapay',
          label: 'InstaPay تجريبي',
          account_holder: displayName,
          account_reference: `demo${number}@instapay`,
          instructions: 'بيانات تجريبية فقط ولا تستخدم للتحويل الحقيقي.',
          is_active: true,
        }],
        is_active: true,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: new Date(now.getTime() - number * 86400000) },
    },
    { upsert: true }
  );
  const organization = await organizations.findOne({ slug });
  await users.updateOne(
    { email },
    {
      $set: {
        seed_key: `mvp-${type}-${number}`,
        name: `${type === 'wholesaler' ? 'مدير' : type === 'buyer' ? 'مشتري' : 'مسؤول شحن'} ${displayName}`,
        phone: organization.phone,
        passwordHash,
        location: organization.location,
        role: roleMap[type],
        organization_id: organization._id,
        isActive: true,
        failed_login_attempts: 0,
        session_version: 0,
        email_verified_at: now,
        terms_accepted_at: now,
        terms_version: '2026-08-20',
        business_name: displayName,
        avatar_url: organization.avatar_url,
        interested_categories: type === 'buyer'
          ? index % 2 === 0 ? ['أغذية ومشروبات', 'منظفات', 'ورقيات'] : ['إلكترونيات', 'ملابس', 'أدوات منزلية']
          : [],
        updatedAt: now,
      },
      $setOnInsert: { createdAt: new Date(now.getTime() - number * 86400000) },
    },
    { upsert: true }
  );
  const user = await users.findOne({ email });
  await members.updateOne(
    { organization_id: organization._id, user_id: user._id },
    { $set: { role: 'owner', permissions: ['*'], status: 'active', updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
  await subscriptions.updateOne(
    { organization_id: organization._id, seed_key: 'mvp-demo' },
    {
      $set: {
        status: 'active', starts_at: new Date(now.getTime() - 30 * 86400000),
        current_period_ends_at: new Date(now.getTime() + 365 * 86400000),
        cancel_at_period_end: false, updatedAt: now,
      },
      $setOnInsert: { seed_key: 'mvp-demo', createdAt: now },
    },
    { upsert: true }
  );
  return { organization, user };
}

const wholesalers = [];
const buyers = [];
const shippers = [];
for (let index = 0; index < 6; index += 1) {
  wholesalers.push(await seedAccount('wholesaler', index));
  buyers.push(await seedAccount('buyer', index));
  shippers.push(await seedAccount('shipper', index));
}

const templates = [
  ['أرز مصري فاخر 5 كجم', 'أغذية ومشروبات', 'كيس', 24500, 'pack', 1],
  ['سكر أبيض معبأ 1 كجم', 'أغذية ومشروبات', 'كرتونة', 1950, 'carton', 20],
  ['زيت عباد الشمس 1 لتر', 'أغذية ومشروبات', 'كرتونة', 7800, 'carton', 12],
  ['مسحوق غسيل أوتوماتيك', 'منظفات', 'كرتونة', 13500, 'carton', 8],
  ['منظف أرضيات مركز', 'منظفات', 'كرتونة', 4900, 'carton', 12],
  ['مناديل ورقية اقتصادية', 'ورقيات', 'بالة', 3200, 'pack', 24],
  ['كابل شحن سريع Type-C', 'إلكترونيات', 'قطعة', 8500, 'piece', 1],
  ['سماعة لاسلكية للأعمال', 'إلكترونيات', 'قطعة', 42000, 'piece', 1],
  ['تيشيرت قطن مصري', 'ملابس', 'قطعة', 16500, 'piece', 1],
  ['طقم تخزين بلاستيك', 'أدوات منزلية', 'طقم', 21000, 'pack', 6],
  ['أكواب زجاج 6 قطع', 'أدوات منزلية', 'كرتونة', 17500, 'carton', 8],
  ['دفاتر مدرسية 80 ورقة', 'أدوات مكتبية', 'كرتونة', 2800, 'carton', 40],
];

const seededProducts = new Map();
for (let sellerIndex = 0; sellerIndex < wholesalers.length; sellerIndex += 1) {
  const account = wholesalers[sellerIndex];
  const sellerProducts = [];
  for (let templateIndex = 0; templateIndex < templates.length; templateIndex += 1) {
    const [title, category, unit, basePrice, saleType, unitsPerSale] = templates[templateIndex];
    const sku = `DEMO-W${sellerIndex + 1}-${String(templateIndex + 1).padStart(3, '0')}`;
    const price = basePrice + sellerIndex * 175 + templateIndex * 45;
    const stock = 70 + ((sellerIndex * 31 + templateIndex * 17) % 430);
    await productsCollection.updateOne(
      { organization_id: account.organization._id, sku },
      {
        $set: {
          seed_key: sku,
          title: `${title} - ${account.organization.display_name}`,
          description: `منتج تجريبي موثوق مناسب لتجار التجزئة. بيانات واضحة للكميات والتجهيز والخصومات من ${account.organization.display_name}.`,
          price: price / 100,
          price_piasters: price,
          cost_price_piasters: Math.round(price * (0.58 + (templateIndex % 4) * 0.04)),
          price_tiers: [
            { min_quantity: 10, unit_price_piasters: Math.round(price * 0.96) },
            { min_quantity: 50, unit_price_piasters: Math.round(price * 0.91) },
            { min_quantity: 100, unit_price_piasters: Math.round(price * 0.86) },
          ],
          moq: saleType === 'piece' ? 5 : 2,
          images: [
            `https://picsum.photos/seed/${sku.toLowerCase()}-1/900/700`,
            `https://picsum.photos/seed/${sku.toLowerCase()}-2/900/700`,
            `https://picsum.photos/seed/${sku.toLowerCase()}-3/900/700`,
          ],
          video_urls: templateIndex % 4 === 0
            ? ['https://res.cloudinary.com/demo/video/upload/samples/sea-turtle.mp4']
            : [],
          category,
          tags: [category, title.split(' ')[0], governorates[sellerIndex]],
          wholesaler_id: account.user._id,
          organization_id: account.organization._id,
          stock_quantity: stock,
          reserved_quantity: templateIndex % 5 === 0 ? 5 : 0,
          unit,
          sale_type: saleType,
          units_per_sale: unitsPerSale,
          discount_percent: templateIndex % 3 === 0 ? 10 : templateIndex % 3 === 1 ? 5 : 0,
          lead_time_days: 1 + (templateIndex % 4),
          return_policy: 'استبدال عيوب الصناعة خلال 7 أيام بشرط سلامة العبوة والفاتورة.',
          specifications: {
            'بلد المنشأ': 'مصر',
            'جودة التعبئة': 'تجارية ممتازة',
            'الوحدة داخل العبوة': String(unitsPerSale),
          },
          faqs: [
            { question: 'هل توجد خصومات للكميات الكبيرة؟', answer: 'نعم، تُطبّق شرائح أسعار الجملة تلقائيًا حسب الكمية.' },
            { question: 'ما مدة تجهيز الطلب؟', answer: `يتم التجهيز عادة خلال ${1 + (templateIndex % 4)} يوم عمل.` },
          ],
          status: 'active',
          isActive: true,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: new Date(now.getTime() - (sellerIndex * 12 + templateIndex) * 3600000) },
      },
      { upsert: true }
    );
    sellerProducts.push(await productsCollection.findOne({ organization_id: account.organization._id, sku }));
  }
  seededProducts.set(account.organization._id.toString(), sellerProducts);
}

for (let index = 0; index < shippers.length; index += 1) {
  for (let routeIndex = 0; routeIndex < governorates.length; routeIndex += 1) {
    await shippingRates.updateOne(
      {
        shipper_organization_id: shippers[index].organization._id,
        from_governorate: governorates[index],
        to_governorate: governorates[routeIndex],
      },
      {
        $set: {
          price_piasters: 8500 + routeIndex * 1250 + index * 500,
          estimated_days: 1 + ((index + routeIndex) % 4),
          is_active: true,
          seed_key: `rate-${index + 1}-${routeIndex + 1}`,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
  }
}

const orderStatuses = ['completed', 'completed', 'delivered', 'in_transit', 'preparing', 'requested'];
for (let index = 0; index < 36; index += 1) {
  const buyer = buyers[index % buyers.length];
  const seller = wholesalers[(index * 5 + 1) % wholesalers.length];
  const shipper = shippers[(index + 2) % shippers.length];
  const sellerProducts = seededProducts.get(seller.organization._id.toString());
  const selected = [sellerProducts[index % 12], sellerProducts[(index + 3) % 12]];
  const items = selected.map((product, itemIndex) => {
    const quantity = product.moq * (3 + ((index + itemIndex) % 8));
    const unitPrice = product.price_tiers[0].unit_price_piasters;
    return {
      product_id: product._id,
      sku: product.sku,
      title: product.title,
      unit: product.unit,
      quantity,
      unit_price_piasters: unitPrice,
      subtotal_piasters: unitPrice * quantity,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.subtotal_piasters, 0);
  const shippingCost = index % 4 === 0 ? 0 : 9500 + (index % 5) * 1000;
  const status = orderStatuses[index % orderStatuses.length];
  const createdAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (index % 6), 4 + (index % 22), 10, 0, 0));
  const orderNumber = `DEMO-${String(index + 1).padStart(4, '0')}`;
  await orders.updateOne(
    { order_number: orderNumber },
    {
      $set: {
        seed_key: orderNumber,
        buyer_organization_id: buyer.organization._id,
        seller_organization_id: seller.organization._id,
        shipper_organization_id: shippingCost ? shipper.organization._id : null,
        created_by: buyer.user._id,
        fulfillment_method: shippingCost ? 'third_party_shipping' : 'buyer_pickup',
        shipping_address: shippingCost ? {
          governorate: buyer.organization.location.governorate,
          address: buyer.organization.location.address,
          contact_name: buyer.user.name,
          phone: buyer.user.phone,
        } : null,
        items,
        goods_subtotal_piasters: subtotal,
        shipping_cost_piasters: shippingCost,
        platform_fee_piasters: 5000,
        total_payable_piasters: subtotal + shippingCost + 5000,
        currency: 'EGP',
        status,
        status_history: [{
          status,
          changed_by: buyer.user._id,
          changed_by_role: buyer.user.role,
          changed_by_organization_id: buyer.organization._id,
          timestamp: createdAt,
          note: 'حالة تجريبية لاختبار الواجهة والتقارير',
        }],
        inventory_reserved: ['preparing', 'in_transit', 'delivered'].includes(status),
        inventory_committed: status === 'completed',
        updatedAt: createdAt,
      },
      $setOnInsert: { createdAt },
    },
    { upsert: true }
  );
  const order = await orders.findOne({ order_number: orderNumber });
  const confirmed = ['completed', 'delivered'].includes(status);
  const obligationRows = [
    ['platform_fee', null, 5000, 'platform'],
    ['goods', seller.organization._id, subtotal, 'organization'],
    ...(shippingCost ? [['shipping', shipper.organization._id, shippingCost, 'organization']] : []),
  ];
  for (const [kind, beneficiaryId, amount, beneficiaryType] of obligationRows) {
    await obligations.updateOne(
      { order_id: order._id, kind },
      {
        $set: {
          payer_organization_id: buyer.organization._id,
          beneficiary_type: beneficiaryType,
          beneficiary_organization_id: beneficiaryId,
          amount_piasters: amount,
          currency: 'EGP',
          status: confirmed ? 'confirmed' : 'pending',
          payment_method: 'instapay',
          updatedAt: createdAt,
        },
        $setOnInsert: { createdAt },
      },
      { upsert: true }
    );
  }

  const participantIds = [buyer.organization._id, seller.organization._id, ...(shippingCost ? [shipper.organization._id] : [])];
  await conversations.updateOne(
    { order_id: order._id },
    {
      $set: {
        conversation_type: 'order',
        participant_organization_ids: participantIds,
        last_message: 'تم تحديث حالة الطلب، شكرًا لتعاون جميع الأطراف.',
        last_message_at: new Date(createdAt.getTime() + 7200000),
        seed_key: `conversation-${orderNumber}`,
        updatedAt: createdAt,
      },
      $setOnInsert: { createdAt },
    },
    { upsert: true }
  );
  const conversation = await conversations.findOne({ order_id: order._id });
  const messageRows = [
    [buyer.user, buyer.organization, 'مرحبًا، هل تم استلام تفاصيل طلب الجملة؟'],
    [seller.user, seller.organization, 'تم الاستلام، وسنراجع المخزون ونبدأ التجهيز.'],
    ...(shippingCost ? [[shipper.user, shipper.organization, 'شركة الشحن جاهزة للاستلام عند تأكيد البائع.']] : []),
  ];
  for (let messageIndex = 0; messageIndex < messageRows.length; messageIndex += 1) {
    const [senderUser, senderOrganization, body] = messageRows[messageIndex];
    await messages.updateOne(
      { seed_key: `${orderNumber}-message-${messageIndex + 1}` },
      {
        $set: {
          conversation_id: conversation._id,
          conversation_type: 'order',
          order_id: order._id,
          sender_user_id: senderUser._id,
          sender_organization_id: senderOrganization._id,
          body,
          message_type: 'text',
          read_by_organization_ids: participantIds,
          updatedAt: new Date(createdAt.getTime() + messageIndex * 3600000),
        },
        $setOnInsert: {
          seed_key: `${orderNumber}-message-${messageIndex + 1}`,
          createdAt: new Date(createdAt.getTime() + messageIndex * 3600000),
        },
      },
      { upsert: true }
    );
  }
}

for (let index = 0; index < wholesalers.length; index += 1) {
  const seller = wholesalers[index];
  const sellerProducts = seededProducts.get(seller.organization._id.toString());
  for (let postIndex = 0; postIndex < 2; postIndex += 1) {
    const product = sellerProducts[postIndex * 3];
    const seedKey = `post-${index + 1}-${postIndex + 1}`;
    await posts.updateOne(
      { seed_key: seedKey },
      {
        $set: {
          wholesaler_id: seller.user._id,
          organization_id: seller.organization._id,
          product_id: product._id,
          media_urls: product.images,
          media_type: 'image',
          category: product.category,
          caption: `عرض تجريبي من ${seller.organization.display_name}: ${product.title} مع أسعار خاصة للكميات.`,
          likes_count: 12 + index * 4 + postIndex,
          updatedAt: now,
        },
        $setOnInsert: { seed_key: seedKey, createdAt: new Date(now.getTime() - (index * 2 + postIndex) * 7200000) },
      },
      { upsert: true }
    );
    const post = await posts.findOne({ seed_key: seedKey });
    const buyer = buyers[(index + postIndex) % buyers.length];
    await interactions.updateOne(
      { seed_key: `${seedKey}-comment` },
      {
        $set: { post_id: post._id, retailer_id: buyer.user._id, comment: 'هل السعر متاح للكميات الأكبر؟', updatedAt: now },
        $setOnInsert: { seed_key: `${seedKey}-comment`, createdAt: now },
      },
      { upsert: true }
    );
  }
  const reviewer = buyers[index % buyers.length];
  await ratings.updateOne(
    { user_id: reviewer.user._id, target_id: seller.organization._id },
    {
      $set: {
        target_type: 'wholesaler', rating: 4 + (index % 2),
        review: 'تعامل احترافي وتجهيز واضح للطلب التجريبي.', updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
  const buyer = buyers[index % buyers.length];
  await follows.updateOne(
    { follower_organization_id: buyer.organization._id, wholesaler_organization_id: seller.organization._id },
    { $setOnInsert: { createdAt: now }, $set: { updatedAt: now } },
    { upsert: true }
  );
}

const summary = {
  wholesalers: await users.countDocuments({ email: /@seals\.demo$/, role: 'Wholesaler' }),
  buyers: await users.countDocuments({ email: /@seals\.demo$/, role: 'Retailer' }),
  shippers: await users.countDocuments({ email: /@seals\.demo$/, role: 'Shipper' }),
  products: await productsCollection.countDocuments({ seed_key: /^DEMO-W/ }),
  orders: await orders.countDocuments({ seed_key: /^DEMO-/ }),
  conversations: await conversations.countDocuments({ seed_key: /^conversation-DEMO-/ }),
};
console.log(JSON.stringify(summary));
await mongoose.disconnect();
