import crypto from 'crypto'

import { jwtConfig, wsConfig } from '../config.js'

type SlitherSecretType = `access` | `alerts` | `refresh`

const SECRETS = new Map<string, Uint8Array>()
SECRETS.set('refresh', new TextEncoder().encode(jwtConfig.refreshSecret))
SECRETS.set('access', new TextEncoder().encode(jwtConfig.accessSecret))
SECRETS.set('alerts', new TextEncoder().encode(wsConfig.alertsSecret))

// Generate a random string using the node.js 'crypto' module, minimum length 16 maximum length 50
// Default length 50
export function generateSecret(length: number = 50) {

    if(length < 16) length = 16 // If less than 16, set to 16
    const TOKEN_LENGTH = length > 50 ? 50 : Math.floor(length) // length of secret requested. Max 50, round down
    
    // Generate a 50-character string of random bytes in hex and then return a portion of it of the requested length
    return crypto.randomBytes(25).toString('hex').substring(0, TOKEN_LENGTH)

}

export function getSecret(secretType: SlitherSecretType): Uint8Array {

    if(SECRETS.has(secretType)) {
        return SECRETS.get(secretType)!
    } else {
        throw new Error(`Secret type ${secretType} not found`)
    }

}