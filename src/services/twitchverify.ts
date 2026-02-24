// Twitch EventSub Event Message Verification strategy created from Twitch's docs

import crypto from 'crypto'
import { twitch as twitchConfig } from '../config.js'
import { Request } from 'express'

const TWITCH_MESSAGE_ID = 'Twitch-Eventsub-Message-Id'.toLowerCase()
const TWITCH_MESSAGE_TIMESTAMP = 'Twitch-Eventsub-Message-Timestamp'.toLowerCase()
const TWITCH_MESSAGE_SIGNATURE = 'Twitch-Eventsub-Message-Signature'.toLowerCase()

export function verify_event_message(req: Request): boolean {
    console.log(``)

    const HMAC_PREFIX: string = 'sha256='

    let secret = getSecret()
    let message = getHmacMessage(req)
    let hmac = HMAC_PREFIX + getHmac(secret, message)

    // HMAC signature header sent by twitch is of type string according to their docs
    return verifyMessage(hmac, req.headers[TWITCH_MESSAGE_SIGNATURE] as string);
}

// Our application's client secret generated on dev.twitch.tv
function getSecret(): string {
    return twitchConfig.eventsubSecret
}


function getHmacMessage(req: Request): string {
    return (req.headers[TWITCH_MESSAGE_ID] as string + 
            req.headers[TWITCH_MESSAGE_TIMESTAMP] as string +
            req.body as string)
}

// Get the HMAC
function getHmac(secret: string, message: string): string {
    return crypto.createHmac('sha256', secret)
                 .update(message)
                 .digest('hex')
}

// Verify whether our signature matches Twitch's signature
function verifyMessage(hmac: string, verifySignature: string): boolean {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(verifySignature))
}