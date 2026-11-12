// External modules
import express from 'express'
import bodyParser from 'body-parser'

// .env configuration imports
import { wsConfig } from '../config.js'

// Internal abstraction classes
import { SlitherControllerClientWebSocket } from '../classes/slitherws.js'

// Express Middleware
import { verifyMessage, parseJson } from '../middleware/twitchevents.js'

// Internal logic modules
import esclient from '../services/eventsubclient.js'

const rawParser = bodyParser.raw({ type: 'application/json' })
const eventsRouter = express.Router()

const ws = new SlitherControllerClientWebSocket() // TODO: Move to a more suitable location
void ws.connect(wsConfig.controllerSecret)

/**
 * POST request received from Twitch when either:
 * 		- We create an EventSub subscription to a channel point reward and have to respond
 * 		  to the callback verification challenge to enable the EventSub subscription on Twitch's end
 * 		OR
 * 		- A user redeems a channel point reward that we already have an enabled EventSub
 * 		  subscription for
 * 		OR
 * 		- An existing subscription has been revoked
 **/
eventsRouter.post('/', rawParser, verifyMessage, parseJson, async (req, res) => {

	// TODO: Zod
	const messageType = req.headers['twitch-eventsub-message-type'] as string

	switch(messageType) {
		case 'webhook_callback_verification':
			await esclient.handleChallenge(req.body, res)
			break

		case 'notification':
			await esclient.handleEvent(req, res, ws)
			break

		case 'revocation':
			esclient.handleRevocation(req, res)
			break

		default:
			esclient.handleUnexpectedMessage(req, res, messageType)
			break

	}
	
})

export default eventsRouter