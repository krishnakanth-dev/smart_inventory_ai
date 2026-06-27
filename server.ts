import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import { 
  getProductsForUser, 
  getProductWithData, 
  createProduct, 
  updateProduct, 
  deleteProduct, 
  recordSale, 
  seedSampleData 
} from './src/db/products.ts';
import { analyzeProductDemand } from './src/lib/gemini.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parsers
  app.use(express.json());

  // --- API ROUTES FIRST ---

  // 1. Authenticate and sync user (seeds mock data for new users)
  app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      // Seed high-fidelity mock product portfolio and transaction history on first login
      await seedSampleData(user.dbId);
      res.json({ success: true, dbId: user.dbId, email: user.email });
    } catch (error: any) {
      console.error("Auth sync route failed:", error);
      res.status(500).json({ error: error.message || "User synchronization failed" });
    }
  });

  // 2. Get all products for the logged-in user
  app.get('/api/products', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const list = await getProductsForUser(user.dbId);
      res.json(list);
    } catch (error: any) {
      console.error("GET /api/products failed:", error);
      res.status(500).json({ error: error.message || "Failed to retrieve products." });
    }
  });

  // 3. Create a new product
  app.post('/api/products', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const { sku, name, category, stockLevel, reorderPoint, unitPrice, leadTimeDays } = req.body;

      if (!sku || !name || !category) {
        return res.status(400).json({ error: "SKU, Name, and Category are required fields." });
      }

      const product = await createProduct(user.dbId, {
        sku,
        name,
        category,
        stockLevel: Number(stockLevel) || 0,
        reorderPoint: Number(reorderPoint) || 10,
        unitPrice: Number(unitPrice) || 0,
        leadTimeDays: Number(leadTimeDays) || 7
      });

      res.status(21)
      res.status(201).json(product);
    } catch (error: any) {
      console.error("POST /api/products failed:", error);
      res.status(500).json({ error: error.message || "Failed to create inventory item." });
    }
  });

  // 4. Get deep metrics, history, and statistical forecasts for a single product
  app.get('/api/products/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const productId = Number(req.params.id);

      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product identifier." });
      }

      const details = await getProductWithData(productId, user.dbId);
      res.json(details);
    } catch (error: any) {
      console.error(`GET /api/products/${req.params.id} failed:`, error);
      res.status(500).json({ error: error.message || "Failed to retrieve product analytics." });
    }
  });

  // 5. Update a product
  app.patch('/api/products/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const productId = Number(req.params.id);

      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product identifier." });
      }

      const updated = await updateProduct(productId, user.dbId, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error(`PATCH /api/products/${req.params.id} failed:`, error);
      res.status(500).json({ error: error.message || "Failed to update product." });
    }
  });

  // 6. Delete a product
  app.delete('/api/products/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const productId = Number(req.params.id);

      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product identifier." });
      }

      await deleteProduct(productId, user.dbId);
      res.json({ success: true });
    } catch (error: any) {
      console.error(`DELETE /api/products/${req.params.id} failed:`, error);
      res.status(500).json({ error: error.message || "Failed to delete product." });
    }
  });

  // 7. Record a sales transaction
  app.post('/api/products/:id/sales', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const productId = Number(req.params.id);
      const { saleDate, quantitySold } = req.body;

      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product identifier." });
      }

      if (!saleDate || isNaN(Number(quantitySold)) || Number(quantitySold) <= 0) {
        return res.status(400).json({ error: "Valid saleDate and positive quantitySold are required." });
      }

      // Verify product ownership before modifying transactions
      const details = await getProductWithData(productId, user.dbId);
      if (!details) {
        return res.status(404).json({ error: "Product not found." });
      }

      const sale = await recordSale(productId, saleDate, Number(quantitySold));
      res.status(201).json(sale);
    } catch (error: any) {
      console.error(`POST /api/products/${req.params.id}/sales failed:`, error);
      res.status(500).json({ error: error.message || "Failed to record transaction." });
    }
  });

  // 8. Call Gemini AI for Smart forecasting insights and Restocking Plan
  app.get('/api/products/:id/ai-analysis', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const productId = Number(req.params.id);

      if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product identifier." });
      }

      const details = await getProductWithData(productId, user.dbId);
      const analysis = await analyzeProductDemand(
        details.product,
        details.sales,
        details.forecasts
      );

      res.json(analysis);
    } catch (error: any) {
      console.error(`GET /api/products/${req.params.id}/ai-analysis failed:`, error);
      res.status(500).json({ error: error.message || "AI Analysis failed." });
    }
  });

  // --- VITE DEV SERVER OR STATIC FILE SERVING ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log("Vite development server mounted.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log("Serving production build from:", distPath);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Express application server running on http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode.`);
  });
}

startServer();
