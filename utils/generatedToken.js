

export function generateEmailCode() {
    // Generate 6 random digits (000000 to 999999)
    // Math.random() is suitable here because the database UNIQUE constraint 
    // is the ultimate safety net against collisions.
    const randomDigits = Math.floor(100000 + Math.random() * 900000); 
    return `${randomDigits}`;
}

// Example usage:
// const code = generateConsentCode(); // e.g., "CNST-822231"

/**
 * Generates a unique registration number in the format: C-XXXXXX
 * @returns {string} The generated registration number.
 */
export function generateRegistrationNumber() {
    // Generates a 6-digit random number
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    return `C-${randomDigits}`; 
}

// Example usage:
// const regNum = generateRegistrationNumber(); // e.g., "C-169041"

/**
 * Generates an ICAG Number in the format: ICAG/YYYY/XXXX
 * @returns {string} The generated ICAG number.
 */
export function generateIcagNumber() {
    const currentYear = new Date().getFullYear();
    // Generates a 4-digit random code
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    return `ICAG/${currentYear}/${randomCode}`;
}

// Example usage:
// const icagNum = generateIcagNumber(); // e.g., "ICAG/2025/5982"