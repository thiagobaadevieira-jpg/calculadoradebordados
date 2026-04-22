/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useMemo, useEffect, Component } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  Eye, 
  X, 
  LayoutGrid,
  ChevronDown,
  Trash,
  Calculator,
  Package,
  Calendar,
  FileText,
  Phone,
  User,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  LogOut,
  LogIn,
  Copy,
  Users,
  Clock,
  Activity,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { ProductPricing, PricingItem, Unit, Quote, QuoteStatus } from './types';
import { 
  auth, 
  db, 
  loginWithGoogle, 
  logout, 
  collection, 
  doc, 
  setDoc, 
  updateDoc,
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  onAuthStateChanged,
  handleFirestoreError,
  OperationType,
  User as FirebaseUser
} from './firebase';

// Error Boundary Component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: string | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: any) {
    let errorInfo = error.message;
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError.error) {
        errorInfo = parsedError.error;
      }
    } catch (e) {
      // Not a JSON error
    }
    return { hasError: true, errorInfo };
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      const isIndexError = this.state.errorInfo?.includes('requires an index');
      
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-gray-900 mb-2">
              {isIndexError ? 'Configuração Necessária' : 'Ops! Algo deu errado'}
            </h2>
            <p className="text-gray-500 mb-6 text-sm">
              {isIndexError 
                ? 'O Firestore precisa de um índice para realizar esta consulta. Clique no link abaixo para criá-lo.'
                : 'Ocorreu um erro inesperado. Tente recarregar a página.'}
            </p>
            <div className="bg-gray-50 p-4 rounded-xl mb-6 text-left overflow-auto max-h-40">
              <code className="text-xs text-red-500 break-all">{this.state.errorInfo}</code>
            </div>
            {isIndexError && this.state.errorInfo?.includes('https://') ? (
              <a 
                href={this.state.errorInfo.match(/https:\/\/[^\s]+/)?.[0]}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all mb-3 text-center"
              >
                Criar Índice no Firestore
              </a>
            ) : null}
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-[#8B5CF6] text-white rounded-xl font-bold hover:bg-[#7C3AED] transition-all"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Helper to format currency
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<'calculadora' | 'produtos' | 'orcamento' | 'admin'>('calculadora');
  const [products, setProducts] = useState<ProductPricing[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [productTabSearchTerm, setProductTabSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductPricing | null>(null);

  // Admin State
  const isAdmin = useMemo(() => user?.email === 'thiagobaadevieira@gmail.com', [user]);
  const [adminStats, setAdminStats] = useState<{
    totalUsers: number;
    totalProducts: number;
    totalQuotes: number;
    onlineUsers: number;
    userStats: {
      uid: string;
      email: string;
      displayName: string;
      productCount: number;
      quoteCount: number;
      lastLogin: number;
    }[];
  } | null>(null);

  // Quote Form State
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [selectedProductsForQuote, setSelectedProductsForQuote] = useState<ProductPricing[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [isViewQuoteModalOpen, setIsViewQuoteModalOpen] = useState(false);
  const [activeQuoteFilter, setActiveQuoteFilter] = useState<QuoteStatus | 'Todos'>('Todos');

  const statusTotals = useMemo(() => {
    const totals = {
      'Aguardando': 0,
      'Pagos': 0,
      'Em produção': 0,
      'Finalizado': 0
    };

    quotes.forEach(quote => {
      const totalValue = quote.products.reduce((acc, product) => {
        const totalCost = (product.items || []).reduce((itemAcc, item) => itemAcc + (item.costPrice * item.quantityUsed), 0);
        const profitValue = (totalCost * (product.profitMargin || 0)) / 100;
        return acc + totalCost + profitValue;
      }, 0);

      const status = quote.status || 'Aguardando';
      if (totals.hasOwnProperty(status)) {
        totals[status as keyof typeof totals] += totalValue;
      }
    });

    return totals;
  }, [quotes]);

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [quoteToUpdateStatus, setQuoteToUpdateStatus] = useState<Quote | null>(null);

  const statusOptions = useMemo(() => [
    { value: 'Aguardando' as QuoteStatus, label: 'Aguardando', description: 'Aguardando confirmação ou pagamento inicial', color: 'orange', icon: AlertTriangle },
    { value: 'Pagos' as QuoteStatus, label: 'Pagos', description: 'Pagamento confirmado, pronto para iniciar', color: 'purple', icon: CheckCircle2 },
    { value: 'Em produção' as QuoteStatus, label: 'Em produção', description: 'O pedido está sendo confeccionado', color: 'blue', icon: Package },
    { value: 'Finalizado' as QuoteStatus, label: 'Finalizado', description: 'Pedido pronto para entrega ou enviado', color: 'green', icon: CheckCircle2 },
  ], []);

  // Delete Confirmation State
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    type: 'product' | 'item';
    id: string;
    title: string;
  }>({ isOpen: false, type: 'product', id: '', title: '' });

  // Form State
  const [productName, setProductName] = useState('');
  const [items, setItems] = useState<PricingItem[]>([]);
  const [profitMargin, setProfitMargin] = useState(100);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // New Item Draft State
  const [newItem, setNewItem] = useState<Omit<PricingItem, 'id'>>({ 
    name: '', 
    unit: 'Unidade', 
    costPrice: 0, 
    quantityUsed: 0,
    isLinked: false
  });

  // Unique materials from all products
  const existingMaterials = useMemo(() => {
    const materials = new Map<string, { name: string, unit: Unit, costPrice: number }>();
    products.forEach(p => {
      p.items.forEach(item => {
        const key = item.name.toLowerCase().trim();
        if (!materials.has(key)) {
          materials.set(key, { 
            name: item.name, 
            unit: item.unit, 
            costPrice: item.costPrice 
          });
        }
      });
    });
    return Array.from(materials.values());
  }, [products]);

  const filteredMaterials = useMemo(() => {
    if (!newItem.name.trim()) return [];
    return existingMaterials.filter(m => 
      m.name.toLowerCase().includes(newItem.name.toLowerCase()) &&
      m.name.toLowerCase() !== newItem.name.toLowerCase()
    );
  }, [existingMaterials, newItem.name]);

  // Item Editing States
  const [isItemEditModalOpen, setIsItemEditModalOpen] = useState(false);
  const [isItemConfirmModalOpen, setIsItemConfirmModalOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<{ originalName: string, name: string, unit: Unit, costPrice: number } | null>(null);
  const [affectedProducts, setAffectedProducts] = useState<ProductPricing[]>([]);

  // Load initial data or mock data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);

      if (currentUser) {
        // Track user login
        try {
          await setDoc(doc(db, 'users', currentUser.uid), {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
            lastLogin: Date.now(),
            role: currentUser.email === 'thiagobaadevieira@gmail.com' ? 'admin' : 'client'
          }, { merge: true });
        } catch (error) {
          console.error('Error tracking user:', error);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !user) {
      setProducts([]);
      setQuotes([]);
      return;
    }

    // If admin is in admin tab, we don't sync personal data to avoid confusion
    // or we can keep it. Let's keep it for now.

    // Sync Products
    const qProducts = query(collection(db, 'products'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribeProducts = onSnapshot(qProducts, (snapshot) => {
      const productList = snapshot.docs.map(doc => doc.data() as ProductPricing);
      setProducts(productList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    // Sync Quotes
    const qQuotes = query(collection(db, 'quotes'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribeQuotes = onSnapshot(qQuotes, (snapshot) => {
      const quoteList = snapshot.docs.map(doc => doc.data() as Quote);
      setQuotes(quoteList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'quotes');
    });

    return () => {
      unsubscribeProducts();
      unsubscribeQuotes();
    };
  }, [isAuthReady, user]);

  // Admin Stats Sync - Refactored to avoid nested listeners
  useEffect(() => {
    if (!isAdmin || activeTab !== 'admin') {
      setAdminStats(null);
      return;
    }

    let allUsers: any[] = [];
    let allProds: any[] = [];
    let allQuotes: any[] = [];

    const updateStats = () => {
      const productCounts = new Map<string, number>();
      allProds.forEach(p => {
        productCounts.set(p.uid, (productCounts.get(p.uid) || 0) + 1);
      });

      const quoteCounts = new Map<string, number>();
      allQuotes.forEach(q => {
        quoteCounts.set(q.uid, (quoteCounts.get(q.uid) || 0) + 1);
      });

      const stats = allUsers.map(u => ({
        uid: u.uid,
        email: u.email,
        displayName: u.displayName || 'Usuário Sem Nome',
        productCount: productCounts.get(u.uid) || 0,
        quoteCount: quoteCounts.get(u.uid) || 0,
        lastLogin: u.lastLogin
      }));

      setAdminStats({
        totalUsers: allUsers.length,
        totalProducts: allProds.length,
        totalQuotes: allQuotes.length,
        onlineUsers: allUsers.filter(u => Date.now() - (u.lastLogin || 0) < 5 * 60 * 1000).length,
        userStats: stats.sort((a, b) => b.lastLogin - a.lastLogin)
      });
    };

    const unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('lastLogin', 'desc')), (snap) => {
      allUsers = snap.docs.map(d => d.data());
      updateStats();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    const unsubProds = onSnapshot(query(collection(db, 'products'), orderBy('createdAt', 'desc')), (snap) => {
      allProds = snap.docs.map(d => d.data());
      updateStats();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    const unsubQuotes = onSnapshot(query(collection(db, 'quotes'), orderBy('createdAt', 'desc')), (snap) => {
      allQuotes = snap.docs.map(d => d.data());
      updateStats();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'quotes');
    });

    // Refresh online users count every minute
    const refreshInterval = setInterval(updateStats, 60000);

    return () => {
      unsubUsers();
      unsubProds();
      unsubQuotes();
      clearInterval(refreshInterval);
    };
  }, [isAdmin, activeTab]);

  useEffect(() => {
    // Clear search terms when switching tabs
    setSearchTerm('');
    setProductTabSearchTerm('');
  }, [activeTab]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => 
      p.productName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [products, searchTerm]);

  const filteredQuotes = useMemo(() => {
    return quotes.filter(q => activeQuoteFilter === 'Todos' || q.status === activeQuoteFilter);
  }, [quotes, activeQuoteFilter]);

  const openNewModal = () => {
    setEditingProduct(null);
    setProductName('');
    setItems([]);
    setNewItem({ name: '', unit: 'Unidade', costPrice: 0, quantityUsed: 0, isLinked: false });
    setProfitMargin(100);
    setIsModalOpen(true);
  };

  const openEditModal = (product: ProductPricing) => {
    setEditingProduct(product);
    setProductName(product.productName);
    setItems(product.items);
    setNewItem({ name: '', unit: 'Unidade', costPrice: 0, quantityUsed: 0, isLinked: false });
    setProfitMargin(product.profitMargin);
    setIsModalOpen(true);
  };

  const handleAddItem = () => {
    if (!newItem.name.trim()) return;
    setItems([...items, { ...newItem, id: Math.random().toString() }]);
    setNewItem({ name: '', unit: 'Unidade', costPrice: 0, quantityUsed: 0, isLinked: false });
  };

  const confirmDelete = (type: 'product' | 'item', id: string, name: string) => {
    setDeleteConfirm({
      isOpen: true,
      type,
      id,
      title: name
    });
  };

  const executeDelete = async () => {
    if (!user) return;
    try {
      if (deleteConfirm.type === 'product') {
        await deleteDoc(doc(db, 'products', deleteConfirm.id));
        toast.success('Precificação excluída!');
      } else {
        // If it's an item within a product being edited
        setItems(items.filter(item => item.id !== deleteConfirm.id));
        toast.success('Item removido da lista');
      }
      setDeleteConfirm({ ...deleteConfirm, isOpen: false });
    } catch (error) {
      toast.error('Erro ao excluir');
      handleFirestoreError(error, OperationType.DELETE, deleteConfirm.type === 'product' ? `products/${deleteConfirm.id}` : null);
    }
  };

  const handleUpdateItem = (id: string, field: keyof PricingItem, value: any) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const calculateTotalCost = (itemList: PricingItem[]) => {
    const addedTotal = itemList.reduce((acc, item) => acc + (item.costPrice * item.quantityUsed), 0);
    // Also include the draft item in the total calculation if it has a name
    const draftTotal = newItem.name.trim() ? (newItem.costPrice * newItem.quantityUsed) : 0;
    return addedTotal + draftTotal;
  };

  const handleSave = async () => {
    if (!productName.trim() || !user) return;

    // Include the draft item if it's partially filled
    const finalItems = [...items];
    if (newItem.name.trim()) {
      finalItems.push({ ...newItem, id: Math.random().toString() });
    }

    const productId = editingProduct?.id || Math.random().toString();
    const newProduct: ProductPricing = {
      id: productId,
      productName,
      items: finalItems,
      profitMargin,
      createdAt: editingProduct?.createdAt || Date.now(),
      uid: user.uid
    };

    try {
      await setDoc(doc(db, 'products', productId), newProduct);
      setIsModalOpen(false);
      toast.success(editingProduct ? 'Precificação atualizada!' : 'Nova precificação salva!');
    } catch (error) {
      toast.error('Erro ao salvar precificação');
      handleFirestoreError(error, OperationType.WRITE, `products/${productId}`);
    }
  };

  const handleSaveQuote = async () => {
    if (!clientName.trim() || selectedProductsForQuote.length === 0 || !user) return;

    const quoteId = Math.random().toString();
    const newQuote: Quote = {
      id: quoteId,
      clientName,
      clientPhone,
      products: selectedProductsForQuote,
      createdAt: Date.now(),
      uid: user.uid,
      status: 'Aguardando'
    };

    try {
      await setDoc(doc(db, 'quotes', quoteId), newQuote);
      setClientName('');
      setClientPhone('');
      setProductSearchQuery('');
      setSelectedProductsForQuote([]);
      toast.success('Orçamento salvo com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar orçamento');
      handleFirestoreError(error, OperationType.WRITE, `quotes/${quoteId}`);
    }
  };

  const toggleProductInQuote = (product: ProductPricing) => {
    if (selectedProductsForQuote.find(p => p.id === product.id)) {
      setSelectedProductsForQuote(selectedProductsForQuote.filter(p => p.id !== product.id));
    } else {
      setSelectedProductsForQuote([...selectedProductsForQuote, product]);
    }
  };

  const updateQuoteStatus = async (quoteId: string, newStatus: QuoteStatus) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'quotes', quoteId), { status: newStatus });
      toast.success(`Status atualizado para: ${newStatus}`);
    } catch (error) {
      toast.error('Erro ao atualizar status');
      handleFirestoreError(error, OperationType.UPDATE, `quotes/${quoteId}`);
    }
  };

  const copyQuoteToClipboard = (quote: Quote) => {
    const total = quote.products.reduce((acc, product) => {
      const totalCost = (product.items || []).reduce((itemAcc, item) => itemAcc + (item.costPrice * item.quantityUsed), 0);
      const profitValue = (totalCost * (product.profitMargin || 0)) / 100;
      return acc + totalCost + profitValue;
    }, 0);

    const productsText = quote.products.map(p => {
      const totalCost = (p.items || []).reduce((acc, item) => acc + (item.costPrice * item.quantityUsed), 0);
      const profitValue = (totalCost * (p.profitMargin || 0)) / 100;
      const price = totalCost + profitValue;
      return `• ${p.productName}: ${formatCurrency(price)}`;
    }).join('\n');

    const text = `*Orçamento - Brother*\n\n*Cliente:* ${quote.clientName}\n\n*Produtos:*\n${productsText}\n\n*Total:* ${formatCurrency(total)}\n\nGerado em: ${new Date(quote.createdAt).toLocaleDateString()}`;
    
    navigator.clipboard.writeText(text);
    toast.success('Orçamento copiado para a área de transferência!');
  };

  const openItemEditModal = (item: any) => {
    setItemToEdit({
      originalName: item.name,
      name: item.name,
      unit: item.unit,
      costPrice: item.costPrice
    });
    setIsItemEditModalOpen(true);
  };

  const handleItemEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToEdit) return;

    // Find affected products
    const affected = products.filter(p => 
      p.items.some(item => item.name.toLowerCase().trim() === itemToEdit.originalName.toLowerCase().trim())
    );

    setAffectedProducts(affected);
    setIsItemEditModalOpen(false);
    setIsItemConfirmModalOpen(true);
  };

  const confirmItemUpdate = async () => {
    if (!itemToEdit || !user) return;

    const updatedProducts = products.map(p => ({
      ...p,
      items: p.items.map(item => {
        if (item.name.toLowerCase().trim() === itemToEdit.originalName.toLowerCase().trim()) {
          return {
            ...item,
            name: itemToEdit.name,
            unit: itemToEdit.unit as Unit,
            costPrice: itemToEdit.costPrice
          };
        }
        return item;
      })
    }));

    try {
      // Update all affected products in Firestore
      const updatePromises = updatedProducts
        .filter(p => p.items.some(item => item.name === itemToEdit.name)) // Only those that were actually changed
        .map(p => setDoc(doc(db, 'products', p.id), { ...p, uid: user.uid }));
      
      await Promise.all(updatePromises);
      setIsItemConfirmModalOpen(false);
      setItemToEdit(null);
      toast.success(`${updatedProducts.length} produtos atualizados com sucesso!`);
    } catch (error) {
      toast.error('Erro ao atualizar produtos em massa');
      handleFirestoreError(error, OperationType.WRITE, 'multiple products');
    }
  };

  const currentTotalCost = calculateTotalCost(items);
  const currentProfitValue = (currentTotalCost * profitMargin) / 100;
  const currentFinalPrice = currentTotalCost + currentProfitValue;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F7FA]">
        <div className="w-12 h-12 border-4 border-[#8B5CF6] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#F8F7FA] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#8B5CF6] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 font-bold animate-pulse">Carregando Brother...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8F7FA] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center"
        >
          <div className="bg-[#8B5CF6] w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#8B5CF6]/20">
            <LayoutGrid className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-[#1A1A1A] mb-2">Brother</h1>
          <p className="text-gray-500 mb-8">Faça login para gerenciar suas precificações e orçamentos com segurança.</p>
          
          <button 
            onClick={loginWithGoogle}
            className="w-full py-4 bg-white border-2 border-gray-100 hover:border-[#8B5CF6] rounded-2xl font-bold flex items-center justify-center gap-3 transition-all group"
          >
            <img 
              src="https://www.gstatic.com/images/branding/googleg/1x/googleg_standard_color_128dp.png" 
              alt="Google" 
              className="w-5 h-5" 
              referrerPolicy="no-referrer"
            />
            <span>Entrar com Google</span>
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Toaster position="top-right" richColors closeButton />
      <div className="min-h-screen bg-[#F8F7FA] text-[#1A1A1A] font-sans">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-40 shadow-sm">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-[#8B5CF6] p-1.5 rounded-md">
                <LayoutGrid className="text-white w-5 h-5" />
              </div>
              <h1 className="text-xl font-black text-[#1A1A1A]">Brother</h1>
            </div>

            <nav className="flex items-center bg-gray-50 p-1 rounded-xl border border-gray-100 overflow-x-auto max-w-full scrollbar-hide flex-nowrap">
              <button 
                onClick={() => setActiveTab('calculadora')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all flex-shrink-0 whitespace-nowrap ${
                  activeTab === 'calculadora' ? 'bg-white text-[#8B5CF6] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Calculator className="w-4 h-4" />
                <span>Calculadora</span>
              </button>
              <button 
                onClick={() => setActiveTab('produtos')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all flex-shrink-0 whitespace-nowrap ${
                  activeTab === 'produtos' ? 'bg-white text-[#8B5CF6] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Package className="w-4 h-4" />
                <span>Produtos</span>
              </button>
              <button 
                onClick={() => setActiveTab('orcamento')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all flex-shrink-0 whitespace-nowrap ${
                  activeTab === 'orcamento' ? 'bg-white text-[#8B5CF6] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Orçamento</span>
              </button>
              {isAdmin && (
                <button 
                  onClick={() => setActiveTab('admin')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all flex-shrink-0 whitespace-nowrap ${
                    activeTab === 'admin' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>Desenvolvedor</span>
                </button>
              )}
              <button 
                onClick={() => setIsLogoutModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all flex-shrink-0 whitespace-nowrap text-gray-400 hover:text-red-500 hover:bg-red-50"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair</span>
              </button>
            </nav>
          </div>
        </header>

        <main className="p-6 max-w-7xl mx-auto">
        {activeTab === 'calculadora' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
              <div>
                <h2 className="text-2xl font-black text-[#1A1A1A]">Calculadora de Preço</h2>
                <p className="text-gray-500 text-sm">Gerencie suas precificações e crie novos cálculos.</p>
              </div>
              <button 
                onClick={openNewModal}
                className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg shadow-[#8B5CF6]/20 w-full md:w-auto justify-center"
              >
                <Plus className="w-5 h-5" />
                Nova Precificação
              </button>
            </div>

            <div className="relative mb-8">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input 
                type="text" 
                placeholder="Pesquisar precificações..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/20 focus:border-[#8B5CF6] transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Product Grid (Cards) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((product, index) => {
                const totalCost = product.items.reduce((acc, item) => acc + (item.costPrice * item.quantityUsed), 0);
                const profitValue = (totalCost * product.profitMargin) / 100;
                const finalPrice = totalCost + profitValue;

                return (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    key={product.id}
                    className="group relative bg-white rounded-[2.5rem] p-10 border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-[#8B5CF6]/10 hover:-translate-y-1 transition-all duration-500 flex flex-col overflow-hidden"
                  >
                    {/* Decorative Background */}
                    <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-[#8B5CF6]/10 to-transparent rounded-full -mr-20 -mt-20 transition-transform group-hover:scale-125 duration-700" />
                    
                    <div className="relative flex justify-between items-start mb-8">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Precificação</span>
                        </div>
                        <h2 className="text-2xl font-black text-[#1A1A1A] group-hover:text-[#8B5CF6] transition-colors">{product.productName}</h2>
                      </div>
                      
                      <div className="flex gap-2">
                        <button 
                          onClick={() => openEditModal(product)}
                          className="p-3 bg-white shadow-sm border border-gray-100 text-gray-400 hover:text-[#8B5CF6] hover:border-[#8B5CF6]/30 rounded-2xl transition-all hover:scale-110 active:scale-95"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => confirmDelete('product', product.id, product.productName)}
                          className="p-3 bg-white shadow-sm border border-gray-100 text-gray-400 hover:text-red-500 hover:border-red-100 rounded-2xl transition-all hover:scale-110 active:scale-95"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="relative grid grid-cols-2 gap-6 mb-8">
                      <div className="space-y-1">
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.15em]">Custo de Produção</p>
                        <p className="text-lg font-black text-[#1A1A1A]">{formatCurrency(totalCost)}</p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.15em]">Margem de Lucro</p>
                        <div className="inline-flex items-center px-2 py-0.5 rounded-lg bg-green-50 text-green-600 text-xs font-black">
                          +{product.profitMargin}%
                        </div>
                      </div>
                    </div>

                    <div className="relative bg-gray-50/50 rounded-3xl p-6 mb-8 border border-gray-50">
                      <div className="flex justify-between items-end">
                        <div className="space-y-1">
                          <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.15em]">Preço Sugerido</p>
                          <p className="text-3xl font-black text-[#8B5CF6] tracking-tight">{formatCurrency(finalPrice)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.15em] mb-1">Lucro Líquido</p>
                          <p className="text-sm font-black text-green-600">{formatCurrency(profitValue)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="relative mt-auto">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                        <LayoutGrid className="w-3 h-3" /> Composição
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(product.items || []).slice(0, 3).map(item => (
                          <span key={item.id} className="px-3 py-1 bg-white border border-gray-100 rounded-xl text-[10px] font-bold text-gray-500 shadow-sm">
                            {item.name}
                          </span>
                        ))}
                        {product.items.length > 3 && (
                          <span className="px-3 py-1 bg-gray-100 rounded-xl text-[10px] font-bold text-gray-400">
                            +{product.items.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {filteredProducts.length === 0 && (
              <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                <div className="w-16 h-16 bg-gray-50 text-gray-300 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calculator className="w-8 h-8" />
                </div>
                <p className="text-gray-400">Nenhuma precificação encontrada.</p>
                <button 
                  onClick={openNewModal}
                  className="mt-4 text-[#8B5CF6] font-bold hover:underline"
                >
                  Começar agora
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'produtos' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
              <div>
                <h2 className="text-2xl font-black text-[#1A1A1A]">Produtos</h2>
                <p className="text-gray-500 text-sm">Visualize todos os materiais e custos cadastrados na calculadora.</p>
              </div>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input 
                  type="text" 
                  placeholder="Pesquisar itens..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/20 focus:border-[#8B5CF6] transition-all"
                  value={productTabSearchTerm}
                  onChange={(e) => setProductTabSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Unique Items Card View */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(() => {
                // Extract unique items from all products
                const allItems = products.flatMap(p => p.items.map(item => ({ ...item, productDate: p.createdAt })));
                const uniqueItemsMap = new Map();
                
                allItems.forEach(item => {
                  const key = item.name.toLowerCase().trim();
                  if (!uniqueItemsMap.has(key) || item.productDate > uniqueItemsMap.get(key).productDate) {
                    uniqueItemsMap.set(key, item);
                  }
                });

                const uniqueItemsList = Array.from(uniqueItemsMap.values())
                  .filter(item => item.name.toLowerCase().includes(productTabSearchTerm.toLowerCase()))
                  .sort((a, b) => a.name.localeCompare(b.name));

                if (uniqueItemsList.length === 0) {
                  return (
                    <div className="col-span-full text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                      <p className="text-gray-400">Nenhum item encontrado.</p>
                    </div>
                  );
                }

                return uniqueItemsList.map((item, index) => (
                  <motion.div 
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group relative bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-[#8B5CF6]/10 transition-all duration-500 overflow-hidden"
                  >
                    {/* Background Accent */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#8B5CF6]/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110 duration-500" />
                    
                    <div className="relative flex justify-between items-start mb-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center text-[#8B5CF6]">
                            <Package className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Material</span>
                        </div>
                        <h3 className="font-black text-[#1A1A1A] text-xl leading-tight group-hover:text-[#8B5CF6] transition-colors">{item.name}</h3>
                        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black bg-gray-100 text-gray-500 uppercase tracking-widest">
                          {item.unit}
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => openItemEditModal(item)}
                        className="p-2.5 bg-white shadow-sm border border-gray-100 text-gray-400 hover:text-[#8B5CF6] hover:border-[#8B5CF6]/30 rounded-2xl transition-all hover:scale-110 active:scale-95"
                        title="Editar Item"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="relative grid grid-cols-2 gap-4 pt-4 border-t border-gray-50">
                      <div className="space-y-1">
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.15em]">Custo Unitário</p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm font-bold text-[#8B5CF6]/60">R$</span>
                          <span className="text-2xl font-black text-[#8B5CF6] tracking-tight">
                            {item.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                      
                      <div className="text-right space-y-1">
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.15em]">Atualizado em</p>
                        <div className="flex items-center justify-end gap-1.5 text-gray-500">
                          <Calendar className="w-3 h-3 opacity-40" />
                          <span className="text-xs font-bold">
                            {new Date(item.productDate).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ));
              })()}
            </div>
          </div>
        )}

        {activeTab === 'orcamento' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Form + Product Selection */}
            <div className="lg:col-span-5 space-y-6">
              <div className="group bg-white p-10 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-8 hover:shadow-2xl hover:shadow-[#8B5CF6]/5 transition-all duration-500 relative">
                {/* Decorative Background Container */}
                <div className="absolute inset-0 overflow-hidden rounded-[2.5rem] pointer-events-none">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#8B5CF6]/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-150 duration-700" />
                </div>
                <h2 className="relative text-xl font-bold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#8B5CF6]" />
                  Novo Orçamento
                </h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold mb-2 flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" /> Nome do Cliente
                    </label>
                    <input 
                      type="text" 
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Ex: João Silva"
                      className="w-full px-4 py-3 bg-[#F9FAFB] border border-gray-200 rounded-xl focus:outline-none focus:border-[#8B5CF6]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-400" /> Telefone
                    </label>
                    <input 
                      type="text" 
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="w-full px-4 py-3 bg-[#F9FAFB] border border-gray-200 rounded-xl focus:outline-none focus:border-[#8B5CF6]"
                    />
                  </div>
                  <div className="relative">
                    <label className="block text-sm font-bold mb-2 flex items-center gap-2">
                      <Search className="w-4 h-4 text-gray-400" /> Pesquisar Produto
                    </label>
                    <input 
                      type="text" 
                      value={productSearchQuery}
                      onChange={(e) => setProductSearchQuery(e.target.value)}
                      placeholder="Buscar por nome..."
                      className="w-full px-4 py-3 bg-[#F9FAFB] border border-gray-200 rounded-xl focus:outline-none focus:border-[#8B5CF6]"
                    />
                    
                    {/* Search Results Dropdown */}
                    {productSearchQuery.trim() !== '' && (
                      <div className="absolute z-10 w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                        {products
                          .filter(p => p.productName.toLowerCase().includes(productSearchQuery.toLowerCase()))
                          .map(product => {
                            const isSelected = selectedProductsForQuote.find(p => p.id === product.id);
                            const totalCost = (product.items || []).reduce((acc, item) => acc + (item.costPrice * item.quantityUsed), 0);
                            const profitValue = (totalCost * (product.profitMargin || 0)) / 100;
                            const finalPrice = totalCost + profitValue;
                            
                            return (
                              <button
                                key={product.id}
                                onClick={() => {
                                  toggleProductInQuote(product);
                                  setProductSearchQuery('');
                                }}
                                className="w-full text-left p-4 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                              >
                                <div>
                                  <p className="font-bold text-sm">{product.productName}</p>
                                  <p className="text-xs text-gray-400">{formatCurrency(finalPrice)}</p>
                                </div>
                                {isSelected && (
                                  <CheckCircle2 className="w-5 h-5 text-[#8B5CF6]" />
                                )}
                              </button>
                            );
                          })}
                        {products.filter(p => p.productName.toLowerCase().includes(productSearchQuery.toLowerCase())).length === 0 && (
                          <div className="p-4 text-center text-gray-400 text-sm">Nenhum produto encontrado.</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Selected Products List (Card Layout) */}
                  {selectedProductsForQuote.length > 0 && (
                    <div className="space-y-4">
                      <div className="space-y-3">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Produtos Selecionados</label>
                        <div className="grid grid-cols-1 gap-3">
                          {selectedProductsForQuote.map(product => {
                            const totalCost = (product.items || []).reduce((acc, item) => acc + (item.costPrice * item.quantityUsed), 0);
                            const profitValue = (totalCost * (product.profitMargin || 0)) / 100;
                            const finalPrice = totalCost + profitValue;
                            
                            return (
                              <div key={product.id} className="bg-white p-5 rounded-[1.5rem] border border-gray-100 shadow-sm flex justify-between items-center group transition-all hover:shadow-md">
                                <span className="font-bold text-[#1A1A1A]">{product.productName}</span>
                                <div className="flex items-center gap-4">
                                  <span className="font-black text-[#8B5CF6]">{formatCurrency(finalPrice)}</span>
                                  <button 
                                    onClick={() => toggleProductInQuote(product)}
                                    className="p-1.5 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Total Value Display */}
                      <div className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100 flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Valor Total</span>
                        <span className="text-2xl font-black text-[#1A1A1A]">
                          {formatCurrency(selectedProductsForQuote.reduce((acc, product) => {
                            const totalCost = (product.items || []).reduce((itemAcc, item) => itemAcc + (item.costPrice * item.quantityUsed), 0);
                            const profitValue = (totalCost * (product.profitMargin || 0)) / 100;
                            return acc + totalCost + profitValue;
                          }, 0))}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <button 
                  onClick={handleSaveQuote}
                  disabled={!clientName.trim() || selectedProductsForQuote.length === 0 || !user}
                  className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${
                    clientName.trim() && selectedProductsForQuote.length > 0 && user
                      ? 'bg-[#8B5CF6] text-white hover:bg-[#7C3AED] shadow-[#8B5CF6]/20'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {!user ? 'Faça login para salvar' : 'Gerar Orçamento'}
                </button>
              </div>

            </div>

            {/* Right Column: Saved Quotes List */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex flex-col gap-4">
                <h2 className="text-xl font-bold flex items-center gap-2 px-2">
                  <FileText className="w-5 h-5 text-[#8B5CF6]" />
                  Orçamentos Salvos
                </h2>
                
                {/* Status Filters */}
                <div className="flex flex-wrap gap-2 px-2">
                  {['Todos', 'Aguardando', 'Pagos', 'Em produção', 'Finalizado'].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setActiveQuoteFilter(filter as any)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        activeQuoteFilter === filter
                          ? 'bg-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/20'
                          : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-100'
                      }`}
                    >
                      {filter === 'Todos' ? 'Pedidos' : filter}
                    </button>
                  ))}
                </div>

                {/* Status Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-2">
                  {[
                    { label: 'Aguardando', value: statusTotals.Aguardando, color: 'orange' },
                    { label: 'Pagos', value: statusTotals.Pagos, color: 'purple' },
                    { label: 'Em produção', value: statusTotals['Em produção'], color: 'blue' },
                    { label: 'Finalizado', value: statusTotals.Finalizado, color: 'green' }
                  ].map((item) => (
                    <div key={item.label} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-1">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">{item.label}</span>
                      <span className={`text-sm font-black ${
                        item.color === 'purple' ? 'text-[#8B5CF6]' : 
                        item.color === 'orange' ? 'text-orange-500' : 
                        item.color === 'blue' ? 'text-blue-500' : 
                        'text-green-500'
                      }`}>
                        {formatCurrency(item.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredQuotes.map((quote, index) => (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      key={quote.id} 
                      className="group bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-[#8B5CF6]/10 transition-all duration-500 flex flex-col gap-6 relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-[#8B5CF6]/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-150 duration-700" />
                      <div className="relative flex justify-between items-start">
                        <div>
                          <p className="font-black text-lg text-[#1A1A1A]">{quote.clientName}</p>
                          <a 
                            href={`https://wa.me/${quote.clientPhone.replace(/\D/g, '')}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm text-gray-500 hover:text-[#8B5CF6] flex items-center gap-1 transition-colors"
                            title="Chamar no WhatsApp"
                          >
                            <Phone className="w-3 h-3" /> {quote.clientPhone}
                          </a>
                        </div>
                        <div className="bg-[#8B5CF6]/10 text-[#8B5CF6] px-3 py-1 rounded-full text-[10px] font-bold uppercase">
                          {quote.products.length} Produtos
                        </div>
                      </div>

                    <div className="space-y-2 py-2">
                      {quote.products.map((product, idx) => {
                        const totalCost = (product.items || []).reduce((acc, item) => acc + (item.costPrice * item.quantityUsed), 0);
                        const profitValue = (totalCost * (product.profitMargin || 0)) / 100;
                        const finalPrice = totalCost + profitValue;
                        return (
                          <div key={idx} className="flex justify-between items-center text-sm">
                            <span className="text-gray-600 font-medium">{product.productName}</span>
                            <span className="text-[#8B5CF6] font-bold">{formatCurrency(finalPrice)}</span>
                          </div>
                        );
                      })}
                      <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total</span>
                        <span className="text-lg font-black text-[#1A1A1A]">
                          {formatCurrency(quote.products.reduce((acc, product) => {
                            const totalCost = (product.items || []).reduce((itemAcc, item) => itemAcc + (item.costPrice * item.quantityUsed), 0);
                            const profitValue = (totalCost * (product.profitMargin || 0)) / 100;
                            return acc + totalCost + profitValue;
                          }, 0))}
                        </span>
                      </div>
                      
                      <div className="mt-3">
                        <button
                          onClick={() => {
                            setQuoteToUpdateStatus(quote);
                            setIsStatusModalOpen(true);
                          }}
                          className={`w-full group relative flex items-center justify-between px-4 py-3 rounded-2xl border transition-all duration-300 ${
                            quote.status === 'Finalizado' ? 'bg-green-50/50 border-green-100 text-green-700 hover:bg-green-50 hover:border-green-200' :
                            quote.status === 'Em produção' ? 'bg-blue-50/50 border-blue-100 text-blue-700 hover:bg-blue-50 hover:border-blue-200' :
                            quote.status === 'Pagos' ? 'bg-purple-50/50 border-purple-100 text-purple-700 hover:bg-purple-50 hover:border-purple-200' :
                            'bg-orange-50/50 border-orange-100 text-orange-700 hover:bg-orange-50 hover:border-orange-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative flex h-2 w-2">
                              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                                quote.status === 'Finalizado' ? 'bg-green-400' :
                                quote.status === 'Em produção' ? 'bg-blue-400' :
                                quote.status === 'Pagos' ? 'bg-purple-400' :
                                'bg-orange-400'
                              }`}></span>
                              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                                quote.status === 'Finalizado' ? 'bg-green-500' :
                                quote.status === 'Em produção' ? 'bg-blue-500' :
                                quote.status === 'Pagos' ? 'bg-purple-500' :
                                'bg-orange-500'
                              }`}></span>
                            </div>
                            <div className="flex flex-col items-start">
                              <span className="text-[10px] uppercase tracking-[0.15em] font-black opacity-40 leading-none mb-1">Status</span>
                              <span className="text-xs font-black leading-none">{quote.status || 'Aguardando'}</span>
                            </div>
                          </div>
                          <div className="p-1.5 rounded-lg bg-white/50 group-hover:bg-white transition-colors shadow-sm border border-transparent group-hover:border-inherit">
                            <Edit2 className="w-3 h-3 opacity-40 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </button>
                      </div>
                    </div>

                    <div className="mt-auto pt-4 flex items-center justify-between border-t border-gray-50">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => copyQuoteToClipboard(quote)}
                          className="p-2 text-gray-400 hover:text-[#8B5CF6] hover:bg-[#8B5CF6]/5 rounded-xl transition-all"
                          title="Copiar Orçamento"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <span className="text-[10px] text-gray-400 font-medium">
                          {new Date(quote.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <a 
                        href={`https://wa.me/${quote.clientPhone.replace(/\D/g, '')}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 bg-[#25D366] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#128C7E] transition-all shadow-sm shadow-[#25D366]/20"
                      >
                        <Phone className="w-3 h-3" />
                        WhatsApp
                      </a>
                    </div>
                  </motion.div>
                ))}
              </div>

              {quotes.filter(q => activeQuoteFilter === 'Todos' || q.status === activeQuoteFilter).length === 0 && (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                  <div className="w-16 h-16 bg-gray-50 text-gray-300 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8" />
                  </div>
                  <p className="text-gray-400">Nenhum orçamento encontrado para este filtro.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Admin Dashboard */}
        {isAdmin && activeTab === 'admin' && (
          <div className="max-w-7xl mx-auto px-6 py-12 space-y-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <h2 className="text-5xl font-black text-[#1A1A1A] tracking-tighter">Painel do Desenvolvedor</h2>
                <p className="text-gray-500 font-medium italic mt-2 text-lg">Visão analítica e controle total do ecossistema.</p>
              </div>
              <div className="flex items-center gap-3 px-6 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs font-black uppercase tracking-widest text-gray-400">Sistema Online</span>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { label: 'Total de Clientes', value: adminStats?.totalUsers || 0, icon: Users, color: 'purple', growth: '+12%' },
                { label: 'Precificações', value: adminStats?.totalProducts || 0, icon: Package, color: 'blue', growth: '+5%' },
                { label: 'Orçamentos', value: adminStats?.totalQuotes || 0, icon: FileText, color: 'green', growth: '+18%' },
                { label: 'Pessoas Online', value: adminStats?.onlineUsers || 0, icon: Activity, color: 'orange', growth: 'Live' }
              ].map((stat, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={stat.label}
                  className="group bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-[#8B5CF6]/10 transition-all duration-500 relative overflow-hidden"
                >
                  <div className={`absolute top-0 right-0 w-32 h-32 bg-${stat.color === 'purple' ? '[#8B5CF6]' : stat.color === 'blue' ? 'blue-500' : stat.color === 'green' ? 'green-500' : 'orange-500'}/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700`} />
                  <div className="flex justify-between items-start relative">
                    <div className={`w-16 h-16 rounded-2xl bg-${stat.color === 'purple' ? '[#8B5CF6]' : stat.color === 'blue' ? 'blue-500' : stat.color === 'green' ? 'green-500' : 'orange-500'}/10 flex items-center justify-center text-${stat.color === 'purple' ? '[#8B5CF6]' : stat.color === 'blue' ? 'blue-500' : stat.color === 'green' ? 'green-500' : 'orange-500'} mb-6 group-hover:scale-110 transition-transform`}>
                      <stat.icon className="w-8 h-8" />
                    </div>
                    <span className={`text-xs font-black ${stat.color === 'orange' ? 'text-orange-500 bg-orange-50' : 'text-green-500 bg-green-50'} px-3 py-1 rounded-full`}>{stat.growth}</span>
                  </div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{stat.label}</p>
                  <p className="text-5xl font-black text-[#1A1A1A] tracking-tighter">{stat.value}</p>
                </motion.div>
              ))}
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-10 border-b border-gray-50 bg-gray-50/30 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-[#1A1A1A] tracking-tight">Atividade por Usuário</h3>
                  <p className="text-sm text-gray-400 font-medium mt-1 italic">Acompanhe o engajamento e uso de cada cliente.</p>
                </div>
                <div className="px-6 py-3 bg-white rounded-2xl border border-gray-100 text-[10px] font-black uppercase tracking-[0.2em] text-[#8B5CF6] shadow-sm">
                  {adminStats?.userStats.length || 0} Usuários Ativos
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-50">
                      <th className="px-10 py-8">Usuário</th>
                      <th className="px-10 py-8">Status</th>
                      <th className="px-10 py-8 text-center">Produtos</th>
                      <th className="px-10 py-8 text-center">Orçamentos</th>
                      <th className="px-10 py-8 text-right">Último Acesso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {adminStats?.userStats.map(u => {
                      const isOnline = Date.now() - u.lastLogin < 1000 * 60 * 5; // 5 minutes
                      return (
                        <tr key={u.uid} className="group hover:bg-gray-50/50 transition-all duration-300">
                          <td className="px-10 py-8">
                            <div className="flex items-center gap-5">
                              <div className="relative">
                                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 font-black text-xl group-hover:bg-[#8B5CF6]/10 group-hover:text-[#8B5CF6] transition-all duration-500">
                                  {u.displayName?.charAt(0) || u.email?.charAt(0)}
                                </div>
                                {isOnline && (
                                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-4 border-white rounded-full" />
                                )}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-lg font-black text-[#1A1A1A] group-hover:text-[#8B5CF6] transition-colors">{u.displayName}</span>
                                <span className="text-xs font-medium text-gray-400">{u.email}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-10 py-8">
                            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                              isOnline ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'
                            }`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                              {isOnline ? 'Online' : 'Offline'}
                            </div>
                          </td>
                          <td className="px-10 py-8 text-center">
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 text-[#8B5CF6] rounded-2xl text-sm font-black shadow-sm group-hover:scale-110 transition-transform">
                              <Package className="w-4 h-4" />
                              {u.productCount}
                            </div>
                          </td>
                          <td className="px-10 py-8 text-center">
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-2xl text-sm font-black shadow-sm group-hover:scale-110 transition-transform">
                              <FileText className="w-4 h-4" />
                              {u.quoteCount}
                            </div>
                          </td>
                          <td className="px-10 py-8 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-2 text-sm font-black text-[#1A1A1A]">
                                <Clock className="w-4 h-4 text-gray-300" />
                                {new Date(u.lastLogin).toLocaleDateString('pt-BR')}
                              </div>
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                {new Date(u.lastLogin).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal Pricing */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-4xl rounded-3xl sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]"
            >
              <div className="p-5 sm:p-8 border-b border-gray-100 flex items-center justify-between bg-[#F9F7FE]/30">
                <div>
                  <h2 className="text-lg sm:text-2xl font-black text-[#1A1A1A] tracking-tight">{editingProduct ? 'Editar Precificação' : 'Nova Precificação'}</h2>
                  <p className="text-gray-500 font-medium italic text-[10px] sm:text-xs mt-0.5">Configure os custos e margens do seu produto.</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white text-gray-400 hover:text-gray-600 rounded-lg sm:rounded-xl transition-all shadow-sm border border-gray-100">
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
              
              <div className="p-4 sm:p-8 overflow-y-auto space-y-6 flex-1">
                {/* Product Name */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Nome do Produto</label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#8B5CF6] transition-colors">
                      <Package className="w-5 h-5" />
                    </div>
                    <input 
                      type="text" 
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="Ex: Bolsa de Couro Artesanal"
                      className="w-full pl-12 pr-6 py-3.5 bg-[#F9F7FE] border-2 border-transparent rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#8B5CF6]/10 focus:border-[#8B5CF6] transition-all font-bold text-[#1A1A1A] text-base placeholder:text-gray-300"
                    />
                  </div>
                </div>

                {/* Items Section */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center text-[#8B5CF6] shadow-inner">
                        <Plus className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-[#1A1A1A] tracking-tight">Itens e Materiais</h3>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Componentes do produto</p>
                      </div>
                    </div>
                    <div className="px-3 py-1 bg-[#8B5CF6]/5 rounded-xl text-[9px] font-black text-[#8B5CF6] uppercase tracking-widest border border-[#8B5CF6]/10">
                      {items.length} Itens
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {/* New Item Entry Row */}
                    <div className="grid grid-cols-12 gap-2 sm:gap-3 items-end bg-white p-4 sm:p-6 rounded-3xl border-2 border-[#8B5CF6]/30 shadow-xl shadow-[#8B5CF6]/5 relative group transition-all duration-300 hover:border-[#8B5CF6]/50 hover:shadow-[#8B5CF6]/10">
                      <div className="col-span-12 lg:col-span-4 space-y-1 relative">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Material / Serviço</label>
                        <input 
                          type="text" 
                          value={newItem.name}
                          onChange={(e) => {
                            setNewItem({ ...newItem, name: e.target.value, isLinked: false });
                            setShowSuggestions(true);
                          }}
                          onFocus={() => setShowSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                          placeholder="Nome do material"
                          className="w-full px-3 py-2.5 bg-[#F9F7FE] border border-transparent rounded-xl text-xs font-bold focus:border-[#8B5CF6] focus:outline-none shadow-sm focus:ring-4 focus:ring-[#8B5CF6]/5 transition-all"
                        />
                        {showSuggestions && filteredMaterials.length > 0 && (
                          <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                            {filteredMaterials.map((m, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setNewItem({
                                    ...newItem,
                                    name: m.name,
                                    unit: m.unit,
                                    costPrice: m.costPrice,
                                    isLinked: true
                                  });
                                  setShowSuggestions(false);
                                }}
                                className="w-full text-left px-4 py-2 text-xs font-bold hover:bg-[#8B5CF6]/5 transition-colors flex items-center justify-between group"
                              >
                                <span>{m.name}</span>
                                <span className="text-[9px] text-gray-400 group-hover:text-[#8B5CF6]">{m.unit} • R$ {m.costPrice}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="col-span-6 lg:col-span-2 space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Unidade</label>
                        <div className="relative">
                          <select 
                            value={newItem.unit}
                            onChange={(e) => setNewItem({ ...newItem, unit: e.target.value as Unit })}
                            disabled={newItem.isLinked}
                            className={`w-full px-3 py-2.5 bg-[#F9F7FE] border border-transparent rounded-xl text-xs font-bold appearance-none focus:border-[#8B5CF6] focus:outline-none shadow-sm focus:ring-4 focus:ring-[#8B5CF6]/5 transition-all ${newItem.isLinked ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <option value="Unidade">Unidade</option>
                            <option value="Metro">Metro</option>
                            <option value="Gramas">Gramas</option>
                            <option value="Litros">Litros</option>
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#8B5CF6] pointer-events-none" />
                        </div>
                      </div>
                      <div className="col-span-6 lg:col-span-2 space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Custo Unit.</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">R$</span>
                          <input 
                            type="number" 
                            value={newItem.costPrice || ''}
                            onChange={(e) => setNewItem({ ...newItem, costPrice: parseFloat(e.target.value) || 0 })}
                            disabled={newItem.isLinked}
                            placeholder="0,00"
                            className={`w-full pl-8 pr-3 py-2.5 bg-[#F9F7FE] border border-transparent rounded-xl text-xs font-bold focus:border-[#8B5CF6] focus:outline-none shadow-sm focus:ring-4 focus:ring-[#8B5CF6]/5 transition-all ${newItem.isLinked ? 'opacity-50 cursor-not-allowed' : ''}`}
                          />
                        </div>
                      </div>
                      <div className="col-span-6 lg:col-span-2 space-y-1">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Qtd.</label>
                        <input 
                          type="number" 
                          value={newItem.quantityUsed || ''}
                          onChange={(e) => setNewItem({ ...newItem, quantityUsed: parseFloat(e.target.value) || 0 })}
                          placeholder="1"
                          className="w-full px-3 py-2.5 bg-[#F9F7FE] border border-transparent rounded-xl text-xs font-bold focus:border-[#8B5CF6] focus:outline-none shadow-sm focus:ring-4 focus:ring-[#8B5CF6]/5 transition-all"
                        />
                      </div>
                      <div className="col-span-6 lg:col-span-2">
                        <button 
                          onClick={handleAddItem}
                          disabled={!newItem.name.trim()}
                          className={`w-full py-3 rounded-xl text-[9px] font-black uppercase tracking-[0.1em] flex items-center justify-center gap-1.5 transition-all shadow-lg ${
                            newItem.name.trim() 
                              ? 'bg-[#8B5CF6] text-white hover:bg-[#7C3AED] shadow-[#8B5CF6]/20 active:scale-95' 
                              : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                          }`}
                        >
                          <Plus className="w-4 h-4" /> Add
                        </button>
                      </div>
                    </div>

                    {/* Added Items List */}
                    {items.length > 0 && (
                      <div className="space-y-4 mt-8">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Itens Adicionados</label>
                        <div className="space-y-4">
                          {items.map((item) => (
                            <motion.div 
                              layout
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              key={item.id} 
                              className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm group hover:border-[#8B5CF6]/30 hover:shadow-xl hover:shadow-[#8B5CF6]/5 transition-all duration-300 relative"
                            >
                              <div className="grid grid-cols-12 gap-4">
                                {/* Material */}
                                <div className="col-span-12 sm:col-span-6 space-y-1.5">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Material / Serviço</label>
                                  <input 
                                    type="text" 
                                    value={item.name}
                                    onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                                    disabled={item.isLinked}
                                    placeholder="Nome do material"
                                    className={`w-full px-4 py-3 bg-[#F9F7FE] border border-transparent rounded-xl text-xs font-bold focus:border-[#8B5CF6] focus:outline-none transition-colors ${item.isLinked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  />
                                </div>

                                {/* Unidade */}
                                <div className="col-span-6 sm:col-span-3 space-y-1.5">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Unidade</label>
                                  <div className="relative">
                                    <select 
                                      value={item.unit}
                                      onChange={(e) => handleUpdateItem(item.id, 'unit', e.target.value as Unit)}
                                      disabled={item.isLinked}
                                      className={`w-full px-4 py-3 bg-[#F9F7FE] border border-transparent rounded-xl text-xs font-bold appearance-none focus:border-[#8B5CF6] focus:outline-none transition-colors ${item.isLinked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                      <option value="Unidade">Unidade</option>
                                      <option value="Metro">Metro</option>
                                      <option value="Gramas">Gramas</option>
                                      <option value="Litros">Litros</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                                  </div>
                                </div>

                                {/* Quantidade */}
                                <div className="col-span-6 sm:col-span-3 space-y-1.5">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Quantidade</label>
                                  <input 
                                    type="number" 
                                    value={item.quantityUsed || ''}
                                    onChange={(e) => handleUpdateItem(item.id, 'quantityUsed', parseFloat(e.target.value) || 0)}
                                    placeholder="1"
                                    className="w-full px-4 py-3 bg-[#F9F7FE] border border-transparent rounded-xl text-xs font-bold focus:border-[#8B5CF6] focus:outline-none transition-colors"
                                  />
                                </div>

                                {/* Custo */}
                                <div className="col-span-6 space-y-1.5">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Custo Unit.</label>
                                  <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">R$</span>
                                    <input 
                                      type="number" 
                                      value={item.costPrice || ''}
                                      onChange={(e) => handleUpdateItem(item.id, 'costPrice', parseFloat(e.target.value) || 0)}
                                      disabled={item.isLinked}
                                      className={`w-full pl-10 pr-4 py-3 bg-[#F9F7FE] border border-transparent rounded-xl text-xs font-bold focus:border-[#8B5CF6] focus:outline-none transition-colors ${item.isLinked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    />
                                  </div>
                                </div>

                                {/* Subtotal */}
                                <div className="col-span-6 space-y-1.5">
                                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Subtotal</label>
                                  <div className="w-full px-4 py-3 bg-[#8B5CF6]/5 border border-transparent rounded-xl text-sm font-black text-[#8B5CF6] tracking-tight flex items-center">
                                    {formatCurrency(item.costPrice * item.quantityUsed)}
                                  </div>
                                </div>
                              </div>

                              {/* Botão Excluir Item no Rodapé */}
                              <div className="mt-5 pt-4 border-t border-gray-50 flex justify-center">
                                <button 
                                  onClick={() => confirmDelete('item', item.id, item.name)}
                                  className="flex items-center gap-2 px-4 py-2 text-[10px] font-black text-red-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all uppercase tracking-[0.2em]"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Excluir Item
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Profit Margin & Summary */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-8 border-t border-gray-100">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Margem de Lucro</label>
                      <div className="relative group mt-2">
                        <input 
                          type="number" 
                          value={profitMargin}
                          onChange={(e) => setProfitMargin(parseFloat(e.target.value) || 0)}
                          className="w-full pl-6 pr-12 py-4 bg-[#F9F7FE] border-2 border-transparent rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#8B5CF6]/10 focus:border-[#8B5CF6] transition-all font-black text-[#1A1A1A] text-3xl tracking-tighter"
                        />
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-300 font-black text-xl group-focus-within:text-[#8B5CF6] transition-colors">%</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-4 bg-[#F9F7FE] rounded-2xl border border-gray-100">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Custo Total</p>
                        <p className="text-base font-black text-[#1A1A1A]">{formatCurrency(currentTotalCost)}</p>
                      </div>
                      <div className="p-4 bg-green-50 rounded-2xl border border-green-100">
                        <p className="text-[9px] font-black text-green-600 uppercase tracking-widest mb-0.5">Lucro Bruto</p>
                        <p className="text-base font-black text-green-600">+{formatCurrency(currentProfitValue)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#F9F7FE] rounded-3xl p-6 text-[#1A1A1A] space-y-4 shadow-xl shadow-gray-200/50 relative overflow-hidden group border border-[#8B5CF6]/10">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#8B5CF6]/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-[#8B5CF6]/10 transition-all duration-700" />
                    
                    <div className="flex justify-between items-center relative">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#8B5CF6]/10 flex items-center justify-center text-[#8B5CF6]">
                          <Calculator className="w-4 h-4" />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">Preço Sugerido</span>
                      </div>
                    </div>

                    <div className="relative">
                      <p className="text-4xl font-black text-[#8B5CF6] tracking-tighter mb-1">{formatCurrency(currentFinalPrice)}</p>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                        <span>Valor calculado com base nos insumos.</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 sm:p-8 border-t border-gray-100 flex justify-end gap-3 bg-[#F9F7FE]/30">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3.5 bg-white border-2 border-gray-100 text-gray-500 hover:bg-gray-50 hover:border-gray-200 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all shadow-sm active:scale-95"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleSave}
                  className="px-8 py-3.5 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white rounded-xl font-black uppercase tracking-widest text-[10px] transition-all shadow-xl shadow-[#8B5CF6]/20 flex items-center gap-2 active:scale-95 group"
                >
                  <CheckCircle2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  {editingProduct ? 'Atualizar Produto' : 'Finalizar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quote View Modal */}
      <AnimatePresence>
        {isViewQuoteModalOpen && selectedQuote && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsViewQuoteModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-3xl sm:rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-6 sm:p-10 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
                <div className="flex items-center gap-4 sm:gap-6">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl sm:rounded-3xl bg-[#8B5CF6]/10 flex items-center justify-center text-[#8B5CF6] shadow-inner">
                    <FileText className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-3xl font-black text-[#1A1A1A] tracking-tight">{selectedQuote.clientName}</h2>
                    <p className="text-gray-500 flex items-center gap-2 font-bold text-[10px] sm:text-sm mt-1">
                      <Phone className="w-3 h-3 sm:w-4 sm:h-4 text-[#8B5CF6]" /> {selectedQuote.clientPhone}
                    </p>
                  </div>
                </div>
                <button onClick={() => setIsViewQuoteModalOpen(false)} className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-white text-gray-400 hover:text-gray-600 rounded-xl sm:rounded-2xl transition-all shadow-sm border border-gray-100">
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>
              
              <div className="p-6 sm:p-10 overflow-y-auto space-y-10 flex-1">
                {/* Status Section */}
                <div className="bg-gray-50 rounded-[2rem] p-8 border border-gray-100">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#8B5CF6] shadow-sm border border-gray-100">
                        <Clock className="w-5 h-5" />
                      </div>
                      <h3 className="text-sm font-black text-[#1A1A1A] uppercase tracking-widest">Estado do Pedido</h3>
                    </div>
                    <button
                      onClick={() => {
                        setQuoteToUpdateStatus(selectedQuote);
                        setIsStatusModalOpen(true);
                      }}
                      className="px-4 py-2 bg-white hover:bg-[#8B5CF6] hover:text-white text-[#8B5CF6] rounded-xl text-[10px] font-black uppercase tracking-widest border border-[#8B5CF6]/20 transition-all shadow-sm flex items-center gap-2"
                    >
                      <Edit2 className="w-3 h-3" /> Alterar Status
                    </button>
                  </div>

                  <div className={`inline-flex items-center gap-4 px-6 py-4 rounded-2xl border-2 transition-all duration-300 ${
                    selectedQuote.status === 'Finalizado' ? 'bg-green-50 border-green-100 text-green-700' :
                    selectedQuote.status === 'Em produção' ? 'bg-blue-50 border-blue-100 text-blue-700' :
                    selectedQuote.status === 'Pagos' ? 'bg-purple-50 border-purple-100 text-purple-700' :
                    'bg-orange-50 border-orange-100 text-orange-700'
                  }`}>
                    <div className="relative flex h-3 w-3">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        selectedQuote.status === 'Finalizado' ? 'bg-green-400' :
                        selectedQuote.status === 'Em produção' ? 'bg-blue-400' :
                        selectedQuote.status === 'Pagos' ? 'bg-purple-400' :
                        'bg-orange-400'
                      }`}></span>
                      <span className={`relative inline-flex rounded-full h-3 w-3 ${
                        selectedQuote.status === 'Finalizado' ? 'bg-green-500' :
                        selectedQuote.status === 'Em produção' ? 'bg-blue-500' :
                        selectedQuote.status === 'Pagos' ? 'bg-purple-500' :
                        'bg-orange-500'
                      }`}></span>
                    </div>
                    <span className="text-lg font-black tracking-tight">{selectedQuote.status || 'Aguardando'}</span>
                  </div>
                </div>

                {/* Products Section */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 px-2">
                    <div className="w-8 h-8 rounded-lg bg-[#8B5CF6]/10 flex items-center justify-center text-[#8B5CF6]">
                      <Package className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Produtos Selecionados</h3>
                  </div>
                  
                  <div className="space-y-4">
                    {selectedQuote.products.map((product, pIndex) => {
                      const totalCost = (product.items || []).reduce((acc, item) => acc + (item.costPrice * item.quantityUsed), 0);
                      const profitValue = (totalCost * (product.profitMargin || 0)) / 100;
                      const finalPrice = totalCost + profitValue;
                      
                      return (
                        <motion.div 
                          key={product.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: pIndex * 0.1 }}
                          className="p-6 bg-white rounded-[1.5rem] border border-gray-100 shadow-sm flex justify-between items-center group hover:border-[#8B5CF6]/30 hover:shadow-xl hover:shadow-[#8B5CF6]/5 transition-all duration-300"
                        >
                          <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-[#8B5CF6]/10 group-hover:text-[#8B5CF6] transition-all duration-500 group-hover:rotate-6">
                              <Package className="w-7 h-7" />
                            </div>
                            <div>
                              <p className="font-black text-[#1A1A1A] text-lg tracking-tight group-hover:text-[#8B5CF6] transition-colors">{product.productName}</p>
                              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6]" />
                                {product.items?.length || 0} Componentes inclusos
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-black text-[#8B5CF6] tracking-tighter group-hover:scale-110 transition-transform origin-right">{formatCurrency(finalPrice)}</p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                {/* Summary Section */}
                <div className="pt-10 border-t border-gray-100 flex justify-between items-end">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-gray-400">
                      <Calendar className="w-4 h-4" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Data de Geração</p>
                    </div>
                    <p className="text-lg font-black text-gray-600 tracking-tight">{new Date(selectedQuote.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                  </div>
                  <div className="text-right space-y-2">
                    <p className="text-[10px] font-black text-[#8B5CF6] uppercase tracking-[0.3em] mb-1">Total do Orçamento</p>
                    <p className="text-5xl font-black text-[#1A1A1A] tracking-tighter">
                      {formatCurrency(selectedQuote.products.reduce((acc, product) => {
                        const totalCost = (product.items || []).reduce((itemAcc, item) => itemAcc + (item.costPrice * item.quantityUsed), 0);
                        const profitValue = (totalCost * (product.profitMargin || 0)) / 100;
                        return acc + totalCost + profitValue;
                      }, 0))}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-10 bg-gray-50/30 border-t border-gray-100">
                <button 
                  onClick={() => setIsViewQuoteModalOpen(false)}
                  className="w-full py-6 bg-white hover:bg-gray-50 text-gray-500 rounded-[1.5rem] font-black uppercase tracking-[0.2em] text-xs transition-all border-2 border-gray-100 shadow-sm active:scale-[0.98]"
                >
                  Fechar Visualização
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Item Edit Modal */}
      <AnimatePresence>
        {isItemEditModalOpen && itemToEdit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsItemEditModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-6 sm:p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#8B5CF6]/10 flex items-center justify-center text-[#8B5CF6]">
                    <Edit2 className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-[#1A1A1A] tracking-tight">Editar Insumo</h2>
                </div>
                <button onClick={() => setIsItemEditModalOpen(false)} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white text-gray-400 hover:text-gray-600 rounded-xl transition-all shadow-sm border border-gray-100">
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              <form onSubmit={handleItemEditSubmit} className="p-6 sm:p-8 space-y-6 flex-1 overflow-y-auto">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome do Material</label>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#8B5CF6] transition-colors">
                        <Package className="w-5 h-5" />
                      </div>
                      <input 
                        type="text"
                        required
                        placeholder="Ex: Couro Legítimo"
                        className="w-full pl-12 pr-6 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#8B5CF6]/10 focus:bg-white focus:border-[#8B5CF6] transition-all font-bold text-[#1A1A1A]"
                        value={itemToEdit.name}
                        onChange={(e) => setItemToEdit({ ...itemToEdit, name: e.target.value })}
                      />
                    </div>
                  </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Unidade</label>
                    <div className="relative">
                      <select 
                        className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#8B5CF6]/10 focus:bg-white focus:border-[#8B5CF6] transition-all font-bold text-[#1A1A1A] appearance-none"
                        value={itemToEdit.unit}
                        onChange={(e) => setItemToEdit({ ...itemToEdit, unit: e.target.value as Unit })}
                      >
                        <option value="Unidade">Unidade</option>
                        <option value="Metro">Metro</option>
                        <option value="Gramas">Gramas</option>
                        <option value="Litros">Litros</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B5CF6] pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Preço Custo</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">R$</span>
                      <input 
                        type="number"
                        step="0.01"
                        required
                        className="w-full pl-10 pr-6 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#8B5CF6]/10 focus:bg-white focus:border-[#8B5CF6] transition-all font-bold text-[#1A1A1A]"
                        value={itemToEdit.costPrice}
                        onChange={(e) => setItemToEdit({ ...itemToEdit, costPrice: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                </div>
              </div>

                <div className="pt-4 flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setIsItemEditModalOpen(false)}
                    className="flex-1 py-4 bg-white border-2 border-gray-100 text-gray-500 hover:bg-gray-50 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-xl shadow-[#8B5CF6]/30 active:scale-95"
                  >
                    Atualizar Item
                  </button>
                </div>
            </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Status Update Modal */}
      <AnimatePresence>
        {isStatusModalOpen && quoteToUpdateStatus && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsStatusModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md max-h-[90vh] rounded-3xl sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-5 sm:p-8 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-[#1A1A1A]">Alterar Status</h2>
                  <p className="text-[10px] sm:text-sm text-gray-400 mt-1">
                    Pedido de <span className="font-bold text-gray-600">{quoteToUpdateStatus.clientName}</span>
                  </p>
                </div>
                <button 
                  onClick={() => setIsStatusModalOpen(false)} 
                  className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-gray-50 text-gray-400 hover:text-gray-600 rounded-full transition-all"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
              
              <div className="p-5 sm:p-8 pt-2 sm:pt-4 space-y-3 flex-1 overflow-y-auto">
                {statusOptions.map((option, index) => {
                  const Icon = option.icon;
                  const isSelected = quoteToUpdateStatus.status === option.value;
                  
                  // Explicit color mapping to avoid dynamic class issues
                  const colorClasses = {
                    orange: isSelected ? 'bg-orange-500 border-orange-500 text-white' : 'bg-orange-50 text-orange-500 border-orange-100',
                    purple: isSelected ? 'bg-purple-500 border-purple-500 text-white' : 'bg-purple-50 text-purple-500 border-purple-100',
                    blue: isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-blue-50 text-blue-500 border-blue-100',
                    green: isSelected ? 'bg-green-500 border-green-500 text-white' : 'bg-green-50 text-green-500 border-green-100',
                  }[option.color as 'orange' | 'purple' | 'blue' | 'green'];

                  const hoverClasses = {
                    orange: 'hover:border-orange-200 hover:bg-orange-50/50',
                    purple: 'hover:border-purple-200 hover:bg-purple-50/50',
                    blue: 'hover:border-blue-200 hover:bg-blue-50/50',
                    green: 'hover:border-green-200 hover:bg-green-50/50',
                  }[option.color as 'orange' | 'purple' | 'blue' | 'green'];

                  const activeTextClasses = {
                    orange: isSelected ? 'text-orange-900' : 'text-gray-900',
                    purple: isSelected ? 'text-purple-900' : 'text-gray-900',
                    blue: isSelected ? 'text-blue-900' : 'text-gray-900',
                    green: isSelected ? 'text-green-900' : 'text-gray-900',
                  }[option.color as 'orange' | 'purple' | 'blue' | 'green'];

                  const badgeClasses = {
                    orange: 'bg-orange-500 text-white',
                    purple: 'bg-purple-500 text-white',
                    blue: 'bg-blue-500 text-white',
                    green: 'bg-green-500 text-white',
                  }[option.color as 'orange' | 'purple' | 'blue' | 'green'];

                  const borderClasses = {
                    orange: isSelected ? 'border-orange-500 bg-orange-50/30 shadow-lg shadow-orange-500/5' : 'border-gray-50',
                    purple: isSelected ? 'border-purple-500 bg-purple-50/30 shadow-lg shadow-purple-500/5' : 'border-gray-50',
                    blue: isSelected ? 'border-blue-500 bg-blue-50/30 shadow-lg shadow-blue-500/5' : 'border-gray-50',
                    green: isSelected ? 'border-green-500 bg-green-50/30 shadow-lg shadow-green-500/5' : 'border-gray-50',
                  }[option.color as 'orange' | 'purple' | 'blue' | 'green'];

                  const indicatorClasses = {
                    orange: 'bg-orange-500',
                    purple: 'bg-purple-500',
                    blue: 'bg-blue-500',
                    green: 'bg-green-500',
                  }[option.color as 'orange' | 'purple' | 'blue' | 'green'];

                  return (
                    <motion.button
                      key={option.value}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => {
                        updateQuoteStatus(quoteToUpdateStatus.id, option.value);
                        setIsStatusModalOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border-2 transition-all text-left relative group ${
                        isSelected ? borderClasses : `border-gray-50 ${hoverClasses}`
                      }`}
                    >
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl sm:rounded-2xl transition-all ${colorClasses}`}>
                        <Icon className="w-5 h-5 sm:w-6 h-6" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`font-black text-base sm:text-lg truncate ${activeTextClasses}`}>
                            {option.label}
                          </p>
                          {isSelected && (
                            <span className={`shrink-0 text-[8px] sm:text-[10px] font-black uppercase tracking-widest px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg ${badgeClasses}`}>
                              Atual
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] sm:text-xs text-gray-400 font-medium mt-0.5 leading-tight sm:leading-relaxed line-clamp-2">
                          {option.description}
                        </p>
                      </div>

                      {isSelected && (
                        <motion.div 
                          layoutId="active-indicator"
                          className={`absolute left-0 w-1.5 h-8 ${indicatorClasses} rounded-r-full`}
                        />
                      )}
                    </motion.button>
                  );
                })}
              </div>

              <div className="p-5 sm:p-8 pt-0">
                <button 
                  onClick={() => setIsStatusModalOpen(false)}
                  className="w-full py-3 sm:py-4 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-xl sm:rounded-2xl font-bold transition-all text-sm sm:text-base"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Item Update Confirmation Modal */}
      <AnimatePresence>
        {isItemConfirmModalOpen && itemToEdit && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsItemConfirmModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-6 text-center flex-1 overflow-y-auto">
                <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-black text-[#1A1A1A] mb-2">Atualizar em Massa?</h2>
                <p className="text-gray-500 text-sm mb-6">
                  Este item é utilizado em <span className="font-bold text-[#8B5CF6]">{affectedProducts.length}</span> precificações. 
                  Ao atualizar o preço, todos os cálculos abaixo serão recalculados automaticamente:
                </p>

                <div className="bg-gray-50 rounded-xl p-4 mb-6 max-h-40 overflow-y-auto text-left">
                  <ul className="space-y-2">
                    {affectedProducts.map(p => (
                      <li key={p.id} className="text-xs font-bold text-gray-600 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-[#8B5CF6] rounded-full"></div>
                        {p.productName}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      setIsItemConfirmModalOpen(false);
                      setIsItemEditModalOpen(true);
                    }}
                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-bold transition-all"
                  >
                    Voltar
                  </button>
                  <button 
                    onClick={confirmItemUpdate}
                    className="flex-1 py-3 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white rounded-xl font-bold transition-all shadow-lg shadow-[#8B5CF6]/20"
                  >
                    Confirmar Atualização
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm.isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm({ ...deleteConfirm, isOpen: false })}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center"
            >
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold mb-2">Confirmar Exclusão</h3>
              <p className="text-gray-500 text-sm mb-6">
                Tem certeza que deseja excluir <strong>"{deleteConfirm.title}"</strong>? Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteConfirm({ ...deleteConfirm, isOpen: false })}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={executeDelete}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {isLogoutModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLogoutModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center overflow-hidden"
            >
              {/* Decorative Background */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-50 rounded-full -mr-12 -mt-12" />
              
              <div className="relative">
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm">
                  <LogOut className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-[#1A1A1A] mb-2">Já vai embora?</h3>
                <p className="text-gray-500 text-sm mb-8">
                  Tem certeza que deseja sair do sistema? Suas alterações salvas estão seguras.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsLogoutModalOpen(false)}
                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-bold transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => {
                      setIsLogoutModalOpen(false);
                      logout();
                    }}
                    className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-500/20"
                  >
                    Sair agora
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </ErrorBoundary>
  );
}
