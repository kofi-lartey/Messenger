export const formatPhoneNumber = (number) => {
    let cleaned = number.replace(/\D/g, ''); 
    // If it starts with '0', replace it with your country code (e.g., 233 for Ghana)
    if (cleaned.startsWith('0')) {
        cleaned = '233' + cleaned.substring(1);
    }
    return cleaned;
};