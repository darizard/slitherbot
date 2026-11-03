import { RequestHandler } from 'express'
import crypto from 'crypto'

import { twitchConfig } from '../config.js'

const RECENT_MESSAGES = new Set<string>()  // TODO: Keep this data serialized somewhere in the project
                                           //       OR
                                           //       In memory in a more suitable location

//*****************EVENT MESSAGE VERIFICATION ROUTINE RECOMMENDED BY TWITCH DOCS*****************/
export const verifyMessage: RequestHandler = (req, res, next) => {

    const options = {
        TWITCH_MESSAGE_ID   : 'Twitch-Eventsub-Message-Id'.toLowerCase(),
        TWITCH_MESSAGE_TIMESTAMP: 'Twitch-Eventsub-Message-Timestamp'.toLowerCase(),
        TWITCH_MESSAGE_SIGNATURE: 'Twitch-Eventsub-Message-Signature'.toLowerCase()
    }

    const HMAC_PREFIX: string = 'sha256='

    const secret = twitchConfig.eventsubSecret

    const message = req.headers[options.TWITCH_MESSAGE_ID] as string + 
                req.headers[options.TWITCH_MESSAGE_TIMESTAMP] as string +
                req.body as string
                
    const hmac = HMAC_PREFIX + crypto.createHmac('sha256', secret)
                    .update(message)
                    .digest('hex')

    //**********VERIFY MESSAGE SIGNATURE**********/
    const twitchSignature = req.headers[options.TWITCH_MESSAGE_SIGNATURE] as string
    if(!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(twitchSignature))) {
        // TODO: Elevate log. Security issue.
        console.error(`Received unverified event message with request URL: ${req.url}`)
        return res.sendStatus(401)
    }
    //********************************************/

    //***********CHECK MESSAGE IS RECENT AND NOT DUPLICATE***********/
    const messageId = req.headers[options.TWITCH_MESSAGE_ID] as string
    if(!messageId) {
        // TODO: Elevate log. Why are we receiving requests verified as being from Twitch that do not have the expected header?
        console.log(`/event request received without message id header.`)
        return res.sendStatus(400)
    }

    const messageTimestamp = req.headers[options.TWITCH_MESSAGE_TIMESTAMP] as string
    if(Date.parse(messageTimestamp ?? '') < Date.now() - 1000 * 60 * 10) {
        // TODO: Elevate logging for both of these cases as a security issue
        console.log(`Received Twitch message more than 10 minutes old. Investigate.`)
        return res.sendStatus(204)
    }
    if(RECENT_MESSAGES.has(messageId)) {
        console.log(`Received Twitch message with an id that has been seen before. Investigate.`)
        return res.sendStatus(204)
    }
    //***************************************************************/

    // keep recent message ids for 11 minutes to check against. After 10 minutes, any message will automatically not be processed anyway
    RECENT_MESSAGES.add(messageId)
    setTimeout(() => {
        RECENT_MESSAGES.delete(messageId)
    }, 1000 * 60 * 11)

    // Verification success! The message is indeed from Twitch.
    next()
}

export const parseJson: RequestHandler = (req, res, next) => {

    try { req.body = JSON.parse(req.body) }
	catch(e) { 
		// TODO: Elevate log as Twitch has changed or added something I need to know about
		console.error('Error parsing req.body as JSON: ', e)
		res.sendStatus(204) // Do not send client error codes back to Twitch. 204 suffices here
	}

    next()
}
