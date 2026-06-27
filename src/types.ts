export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  stockLevel: number;
  reorderPoint: number;
  unitPrice: number;
  leadTimeDays: number;
  createdAt: string;
}

export interface SaleEntry {
  id: number;
  productId: number;
  saleDate: string;
  quantitySold: number;
  createdAt: string;
}

export interface ForecastEntry {
  id: number;
  productId: number;
  forecastDate: string;
  forecastQuantity: number;
  modelType: string;
  createdAt: string;
}

export interface InventoryAnalysis {
  demandOutlook: string;
  recommendedReorderPoint: number;
  recommendedRestockQuantity: number;
  supplierUrgency: "LOW" | "MEDIUM" | "HIGH";
  anomaliesDetected: string;
  actionItems: string[];
}
