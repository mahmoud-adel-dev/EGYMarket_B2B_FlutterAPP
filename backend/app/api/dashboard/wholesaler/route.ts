import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import Product from '@/models/Product';
import Order from '@/models/Order';
import PaymentObligation from '@/models/PaymentObligation';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

export const GET = withAuth(['Wholesaler'], async (req, context, session) => {
  const organizationId = session.user.organizationId;
  const organizationObjectId = new mongoose.Types.ObjectId(organizationId);
  const [products, orders, revenue] = await Promise.all([
    Product.find({ organization_id: organizationId, status: { $ne: 'archived' } })
      .select('+cost_price_piasters')
      .limit(2000)
      .lean(),
    Order.find({ seller_organization_id: organizationId }).sort({ createdAt: -1 }).limit(2000).lean(),
    PaymentObligation.aggregate([
      { $match: { beneficiary_organization_id: organizationObjectId, kind: 'goods', status: 'confirmed' } },
      { $group: { _id: null, amount: { $sum: '$amount_piasters' }, count: { $sum: 1 } } },
    ]),
  ]);

  const activeStatuses = new Set(['requested', 'awaiting_payments', 'preparing', 'ready_for_pickup', 'in_transit']);
  const saleStatuses = new Set(['delivered', 'completed']);
  const salesOrders = orders.filter((order) => saleStatuses.has(order.status));
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));
  const performance = new Map<string, { units: number; sales: number; cost: number; orders: Set<string> }>();
  let grossSales = 0;
  let unitsSold = 0;
  let estimatedCost = 0;
  for (const order of salesOrders) {
    for (const item of order.items) {
      const productId = item.product_id.toString();
      const product = productMap.get(productId);
      const unitCost = product?.cost_price_piasters || Math.round(item.unit_price_piasters * 0.7);
      grossSales += item.subtotal_piasters;
      unitsSold += item.quantity;
      estimatedCost += unitCost * item.quantity;
      const row = performance.get(productId) || { units: 0, sales: 0, cost: 0, orders: new Set<string>() };
      row.units += item.quantity;
      row.sales += item.subtotal_piasters;
      row.cost += unitCost * item.quantity;
      row.orders.add(order._id.toString());
      performance.set(productId, row);
    }
  }

  let totalStock = 0;
  let availableStock = 0;
  let inventoryRetailValue = 0;
  let inventoryCostValue = 0;
  let lowStockProducts = 0;
  let outOfStockProducts = 0;
  for (const product of products) {
    const available = Math.max(0, product.stock_quantity - product.reserved_quantity);
    const cost = product.cost_price_piasters || Math.round(product.price_piasters * 0.7);
    totalStock += product.stock_quantity;
    availableStock += available;
    inventoryRetailValue += available * product.price_piasters;
    inventoryCostValue += available * cost;
    if (available === 0) outOfStockProducts += 1;
    else if (available <= Math.max(product.moq * 2, 10)) lowStockProducts += 1;
  }

  const productPerformance = products.map((product) => {
    const row = performance.get(product._id.toString()) || { units: 0, sales: 0, cost: 0, orders: new Set<string>() };
    const available = Math.max(0, product.stock_quantity - product.reserved_quantity);
    const totalFlow = available + row.units;
    return {
      product_id: product._id.toString(),
      sku: product.sku || '',
      title: product.title,
      category: product.category,
      unit: product.unit,
      stock_quantity: product.stock_quantity,
      available_quantity: available,
      units_sold: row.units,
      orders_count: row.orders.size,
      sales_piasters: row.sales,
      estimated_cost_piasters: row.cost,
      gross_profit_piasters: row.sales - row.cost,
      sell_through_percent: totalFlow ? Math.round((row.units / totalFlow) * 1000) / 10 : 0,
    };
  }).sort((a, b) => b.sales_piasters - a.sales_piasters);

  const monthFormatter = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit' });
  const monthKeys = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - (5 - index));
    return monthFormatter.format(date);
  });
  const monthlyMap = new Map(monthKeys.map((key) => [key, { sales: 0, orders: 0 }]));
  for (const order of salesOrders) {
    const key = monthFormatter.format(new Date(order.createdAt));
    const month = monthlyMap.get(key);
    if (month) {
      month.sales += order.goods_subtotal_piasters;
      month.orders += 1;
    }
  }
  const statusBreakdown = orders.reduce<Record<string, number>>((accumulator, order) => {
    accumulator[order.status] = (accumulator[order.status] || 0) + 1;
    return accumulator;
  }, {});

  return NextResponse.json({
    success: true,
    currency: 'EGP',
    metrics: {
      total_products: products.length,
      active_orders: orders.filter((order) => activeStatuses.has(order.status)).length,
      total_orders: orders.length,
      confirmed_revenue_piasters: revenue[0]?.amount || grossSales,
      confirmed_payments_count: revenue[0]?.count || salesOrders.length,
      gross_profit_piasters: grossSales - estimatedCost,
      available_stock_units: availableStock,
    },
    report: {
      sales: {
        gross_sales_piasters: grossSales,
        estimated_cost_piasters: estimatedCost,
        gross_profit_piasters: grossSales - estimatedCost,
        units_sold: unitsSold,
        completed_orders: salesOrders.length,
      },
      inventory: {
        total_units: totalStock,
        available_units: availableStock,
        reserved_units: totalStock - availableStock,
        retail_value_piasters: inventoryRetailValue,
        estimated_cost_value_piasters: inventoryCostValue,
        potential_margin_piasters: inventoryRetailValue - inventoryCostValue,
        low_stock_products: lowStockProducts,
        out_of_stock_products: outOfStockProducts,
      },
      monthly_sales: monthKeys.map((month) => ({ month, ...monthlyMap.get(month)! })),
      order_status: statusBreakdown,
      product_performance: productPerformance,
      calculation_note: 'Profit uses the saved cost price; products without one are estimated at 70% of their selling price.',
    },
  });
});
