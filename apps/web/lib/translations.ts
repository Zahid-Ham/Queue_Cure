export interface TranslationKeys {
  NOW_SERVING: string;
  EST_WAIT_TIME: string;
  TOTAL_WAITING: string;
  QUEUE_PAUSED: string;
  NO_PATIENTS: string;
  SERVED_TODAY: string;
  CALL_NEXT: string;
  MARK_DONE: string;
  RECALL: string;
  WAITING_COUNT: string;
  FULL_NAME: string;
  PHONE_NUMBER: string;
  PRIORITY_PATIENT: string;
  ADD_TO_QUEUE: string;
  PRESC_NOTES: string;
  SESSION_LOGS: string;
  UNAUTHORIZED: string;
  UNLOCK_DASHBOARD: string;
  PIN_ERROR: string;
  CLINIC_QUEUE: string;
  POSITION: string;
  JOINED: string;
  SKIP: string;
  DONE: string;
  AVG_CONSULT: string;
  THROUGHPUT: string;
  DATA_POINTS: string;
  RESUME_QUEUE: string;
  ADD_NEW_PATIENT: string;
  FALLBACK_CONSULT_TIME: string;
  PIN_LABEL: string;
  SUBMIT_PIN: string;
  RECALLING_TTS: string;
  PROCEED_TTS: string;
  TOKEN_NUM_TTS: string;
  PATIENT_TTS: string;
  UNDO: string;
  UNDO_WINDOW: string;
  PRINT_SLIP: string;
  TOKEN_GENERATED: string;
  SCAN_QR: string;
  CLOSE: string;
  NOTIFICATION_BANNER: string;
  ALLOW: string;
  PATIENT_POSITION_INFO: string;
  SERVING_NOW: string;
  ESTIMATED_CONSULT: string;
  STATUS: string;
  JUMPS_QUEUE: string;
  NO_LOGS: string;
  SESSION_STOPWATCH: string;
  ACTIVE: string;
  MORE_PATIENTS: string;
  LIVE_SYNC: string;
}

export const translations: Record<"en" | "hi", TranslationKeys> = {
  en: {
    NOW_SERVING: "Now Serving",
    EST_WAIT_TIME: "Est. Wait Time",
    TOTAL_WAITING: "Total Waiting",
    QUEUE_PAUSED: "QUEUE PAUSED",
    NO_PATIENTS: "NO PATIENTS WAITING",
    SERVED_TODAY: "served today",
    CALL_NEXT: "Call Next Token",
    MARK_DONE: "Mark as Done",
    RECALL: "Recall",
    WAITING_COUNT: "waiting",
    FULL_NAME: "Full Name",
    PHONE_NUMBER: "Phone Number",
    PRIORITY_PATIENT: "Priority Patient",
    ADD_TO_QUEUE: "Add to Queue",
    PRESC_NOTES: "Prescription & Consultation Notes",
    SESSION_LOGS: "Session Logs (Consulted Today)",
    UNAUTHORIZED: "Unauthorized Access",
    UNLOCK_DASHBOARD: "Unlock Dashboard",
    PIN_ERROR: "Invalid PIN",
    CLINIC_QUEUE: "Clinic Queue",
    POSITION: "Position",
    JOINED: "Joined",
    SKIP: "Skip",
    DONE: "Done",
    AVG_CONSULT: "Avg Consult",
    THROUGHPUT: "Throughput",
    DATA_POINTS: "Data Points",
    RESUME_QUEUE: "Resume Queue ▶",
    ADD_NEW_PATIENT: "Add New Patient",
    FALLBACK_CONSULT_TIME: "Fallback Consult Time",
    PIN_LABEL: "Enter PIN",
    SUBMIT_PIN: "Submit",
    RECALLING_TTS: "Recalling token number",
    PROCEED_TTS: "please proceed to the consultation room.",
    TOKEN_NUM_TTS: "Token number",
    PATIENT_TTS: "patient",
    UNDO: "Undo",
    UNDO_WINDOW: "Undo window (5s)",
    PRINT_SLIP: "Print Token Slip",
    TOKEN_GENERATED: "Token Generated Successfully!",
    SCAN_QR: "Scan this QR code to track live queue status on your phone:",
    CLOSE: "Close",
    NOTIFICATION_BANNER: "Enable notifications to be alerted when you're next — even if you leave this tab.",
    ALLOW: "Allow",
    PATIENT_POSITION_INFO: "patients are ahead of you in the queue.",
    SERVING_NOW: "Serving Now",
    ESTIMATED_CONSULT: "Estimated Consultation Duration",
    STATUS: "Status",
    JUMPS_QUEUE: "Jumps queue",
    NO_LOGS: "No logs recorded yet. Start serving patients to record logs.",
    SESSION_STOPWATCH: "Consultation stopwatch",
    ACTIVE: "Active",
    MORE_PATIENTS: "more patients in queue",
    LIVE_SYNC: "Live Queue Sync",
  },
  hi: {
    NOW_SERVING: "अभी इलाज चल रहा है",
    EST_WAIT_TIME: "अनुमानित प्रतीक्षा समय",
    TOTAL_WAITING: "कुल प्रतीक्षा सूची",
    QUEUE_PAUSED: "कतार रोक दी गई है",
    NO_PATIENTS: "कोई मरीज प्रतीक्षा नहीं कर रहा है",
    SERVED_TODAY: "मरीजों का इलाज हुआ",
    CALL_NEXT: "अगले टोकन को बुलाएं",
    MARK_DONE: "इलाज समाप्त करें",
    RECALL: "पुनः बुलाएं",
    WAITING_COUNT: "प्रतीक्षा में",
    FULL_NAME: "पूरा नाम",
    PHONE_NUMBER: "फ़ोन नंबर",
    PRIORITY_PATIENT: "प्राथमिकता मरीज",
    ADD_TO_QUEUE: "कतार में जोड़ें",
    PRESC_NOTES: "पर्चा और परामर्श विवरण",
    SESSION_LOGS: "आज के परामर्श लॉग",
    UNAUTHORIZED: "अनधिकृत पहुंच",
    UNLOCK_DASHBOARD: "डैशबोर्ड खोलें",
    PIN_ERROR: "गलत पिन",
    CLINIC_QUEUE: "क्लीनिक कतार",
    POSITION: "स्थान",
    JOINED: "शामिल हुए",
    SKIP: "छोड़ें",
    DONE: "समाप्त",
    AVG_CONSULT: "औसत परामर्श समय",
    THROUGHPUT: "कार्यक्षमता",
    DATA_POINTS: "डेटा बिंदु",
    RESUME_QUEUE: "कतार चालू करें ▶",
    ADD_NEW_PATIENT: "नया मरीज जोड़ें",
    FALLBACK_CONSULT_TIME: "डिफ़ॉल्ट परामर्श समय",
    PIN_LABEL: "पिन दर्ज करें",
    SUBMIT_PIN: "प्रवेश करें",
    RECALLING_TTS: "टोकन नंबर याद दिलाया जा रहा है,",
    PROCEED_TTS: "कृपया डॉक्टर के कमरे में पधारें।",
    TOKEN_NUM_TTS: "टोकन नंबर",
    PATIENT_TTS: "मरीज",
    UNDO: "पूर्ववत करें",
    UNDO_WINDOW: "वापस लें (5 सेकंड)",
    PRINT_SLIP: "टोकन पर्ची प्रिंट करें",
    TOKEN_GENERATED: "टोकन सफलतापूर्वक तैयार हुआ!",
    SCAN_QR: "अपने फोन पर लाइव कतार देखने के लिए इस क्यूआर कोड को स्कैन करें:",
    CLOSE: "बंद करें",
    NOTIFICATION_BANNER: "जब आप अगले हों तो सूचित होने के लिए पुश नोटिफिकेशन चालू करें — भले ही आप यह स्क्रीन बंद कर दें।",
    ALLOW: "अनुमति दें",
    PATIENT_POSITION_INFO: "मरीज आपसे आगे कतार में खड़े हैं।",
    SERVING_NOW: "अभी परामर्श जारी है",
    ESTIMATED_CONSULT: "अनुमानित परामर्श अवधि",
    STATUS: "स्थिति",
    JUMPS_QUEUE: "कतार में सबसे आगे",
    NO_LOGS: "कोई लॉग रिकॉर्ड नहीं हुआ। मरीजों का परामर्श शुरू करें।",
    SESSION_STOPWATCH: "परामर्श स्टॉपवॉच",
    ACTIVE: "सक्रिय",
    MORE_PATIENTS: "मरीज कतार में और हैं",
    LIVE_SYNC: "लाइव कतार सिंक",
  },
};
