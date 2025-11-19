
export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE'
}

export enum PaymentMethod {
  CASH_DEBIT = 'CASH_DEBIT',
  CREDIT_CARD = 'CREDIT_CARD'
}

export enum User {
  STEFFANY = 'Steffany',
  JEAN = 'Jean'
}

export enum TransactionStatus {
  PENDING = 'PENDING',     // Prevista
  COMPLETED = 'COMPLETED'  // Feita/Paga
}

export interface CreditCard {
  id: string;
  name: string;
  limit: number;
  closingDay: number;
  dueDay: number;
  last4Digits?: string; // Para identificação via OCR/IA
}

export interface BankAccount {
  id: string;
  name: string;
  initialBalance: number;
  currentBalance: number; 
}

export interface Category {
  id: string;
  name: string;
  color?: string;
  type: TransactionType; // Para facilitar filtrar categorias de gasto vs ganho
}

export interface Transaction {
  id: string;
  description: string;
  amount: number; // Absolute value
  type: TransactionType;
  status: TransactionStatus;
  date: string; // ISO Date string (Accounting Date / Invoice Date)
  purchaseDate?: string; // ISO Date string (Real date of purchase)
  user: User;
  paymentMethod: PaymentMethod;
  categoryId?: string;
  accountId?: string; // If Cash/Debit
  cardId?: string; // If Credit Card
  installments?: {
    current: number;
    total: number;
    originalTransactionId?: string; // Links split installments
  };
}

export interface MonthlySummary {
  income: number;
  expense: number;
  balance: number;
  projectedBalance: number;
}