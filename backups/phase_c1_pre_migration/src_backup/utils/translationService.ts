export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  defaultCountryCode?: string;
  rtl?: boolean;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', defaultCountryCode: 'GB' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', defaultCountryCode: 'ES' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', defaultCountryCode: 'FR' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', defaultCountryCode: 'DE' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', defaultCountryCode: 'IT' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷', defaultCountryCode: 'BR' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇦🇪', defaultCountryCode: 'AE', rtl: true },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', flag: '🇿🇦', defaultCountryCode: 'ZA' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', defaultCountryCode: 'JP' },
  { code: 'zu', name: 'isiZulu', nativeName: 'isiZulu', flag: '🇿🇦', defaultCountryCode: 'ZA' },
];

/**
 * Maps country code (ISO-2) to default native language
 */
export const COUNTRY_TO_LANGUAGE_MAP: Record<string, string> = {
  GB: 'en',
  US: 'en',
  CA: 'en',
  AU: 'en',
  NZ: 'en',
  IE: 'en',
  FR: 'fr',
  BE: 'fr',
  ES: 'es',
  MX: 'es',
  AR: 'es',
  CO: 'es',
  CL: 'es',
  DE: 'de',
  AT: 'de',
  CH: 'de',
  IT: 'it',
  BR: 'pt',
  PT: 'pt',
  AE: 'ar',
  SA: 'ar',
  EG: 'ar',
  QA: 'ar',
  ZA: 'en', // South Africa default, with af / zu available
  JP: 'ja',
};

/**
 * Get country language recommendation
 */
export function getLanguageForCountry(countryCode: string): string {
  const code = countryCode.toUpperCase();
  return COUNTRY_TO_LANGUAGE_MAP[code] || 'en';
}

/**
 * Detect language of a given text snippet using keyword heuristic
 * Fallback to 'en'
 */
export function detectTextLanguage(text: string): string {
  const lower = text.toLowerCase();

  // Spanish detection
  if (
    lower.includes('donde') || lower.includes('dónde') || lower.includes('pedido') || 
    lower.includes('comida') || lower.includes('gracias') || lower.includes('hola') ||
    lower.includes('puerta') || lower.includes('timbre') || lower.includes('cambiar') ||
    lower.includes('entrega') || lower.includes('instrucciones') || lower.includes('por favor')
  ) {
    return 'es';
  }

  // French detection
  if (
    lower.includes('bonjour') || lower.includes('salut') || lower.includes('commande') || 
    lower.includes('livraison') || lower.includes('merci') || lower.includes('où est') ||
    lower.includes('porte') || lower.includes('sonner') || lower.includes('instructions') ||
    lower.includes('s\'il vous plaît') || lower.includes('changer')
  ) {
    return 'fr';
  }

  // German detection
  if (
    lower.includes('hallo') || lower.includes('guten') || lower.includes('bestellung') || 
    lower.includes('lieferung') || lower.includes('wo ist') || lower.includes('danke') ||
    lower.includes('tür') || lower.includes('klingel') || lower.includes('bitte') ||
    lower.includes('ändern') || lower.includes('anweisungen')
  ) {
    return 'de';
  }

  // Italian detection
  if (
    lower.includes('ciao') || lower.includes('ordine') || lower.includes('consegna') || 
    lower.includes('grazie') || lower.includes('dov\'è') || lower.includes('porta') ||
    lower.includes('campanello') || lower.includes('istruzioni') || lower.includes('per favore')
  ) {
    return 'it';
  }

  // Portuguese detection
  if (
    lower.includes('olá') || lower.includes('obrigado') || lower.includes('pedido') || 
    lower.includes('onde está') || lower.includes('entrega') || lower.includes('porta') ||
    lower.includes('campainha') || lower.includes('instruções') || lower.includes('por favor')
  ) {
    return 'pt';
  }

  // Arabic detection
  if (/[\u0600-\u06FF]/.test(text)) {
    return 'ar';
  }

  // Japanese detection
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text)) {
    return 'ja';
  }

  // Afrikaans detection
  if (
    lower.includes('baie dankie') || lower.includes('waar is') || lower.includes('bestelling') || 
    lower.includes('aflewering') || lower.includes('asseblief') || lower.includes('deur')
  ) {
    return 'af';
  }

  return 'en';
}

/**
 * Universal App UI Translation Dictionary
 */
export const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    'eats': 'Eats',
    'shop': 'Shop',
    'courier': 'Courier',
    'track_orders': 'Track Orders',
    'payments': 'Payments',
    'cart': 'Basket',
    'checkout': 'Checkout',
    'search_placeholder': 'Search dishes, groceries, or essentials...',
    'placed': 'Placed',
    'preparing': 'Preparing',
    'driver_assigned': 'Courier Dispatched',
    'in_transit': 'In Transit',
    'delivered': 'Delivered',
    'eta': 'Estimated Arrival',
    'loyalty_points': 'Loyalty Points',
    'gold_member': 'Gold Member',
    'cashless_policy': '100% Cashless Platform',
    'ai_assistant': 'AI Order Assistant',
    'live_ar': '3D AR Preview',
    'add_to_cart': 'Add to Basket',
    'switch_language': 'Language Changed'
  },
  es: {
    'eats': 'Comida',
    'shop': 'Tienda',
    'courier': 'Mensajería',
    'track_orders': 'Seguimiento',
    'payments': 'Pagos',
    'cart': 'Cesta',
    'checkout': 'Pagar Pedido',
    'search_placeholder': 'Buscar platos, comestibles o artículos...',
    'placed': 'Realizado',
    'preparing': 'En Cocina',
    'driver_assigned': 'Repartidor Asignado',
    'in_transit': 'En Camino',
    'delivered': 'Entregado',
    'eta': 'Llegada Estimada',
    'loyalty_points': 'Puntos de Lealtad',
    'gold_member': 'Miembro Oro',
    'cashless_policy': 'Plataforma 100% Sin Efectivo',
    'ai_assistant': 'Asistente IA de Pedidos',
    'live_ar': 'Vista 3D AR',
    'add_to_cart': 'Añadir a la Cesta',
    'switch_language': 'Idioma Cambiado'
  },
  fr: {
    'eats': 'Restaurants',
    'shop': 'Boutiques',
    'courier': 'Coursier',
    'track_orders': 'Suivi Commandes',
    'payments': 'Paiements',
    'cart': 'Panier',
    'checkout': 'Commander',
    'search_placeholder': 'Rechercher des plats, courses, essentiels...',
    'placed': 'Confirmée',
    'preparing': 'En Préparation',
    'driver_assigned': 'Livreur Attribué',
    'in_transit': 'En Livraison',
    'delivered': 'Livrée',
    'eta': 'Arrivée Estimée',
    'loyalty_points': 'Points Fidélité',
    'gold_member': 'Membre Or',
    'cashless_policy': 'Paiement 100% Dématérialisé',
    'ai_assistant': 'Assistant IA Commande',
    'live_ar': 'Aperçu 3D AR',
    'add_to_cart': 'Ajouter au Panier',
    'switch_language': 'Langue Modifiée'
  },
  de: {
    'eats': 'Essen',
    'shop': 'Einkaufen',
    'courier': 'Kurier',
    'track_orders': 'Bestellungen verfolgen',
    'payments': 'Zahlungen',
    'cart': 'Warenkorb',
    'checkout': 'Zur Kasse',
    'search_placeholder': 'Gerichte, Lebensmittel oder Artikel suchen...',
    'placed': 'Aufgegeben',
    'preparing': 'Wird zubereitet',
    'driver_assigned': 'Kurier unterwegs',
    'in_transit': 'In Zustellung',
    'delivered': 'Zugestellt',
    'eta': 'Voraussichtliche Ankunft',
    'loyalty_points': 'Treuepunkte',
    'gold_member': 'Gold-Mitglied',
    'cashless_policy': '100% bargeldlos',
    'ai_assistant': 'KI-Bestellassistent',
    'live_ar': '3D-AR-Vorschau',
    'add_to_cart': 'In den Warenkorb',
    'switch_language': 'Sprache geändert'
  },
  it: {
    'eats': 'Ristoranti',
    'shop': 'Spesa',
    'courier': 'Corriere',
    'track_orders': 'Traccia Ordini',
    'payments': 'Pagamenti',
    'cart': 'Carrello',
    'checkout': 'Ordina Ora',
    'search_placeholder': 'Cerca piatti, spesa o articoli...',
    'placed': 'Effettuato',
    'preparing': 'In Preparazione',
    'driver_assigned': 'Corriere Assegnato',
    'in_transit': 'In Consegna',
    'delivered': 'Consegnato',
    'eta': 'Arrivo Previsto',
    'loyalty_points': 'Punti Fedeltà',
    'gold_member': 'Membro Oro',
    'cashless_policy': '100% Senza Contanti',
    'ai_assistant': 'Assistente Ordini IA',
    'live_ar': 'Anteprima 3D AR',
    'add_to_cart': 'Aggiungi al Carrello',
    'switch_language': 'Lingua Cambiata'
  },
  pt: {
    'eats': 'Restaurantes',
    'shop': 'Mercado',
    'courier': 'Entregas',
    'track_orders': 'Acompanhar Pedidos',
    'payments': 'Pagamentos',
    'cart': 'Cesta',
    'checkout': 'Finalizar Pedido',
    'search_placeholder': 'Buscar pratos, compras ou produtos...',
    'placed': 'Confirmado',
    'preparing': 'Em Preparo',
    'driver_assigned': 'Entregador a Caminho',
    'in_transit': 'Em Trânsito',
    'delivered': 'Entregue',
    'eta': 'Previsão de Entrega',
    'loyalty_points': 'Pontos Fidelidade',
    'gold_member': 'Membro Ouro',
    'cashless_policy': 'Plataforma 100% Sem Dinheiro Físico',
    'ai_assistant': 'Assistente IA de Pedidos',
    'live_ar': 'Visualização 3D AR',
    'add_to_cart': 'Adicionar à Cesta',
    'switch_language': 'Idioma Alterado'
  },
  ar: {
    'eats': 'مطاعم',
    'shop': 'تسوق',
    'courier': 'توصيل سريع',
    'track_orders': 'تتبع الطلبات',
    'payments': 'الدفع',
    'cart': 'السلة',
    'checkout': 'إتمام الطلب',
    'search_placeholder': 'ابحث عن أطباق، بقالة، أو مستلزمات...',
    'placed': 'تم الطلب',
    'preparing': 'قيد التجهيز',
    'driver_assigned': 'تم تعيين السائق',
    'in_transit': 'في الطريق إليك',
    'delivered': 'تم التسليم',
    'eta': 'الوقت المتوقع للوصول',
    'loyalty_points': 'نقاط المكافآت',
    'gold_member': 'عضوية ذهبية',
    'cashless_policy': 'منصة دفع إلكتروني 100%',
    'ai_assistant': 'مساعد الطلبات الذكي',
    'live_ar': 'معاينة ثلاثية الأبعاد AR',
    'add_to_cart': 'أضف إلى السلة',
    'switch_language': 'تم تغيير اللغة'
  },
  af: {
    'eats': 'Kos & Restaurante',
    'shop': 'Winkel',
    'courier': 'Koerier',
    'track_orders': 'Volg Bestelling',
    'payments': 'Betalings',
    'cart': 'Mandjie',
    'checkout': 'Betaal Nou',
    'search_placeholder': 'Soek geregte, kruideniersware of noodsaaklikhede...',
    'placed': 'Geplaatst',
    'preparing': 'Word Voorberei',
    'driver_assigned': 'Koerier Toegewys',
    'in_transit': 'Op Pad',
    'delivered': 'Afgelewer',
    'eta': 'Geskatte Aankomstyd',
    'loyalty_points': 'Lojaliteitspunte',
    'gold_member': 'Goue Lid',
    'cashless_policy': '100% Kontantlose Platform',
    'ai_assistant': 'KI-Bestellingsassistent',
    'live_ar': '3D AR Voorskou',
    'add_to_cart': 'Voeg by Mandjie',
    'switch_language': 'Taal Verander'
  },
  ja: {
    'eats': 'レストラン',
    'shop': 'ショップ',
    'courier': '宅配便',
    'track_orders': '注文追跡',
    'payments': 'お支払い',
    'cart': 'カート',
    'checkout': 'レジへ進む',
    'search_placeholder': '料理や食料品を検索...',
    'placed': '注文完了',
    'preparing': '調理中',
    'driver_assigned': '配達員決定',
    'in_transit': '配達中',
    'delivered': '配達完了',
    'eta': '到着予定時刻',
    'loyalty_points': 'ロイヤルティポイント',
    'gold_member': 'ゴールド会員',
    'cashless_policy': '完全キャッシュレス',
    'ai_assistant': 'AI注文アシスタント',
    'live_ar': '3D ARプレビュー',
    'add_to_cart': 'カートに追加',
    'switch_language': '言語を変更しました'
  },
  zu: {
    'eats': 'Ukudla',
    'shop': 'Isitolo',
    'courier': 'Isithunywa',
    'track_orders': 'Landelela i-Oda',
    'payments': 'Izinkokhelo',
    'cart': 'Inqola',
    'checkout': 'Khokha Manje',
    'search_placeholder': 'Sesha ukudla noma izimpahla...',
    'placed': 'Ifakiwe',
    'preparing': 'Iyalungiswa',
    'driver_assigned': 'Isithunywa Sithunyelwe',
    'in_transit': 'Isendleleni',
    'delivered': 'Ilethiwe',
    'eta': 'Isikhathi Esilindelekile',
    'loyalty_points': 'Amaphuzu Omvuzo',
    'gold_member': 'Ilungu Legolide',
    'cashless_policy': 'Inkundla Engenamali Ephathekayo',
    'ai_assistant': 'Umsizi We-AI We-Oda',
    'live_ar': 'Ukubuka Kwe-3D AR',
    'add_to_cart': 'Faka Enqoleni',
    'switch_language': 'Ulimi Lushintshiwe'
  }
};

/**
 * Universal translator function
 */
export function translateKey(key: string, lang: string = 'en', fallback?: string): string {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS['en'];
  return dict[key] || TRANSLATIONS['en'][key] || fallback || key;
}
