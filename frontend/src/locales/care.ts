import type { CareEvent } from '../hub'
import type { Translate } from '../i18n'
import { bookingCopy } from './booking'

// Use event metadata rather than guessing where a person's name ends. A name
// can itself contain words such as "approved" or "asked for help".
export function careEventTitle(event: CareEvent, t: Translate, text: (value: string) => string): string {
	const verb = event.kind === 'approved' ? 'approved' : event.kind === 'declined' ? 'declined' : event.kind === 'question' ? 'asked about' : null
	const prefix = `${event.actor} ${verb} `
	if (verb && event.title.startsWith(prefix)) {
		const values = { name: event.actor, booking: bookingCopy(event.title.slice(prefix.length), t, text) }
		return event.kind === 'approved'
			? t('{{name}} approved {{booking}}', '{{name}} ने {{booking}} को मंज़ूरी दी', values)
			: event.kind === 'declined'
				? t('{{name}} declined {{booking}}', '{{name}} ने {{booking}} के लिए मना किया', values)
				: t('{{name}} asked about {{booking}}', '{{name}} ने {{booking}} के बारे में पूछा', values)
	}
	if (event.kind === 'help_requested') {
		const accompany = `${event.actor} asked if someone can come to `
		if (event.title.startsWith(accompany))
			return t('{{name}} asked if someone can come to {{title}}', '{{name}} ने पूछा कि क्या कोई {{title}} में साथ आ सकता है', { name: event.actor, title: event.title.slice(accompany.length) })
		if (event.title === `${event.actor} asked for help`)
			return t('{{name}} asked for help', '{{name}} ने मदद माँगी', { name: event.actor })
	}
	return bookingCopy(event.title, t, text)
}

export function careEventDetail(event: CareEvent, t: Translate, text: (value: string) => string): string {
	// These fields may contain arbitrary personal notes, even if their entire
	// value happens to match a known translation. There is no provenance flag
	// distinguishing a default help message from a user-entered copy of it.
	return ['question', 'declined', 'help_requested'].includes(event.kind)
		? event.detail
		: bookingCopy(event.detail, t, text)
}

// Exact application/server copy only. Names, addresses, notes and transcripts are not keys.
// Shared translateSystem should handle these backend templates, preserving interpolated data:
// - Asked for a ride to {destination}. + optional " {n} quote(s) ... shown; nothing was booked."
// - Summary suffixes: " The conversation ended without a booking." / " Saathi asked for more details; nothing was booked."
// - BOOKING_LINES in backend/app/care.py: Booked/Sent/Cancelled/failed/completed/declined summaries.
// - Event prefixes: Booking failed:, Booked (simulated):, Approval needed:, Approval request expired:,
//   Completed (simulated):, Cancelled:, Appointment added/changed:, Trusted contact added/removed:.
// - Ride for {title} is waiting for approval / was cancelled; Ride arranged for {title}; No ride booked for {title}.
// - {name} approved/declined/asked about {booking}; {name} asked for help / asked if someone can come to {title}.
// - {name} was invited as {role}; Access changed for {name}; {name} no longer has access / joined the Care Circle.
// - At {place}. Added by {name}.; Added/Changed/Removed by {name}.; provider + booking ID + notice details.
// - {name} mentioned an emergency; possible-scam and repeated-trouble details from workflows.py.
// - Already approved/declined by {name}.; comma-joined permission descriptions (some descriptions contain commas).
// Event details of question/declined/help_requested may be personal input; callers intentionally leave them raw.
export const careText: Record<string, string> = {
	Viewer: 'दर्शक',
	Assistant: 'सहायक',
	Approver: 'मंज़ूरी देने वाला',
	Administrator: 'प्रशासक',
	viewer: 'दर्शक',
	assistant: 'सहायक',
	approver: 'मंज़ूरी देने वाला',
	administrator: 'प्रशासक',
	'Older adult': 'वरिष्ठ नागरिक',
	active: 'सक्रिय',
	invited: 'आमंत्रित',
	revoked: 'अनुमति हटाई गई',
	'Sees shared rides, orders and appointments.': 'साझा की गई सवारियाँ, ऑर्डर और अपॉइंटमेंट देखता है।',
	'Also helps with reminders, appointments and saved addresses.': 'रिमाइंडर, अपॉइंटमेंट और सहेजे गए पतों में भी मदद करता है।',
	'Also approves or declines requests you send for approval.': 'आपके भेजे गए अनुरोधों को मंज़ूर या अस्वीकार भी करता है।',
	'Also invites and removes viewers and assistants.': 'दर्शकों और सहायकों को आमंत्रित और हटा भी सकता है।',
	'See shared rides, orders and appointments': 'साझा सवारियाँ, ऑर्डर और अपॉइंटमेंट देखें',
	'Add and change reminders and appointments': 'रिमाइंडर और अपॉइंटमेंट जोड़ें और बदलें',
	'Help edit saved addresses': 'सहेजे गए पते बदलने में मदद करें',
	'Approve or decline requests sent for approval': 'मंज़ूरी के लिए भेजे गए अनुरोध मंज़ूर या अस्वीकार करें',
	'Read conversation summaries': 'बातचीत के सारांश पढ़ें',
	'Receive safety alerts': 'सुरक्षा सूचनाएँ पाएँ',
	'Invite and remove other caretakers': 'अन्य देखभालकर्ताओं को आमंत्रित करें और हटाएँ',
	'See saved medicine details': 'सहेजी गई दवाओं का विवरण देखें',
	'Read full conversation transcripts': 'पूरी बातचीत का पाठ पढ़ें',
	'See simulated payment status': 'डेमो भुगतान की स्थिति देखें',
	'Change emergency contacts': 'आपातकालीन संपर्क बदलें',
	view_activity: 'साझा सवारियाँ, ऑर्डर और अपॉइंटमेंट देखें',
	manage_reminders: 'रिमाइंडर और अपॉइंटमेंट जोड़ें और बदलें',
	edit_profile: 'सहेजे गए पते बदलने में मदद करें',
	approve: 'मंज़ूरी के लिए भेजे गए अनुरोध मंज़ूर या अस्वीकार करें',
	view_summaries: 'बातचीत के सारांश पढ़ें',
	receive_alerts: 'सुरक्षा सूचनाएँ पाएँ',
	manage_circle: 'अन्य देखभालकर्ताओं को आमंत्रित करें और हटाएँ',
	view_medication: 'सहेजी गई दवाओं का विवरण देखें',
	view_transcripts: 'पूरी बातचीत का पाठ पढ़ें',
	view_payments: 'डेमो भुगतान की स्थिति देखें',
	manage_contacts: 'आपातकालीन संपर्क बदलें',
	'rides, orders and appointments': 'सवारियाँ, ऑर्डर और अपॉइंटमेंट देखने',
	'approving requests': 'अनुरोध मंज़ूर करने',
	'conversation summaries': 'बातचीत के सारांश पढ़ने',
	'safety alerts or trusted contacts': 'सुरक्षा सूचनाएँ या भरोसेमंद संपर्क देखने',
	Rides: 'सवारियाँ',
	'Food orders': 'भोजन के ऑर्डर',
	'Medicine requests': 'दवा अनुरोध',
	'Appointments and reminders': 'अपॉइंटमेंट और रिमाइंडर',
	Upcoming: 'आगामी',
	'Missed · follow up': 'छूट गया · पूछकर पुष्टि करें',
	Done: 'पूरा हुआ',
	RIDE: 'सवारी',
	FOOD: 'भोजन',
	MEDICINE: 'दवा',
	PHARMACY: 'दवा',
	app: 'ऐप',
	voice: 'आवाज़',
	message: 'संदेश',
	call: 'कॉल',
	phone: 'फ़ोन',
	simulator: 'सिम्युलेटर',
	whatsapp: 'WhatsApp',
	'In the app': 'ऐप में',
	'In-app voice': 'ऐप में आवाज़ से',
	Message: 'संदेश',
	Call: 'कॉल',
	'Phone call': 'फ़ोन कॉल',
	new: 'नई बातचीत',
	'collecting details': 'विवरण पूछे जा रहे हैं',
	searching: 'खोज जारी है',
	'presenting options': 'विकल्प दिखाए जा रहे हैं',
	'awaiting confirmation': 'पुष्टि की प्रतीक्षा में',
	'awaiting external approval': 'देखभाल मंडली की मंज़ूरी की प्रतीक्षा में',
	executing: 'अनुरोध पूरा किया जा रहा है',
	completed: 'पूरा हुआ',
	cancelled: 'रद्द किया गया',
	failed: 'असफल',
	expired: 'समय समाप्त हुआ',
	'Waiting for approval · not booked yet': 'मंज़ूरी की प्रतीक्षा में · अभी बुक नहीं हुआ',
	'Booked · simulated': 'बुक हुआ · डेमो',
	'Completed · simulated': 'पूरा हुआ · डेमो',
	'Failed · nothing booked': 'असफल · कुछ बुक नहीं हुआ',
	'Cancelled · simulated': 'रद्द हुआ · डेमो',
	'Declined in Care Circle': 'देखभाल मंडली ने अस्वीकार किया',
	'Nothing booked': 'कुछ बुक नहीं हुआ',
	'Approved. The demo provider was asked to book it (simulated).': 'मंज़ूर हुआ। डेमो प्रदाता से डेमो बुकिंग करने को कहा गया।',
	'Declined. Nothing was booked.': 'अस्वीकार हुआ। कुछ बुक नहीं हुआ।',
	'Your question was sent.': 'आपका सवाल भेज दिया गया।',
	'A message looked like a possible scam. Saathi did nothing and warned about it.': 'एक संदेश में संभावित धोखाधड़ी का संदेह हुआ। साथी ने कोई कार्रवाई नहीं की और चेतावनी दी।',
	'Asked the Care Circle for help.': 'देखभाल मंडली से मदद माँगी।',
	'Asked for a meal.': 'भोजन माँगा।',
	'Asked for pharmacy items.': 'दवा की दुकान की वस्तुएँ माँगीं।',
	'Asked Saathi for help.': 'साथी से मदद माँगी।',
	'Asked for a meal. The conversation ended without a booking.': 'भोजन माँगा। बातचीत बिना बुकिंग के समाप्त हुई।',
	'Asked for pharmacy items. The conversation ended without a booking.': 'दवा की दुकान की वस्तुएँ माँगीं। बातचीत बिना बुकिंग के समाप्त हुई।',
	'Asked Saathi for help. The conversation ended without a booking.': 'साथी से मदद माँगी। बातचीत बिना बुकिंग के समाप्त हुई।',
	'Asked for a meal. Saathi asked for more details; nothing was booked.': 'भोजन माँगा। साथी ने अधिक विवरण पूछा; कुछ बुक नहीं हुआ।',
	'Asked for pharmacy items. Saathi asked for more details; nothing was booked.': 'दवा की दुकान की वस्तुएँ माँगीं। साथी ने अधिक विवरण पूछा; कुछ बुक नहीं हुआ।',
	'Asked Saathi for help. Saathi asked for more details; nothing was booked.': 'साथी से मदद माँगी। साथी ने अधिक विवरण पूछा; कुछ बुक नहीं हुआ।',
	'Ask whether someone could go along to the appointment.': 'पूछें कि क्या कोई अपॉइंटमेंट पर साथ जा सकता है।',
	'Try again, or offer help from the Care Circle.': 'फिर कोशिश करें या देखभाल मंडली की मदद दें।',
	'Check in before anyone replies to that message.': 'किसी के उस संदेश का जवाब देने से पहले बात करके पुष्टि करें।',
	'Pharmacy order (details not shared)': 'दवा की दुकान का ऑर्डर (विवरण साझा नहीं है)',
	'Possible scam message': 'संभावित धोखाधड़ी वाला संदेश',
	'Saathi had trouble with several requests': 'साथी को कई अनुरोध समझने में कठिनाई हुई',
	'Saathi cannot respond to emergencies and told them to contact emergency services or a trusted person.': 'साथी आपातकाल में सहायता नहीं दे सकता और उसने आपातकालीन सेवा या भरोसेमंद व्यक्ति से संपर्क करने को कहा।',
	'Simulated failure. Nothing was booked or charged.': 'डेमो विफलता। कुछ बुक नहीं हुआ और कोई भुगतान नहीं हुआ।',
	'Paid from the demo wallet (simulated)': 'डेमो वॉलेट से भुगतान हुआ (डेमो)',
	'Pay on completion (simulated)': 'पूरा होने पर भुगतान (डेमो)',
	'No money was charged.': 'कोई पैसा नहीं लिया गया।',
	'Nothing charged yet. No real money will move.': 'अभी कोई भुगतान नहीं हुआ। कोई वास्तविक पैसा नहीं लिया जाएगा।',
	'Nothing was booked or charged.': 'कुछ बुक नहीं हुआ और कोई भुगतान नहीं हुआ।',
	'The approval request expired. Nothing was booked or charged.': 'मंज़ूरी के अनुरोध का समय समाप्त हुआ। कुछ बुक नहीं हुआ और कोई भुगतान नहीं हुआ।',
	'Sent to the demo provider.': 'डेमो प्रदाता को भेजा गया।',
	'Simulated: no real driver will come.': 'डेमो: कोई वास्तविक ड्राइवर नहीं आएगा।',
	'Nothing was booked.': 'कुछ बुक नहीं हुआ।',
	'Simulated refund recorded': 'डेमो धनवापसी दर्ज हुई',
	'No real money moved either way.': 'किसी भी दिशा में वास्तविक पैसे का लेनदेन नहीं हुआ।',
	'Cancelled by the owner (simulated).': 'खाता धारक ने रद्द किया (डेमो)।',
	'The demo provider marked it finished.': 'डेमो प्रदाता ने इसे पूरा चिह्नित किया।',
	'Simulated payment marked complete': 'डेमो भुगतान पूरा चिह्नित किया गया',
	'No real money moved.': 'वास्तविक पैसे का लेनदेन नहीं हुआ।',
	'No one has agreed yet. Reply to them directly.': 'अभी कोई सहमत नहीं हुआ है। उन्हें सीधे जवाब दें।',
	'Please check in with them.': 'कृपया उनसे बात करके हाल पूछें।',
	'not allowed': 'अनुमति नहीं है',
	'Only the account owner can perform this action.': 'केवल खाता धारक यह काम कर सकते हैं।',
	'Your Care Circle access was removed.': 'आपकी देखभाल मंडली की अनुमति हटा दी गई है।',
	'Could not save your changes. Please retry.': 'बदलाव सहेजे नहीं जा सके। कृपया फिर कोशिश करें।',
	'A Care Circle can have up to six people.': 'देखभाल मंडली में अधिकतम छह लोग हो सकते हैं।',
	'Approvals come from someone in your Care Circle.': 'मंज़ूरी आपकी देखभाल मंडली के किसी सदस्य से मिलती है।',
	'This list is for people in a Care Circle.': 'यह सूची देखभाल मंडली के सदस्यों के लिए है।',
	'Keep up to five trusted contacts.': 'अधिकतम पाँच भरोसेमंद संपर्क रखें।',
	'That conversation is not shared with you.': 'वह बातचीत आपके साथ साझा नहीं की गई है।',
	'The phone transcript retention period has ended.': 'फ़ोन बातचीत का पाठ रखने की अवधि समाप्त हो गई है।',
	'Gemini is not configured. The automatic summary is shown.': 'Gemini सेट नहीं है। स्वचालित सारांश दिखाया गया है।',
	'That person is not in the Care Circle.': 'वह व्यक्ति देखभाल मंडली में नहीं है।',
	'That person is not in your Care Circle.': 'वह व्यक्ति आपकी देखभाल मंडली में नहीं है।',
	'Only the account owner can give approval, admin or sensitive permissions.': 'केवल खाता धारक मंज़ूरी, प्रशासन या संवेदनशील जानकारी की अनुमति दे सकते हैं।',
	'Use a Care Circle invitation code.': 'देखभाल मंडली का निमंत्रण कोड इस्तेमाल करें।',
	'Invitation expired or already used.': 'निमंत्रण का समय समाप्त हो गया है या उसका उपयोग हो चुका है।',
	'This request is no longer waiting for approval.': 'यह अनुरोध अब मंज़ूरी की प्रतीक्षा में नहीं है।',
	'This approval request has expired. Nothing was booked.': 'इस मंज़ूरी अनुरोध का समय समाप्त हो गया है। कुछ बुक नहीं हुआ।',
	'That appointment is no longer saved.': 'वह अपॉइंटमेंट अब सहेजा हुआ नहीं है।',
	'That reminder is no longer saved.': 'वह रिमाइंडर अब सहेजा हुआ नहीं है।',
	'That contact is no longer saved.': 'वह संपर्क अब सहेजा हुआ नहीं है।',
	'That alert is no longer saved.': 'वह सूचना अब सहेजी हुई नहीं है।',
	'That conversation is no longer saved.': 'वह बातचीत अब सहेजी हुई नहीं है।',
	'Not shared with you: see shared rides, orders and appointments.': 'आपको साझा सवारियाँ, ऑर्डर और अपॉइंटमेंट देखने की अनुमति नहीं है।',
	'Not shared with you: add and change reminders and appointments.': 'आपको रिमाइंडर और अपॉइंटमेंट जोड़ने या बदलने की अनुमति नहीं है।',
	'Not shared with you: help edit saved addresses.': 'आपको सहेजे गए पते बदलने की अनुमति नहीं है।',
	'Not shared with you: approve or decline requests sent for approval.': 'आपको अनुरोध मंज़ूर या अस्वीकार करने की अनुमति नहीं है।',
	'Not shared with you: read conversation summaries.': 'आपको बातचीत के सारांश पढ़ने की अनुमति नहीं है।',
	'Not shared with you: receive safety alerts.': 'आपको सुरक्षा सूचनाएँ पाने की अनुमति नहीं है।',
	'Not shared with you: invite and remove other caretakers.': 'आपको अन्य देखभालकर्ताओं को आमंत्रित करने या हटाने की अनुमति नहीं है।',
	'Not shared with you: see saved medicine details.': 'आपको सहेजी गई दवाओं का विवरण देखने की अनुमति नहीं है।',
	'Not shared with you: read full conversation transcripts.': 'आपको पूरी बातचीत का पाठ पढ़ने की अनुमति नहीं है।',
	'Not shared with you: see simulated payment status.': 'आपको डेमो भुगतान की स्थिति देखने की अनुमति नहीं है।',
	'Not shared with you: change emergency contacts.': 'आपको आपातकालीन संपर्क बदलने की अनुमति नहीं है।',
	'profile updated': 'प्रोफ़ाइल बदली गई',
	'address changed': 'पता बदला गया',
	'place saved': 'जगह सहेजी गई',
	'place removed': 'जगह हटाई गई',
	'circle invited': 'देखभाल मंडली में निमंत्रण भेजा गया',
	'setup finished': 'सेटअप पूरा हुआ',
	'service connected': 'सेवा जोड़ी गई',
	'service option changed': 'सेवा विकल्प बदला गया',
	'service disconnected': 'सेवा का कनेक्शन हटाया गया',
	'service reset': 'सेवा रीसेट की गई',
	quoted: 'कीमत दिखाई गई',
	'booking failed': 'बुकिंग असफल हुई',
	'auto booked': 'अपने आप बुकिंग हुई',
	'owner confirmed': 'खाता धारक ने पुष्टि की',
	'owner cancel': 'खाता धारक ने रद्द किया',
	'sharing changed': 'साझा करने की सेटिंग बदली गई',
	'demo completed': 'डेमो पूरा हुआ',
	'demo payment completed': 'डेमो भुगतान पूरा हुआ',
	'appointment added': 'अपॉइंटमेंट जोड़ा गया',
	'appointment changed': 'अपॉइंटमेंट बदला गया',
	'appointment removed': 'अपॉइंटमेंट हटाया गया',
	'reminder added': 'रिमाइंडर जोड़ा गया',
	'reminder changed': 'रिमाइंडर बदला गया',
	'reminder removed': 'रिमाइंडर हटाया गया',
	'reminder done': 'रिमाइंडर पूरा हुआ',
	'contact added': 'संपर्क जोड़ा गया',
	'contact removed': 'संपर्क हटाया गया',
	'help requested': 'मदद माँगी गई',
	'alert resolved': 'सूचना का निपटारा हुआ',
	'transcript viewed': 'बातचीत का पाठ देखा गया',
	'caregiver linked': 'देखभालकर्ता जोड़ा गया',
	'demo switched': 'डेमो बदला गया',
	'demo fail next': 'अगला डेमो असफल करने की सेटिंग की गई',
	'circle changed': 'देखभाल मंडली बदली गई',
	'circle removed': 'देखभाल मंडली से हटाया गया',
	'caregiver revoked': 'देखभालकर्ता की अनुमति हटाई गई',
	'caregiver approve': 'देखभालकर्ता ने मंज़ूरी दी',
	'caregiver reject': 'देखभालकर्ता ने अस्वीकार किया',
	'caregiver ask': 'देखभालकर्ता ने सवाल पूछा',
	'asked back': 'अधिक विवरण पूछा गया',
	'conversation confirmed': 'बातचीत में पुष्टि की गई',
	'phone pairing created': 'फ़ोन जोड़ने की प्रक्रिया शुरू हुई',
	'phone paired': 'फ़ोन जोड़ा गया',
	'phone call ended': 'फ़ोन कॉल समाप्त हुई',
	'phone access revoked': 'फ़ोन की अनुमति हटाई गई',
}