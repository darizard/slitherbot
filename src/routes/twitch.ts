import express from 'express'
import bodyParser from 'body-parser'
import crypto from 'crypto'

import { WebSocket } from 'ws'

import { upsertUser } from '../db/queries/dbqueries.js'
import { ssl as sslConfig, twitch as twitchConfig, jwt as jwtConfig } from '../config.js' // Needed in auth
import type { TwitchAuthCode, TwitchAuthUserToken, TwitchAuthError, TwitchAuthCodeRequest, TwitchAuthUserTokenRequest, TwitchAuthTokenValidationResponse } from '../types/authtypes.js'
import { isTwitchAuthCode, isTwitchAuthUserToken, isTwitchAuthError, isTwitchAuthCodeRequest, isTwitchAuthUserTokenRequest } from '../types/authtypes.js'

import { verify_event_message } from '../services/twitchverify.js'

const AUTH_REDIRECT_URI = new URL(`https://${sslConfig.hostName}/twitch/oauth`)
const AUTH_STATES: string[] = []
const SLITHER_SCOPES = ['channel:read:redemptions', 'channel:manage:redemptions']

const rawParser = bodyParser.raw({ type: 'application/json' })
const jsonParser = bodyParser.json()
const router = express.Router()

//TODO: Move WebSocket client implementation to its own service file and have the various routes make WebSocket connections when needed.
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

// TODO: Implement /event endpoint to process twitch event messages in a more general manner than the endpoint below
router.post('/event', (req, res) => {
	console.log(`/event endpoint hit on /twitch route with body: ${req.body}`)
	res.sendStatus(200)
})

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

// OAuth endpoint. When the user logs into Twitch and authorizes slitherbot to access their Twitch account resources
// pursuant to using the link on auth.ejs (served by /twitch/index), Twitch servers will hit /twitch/oauth with an auth code.
// We should use the fetch() API to send this auth code to Twitch's OAuth system after which we will receive the
// User Access Token in the body of a response. Insert or update the token into the database to allow the user
// to use this app's features. Then we rediret the user to SlitherBot's index page.
router.get('/oauth', async (req, res) => {

	if(isTwitchAuthError(req.query as TwitchAuthError)) {
		console.log(`OAuth Error received from Twitch: ${JSON.stringify(req.query)}`)
		return res.sendStatus(204)
	}

	if(!isTwitchAuthCode(req.query as TwitchAuthCode)) {
		console.log(`Received a call to GET /twitch/oauth that was neither an error nor an auth code. Query: ${JSON.stringify(req.query)}`)
		return res.sendStatus(400)
	}

	// Process a request with any given state only once
	const stateIndex = AUTH_STATES.indexOf(req.query.state as string);
	if(stateIndex === -1) {
		// TODO: Treat this error as a security risk and elevate the logging
		console.log(`Received an auth code with an invalid or already used state value: ${req.query.state}. Rejecting request.`)
		return res.sendStatus(400)
	}
	AUTH_STATES.splice(stateIndex, 1)
	
	// We have received an Authorization Code from Twitch that we can use to obtain a User Access Token for a user wanting to use
	// SlitherBot. We can send our response to Twitch. POST the auth code to https://id.twitch.tv/oauth2/token with query params:
	// { client_id, client_secret, code, grant_type, redirect_uri }
	const tokenRequest: TwitchAuthUserTokenRequest = {
		client_id: `${twitchConfig.clientId}`,
		client_secret: `${twitchConfig.clientSecret}`,
		code: `${req.query.code}`,
		grant_type: 'authorization_code',
		redirect_uri: `https://${sslConfig.hostName}/twitch/oauth`
	}

	const twitchTokenResponse = await fetch(`https://id.twitch.tv/oauth2/token`, {
		method: 'POST',
		body: new URLSearchParams(tokenRequest)
	})

	// TODO: Elevate this logging to urgent priority as this may indicate a change in Twitch's OAuth system that breaks our integration with it.
	const twitchTokenData = await twitchTokenResponse.json() as TwitchAuthUserToken
	if(!isTwitchAuthUserToken(twitchTokenData)) {
		console.log(`SlitherBot has hit Twitch's OAuth system with an authorization code but received an unexpected object in the ` +
					`response. Token type indicated in the response should be 'bearer': ${(twitchTokenData as any).token_type}\n` +
					`Investigate on urgent priority as this may indicate a change in Twitch's OAuth system.`)
		return
	}
	const obtainment_timestamp = Date.now()

	// Everything seems in order. Store the token in our database and redirect the user. This also implicitly sends a 301 response to Twitch /thumbup.
	await fetch(new Request(`https://id.twitch.tv/oauth2/validate`, { method: 'GET',
																	  headers: { Authorization: `OAuth ${twitchTokenData.access_token}` } }
	)).then(async (res) => {
		const validatedToken = await res.json() as TwitchAuthTokenValidationResponse
		await upsertUser({
			channel_id: validatedToken.user_id,
			expires_in: validatedToken.expires_in,
			access_token: twitchTokenData.access_token,
			refresh_token: twitchTokenData.refresh_token,
			scopes: JSON.stringify(twitchTokenData.scope),
			obtainment_timestamp: obtainment_timestamp
		}).then((res) => {
			console.log(`OAuth flow completed with InsertResult: ${res}`)
		}).catch((err) => {
			console.log(`Error during upsertUser: ${err}`)
		})
	})

	// TODO: Send user to the "dashboard" page for alerts.
	// For now, just indicate the JavaScript type of the received token.
	const tokenType = typeof twitchTokenData.access_token
	res.redirect(`/twitch/index?tokenType=${tokenType}`)
	
	return

})


// User has clicked Authorize Me! on /twitch/auth and now we need to create a State value
// and redirect the user to Twitch's OAuth system
router.get('/auth', (req, res) => {

	const STATE = crypto.randomBytes(32).toString('hex')
	AUTH_STATES.push(STATE)

	let scopes = '';
	for(let scope of SLITHER_SCOPES) scopes += `${encodeURIComponent(scope)}+`
	scopes = scopes.substring(0, scopes.length-1)

	let twitchAuthParams = {
		clientid: twitchConfig.clientId,
		redirect_uri: AUTH_REDIRECT_URI,
		response_type: "code",
		scope: scopes,
		state: STATE
	}

	res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${twitchAuthParams.clientid}&redirect_uri=${twitchAuthParams.redirect_uri}&response_type=${twitchAuthParams.response_type}&scope=${twitchAuthParams.scope}&state=${twitchAuthParams.state}`)

})

// TODO: Integrate this better into the frontend. We have functionality, let's create a better application around it.
// Auth page for slitherbot users. Currently just a button labeled "Authorize Me!" that redirects them to a Twitch login.
router.get('/index', (req, res) => {

	if(!req.query.token) return res.render('twitch/auth')

	res.render('twitch/index', { token: req.query.token })

})

// TODO: Implement test functions for eventsub testing and use the /twitch/event endpoint to filter out and handle test messages.

export default { router }
export { router }