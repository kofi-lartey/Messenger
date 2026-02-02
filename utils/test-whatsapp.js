import 'dotenv/config';
import { sendVerificationCode } from './whatsAppCode.js';
import { INFOBIP_BASE_URL, USE_WHATSAPP,INFOBIP_SENDER_NUMBER } from '../Config/env.js';


console.log("--- Debugging Env Variables ---");
console.log("USE_WHATSAPP:", USE_WHATSAPP);
console.log("BASE_URL:", INFOBIP_BASE_URL ? "Loaded ✅" : "NOT LOADED ❌");
console.log("SENDER:", INFOBIP_SENDER_NUMBER ? "Loaded ✅" : "NOT LOADED ❌");
console.log("-------------------------------");

const myNumber = "0531114795"; 

// IMPORTANT: Check for true as a boolean, since your env.js converts it
if (USE_WHATSAPP === true) {
    sendVerificationCode(myNumber).then(code => {
        console.log(`Test finished. Code: ${code}`);
    });
} else {
    console.log("USE_WHATSAPP is false. Check your .env file in the root directory!");
}