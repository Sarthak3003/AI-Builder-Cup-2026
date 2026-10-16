import type { Translate } from '../i18n'

export const bookingText: Record<string, string> = {
	'Demo': 'डेमो',
	'Demo Ride Provider': 'डेमो सवारी सेवा',
	'Demo Food Provider': 'डेमो भोजन सेवा',
	'Demo Pharmacy Provider': 'डेमो दवा सेवा',
	'demo provider': 'डेमो सेवा',
	'Demo Ride': 'डेमो सवारी',
	'Rapido Auto': 'रैपिडो ऑटो', 'Ola Mini': 'ओला मिनी', 'Uber Go': 'उबर गो',
	'Saathi Demo Kitchen': 'साथी डेमो रसोई', 'Demo Tiffin Kitchen': 'डेमो टिफ़िन रसोई',
	'Demo Home Kitchen': 'डेमो घरेलू रसोई', 'Demo Thali House': 'डेमो थाली घर',
	'Demo pharmacy': 'डेमो दवा की दुकान',
	'Vegetable khichdi': 'सब्ज़ियों की खिचड़ी', 'Dal and rice': 'दाल और चावल',
	'Paneer meal': 'पनीर का भोजन', 'Chicken and rice': 'चिकन और चावल',
	'Two rotis': 'दो रोटियाँ', 'Buttermilk': 'छाछ', 'Mini veg thali': 'छोटी शाकाहारी थाली', 'Fruit bowl': 'फलों की कटोरी',
	'ORS sachets, pack of 5 (sample)': 'ओआरएस के 5 पाउच (नमूना)',
	'Crepe bandage, 10 cm (sample)': 'क्रेप पट्टी, 10 सेमी (नमूना)',
	'Antiseptic liquid, 100 ml (sample)': 'एंटीसेप्टिक तरल, 100 मिली (नमूना)',
	'Digital thermometer (sample)': 'डिजिटल थर्मामीटर (नमूना)',
	'Pain relief balm, 25 g (sample)': 'दर्द निवारक बाम, 25 ग्राम (नमूना)',
	'Calcium supplement, 15 tablets (sample)': 'कैल्शियम पूरक, 15 गोलियाँ (नमूना)',
	'Hand sanitiser, 100 ml (sample)': 'हैंड सैनिटाइज़र, 100 मिली (नमूना)',
	'Car': 'कार', 'Auto rickshaw': 'ऑटो रिक्शा', 'Hatchback': 'हैचबैक',
	'Waiting for approval · not booked yet': 'मंज़ूरी का इंतज़ार · अभी बुक नहीं हुआ',
	'Booked · simulated': 'बुक हो गया · सिम्युलेटेड', 'Completed · simulated': 'पूरा हुआ · सिम्युलेटेड',
	'Failed · nothing booked': 'असफल · कुछ बुक नहीं हुआ', 'Cancelled · simulated': 'रद्द · सिम्युलेटेड',
	'Declined in Care Circle': 'केयर सर्कल ने मना किया',
	'Not charged (simulated)': 'कोई राशि नहीं ली गई (सिम्युलेटेड)',
	'Pending (simulated) · nothing charged yet': 'बाकी है (सिम्युलेटेड) · अभी कोई राशि नहीं ली गई',
	'Paid (simulated) · no money charged': 'भुगतान हुआ (सिम्युलेटेड) · कोई वास्तविक राशि नहीं ली गई',
	'Failed (simulated) · nothing charged': 'असफल (सिम्युलेटेड) · कोई राशि नहीं ली गई',
	'Demo wallet (simulated)': 'डेमो वॉलेट (सिम्युलेटेड)',
	'Pay on completion (simulated)': 'पूरा होने पर भुगतान (सिम्युलेटेड)',
	'Refund recorded (simulated)': 'रिफ़ंड दर्ज हुआ (सिम्युलेटेड)',
	'Base fare': 'मूल किराया', 'Delivery fee (demo)': 'डिलीवरी शुल्क (डेमो)',
	'Price breakdown': 'कीमत का विवरण', 'Total (sample price)': 'कुल (नमूना कीमत)',
	'Demo ride — no real driver will arrive.': 'डेमो सवारी — कोई वास्तविक ड्राइवर नहीं आएगा।',
	'Demo order — no real food will be delivered.': 'डेमो ऑर्डर — कोई वास्तविक भोजन नहीं पहुँचाया जाएगा।',
	'Demo pharmacy order — sample non-prescription items only. Nothing will be delivered, and this is not medical advice.': 'डेमो दवा ऑर्डर — केवल बिना पर्चे के मिलने वाली चीज़ों के नमूने। कुछ भी पहुँचाया नहीं जाएगा और यह चिकित्सा सलाह नहीं है।',
	'Pharmacy orders need approval.': 'दवा के ऑर्डर के लिए मंज़ूरी चाहिए।',
	'The only option': 'एकमात्र विकल्प', 'Lowest price and shortest wait': 'सबसे कम कीमत और सबसे कम इंतज़ार',
	'Lowest price': 'सबसे कम कीमत', 'Shortest wait': 'सबसे कम इंतज़ार', 'Best balance of price and wait': 'कीमत और इंतज़ार का सबसे अच्छा संतुलन',
	'Chosen by Gemini (AI) from the demo prices.': 'डेमो कीमतों में से जेमिनी (एआई) ने चुना।',
	'Chosen by Saathi’s price-and-wait rule (not AI).': 'साथी के कीमत और इंतज़ार के नियम से चुना गया (एआई नहीं)।',
	'Saathi’s pick': 'साथी की पसंद', 'Booked for you by Saathi': 'साथी ने आपके लिए बुक किया', 'Ordered for you by Saathi': 'साथी ने आपके लिए ऑर्डर किया',
	'Fare': 'किराया', 'Fare breakdown': 'किराए का विवरण', 'Your order': 'आपका ऑर्डर', 'Bill details': 'बिल का विवरण',
	'Booking reference': 'बुकिंग संदर्भ', 'Provider': 'सेवा प्रदाता', 'Why approval': 'मंज़ूरी क्यों चाहिए', 'Decision': 'फ़ैसला',
	'Approved': 'मंज़ूर', 'Declined': 'मना किया', 'Payment': 'भुगतान', 'Booking': 'बुकिंग', 'Total': 'कुल',
	'Pickup': 'पिकअप', 'Drop': 'उतरने की जगह', 'Trip time': 'यात्रा का समय', 'Delivery': 'डिलीवरी', 'Item': 'चीज़', 'Payment method': 'भुगतान का तरीका', 'Asked': 'अनुरोध किया', 'For': 'इसके लिए',
	'Payment details are not shared with you.': 'भुगतान की जानकारी आपके साथ साझा नहीं की गई है।',
	'No money moves.': 'कोई वास्तविक लेन-देन नहीं होता।',
	'No money charged.': 'कोई राशि नहीं ली गई।', 'Nothing charged.': 'कोई राशि नहीं ली गई।',
	'Home': 'होम', 'Book a ride': 'सवारी बुक करें', 'Order food': 'खाना मँगाएँ', 'Medicine request': 'दवा का अनुरोध',
	'What would you like?': 'आप क्या चाहेंगे?', 'Continue where you left off': 'जहाँ छोड़ा था वहीं से जारी रखें',
	'Open Services': 'सेवाएँ खोलें', 'Services': 'सेवाएँ', 'Add a place': 'जगह जोड़ें',
	'Pick me up from': 'मुझे यहाँ से लें', 'Where to?': 'कहाँ जाना है?', 'Choose a place': 'जगह चुनें',
	'Somewhere else…': 'कहीं और…', 'Place name or address': 'जगह का नाम या पता', 'e.g. Central market': 'जैसे, सेंट्रल मार्केट', 'Kitchen': 'रसोई',
	'vegetarian': 'शाकाहारी', 'non-vegetarian': 'मांसाहारी', 'mild': 'कम मसालेदार', 'some spice': 'थोड़ा मसालेदार', 'any diet': 'कोई भी भोजन', 'any spice': 'किसी भी तरह का मसाला',
	'Sample non-prescription items only. This is not medical advice and not a real pharmacy order.': 'केवल बिना पर्चे के मिलने वाली चीज़ों के नमूने। यह चिकित्सा सलाह या असली दवा ऑर्डर नहीं है।',
	'Book the best demo ride': 'सबसे अच्छी डेमो सवारी बुक करें', 'Get demo prices': 'डेमो कीमतें देखें', 'Order now': 'अभी ऑर्डर करें', 'Get demo price': 'डेमो कीमत देखें',
	'Pick one': 'एक चुनें', 'Choose': 'चुनें', 'Back': 'वापस', 'Change my request': 'मेरा अनुरोध बदलें',
	'Saathi’s own demo service': 'साथी की अपनी डेमो सेवा',
	'Pick one to see the full price. Nothing is booked until you confirm, and prices are held for 15 minutes.': 'पूरी कीमत देखने के लिए एक विकल्प चुनें। आपकी पुष्टि के बिना कुछ बुक नहीं होगा और कीमतें 15 मिनट तक मान्य हैं।',
	'YOU HAVE THE FINAL SAY': 'आख़िरी फ़ैसला आपका है', 'Book this?': 'इसे बुक करें?', 'Check and confirm': 'जाँचें और पुष्टि करें',
	'Price held until': 'कीमत तब तक मान्य है', 'This price has expired. Please get a new one.': 'यह कीमत अब मान्य नहीं है। कृपया नई कीमत लें।',
	'Confirm demo booking': 'डेमो बुकिंग की पुष्टि करें', 'Compare all options': 'सभी विकल्पों की तुलना करें', 'Go back': 'वापस जाएँ', 'Read aloud': 'पढ़कर सुनाएँ',
	'Read aloud is unavailable in this browser.': 'इस ब्राउज़र में पढ़कर सुनाने की सुविधा उपलब्ध नहीं है।',
	'Booking failed': 'बुकिंग असफल रही', 'Try again': 'फिर कोशिश करें', 'Ask my Care Circle for help': 'मेरे केयर सर्कल से मदद माँगें',
	'Your Care Circle was told.': 'आपके केयर सर्कल को बता दिया गया है।',
	'This is a simulated failure, so the demo can show what happens when a service fails.': 'यह डेमो में दिखाई गई असफलता है, ताकि सेवा असफल होने पर क्या होता है यह दिखाया जा सके।',
	'Sent for approval': 'मंज़ूरी के लिए भेजा गया', 'Demo booking confirmed': 'डेमो बुकिंग की पुष्टि हो गई',
	'Someone in your Care Circle will be asked to approve this. Nothing is booked or charged until they do.': 'आपके केयर सर्कल में किसी से इसकी मंज़ूरी माँगी जाएगी। उनकी मंज़ूरी तक न बुकिंग होगी, न कोई राशि ली जाएगी।',
	'Your Care Circle was asked. Nobody has agreed yet.': 'आपके केयर सर्कल से पूछा गया है। अभी किसी ने हाँ नहीं कही है।',
	'Ask if someone can come with me': 'पूछें कि क्या कोई मेरे साथ आ सकता है', 'Suggestion:': 'सुझाव:', 'Done': 'हो गया',
	'No need to call anyone.': 'किसी को फ़ोन करने की ज़रूरत नहीं है।', 'That is it. There was no need to call anyone.': 'बस हो गया। किसी को फ़ोन करने की ज़रूरत नहीं पड़ी।',
	'Track your demo ride': 'अपनी डेमो सवारी की स्थिति देखें', 'See booking details': 'बुकिंग की जानकारी देखें', 'Book something else': 'कुछ और बुक करें',
	'Back to activity': 'गतिविधि पर वापस जाएँ', 'That activity is not available.': 'वह गतिविधि उपलब्ध नहीं है।',
	'Help': 'मदद', 'Cancel ride': 'सवारी रद्द करें', 'Cancel order': 'ऑर्डर रद्द करें', 'Cancel booking': 'बुकिंग रद्द करें',
	'Demo: mark trip or delivery completed': 'डेमो: यात्रा या डिलीवरी पूरी होने के रूप में दर्ज करें',
	'Demo: mark simulated payment complete': 'डेमो: सिम्युलेटेड भुगतान पूरा दर्ज करें',
	'Payment is not marked complete yet. Please check its status and try again.': 'भुगतान अभी पूरा दर्ज नहीं हुआ है। कृपया उसकी स्थिति जाँचें और फिर कोशिश करें।',
	'Payment was marked complete, but the latest booking details could not be refreshed.': 'भुगतान पूरा दर्ज हो गया, लेकिन बुकिंग की ताज़ा जानकारी नहीं मिल सकी।',
	'Sharing': 'साझा करना', 'Share this with my Care Circle': 'इसे मेरे केयर सर्कल के साथ साझा करें',
	'Only people you have given activity access can see it, and never your addresses or payment details unless you allow that.': 'इसे केवल वे लोग देख सकते हैं जिन्हें आपने गतिविधि देखने की अनुमति दी है। आपके पते या भुगतान की जानकारी आपकी अनुमति के बिना नहीं दिखेगी।',
	'Questions from the Care Circle': 'केयर सर्कल के सवाल', 'What happened': 'क्या हुआ', 'No updates yet.': 'अभी कोई नई जानकारी नहीं है।',
	'Demo driver on the way': 'डेमो ड्राइवर रास्ते में है', 'the destination': 'मंज़िल', 'Simulated: no real driver will arrive.': 'यह सिम्युलेटेड है: कोई वास्तविक ड्राइवर नहीं आएगा।',
	'Demo trip completed. No real trip took place.': 'डेमो यात्रा पूरी हुई। कोई वास्तविक यात्रा नहीं हुई।',
	'Waiting for approval': 'मंज़ूरी का इंतज़ार', 'Nothing is booked until an approver agrees.': 'मंज़ूरी देने वाले की सहमति तक कुछ बुक नहीं होगा।',
	'Ride cancelled': 'सवारी रद्द हुई', 'This demo ride was cancelled.': 'यह डेमो सवारी रद्द कर दी गई।',
	'Declined in the Care Circle': 'केयर सर्कल ने मना किया', 'An approver': 'मंज़ूरी देने वाले व्यक्ति', 'Nothing was booked or charged.': 'कुछ बुक नहीं हुआ और कोई राशि नहीं ली गई।',
	'Ride PIN (demo)': 'सवारी का पिन (डेमो)',
	'In a real ride you would say it to the driver in the car, never on a phone call.': 'असली सवारी में यह पिन कार में ड्राइवर को बताएँ, कभी फ़ोन पर नहीं।',
	'Demo driver': 'डेमो ड्राइवर', 'Call the demo driver': 'डेमो ड्राइवर को फ़ोन करें', 'Demo only: there is no driver to call.': 'केवल डेमो: फ़ोन करने के लिए कोई ड्राइवर नहीं है।', 'Route': 'रास्ता',
	'Preparing your order': 'आपका ऑर्डर तैयार हो रहा है',
	'The demo kitchen needs a few minutes, then a demo partner picks it up. Simulated: no real food is cooked or delivered.': 'डेमो रसोई को कुछ मिनट लगेंगे, फिर डेमो साथी इसे लेगा। यह सिम्युलेटेड है: कोई वास्तविक भोजन नहीं पकाया या पहुँचाया जाता।',
	'Delivered (simulated)': 'पहुँचाया गया (सिम्युलेटेड)', 'Demo order completed. No real food was delivered.': 'डेमो ऑर्डर पूरा हुआ। कोई वास्तविक भोजन नहीं पहुँचाया गया।',
	'Nothing is ordered until an approver agrees.': 'मंज़ूरी देने वाले की सहमति तक कुछ ऑर्डर नहीं होगा।',
	'Order cancelled': 'ऑर्डर रद्द हुआ', 'This demo order was cancelled.': 'यह डेमो ऑर्डर रद्द कर दिया गया।',
	'Order failed': 'ऑर्डर असफल रहा', 'Nothing was ordered or charged.': 'कुछ ऑर्डर नहीं हुआ और कोई राशि नहीं ली गई।',
	'Due': 'समय हो गया', 'Delivering to': 'यहाँ पहुँचाया जाएगा', 'Demo delivery partner': 'डेमो डिलीवरी साथी',
	'Not a real person · picks up when the food is ready': 'असली व्यक्ति नहीं · भोजन तैयार होने पर लेता है',
	'Call the demo delivery partner': 'डेमो डिलीवरी साथी को फ़ोन करें', 'Demo only: there is no delivery partner to call.': 'केवल डेमो: फ़ोन करने के लिए कोई डिलीवरी साथी नहीं है।',
	'Demo map · not live': 'डेमो नक्शा · लाइव नहीं', 'Simulated payment': 'सिम्युलेटेड भुगतान', 'Payment successful': 'भुगतान सफल हुआ',
	'Simulated payment only. No real money was charged.': 'केवल सिम्युलेटेड भुगतान। कोई वास्तविक राशि नहीं ली गई।', 'Back to booking': 'बुकिंग पर वापस जाएँ',
	'Sent for approval. Nothing is booked or charged yet.': 'मंज़ूरी के लिए भेजा गया। अभी कुछ बुक नहीं हुआ और कोई राशि नहीं ली गई।',
	'The booking failed. Nothing was booked or charged.': 'बुकिंग असफल रही। कुछ बुक नहीं हुआ और कोई राशि नहीं ली गई।',
	'Simulated failure. Nothing was booked or charged.': 'सिम्युलेटेड असफलता। कुछ बुक नहीं हुआ और कोई राशि नहीं ली गई।',
	'The approval request expired. Nothing was booked or charged.': 'मंज़ूरी के अनुरोध का समय समाप्त हुआ। कुछ बुक नहीं हुआ और कोई राशि नहीं ली गई।',
	'a pharmacy order': 'दवा का एक ऑर्डर',
	'Paid from the demo wallet (simulated)': 'डेमो वॉलेट से भुगतान हुआ (सिम्युलेटेड)',
	'No money was charged.': 'कोई राशि नहीं ली गई।',
	'Nothing charged yet. No real money will move.': 'अभी कोई राशि नहीं ली गई। कोई वास्तविक लेन-देन नहीं होगा।',
	'Simulated refund recorded': 'सिम्युलेटेड रिफ़ंड दर्ज हुआ',
	'No real money moved either way.': 'किसी भी दिशा में कोई वास्तविक लेन-देन नहीं हुआ।',
	'Cancelled by the owner (simulated).': 'मालिक ने रद्द किया (सिम्युलेटेड)।',
	'The demo provider marked it finished.': 'डेमो सेवा ने इसे पूरा दर्ज किया।',
	'Simulated payment marked complete': 'सिम्युलेटेड भुगतान पूरा दर्ज हुआ',
	'No real money moved.': 'कोई वास्तविक लेन-देन नहीं हुआ।',
	'Sent to the demo provider.': 'डेमो सेवा को भेज दिया गया।',
	'Simulated: no real driver will come.': 'यह सिम्युलेटेड है: कोई वास्तविक ड्राइवर नहीं आएगा।',
	'Nothing was booked.': 'कुछ बुक नहीं हुआ।',
	'No one in the Care Circle can approve yet.': 'केयर सर्कल में अभी कोई मंज़ूरी नहीं दे सकता।',
	'That saved place is no longer there.': 'वह सहेजी हुई जगह अब उपलब्ध नहीं है।',
	'Add your home or usual pickup in setup first.': 'पहले सेटअप में अपना घर या सामान्य पिकअप की जगह जोड़ें।',
	'That appointment is no longer saved.': 'वह अपॉइंटमेंट अब सहेजी हुई नहीं है।',
	'Choose where you would like to go.': 'चुनें कि आप कहाँ जाना चाहते हैं।',
	'Choose a kitchen first.': 'पहले रसोई चुनें।',
	'Booking not found.': 'बुकिंग नहीं मिली।',
	'This confirmation was already used for another booking.': 'इस पुष्टि का इस्तेमाल किसी अन्य बुकिंग के लिए हो चुका है।',
	'Quote not found. Please get a new quote.': 'कीमत का प्रस्ताव नहीं मिला। कृपया नया प्रस्ताव लें।',
	'This quote was already used. See Activity for the booking.': 'इस कीमत के प्रस्ताव का इस्तेमाल हो चुका है। बुकिंग गतिविधि में देखें।',
	'This quote has expired. Please get a new quote.': 'यह कीमत अब मान्य नहीं है। कृपया नई कीमत लें।',
	'This request is no longer waiting for approval.': 'यह अनुरोध अब मंज़ूरी के इंतज़ार में नहीं है।',
	'This approval request has expired. Nothing was booked.': 'मंज़ूरी के इस अनुरोध का समय समाप्त हो गया। कुछ बुक नहीं हुआ।',
	'This booking can no longer be cancelled.': 'यह बुकिंग अब रद्द नहीं की जा सकती।',
	'Only a confirmed booking can be completed.': 'केवल पुष्टि की गई बुकिंग को पूरा दर्ज किया जा सकता है।',
	'Only a pending simulated payment can be marked complete.': 'केवल बाकी सिम्युलेटेड भुगतान को पूरा दर्ज किया जा सकता है।',
	'This quote belongs to another demo provider.': 'यह कीमत किसी अन्य डेमो सेवा की है।',
	'A completed booking cannot be cancelled.': 'पूरी हो चुकी बुकिंग रद्द नहीं की जा सकती।',
	'A cancelled booking cannot be completed.': 'रद्द बुकिंग को पूरा नहीं किया जा सकता।',
	'The demo provider has no booking with that number.': 'डेमो सेवा के पास इस नंबर की कोई बुकिंग नहीं है।',
	'Choose at least one item.': 'कम से कम एक चीज़ चुनें।',
	'List each item once and change its quantity.': 'हर चीज़ को एक बार चुनें और उसकी मात्रा बदलें।',
	'Choose items from the demo catalogue.': 'डेमो सूची से चीज़ें चुनें।',
	'Choose one of the listed ride options.': 'सूची में दी गई एक सवारी चुनें।',
	'Choose a pickup and a destination.': 'पिकअप और मंज़िल चुनें।',
	'Pickup and destination are the same place.': 'पिकअप और मंज़िल एक ही जगह हैं।',
	'Choose one of the listed kitchens.': 'सूची में दी गई एक रसोई चुनें।',
	'Use the demo pharmacy.': 'डेमो दवा की दुकान का इस्तेमाल करें।',
	'Please check the form and try again.': 'कृपया फ़ॉर्म जाँचें और फिर कोशिश करें।',
	'web': 'वेब', 'phone': 'फ़ोन', 'voice': 'आवाज़',
}

// Only application/server-generated copy belongs here. Never pass user messages,
// names or addresses. Captured destinations, references and names stay unchanged.
export function bookingCopy(value: string | null | undefined, t: Translate, text: (value: string) => string): string {
	if (!value) return ''
	let match: RegExpMatchArray | null
	const prefixes: Record<string, string> = { 'Booked (simulated)': 'बुक हुआ (सिम्युलेटेड)', 'Booking failed': 'बुकिंग असफल रही', 'Approval needed': 'मंज़ूरी चाहिए', 'Approval request expired': 'मंज़ूरी के अनुरोध का समय समाप्त', 'Cancelled': 'रद्द', 'Completed (simulated)': 'पूरा हुआ (सिम्युलेटेड)' }
	if ((match = value.match(/^([^:]+): (.+)$/)) && prefixes[match[1]])
		return `${t(match[1], prefixes[match[1]])}: ${bookingCopy(match[2], t, text)}`
	if ((match = value.match(/^(.+)\. Simulated: no real driver will come\.$/)))
		return t('{{booking}}. Simulated: no real driver will come.', '{{booking}}। यह सिम्युलेटेड है: कोई वास्तविक ड्राइवर नहीं आएगा।', { booking: bookingCopy(match[1], t, text) })
	if ((match = value.match(/^(Demo Ride|Rapido Auto|Ola Mini|Uber Go) to (.+)$/)))
		return t('{{option}} to {{destination}}', '{{destination}} तक {{option}}', { option: text(match[1]), destination: match[2] })
	if ((match = value.match(/^(.+) from (Saathi Demo Kitchen|Demo Tiffin Kitchen|Demo Home Kitchen|Demo Thali House)$/)))
		return t('{{items}} from {{kitchen}}', '{{kitchen}} से {{items}}', { items: bookingCopy(match[1], t, text), kitchen: text(match[2]) })
	if ((match = value.match(/^(.+) and (\d+) more$/)) && bookingText[match[1]])
		return t('{{item}} and {{count}} more', '{{item}} और {{count}} अन्य', { item: text(match[1]), count: match[2] })
	if ((match = value.match(/^(.+) × (\d+)$/)) && bookingText[match[1]])
		return `${text(match[1])} × ${match[2]}`
	if ((match = value.match(/^Distance, ([\d.]+) km at ₹([\d,]+)\/km$/)))
		return t('Distance, {{km}} km at ₹{{rate}}/km', 'दूरी, {{km}} किमी, ₹{{rate}}/किमी की दर से', { km: match[1], rate: match[2] })
	if ((match = value.match(/^Above the ₹([\d,]+) approval limit\.$/)))
		return t('Above the ₹{{limit}} approval limit.', '₹{{limit}} की मंज़ूरी सीमा से अधिक।', { limit: match[1] })
	if ((match = value.match(/^(The only option|Lowest price and shortest wait|Lowest price|Shortest wait|Best balance of price and wait): (₹[\d,.]+), (about (\d+) min away|delivered in about (\d+) min)\.$/)))
		return t('{{reason}}: {{amount}}, {{when}}.', '{{reason}}: {{amount}}, {{when}}।', { reason: text(match[1]), amount: match[2], when: match[4] ? t('about {{minutes}} min away', 'लगभग {{minutes}} मिनट दूर', { minutes: match[4] }) : t('delivered in about {{minutes}} min', 'लगभग {{minutes}} मिनट में डिलीवरी', { minutes: match[5] }) })
	if ((match = value.match(/^Demo (order placed|booking confirmed): (.+)\. No real (food|driver) will come and no money moves\.$/)))
		return match[1] === 'order placed'
			? t('Demo order placed: {{id}}. No real food will come and no money moves.', 'डेमो ऑर्डर दिया गया: {{id}}। कोई वास्तविक भोजन नहीं आएगा और कोई लेन-देन नहीं होगा।', { id: match[2] })
			: t('Demo booking confirmed: {{id}}. No real driver will come and no money moves.', 'डेमो बुकिंग की पुष्टि हुई: {{id}}। कोई वास्तविक ड्राइवर नहीं आएगा और कोई लेन-देन नहीं होगा।', { id: match[2] })
	if ((match = value.match(/^The (Demo Ride Provider|Demo Food Provider|Demo Pharmacy Provider) could not take this booking \(simulated failure\)\. Nothing was booked or charged\.$/)))
		return t('The {{provider}} could not take this booking (simulated failure). Nothing was booked or charged.', '{{provider}} यह बुकिंग नहीं ले सका (सिम्युलेटेड असफलता)। कुछ बुक नहीं हुआ और कोई राशि नहीं ली गई।', { provider: text(match[1]) })
	if ((match = value.match(/^Connect the (.+) first, in Services\.$/)))
		return t('Connect the {{provider}} first, in Services.', 'पहले सेवाओं में {{provider}} जोड़ें।', { provider: text(match[1]) })
	if ((match = value.match(/^(.+) is switched off in Services\.$/)))
		return t('{{provider}} is switched off in Services.', 'सेवाओं में {{provider}} बंद है।', { provider: text(match[1]) })
	if ((match = value.match(/^The (Demo Ride Provider|Demo Food Provider|Demo Pharmacy Provider) cannot quote this request\.$/)))
		return t('The {{provider}} cannot quote this request.', '{{provider}} इस अनुरोध के लिए कीमत नहीं दे सकता।', { provider: text(match[1]) })
	if ((match = value.match(/^(Demo Ride Provider|Demo Food Provider|Demo Pharmacy Provider) · (.+?)\. (.+)$/)))
		return `${text(match[1])} · ${match[2]}. ${text(match[3])}`
	if ((match = value.match(/^(.+) No one in the Care Circle can approve yet\.$/)))
		return `${bookingCopy(match[1], t, text)} ${text('No one in the Care Circle can approve yet.')}`
	if ((match = value.match(/^Ride for (.+) is waiting for approval$/)))
		return t('Ride for {{title}} is waiting for approval', '{{title}} के लिए सवारी मंज़ूरी के इंतज़ार में है', { title: match[1] })
	if ((match = value.match(/^Ride for (.+) was cancelled$/)))
		return t('Ride for {{title}} was cancelled', '{{title}} के लिए सवारी रद्द हो गई', { title: match[1] })
	if ((match = value.match(/^Ride arranged for (.+)$/)))
		return t('Ride arranged for {{title}}', '{{title}} के लिए सवारी की व्यवस्था हुई', { title: match[1] })
	if ((match = value.match(/^No ride booked for (.+)$/)))
		return t('No ride booked for {{title}}', '{{title}} के लिए कोई सवारी बुक नहीं हुई', { title: match[1] })
	return text(value)
}

// Keep the shared runner's busy/error handling, but localize known booking errors
// before it displays them. Unexpected errors retain their original diagnostic text.
export async function bookingAction(action: () => Promise<void>, t: Translate, text: (value: string) => string): Promise<void> {
	try {
		await action()
	} catch (error) {
		if (error instanceof Error) throw new Error(bookingCopy(error.message, t, text))
		throw error
	}
}