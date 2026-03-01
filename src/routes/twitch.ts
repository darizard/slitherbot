import express from 'express'
import bodyParser from 'body-parser'
import crypto from 'crypto'
import { WebSocket } from 'ws'
import { ssl as sslConfig, twitch as twitchConfig, jwt as jwtConfig } from '../config.js' // Needed in auth

import { verify_event_message } from '../services/twitchverify.js'

const AUTH_REDIRECT_URI = `https://${sslConfig.hostName}/twitch/auth/code`
const AUTH_STATES: string[] = []
const SLITHER_SCOPES = ['channel:read:redemptions', 'channel:manage:redemptions']

const rawParser = bodyParser.raw({ type: 'application/json' })
const jsonParser = bodyParser.json()
const router = express.Router()

//TODO: Move WebSocket client implementation to its own service file.
let twitchWS = new WebSocket(`wss://${sslConfig.hostName}/twitch?clientType=controller`);
twitchWS.onopen = function open() {

	let pingIntervalID = setInterval(() => {

        if (twitchWS.readyState === WebSocket.OPEN)
            twitchWS.send(JSON.stringify({ type: "ping" }))

    }, 60000) // Ping the WS server every 1 minute to keep the connection alive

    let reconnectIntervalID = setInterval(() => {
        if (twitchWS.readyState !== WebSocket.OPEN && twitchWS.readyState !== WebSocket.CONNECTING) {

            console.log('Reconnecting WebSocket for twitch controller...')
            clearInterval(pingIntervalID)
            clearInterval(reconnectIntervalID)
			twitchWS = new WebSocket(`wss://${sslConfig.hostName}/twitch?clientType=controller`)

        }
    }, 15000) // Check for non-open and non-connecting socket every 15 seconds

	console.log("Twitch controller WebSocket connected to local WebSocket server.")

}

/**
 * POST request received from Twitch when either:
 * 		- We create an EventSub subscription to a channel point reward and have to respond
 * 		  to the callback verification challenge to enable the EventSub subscription on Twitch's end
 * 		OR
 * 		- A user redeems a channel point reward that we already have an enabled EventSub
 * 		  subscription for
 * 		OR
 * 		- An existing subscription has been revoked
 * 
 * This method must call the appropriate channel point reward
 **/
router.post('/event/channel.channel_points_custom_reward_redemption.add.:channelid', rawParser, (req, res) => {
	// Verify that Twitch did indeed send this request
	if(!verify_event_message(req)) {
		console.log(`Received unverified event message at URL: ${req.url}`)
		return res.status(401).end()
	}
	
	//TODO: Remove if statement when multiple channels are supported. For now, just make sure the post is for the correct channel before doing anything with it.
	if(req.params.channelid !== "123657070") {
		
		console.log(`Channel Point Redemption Add event received for unavailable channel id ${req.params.channelid}. Send 200 response to Twitch but process nothing.`)
		return res.sendStatus(200)

	}

	// Make sure body is parseable json
	try {
		req.body = JSON.parse(req.body)
	} catch(e) {
		console.log('Error parsing req.body as JSON: ', e)
	}

	// We trust twitch to give us the message type as a string
	const messageType: string = req.headers['twitch-eventsub-message-type'] as string

	if(messageType === 'webhook_callback_verification') {

		console.log(`Verification Challenge received. Request body: ${JSON.stringify(req.body)}`)

		// We need to register the EventSub subscription. First, respond to Twitch's auth challenge
		res.set('Content-Type', 'text/plain')
		   .set('Content-Length', `${req.body.challenge.length}`)
		   .status(200)
		   .send(req.body.challenge)

		// TODO: Add event subscriptions to the backend DB schema
		// TODO: store the subscription information in our database

	}

	else if(messageType === 'notification') {
		
		const { id: subscription_id, error, error_description, state } = req.body.subscription
		// Build an alert object based on the channel id and reward id in the incoming event message.
		let type: string = 'alert'
		let imageFile: string = 'RareCharTP-Trim.gif'
		let audioFile: string = 'DiscordMute.mp3'
		let alertText: string = 'Channel Points Reward Message'
		let duration: number = 8000

		console.log(`Reward redeemed. Request body: ${JSON.stringify(req.body)}`)

		// respond with 204 No Content...
		res.sendStatus(204)

		// send the reward redemption info to the WebSocket server. the 
		const wsmsgobj = { type: type, imageFile: imageFile, audioFile: audioFile, alertText: alertText, duration: duration };
		twitchWS.send(JSON.stringify(wsmsgobj)) 

	}

	else if(messageType === 'revocation') {
		res.sendStatus(204);

		console.log(`Subscription revoked by Twitch! Reason: ${req.body.subscription.status}`)
		console.log(`Full message body: ${JSON.stringify(req.body)}`)
	}

	else {
		res.sendStatus(204);
		console.log(`Unkonwn message type received from Twitch: ${req.headers[messageType]}`)
	}

})

router.get('/alerts', (req, res) => {

	res.render("twitch/alerts", {
		hostName: `${sslConfig.hostName}`
	})

})

// TODO: Is this how we want to hit the alerts endpoint? Not yet a functional route.
router.get('/alerts/:token', (req, res) => {

	console.log(`alerts hit for channel ${req.params.token}`)
	res.render("twitch/alerts", { channelname: req.params.token })

})

// TODO: Validate that the requested file has been uploaded by the same user who is making the request. Requests to 
// this endpoint should only come from the alerts.ejs view after the server sends it a secure message over the websocket.
router.get('/media/:filename', (req, res) => {

	// Allow only a-z, A-Z, 0-9, and the literals - and _ in file names. Files supported are only:
	// { .gif, .png, .jpg, .mp3, .wav, .ico }
	const ALLOWED_MEDIA_STRICT = /^[\w\-\_]+\.(?i:gif|png|jpg|mp3|wav|ico)$/
	const fileName: string = req.params.filename
	if(!ALLOWED_MEDIA_STRICT.test(fileName)) {
		return res.status(404).end()
	}

	res.status(200).sendFile(`/opt/slitherbot/public/media/${fileName}`, (err) => {
		if(err) {
			console.error(`Error sending media file ${fileName} in response to request at /media/:filename endpoint. Error: ${err}`)
			res.status(404).end()
		}
	})

})

// TODO: Complete this route. We currently do not have a systematic way to obtain User Access Tokens.
// Intermediate endpoint for users wanting to authenticate slitherbot to access their twitch account resources.
// When the user logs into Twitch and authorizes slitherbot to access their Twitch account resources, Twitch will
// redirect the user here. We should use the fetch() API to send the authorization code to Twitch's OAuth system
// after which we will receive the User Access Token at the redirect URI specified.
router.get('/auth/code', (req, res) => {
	const { code: authCode, scope, error, error_description, state } = req.query
	console.log(`Received Twitch auth redirect with query params: code=${authCode}, scope=${scope}, error=${error}, error_description=${error_description}, state=${state}`)
	const stateIndex = AUTH_STATES.indexOf(state as string);

	if(stateIndex < 0) {
		console.error(`Received GET request at /auth/code with invalid state parameter: ${state}`)
		return res.status(401).end()
	}

	// Process a request with any given state only once
	AUTH_STATES.splice(stateIndex, 1)

	if(authCode) {
		// TODO: We have received an authorization code. Use the fetch 
		// API to GET https://id.twitch.tv/oauth2/token using following query params
		// **********************************************
		// clientid = slitherbot_client_id
		// client_secret = slitherbot_client_secret
		// code = code
		// grant_type = "authorization_code"
		// redirect_uri = `https://${sslConfig.hostName}/auth/token`
		// **********************************************
		
		// Then, we will receive an access token and refresh token at the redirect uri provided.
	}
	else if(error) {
		// TODO: We have received an error back from Twitch on the authorization code retrieval. According to Twitch
		// docs, this occurs when a user successfully logs in but does not authorize the requested access to
		// slitherbot. Send the user to the auth page again? Create a page for this occurrence?
	}

	res.sendStatus(200)
})

// TODO: Integrate this better into the frontend. We have functionality, let's create a better application around it.
// Auth page for slitherbot users. Currently just a button labeled "Authorize Me!" that redirects them to a Twitch login.
// Expect the twitchAuthParams object to be sent to Twitch's OAuth system which will then send a code to our redirect_uri
// if user's login to Twitch is successful.
router.get('/auth', (req, res) => {
	const STATE = crypto.randomBytes(32).toString('hex')
	AUTH_STATES.push(STATE)

	let scopes = '';
	for(let scope of SLITHER_SCOPES) scopes += `${encodeURIComponent(scope)}+`
	scopes = scopes.substring(0, scopes.length-1)

	res.render('twitch/auth', {
		twitchAuthParams: {
			idlabel: "client_id",
			idvalue: twitchConfig.clientId,
			redirlabel: "redirect_uri",
			redirvalue: AUTH_REDIRECT_URI,
			restypelabel: "response_type",
			restypevalue: "code",
			scopelabel: "scope",
			scopevalue: scopes,
			statelabel: "state",
			statevalue: STATE
		}
	})

})

//TODO: Implement authentication functionality to manage user access tokens and scopes for Twitch API and EventSub access.
// This is the redirect URL for twitch to send OAuth requests
router.get('/auth/token', (req, res) => {
	
})

// TODO: Implement test functions for eventsub testing and use the /twitch/event endpoint to filter out and handle test messages.
// These last two endpoints exist for now to see how the CLI behaves when sending test events but it is extremely bare-bones.
router.post('/event', (req, res) => {
	console.log(`/event endpoint hit on /twitch route with body: ${req.body}`)
	res.sendStatus(200)
})

router.post('/', (req, res) => {
	console.log(`Default endpoint hit on /twitch route with body: ${req.body}`)
	res.sendStatus(200)
})

export default { router };