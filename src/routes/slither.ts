import express from 'express'
import bodyParser from 'body-parser'
import crypto from 'crypto'

import { WebSocket } from 'ws'

import { ssl as sslConfig, twitch as twitchConfig, jwt as jwtConfig } from '../config.js' // Needed in auth

import { registerSlitherUser } from '../services/slitherauth.js'
import type { TwitchAuthCodeRequest } from '../types/authtypes.js'

const AUTH_REDIRECT_URI = new URL(`https://${sslConfig.hostName}/slither/oauth`)
const AUTH_STATES: string[] = []
const SLITHER_SCOPES = ['channel:read:redemptions', 'channel:manage:redemptions']

const rawParser = bodyParser.raw({ type: 'application/json' })
const jsonParser = bodyParser.json()
const router = express.Router()

//TODO: Move WebSocket client implementation to its own service file and have the various routes make WebSocket connections when needed.
let twitchWS = new WebSocket(`wss://${sslConfig.hostName}/slither?clientType=controller`);
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
			twitchWS = new WebSocket(`wss://${sslConfig.hostName}/slither?clientType=controller`)

        }
    }, 15000) // Check for non-open and non-connecting socket every 15 seconds

	console.log("Twitch controller WebSocket connected to local WebSocket server.")

}

import { verifyEventMessage } from '../services/twitchauth.js'
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
	if(!verifyEventMessage(req)) {
		console.log(`Received unverified event message at URL: ${req.url}`)
		return res.sendStatus(401)
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
		// TODO: Upsert the subscription information in our database

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

		// TODO: Add event subscriptions to the backend DB schema
		// TODO: Remove the subscription information in our database OR set as revoked
	}

	else {
		res.sendStatus(204);
		console.log(`Unkonwn message type received from Twitch: ${req.headers[messageType]}`)
	}

})

// TODO: Implement /event endpoint to process twitch event messages in a more general manner than the endpoint below
router.post('/event', (req, res) => {
	console.log(`POST /event endpoint hit on /slither route with body: ${req.body}`)
	res.sendStatus(200)
})

router.get('/alerts', (req, res) => {

	res.render("slither/alerts", {
		hostName: `${sslConfig.hostName}`
	})

})

// TODO: Is this how we want to hit the alerts endpoint? Not yet a functional route.
router.get('/alerts/:token', (req, res) => {

	console.log(`alerts hit for channel ${req.params.token}`)
	res.render("slither/alerts", { channelname: req.params.token })

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

import { registerTwitchUser, oauthStateOrParamProblem, fetchTwitchUserAccessToken, validateTokenAndGetUserID } from '../services/twitchauth.js'
// OAuth endpoint. When the user logs into Twitch and authorizes slitherbot to access their Twitch account resources
// pursuant to using the link on auth.ejs (served by /slither/home), Twitch servers will hit /slither/oauth with an auth code.
// We should use the fetch() API to send this auth code to Twitch's OAuth system after which we will receive the
// User Access Token in the body of a response. Insert or update the token into the database to allow the user
// to use this app's features. Then we rediret the user to SlitherBot's home page.
router.get('/oauth', async (req, res) => {

	// Validates the params of the request, including state, and removes the state from the array if state is valid.
	// Return true and sets the params of the res object if it identifies any problem.
	if(await oauthStateOrParamProblem(AUTH_STATES, req, res)) return res.end()
	
	// We have received an Authorization Code from Twitch that we can use to obtain a User Access Token for a user wanting to use
	// SlitherBot. We can send our response to Twitch. POST the auth code to https://id.twitch.tv/oauth2/token with query params:
	// { client_id, client_secret, code, grant_type, redirect_uri }
	const twitchTokenData = await fetchTwitchUserAccessToken(req)
	if(!twitchTokenData) return res.redirect(`/slither/home?tokenType=${typeof (twitchTokenData as any).access_token}`)
    const obtainmentTimestamp = Date.now()

	// Immediately validate the access token to get the userID from Twitch
	const twitchUserID = await validateTokenAndGetUserID(twitchTokenData.access_token)
	if(!twitchUserID) return res.redirect(`/slither/home?tokenType=${typeof (twitchTokenData as any).access_token}`)

	// Everything seems in order. Store the token in our database and register the user for the SlitherBot application in general.
	// Then, redirect the user. This also implicitly sends a 302 response to Twitch /thumbup.

	// Store Twitch access tokens in the database. This function will print a log message to the console in case of a DB error.
	// We have already received and validated the access tokens as part of the OAuth flow so in the event of an error, keep going.
	await registerTwitchUser(twitchTokenData, twitchUserID, obtainmentTimestamp)

	// TODO: To this point, we have acquired Twitch tokens for the given user. We should have asked for the Slither refresh token cookie
	const registeredRefreshToken = await registerSlitherUser(twitchUserID)

	// TODO: Implement JWTs before sending these out to browsers raw

	/*
	if(registeredRefreshToken){ 
		res.cookie('refresh_token', registeredRefreshToken, {
			httpOnly: true,
			secure: true,
			sameSite: 'strict'
		})
	}
	*/

	// TODO: Send user to the "dashboard" page for alerts.
	// For now, just indicate the JavaScript type of the received token.
	const tokenType = typeof twitchTokenData.access_token
	return res.redirect(`/slither/home?tokenType=${tokenType}`)
})


// User has clicked Authorize Me! on /slither/auth and now we need to create a State value
// and redirect the user to Twitch's OAuth system
router.get('/auth', (req, res) => {

	const STATE = crypto.randomBytes(32).toString('hex')
	AUTH_STATES.push(STATE)
	setTimeout(() => {
		const stateIndex = AUTH_STATES.indexOf(STATE)
		if(stateIndex !== -1) {
			AUTH_STATES.splice(stateIndex, 1)
		}
	}, 1000 * 60 * 10) // State is valid for 10 minutes. After that, remove it from the array so it cannot be used to authenticate.

	let scopes = '';
	for(let scope of SLITHER_SCOPES) scopes += `${encodeURIComponent(scope)}+`
	scopes = scopes.substring(0, scopes.length-1)

	let twitchAuthParams: TwitchAuthCodeRequest = {
		client_id: twitchConfig.clientId,
		redirect_uri: AUTH_REDIRECT_URI,
		response_type: "code",
		scope: scopes,
		state: STATE
	}

	res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${twitchAuthParams.client_id}&redirect_uri=${twitchAuthParams.redirect_uri}&response_type=${twitchAuthParams.response_type}&scope=${twitchAuthParams.scope}&state=${twitchAuthParams.state}`)

})

// GET /slither/home with no tokenType parameter renders the slither/auth.ejs view instead.
// GET /slither/home with a tokenType parameter renders slither/home.ejs while passing along the tokenType parameter
router.get('/home', (req, res) => {

	if(!req.query.tokenType) return res.render('slither/auth')
	
	res.render(`slither/home`, { tokenType: req.query.tokenType })
	
})

// GET /slither/:routeName that is not already handled redirects to /slither/home instead, with a tokenType of null
router.get('/:badroute', (req, res) => {

	console.log(`Got GET request to /slither/${req.params.badroute}. Redirecting to /slither/`)
	res.redirect(`/slither/home?tokenType=${null}`)

})


// GET /slither simply redirects the user to /slither/home
// TODO: Integrate this better into the frontend. We have functionality, let's create a better application around it.
// Auth page for slitherbot users. Currently just a button labeled "Authorize Me!" that redirects them to a Twitch login.
router.get('/', (req, res) => {

	if(!req.query.tokenType) return res.redirect('slither/home')

	return res.redirect(`slither/home?tokenType=${req.query.tokenType}`)

})

// TODO: Implement test functions for eventsub testing and use the /slither/event endpoint to filter out and handle test messages.

export default { router }
export { router }