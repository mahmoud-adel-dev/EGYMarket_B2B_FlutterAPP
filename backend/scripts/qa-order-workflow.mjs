import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

if (process.env.NODE_ENV === 'production' || process.env.QA_ALLOW_MUTATION !== 'true') {
  throw new Error('Refusing to mutate data. Run only in QA/dev with QA_ALLOW_MUTATION=true.');
}

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error('MONGODB_URI is required');
const apiBase = process.env.QA_API_BASE_URL || 'http://localhost:3000';
const adminEmail = `qa.order.${Date.now()}@seals.demo`;
const adminPassword = `Qa!${randomUUID().replaceAll('-', '')}`;

class CookieJar {
  cookies = new Map();

  absorb(headers) {
    for (const header of headers.getSetCookie()) {
      const pair = header.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator > 0) this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  value() {
    return [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
  }
}

async function api(jar, method, path, body, form = false) {
  const headers = {};
  if (jar?.value()) headers.cookie = jar.value();
  let payload;
  if (body !== undefined) {
    if (form) {
      payload = new URLSearchParams(body).toString();
      headers['content-type'] = 'application/x-www-form-urlencoded';
    } else {
      payload = JSON.stringify(body);
      headers['content-type'] = 'application/json; charset=utf-8';
    }
  }
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: payload,
    redirect: 'manual',
  });
  jar?.absorb(response.headers);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 800)}`);
  }
  return data;
}

async function login(email, password) {
  const jar = new CookieJar();
  const csrf = await api(jar, 'GET', '/api/auth/csrf');
  await api(jar, 'POST', '/api/auth/callback/credentials', {
    csrfToken: csrf.csrfToken,
    email,
    password,
    redirect: 'false',
    json: 'true',
  }, true);
  const me = await api(jar, 'GET', '/api/auth/me');
  assert(me.success, `login failed for ${email}`);
  return jar;
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

await mongoose.connect(mongoUri);
const db = mongoose.connection;
let ephemeralAdminCreated = false;

try {
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await db.collection('users').insertOne({
    name: 'Order Workflow QA Admin',
    email: adminEmail,
    passwordHash,
    phone: 'qa-admin',
    role: 'Admin',
    isActive: true,
    email_verified_at: new Date(),
    session_version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    qa_ephemeral: true,
  });
  ephemeralAdminCreated = true;

  const [buyerUser, sellerUser, shipperUser] = await Promise.all([
    db.collection('users').findOne({ email: 'buyer1@seals.demo' }),
    db.collection('users').findOne({ email: 'wholesaler1@seals.demo' }),
    db.collection('users').findOne({ email: 'shipper1@seals.demo' }),
  ]);
  assert(buyerUser && sellerUser && shipperUser, 'seeded buyer/seller/shipper accounts must exist');

  const [buyerOrganization, sellerOrganization] = await Promise.all([
    db.collection('organizations').findOne({ _id: buyerUser.organization_id }),
    db.collection('organizations').findOne({ _id: sellerUser.organization_id }),
  ]);
  const product = await db.collection('products').findOne({
    organization_id: sellerUser.organization_id,
    status: 'active',
    isActive: true,
    $expr: { $gt: [{ $subtract: ['$stock_quantity', '$reserved_quantity'] }, '$moq'] },
  });
  const shippingRate = await db.collection('shippingrates').findOne({
    shipper_organization_id: shipperUser.organization_id,
    from_governorate: sellerOrganization.location.governorate,
    to_governorate: buyerOrganization.location.governorate,
    is_active: true,
  });
  assert(product && shippingRate, 'an active product and matching shipper rate must exist');

  const [buyer, seller, shipper, admin] = await Promise.all([
    login('buyer1@seals.demo', 'Demo@12345'),
    login('wholesaler1@seals.demo', 'Demo@12345'),
    login('shipper1@seals.demo', 'Demo@12345'),
    login(adminEmail, adminPassword),
  ]);

  const created = await api(buyer, 'POST', '/api/orders', {
    items: [{ product_id: product._id.toString(), quantity: product.moq }],
    fulfillment_method: 'third_party_shipping',
    shipping_rate_id: shippingRate._id.toString(),
    shipping_address: {
      governorate: buyerOrganization.location.governorate,
      address: 'QA delivery address, Cairo',
      contact_name: 'QA Buyer',
      phone: '01000000000',
    },
  });
  const orderId = created.order._id;
  assert(created.order.status === 'requested', 'new order must start as requested');

  const beforeFee = await api(buyer, 'GET', `/api/orders/${orderId}`);
  assert(!beforeFee.chat_access.allowed, 'buyer chat must be locked before platform fee confirmation');
  assert(beforeFee.chat_access.reason_code === 'PLATFORM_FEE_REQUIRED', 'lock reason must be platform fee');
  let blockedStatus = 0;
  try {
    await api(buyer, 'POST', '/api/conversations', { order_id: orderId });
  } catch (error) {
    blockedStatus = Number(error.message.match(/-> (\d+):/)?.[1] || 0);
  }
  assert(blockedStatus === 402, 'direct chat API must return 402 before platform fee');

  const accepted = await api(seller, 'PATCH', `/api/orders/${orderId}/status`, { action: 'accept' });
  assert(accepted.order.status === 'awaiting_payments', 'seller acceptance must issue payments');
  const detail = await api(buyer, 'GET', `/api/orders/${orderId}`);
  const obligations = Object.fromEntries(detail.payment_obligations.map((payment) => [payment.kind, payment]));
  assert(obligations.platform_fee && obligations.goods && obligations.shipping, 'three payment obligations must exist');

  for (const payment of Object.values(obligations)) {
    await api(buyer, 'POST', `/api/orders/${orderId}/payments/${payment._id}/proof`, {
      payment_method: 'instapay',
      sender_reference: `QA-${payment.kind}-${orderId}`,
      proof_url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      note: 'QA workflow proof',
    });
  }

  await api(admin, 'POST', `/api/orders/${orderId}/payments/${obligations.platform_fee._id}/review`, { decision: 'confirm' });
  const platformPaid = await api(buyer, 'GET', `/api/orders/${orderId}`);
  assert(platformPaid.chat_access.allowed, 'buyer chat must unlock after platform fee confirmation');
  assert(platformPaid.order.status === 'awaiting_payments', 'platform fee alone must not confirm the order');

  await api(seller, 'POST', `/api/orders/${orderId}/payments/${obligations.goods._id}/review`, { decision: 'confirm' });
  await api(shipper, 'POST', `/api/orders/${orderId}/payments/${obligations.shipping._id}/review`, { decision: 'confirm' });
  const fullyPaid = await api(buyer, 'GET', `/api/orders/${orderId}`);
  assert(fullyPaid.order.status === 'preparing', 'all payments must move the order to preparing');
  assert(fullyPaid.payment_summary.state === 'paid', 'payment summary must be paid');

  await api(seller, 'PATCH', `/api/orders/${orderId}/status`, { action: 'mark_ready' });
  const pickedUp = await api(shipper, 'PATCH', `/api/orders/${orderId}/status`, {
    action: 'confirm_pickup',
    note: 'Picked up from seller warehouse',
  });
  assert(pickedUp.order.status === 'in_transit', 'shipper pickup must start transit');
  const checkpointPayload = {
    event_type: 'checkpoint',
    location: 'Cairo sorting hub',
    note: 'Departed for buyer governorate',
    client_event_id: `qa-checkpoint-${orderId}`,
  };
  const checkpoint = await api(shipper, 'POST', `/api/orders/${orderId}/tracking`, checkpointPayload);
  assert(checkpoint.tracking_event.event_type === 'checkpoint', 'tracking checkpoint must be stored');
  const checkpointReplay = await api(shipper, 'POST', `/api/orders/${orderId}/tracking`, checkpointPayload);
  assert(checkpointReplay.idempotent_replay === true, 'tracking retry must be idempotent');
  const delivered = await api(shipper, 'PATCH', `/api/orders/${orderId}/status`, {
    action: 'confirm_delivery',
    note: 'Delivered at buyer address',
  });
  assert(delivered.order.status === 'delivered', 'shipper must mark delivered');
  const completed = await api(buyer, 'PATCH', `/api/orders/${orderId}/status`, {
    action: 'confirm_receipt',
    note: 'Received in good condition',
  });
  assert(completed.order.status === 'completed', 'buyer receipt must complete the order');

  const conversation = await api(buyer, 'POST', '/api/conversations', { order_id: orderId });
  const messages = await api(buyer, 'GET', `/api/conversations/${conversation.conversation._id}/messages`);
  const eventTypes = messages.messages
    .filter((message) => message.message_type === 'system')
    .map((message) => message.event_type);
  for (const requiredEvent of [
    'order_created',
    'order_accepted',
    'payment_confirmed',
    'all_payments_confirmed',
    'order_ready',
    'shipment_started',
    'tracking_checkpoint',
    'shipment_delivered',
    'buyer_received',
  ]) {
    assert(eventTypes.includes(requiredEvent), `missing system event ${requiredEvent}`);
  }
  const final = await api(buyer, 'GET', `/api/orders/${orderId}`);
  assert(final.tracking_events.length >= 3, 'pickup, checkpoint and delivery events must be present');
  const finalProduct = await db.collection('products').findOne({ _id: product._id });
  assert(
    finalProduct.stock_quantity === product.stock_quantity - product.moq,
    'completed order must decrement physical stock exactly once'
  );
  assert(
    finalProduct.reserved_quantity === product.reserved_quantity,
    'completed order must release its reservation exactly once'
  );

  console.log(JSON.stringify({
    success: true,
    order_id: orderId,
    order_number: final.order.order_number,
    final_status: final.order.status,
    payment_state: final.payment_summary.state,
    buyer_chat_unlocked: final.chat_access.allowed,
    tracking_events: final.tracking_events.length,
    system_chat_events: eventTypes.length,
    direct_chat_before_fee_http_status: blockedStatus,
    tracking_retry_idempotent: checkpointReplay.idempotent_replay,
    stock_committed_once: true,
  }));
} finally {
  if (ephemeralAdminCreated) {
    await db.collection('users').deleteOne({ email: adminEmail, qa_ephemeral: true });
  }
  await mongoose.disconnect();
}
