import { useState, useEffect, FormEvent } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth } from './lib/firebase.ts';
import LoginScreen from './components/LoginScreen.tsx';
import { 
  Product, 
  SaleEntry, 
  ForecastEntry, 
  InventoryAnalysis 
} from './types.ts';
import { 
  TrendingUp, 
  Sparkles, 
  AlertTriangle, 
  RefreshCw, 
  Plus, 
  LogOut, 
  Layers, 
  DollarSign, 
  Calendar, 
  ShoppingBag, 
  Truck, 
  History, 
  Check, 
  X,
  Sliders,
  ChevronRight,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authToken, setAuthToken] = useState<string>('');

  // Dashboard Data State
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [forecasts, setForecasts] = useState<ForecastEntry[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<InventoryAnalysis | null>(null);

  // Loading States
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);

  // Selected Model to plot
  const [activeModel, setActiveModel] = useState<string>('Holt-Winters');

  // Interactive controls
  const [showAddForm, setShowAddForm] = useState(false);
  const [saleQty, setSaleQty] = useState<number>(5);
  const [saleDate, setSaleDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Editing controls for selected product
  const [editStock, setEditStock] = useState<number>(0);
  const [editReorder, setEditReorder] = useState<number>(0);
  const [editLeadTime, setEditLeadTime] = useState<number>(0);
  const [updatingParams, setUpdatingParams] = useState(false);

  // New Product Form State
  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Electronics');
  const [newStock, setNewStock] = useState(50);
  const [newReorder, setNewReorder] = useState(15);
  const [newPrice, setNewPrice] = useState(99.99);
  const [newLeadTime, setNewLeadTime] = useState(7);
  const [submittingProduct, setSubmittingProduct] = useState(false);

  // Message notifications
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // 1. Monitor Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setCurrentUser(firebaseUser);
        const idToken = await firebaseUser.getIdToken();
        setAuthToken(idToken);
        
        // Synchronize authenticated user profile with Postgres, seeding default products if new
        try {
          const res = await fetch('/api/auth/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            }
          });
          if (!res.ok) throw new Error("Synchronization failure");
          
          // Load products
          fetchProducts(idToken);
        } catch (err) {
          console.error("Auth syncing with server failed:", err);
          showNotification("Server synchronization failed, attempting to load products.", "error");
          fetchProducts(idToken);
        }
      } else {
        setCurrentUser(null);
        setAuthToken('');
        setProducts([]);
        setSelectedProduct(null);
        setSales([]);
        setForecasts([]);
        setAiAnalysis(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setNotification({ text, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // 2. Fetch all products from the backend database
  const fetchProducts = async (token = authToken, selectId?: number) => {
    setLoadingProducts(true);
    try {
      const res = await fetch('/api/products', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Could not retrieve inventory items.");
      const data = await res.json();
      setProducts(data);
      
      if (data.length > 0) {
        // Auto select a product to display metric graphs
        const target = selectId ? data.find((p: Product) => p.id === selectId) : null;
        const toSelect = target || data[0];
        setSelectedProduct(toSelect);
        fetchProductDetails(toSelect.id, token);
      } else {
        setSelectedProduct(null);
      }
    } catch (err: any) {
      console.error(err);
      showNotification("Database query failed. Please refresh.", "error");
    } finally {
      setLoadingProducts(false);
    }
  };

  // 3. Fetch specific sales history and forecasts for a selected product
  const fetchProductDetails = async (productId: number, token = authToken) => {
    setLoadingDetails(true);
    setAiAnalysis(null); // Clear previous AI Insights
    try {
      const res = await fetch(`/api/products/${productId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Could not load product analysis.");
      const data = await res.json();
      
      setSales(data.sales);
      setForecasts(data.forecasts);
      
      // Initialize editing fields
      setEditStock(data.product.stockLevel);
      setEditReorder(data.product.reorderPoint);
      setEditLeadTime(data.product.leadTimeDays);

      // Auto trigger AI Insight if empty
      fetchAiAnalysis(productId, token);
    } catch (err: any) {
      console.error(err);
      showNotification("Error loading product statistics.", "error");
    } finally {
      setLoadingDetails(false);
    }
  };

  // 4. Update core product parameters in the database
  const handleUpdateParams = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setUpdatingParams(true);
    try {
      const res = await fetch(`/api/products/${selectedProduct.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          stockLevel: Number(editStock),
          reorderPoint: Number(editReorder),
          leadTimeDays: Number(editLeadTime)
        })
      });

      if (!res.ok) throw new Error("Failed to write updates.");
      const updatedProduct = await res.json();
      
      // Update local state
      setSelectedProduct(updatedProduct);
      setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
      
      // Refresh detailed list and forecasts (as reorder points shape calculations)
      await fetchProductDetails(updatedProduct.id);
      showNotification("Product configurations successfully applied.", "success");
    } catch (err: any) {
      console.error(err);
      showNotification("Configuration update failed.", "error");
    } finally {
      setUpdatingParams(false);
    }
  };

  // 5. Register a daily sales transaction
  const handleRecordSale = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    if (saleQty <= 0) {
      showNotification("Quantity sold must be greater than zero.", "error");
      return;
    }

    try {
      const res = await fetch(`/api/products/${selectedProduct.id}/sales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          saleDate,
          quantitySold: Number(saleQty)
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Could not register sales entry.");
      }
      
      showNotification(`Sales transaction of ${saleQty} units recorded successfully!`, "success");
      
      // Refresh products & detailed charts
      await fetchProducts(authToken, selectedProduct.id);
    } catch (err: any) {
      console.error(err);
      showNotification(err.message || "Failed to submit transaction.", "error");
    }
  };

  // 6. Request Gemini AI Analysis & Strategy Plan
  const fetchAiAnalysis = async (productId: number, token = authToken) => {
    setLoadingAi(true);
    try {
      const res = await fetch(`/api/products/${productId}/ai-analysis`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Gemini analysis server returned error");
      const data = await res.json();
      setAiAnalysis(data);
    } catch (err: any) {
      console.error("AI Error:", err);
      showNotification("AI Analytics currently unavailable. Showing standard forecasts.", "error");
    } finally {
      setLoadingAi(false);
    }
  };

  // 7. Add a new product to PostgreSQL inventory
  const handleAddProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!newSku || !newName) {
      showNotification("Please provide SKU and Product Name", "error");
      return;
    }
    setSubmittingProduct(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          sku: newSku.toUpperCase().trim(),
          name: newName.trim(),
          category: newCategory,
          stockLevel: Number(newStock),
          reorderPoint: Number(newReorder),
          unitPrice: Number(newPrice),
          leadTimeDays: Number(newLeadTime)
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create product");
      }
      const added = await res.json();
      showNotification(`Product ${added.sku} added and forecasted successfully!`, "success");
      
      // Reset form & reload
      setNewSku('');
      setNewName('');
      setNewStock(50);
      setNewReorder(15);
      setNewPrice(99.99);
      setNewLeadTime(7);
      setShowAddForm(false);
      
      await fetchProducts(authToken, added.id);
    } catch (err: any) {
      console.error(err);
      showNotification(err.message || "Unique SKU is required.", "error");
    } finally {
      setSubmittingProduct(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign out error", err);
    }
  };

  // Chart Data Assembly (Interweaving history with forecast models)
  const getChartData = () => {
    const dataPoints: Array<{
      date: string;
      actual?: number;
      forecast?: number;
      reorderPoint?: number;
    }> = [];

    // 1. Add historical actual sales
    sales.forEach(s => {
      dataPoints.push({
        date: s.saleDate,
        actual: s.quantitySold,
        reorderPoint: selectedProduct?.reorderPoint
      });
    });

    // 2. Add future forecasts
    const activeForecasts = forecasts.filter(f => f.modelType === activeModel);
    activeForecasts.forEach(f => {
      dataPoints.push({
        date: f.forecastDate,
        forecast: Math.round(f.forecastQuantity * 10) / 10,
        reorderPoint: selectedProduct?.reorderPoint
      });
    });

    // Sort chronologically
    return dataPoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  // Metrics calculators
  const lowStockProductsCount = products.filter(p => p.stockLevel <= p.reorderPoint).length;
  const outOfStockCount = products.filter(p => p.stockLevel === 0).length;
  const totalValue = products.reduce((acc, p) => acc + (p.stockLevel * p.unitPrice), 0);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-zinc-200 border-t-blue-600 rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-zinc-500 font-sans">Connecting to secure Cloud SQL...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen />;
  }

  const chartData = getChartData();
  const lastSaleDate = sales.length > 0 ? sales[sales.length - 1].saleDate : '';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans">
      
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-md shadow-md border text-sm font-medium ${
              notification.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-150' 
                : 'bg-red-50 text-red-800 border-red-150'
            }`}
          >
            {notification.type === 'success' ? <Check className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>{notification.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-40 px-6 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm">
            Σ
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight font-display">
              SmartStock AI <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100 font-medium ml-2">Cloud SQL Postgres</span>
            </h1>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-slate-700 font-display">{currentUser.displayName || currentUser.email}</p>
            <p className="text-[10px] text-slate-400 font-mono">Manager role</p>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-xs font-semibold text-slate-500 rounded-md hover:bg-slate-50 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Primary Dashboard Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Metric Cards Bento Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          <div className="bg-white p-5 rounded-xl border border-slate-200 flex items-center justify-between shadow-sm">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">SKUs Tracked</span>
              <p className="text-2xl font-bold text-slate-900 mt-1">{products.length}</p>
            </div>
            <div className="p-3 bg-slate-50 text-slate-500 rounded-lg border border-slate-100">
              <Layers className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 flex items-center justify-between shadow-sm">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Low Stock Alerts</span>
              <p className={`text-2xl font-bold mt-1 ${lowStockProductsCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                {lowStockProductsCount}
              </p>
            </div>
            <div className={`p-3 rounded-lg border ${lowStockProductsCount > 0 ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 flex items-center justify-between shadow-sm">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Out of Stock</span>
              <p className={`text-2xl font-bold mt-1 ${outOfStockCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                {outOfStockCount}
              </p>
            </div>
            <div className={`p-3 rounded-lg border ${outOfStockCount > 0 ? 'bg-red-50 text-red-600 border-red-100 animate-pulse' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 flex items-center justify-between shadow-sm">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Asset Valuation</span>
              <p className="text-2xl font-bold text-slate-900 mt-1">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="p-3 bg-slate-50 text-slate-500 rounded-lg border border-slate-100">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>

        </div>

        {/* Core Layout Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Product Selector & Controls (Width: 4/12) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* 1. Interactive SKU Selector List */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-bold text-slate-800 text-sm font-display flex items-center gap-1.5">
                  <ShoppingBag className="h-4 w-4 text-blue-600" />
                  Inventory Portfolio
                </h3>
                <button
                  id="add-product-btn"
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  <span>New Product</span>
                </button>
              </div>

              {/* Add Product Inline Form */}
              <AnimatePresence>
                {showAddForm && (
                  <motion.form 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    onSubmit={handleAddProduct}
                    className="p-4 bg-slate-50/50 border-b border-slate-200 space-y-3 overflow-hidden text-xs"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">SKU Code</label>
                        <input 
                          type="text" 
                          required 
                          placeholder="E.g. APPA-T10"
                          value={newSku} 
                          onChange={e => setNewSku(e.target.value)}
                          className="w-full mt-1 p-2 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Category</label>
                        <select 
                          value={newCategory} 
                          onChange={e => setNewCategory(e.target.value)}
                          className="w-full mt-1 p-2 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="Electronics">Electronics</option>
                          <option value="Groceries">Groceries</option>
                          <option value="Apparel">Apparel</option>
                          <option value="Office Supplies">Office Supplies</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Product Name</label>
                      <input 
                        type="text" 
                        required 
                        placeholder="E.g. Waterproof Smart Jacket"
                        value={newName} 
                        onChange={e => setNewName(e.target.value)}
                        className="w-full mt-1 p-2 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Stock Level</label>
                        <input 
                          type="number" 
                          min="0"
                          value={newStock} 
                          onChange={e => setNewStock(Number(e.target.value))}
                          className="w-full mt-1 p-2 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Reorder Point</label>
                        <input 
                          type="number" 
                          min="0"
                          value={newReorder} 
                          onChange={e => setNewReorder(Number(e.target.value))}
                          className="w-full mt-1 p-2 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Unit Price ($)</label>
                        <input 
                          type="number" 
                          step="0.01"
                          min="0"
                          value={newPrice} 
                          onChange={e => setNewPrice(Number(e.target.value))}
                          className="w-full mt-1 p-2 border border-slate-200 rounded-md bg-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Lead Time (Days)</label>
                        <input 
                          type="number" 
                          min="1"
                          value={newLeadTime} 
                          onChange={e => setNewLeadTime(Number(e.target.value))}
                          className="w-full mt-1 p-2 border border-slate-200 rounded-md bg-white focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button 
                        type="submit" 
                        disabled={submittingProduct}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-md font-medium transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {submittingProduct ? "Creating SKU..." : "Save Product & Forecast"}
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setShowAddForm(false)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-2 rounded-md font-medium transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              {/* SKU List */}
              <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
                {loadingProducts ? (
                  <div className="p-6 text-center text-xs text-slate-400">Loading catalog...</div>
                ) : products.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">No products tracked. Click NEW to begin.</div>
                ) : (
                  products.map(p => {
                    const isLow = p.stockLevel <= p.reorderPoint;
                    const isSelected = selectedProduct?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedProduct(p);
                          fetchProductDetails(p.id);
                        }}
                        className={`w-full text-left p-3.5 flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected ? 'bg-blue-50/75 border-l-4 border-blue-600' : 'hover:bg-slate-50 border-l-4 border-transparent'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-slate-900">{p.sku}</span>
                            <span className="text-[10px] text-slate-500 font-medium px-1.5 py-0.5 bg-slate-100 rounded">{p.category}</span>
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-1">{p.name}</p>
                        </div>
                        
                        <div className="text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <span className={`text-xs font-bold ${isLow ? 'text-red-600' : 'text-slate-900'}`}>
                              {p.stockLevel} units
                            </span>
                          </div>
                          <span className={`text-[9px] font-bold uppercase tracking-wider ${isLow ? 'text-red-500' : 'text-green-600'}`}>
                            {isLow ? "Low Stock" : "Optimal"}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* 2. Record Transaction Form */}
            {selectedProduct && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center gap-1.5 border-b border-slate-100 pb-3">
                  <History className="h-4 w-4 text-blue-600" />
                  <h3 className="font-bold text-slate-800 text-sm">Log Daily Transactions</h3>
                </div>
                <form onSubmit={handleRecordSale} className="space-y-3.5 text-xs">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Sales Transaction Date</label>
                    <div className="mt-1 relative rounded-md">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <input 
                        type="date"
                        required
                        max={new Date().toISOString().split('T')[0]}
                        value={saleDate}
                        onChange={e => setSaleDate(e.target.value)}
                        className="w-full pl-9 p-2.5 border border-slate-200 rounded-md bg-white text-slate-800 font-sans focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Quantity Sold</label>
                    <div className="mt-1 relative rounded-md">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-mono text-xs">
                        Qty
                      </div>
                      <input 
                        type="number"
                        required
                        min="1"
                        max="5000"
                        value={saleQty}
                        onChange={e => setSaleQty(Number(e.target.value))}
                        className="w-full pl-11 p-2.5 border border-slate-200 rounded-md bg-white text-slate-800 font-sans focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <button
                    id="log-sale-btn"
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-md transition-colors shadow-sm cursor-pointer"
                  >
                    Register Transaction & Forecast
                  </button>
                </form>
              </div>
            )}

            {/* 3. Operational Parameter Config */}
            {selectedProduct && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center gap-1.5 border-b border-slate-100 pb-3">
                  <Sliders className="h-4 w-4 text-blue-600" />
                  <h3 className="font-bold text-slate-800 text-sm">Operational Variables</h3>
                </div>
                <form onSubmit={handleUpdateParams} className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Current Stock</label>
                      <input 
                        type="number"
                        min="0"
                        value={editStock}
                        onChange={e => setEditStock(Number(e.target.value))}
                        className="w-full mt-1 p-2.5 border border-slate-200 bg-slate-50/50 rounded-md font-sans focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Reorder Level</label>
                      <input 
                        type="number"
                        min="0"
                        value={editReorder}
                        onChange={e => setEditReorder(Number(e.target.value))}
                        className="w-full mt-1 p-2.5 border border-slate-200 bg-slate-50/50 rounded-md font-sans focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Supplier Lead Time (Days)</label>
                    <div className="mt-1 relative rounded-md">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Truck className="h-4 w-4" />
                      </div>
                      <input 
                        type="number"
                        min="1"
                        value={editLeadTime}
                        onChange={e => setEditLeadTime(Number(e.target.value))}
                        className="w-full pl-9 p-2.5 border border-slate-200 bg-slate-50/50 rounded-md font-sans focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <button
                    id="update-params-btn"
                    type="submit"
                    disabled={updatingParams}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {updatingParams ? "Applying variables..." : "Apply Configurations"}
                  </button>
                </form>
              </div>
            )}

          </div>

          {/* Right Column: Interactive Forecasting Chart & AI Planning (Width: 8/12) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* 1. Analytical Forecast Chart */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              
              {selectedProduct ? (
                <>
                  <div className="sm:flex sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-700 px-2 py-0.5 bg-blue-50 rounded border border-blue-100">
                          {selectedProduct.sku}
                        </span>
                        <h2 className="text-lg font-bold text-slate-900">
                          {selectedProduct.name}
                        </h2>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Historical actual demand side-by-side with 14-day projections.
                      </p>
                    </div>

                    {/* Model Switch Selector */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
                      {['Holt-Winters', 'Moving Average', 'Linear Regression', 'AR(1) Auto-regressive'].map(m => (
                        <button
                          key={m}
                          onClick={() => setActiveModel(m)}
                          className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                            activeModel === m 
                              ? 'bg-white text-slate-950 font-semibold shadow-xs' 
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          {m === 'AR(1) Auto-regressive' ? 'AR(1)' : m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* The Recharts Area chart */}
                  <div className="h-[350px] w-full pt-2">
                    {loadingDetails ? (
                      <div className="h-full flex items-center justify-center text-xs text-slate-400">
                        Regenerating modeling matrices...
                      </div>
                    ) : chartData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-slate-400">
                        Insufficient sales transaction records for mathematical plotting.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15}/>
                              <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis 
                            dataKey="date" 
                            stroke="#64748b" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false}
                            tickFormatter={(tick) => {
                              try {
                                const parts = tick.split('-');
                                return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : tick;
                              } catch {
                                return tick;
                              }
                            }}
                          />
                          <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: '#ffffff', 
                              border: '1px solid #e2e8f0', 
                              borderRadius: '8px',
                              fontSize: '12px'
                            }}
                            labelClassName="font-semibold text-slate-900"
                          />
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                          
                          {/* Reference vertical line separating history from forecast */}
                          {lastSaleDate && (
                            <ReferenceLine 
                              x={lastSaleDate} 
                              stroke="#cbd5e1" 
                              strokeDasharray="4 4"
                              label={{ value: 'Projected Horizon →', position: 'top', fill: '#64748b', fontSize: 9, fontWeight: 600 }} 
                            />
                          )}

                          {/* Horizontal reorder point alert reference */}
                          {selectedProduct?.reorderPoint && (
                            <ReferenceLine 
                              y={selectedProduct.reorderPoint} 
                              stroke="#ef4444" 
                              strokeWidth={1}
                              strokeDasharray="3 3"
                              label={{ value: 'Reorder Level', position: 'insideRight', fill: '#ef4444', fontSize: 9, fontWeight: 500 }} 
                            />
                          )}

                          <Area 
                            name="Actual Sales"
                            type="monotone" 
                            dataKey="actual" 
                            stroke="#2563eb" 
                            strokeWidth={2.5}
                            fillOpacity={1} 
                            fill="url(#colorActual)" 
                            connectNulls
                          />
                          <Area 
                            name={`${activeModel} Forecast`}
                            type="monotone" 
                            dataKey="forecast" 
                            stroke="#3b82f6" 
                            strokeWidth={2.5}
                            strokeDasharray="5 5"
                            fillOpacity={1} 
                            fill="url(#colorForecast)" 
                            connectNulls
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div className="flex gap-3.5 p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                    <div className="shrink-0 text-blue-600 mt-0.5">
                      <Info className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Model Context & Parameters</p>
                      <p className="text-slate-500 mt-1 leading-relaxed">
                        {activeModel === 'Holt-Winters' && "Triple Exponential Smoothing: Accounts for recent sales levels, persistent trend multipliers, and weekly season cycle offsets (L=7). Best suited for items experiencing weekend demand spikes."}
                        {activeModel === 'Moving Average' && "Simple Moving Average: Computes a flat rolling-mean projection of the last 7 transaction days. Excellent for baseline items with stable, noise-free volumes."}
                        {activeModel === 'Linear Regression' && "Linear Trend Projection: Applies a least-squares straight-line regression over the historical dates and projects the slope forward. Best for long-term trending items."}
                        {activeModel === 'AR(1) Auto-regressive' && "Auto-Regressive Lag-1: Fits X_t based on its immediate previous step value to model autoregressive persistence with convergence bounds. Highly responsive to immediate short-term peaks."}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-[400px] flex items-center justify-center text-slate-400 text-xs">
                  Create or select an inventory product to open demand forecasts.
                </div>
              )}

            </div>

            {/* 2. Gemini AI Smart Assistant Insights */}
            {selectedProduct && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                
                {/* AI Card Header */}
                <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-600 text-white rounded-md">
                      <Sparkles className="h-4 w-4 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm">Gemini AI Executive Strategy Plan</h3>
                      <p className="text-[10px] text-slate-300">Cognitive demand analysis & automated restocking guidance</p>
                    </div>
                  </div>
                  
                  <button
                    id="re-analyze-btn"
                    onClick={() => fetchAiAnalysis(selectedProduct.id)}
                    disabled={loadingAi}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                  >
                    <RefreshCw className={`h-3 w-3 ${loadingAi ? 'animate-spin' : ''}`} />
                    <span>Recalculate</span>
                  </button>
                </div>

                {/* AI Content */}
                <div className="p-5 space-y-5 text-sm">
                  {loadingAi ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-3">
                      <div className="h-6 w-6 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
                      <span className="text-xs text-slate-500">Gemini is running cognitive demand matrices...</span>
                    </div>
                  ) : aiAnalysis ? (
                    <div className="space-y-5">
                      
                      {/* Grid: Outlook and Variables */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        {/* Outlook Column */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Demand Outlook</span>
                          <p className="text-xs text-slate-600 bg-slate-50 p-3.5 rounded-lg border border-slate-200 leading-relaxed">
                            {aiAnalysis.demandOutlook}
                          </p>
                        </div>

                        {/* Variables Column */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Variance & Anomalies</span>
                          <p className="text-xs text-slate-600 bg-slate-50 p-3.5 rounded-lg border border-slate-200 leading-relaxed">
                            {aiAnalysis.anomaliesDetected}
                          </p>
                        </div>

                      </div>

                      {/* Replenishment Target Cards */}
                      <div className="bg-blue-50/40 p-4 rounded-lg border border-blue-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        
                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider block">Target Trigger Point</span>
                          <p className="text-lg font-bold text-blue-900">
                            {aiAnalysis.recommendedReorderPoint} units
                          </p>
                          <span className="text-[9px] text-blue-600/80 block leading-tight">
                            Adjust reorder thresholds for safety buffers.
                          </span>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider block">Ideal Order Size</span>
                          <p className="text-lg font-bold text-blue-900">
                            {aiAnalysis.recommendedRestockQuantity} units
                          </p>
                          <span className="text-[9px] text-blue-600/80 block leading-tight">
                            Economical supplier volume calculated.
                          </span>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider block">Supplier Order Urgency</span>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`text-xs font-bold px-2 py-1 rounded ${
                              aiAnalysis.supplierUrgency === 'HIGH' 
                                ? 'bg-red-100 text-red-800' 
                                : aiAnalysis.supplierUrgency === 'MEDIUM' 
                                  ? 'bg-amber-100 text-amber-800' 
                                  : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {aiAnalysis.supplierUrgency}
                            </span>
                          </div>
                          <span className="text-[9px] text-blue-600/80 block leading-tight mt-1">
                            Urgency evaluation based on lead times.
                          </span>
                        </div>

                      </div>

                      {/* Action Plan */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Warehouse Operational Checklist</span>
                        <div className="space-y-2">
                          {aiAnalysis.actionItems.map((item, idx) => (
                            <div key={idx} className="flex gap-2.5 items-start text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
                              <div className="p-0.5 bg-blue-600 text-white rounded shrink-0 mt-0.5 text-[10px] font-bold h-4 w-4 flex items-center justify-center">
                                {idx + 1}
                              </div>
                              <span className="leading-relaxed">{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="py-6 text-center text-xs text-slate-400">
                      AI planning is ready. Click Recalculate to generate strategy outline.
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-[10px] text-slate-400 font-mono mt-12">
        <span>SmartStock AI — Smart Demand Forecasting Dashboard. Cloud SQL Instance with Developer scale-to-zero capabilities.</span>
      </footer>

    </div>
  );
}
