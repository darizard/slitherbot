import { RequestHandler } from 'express'

import { deleteAuthState } from '../services/twitchauth.js'

// Internal TS types and runtime type guards
import { isTwitchAuthCode, isTwitchAuthError  } from '../types/authtypes.js'

export const verifyTwitchOAuth: RequestHandler = (req, res, next) => {
    
        if(typeof req.query['state'] !== 'string') {
            console.error(`Request received at GET /auth/oauth with invalid state param type`)
        } else if(isTwitchAuthError(req.query)) {
            console.error(`OAuth Error received from Twitch: ${JSON.stringify(req.query)}`)
        } else if(!isTwitchAuthCode(req.query)) {
            console.error(`Received a call to GET /slither/oauth that was neither an error nor an auth code. Query: ${JSON.stringify(req.query)}`)
        } else if(!deleteAuthState(req.query['state'])) {
            // TODO: Elevate error as a security risk
            console.error(`Received a Twitch OAuth code with an invalid state value: ${req.query['state']}. Rejecting request.`)
        } else {
            next()
        }

        return res.sendStatus(204)
}