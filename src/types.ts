export type Unit = 'Metro' | 'Unidade' | 'Gramas' | 'Litros';

export interface PricingItem {
  id: string;
  name: string;
  unit: Unit;
  costPrice: number;
  quantityUsed: number;
  isLinked?: boolean;
}

export interface ProductPricing {
  id: string;
  productName: string;
  items: PricingItem[];
  profitMargin: number;
  createdAt: number;
  uid: string;
}

export type QuoteStatus = 'Aguardando' | 'Pagos' | 'Em produção' | 'Finalizado';

export interface Quote {
  id: string;
  clientName: string;
  clientPhone: string;
  products: ProductPricing[];
  createdAt: number;
  status: QuoteStatus;
  uid: string;
}

export interface User {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  lastLogin: number;
  role: 'admin' | 'client';
}
