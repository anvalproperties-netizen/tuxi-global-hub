/**
 * TUXI Production Authenticated API Client
 * Connects React UI to Authoritative Backend API (/api/*)
 */

const TOKEN_KEY = 'tuxi_auth_token';

export class ApiClient {
  public static getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  public static setToken(token: string | null): void {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  public static clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  }

  public static async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(endpoint, {
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && token) {
        // Token expired or invalid
        this.clearToken();
      }
      throw new Error(data.message || data.error || `Request failed with status ${response.status}`);
    }

    return data as T;
  }

  // ==========================================
  // AUTHENTICATION
  // ==========================================
  public static async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
  }) {
    const res = await this.request<{ user: any; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  }

  public static async login(credentials: { email: string; password: string }) {
    const res = await this.request<{ user: any; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
    if (res.token) {
      this.setToken(res.token);
    }
    return res;
  }

  public static async logout() {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } finally {
      this.clearToken();
    }
  }

  public static async getMe() {
    return this.request<{ user: any }>('/api/auth/me');
  }

  // ==========================================
  // CUSTOMER PROFILE & ADDRESSES
  // ==========================================
  public static async getProfile() {
    return this.request('/api/customer/profile');
  }

  public static async updateProfile(updates: any) {
    return this.request('/api/customer/profile', {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  }

  public static async getAddresses() {
    return this.request<any[]>('/api/customer/addresses');
  }

  public static async createAddress(addressData: any) {
    return this.request('/api/customer/addresses', {
      method: 'POST',
      body: JSON.stringify(addressData)
    });
  }

  public static async deleteAddress(id: string) {
    return this.request(`/api/customer/addresses/${id}`, {
      method: 'DELETE'
    });
  }

  public static async setDefaultAddress(id: string) {
    return this.request(`/api/customer/addresses/${id}/set-default`, {
      method: 'POST'
    });
  }

  // ==========================================
  // EATS DISCOVERY & MENUS
  // ==========================================
  public static async getEatsBusinesses() {
    return this.request<any[]>('/api/eats/businesses');
  }

  public static async getEatsBusinessDetail(id: string) {
    return this.request(`/api/eats/businesses/${id}`);
  }

  public static async getEatsMenu(businessId: string) {
    return this.request<{ businessId: string; businessName: string; categories: any[] }>(`/api/eats/businesses/${businessId}/menu`);
  }

  // ==========================================
  // SHOP DISCOVERY & PRODUCTS (PHASE 2B)
  // ==========================================
  public static async getShopBusinesses() {
    return this.request<any[]>('/api/shop/businesses');
  }

  public static async getShopBusinessDetail(id: string) {
    return this.request(`/api/shop/businesses/${id}`);
  }

  public static async getShopProducts(businessId: string) {
    return this.request<{ businessId: string; products: any[] }>(`/api/shop/businesses/${businessId}/products`);
  }

  public static async getShopProductDetail(productId: string) {
    return this.request(`/api/shop/products/${productId}`);
  }

  public static async searchShop(query: string) {
    return this.request<{ shops: any[]; products: any[] }>(`/api/shop/search?q=${encodeURIComponent(query)}`);
  }

  // ==========================================
  // BASKET REPRICING & REAL ORDERS
  // ==========================================
  public static async repriceBasket(payload: {
    businessId: string;
    items: { itemId: string; quantity: number; selectedModifierIds?: string[] }[];
    tipCents?: number;
  }) {
    return this.request('/api/orders/reprice', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  public static async createOrder(orderPayload: {
    businessId: string;
    deliveryAddressId?: string;
    deliveryAddress?: any;
    items: { itemId: string; quantity: number; selectedModifierIds?: string[] }[];
    tipCents?: number;
    specialInstructions?: string;
    idempotencyKey?: string;
    isTestPayment?: boolean;
  }) {
    return this.request('/api/orders', {
      method: 'POST',
      body: JSON.stringify(orderPayload)
    });
  }

  public static async getOrders() {
    return this.request<any[]>('/api/orders');
  }

  public static async getOrderById(id: string) {
    return this.request(`/api/orders/${id}`);
  }

  public static async cancelOrder(id: string, reason?: string) {
    return this.request(`/api/orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  // ==========================================
  // PHASE 2C: COURIER & DRIVER CLIENT METHODS
  // ==========================================
  public static async createCourierQuote(payload: {
    pickup: { latitude: number; longitude: number; streetLine1?: string; city?: string; postalCode?: string; countryCode?: string };
    dropoff: { latitude: number; longitude: number; streetLine1?: string; city?: string; postalCode?: string; countryCode?: string };
    packageCategory?: string;
    packageDescription?: string;
  }) {
    return this.request('/api/courier/quote', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  public static async bookCourierRequest(payload: {
    quoteId: string;
    packageDescription: string;
    packageCategory?: string;
    recipientName: string;
    recipientPhone: string;
    deliveryInstructions?: string;
    idempotencyKey?: string;
    testPaymentMode?: boolean;
  }) {
    return this.request('/api/courier/request', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  public static async getCourierDelivery(id: string) {
    return this.request(`/api/courier/deliveries/${id}`);
  }

  public static async getDeliveryDriverLocation(id: string) {
    return this.request(`/api/deliveries/${id}/driver-location`);
  }

  public static async getDeliveryEvents(id: string) {
    return this.request<{ events: any[] }>(`/api/deliveries/${id}/events`);
  }

  public static async cancelDelivery(id: string, reason?: string) {
    return this.request(`/api/deliveries/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  public static async getDriverProfile() {
    return this.request('/api/driver/profile');
  }

  public static async updateDriverAvailability(isOnline: boolean) {
    return this.request('/api/driver/availability', {
      method: 'POST',
      body: JSON.stringify({ isOnline })
    });
  }

  public static async updateDriverLocation(latitude: number, longitude: number, accuracyMeters?: number) {
    return this.request('/api/driver/location', {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude, accuracyMeters })
    });
  }

  public static async getAvailableDeliveries() {
    return this.request<{ deliveries: any[] }>('/api/driver/available-deliveries');
  }

  public static async acceptDelivery(deliveryId: string) {
    return this.request(`/api/driver/deliveries/${deliveryId}/accept`, {
      method: 'POST'
    });
  }

  public static async declineDelivery(deliveryId: string, reason?: string) {
    return this.request(`/api/driver/deliveries/${deliveryId}/decline`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  public static async progressDelivery(deliveryId: string, targetStatus: string) {
    return this.request(`/api/driver/deliveries/${deliveryId}/progress`, {
      method: 'POST',
      body: JSON.stringify({ targetStatus })
    });
  }

  public static async confirmPickup(deliveryId: string, pickupCode: string) {
    return this.request(`/api/driver/deliveries/${deliveryId}/confirm-pickup`, {
      method: 'POST',
      body: JSON.stringify({ pickupCode })
    });
  }

  public static async confirmDelivery(deliveryId: string, deliveryOtp: string) {
    return this.request(`/api/driver/deliveries/${deliveryId}/confirm-delivery`, {
      method: 'POST',
      body: JSON.stringify({ deliveryOtp })
    });
  }

  public static async unassignDelivery(deliveryId: string, reason?: string) {
    return this.request(`/api/driver/deliveries/${deliveryId}/unassign`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  public static async getDriverEarnings() {
    return this.request<{ totalEarnedCents: number; earningsLedger: any[] }>('/api/driver/earnings');
  }
}
