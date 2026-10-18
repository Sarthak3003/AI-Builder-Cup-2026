import { setupText } from './setup'
import { bookingText } from './booking'
import { careText } from './care'

// Application-generated copy only, never user messages, transcripts, names or addresses.
// These modules are data-only at runtime (booking's i18n import is type-only).
// Match useI18n's precedence so direct callers get the same exact translations.
export const systemText: Record<string, string> = {
	...careText,
	...bookingText,
	...setupText,
	'Activity': 'गतिविधि',
	'Activity details': 'गतिविधि की जानकारी',
	'Join a Care Circle': 'केयर सर्कल से जुड़ें',
	'Set up Saathi': 'साथी का सेटअप करें',
	'Profile': 'प्रोफ़ाइल',
	'About': 'परिचय',
	'Approvals': 'मंज़ूरियाँ',
	'Conversations': 'बातचीत',
	'Safety': 'सुरक्षा',
	'Care Circle settings': 'केयर सर्कल की सेटिंग्स',
	'setup profile saved': 'सेटअप की प्रोफ़ाइल सहेजी गई',
	'demo reset meera': 'Meera का डेमो फिर शुरू किया गया',
	'demo reset fresh': 'नया डेमो शुरू किया गया',
	'setup welcome saved': 'स्वागत चरण सहेजा गया',
	'setup accessibility saved': 'सुविधा की सेटिंग्स सहेजी गईं',
	'setup places saved': 'जगहों का चरण सहेजा गया',
	'setup care circle saved': 'केयर सर्कल का चरण सहेजा गया',
	'setup care circle skipped': 'केयर सर्कल का चरण छोड़ा गया',
	'setup services saved': 'सेवाओं का चरण सहेजा गया',
	'setup services skipped': 'सेवाओं का चरण छोड़ा गया',
	'setup payment saved': 'भुगतान का चरण सहेजा गया',
	'Session expired. Start a new session.': 'सत्र का समय समाप्त हो गया। नया सत्र शुरू करें।',
	'Start a demo session first.': 'पहले डेमो सत्र शुरू करें।',
	'Start a new demo session first.': 'पहले नया डेमो सत्र शुरू करें।',
	'Invalid session.': 'सत्र मान्य नहीं है।',
	'Open Saathi directly to make changes.': 'बदलाव करने के लिए साथी को सीधे खोलें।',
	'Not available.': 'उपलब्ध नहीं है।',
	'Conversation not found.': 'बातचीत नहीं मिली।',
	'Only the account owner can read phone sessions.': 'केवल खाता धारक फ़ोन सत्र देख सकते हैं।',
	'Choose each listed app at most once.': 'सूची में दिए हर ऐप को अधिकतम एक बार चुनें।',
	'Choose each listed permission at most once.': 'सूची में दी हर अनुमति को अधिकतम एक बार चुनें।',
	'This local prototype does not use cloud storage.': 'यह स्थानीय प्रोटोटाइप क्लाउड स्टोरेज इस्तेमाल नहीं करता।',
	'Firestore environment changed. Restart Saathi.': 'Firestore का परिवेश बदल गया है। साथी फिर शुरू करें।',
	'Firestore configuration changed. Restart the server.': 'Firestore की सेटिंग बदल गई है। सर्वर फिर शुरू करें।',
	'Start the local Firestore emulator to use this demo.': 'इस डेमो के लिए स्थानीय Firestore एमुलेटर शुरू करें।',
	'Activity storage is unavailable. Please retry.': 'गतिविधि का स्टोरेज उपलब्ध नहीं है। कृपया फिर कोशिश करें।',
	'Request not found in this session.': 'इस सत्र में अनुरोध नहीं मिला।',
	'Choose an option offered for this request.': 'इस अनुरोध के लिए दिया गया विकल्प चुनें।',
	'This request already has a different confirmed meal.': 'इस अनुरोध में पहले ही किसी अन्य भोजन की पुष्टि हो चुकी है।',
	'No confirmed activity found for this request.': 'इस अनुरोध के लिए पुष्टि की गई गतिविधि नहीं मिली।',
	'Gemini is not configured. Switch to offline demo mode.': 'Gemini सेट नहीं है। ऑफ़लाइन डेमो मोड चुनें।',
	'Gemini is not configured yet. Add the API key on the server.': 'Gemini अभी सेट नहीं है। सर्वर पर API कुंजी जोड़ें।',
	'Gemini model configuration is invalid.': 'Gemini मॉडल की सेटिंग मान्य नहीं है।',
	'Invalid Gemini model configuration.': 'Gemini मॉडल की सेटिंग मान्य नहीं है।',
	'Gemini could not understand this request. Please retry.': 'Gemini यह अनुरोध नहीं समझ सका। कृपया फिर कोशिश करें।',
	"Gemini's request quota is busy or exhausted. Please try later.": 'Gemini की अनुरोध सीमा व्यस्त है या खत्म हो गई है। कृपया बाद में कोशिश करें।',
	'Gemini access or model configuration needs attention.': 'Gemini की पहुँच या मॉडल की सेटिंग ठीक करनी होगी।',
	'Gemini rejected this input. Try typing your request or recording it again.': 'Gemini ने यह इनपुट स्वीकार नहीं किया। अनुरोध लिखें या फिर रिकॉर्ड करें।',
	'Gemini is temporarily unavailable. Please try later.': 'Gemini अभी उपलब्ध नहीं है। कृपया बाद में कोशिश करें।',
	'Gemini took too long to respond. Please try again.': 'Gemini को जवाब देने में बहुत समय लगा। कृपया फिर कोशिश करें।',
	'Could not connect to Gemini. Please try later.': 'Gemini से जुड़ नहीं सके। कृपया बाद में कोशिश करें।',
	'Gemini returned an incomplete response. Please try again.': 'Gemini ने अधूरा जवाब दिया। कृपया फिर कोशिश करें।',
	'Gemini could not respond. Please try again.': 'Gemini जवाब नहीं दे सका। कृपया फिर कोशिश करें।',
	'Gemini is not configured, so voice uses the browser.': 'Gemini सेट नहीं है, इसलिए आवाज़ के लिए ब्राउज़र इस्तेमाल होता है।',
	'Please wait a minute before another AI request.': 'एआई को अगला अनुरोध देने से पहले एक मिनट रुकें।',
	'Send the recording as base64 WAV audio.': 'रिकॉर्डिंग base64 WAV ऑडियो के रूप में भेजें।',
	'Sorry, I could not hear that. Please try again.': 'माफ़ करें, सुनाई नहीं दिया। कृपया फिर कोशिश करें।',
	'Microphone permission was refused. Allow it in the browser, or type instead.': 'माइक्रोफ़ोन की अनुमति नहीं मिली। ब्राउज़र में अनुमति दें या लिखकर बताएँ।',
	'I did not hear anything. Tap the microphone and try again.': 'कुछ सुनाई नहीं दिया। माइक्रोफ़ोन पर टैप करके फिर कोशिश करें।',
	'Microphone unavailable. You can type your request instead.': 'माइक्रोफ़ोन उपलब्ध नहीं है। आप अपना अनुरोध लिख सकते हैं।',
	'Voice could not start. Please type instead.': 'आवाज़ की सुविधा शुरू नहीं हो सकी। कृपया लिखकर बताएँ।',
	'Cannot connect to Saathi.': 'साथी से कनेक्ट नहीं हो पा रहा है।',
	'Please check your request and try again.': 'कृपया अपना अनुरोध जाँचें और फिर कोशिश करें।',
	'Something went wrong. Please try again.': 'कुछ गड़बड़ हो गई। कृपया फिर कोशिश करें।',
	'Please try again.': 'कृपया फिर कोशिश करें।',
	'API unavailable': 'API उपलब्ध नहीं है',
	'Unexpected API response': 'API से अनपेक्षित जवाब मिला',
	'More details needed': 'अधिक जानकारी चाहिए',
	'Meals that suit you': 'आपकी पसंद के भोजन',
	'Sample pharmacy items': 'फ़ार्मेसी की नमूना चीज़ें',
	'Saathi cannot respond to emergencies. Contact local emergency services or a trusted person directly. No request was placed.': 'साथी आपातकाल में सहायता नहीं दे सकता। स्थानीय आपातकालीन सेवाओं या किसी भरोसेमंद व्यक्ति से सीधे संपर्क करें। कोई अनुरोध नहीं किया गया।',
	'Sorry, I could not tell whether you need a ride, food or medicine. Try “Take me to the market” or “Order something light to eat”.': 'माफ़ करें, समझ नहीं आया कि आपको सवारी, भोजन या दवा चाहिए। कहें “मुझे बाज़ार ले चलो” या “खाने के लिए कुछ हल्का मँगाओ”।',
	'Do you need a ride, food or medicine? Please say just one, or tap a choice below.': 'क्या आपको सवारी, भोजन या दवा चाहिए? कृपया एक ही चीज़ बताएँ या नीचे कोई विकल्प चुनें।',
	"Where would you like to go? Try “Take me to Dr Mehta's clinic”.": 'आप कहाँ जाना चाहेंगे? कहें “मुझे Dr Mehta के क्लिनिक ले चलो”।',
	'This sounds like it could be a scam. Never share an OTP, PIN or bank details, and check with someone you trust. Saathi did not do anything.': 'यह धोखाधड़ी हो सकती है। कभी OTP, PIN या बैंक की जानकारी साझा न करें और किसी भरोसेमंद व्यक्ति से पुष्टि करें। साथी ने कोई कार्रवाई नहीं की।',
	'The demo pharmacy only has sample non-prescription items, such as ORS sachets, a crepe bandage or a thermometer. It cannot order prescription medicines.': 'डेमो फ़ार्मेसी में केवल बिना पर्चे की नमूना चीज़ें हैं, जैसे ORS पाउच, क्रेप पट्टी या थर्मामीटर। इससे पर्चे वाली दवाएँ नहीं मँगाई जा सकतीं।',
	'Demo meals cannot verify medical diets or allergens.': 'डेमो भोजन में चिकित्सकीय आहार की ज़रूरतों या एलर्जी पैदा करने वाली चीज़ों की जाँच नहीं की जा सकती।',
	'Could you tell me a little more about this request?': 'क्या आप इस अनुरोध के बारे में थोड़ी और जानकारी दे सकते हैं?',
	'This call cannot be paired now.': 'इस कॉल को अभी ऐप से नहीं जोड़ा जा सकता।',
	'Too many pairing attempts.': 'जोड़ने की बहुत ज़्यादा कोशिशें हुई हैं।',
	'That pairing code is invalid or expired.': 'जोड़ने का वह कोड मान्य नहीं है या उसकी समय सीमा समाप्त हो गई है।',
	'Phone calling is not configured.': 'फ़ोन कॉल की सुविधा सेट नहीं है।',
	'Use a Twilio form webhook.': 'Twilio फ़ॉर्म वेबहुक इस्तेमाल करें।',
	'Webhook is too large.': 'वेबहुक बहुत बड़ा है।',
	'Invalid webhook form.': 'वेबहुक फ़ॉर्म मान्य नहीं है।',
	'Duplicate webhook parameters.': 'वेबहुक पैरामीटर दोहराए गए हैं।',
	'Invalid provider signature.': 'प्रदाता का हस्ताक्षर मान्य नहीं है।',
	'Invalid provider account or call.': 'प्रदाता का खाता या कॉल मान्य नहीं है।',
	'Only incoming calls are accepted.': 'केवल आने वाली कॉल स्वीकार की जाती हैं।',
	'Input is too long.': 'दी गई जानकारी बहुत लंबी है।',
	'Invalid call step.': 'कॉल का चरण मान्य नहीं है।',
	'This call expired. Please call again for a new request.': 'इस कॉल का समय समाप्त हो गया। नए अनुरोध के लिए फिर कॉल करें।',
	'This call cannot continue. Please open Saathi and pair again.': 'यह कॉल जारी नहीं रह सकती। कृपया साथी खोलें और फिर से जोड़ें।',
	'This call has ended. Check Activity in your Saathi app.': 'यह कॉल समाप्त हो गई है। अपने साथी ऐप में गतिविधि देखें।',
	'The call limit has been reached. Please call again later.': 'कॉल की सीमा पूरी हो गई है। कृपया बाद में फिर कॉल करें।',
	'Pairing could not continue. Please call again later.': 'जोड़ने की प्रक्रिया जारी नहीं रह सकी। कृपया बाद में फिर कॉल करें।',
	'This call cannot continue. Check Activity before trying again.': 'यह कॉल जारी नहीं रह सकती। फिर कोशिश करने से पहले गतिविधि देखें।',
	'The call could not continue. Check Activity in Saathi before trying again.': 'कॉल जारी नहीं रह सकी। फिर कोशिश करने से पहले साथी में गतिविधि देखें।',
	'Sorry, the call service had a problem. Check Activity in Saathi before trying again.': 'माफ़ करें, कॉल सेवा में समस्या हुई। फिर कोशिश करने से पहले साथी में गतिविधि देखें।',
	'That code is invalid or expired. Enter a new app code, then hash, or press 0 then hash for guest mode.': 'वह कोड मान्य नहीं है या उसकी समय सीमा समाप्त हो गई है। ऐप का नया कोड डालकर # दबाएँ। अतिथि मोड के लिए 0 फिर # दबाएँ।',
	'Press 9 to repeat, or 0 to end the call.': 'दोहराने के लिए 9 या कॉल समाप्त करने के लिए 0 दबाएँ।',
	'Press 1 to confirm.': 'पुष्टि के लिए 1 दबाएँ।',
	'That turn is out of date. Repeat the current question.': 'बातचीत का वह चरण पुराना हो गया है। मौजूदा सवाल दोहराएँ।',
	'How can Saathi help? All bookings are simulated.': 'साथी कैसे मदद कर सकता है? सभी बुकिंग सिम्युलेटेड हैं।',
	'This conversation expired. Start a new conversation; nothing new was booked.': 'इस बातचीत का समय समाप्त हो गया। नई बातचीत शुरू करें; कोई नई बुकिंग नहीं हुई।',
	'The conversation has ended. No further booking will be made.': 'बातचीत समाप्त हो गई है। अब कोई और बुकिंग नहीं होगी।',
	'I could not hear you. Please try again when you are ready. Goodbye.': 'आपकी आवाज़ सुनाई नहीं दी। तैयार होने पर फिर कोशिश करें। नमस्ते।',
	'Please do not share payment details or verification codes. Repeat your request without them.': 'कृपया भुगतान की जानकारी या सत्यापन कोड साझा न करें। इनके बिना अपना अनुरोध दोहराएँ।',
	'Please say yes, confirm, or no. You can also change your request.': 'कृपया हाँ, पुष्टि करें या नहीं कहें। आप अपना अनुरोध बदल भी सकते हैं।',
	'Guest mode cannot book. Pair with your Saathi app to continue.': 'अतिथि मोड में बुकिंग नहीं हो सकती। आगे बढ़ने के लिए अपना साथी ऐप जोड़ें।',
	'Guest mode uses no private profile and cannot book. You can try a demo quote. Do you need a ride or a meal?': 'अतिथि मोड निजी प्रोफ़ाइल इस्तेमाल नहीं करता और बुकिंग नहीं कर सकता। आप डेमो कीमत देख सकते हैं। क्या आपको सवारी या भोजन चाहिए?',
	'That quote expired or changed. Please start a new request for a fresh price.': 'उस कीमत की समय सीमा समाप्त हो गई या वह बदल गई है। नई कीमत के लिए नया अनुरोध शुरू करें।',
	'This demo booking could not be confirmed. Check your app before retrying.': 'इस डेमो बुकिंग की पुष्टि नहीं हो सकी। फिर कोशिश करने से पहले अपना ऐप जाँचें।',
	'Those prices have expired. Please call again for a fresh quote.': 'उन कीमतों की समय सीमा समाप्त हो गई है। नई कीमत के लिए फिर कॉल करें।',
	'Medicine ordering is not available in this conversation. Do you need a ride or a meal?': 'इस बातचीत में दवा मँगाना उपलब्ध नहीं है। क्या आपको सवारी या भोजन चाहिए?',
	'I do not have a saved home address. What is the pickup address?': 'घर का पता सहेजा हुआ नहीं है। पिकअप का पता क्या है?',
	'What is the pickup address? Say the street and a landmark.': 'पिकअप का पता क्या है? सड़क और पास की किसी पहचान वाली जगह का नाम बताएँ।',
	'Please say the destination name or address.': 'कृपया मंज़िल का नाम या पता बताएँ।',
	'That place is not saved. What is its name or address?': 'वह जगह सहेजी हुई नहीं है। उसका नाम या पता क्या है?',
	'What is the new pickup place?': 'पिकअप की नई जगह क्या है?',
	'Where should I pick you up?': 'आपको कहाँ से लेना है?',
	'Where would you like to go?': 'आप कहाँ जाना चाहेंगे?',
	'What would you like to eat?': 'आप क्या खाना चाहेंगे?',
	'What would you like to eat? Say a meal or preferences, such as vegetarian.': 'आप क्या खाना चाहेंगे? भोजन या अपनी पसंद बताएँ, जैसे शाकाहारी।',
	'Do you need a ride or a meal?': 'क्या आपको सवारी या भोजन चाहिए?',
	'Sent to your Care Circle for approval. Nothing is booked or charged yet.': 'मंज़ूरी के लिए आपके देखभाल समूह को भेज दिया गया है। अभी कुछ बुक नहीं हुआ और कोई राशि नहीं ली गई।',
	'The demo provider could not confirm this booking. Nothing was booked or charged.': 'डेमो प्रदाता इस बुकिंग की पुष्टि नहीं कर सका। कुछ बुक नहीं हुआ और कोई राशि नहीं ली गई।',
	'This request was cancelled or declined. No new booking was made.': 'यह अनुरोध रद्द या अस्वीकार किया गया। कोई नई बुकिंग नहीं हुई।',
	'Enter your eight-digit app pairing code, then hash, or 0 then hash for guest.': 'ऐप का आठ अंकों का जोड़ने वाला कोड डालकर # दबाएँ। अतिथि मोड के लिए 0 फिर # दबाएँ।',
	'Welcome to Saathi, an AI assistant. All bookings are demos. Twilio transcribes speech; Gemini may interpret it. Saathi does not record audio. Enter your eight-digit app pairing code, then hash, or press 0 then hash for guest mode. Hindi ke liye 9 phir hash dabayein.': 'एआई सहायक साथी में आपका स्वागत है। सभी बुकिंग डेमो हैं। Twilio आवाज़ को पाठ में बदलता है; Gemini उसका अर्थ समझ सकता है। साथी ऑडियो रिकॉर्ड नहीं करता। ऐप का आठ अंकों का जोड़ने वाला कोड डालकर # दबाएँ। अतिथि मोड के लिए 0 फिर # दबाएँ। हिन्दी के लिए 9 फिर # दबाएँ।',
	'Your app has opted to save a redacted text transcript of this call.': 'आपके ऐप में इस कॉल का संवेदनशील जानकारी हटाया हुआ पाठ सहेजने का विकल्प चुना गया है।',
	'A text transcript will not be kept in your app.': 'इस कॉल का पाठ आपके ऐप में नहीं रखा जाएगा।',
}

const exact = (value: string): string | undefined => Object.hasOwn(systemText, value) ? systemText[value] : undefined
const label = (value: string): string => exact(value) ?? value
const MAX_TEXT = 4096
const MAX_DEPTH = 4
const provider = '(Demo Ride Provider|Demo Food Provider|Demo Pharmacy Provider)'
const reference = '(DEMO-(?:RIDE|FOOD|PHARM)-[0-9]{1,12})'
const amount = '(₹[0-9]{1,3}(?:,[0-9]{2,3}){0,4}(?:\\.[0-9]{1,2})?|₹[0-9]{1,12}(?:\\.[0-9]{1,2})?)'
const opaque = '([^\\r\\n]{1,500})'
type Rule = readonly [RegExp, (match: RegExpExecArray) => string | undefined]

// Full matches only: JS's $ also matches before a trailing newline. Never trim input.
function full(pattern: RegExp, value: string): RegExpExecArray | null {
	const match = pattern.exec(value)
	return match?.[0] === value ? match : null
}

// Only these catalogue items can be translated inside a generated booking title.
// In particular, a destination named "Home", "Doctor" or "Demo Ride" stays verbatim.
const items = new Set([
	'Vegetable khichdi', 'Dal and rice', 'Paneer meal', 'Chicken and rice', 'Two rotis', 'Buttermilk', 'Mini veg thali', 'Fruit bowl',
	'ORS sachets, pack of 5 (sample)', 'Crepe bandage, 10 cm (sample)', 'Antiseptic liquid, 100 ml (sample)',
	'Digital thermometer (sample)', 'Pain relief balm, 25 g (sample)', 'Calcium supplement, 15 tablets (sample)', 'Hand sanitiser, 100 ml (sample)',
])
function itemCopy(value: string): string | undefined {
	if (items.has(value)) return label(value)
	const match = full(/^([^\r\n]{1,100}) (?:and ([0-9]{1,2}) more|× ([0-9]{1,2}))$/, value)
	if (!match || !items.has(match[1])) return undefined
	return match[2] ? `${label(match[1])} और ${match[2]} अन्य` : `${label(match[1])} × ${match[3]}`
}
function titleCopy(value: string): string | undefined {
	let match = full(/^(Demo Ride|Rapido Auto|Ola Mini|Uber Go) to ([^\r\n]{1,150})$/, value)
	if (match) return `${match[2]} तक ${label(match[1])}`
	match = full(/^([^\r\n]{1,140}) from (Saathi Demo Kitchen|Demo Tiffin Kitchen|Demo Home Kitchen|Demo Thali House)$/, value)
	if (match) {
		const dish = itemCopy(match[1])
		return dish === undefined ? undefined : `${label(match[2])} से ${dish}`
	}
	if (value === 'a pharmacy order' || value === 'Pharmacy order (details not shared)') return label(value)
	if (value === 'the pharmacy order') return 'दवा का ऑर्डर'
	return itemCopy(value)
}
const title = (value: string): string => titleCopy(value) ?? value

const steps = ['Welcome', 'Comfort and accessibility', 'Saved places', 'Care Circle', 'Demo services', 'Payment (simulated)', 'Review and finish']
const permissions = [
	'See shared rides, orders and appointments', 'Add and change reminders and appointments', 'Help edit saved addresses',
	'Approve or decline requests sent for approval', 'Read conversation summaries', 'Receive safety alerts',
	'Invite and remove other caretakers', 'See saved medicine details', 'Read full conversation transcripts',
	'See simulated payment status', 'Change emergency contacts',
]
// Do not split on commas: permission descriptions themselves contain commas.
// Consume a finite vocabulary, and fail closed if even one entry is unknown.
function listed(value: string, choices: readonly string[]): string | undefined {
	const result: string[] = []
	const seen = new Set<string>()
	let rest = value
	for (let n = 0; n < choices.length; n++) {
		const found = choices.find(choice => !seen.has(choice) && (rest === choice || rest.startsWith(`${choice}, `)))
		if (!found) return undefined
		seen.add(found)
		result.push(label(found))
		if (rest === found) return result.join(', ')
		rest = rest.slice(found.length + 2)
	}
	return undefined
}

const rules: readonly Rule[] = [
	[/^Finish these steps first: ([^\r\n]{1,250})\.$/, m => {
		const translated = listed(m[1], steps)
		return translated === undefined ? undefined : `पहले ये चरण पूरे करें: ${translated}।`
	}],
	[/^You already have a place called ([^\r\n]{1,40})\.$/, m => `${m[1]} नाम की जगह पहले से सहेजी हुई है।`],
	[/^No demo meals fit within ₹([0-9]{1,5})\. Try a larger budget or the menus\.$/, m => `₹${m[1]} के बजट में कोई डेमो भोजन नहीं है। बजट बढ़ाएँ या मेन्यू देखें।`],
	[new RegExp(`^Connect the ${provider} first, in Services\\.$`), m => `पहले सेवाओं में ${label(m[1])} जोड़ें।`],
	[/^(Demo Ride Provider|Demo Food Provider|Demo Pharmacy Provider|Uber|Ola|Rapido|Uber Eats|Swiggy|Zomato) is switched off in Services\.$/, m => `सेवाओं में ${label(m[1])} बंद है।`],
	[new RegExp(`^The ${provider} cannot quote this request\\.$`), m => `${label(m[1])} इस अनुरोध के लिए कीमत नहीं दे सकता।`],
	[new RegExp(`^The ${provider} could not take this booking \\(simulated failure\\)\\.( Nothing was booked or charged\\.)?$`), m => `${label(m[1])} यह बुकिंग नहीं ले सका (सिम्युलेटेड असफलता)।${m[2] ? ' कुछ बुक नहीं हुआ और कोई राशि नहीं ली गई।' : ''}`],
	[new RegExp(`^${provider} (accepted|cancelled|completed) this booking \\(simulated\\)\\.$`), m => `${label(m[1])} ने यह बुकिंग ${m[2] === 'accepted' ? 'स्वीकार की' : m[2] === 'cancelled' ? 'रद्द की' : 'पूरी की'} (सिम्युलेटेड)।`],
	[new RegExp(`^Your demo booking is confirmed: ${reference}\\. No money was charged\\.$`), m => `आपकी डेमो बुकिंग की पुष्टि हुई: ${m[1]}। कोई राशि नहीं ली गई।`],
	[new RegExp(`^Demo order placed: ${reference}\\. No real food will come and no money moves\\.$`), m => `डेमो ऑर्डर दिया गया: ${m[1]}। कोई वास्तविक भोजन नहीं आएगा और कोई लेन-देन नहीं होगा।`],
	[new RegExp(`^Demo booking confirmed: ${reference}\\. No real driver will come and no money moves\\.$`), m => `डेमो बुकिंग की पुष्टि हुई: ${m[1]}। कोई वास्तविक ड्राइवर नहीं आएगा और कोई लेन-देन नहीं होगा।`],
	[new RegExp(`^Above the ${amount} approval limit\\.$`), m => `${m[1]} की मंज़ूरी सीमा से अधिक।`],
	[/^Distance, ([0-9]{1,6}(?:\.[0-9]{1,2})?) km at ₹([0-9]{1,6})\/km$/, m => `दूरी, ${m[1]} किमी, ₹${m[2]}/किमी की दर से`],
	[new RegExp(`^(The only option|Lowest price and shortest wait|Lowest price|Shortest wait|Best balance of price and wait): ${amount}, (?:about ([0-9]{1,4}) min away|delivered in about ([0-9]{1,4}) min)\\.$`), m => `${label(m[1])}: ${m[2]}, लगभग ${m[3] || m[4]} मिनट ${m[3] ? 'दूर' : 'में डिलीवरी'}।`],
	[/^Already (approved|declined) by ([^\r\n]{1,60})\.$/, m => `${m[2]} पहले ही ${m[1] === 'approved' ? 'मंज़ूरी दे चुके हैं' : 'मना कर चुके हैं'}।`],
	[/^(Booked \(simulated\)|Booking failed|Approval needed|Approval request expired|Cancelled|Completed \(simulated\)): ([^\r\n]{1,500})$/, m => {
		const prefixes: Record<string, string> = { 'Booked (simulated)': 'बुक हुआ (सिम्युलेटेड)', 'Booking failed': 'बुकिंग असफल रही', 'Approval needed': 'मंज़ूरी चाहिए', 'Approval request expired': 'मंज़ूरी के अनुरोध का समय समाप्त', Cancelled: 'रद्द', 'Completed (simulated)': 'पूरा हुआ (सिम्युलेटेड)' }
		return `${prefixes[m[1]]}: ${title(m[2])}`
	}],
	[new RegExp(`^${provider} · ${reference}\\. ${opaque}$`), m => {
		const notices: Record<string, string> = { 'Demo Ride Provider': 'Demo ride — no real driver will arrive.', 'Demo Food Provider': 'Demo order — no real food will be delivered.', 'Demo Pharmacy Provider': 'Demo pharmacy order — sample non-prescription items only. Nothing will be delivered, and this is not medical advice.' }
		return m[3] === notices[m[1]] ? `${label(m[1])} · ${m[2]}। ${label(m[3])}` : undefined
	}],
	[new RegExp(`^${opaque}\\. Simulated: no real driver will come\\.$`), m => titleCopy(m[1]) === undefined ? undefined : `${title(m[1])}। यह सिम्युलेटेड है: कोई वास्तविक ड्राइवर नहीं आएगा।`],
	[/^Ride for ([^\r\n]{1,100}) is waiting for approval$/, m => `${m[1]} के लिए सवारी मंज़ूरी के इंतज़ार में है`],
	[/^Ride for ([^\r\n]{1,100}) was cancelled$/, m => `${m[1]} के लिए सवारी रद्द हो गई`],
	[/^Ride arranged for ([^\r\n]{1,100})$/, m => `${m[1]} के लिए सवारी की व्यवस्था हुई`],
	[/^No ride booked for ([^\r\n]{1,100})$/, m => `${m[1]} के लिए कोई सवारी बुक नहीं हुई`],
	[new RegExp(`^Booked ${opaque} with the ${provider} \\(simulated\\)\\.$`), m => `${label(m[2])} से ${title(m[1])} बुक हुआ (सिम्युलेटेड)।`],
	[new RegExp(`^${opaque} with the ${provider} completed \\(simulated\\)\\.$`), m => `${label(m[2])} से ${title(m[1])} पूरा हुआ (सिम्युलेटेड)।`],
	[new RegExp(`^Sent ${opaque} for approval\\. Nothing is booked yet\\.$`), m => `${title(m[1])} मंज़ूरी के लिए भेजा गया। अभी कुछ बुक नहीं हुआ।`],
	[new RegExp(`^Booking ${opaque} failed\\. Nothing was booked or charged\\.$`), m => `${title(m[1])} की बुकिंग असफल रही। कुछ बुक नहीं हुआ और कोई राशि नहीं ली गई।`],
	[new RegExp(`^Cancelled ${opaque}\\.$`), m => titleCopy(m[1]) === undefined ? undefined : `${title(m[1])} रद्द हुआ।`],
	[new RegExp(`^${opaque} was declined in the Care Circle\\. Nothing was booked\\.$`), m => `देखभाल समूह ने ${title(m[1])} अस्वीकार किया। कुछ बुक नहीं हुआ।`],
	[/^Appointment (added|changed): ([^\r\n]{1,100})$/, m => `अपॉइंटमेंट ${m[1] === 'added' ? 'जोड़ा गया' : 'बदला गया'}: ${m[2]}`],
	[/^Trusted contact (added|removed): ([^\r\n]{1,60})$/, m => `भरोसेमंद संपर्क ${m[1] === 'added' ? 'जोड़ा गया' : 'हटाया गया'}: ${m[2]}`],
	[/^At ([^\r\n]{1,150})\. Added by ([^\r\n]{1,60})\.$/, m => `${m[1]} पर। ${m[2]} ने जोड़ा।`],
	[/^(Added|Changed|Removed) by ([^\r\n]{1,60})\.$/, m => `${m[2]} ने ${m[1] === 'Added' ? 'जोड़ा' : m[1] === 'Changed' ? 'बदला' : 'हटाया'}।`],
	[/^([^\r\n]{1,60}) was invited as (Viewer|Assistant|Approver|Administrator)$/, m => `${m[1]} को ${label(m[2])} के रूप में आमंत्रित किया गया`],
	[/^Access changed for ([^\r\n]{1,60})$/, m => `${m[1]} की पहुँच की अनुमति बदली गई`],
	[/^([^\r\n]{1,60}) no longer has access$/, m => `${m[1]} के पास अब पहुँच की अनुमति नहीं है`],
	[/^([^\r\n]{1,60}) joined the Care Circle$/, m => `${m[1]} देखभाल समूह में शामिल हुए`],
	[/^([^\r\n]{1,60}) asked if someone can come to ([^\r\n]{1,100})$/, m => `${m[1]} ने पूछा कि क्या कोई ${m[2]} पर साथ आ सकता है`],
	[/^([^\r\n]{1,60}) asked for help$/, m => `${m[1]} ने मदद माँगी`],
	[/^([^\r\n]{1,60}) (approved|declined|asked about) ([^\r\n]{1,500})$/, m => `${m[1]} ने ${title(m[3])} ${m[2] === 'approved' ? 'मंज़ूर किया' : m[2] === 'declined' ? 'अस्वीकार किया' : 'के बारे में पूछा'}`],
	[/^([^\r\n]{1,60}) mentioned an emergency$/, m => `${m[1]} ने आपातकाल का ज़िक्र किया`],
	[/^([^\r\n]{1,60}) shared a message that looks like a common scam\. Saathi did nothing\. This is a suspicion from word matching, not a confirmed scam\.$/, m => `${m[1]} ने ऐसा संदेश साझा किया जो आम धोखाधड़ी जैसा लगता है। साथी ने कोई कार्रवाई नहीं की। यह शब्दों के मिलान से हुआ संदेह है, धोखाधड़ी की पुष्टि नहीं।`],
	[/^([^\r\n]{1,60})'s last three requests in ten minutes needed more details\. Saathi has not assumed anything else\.$/, m => `दस मिनट में ${m[1]} के पिछले तीन अनुरोधों के लिए अधिक जानकारी चाहिए थी। साथी ने इसके अलावा कोई अनुमान नहीं लगाया है।`],
	[/^Rides to ([^\r\n]{1,150}) for ([^\r\n]{1,100})$/, m => `${m[2]} के लिए ${m[1]} तक सवारियाँ`],
	[/^Rides to ([^\r\n]{1,150})$/, m => `${m[1]} तक सवारियाँ`],
	[new RegExp(`^A demo estimate is ${amount}\\. Guest mode cannot book\\. Pair with your Saathi app to use saved places and make a demo booking\\.$`), m => `डेमो अनुमान ${m[1]} है। अतिथि मोड में बुकिंग नहीं हो सकती। सहेजी हुई जगहें इस्तेमाल करने और डेमो बुकिंग करने के लिए अपना साथी ऐप जोड़ें।`],
	[/^Hello, ([^\r\n]{1,60})\. You are paired\. Would you like a demo ride or a meal\?$/, m => `नमस्ते, ${m[1]}। आपका ऐप जुड़ गया है। क्या आपको डेमो सवारी या भोजन चाहिए?`],
]

function summary(value: string): string | undefined {
	// Parse the suffix before the opaque destination, which may itself contain periods.
	const match = full(/^(Asked for a ride to [^\r\n]{1,150}?\.|Asked for a meal\.|Asked for pharmacy items\.|Asked Saathi for help\.)(?: ([0-9]{1,3}) (quote was|quotes were) shown; nothing was booked\.| (The conversation ended without a booking\.|Saathi asked for more details; nothing was booked\.))?$/, value)
	if (!match) return undefined
	const ride = full(/^Asked for a ride to ([^\r\n]{1,150})\.$/, match[1])
	const base = ride ? `${ride[1]} तक सवारी माँगी।` : label(match[1])
	if (match[2]) {
		if ((match[2] === '1') !== (match[3] === 'quote was')) return undefined
		return `${base} ${match[2]} कीमत के प्रस्ताव दिखाए गए; कुछ बुक नहीं हुआ।`
	}
	if (match[4]) return `${base} ${match[4].startsWith('The conversation') ? 'बातचीत बिना बुकिंग के समाप्त हुई।' : 'साथी ने अधिक जानकारी माँगी; कुछ बुक नहीं हुआ।'}`
	return base
}

function known(value: string, depth: number): string | undefined {
	if (depth > MAX_DEPTH || value.length > MAX_TEXT || /[\r\n]/.test(value)) return undefined
	const direct = exact(value)
	if (direct !== undefined) return direct
	// Composite notices must have a recognised body; do not translate arbitrary prose.
	for (const suffix of [' No one in the Care Circle can approve yet.', ' Your app has opted to save a redacted text transcript of this call.', ' A text transcript will not be kept in your app.', ' Press 9 to repeat, or 0 to end the call.', ' Press 1 to confirm.']) {
		if (value.endsWith(suffix)) {
			const base = known(value.slice(0, -suffix.length), depth + 1)
			if (base !== undefined) return `${base} ${label(suffix.slice(1))}`
		}
	}
	for (const [prefix, translated] of [
		['I did not hear that. ', 'सुनाई नहीं दिया। '],
		['Please say the option number, or say cancel. ', 'कृपया विकल्प का नंबर बताएँ या रद्द करें कहें। '],
	]) {
		if (value.startsWith(prefix)) {
			const rest = known(value.slice(prefix.length), depth + 1)
			if (rest !== undefined) return translated + rest
		}
	}
	const confirmation = full(new RegExp(`^${opaque} costs ${amount}, including fees\\.(?: Pickup: ([^\\r\\n]{1,150})\\.)? This is a demo; no real service or charge occurs\\. Shall I confirm\\? Say yes, confirm, or no\\.$`), value)
	if (confirmation) {
		const booking = titleCopy(confirmation[1])
		if (booking !== undefined) return `${booking} की कीमत शुल्क सहित ${confirmation[2]} है।${confirmation[3] ? ` पिकअप: ${confirmation[3]}।` : ''} यह डेमो है; कोई वास्तविक सेवा या शुल्क नहीं है। क्या पुष्टि करूँ? हाँ, पुष्टि करें या नहीं कहें।`
	}
	const meals = full(/^Demo meals: ([^\r\n]{1,1200}) Which option would you like\? Say its number\.$/, value)
	if (meals) {
		let rest = meals[1]
		const options: string[] = []
		for (let n = 1; n <= 3; n++) {
			const option = new RegExp(`^${n}\\. ([^\\r\\n]{1,240}?), ${amount}\\.(?: |$)`).exec(rest)
			if (!option) return undefined
			const booking = titleCopy(option[1])
			if (booking === undefined) return undefined
			options.push(`${n}. ${booking}, ${option[2]}।`)
			rest = rest.slice(option[0].length)
			if (!rest) return `डेमो भोजन: ${options.join(' ')} आप कौन सा विकल्प चाहेंगे? उसका नंबर बताएँ।`
		}
		return undefined
	}
	for (const [pattern, render] of rules) {
		const match = full(pattern, value)
		if (match) return render(match)
	}
	return summary(value) ?? titleCopy(value) ?? listed(value, permissions)
}

// No network, fuzzy matching, general sentence replacement or translation of captures.
// Unknown/model-generated text and over-limit templates retain their original meaning.
export const translateSystem = (value: string): string => known(value, 0) ?? value
