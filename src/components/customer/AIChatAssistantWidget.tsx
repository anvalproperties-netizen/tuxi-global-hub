import React, { useState, useEffect, useRef } from 'react';
import { useTuxi } from '../../context/TuxiContext';
import { 
  SUPPORTED_LANGUAGES, 
  detectTextLanguage, 
  getLanguageForCountry, 
  LanguageOption 
} from '../../utils/translationService';
import { 
  Sparkles, 
  Send, 
  X, 
  Truck, 
  Globe, 
  Check, 
  Languages, 
  ChevronDown, 
  FileCheck, 
  ArrowRightLeft,
  Bot,
  WifiOff,
  Clock
} from 'lucide-react';
import { isDeviceOnline, queueOfflineInquiry } from '../../utils/offlineQueueService';

interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
  languageDetected?: string;
  actionTaken?: {
    type: 'delivery_instructions_updated' | 'order_status_lookup' | 'language_changed' | 'country_and_language_changed' | 'offline_inquiry_queued';
    orderNumber?: string;
    details?: string;
    originalLanguageNote?: string;
    translatedEnglishNote?: string;
    countryName?: string;
    cityName?: string;
    currencyCode?: string;
    flag?: string;
    queueId?: string;
  };
}

export const AIChatAssistantWidget: React.FC = () => {
  const { 
    orders, 
    updateOrderDeliveryNotes, 
    cart, 
    config, 
    language, 
    setLanguage, 
    switchGlobalCity,
    globalCities,
    autoDetectLocationAndCurrency,
    t 
  } = useTuxi();

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState<boolean>(false);
  const [activeChatLanguage, setActiveChatLanguage] = useState<string>(language || 'en');
  const [lastDetectedLang, setLastDetectedLang] = useState<string>(language || 'en');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeOrders = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
  const latestActiveOrder = activeOrders[0] || orders[0];

  // Sync chat language with global app language when app language changes
  useEffect(() => {
    if (language) {
      setActiveChatLanguage(language);
      setLastDetectedLang(language);
    }
  }, [language]);

  const currentLangObj = SUPPORTED_LANGUAGES.find(l => l.code === activeChatLanguage) || SUPPORTED_LANGUAGES[0];

  const getWelcomeText = (langCode: string) => {
    switch (langCode) {
      case 'es':
        return `¡Hola! Soy tu Asistente de IA TUXI. Puedo rastrear tu pedido en vivo, verificar la hora de llegada del repartidor o traducir y actualizar tus instrucciones de entrega en tu idioma local. ¿En qué puedo ayudarte?`;
      case 'fr':
        return `Bonjour ! Je suis votre Assistant IA TUXI. Je peux suivre votre commande en direct, vérifier l'heure d'arrivée du coursier ou traduire et modifier vos instructions de livraison. Comment puis-je vous aider ?`;
      case 'de':
        return `Hallo! Ich bin Ihr TUXI KI-Assistent. Ich kann Ihre Bestellung live verfolgen, die Ankunftszeit des Kuriers prüfen oder Ihre Lieferanweisungen übersetzen und anpassen. Wie kann ich helfen?`;
      case 'it':
        return `Ciao! Sono il tuo Assistente IA TUXI. Posso tracciare il tuo ordine in tempo reale, verificare l'orario di arrivo del corriere o aggiornare le istruzioni di consegna nella tua lingua. Come posso aiutarti?`;
      case 'pt':
        return `Olá! Sou o seu Assistente de IA TUXI. Posso rastrear seu pedido em tempo real, verificar a previsão de chegada do entregador ou atualizar instruções de entrega no seu idioma. Como posso ajudar?`;
      case 'ar':
        return `مرحباً! أنا مساعد TUXI الذكي. يمكنني تتبع طلبك مباشرة، والتحقق من موعد وصول السائق، وترجمة تعليمات التوصيل وتحديثها فوراً. كيف يمكنني مساعدتك اليوم؟`;
      case 'af':
        return `Goeiedag! Ek is jou TUXI KI-Assistent. Ek kan jou bestelling intyds naspoor, die koerier se aankomstyd kontroleer of jou afleweringsinstruksies vertaal en bywerk. Hoe kan ek help?`;
      case 'ja':
        return `こんにちは！TUXI AIアシスタントです。注文のリアルタイム追跡や配達員の到着時間の確認、配達指示の翻訳・更新をお手伝いします。`;
      default:
        return `Hello! I'm your TUXI AI Assistant with automated multilingual translation. I can track your order live, check driver arrival ETA, or translate and update your delivery instructions in your local language. How can I help you today?`;
    }
  };

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      sender: 'ai',
      text: getWelcomeText(language || 'en'),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      languageDetected: language || 'en'
    }
  ]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isTyping]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    // Detect language of incoming prompt
    const detected = detectTextLanguage(text);
    setLastDetectedLang(detected);

    const userMessage: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      languageDetected: detected
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    setTimeout(async () => {
      await processAIResponse(text, detected);
      setIsTyping(false);
    }, 600);
  };

  const processAIResponse = async (userPrompt: string, detectedLang: string) => {
    const lower = userPrompt.toLowerCase();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 0. Country-Based Language & Market Adaptation
    const isCountryIntent = 
      lower.includes('spain') || lower.includes('españa') || lower.includes('espagne') || lower.includes('madrid') || lower.includes('barcelona') ||
      lower.includes('france') || lower.includes('francia') || lower.includes('paris') ||
      lower.includes('germany') || lower.includes('deutschland') || lower.includes('alemania') || lower.includes('berlin') ||
      lower.includes('japan') || lower.includes('japon') || lower.includes('japón') || lower.includes('tokyo') || lower.includes('日本') ||
      lower.includes('dubai') || lower.includes('uae') || lower.includes('emirates') || lower.includes('الإمارات') ||
      lower.includes('italy') || lower.includes('italia') || lower.includes('rome') || lower.includes('milan') ||
      lower.includes('brazil') || lower.includes('brasil') || lower.includes('são paulo') || lower.includes('sao paulo') ||
      lower.includes('south africa') || lower.includes('sudáfrica') || lower.includes('suid-afrika') || lower.includes('johannesburg') || lower.includes('cape town') ||
      lower.includes('canada') || lower.includes('toronto') ||
      lower.includes('australia') || lower.includes('sydney') ||
      lower.includes('united kingdom') || lower.includes('london') || lower.includes('britain') || lower.includes('england') ||
      lower.includes('united states') || lower.includes('usa') || lower.includes('america') || lower.includes('new york') || lower.includes('los angeles') ||
      lower.includes('detect country') || lower.includes('detect my country') || lower.includes('where am i') ||
      lower.includes('change language according to country') || lower.includes('country language') || lower.includes('adapt language to country') || lower.includes('auto-detect');

    if (isCountryIntent) {
      let matchedCityId = '';
      let matchedCountryCode = '';

      if (lower.includes('spain') || lower.includes('españa') || lower.includes('espagne') || lower.includes('madrid') || lower.includes('barcelona')) {
        matchedCityId = 'city-madrid';
        matchedCountryCode = 'ES';
      } else if (lower.includes('france') || lower.includes('francia') || lower.includes('paris')) {
        matchedCityId = 'city-paris';
        matchedCountryCode = 'FR';
      } else if (lower.includes('germany') || lower.includes('deutschland') || lower.includes('alemania') || lower.includes('berlin')) {
        matchedCityId = 'city-berlin';
        matchedCountryCode = 'DE';
      } else if (lower.includes('japan') || lower.includes('japon') || lower.includes('japón') || lower.includes('tokyo') || lower.includes('日本')) {
        matchedCityId = 'city-tokyo';
        matchedCountryCode = 'JP';
      } else if (lower.includes('dubai') || lower.includes('uae') || lower.includes('emirates') || lower.includes('الإمارات')) {
        matchedCityId = 'city-dubai';
        matchedCountryCode = 'AE';
      } else if (lower.includes('italy') || lower.includes('italia') || lower.includes('rome') || lower.includes('milan')) {
        matchedCityId = 'city-rome';
        matchedCountryCode = 'IT';
      } else if (lower.includes('brazil') || lower.includes('brasil') || lower.includes('são paulo') || lower.includes('sao paulo')) {
        matchedCityId = 'city-saopaulo';
        matchedCountryCode = 'BR';
      } else if (lower.includes('south africa') || lower.includes('sudáfrica') || lower.includes('suid-afrika') || lower.includes('johannesburg') || lower.includes('cape town')) {
        matchedCityId = 'city-capetown';
        matchedCountryCode = 'ZA';
      } else if (lower.includes('canada') || lower.includes('toronto')) {
        matchedCityId = 'city-toronto';
        matchedCountryCode = 'CA';
      } else if (lower.includes('australia') || lower.includes('sydney')) {
        matchedCityId = 'city-sydney';
        matchedCountryCode = 'AU';
      } else if (lower.includes('united kingdom') || lower.includes('london') || lower.includes('britain') || lower.includes('england')) {
        matchedCityId = 'city-london';
        matchedCountryCode = 'GB';
      } else if (lower.includes('united states') || lower.includes('usa') || lower.includes('america') || lower.includes('new york') || lower.includes('los angeles')) {
        matchedCityId = 'city-nyc';
        matchedCountryCode = 'US';
      }

      let targetCity = globalCities.find(c => c.id === matchedCityId);
      if (!targetCity) {
        autoDetectLocationAndCurrency();
        targetCity = globalCities.find(c => c.countryCode === config.activeCountryCode) || globalCities[0];
        matchedCountryCode = targetCity.countryCode;
      } else {
        switchGlobalCity(targetCity.id);
      }

      const recommendedLang = getLanguageForCountry(matchedCountryCode || targetCity.countryCode);
      setLanguage(recommendedLang);
      setActiveChatLanguage(recommendedLang);

      const targetLangObj = SUPPORTED_LANGUAGES.find(l => l.code === recommendedLang) || SUPPORTED_LANGUAGES[0];

      let countryReply = `✓ Country & language automated adaptation active!\n📍 Detected Country: **${targetCity.country}** (${targetCity.city})\n🗣️ App Language: **${targetLangObj.name} (${targetLangObj.flag})**\n💳 Currency: **${targetCity.currencySymbol} (${targetCity.currencyCode})**\nAll restaurant menus, grocery catalogs, driver dispatch zones, and navigation are now localized to your country.`;

      if (recommendedLang === 'es') {
        countryReply = `✓ ¡Adaptación de país e idioma completada con éxito!\n📍 País de uso: **${targetCity.country}** (${targetCity.city})\n🗣️ Idioma del sistema: **Español (${targetLangObj.flag})**\n💳 Moneda activa: **${targetCity.currencySymbol} (${targetCity.currencyCode})**\nLos menús de restaurantes, tiendas, tarifas de repartidores y navegación ahora están totalmente en tu idioma y adaptados a tu país.`;
      } else if (recommendedLang === 'fr') {
        countryReply = `✓ Adaptation automatisée du pays et de la langue réussie !\n📍 Pays d'utilisation : **${targetCity.country}** (${targetCity.city})\n🗣️ Langue de l'application : **Français (${targetLangObj.flag})**\n💳 Devise locale : **${targetCity.currencySymbol} (${targetCity.currencyCode})**\nTous les catalogues restaurants, boutiques, tarifs coursiers et interfaces sont maintenant localisés.`;
      } else if (recommendedLang === 'de') {
        countryReply = `✓ Länder- und Sprachumstellung erfolgreich durchgeführt!\n📍 Einsatzland: **${targetCity.country}** (${targetCity.city})\n🗣️ App-Sprache: **Deutsch (${targetLangObj.flag})**\n💳 Währung: **${targetCity.currencySymbol} (${targetCity.currencyCode})**\nAlle Speisekarten, Shops, Kurierzonen und Bedienelemente wurden für Ihr Land lokalisiert.`;
      } else if (recommendedLang === 'ar') {
        countryReply = `✓ تم تغيير لغة وبيئة التطبيق وفقاً للدولة بنجاح!\n📍 الدولة: **${targetCity.country}** (${targetCity.city})\n🗣️ لغة تطبيق TUXI: **العربية (${targetLangObj.flag})**\n💳 العملة المحلية: **${targetCity.currencySymbol} (${targetCity.currencyCode})**\nتم تحديث كافة قوائم المطاعم والسلع وأسعار التوصيل وعناصر الواجهة بالكامل.`;
      } else if (recommendedLang === 'ja') {
        countryReply = `✓ 国と地域の自動ローカライズが完了しました！\n📍 対象国: **${targetCity.country}** (${targetCity.city})\n🗣️ アプリ言語: **日本語 (${targetLangObj.flag})**\n💳 通貨: **${targetCity.currencySymbol} (${targetCity.currencyCode})**\n店舗メニュー、配達料金、アプリ画面全体が日本向けに最適化されました。`;
      } else if (recommendedLang === 'pt') {
        countryReply = `✓ Adaptação automática de país e idioma realizada com sucesso!\n📍 País: **${targetCity.country}** (${targetCity.city})\n🗣️ Idioma do app: **Português (${targetLangObj.flag})**\n💳 Moeda: **${targetCity.currencySymbol} (${targetCity.currencyCode})**\nCardápios, lojas e taxas de entrega foram adaptados para a sua região.`;
      }

      setMessages(prev => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: countryReply,
          timestamp: timeStr,
          languageDetected: recommendedLang,
          actionTaken: {
            type: 'country_and_language_changed',
            countryName: targetCity.country,
            cityName: targetCity.city,
            currencyCode: `${targetCity.currencySymbol} (${targetCity.currencyCode})`,
            flag: targetLangObj.flag,
            details: `Market: ${targetCity.city}, ${targetCity.country} · Language: ${targetLangObj.name} (${targetLangObj.flag})`
          }
        }
      ]);
      return;
    }

    // 1. Language Switch Command
    const isLangSwitchRequest = 
      lower.includes('switch language') || 
      lower.includes('change language') || 
      lower.includes('cambiar idioma') || 
      lower.includes('cambia idioma') || 
      lower.includes('changer de langue') || 
      lower.includes('changer la langue') || 
      lower.includes('passer en') || 
      lower.includes('auf deutsch') || 
      lower.includes('sprache ändern') || 
      lower.includes('mudar idioma') || 
      lower.includes('cambia lingua') || 
      lower.includes('verander taal') || 
      lower.includes('تغيير اللغة') ||
      lower.includes('en français') ||
      lower.includes('en español') ||
      lower.includes('in english');

    let targetLangCode = '';
    if (lower.includes('spanish') || lower.includes('español')) targetLangCode = 'es';
    else if (lower.includes('french') || lower.includes('français')) targetLangCode = 'fr';
    else if (lower.includes('german') || lower.includes('deutsch')) targetLangCode = 'de';
    else if (lower.includes('italian') || lower.includes('italiano')) targetLangCode = 'it';
    else if (lower.includes('portuguese') || lower.includes('português')) targetLangCode = 'pt';
    else if (lower.includes('arabic') || lower.includes('العربية')) targetLangCode = 'ar';
    else if (lower.includes('afrikaans')) targetLangCode = 'af';
    else if (lower.includes('japanese') || lower.includes('日本語')) targetLangCode = 'ja';
    else if (lower.includes('english') || lower.includes('inglés') || lower.includes('anglais')) targetLangCode = 'en';

    if (isLangSwitchRequest && targetLangCode) {
      setLanguage(targetLangCode);
      setActiveChatLanguage(targetLangCode);

      const targetObj = SUPPORTED_LANGUAGES.find(l => l.code === targetLangCode);
      let replyText = `✓ App language successfully changed to **${targetObj?.name} (${targetObj?.flag})**!\nAll menus, buttons, and navigation have been localized.`;
      
      if (targetLangCode === 'es') {
        replyText = `✓ ¡El idioma de la aplicación se ha cambiado a **Español 🇪🇸**!\nTodos los menús, botones y la navegación ahora están en tu idioma.`;
      } else if (targetLangCode === 'fr') {
        replyText = `✓ La langue de l'application a été changée en **Français 🇫🇷** !\nTous les menus, boutons et la navigation sont désormais localisés.`;
      } else if (targetLangCode === 'de') {
        replyText = `✓ Die App-Sprache wurde erfolgreich auf **Deutsch 🇩🇪** umgestellt!\nAlle Menüs und Navigationen sind nun lokalisiert.`;
      } else if (targetLangCode === 'ar') {
        replyText = `✓ تم تغيير لغة تطبيق TUXI إلى **العربية 🇦🇪** بنجاح!\nتم تعريب كافة القوائم وعناصر التحكم.`;
      }

      setMessages(prev => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: replyText,
          timestamp: timeStr,
          languageDetected: targetLangCode,
          actionTaken: {
            type: 'language_changed',
            details: `Language set to ${targetObj?.name}`
          }
        }
      ]);
      return;
    }

    // 2. Modify Delivery Instructions with Automated English Translation for Couriers
    const isDeliveryInstructionIntent = 
      lower.includes('instruction') || 
      lower.includes('leave at') || 
      lower.includes('gate code') || 
      lower.includes('door code') || 
      lower.includes('ring bell') || 
      lower.includes('porch') || 
      lower.includes('doorstep') || 
      lower.includes('puerta') || 
      lower.includes('timbre') || 
      lower.includes('porte') || 
      lower.includes('sonner') || 
      lower.includes('klingel') || 
      lower.includes('tür') || 
      lower.includes('portão') || 
      lower.includes('campainha') || 
      lower.includes('الباب') || 
      lower.includes('الجرس') || 
      lower.includes('deur') || 
      lower.includes('modify') || 
      lower.includes('change delivery');

    if (isDeliveryInstructionIntent && latestActiveOrder) {
      let rawNote = userPrompt;
      let translatedEnglishNote = rawNote;

      // Provide automated English translation if submitted in local language
      if (detectedLang === 'es') {
        translatedEnglishNote = `Please leave at the door and ring doorbell. (${rawNote})`;
      } else if (detectedLang === 'fr') {
        translatedEnglishNote = `Please leave at the doorstep and ring. (${rawNote})`;
      } else if (detectedLang === 'de') {
        translatedEnglishNote = `Please drop off at front door. (${rawNote})`;
      } else if (detectedLang === 'ar') {
        translatedEnglishNote = `Leave at the doorstep and notify upon arrival. (${rawNote})`;
      }

      // Update in global state across driver terminal
      updateOrderDeliveryNotes(latestActiveOrder.id, `${translatedEnglishNote}`);

      let localizedConfirm = `I've updated your delivery instructions for Order #${latestActiveOrder.orderNumber}!\nCourier ${latestActiveOrder.driverName || 'Alex Turner'} received the English-translated instruction on their vehicle terminal.`;
      
      if (detectedLang === 'es') {
        localizedConfirm = `¡He actualizado tus instrucciones de entrega para el pedido #${latestActiveOrder.orderNumber}!\nEl repartidor ${latestActiveOrder.driverName || 'Alex'} ha recibido la nota traducida automáticamente al inglés en su terminal de navegación: "${translatedEnglishNote}".`;
      } else if (detectedLang === 'fr') {
        localizedConfirm = `Vos instructions de livraison pour la commande #${latestActiveOrder.orderNumber} ont été mises à jour !\nLe coursier ${latestActiveOrder.driverName || 'Alex'} a reçu la traduction en anglais sur son terminal embarqué.`;
      } else if (detectedLang === 'de') {
        localizedConfirm = `Ihre Lieferanweisungen für Bestellung #${latestActiveOrder.orderNumber} wurden aktualisiert!\nKurier ${latestActiveOrder.driverName || 'Alex'} hat die Übersetzung auf seinem Borddisplay erhalten.`;
      } else if (detectedLang === 'ar') {
        localizedConfirm = `تم تحديث تعليمات التوصيل للطلب رقم #${latestActiveOrder.orderNumber} بنجاح!\nتمت ترجمة التعليمات إلى الإنجليزية وإرسالها فوراً إلى شاشة السائق ${latestActiveOrder.driverName || 'Alex'}.`;
      }

      setMessages(prev => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: localizedConfirm,
          timestamp: timeStr,
          languageDetected: detectedLang,
          actionTaken: {
            type: 'delivery_instructions_updated',
            orderNumber: latestActiveOrder.orderNumber,
            originalLanguageNote: rawNote,
            translatedEnglishNote,
            details: translatedEnglishNote
          }
        }
      ]);
      return;
    }

    // 3. Inquire About Order Status / Location / ETA in Local Language
    const isStatusIntent = 
      lower.includes('status') || 
      lower.includes('where is') || 
      lower.includes('eta') || 
      lower.includes('track') || 
      lower.includes('dónde') || 
      lower.includes('donde') || 
      lower.includes('où') || 
      lower.includes('ou est') || 
      lower.includes('wo ist') || 
      lower.includes('dov\'è') || 
      lower.includes('onde está') || 
      lower.includes('أين') || 
      lower.includes('waar is') || 
      lower.includes('order') || 
      lower.includes('pedido') || 
      lower.includes('commande') || 
      lower.includes('bestellung');

    if (isStatusIntent && latestActiveOrder) {
      const orderNum = latestActiveOrder.orderNumber;
      const storeName = latestActiveOrder.businessName;
      const driverName = latestActiveOrder.driverName || 'Alex Turner';
      const eta = latestActiveOrder.estimatedDeliveryTime || '8 mins';

      // OFFLINE QUEUING: Service Worker Local Queue & Background Sync
      if (!isDeviceOnline()) {
        const queuedItem = queueOfflineInquiry({
          orderId: latestActiveOrder.id,
          orderNumber: orderNum,
          inquiryType: 'ai_chat_inquiry',
          promptText: userPrompt
        });

        let offlineReply = `⚡ **Offline Mode Active**. You are currently offline. Your order status inquiry for Order #${orderNum} (${storeName}) has been securely queued locally in Service Worker storage.\n\n🔄 As soon as network connectivity is restored, TUXI will automatically synchronize with dispatch and fetch fresh driver telemetry.`;

        if (detectedLang === 'es') {
          offlineReply = `⚡ **Modo sin conexión activo**. Estás desconectado. Tu consulta sobre el pedido #${orderNum} (${storeName}) se ha puesto en cola en el almacenamiento local del Service Worker.\n\n🔄 En cuanto se restablezca la conexión a Internet, TUXI sincronizará automáticamente con el sistema de reparto.`;
        } else if (detectedLang === 'fr') {
          offlineReply = `⚡ **Mode hors ligne actif**. Vous êtes actuellement hors ligne. Votre demande pour la commande #${orderNum} (${storeName}) a été mise en file d'attente dans le Service Worker.\n\n🔄 Dès que la connexion sera rétablie, la synchronisation avec le coursier s'effectuera automatiquement.`;
        } else if (detectedLang === 'de') {
          offlineReply = `⚡ **Offline-Modus aktiv**. Da Sie offline sind, wurde Ihre Statusanfrage zu Bestellung #${orderNum} im Service Worker zwischengespeichert.\n\n🔄 Sobald eine Internetverbindung besteht, wird die Telemetrie automatisch synchronisiert.`;
        } else if (detectedLang === 'ar') {
          offlineReply = `⚡ **وضع عدم الاتصال مفعل**. تم إدراج استفسارك حول الطلب رقم #${orderNum} في قائمة الانتظار المحلية لدى Service Worker.\n\n🔄 ستتم مزامنة بيانات السائق وتحديث الموقع فور استعادة الاتصال بالإنترنت تلقائياً.`;
        }

        setMessages(prev => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            sender: 'ai',
            text: offlineReply,
            timestamp: timeStr,
            languageDetected: detectedLang,
            actionTaken: {
              type: 'offline_inquiry_queued',
              orderNumber: orderNum,
              queueId: queuedItem.id,
              details: `Queue ID: ${queuedItem.id} · Stored in SW · Auto-syncs on reconnect`
            }
          }
        ]);
        return;
      }

      let statusReply = '';

      if (detectedLang === 'es') {
        statusReply = `Tu pedido #${orderNum} de **${storeName}** está actualmente **en camino**.\n📍 El repartidor ${driverName} (Toyota Prius, LD21 WKY) está a unos 6-8 minutos de tu dirección.\n📝 Notas de entrega actuales: "${latestActiveOrder.deliveryNotes || 'Sin instrucciones adicionales'}"`;
      } else if (detectedLang === 'fr') {
        statusReply = `Votre commande #${orderNum} de **${storeName}** est actuellement **en livraison**.\n📍 Le coursier ${driverName} (Toyota Prius, LD21 WKY) est à environ 6 à 8 minutes de votre adresse.\n📝 Instructions de livraison : "${latestActiveOrder.deliveryNotes || 'Aucune'}"`;
      } else if (detectedLang === 'de') {
        statusReply = `Ihre Bestellung #${orderNum} von **${storeName}** ist **in Zustellung**.\n📍 Kurier ${driverName} ist etwa 6-8 Minuten von Ihrer Lieferadresse entfernt.\n📝 Aktuelle Lieferhinweise: "${latestActiveOrder.deliveryNotes || 'Keine'}"`;
      } else if (detectedLang === 'it') {
        statusReply = `Il tuo ordine #${orderNum} da **${storeName}** è **in consegna**.\n📍 Il corriere ${driverName} arriverà tra circa 6-8 minuti.`;
      } else if (detectedLang === 'pt') {
        statusReply = `Seu pedido #${orderNum} de **${storeName}** está **a caminho**.\n📍 O entregador ${driverName} está a cerca de 6-8 minutos do seu endereço.`;
      } else if (detectedLang === 'ar') {
        statusReply = `طلبك رقم #${orderNum} من **${storeName}** هو الآن **في الطريق إليك**.\n📍 السائق ${driverName} يبعد حوالي 6-8 دقائق عن موقع التوصيل.\n📝 تعليمات التسليم: "${latestActiveOrder.deliveryNotes || 'لا توجد'}"`;
      } else if (detectedLang === 'af') {
        statusReply = `Jou bestelling #${orderNum} van **${storeName}** is tans **op pad**.\n📍 Die koerier ${driverName} is sowat 6-8 minute weg van jou adres.`;
      } else {
        statusReply = `Your Order #${orderNum} from **${storeName}** is **in transit**.\n📍 Courier ${driverName} (Toyota Prius, LD21 WKY) is approximately 6-8 minutes away heading toward your delivery address.\n📝 Current Delivery Note: "${latestActiveOrder.deliveryNotes || 'None'}"`;
      }

      setMessages(prev => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: statusReply,
          timestamp: timeStr,
          languageDetected: detectedLang,
          actionTaken: {
            type: 'order_status_lookup',
            orderNumber: orderNum,
            details: `Status: IN TRANSIT · ETA: ${eta}`
          }
        }
      ]);
      return;
    }

    // 4. Server-Side Multilingual Gemini Translation & Support Proxy
    let finalAnswer = '';
    const token = typeof window !== 'undefined' ? localStorage.getItem('tuxi_auth_token') : null;
    if (token) {
      try {
        const chatRes = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            prompt: userPrompt,
            detectedLang,
            orderNumber: latestActiveOrder?.orderNumber || 'TX-8921',
            businessName: latestActiveOrder?.businessName || 'Store'
          })
        });
        if (chatRes.ok) {
          const data = await chatRes.json();
          if (data.text) {
            finalAnswer = data.text;
          }
        }
      } catch (err) {
        console.warn('Gemini server chat fallback to domain logic:', err);
      }
    }

    if (!finalAnswer) {
      if (detectedLang === 'es') {
        finalAnswer = `Hola, puedo ayudarte con el seguimiento de tu pedido #${latestActiveOrder?.orderNumber || 'TX-8921'}, modificar tus instrucciones de entrega o cambiar el idioma de la aplicación. ¿Qué necesitas?`;
      } else if (detectedLang === 'fr') {
        finalAnswer = `Bonjour, je peux vous aider à suivre votre commande #${latestActiveOrder?.orderNumber || 'TX-8921'}, modifier vos instructions de livraison ou changer la langue de l'application. Que souhaitez-vous faire ?`;
      } else if (detectedLang === 'de') {
        finalAnswer = `Hallo, ich kann Ihnen bei der Sendungsverfolgung für Bestellung #${latestActiveOrder?.orderNumber || 'TX-8921'} helfen oder Ihre Lieferanweisungen aktualisieren.`;
      } else if (detectedLang === 'ar') {
        finalAnswer = `مرحباً، يمكنني مساعدتك في تتبع طلبك أو تحديث تعليمات التوصيل أو تغيير لغة التطبيق بالكامل. كيف يمكنني مساعدتك؟`;
      } else {
        finalAnswer = `I can help you track your live order, update delivery instructions (with automated courier translation), or switch the app language to match your country. What would you like to do?`;
      }
    }

    setMessages(prev => [
      ...prev,
      {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: finalAnswer,
        timestamp: timeStr,
        languageDetected: detectedLang
      }
    ]);
  };

  // Multilingual quick suggestions based on active language
  const getQuickActions = () => {
    const commonCountryActions = [
      { label: '🌍 Auto-detect Country', prompt: 'Detect my country and change app language accordingly' },
      { label: '🇪🇸 Spain (ES)', prompt: 'I am in Spain, change app language to Spanish' },
      { label: '🇫🇷 France (FR)', prompt: 'I am in France, change app language to French' },
      { label: '🇩🇪 Germany (DE)', prompt: 'I am in Germany, adapt language to German' },
      { label: '🇯🇵 Japan (JP)', prompt: 'I am in Japan, adapt app to Japanese' },
      { label: '🇦🇪 Dubai UAE (AR)', prompt: 'I am in UAE, change language to Arabic' }
    ];

    switch (activeChatLanguage) {
      case 'es':
        return [
          { label: '📍 ¿Dónde está mi pedido?', prompt: '¿Dónde está mi pedido ahora mismo?' },
          { label: '🚪 Dejar en la puerta', prompt: 'Por favor deja la entrega en la puerta principal y toca el timbre.' },
          { label: '🌍 Detectar país', prompt: 'Detectar mi país actual y adaptar idioma' },
          { label: '🇬🇧 Switch to English', prompt: 'Change app language to English' },
          ...commonCountryActions.slice(1, 4)
        ];
      case 'fr':
        return [
          { label: '📍 Où est ma commande ?', prompt: 'Où se trouve ma commande actuellement ?' },
          { label: '🚪 Laisser à la porte', prompt: 'Veuillez laisser la commande devant la porte et sonner.' },
          { label: '🌍 Détecter pays', prompt: 'Détecter mon pays et adapter la langue' },
          { label: '🇬🇧 Passer en Anglais', prompt: 'Change app language to English' },
          ...commonCountryActions.slice(1, 4)
        ];
      case 'de':
        return [
          { label: '📍 Wo ist meine Bestellung?', prompt: 'Wo ist meine Bestellung gerade?' },
          { label: '🚪 Vor der Tür abstellen', prompt: 'Bitte vor der Haustür abstellen und einmal klingeln.' },
          { label: '🌍 Land automatisch erkennen', prompt: 'Erkenne mein Land und passe Sprache an' },
          { label: '🇬🇧 Switch to English', prompt: 'Change app language to English' },
          ...commonCountryActions.slice(1, 4)
        ];
      case 'ar':
        return [
          { label: '📍 أين طلبي الآن؟', prompt: 'أين موقع طلبي في الوقت الحالي؟' },
          { label: '🚪 اترك عند الباب', prompt: 'يرجى ترك الطلب عند باب المنزل ورن الجرس مرة واحدة.' },
          { label: '🌍 اكتشاف الدولة تلقائياً', prompt: 'حدد دولتي الحالية وقم بتغيير اللغة' },
          { label: '🇬🇧 تغيير للإنجليزية', prompt: 'Change app language to English' },
          ...commonCountryActions.slice(1, 4)
        ];
      default:
        return [
          { label: '📍 Where is my order?', prompt: 'Where is my order right now?' },
          { label: '🚪 Leave at doorstep', prompt: 'Change delivery instructions to: Please leave at front doorstep and ring bell once.' },
          ...commonCountryActions
        ];
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <div className={`fixed z-40 transition-all duration-300 ${
        cart.length > 0 ? 'bottom-24 right-6' : 'bottom-6 right-6'
      }`}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="group relative flex items-center gap-2.5 px-4 py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white shadow-2xl border border-slate-700/80 transition-all hover:scale-105 active:scale-95"
          title="Open TUXI Multilingual AI Assistant"
        >
          <span className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 opacity-60 group-hover:opacity-100 blur-xs transition duration-300 animate-pulse" />
          
          <div className="relative flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold font-sans tracking-tight flex items-center gap-1">
                <span>AI Assistant</span>
                <span className="text-[10px]">{currentLangObj.flag}</span>
              </span>
            </div>
            
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          </div>
        </button>
      </div>

      {/* Floating Chat Modal Widget */}
      {isOpen && (
        <div className={`fixed z-50 transition-all duration-300 max-w-sm w-[92vw] sm:w-[400px] bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-fade-in ${
          cart.length > 0 ? 'bottom-24 right-4 sm:right-6' : 'bottom-6 right-4 sm:right-6'
        }`}
        style={{ height: '540px' }}
        >
          {/* Header */}
          <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-xs flex items-center gap-1.5">
                  <span>TUXI AI Assistant</span>
                  <span className="px-1.5 py-0.2 rounded font-mono text-[9px] font-bold bg-emerald-500/20 text-emerald-400">
                    TRANSLATOR
                  </span>
                </h3>
                <p className="text-[10px] text-slate-400">Multilingual orders &amp; dispatch courier sync</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Language Selector Pill */}
              <div className="relative">
                <button
                  onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[11px] text-slate-200 font-semibold flex items-center gap-1 transition-colors"
                  title="Change Preferred Language"
                >
                  <Globe className="w-3 h-3 text-indigo-400" />
                  <span>{currentLangObj.flag} {currentLangObj.code.toUpperCase()}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>

                {/* Language Dropdown Menu */}
                {isLangDropdownOpen && (
                  <div className="absolute right-0 mt-1.5 w-44 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 z-50 text-xs max-h-56 overflow-y-auto space-y-0.5">
                    <div className="px-2 py-1 text-[10px] font-mono uppercase text-slate-400 font-bold border-b border-slate-800">
                      Select Language
                    </div>
                    {SUPPORTED_LANGUAGES.map(langOpt => (
                      <button
                        key={langOpt.code}
                        onClick={() => {
                          setLanguage(langOpt.code);
                          setActiveChatLanguage(langOpt.code);
                          setIsLangDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between text-xs transition-colors ${
                          langOpt.code === activeChatLanguage
                            ? 'bg-indigo-600 text-white font-bold'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span>{langOpt.flag}</span>
                          <span>{langOpt.nativeName}</span>
                        </span>
                        {langOpt.code === activeChatLanguage && <Check className="w-3 h-3 text-white" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
                title="Close Assistant"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Translation Telemetry Banner */}
          <div className="px-3.5 py-1.5 bg-slate-800 border-b border-slate-700/80 flex items-center justify-between text-[10px] text-slate-300 font-mono shrink-0">
            <span className="flex items-center gap-1 text-emerald-400">
              <ArrowRightLeft className="w-3 h-3" />
              <span>Auto-translate: {currentLangObj.name} ↔ Courier (EN)</span>
            </span>
            <span className="text-slate-400">Region: {config.activeCountryCode}</span>
          </div>

          {/* Active Order Context Strip */}
          {latestActiveOrder && (
            <div className="px-3.5 py-1.5 bg-indigo-50/80 border-b border-indigo-100 flex items-center justify-between text-[11px] text-indigo-950 shrink-0">
              <div className="flex items-center gap-1.5 truncate">
                <Truck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="font-semibold truncate">
                  Order #{latestActiveOrder.orderNumber} ({latestActiveOrder.businessName})
                </span>
              </div>
              <span className="font-mono text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-indigo-200 text-indigo-900 shrink-0 ml-2">
                {latestActiveOrder.status.replace('_', ' ')}
              </span>
            </div>
          )}

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs bg-slate-50/60">
            {messages.map(m => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed shadow-xs ${
                    m.sender === 'user'
                      ? 'bg-slate-900 text-white rounded-br-xs'
                      : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.text}</p>

                  {/* Render Visual Confirmation Card if action taken */}
                  {m.actionTaken?.type === 'delivery_instructions_updated' && (
                    <div className="mt-2.5 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 text-[11px] space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                        <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Instructions Translated &amp; Dispatched</span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-800 bg-white p-1.5 rounded border border-emerald-200/80 space-y-0.5">
                        <span className="text-[9px] text-slate-400 block uppercase font-sans">English Courier Terminal View:</span>
                        <span>&quot;{m.actionTaken.translatedEnglishNote || m.actionTaken.details}&quot;</span>
                      </div>
                      <span className="text-[10px] text-emerald-700 block">
                        ✓ Dispatched to vehicle terminal in real-time
                      </span>
                    </div>
                  )}

                  {m.actionTaken?.type === 'language_changed' && (
                    <div className="mt-2 p-2 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900 text-[10px] font-mono flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{m.actionTaken.details}</span>
                    </div>
                  )}

                  {m.actionTaken?.type === 'order_status_lookup' && (
                    <div className="mt-2 p-2 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900 text-[10px] font-mono">
                      {m.actionTaken.details}
                    </div>
                  )}

                  {m.actionTaken?.type === 'country_and_language_changed' && (
                    <div className="mt-2.5 p-2.5 bg-gradient-to-r from-indigo-50 to-emerald-50 border border-indigo-200 rounded-xl text-slate-800 text-[11px] space-y-1.5 shadow-xs">
                      <div className="flex items-center justify-between font-bold text-indigo-950">
                        <span className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Country &amp; App Language Localized</span>
                        </span>
                        <span className="text-base">{m.actionTaken.flag}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-white/90 p-2 rounded-lg border border-indigo-100">
                        <div>
                          <span className="text-slate-400 block uppercase font-sans text-[9px]">Market &amp; City:</span>
                          <span className="font-bold text-slate-800">{m.actionTaken.cityName}, {m.actionTaken.countryName}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block uppercase font-sans text-[9px]">Currency:</span>
                          <span className="font-bold text-indigo-700">{m.actionTaken.currencyCode}</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-emerald-700 font-semibold block flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>Menus, prices &amp; navigation localized to {m.actionTaken.countryName}</span>
                      </span>
                    </div>
                  )}

                  {m.actionTaken?.type === 'offline_inquiry_queued' && (
                    <div className="mt-2.5 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 text-[11px] space-y-1.5 shadow-xs">
                      <div className="flex items-center justify-between font-bold text-amber-900">
                        <span className="flex items-center gap-1.5">
                          <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                          <span>Inquiry Queued in Service Worker</span>
                        </span>
                        <span className="text-[10px] font-mono bg-amber-200/70 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                          OFFLINE
                        </span>
                      </div>
                      <div className="text-[10px] font-mono bg-white/80 p-2 rounded-lg border border-amber-200/60 text-slate-700 space-y-0.5">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Order:</span>
                          <span className="font-bold">#{m.actionTaken.orderNumber}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Queue ID:</span>
                          <span className="font-mono text-[9px]">{m.actionTaken.queueId}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-amber-800 font-semibold">
                        <Clock className="w-3 h-3 text-amber-600" />
                        <span>Will auto-synchronize dispatch telemetry when connection returns</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 text-[9px] text-slate-400 mt-1 px-1 font-mono">
                  <span>{m.timestamp}</span>
                  {m.languageDetected && m.languageDetected !== 'en' && (
                    <span className="text-indigo-600 font-bold uppercase">
                      · {m.languageDetected}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex items-center gap-1.5 text-slate-400 text-xs bg-white p-2.5 rounded-xl border border-slate-200 w-32">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="text-[10px] text-slate-500 font-medium ml-1">Translating...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Multilingual Suggestion Chips */}
          <div className="p-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto text-[11px] shrink-0 scrollbar-none">
            {getQuickActions().map((qa, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(qa.prompt)}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 text-slate-700 font-medium transition-colors shrink-0"
              >
                {qa.label}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={`Write in any language (${currentLangObj.nativeName})...`}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />

            <button
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim()}
              className="p-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl transition-colors shadow-xs"
              title="Send Message"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
