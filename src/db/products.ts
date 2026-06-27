import { db } from './index.ts';
import { products, salesHistory, forecasts, users } from './schema.ts';
import { eq, and, desc, asc } from 'drizzle-orm';
import { 
  holtWintersForecast, 
  movingAverageForecast, 
  linearRegressionForecast, 
  ar1Forecast 
} from './forecasting.ts';

// 1. Get all products for a user with status
export async function getProductsForUser(userId: number) {
  try {
    const list = await db.select()
      .from(products)
      .where(eq(products.userId, userId))
      .orderBy(asc(products.sku));
    
    return list;
  } catch (error) {
    console.error("Failed to query products:", error);
    throw new Error("Unable to fetch inventory list.", { cause: error });
  }
}

// 2. Get specific product details with its sales history and forecasts
export async function getProductWithData(productId: number, userId: number) {
  try {
    // Verify ownership
    const prodResult = await db.select()
      .from(products)
      .where(and(eq(products.id, productId), eq(products.userId, userId)));
    
    if (prodResult.length === 0) {
      throw new Error("Product not found or access denied.");
    }

    const product = prodResult[0];

    // Fetch sales history
    const sales = await db.select()
      .from(salesHistory)
      .where(eq(salesHistory.productId, productId))
      .orderBy(asc(salesHistory.saleDate));

    // Fetch cached forecasts
    const predicted = await db.select()
      .from(forecasts)
      .where(eq(forecasts.productId, productId))
      .orderBy(asc(forecasts.forecastDate));

    return {
      product,
      sales,
      forecasts: predicted
    };
  } catch (error) {
    console.error(`Failed to fetch details for product ${productId}:`, error);
    throw new Error("Unable to load product metrics.", { cause: error });
  }
}

// 3. Create a new product
export async function createProduct(userId: number, data: {
  sku: string;
  name: string;
  category: string;
  stockLevel: number;
  reorderPoint: number;
  unitPrice: number;
  leadTimeDays: number;
}) {
  try {
    const result = await db.insert(products)
      .values({
        userId,
        sku: data.sku,
        name: data.name,
        category: data.category,
        stockLevel: data.stockLevel,
        reorderPoint: data.reorderPoint,
        unitPrice: data.unitPrice,
        leadTimeDays: data.leadTimeDays,
      })
      .returning();

    // Trigger initial forecast calculation
    await generateAndSaveForecasts(result[0].id);

    return result[0];
  } catch (error) {
    console.error("Failed to create product in DB:", error);
    throw new Error("Could not add product. Ensure SKU is unique.", { cause: error });
  }
}

// 4. Update product properties
export async function updateProduct(productId: number, userId: number, data: Partial<{
  sku: string;
  name: string;
  category: string;
  stockLevel: number;
  reorderPoint: number;
  unitPrice: number;
  leadTimeDays: number;
}>) {
  try {
    const result = await db.update(products)
      .set(data)
      .where(and(eq(products.id, productId), eq(products.userId, userId)))
      .returning();

    if (result.length === 0) {
      throw new Error("Product not found or unauthorized.");
    }

    // Regenerate forecasts in case parameters or historical stock level changed
    await generateAndSaveForecasts(productId);

    return result[0];
  } catch (error) {
    console.error("Failed to update product:", error);
    throw new Error("Unable to update product details.", { cause: error });
  }
}

// 5. Delete product
export async function deleteProduct(productId: number, userId: number) {
  try {
    const result = await db.delete(products)
      .where(and(eq(products.id, productId), eq(products.userId, userId)))
      .returning();

    if (result.length === 0) {
      throw new Error("Product not found or unauthorized.");
    }
    return result[0];
  } catch (error) {
    console.error("Failed to delete product:", error);
    throw new Error("Unable to remove product from inventory.", { cause: error });
  }
}

// 6. Record a transaction / sale
export async function recordSale(productId: number, saleDate: string, quantitySold: number) {
  try {
    const result = await db.insert(salesHistory)
      .values({
        productId,
        saleDate,
        quantitySold,
      })
      .returning();
    
    // Also deduct stock level
    const prod = await db.select().from(products).where(eq(products.id, productId));
    if (prod.length > 0) {
      const newStock = Math.max(0, prod[0].stockLevel - quantitySold);
      await db.update(products).set({ stockLevel: newStock }).where(eq(products.id, productId));
    }

    // Regenerate forecasts with new data point
    await generateAndSaveForecasts(productId);

    return result[0];
  } catch (error) {
    console.error("Failed to record transaction:", error);
    throw new Error("Could not register sales transaction.", { cause: error });
  }
}

// 7. Generate and cache forecasts
export async function generateAndSaveForecasts(productId: number, steps: number = 14) {
  try {
    // Get historical sales
    const sales = await db.select()
      .from(salesHistory)
      .where(eq(salesHistory.productId, productId))
      .orderBy(asc(salesHistory.saleDate));

    if (sales.length === 0) {
      return [];
    }

    const dataSeries = sales.map(s => s.quantitySold);
    
    // Generate dates starting from the day after the last sale date
    const lastSaleDateStr = sales[sales.length - 1].saleDate;
    const lastDate = new Date(lastSaleDateStr);
    const futureDates: string[] = [];
    for (let i = 1; i <= steps; i++) {
      const nextDate = new Date(lastDate);
      nextDate.setDate(lastDate.getDate() + i);
      futureDates.push(nextDate.toISOString().split('T')[0]);
    }

    // Generate forecasts using different mathematical models
    const hwPredictions = holtWintersForecast(dataSeries, 7, steps); // Weekly Seasonality
    const smaPredictions = movingAverageForecast(dataSeries, 7, steps);
    const lrPredictions = linearRegressionForecast(dataSeries, steps);
    const arPredictions = ar1Forecast(dataSeries, steps);

    // Delete existing forecasts for this product
    await db.delete(forecasts).where(eq(forecasts.productId, productId));

    // Prepare inserts
    const insertValues: Array<{
      productId: number;
      forecastDate: string;
      forecastQuantity: number;
      modelType: string;
    }> = [];

    for (let i = 0; i < steps; i++) {
      const fDate = futureDates[i];
      
      insertValues.push({
        productId,
        forecastDate: fDate,
        forecastQuantity: hwPredictions[i],
        modelType: 'Holt-Winters'
      });

      insertValues.push({
        productId,
        forecastDate: fDate,
        forecastQuantity: smaPredictions[i],
        modelType: 'Moving Average'
      });

      insertValues.push({
        productId,
        forecastDate: fDate,
        forecastQuantity: lrPredictions[i],
        modelType: 'Linear Regression'
      });

      insertValues.push({
        productId,
        forecastDate: fDate,
        forecastQuantity: arPredictions[i],
        modelType: 'AR(1) Auto-regressive'
      });
    }

    if (insertValues.length > 0) {
      await db.insert(forecasts).values(insertValues);
    }

    return insertValues;
  } catch (error) {
    console.error(`Error generating forecasts for product ${productId}:`, error);
    return [];
  }
}

// 8. Seed sample data for high fidelity presentation
export async function seedSampleData(userId: number) {
  try {
    // Check if user already has products
    const existing = await db.select().from(products).where(eq(products.userId, userId));
    if (existing.length > 0) {
      return; // Already seeded
    }

    console.log("Seeding high fidelity sales & products for user id:", userId);

    const sampleProducts = [
      {
        sku: "ELEC-A50",
        name: "Smart Home Assistant Hub",
        category: "Electronics",
        stockLevel: 45,
        reorderPoint: 35,
        unitPrice: 89.99,
        leadTimeDays: 5,
        baseSales: 25,
        trendFactor: 0.15, // steady growth
        seasonality: [12, -8, -15, 5, 20, 35, 15] // weekend surge (Mon=12, Tue=-8, ..., Sat=35, Sun=15)
      },
      {
        sku: "GROC-W10",
        name: "Organic Nitro Cold Brew Case",
        category: "Groceries",
        stockLevel: 12,
        reorderPoint: 25, // currently below reorder!
        unitPrice: 34.50,
        leadTimeDays: 3,
        baseSales: 15,
        trendFactor: 0.05,
        seasonality: [2, 5, 8, 12, 18, 5, -5] // mid-week / office rush
      },
      {
        sku: "APPA-T22",
        name: "All-Weather Technical Windbreaker",
        category: "Apparel",
        stockLevel: 68,
        reorderPoint: 15,
        unitPrice: 120.00,
        leadTimeDays: 10,
        baseSales: 8,
        trendFactor: -0.02, // slight downward trend
        seasonality: [1, 2, -1, 3, 5, 10, -5]
      },
      {
        sku: "OFFI-P11",
        name: "Ergonomic Pneumatic Task Chair",
        category: "Office Supplies",
        stockLevel: 8,
        reorderPoint: 10, // below reorder!
        unitPrice: 249.99,
        leadTimeDays: 14,
        baseSales: 4,
        trendFactor: 0.01,
        seasonality: [0, 1, 2, -1, 0, -2, -3] // quiet weekends
      }
    ];

    // Build historical dates for the last 30 days
    const today = new Date();
    const historyDays = 30;
    const dateStrings: string[] = [];
    for (let i = historyDays; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dateStrings.push(d.toISOString().split('T')[0]);
    }

    for (const p of sampleProducts) {
      // Insert product
      const [prod] = await db.insert(products)
        .values({
          userId,
          sku: p.sku,
          name: p.name,
          category: p.category,
          stockLevel: p.stockLevel,
          reorderPoint: p.reorderPoint,
          unitPrice: p.unitPrice,
          leadTimeDays: p.leadTimeDays,
        })
        .returning();

      // Generate realistic daily sales
      const salesInserts: Array<{ productId: number; saleDate: string; quantitySold: number }> = [];
      
      for (let dayIdx = 0; dayIdx < dateStrings.length; dayIdx++) {
        const dStr = dateStrings[dayIdx];
        const dayOfWeek = new Date(dStr).getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        
        // Base sales + trend + seasonal variance + random noise
        const trend = p.trendFactor * dayIdx;
        const seasonal = p.seasonality[dayOfWeek] || 0;
        const noise = Math.sin(dayIdx * 0.5) * 4 + (Math.random() - 0.5) * 6;
        
        const qty = Math.max(1, Math.round(p.baseSales + trend + seasonal + noise));
        
        salesInserts.push({
          productId: prod.id,
          saleDate: dStr,
          quantitySold: qty
        });
      }

      if (salesInserts.length > 0) {
        await db.insert(salesHistory).values(salesInserts);
      }

      // Generate corresponding forecasts
      await generateAndSaveForecasts(prod.id);
    }

    console.log("Seeding complete!");
  } catch (error) {
    console.error("Error seeding sample inventory data:", error);
  }
}
