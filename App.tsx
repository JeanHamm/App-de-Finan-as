
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  CreditCard as IconCreditCard, 
  Landmark, 
  User as IconUser, 
  ChevronLeft, 
  ChevronRight, 
  TrendingUp, 
  TrendingDown, 
  Sparkles,
  Settings,
  Trash2,
  Home,
  List,
  CheckCircle,
  Circle,
  AlertCircle,
  CalendarClock,
  Edit2,
  Filter,
  Tag,
  X,
  LayoutGrid,
  Camera
} from 'lucide-react';
import { format, addMonths, subMonths, isSameMonth, parseISO, getDate, startOfMonth, isValid, setDate as setDateFns, isAfter, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { v4 as uuidv4 } from 'uuid';

import { 
  Transaction, 
  TransactionType, 
  PaymentMethod, 
  User, 
  CreditCard, 
  BankAccount,
  TransactionStatus,
  Category
} from './types';
import { getFinancialAdvice, parseReceiptImage } from './services/geminiService';

// --- Mock Data & Storage Helpers ---
const STORAGE_KEY = 'hamm_finances_data_v3';

interface AppData {
  transactions: Transaction[];
  cards: CreditCard[];
  accounts: BankAccount[];
  categories: Category[];
}

const defaultCategories: Category[] = [
  { id: 'cat_1', name: 'Alimentação', type: TransactionType.EXPENSE, color: '#f59e0b' },
  { id: 'cat_2', name: 'Moradia', type: TransactionType.EXPENSE, color: '#3b82f6' },
  { id: 'cat_3', name: 'Transporte', type: TransactionType.EXPENSE, color: '#ef4444' },
  { id: 'cat_4', name: 'Lazer', type: TransactionType.EXPENSE, color: '#8b5cf6' },
  { id: 'cat_5', name: 'Salário', type: TransactionType.INCOME, color: '#10b981' },
  { id: 'cat_6', name: 'Outros', type: TransactionType.EXPENSE, color: '#64748b' },
];

const initialData: AppData = {
  transactions: [],
  cards: [],
  accounts: [],
  categories: defaultCategories
};

// --- Components ---

// 1. Login Screen
const LoginScreen = ({ onLogin }: { onLogin: (user: User) => void }) => {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white">
      <h1 className="text-3xl font-bold mb-2 text-center">Família Hamm</h1>
      <p className="text-slate-400 mb-10">Gestão Financeira Inteligente</p>
      
      <div className="w-full max-w-xs space-y-4">
        <button 
          onClick={() => onLogin(User.STEFFANY)}
          className="w-full bg-gradient-to-r from-pink-500 to-rose-500 p-4 rounded-xl flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-transform"
        >
          <IconUser className="w-6 h-6" />
          <span className="font-semibold text-lg">Entrar como Steffany</span>
        </button>
        
        <button 
          onClick={() => onLogin(User.JEAN)}
          className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 p-4 rounded-xl flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-transform"
        >
          <IconUser className="w-6 h-6" />
          <span className="font-semibold text-lg">Entrar como Jean</span>
        </button>
      </div>
    </div>
  );
};

// 2. Modal Component
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
}

const Modal = ({ isOpen, onClose, title, children }: ModalProps) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col animate-slide-up sm:animate-fade-in">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 p-1">✕</button>
        </div>
        <div className="p-4 overflow-y-auto text-slate-900 no-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [data, setData] = useState<AppData>(initialData);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'transactions' | 'cards'>('home');

  // UI State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Partial<Transaction> | null>(null);
  const [isAnalyzingReceipt, setIsAnalyzingReceipt] = useState(false);
  
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [geminiAdvice, setGeminiAdvice] = useState<string | null>(null);
  const [isLoadingAdvice, setIsLoadingAdvice] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Data
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Migrations
      const migratedTransactions = parsed.transactions.map((t: any) => ({
        ...t,
        status: t.status || TransactionStatus.COMPLETED,
        categoryId: t.categoryId || undefined,
        purchaseDate: t.purchaseDate || t.date // Backfill purchaseDate
      }));
      const migratedCategories = parsed.categories && parsed.categories.length > 0 ? parsed.categories : defaultCategories;
      
      setData({ 
        ...parsed, 
        transactions: migratedTransactions,
        categories: migratedCategories
      });
    }
    setIsLoaded(true);
  }, []);

  // Save Data
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [data, isLoaded]);

  // --- Computed Data ---
  
  // Transactions belonging to the accounting month (Invoice Date)
  const currentMonthTransactions = useMemo(() => {
    return data.transactions.filter(t => 
      isSameMonth(parseISO(t.date), currentDate)
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data.transactions, currentDate]);

  const summary = useMemo(() => {
    let incomeReal = 0;
    let expenseReal = 0;
    let incomeProjected = 0;
    let expenseProjected = 0;
    
    currentMonthTransactions.forEach(t => {
      // Projected includes everything
      if (t.type === TransactionType.INCOME) incomeProjected += t.amount;
      else expenseProjected += t.amount;

      // Real includes only COMPLETED
      if (t.status === TransactionStatus.COMPLETED) {
        if (t.type === TransactionType.INCOME) incomeReal += t.amount;
        else expenseReal += t.amount;
      }
    });

    return { 
      incomeReal, 
      expenseReal, 
      balanceReal: incomeReal - expenseReal,
      balanceProjected: incomeProjected - expenseProjected
    };
  }, [currentMonthTransactions]);

  // Pending Transactions Logic
  const pendingTransactions = useMemo(() => {
    return data.transactions.filter(t => {
      if (t.status !== TransactionStatus.PENDING) return false;
      
      const pDate = t.purchaseDate ? parseISO(t.purchaseDate) : parseISO(t.date);
      return isSameMonth(pDate, currentDate);
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data.transactions, currentDate]);

  // --- Handlers ---

  const handleSaveTransaction = (formData: Partial<Transaction> & { installmentCount?: number, isTotalValue?: boolean, targetInvoiceDate?: string }) => {
    if (editingTransaction && editingTransaction.id) {
      // Edit Mode
      setData(prev => ({
        ...prev,
        transactions: prev.transactions.map(t => t.id === editingTransaction.id ? { ...t, ...formData } as Transaction : t)
      }));
      setEditingTransaction(null);
    } else {
      // Add Mode
      const { installmentCount = 1, isTotalValue = true, targetInvoiceDate, ...txBase } = formData;
      
      let transactionsToAdd: Transaction[] = [];
      const baseAmount = txBase.amount || 0;
      const purchaseDate = txBase.date ? parseISO(txBase.date) : new Date();
      const txUser = currentUser || User.STEFFANY;
      const txStatus = txBase.status || TransactionStatus.COMPLETED;
      
      if (txBase.paymentMethod === PaymentMethod.CREDIT_CARD && txBase.cardId) {
        const card = data.cards.find(c => c.id === txBase.cardId);
        if (card) {
          // Determine the starting invoice date
          let startInvoiceDate: Date;

          if (targetInvoiceDate) {
            const selectedMonth = parseISO(targetInvoiceDate);
            startInvoiceDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), card.dueDay);
          } else {
            // Default Calculation
            const closingDay = card.closingDay;
            const txDay = getDate(purchaseDate);
            startInvoiceDate = purchaseDate;
            
            if (txDay >= closingDay) {
              startInvoiceDate = addMonths(purchaseDate, 1);
            }
            startInvoiceDate = new Date(startInvoiceDate.getFullYear(), startInvoiceDate.getMonth(), card.dueDay);
          }
          
          const monthlyAmount = isTotalValue ? (baseAmount / installmentCount) : baseAmount;

          for (let i = 0; i < installmentCount; i++) {
            const targetMonth = addMonths(startInvoiceDate, i);
            const dueDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), card.dueDay);
            
            transactionsToAdd.push({
              id: uuidv4(),
              description: installmentCount > 1 ? `${txBase.description} (${i + 1}/${installmentCount})` : `${txBase.description}`,
              amount: monthlyAmount,
              type: TransactionType.EXPENSE,
              status: txStatus, 
              date: dueDate.toISOString(), 
              purchaseDate: purchaseDate.toISOString(),
              user: txUser,
              paymentMethod: PaymentMethod.CREDIT_CARD,
              cardId: txBase.cardId,
              categoryId: txBase.categoryId,
              installments: {
                current: i + 1,
                total: installmentCount,
                originalTransactionId: i === 0 ? uuidv4() : undefined
              }
            });
          }
        }
      } else {
        // Cash/Debit
        transactionsToAdd.push({
          id: uuidv4(),
          description: txBase.description || '',
          amount: baseAmount,
          type: txBase.type || TransactionType.EXPENSE,
          status: txStatus,
          date: purchaseDate.toISOString(),
          purchaseDate: purchaseDate.toISOString(),
          user: txUser,
          paymentMethod: PaymentMethod.CASH_DEBIT,
          accountId: txBase.accountId,
          categoryId: txBase.categoryId
        });
      }

      setData(prev => ({
        ...prev,
        transactions: [...prev.transactions, ...transactionsToAdd]
      }));
    }
    setShowAddModal(false);
  };

  const handleEditClick = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setShowAddModal(true);
  };

  const handleDeleteTransaction = (id: string) => {
    if (confirm("Tem certeza que deseja excluir?")) {
      setData(prev => ({
        ...prev,
        transactions: prev.transactions.filter(t => t.id !== id)
      }));
    }
  };

  const handleToggleStatus = (id: string) => {
    setData(prev => ({
      ...prev,
      transactions: prev.transactions.map(t => 
        t.id === id 
          ? { ...t, status: t.status === TransactionStatus.PENDING ? TransactionStatus.COMPLETED : TransactionStatus.PENDING }
          : t
      )
    }));
  };

  const handleAdvice = async () => {
    if (!currentUser) return;
    setIsLoadingAdvice(true);
    const advice = await getFinancialAdvice(
      currentMonthTransactions, 
      format(currentDate, 'MMMM/yyyy', { locale: ptBR }), 
      currentUser
    );
    setGeminiAdvice(advice);
    setIsLoadingAdvice(false);
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert to Base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const base64Data = base64.split(',')[1]; // Remove header
      
      setIsAnalyzingReceipt(true);
      try {
        const extractedData = await parseReceiptImage(base64Data);
        if (extractedData) {
          // Find matching card
          let matchedCardId = undefined;
          if (extractedData.last4Digits) {
             const card = data.cards.find(c => c.last4Digits && c.last4Digits.endsWith(extractedData.last4Digits));
             if (card) matchedCardId = card.id;
          }

          setEditingTransaction({
            description: extractedData.description || '',
            amount: extractedData.amount || 0,
            date: extractedData.date || new Date().toISOString(),
            type: extractedData.type === 'INCOME' ? TransactionType.INCOME : TransactionType.EXPENSE,
            paymentMethod: extractedData.paymentMethod === 'CREDIT_CARD' ? PaymentMethod.CREDIT_CARD : PaymentMethod.CASH_DEBIT,
            cardId: matchedCardId,
            // Default status to COMPLETED (Feita) as per requirement
            status: TransactionStatus.COMPLETED
          });
          setShowAddModal(true);
        } else {
          alert("Não foi possível ler os dados da imagem. Tente novamente ou insira manualmente.");
          setEditingTransaction(null);
          setShowAddModal(true);
        }
      } catch (err) {
        console.error(err);
        alert("Erro ao analisar imagem.");
      } finally {
        setIsAnalyzingReceipt(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  // --- Render Logic ---

  if (!currentUser) {
    return <LoginScreen onLogin={setCurrentUser} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Global Loading Overlay */}
      {isAnalyzingReceipt && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex flex-col items-center justify-center text-white">
          <Sparkles className="w-12 h-12 animate-spin mb-4 text-purple-400" />
          <p className="font-bold text-lg">Analisando Comprovante...</p>
        </div>
      )}

      {/* Header */}
      <header className="bg-slate-900 text-white pt-safe-top sticky top-0 z-10 shadow-md">
        <div className="flex justify-between items-center p-4">
          <div className="flex items-center gap-2" onClick={() => setCurrentUser(null)}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-400 to-purple-500 flex items-center justify-center font-bold text-xs">
              {currentUser[0]}
            </div>
            <div className="leading-tight">
              <span className="block font-medium text-sm">{currentUser}</span>
              <span className="text-[10px] text-slate-400">Trocar usuário</span>
            </div>
          </div>
          <button onClick={() => setShowSettingsModal(true)} className="p-2 hover:bg-slate-800 rounded-full">
            <Settings className="w-5 h-5" />
          </button>
        </div>
        
        {/* Date Navigator - Show on Home and Cards */}
        {activeTab !== 'transactions' && (
          <div className="flex justify-between items-center px-6 pb-4">
            <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-1 hover:text-blue-300">
              <ChevronLeft />
            </button>
            <h2 className="text-xl font-bold capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
            </h2>
            <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-1 hover:text-blue-300">
              <ChevronRight />
            </button>
          </div>
        )}
      </header>

      <main className="max-w-md mx-auto">
        {activeTab === 'home' && (
          <DashboardView 
            summary={summary}
            pendingTransactions={pendingTransactions}
            currentDate={currentDate}
            transactions={data.transactions}
            cards={data.cards}
            onToggleStatus={handleToggleStatus}
            onAskAdvice={handleAdvice}
            geminiAdvice={geminiAdvice}
            isLoadingAdvice={isLoadingAdvice}
          />
        )}

        {activeTab === 'transactions' && (
          <TransactionsListView 
            transactions={data.transactions}
            categories={data.categories}
            cards={data.cards}
            onDelete={handleDeleteTransaction}
            onEdit={handleEditClick}
            onToggleStatus={handleToggleStatus}
          />
        )}

        {activeTab === 'cards' && (
          <CardsView 
            cards={data.cards}
            transactions={data.transactions}
            currentDate={currentDate}
            categories={data.categories}
            onDateChange={setCurrentDate}
          />
        )}
      </main>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-24 right-6 flex flex-col items-center gap-3 z-40">
        <input 
          type="file" 
          ref={fileInputRef}
          accept="image/*"
          className="hidden"
          capture="environment"
          onChange={handleReceiptUpload}
          id="camera-input"
        />
        <label 
          htmlFor="camera-input"
          className="bg-white text-slate-800 p-3 rounded-full shadow-lg hover:scale-110 active:scale-95 transition-all cursor-pointer border border-slate-200"
        >
          <Camera className="w-5 h-5" />
        </label>
        <button 
          onClick={() => { setEditingTransaction(null); setShowAddModal(true); }}
          className="bg-blue-600 text-white p-4 rounded-full shadow-xl shadow-blue-600/30 hover:scale-110 active:scale-95 transition-all"
        >
          <Plus className="w-7 h-7" />
        </button>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-safe-bottom z-30 flex justify-around py-3">
        <button 
          onClick={() => setActiveTab('home')} 
          className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <Home size={24} />
          <span className="text-[10px] font-medium">Início</span>
        </button>
        <button 
          onClick={() => setActiveTab('transactions')} 
          className={`flex flex-col items-center gap-1 ${activeTab === 'transactions' ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <List size={24} />
          <span className="text-[10px] font-medium">Transações</span>
        </button>
        <button 
          onClick={() => setActiveTab('cards')} 
          className={`flex flex-col items-center gap-1 ${activeTab === 'cards' ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <IconCreditCard size={24} />
          <span className="text-[10px] font-medium">Cartões</span>
        </button>
      </nav>

      {/* Add Transaction Modal */}
      <Modal 
        isOpen={showAddModal} 
        onClose={() => { setShowAddModal(false); setEditingTransaction(null); }} 
        title={editingTransaction?.id ? "Editar Transação" : "Nova Transação"}
      >
        <TransactionForm 
          cards={data.cards} 
          accounts={data.accounts}
          categories={data.categories}
          currentUser={currentUser}
          initialData={editingTransaction}
          onSubmit={handleSaveTransaction} 
        />
      </Modal>

      {/* Settings Modal */}
      <Modal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} title="Configurações">
        <SettingsForm 
          data={data} 
          setData={setData} 
        />
      </Modal>
    </div>
  );
}

// --- Sub-Views ---

function DashboardView({ 
  summary, 
  pendingTransactions, 
  currentDate, 
  transactions, 
  onToggleStatus, 
  onAskAdvice, 
  geminiAdvice, 
  isLoadingAdvice 
}: any) {
  
  // Future Invoices Widget (1 year ahead)
  const futureInvoices = useMemo(() => {
    // 0 to 12 (Current month + 12 months)
    const futures = Array.from({ length: 13 }, (_, i) => i).map(offset => {
      const month = addMonths(currentDate, offset);
      const total = transactions
        .filter((t: Transaction) => 
          t.type === TransactionType.EXPENSE && 
          t.paymentMethod === PaymentMethod.CREDIT_CARD &&
          isSameMonth(parseISO(t.date), month)
        )
        .reduce((sum: number, t: Transaction) => sum + t.amount, 0);
      
      return { date: month, total };
    });
    return futures;
  }, [transactions, currentDate]);

  return (
    <div className="p-4 space-y-6 animate-fade-in">
      
      {/* Balance Cards */}
      <div className="space-y-3">
        {/* Real Balance */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-2xl shadow-lg text-white relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex justify-between items-start">
               <div>
                 <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Saldo Real (Pago)</p>
                 <p className={`text-3xl font-bold ${summary.balanceReal < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                   R$ {summary.balanceReal.toFixed(2)}
                 </p>
               </div>
               <div className="bg-white/10 p-2 rounded-lg">
                 <CheckCircle className="text-emerald-400" size={20} />
               </div>
            </div>
          </div>
        </div>

        {/* Projected Balance */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Saldo Previsto (Total)</p>
              <p className={`text-2xl font-bold ${summary.balanceProjected < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                R$ {summary.balanceProjected.toFixed(2)}
              </p>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg">
               <CalendarClock className="text-blue-500" size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* Income/Expense Mini Stats */}
      <div className="grid grid-cols-2 gap-3">
         <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
            <div className="flex items-center gap-2 text-emerald-700 mb-1">
               <TrendingUp size={14} />
               <span className="text-xs font-bold uppercase">Entradas Prev.</span>
            </div>
            <p className="text-lg font-bold text-emerald-800">R$ {summary.incomeReal + (summary.balanceProjected - summary.balanceReal > 0 ? 0 : 0)}</p> 
         </div>
         <div className="bg-red-50 p-3 rounded-xl border border-red-100">
            <div className="flex items-center gap-2 text-red-700 mb-1">
               <TrendingDown size={14} />
               <span className="text-xs font-bold uppercase">Saídas Prev.</span>
            </div>
            <p className="text-lg font-bold text-red-800">R$ {Math.abs(summary.expenseReal + (summary.balanceProjected - summary.balanceReal < 0 ? 0 : 0)).toFixed(2)}</p>
         </div>
      </div>

      {/* Pending Transactions Widget */}
      {pendingTransactions.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
          <div className="bg-orange-50 px-4 py-2 border-b border-orange-100 flex justify-between items-center">
            <h3 className="font-bold text-orange-800 text-sm flex items-center gap-2">
              <AlertCircle size={16} /> Aprovar Pendências (Mês Atual)
            </h3>
            <span className="bg-orange-200 text-orange-800 text-[10px] px-2 rounded-full font-bold">
              {pendingTransactions.length}
            </span>
          </div>
          <div className="divide-y divide-slate-50">
            {pendingTransactions.slice(0, 3).map((tx: Transaction) => (
              <div key={tx.id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 text-slate-500`}>
                    {tx.paymentMethod === PaymentMethod.CREDIT_CARD ? <IconCreditCard size={14} /> : <Landmark size={14} />}
                  </div>
                  <div>
                    <p className="font-medium text-slate-800 text-sm">{tx.description}</p>
                    <p className="text-xs text-slate-500">
                      Lançado: {format(parseISO(tx.purchaseDate || tx.date), 'dd/MM')} • {tx.user}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-bold text-sm ${tx.type === TransactionType.INCOME ? 'text-emerald-600' : 'text-red-600'}`}>
                    R$ {tx.amount.toFixed(2)}
                  </span>
                  <button 
                    onClick={() => onToggleStatus(tx.id)}
                    className="text-slate-300 hover:text-emerald-500 transition-colors"
                    title="Aprovar / Pagar"
                  >
                    <Circle size={20} />
                  </button>
                </div>
              </div>
            ))}
            {pendingTransactions.length > 3 && (
              <button onClick={() => document.getElementById('btn-transacoes')?.click()} className="w-full p-2 text-center text-xs text-slate-500 hover:bg-slate-50">
                Ver todas as pendências
              </button>
            )}
          </div>
        </div>
      )}

      {/* Future Invoices Widget (1 Year) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
          <IconCreditCard size={16} className="text-purple-500" /> Previsão de Faturas (12 Meses)
        </h3>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 snap-x">
          {futureInvoices.map((item: any, idx: number) => (
            <div key={idx} className={`snap-start min-w-[100px] flex-1 rounded-xl p-3 border flex flex-col items-center justify-center ${idx === 0 ? 'bg-slate-800 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <span className={`text-[10px] font-bold uppercase mb-1 ${idx === 0 ? 'text-slate-400' : 'text-slate-500'}`}>
                {format(item.date, 'MMM/yy', { locale: ptBR })}
              </span>
              <span className={`text-sm font-bold ${idx === 0 ? 'text-white' : 'text-slate-800'}`}>
                R$ {item.total.toFixed(0)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Advisor */}
      <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 overflow-hidden">
          <div className="p-4 flex justify-between items-center bg-indigo-50/50">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span className="font-bold text-indigo-900 text-sm">Conselheiro IA</span>
            </div>
            <button 
              onClick={onAskAdvice} 
              disabled={isLoadingAdvice}
              className="text-xs bg-white border border-indigo-100 px-3 py-1 rounded-full text-indigo-600 font-medium hover:bg-indigo-50"
            >
              {isLoadingAdvice ? 'Pensando...' : 'Analisar'}
            </button>
          </div>
          {geminiAdvice && (
            <div className="p-4 text-sm text-slate-600 leading-relaxed border-t border-indigo-100 animate-fade-in">
              {geminiAdvice}
            </div>
          )}
      </div>

    </div>
  );
}

function TransactionsListView({ transactions, categories, cards, onDelete, onEdit, onToggleStatus }: any) {
  // State for filters
  const [filterMonth, setFilterMonth] = useState(new Date());
  const [filterType, setFilterType] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterCard, setFilterCard] = useState<string>('ALL');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    return transactions.filter((t: Transaction) => {
      const sameMonth = isSameMonth(parseISO(t.date), filterMonth);
      const matchType = filterType === 'ALL' || t.type === filterType;
      const matchStatus = filterStatus === 'ALL' || t.status === filterStatus;
      const matchCategory = filterCategory === 'ALL' || t.categoryId === filterCategory;
      const matchCard = filterCard === 'ALL' || t.cardId === filterCard;
      
      return sameMonth && matchType && matchStatus && matchCategory && matchCard;
    }).sort((a: Transaction, b: Transaction) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, filterMonth, filterType, filterStatus, filterCategory, filterCard]);

  // Calculate filtered summary
  const listSummary = useMemo(() => {
    return filtered.reduce((acc: any, t: Transaction) => {
      if (t.type === TransactionType.INCOME) acc.income += t.amount;
      else acc.expense += t.amount;
      return acc;
    }, { income: 0, expense: 0 });
  }, [filtered]);

  return (
    <div className="pb-20">
      <div className="bg-white border-b sticky top-[60px] z-10 shadow-sm">
         <div className="p-4 flex justify-between items-center">
            <button onClick={() => setFilterMonth(subMonths(filterMonth, 1))}><ChevronLeft size={20} /></button>
            <span className="font-bold capitalize">{format(filterMonth, 'MMMM yyyy', { locale: ptBR })}</span>
            <button onClick={() => setFilterMonth(addMonths(filterMonth, 1))}><ChevronRight size={20} /></button>
         </div>

         {/* Filter Toggle */}
         <div className="px-4 pb-2 flex justify-between items-center">
            <div className="text-xs text-slate-500">
              {filtered.length} transações
            </div>
            <button 
              onClick={() => setShowFilters(!showFilters)} 
              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border ${showFilters ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600'}`}
            >
              <Filter size={12} /> Filtros
            </button>
         </div>

         {/* Expanded Filters */}
         {showFilters && (
           <div className="px-4 pb-4 space-y-3 animate-slide-down bg-slate-50 border-t border-slate-100 pt-3">
              <div className="flex gap-2">
                 <select 
                   value={filterType} 
                   onChange={e => setFilterType(e.target.value as any)}
                   className="flex-1 text-xs p-2 rounded-lg border bg-white text-slate-900"
                 >
                   <option value="ALL">Todos os Tipos</option>
                   <option value="INCOME">Entradas</option>
                   <option value="EXPENSE">Saídas</option>
                 </select>
                 <select 
                   value={filterStatus} 
                   onChange={e => setFilterStatus(e.target.value as any)}
                   className="flex-1 text-xs p-2 rounded-lg border bg-white text-slate-900"
                 >
                   <option value="ALL">Qualquer Status</option>
                   <option value="PENDING">Previsto</option>
                   <option value="COMPLETED">Feito</option>
                 </select>
              </div>
              <div className="flex gap-2">
                <select 
                  value={filterCategory} 
                  onChange={e => setFilterCategory(e.target.value)}
                  className="flex-1 text-xs p-2 rounded-lg border bg-white text-slate-900"
                >
                  <option value="ALL">Todas as Categorias</option>
                  {categories.map((c: Category) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select 
                  value={filterCard} 
                  onChange={e => setFilterCard(e.target.value)}
                  className="flex-1 text-xs p-2 rounded-lg border bg-white text-slate-900"
                >
                  <option value="ALL">Todos Cartões</option>
                  {cards.map((c: CreditCard) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
           </div>
         )}

         {/* Filtered Summary */}
         <div className="grid grid-cols-3 text-center py-2 bg-slate-50 text-xs border-t border-slate-100">
             <div className="text-emerald-600 font-bold">
                <span className="block text-[10px] uppercase text-slate-400 font-normal">Entradas</span>
                + {listSummary.income.toFixed(2)}
             </div>
             <div className="text-red-600 font-bold">
                <span className="block text-[10px] uppercase text-slate-400 font-normal">Saídas</span>
                - {listSummary.expense.toFixed(2)}
             </div>
             <div className={`${listSummary.income - listSummary.expense >= 0 ? 'text-slate-800' : 'text-red-600'} font-bold`}>
                <span className="block text-[10px] uppercase text-slate-400 font-normal">Saldo</span>
                { (listSummary.income - listSummary.expense).toFixed(2) }
             </div>
         </div>
      </div>

      <div className="p-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center text-slate-400 py-10">Nenhuma transação encontrada com estes filtros.</div>
        ) : (
          filtered.map((tx: Transaction) => {
            const cat = categories.find((c: Category) => c.id === tx.categoryId);
            return (
              <div key={tx.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between group relative overflow-hidden">
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${tx.type === TransactionType.INCOME ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                
                <div className="flex items-center gap-3 pl-2">
                   <button onClick={() => onToggleStatus(tx.id)} className="z-10">
                     {tx.status === TransactionStatus.COMPLETED ? (
                       <CheckCircle className="text-emerald-500" size={20} />
                     ) : (
                       <Circle className="text-slate-300 hover:text-emerald-500 transition-colors" size={20} />
                     )}
                   </button>
                   <div>
                      <div className="flex items-center gap-2">
                        <p className={`font-semibold text-sm ${tx.status === TransactionStatus.COMPLETED ? 'text-slate-800' : 'text-slate-500'}`}>
                          {tx.description}
                        </p>
                        {cat && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                            {cat.name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>{format(parseISO(tx.date), 'dd')}</span>
                        {tx.installments && (
                          <span className="bg-purple-50 text-purple-600 px-1 rounded text-[10px]">
                            {tx.installments.current}/{tx.installments.total}
                          </span>
                        )}
                         <span>• {tx.user}</span>
                      </div>
                   </div>
                </div>
                <div className="flex items-center gap-3">
                   <span className={`font-bold text-sm ${tx.type === TransactionType.INCOME ? 'text-emerald-600' : 'text-red-600'}`}>
                      R$ {tx.amount.toFixed(2)}
                   </span>
                   <div className="flex gap-1">
                      <button onClick={() => onEdit(tx)} className="text-slate-300 hover:text-blue-500 p-1.5 rounded hover:bg-blue-50">
                          <Edit2 size={16} />
                      </button>
                      <button onClick={() => onDelete(tx.id)} className="text-slate-300 hover:text-red-500 p-1.5 rounded hover:bg-red-50">
                          <Trash2 size={16} />
                      </button>
                   </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CardsView({ cards, transactions, categories, currentDate, onDateChange }: any) {
  const [selectedCardId, setSelectedCardId] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  useEffect(() => {
    if (cards.length > 0 && selectedCardId !== 'ALL' && !cards.find((c: CreditCard) => c.id === selectedCardId)) {
      setSelectedCardId(cards[0].id);
    }
  }, [cards, selectedCardId]);

  const currentCard = selectedCardId === 'ALL' ? null : cards.find((c: CreditCard) => c.id === selectedCardId);

  const cardTransactions = useMemo(() => {
    return transactions.filter((t: Transaction) => {
       const matchCard = selectedCardId === 'ALL' ? (t.paymentMethod === PaymentMethod.CREDIT_CARD) : t.cardId === selectedCardId;
       const matchDate = isSameMonth(parseISO(t.date), currentDate);
       const matchCat = filterCategory === 'ALL' || t.categoryId === filterCategory;
       return matchCard && matchDate && matchCat;
    }).sort((a: Transaction, b: Transaction) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [transactions, selectedCardId, currentDate, filterCategory]);

  const invoiceTotal = cardTransactions.reduce((sum: number, t: Transaction) => sum + t.amount, 0);
  
  // For "All", sum all limits
  const totalLimit = cards.reduce((sum: number, c: CreditCard) => sum + c.limit, 0);
  const displayLimit = currentCard ? currentCard.limit : totalLimit;
  
  const limitUsedPercent = displayLimit > 0 ? Math.min((invoiceTotal / displayLimit) * 100, 100) : 0;

  if (cards.length === 0) {
    return <div className="p-8 text-center text-slate-500">Nenhum cartão cadastrado. Vá em configurações.</div>;
  }

  return (
    <div className="p-4 pb-24 space-y-6">
      {/* Card Selector */}
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
        <button
            onClick={() => setSelectedCardId('ALL')}
            className={`min-w-[150px] p-4 rounded-xl border text-left transition-all flex flex-col justify-between h-24 ${selectedCardId === 'ALL' ? 'bg-slate-800 text-white border-slate-800 shadow-lg transform scale-105' : 'bg-white text-slate-600 border-slate-200'}`}
          >
            <p className="font-bold text-sm">Todos os Cartões</p>
            <div>
               <p className="text-xs opacity-80">Visão Geral</p>
            </div>
        </button>
        {cards.map((card: CreditCard) => (
          <button
            key={card.id}
            onClick={() => setSelectedCardId(card.id)}
            className={`min-w-[150px] p-4 rounded-xl border text-left transition-all flex flex-col justify-between h-24 ${selectedCardId === card.id ? 'bg-slate-800 text-white border-slate-800 shadow-lg transform scale-105' : 'bg-white text-slate-600 border-slate-200'}`}
          >
            <p className="font-bold text-sm truncate">{card.name}</p>
            <div>
               <p className="text-xs opacity-80">Venc: dia {card.dueDay}</p>
               <p className="text-[10px] opacity-60">Lim: R$ {card.limit}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Detailed Invoice Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Date Nav */}
          <div className="bg-slate-50 p-2 flex justify-between items-center border-b border-slate-200">
             <button onClick={() => onDateChange(subMonths(currentDate, 1))} className="p-2 hover:bg-slate-200 rounded-full"><ChevronLeft size={16}/></button>
             <span className="text-sm font-bold text-slate-700 capitalize">{format(currentDate, 'MMMM yyyy', { locale: ptBR })}</span>
             <button onClick={() => onDateChange(addMonths(currentDate, 1))} className="p-2 hover:bg-slate-200 rounded-full"><ChevronRight size={16}/></button>
          </div>
          
          <div className="p-5 text-center">
             <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                {selectedCardId === 'ALL' ? 'Total das Faturas' : 'Fatura Atual'}
             </p>
             <p className="text-3xl font-bold text-slate-800 mb-4">R$ {invoiceTotal.toFixed(2)}</p>
             
             {/* Limit Progress */}
             <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
               <div 
                className={`h-full rounded-full ${limitUsedPercent > 90 ? 'bg-red-500' : 'bg-blue-500'}`} 
                style={{ width: `${limitUsedPercent}%` }}
               ></div>
             </div>
             
             <div className="flex justify-between mt-1">
               <span className="text-[10px] text-slate-400">R$ 0</span>
               <span className="text-[10px] text-slate-400">Limite R$ {displayLimit}</span>
             </div>
          </div>

          {/* Category Filter inside Cards */}
          <div className="px-4 pb-4 border-t border-slate-100 pt-3">
             <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Filtrar Categoria</label>
             <select 
                 value={filterCategory} 
                 onChange={e => setFilterCategory(e.target.value)}
                 className="w-full text-xs p-2 rounded-lg border bg-slate-50 text-slate-900"
               >
                 <option value="ALL">Todas</option>
                 {categories.filter((c: Category) => c.type === TransactionType.EXPENSE).map((c: Category) => (
                   <option key={c.id} value={c.id}>{c.name}</option>
                 ))}
               </select>
          </div>
      </div>

      {/* Transactions List */}
      <div className="space-y-2">
         <h4 className="font-bold text-slate-700 text-sm">Lançamentos</h4>
         <div className="divide-y divide-slate-100 bg-white rounded-xl border border-slate-200">
          {cardTransactions.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">Nenhuma compra nesta fatura.</div>
          ) : (
            cardTransactions.map((tx: Transaction) => (
              <div key={tx.id} className="p-3 flex justify-between items-center hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="bg-slate-100 p-2 rounded-full text-slate-500">
                    <IconCreditCard size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{tx.description}</p>
                    <p className="text-xs text-slate-400">
                      {format(parseISO(tx.date), 'dd/MM')} • {tx.user} 
                      {tx.installments && <span className="ml-1 text-purple-600 bg-purple-50 px-1 rounded text-[10px] font-bold">{tx.installments.current}/{tx.installments.total}</span>}
                    </p>
                  </div>
                </div>
                <span className="font-bold text-sm text-slate-700">R$ {tx.amount.toFixed(2)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// --- Sub-Components for Modals ---

function TransactionForm({ cards, accounts, categories, currentUser, initialData, onSubmit }: any) {
  const [type, setType] = useState<TransactionType>(initialData?.type || TransactionType.EXPENSE);
  const [description, setDescription] = useState(initialData?.description || '');
  const [amount, setAmount] = useState(initialData?.amount?.toString() || '');
  const [date, setDate] = useState(initialData?.purchaseDate ? format(parseISO(initialData.purchaseDate), 'yyyy-MM-dd') : (initialData?.date ? format(parseISO(initialData.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialData?.paymentMethod || PaymentMethod.CASH_DEBIT);
  const [status, setStatus] = useState<TransactionStatus>(initialData?.status || TransactionStatus.COMPLETED);
  const [cardId, setCardId] = useState(initialData?.cardId || '');
  const [accountId, setAccountId] = useState(initialData?.accountId || accounts[0]?.id || '');
  const [categoryId, setCategoryId] = useState(initialData?.categoryId || '');
  
  // Credit specific
  const [installments, setInstallments] = useState(1);
  const [isTotalValue, setIsTotalValue] = useState(true);
  const [targetInvoiceDate, setTargetInvoiceDate] = useState(''); // ISO date of the 1st of the month of the invoice

  useEffect(() => {
    // Only auto-select if we are adding new and no card provided
    if (!initialData && !cardId && cards.length > 0) {
      setCardId(cards[0].id);
    }
    // Auto select first account
    if (!accountId && accounts.length > 0) setAccountId(accounts[0].id);
  }, [cards, accounts, cardId, accountId, initialData]);

  // Calculate Invoice Options whenever Date or Card changes
  const invoiceOptions = useMemo(() => {
    if (paymentMethod !== PaymentMethod.CREDIT_CARD || !cardId) return [];
    const card = cards.find((c: CreditCard) => c.id === cardId);
    if (!card) return [];

    const purchaseDate = parseISO(date);
    if (!isValid(purchaseDate)) return [];

    const purchaseDay = getDate(purchaseDate);
    const closingDay = card.closingDay;
    
    let baseMonth = startOfMonth(purchaseDate);
    if (purchaseDay >= closingDay) {
      baseMonth = addMonths(baseMonth, 1);
    }

    // Generate 3 options: Calculated, Next, Next+1
    return [
      baseMonth,
      addMonths(baseMonth, 1),
      addMonths(baseMonth, 2)
    ];
  }, [date, cardId, paymentMethod, cards]);

  useEffect(() => {
     if (invoiceOptions.length > 0 && !targetInvoiceDate && !initialData) {
         setTargetInvoiceDate(invoiceOptions[0].toISOString());
     }
  }, [invoiceOptions, targetInvoiceDate, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;

    if (type === TransactionType.EXPENSE && paymentMethod === PaymentMethod.CREDIT_CARD && !cardId) {
      alert("Por favor, selecione um cartão de crédito. É obrigatório.");
      return;
    }

    onSubmit({
      type,
      description,
      amount: parseFloat(amount),
      date, // This will be used as purchaseDate in the logic if creating new
      status,
      categoryId: categoryId || undefined,
      paymentMethod: type === TransactionType.INCOME ? PaymentMethod.CASH_DEBIT : paymentMethod,
      cardId: (type === TransactionType.EXPENSE && paymentMethod === PaymentMethod.CREDIT_CARD) ? cardId : undefined,
      accountId: (type === TransactionType.INCOME || paymentMethod === PaymentMethod.CASH_DEBIT) ? accountId : undefined,
      installmentCount: (!initialData && paymentMethod === PaymentMethod.CREDIT_CARD) ? installments : 1,
      isTotalValue,
      targetInvoiceDate: (type === TransactionType.EXPENSE && paymentMethod === PaymentMethod.CREDIT_CARD) ? targetInvoiceDate : undefined
    });
  };

  // Filter categories based on type
  const availableCategories = categories.filter((c: Category) => c.type === type);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-slate-900">
      {/* Type Toggle (Disable if editing) */}
      <div className="flex p-1 bg-slate-100 rounded-xl">
        <button
          type="button"
          disabled={!!initialData?.id}
          onClick={() => setType(TransactionType.EXPENSE)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${type === TransactionType.EXPENSE ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 disabled:opacity-50'}`}
        >
          Saída
        </button>
        <button
          type="button"
          disabled={!!initialData?.id}
          onClick={() => setType(TransactionType.INCOME)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${type === TransactionType.INCOME ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 disabled:opacity-50'}`}
        >
          Entrada
        </button>
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Descrição</label>
        <input 
          required
          type="text" 
          value={description} 
          onChange={e => setDescription(e.target.value)} 
          placeholder="Ex: Supermercado"
          className="w-full p-3 bg-slate-50 text-slate-900 rounded-xl border-none focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>

      {/* Category Selector */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Categoria</label>
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
           {availableCategories.map((c: Category) => (
             <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
              className={`whitespace-nowrap px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${categoryId === c.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-600 border-slate-200'}`}
             >
               {c.name}
             </button>
           ))}
           <button type="button" className="whitespace-nowrap px-3 py-2 rounded-lg text-xs font-medium border border-dashed border-slate-300 text-slate-400" onClick={() => alert('Vá em configurações para adicionar categorias.')}>+ Criar</button>
        </div>
      </div>

      {/* Amount & Date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Valor (R$)</label>
          <input 
            required
            type="number" 
            step="0.01"
            value={amount} 
            onChange={e => setAmount(e.target.value)} 
            placeholder="0.00"
            className="w-full p-3 bg-slate-50 text-slate-900 rounded-xl border-none focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Data da Compra</label>
          <input 
            type="date" 
            value={date} 
            onChange={e => setDate(e.target.value)} 
            className="w-full p-3 bg-slate-50 text-slate-900 rounded-xl border-none focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      {/* Status Toggle */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
        <div className="flex gap-2">
           <button
             type="button"
             onClick={() => setStatus(TransactionStatus.COMPLETED)}
             className={`flex-1 py-2 rounded-lg text-sm border transition-all flex items-center justify-center gap-2 ${status === TransactionStatus.COMPLETED ? 'bg-green-50 border-green-200 text-green-700 font-bold' : 'border-slate-200 text-slate-500'}`}
           >
             <CheckCircle size={16} /> Feita
           </button>
           <button
             type="button"
             onClick={() => setStatus(TransactionStatus.PENDING)}
             className={`flex-1 py-2 rounded-lg text-sm border transition-all flex items-center justify-center gap-2 ${status === TransactionStatus.PENDING ? 'bg-orange-50 border-orange-200 text-orange-700 font-bold' : 'border-slate-200 text-slate-500'}`}
           >
             <ClockIcon size={16} /> Prevista
           </button>
        </div>
      </div>

      {/* Payment Method (Only for Expense) */}
      {type === TransactionType.EXPENSE && (
        <div className="animate-fade-in">
          <label className="block text-xs font-medium text-slate-500 mb-1">Forma de Pagamento</label>
          <div className="flex gap-2 mb-3">
            <button 
              type="button"
              disabled={!!initialData?.id}
              onClick={() => setPaymentMethod(PaymentMethod.CASH_DEBIT)}
              className={`flex-1 py-2 rounded-xl border flex items-center justify-center gap-2 ${paymentMethod === PaymentMethod.CASH_DEBIT ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
            >
              <Landmark size={16} /> Débito/Dinheiro
            </button>
            <button 
              type="button"
              disabled={!!initialData?.id}
              onClick={() => setPaymentMethod(PaymentMethod.CREDIT_CARD)}
              className={`flex-1 py-2 rounded-xl border flex items-center justify-center gap-2 ${paymentMethod === PaymentMethod.CREDIT_CARD ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-600'}`}
            >
              <IconCreditCard size={16} /> Crédito
            </button>
          </div>

          {paymentMethod === PaymentMethod.CREDIT_CARD ? (
            <div className="bg-purple-50 p-3 rounded-xl space-y-3 border border-purple-100">
              {cards.length === 0 ? (
                <p className="text-xs text-red-500 font-bold">⚠ Nenhum cartão cadastrado. Cadastre em configurações.</p>
              ) : (
                <>
                  <label className="block text-[10px] uppercase text-purple-700 font-bold mb-1">Cartão *</label>
                  <select 
                    value={cardId} 
                    disabled={!!initialData?.id}
                    onChange={e => setCardId(e.target.value)}
                    className="w-full p-2 bg-white text-slate-900 rounded-lg border-none outline-none text-sm disabled:opacity-50"
                    required
                  >
                    <option value="" disabled>Selecione o cartão</option>
                    {cards.map((c: CreditCard) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>

                  {(!initialData || !initialData.id) && invoiceOptions.length > 0 && (
                     <div>
                       <label className="block text-[10px] uppercase text-purple-700 font-bold mb-1">Fatura de Referência</label>
                       <select 
                         value={targetInvoiceDate} 
                         onChange={e => setTargetInvoiceDate(e.target.value)}
                         className="w-full p-2 bg-white text-slate-900 rounded-lg border-none outline-none text-sm"
                       >
                         {invoiceOptions.map((opt: Date) => (
                           <option key={opt.toISOString()} value={opt.toISOString()}>
                             {format(opt, 'MMMM yyyy', { locale: ptBR })}
                           </option>
                         ))}
                       </select>
                     </div>
                  )}
                  
                  {(!initialData || !initialData.id) && (
                    <div className="flex gap-3">
                       <div className="flex-1">
                         <label className="block text-[10px] uppercase text-purple-700 font-bold mb-1">Parcelas</label>
                         <select 
                          value={installments} 
                          onChange={e => setInstallments(Number(e.target.value))}
                          className="w-full p-2 bg-white text-slate-900 rounded-lg text-sm"
                         >
                           {[...Array(24)].map((_, i) => <option key={i} value={i+1}>{i+1}x</option>)}
                         </select>
                       </div>
                       {installments > 1 && (
                         <div className="flex-1">
                           <label className="block text-[10px] uppercase text-purple-700 font-bold mb-1">O valor é:</label>
                           <div className="flex bg-white rounded-lg p-0.5">
                             <button 
                              type="button" 
                              onClick={() => setIsTotalValue(true)} 
                              className={`flex-1 text-[10px] rounded py-1 ${isTotalValue ? 'bg-purple-200 font-bold text-purple-900' : 'text-slate-500'}`}
                             >Total</button>
                             <button 
                              type="button" 
                              onClick={() => setIsTotalValue(false)} 
                              className={`flex-1 text-[10px] rounded py-1 ${!isTotalValue ? 'bg-purple-200 font-bold text-purple-900' : 'text-slate-500'}`}
                             >Parcela</button>
                           </div>
                         </div>
                       )}
                    </div>
                  )}
                  {initialData?.installments && (
                    <div className="text-xs text-purple-600 font-medium">
                      Parcela {initialData.installments.current} de {initialData.installments.total}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="animate-fade-in">
               <select 
                value={accountId} 
                disabled={!!initialData?.id}
                onChange={e => setAccountId(e.target.value)}
                className="w-full p-3 bg-slate-50 text-slate-900 rounded-xl border-none outline-none text-sm disabled:opacity-50"
              >
                {accounts.length === 0 && <option value="">Nenhum banco cadastrado</option>}
                {accounts.map((a: BankAccount) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-transform">
        {initialData?.id ? 'Atualizar' : 'Salvar'}
      </button>
    </form>
  );
}

function SettingsForm({ data, setData }: { data: AppData, setData: React.Dispatch<React.SetStateAction<AppData>> }) {
  const [view, setView] = useState<'menu' | 'addCard' | 'addBank' | 'addCategory'>('menu');
  
  // Add Card State
  const [cardName, setCardName] = useState('');
  const [cardLimit, setCardLimit] = useState('');
  const [closingDay, setClosingDay] = useState('1');
  const [dueDay, setDueDay] = useState('10');
  const [last4, setLast4] = useState('');

  // Add Bank State
  const [bankName, setBankName] = useState('');
  const [bankBalance, setBankBalance] = useState('');

  // Add Category State
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState<TransactionType>(TransactionType.EXPENSE);

  const addCard = () => {
    const newCard: CreditCard = {
      id: uuidv4(),
      name: cardName,
      limit: parseFloat(cardLimit) || 0,
      closingDay: parseInt(closingDay),
      dueDay: parseInt(dueDay),
      last4Digits: last4
    };
    setData(prev => ({ ...prev, cards: [...prev.cards, newCard] }));
    setView('menu');
    setCardName('');
    setLast4('');
  };

  const addBank = () => {
    const newBank: BankAccount = {
      id: uuidv4(),
      name: bankName,
      initialBalance: parseFloat(bankBalance) || 0,
      currentBalance: parseFloat(bankBalance) || 0
    };
    setData(prev => ({ ...prev, accounts: [...prev.accounts, newBank] }));
    setView('menu');
    setBankName('');
  };

  const addCategory = () => {
    if (!catName) return;
    const newCat: Category = {
      id: uuidv4(),
      name: catName,
      type: catType
    };
    setData(prev => ({ ...prev, categories: [...prev.categories, newCat] }));
    setView('menu');
    setCatName('');
  };

  const deleteCard = (id: string) => {
    setData(prev => ({ ...prev, cards: prev.cards.filter(c => c.id !== id) }));
  };

  const deleteBank = (id: string) => {
    setData(prev => ({ ...prev, accounts: prev.accounts.filter(a => a.id !== id) }));
  };

  const deleteCategory = (id: string) => {
    setData(prev => ({ ...prev, categories: prev.categories.filter(c => c.id !== id) }));
  };

  if (view === 'menu') {
    return (
      <div className="space-y-6 text-slate-900">
        {/* Cards Section */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-bold text-slate-700">Cartões de Crédito</h4>
            <button onClick={() => setView('addCard')} className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded hover:bg-blue-200">+ Adicionar</button>
          </div>
          <div className="space-y-2">
            {data.cards.length === 0 && <p className="text-xs text-slate-400">Nenhum cartão.</p>}
            {data.cards.map(c => (
              <div key={c.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div>
                  <p className="font-medium text-sm text-slate-900">{c.name}</p>
                  <p className="text-[10px] text-slate-500">Fec: dia {c.closingDay} • Venc: dia {c.dueDay} {c.last4Digits ? `• Final ${c.last4Digits}` : ''}</p>
                </div>
                <button onClick={() => deleteCard(c.id)} className="text-red-400"><Trash2 size={14}/></button>
              </div>
            ))}
          </div>
        </div>

        {/* Banks Section */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-bold text-slate-700">Bancos / Contas</h4>
            <button onClick={() => setView('addBank')} className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded hover:bg-blue-200">+ Adicionar</button>
          </div>
          <div className="space-y-2">
            {data.accounts.length === 0 && <p className="text-xs text-slate-400">Nenhuma conta.</p>}
            {data.accounts.map(a => (
              <div key={a.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div>
                  <p className="font-medium text-sm text-slate-900">{a.name}</p>
                  <p className="text-[10px] text-slate-500">Saldo Inicial: R$ {a.initialBalance}</p>
                </div>
                <button onClick={() => deleteBank(a.id)} className="text-red-400"><Trash2 size={14}/></button>
              </div>
            ))}
          </div>
        </div>

        {/* Categories Section */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-bold text-slate-700">Categorias</h4>
            <button onClick={() => setView('addCategory')} className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded hover:bg-blue-200">+ Adicionar</button>
          </div>
          <div className="space-y-2">
            {data.categories.length === 0 && <p className="text-xs text-slate-400">Nenhuma categoria.</p>}
            {data.categories.map(c => (
              <div key={c.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${c.type === TransactionType.INCOME ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                  <p className="font-medium text-sm text-slate-900">{c.name}</p>
                </div>
                <button onClick={() => deleteCategory(c.id)} className="text-red-400"><Trash2 size={14}/></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'addCard') {
    return (
      <div className="space-y-4 text-slate-900">
        <button onClick={() => setView('menu')} className="text-xs text-slate-500 mb-2">← Voltar</button>
        <h4 className="font-bold text-lg">Novo Cartão</h4>
        <input className="w-full p-3 bg-slate-50 text-slate-900 rounded-lg border" placeholder="Nome (ex: Nubank)" value={cardName} onChange={e => setCardName(e.target.value)} />
        <input className="w-full p-3 bg-slate-50 text-slate-900 rounded-lg border" type="number" placeholder="Limite" value={cardLimit} onChange={e => setCardLimit(e.target.value)} />
        <input className="w-full p-3 bg-slate-50 text-slate-900 rounded-lg border" type="text" placeholder="Últimos 4 dígitos (Opcional - para IA)" value={last4} maxLength={4} onChange={e => setLast4(e.target.value)} />
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-slate-500">Dia Fechamento</label>
            <input className="w-full p-3 bg-slate-50 text-slate-900 rounded-lg border" type="number" min="1" max="31" value={closingDay} onChange={e => setClosingDay(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500">Dia Vencimento</label>
            <input className="w-full p-3 bg-slate-50 text-slate-900 rounded-lg border" type="number" min="1" max="31" value={dueDay} onChange={e => setDueDay(e.target.value)} />
          </div>
        </div>
        <button onClick={addCard} className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold">Salvar Cartão</button>
      </div>
    );
  }

  if (view === 'addBank') {
    return (
      <div className="space-y-4 text-slate-900">
        <button onClick={() => setView('menu')} className="text-xs text-slate-500 mb-2">← Voltar</button>
        <h4 className="font-bold text-lg">Nova Conta</h4>
        <input className="w-full p-3 bg-slate-50 text-slate-900 rounded-lg border" placeholder="Nome (ex: Itaú)" value={bankName} onChange={e => setBankName(e.target.value)} />
        <input className="w-full p-3 bg-slate-50 text-slate-900 rounded-lg border" type="number" placeholder="Saldo Atual" value={bankBalance} onChange={e => setBankBalance(e.target.value)} />
        <button onClick={addBank} className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold">Salvar Conta</button>
      </div>
    );
  }

  if (view === 'addCategory') {
    return (
      <div className="space-y-4 text-slate-900">
        <button onClick={() => setView('menu')} className="text-xs text-slate-500 mb-2">← Voltar</button>
        <h4 className="font-bold text-lg">Nova Categoria</h4>
        <input className="w-full p-3 bg-slate-50 text-slate-900 rounded-lg border" placeholder="Nome (ex: Mercado)" value={catName} onChange={e => setCatName(e.target.value)} />
        <div className="flex gap-2">
          <button 
            onClick={() => setCatType(TransactionType.EXPENSE)}
            className={`flex-1 p-3 rounded-lg border font-bold ${catType === TransactionType.EXPENSE ? 'bg-red-50 border-red-500 text-red-600' : 'text-slate-400'}`}
          >Saída</button>
           <button 
            onClick={() => setCatType(TransactionType.INCOME)}
            className={`flex-1 p-3 rounded-lg border font-bold ${catType === TransactionType.INCOME ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'text-slate-400'}`}
          >Entrada</button>
        </div>
        <button onClick={addCategory} className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold">Salvar Categoria</button>
      </div>
    );
  }

  return null;
}

// Helper Icon
const ClockIcon = ({ size }: { size: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);