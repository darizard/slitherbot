import crypto from 'crypto'

// Generate a random string using the node.js 'crypto' module, minimum length 16 maximum length 50
// Default length 50
export function generateSecret(length: number = 50) {

    if(length < 16) length = 16 // If less than 16, set to 16
    const TOKEN_LENGTH = length > 50 ? 50 : Math.floor(length) // length of secret requested. Max 50, round down
    
    // Generate a 50-character string of random bytes in hex and then return a portion of it of the requested length
    return crypto.randomBytes(25).toString('hex').substring(0, TOKEN_LENGTH)

}