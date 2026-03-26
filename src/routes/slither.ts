import express from 'express'
import bodyParser from 'body-parser'
import crypto from 'crypto'

import { ssl as sslConfig, twitch as twitchConfig, ws as wsConfig } from '../config.js' // Needed in auth

import { SlitherControllerClientWebSocket } from '../classes/slitherws.js'

import type { TwitchAuthCodeRequest } from '../types/authtypes.js'
import { registerOrLoginSlitherUser, signSlitherToken, verifySlitherToken, refreshSlitherAccessToken, addSlitherTokenCookie, verifyAlertsConnectionToken } from '../services/slitherauth.js'
import { registerTwitchUser, oauthStateOrParamProblem, fetchUserAccessToken, validateUserAccessToken } from '../services/twitchauth.js'
import { AlertMessage } from '../types/slitherwstypes.js'

const AUTH_REDIRECT_URI = new URL(`https://${sslConfig.hostName}/slither/oauth`)
const AUTH_STATES = new Set<string>

// TODO: Move these into a separate file and include more information about all the events we
// want to subscribe to. Or maybe a DB table, but this is probably static info we can just keep
// in a .ts file
const SLITHER_SCOPES: string[] = ['channel:read:redemptions', 'channel:manage:redemptions']

const rawParser = bodyParser.raw({ type: 'application/json' })
const jsonParser = bodyParser.json()
const router = express.Router()

const ws = new SlitherControllerClientWebSocket()
ws.connect(wsConfig.controllerSecret) // unawaited async

import { verifyEventMessage } from '../services/twitchauth.js'
import { getAlertsTokenForUser, getUserIDForRefreshToken } from '../db/queries/slitherauth.js'
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
// TODO: Implement /event endpoint to process twitch event messages in a more general manner than the endpoint above
router.post('/event', rawParser, async (req, res) => {

	if(!verifyEventMessage(req)) {
		console.log(`Received unverified event message with request URL: ${req.url}`)
		return res.sendStatus(401)
	}

	const messageId = req.headers['twitch-eventsub-message-id']?.toString()
	// TODO: Use eventsubclient to handle messageId in memory

	const messageTimestamp = req.headers['twitch-eventsub-message-timestamp'] as string
	if(Date.parse(messageTimestamp ?? '') < Date.now() - 1000 * 60 * 10) {
		// TODO: Elevate logging as a security issue
		console.error(`Received Twitch message more than 10 minutes old. Investigate.`)
		return res.sendStatus(401)
	}

	// Make sure body is parseable json
	try { req.body = JSON.parse(req.body) }
	catch(e) { 
		// TODO: Elevate log as Twitch has changed or added something I need to know about
		console.error('Error parsing req.body as JSON: ', e)
		res.sendStatus(204)
	}

	const userId = req.body.subscription.condition.broadcaster_user_id as string

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

		return
	}

	else if(messageType === 'notification') {

		if(req.body.subscription.type !== 'channel.channel_points_custom_reward_redemption.add') {
			return res.sendStatus(204)
		}

		// respond with 204 No Content...
		res.sendStatus(204)

		// TODO: Build alert message based on event type and channel id
		// send the reward redemption info to the WebSocket server
		const wsmsgobj: AlertMessage = { type: 'alert', 
										 userId: userId,
										 data: { imageFile: 'RareCharTP-Trim.gif', 
												audioFile: 'DiscordMute.mp3', 
												alertText: 'Reward Text!', 
												duration: 8000 } }
		ws.send(wsmsgobj)

		return
	}

	else if(messageType === 'revocation') {
		res.sendStatus(204);

		console.log(`Subscription revoked by Twitch! Reason: ${req.body.subscription.status}`)
		console.log(`Full message body: ${JSON.stringify(req.body)}`)

		// TODO: Add event subscriptions to the backend DB schema
		// TODO: Remove the subscription information in our database OR set as revoked

		return
	}

	else {
		res.sendStatus(204);
		console.log(`Unknown message type received from Twitch: ${req.headers[messageType]}`)

		return
	}

})

// TODO: Implement user-specific alerts websocket connections on the client side
router.get('/alerts/:paramToken', async (req, res) => {

	const alertsJwt = await verifyAlertsConnectionToken(req.params.paramToken)

	res.render("slither/alerts", { hostName: sslConfig.hostName,
									connectionToken: alertsJwt })

})

// Obtain the alerts token for the given user intended for use in an OBS browser source URL. This is not strictly private information
router.post('/alerts/token', jsonParser, async (req, res) => {

	const userId = await verifySlitherToken(req.cookies?.access_token, 'access')
	if(!userId) return res.status(401).json({error: `Invalid access token when requesting alerts token at POST /slither/alerts/token`})

	const alertsToken = await getAlertsTokenForUser(userId)
	if(!alertsToken) return res.status(500).json({error: `Could not obtain alerts token for given user at POT /slither/alerts/token`})
	
	return res.status(200).json({ alerts_token: alertsToken })

})

router.get('/alerts', (req, res) => {

	res.render("slither/alerts", {
		hostName: sslConfig.hostName,
		connectionToken: undefined
	})

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

router.post('/auth/refresh', jsonParser, async (req, res) => {

	const refreshToken = req.cookies?.refresh_token
	if(!refreshToken) {
		return res.status(401).json({error: `Refresh token not provided`})
	}

	const userId = await verifySlitherToken(refreshToken, 'refresh')
	if(!userId) {
		res.clearCookie('refresh_token')
		return res.status(401).json({error: `Session expired`})
	}

	const accessToken = await signSlitherToken(userId, 'access')
	if(!accessToken) console.error(`undefined value detected for access token cookie being issued in /auth/refresh`)

	addSlitherTokenCookie(res, accessToken, 'access')

	return res.sendStatus(204)

})

// User has clicked Authorize Me! on /slither/auth and now we need to create a State value
// and redirect the user to Twitch's OAuth system
router.get('/auth/twitch', (req, res) => {

	const state = crypto.randomBytes(32).toString('hex')
	AUTH_STATES.add(state)

	setTimeout(() => {

		const stateExists = AUTH_STATES.has(state)
		if(stateExists) {
			AUTH_STATES.delete(state)
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
		state: state
	}

	res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${twitchAuthParams.client_id}&redirect_uri=${twitchAuthParams.redirect_uri}&response_type=${twitchAuthParams.response_type}&scope=${twitchAuthParams.scope}&state=${twitchAuthParams.state}`)

})

router.get('/auth', async (req, res) => {

	// If this returns a userID, the user is already logged in and should not be presented the auth view
	if(await verifySlitherToken(req.cookies?.access_token, 'access')) {
		return res.redirect('/slither/home')
	}

	res.render('slither/auth')

})

// OAuth endpoint. When the user logs into Twitch and authorizes slitherbot to access their Twitch account resources
// pursuant to using the link on auth.ejs (served by /slither/home), Twitch servers will hit /slither/oauth with an auth code.
// We should use the fetch() API to send this auth code to Twitch's OAuth system after which we will receive the
// User Access Token in the body of a response. Insert or update the token into the database to allow the user
// to use this app's features. Then we rediret the user to SlitherBot's home page.
router.get('/oauth', jsonParser, async (req, res) => {

	// Validates the params of the request, including state, and removes the state from the array if state is valid.
	// Return true and sets the params of the res object if it identifies any problem.
	if(await oauthStateOrParamProblem(AUTH_STATES, req, res)) return res.end()
	
	// We have received an Authorization Code from Twitch that we can use to obtain a User Access Token for a user wanting to use
	// SlitherBot. We can send our response to Twitch. POST the auth code to https://id.twitch.tv/oauth2/token with query params:
	// { client_id, client_secret, code, grant_type, redirect_uri }
	const twitchTokenData = await fetchUserAccessToken(req.query.code as string)
    const obtainmentTimestamp = Date.now()

	// Immediately validate the access token to get the userID from Twitch
	const twitchUserID = await validateUserAccessToken(twitchTokenData.access_token)
	if(!twitchUserID) return res.status(500).end()

	// Everything seems in order. Store the token in our database and register the user for the SlitherBot application in general.
	// Then, redirect the user. This also implicitly sends a 302 response to Twitch /thumbup.

	// Store Twitch access tokens in the database. This function will print a log message to the console in case of a DB error.
	// Also if we already have an old user access token, be a good client and send a revocation request to Twitch
	// We have already received and validated the access tokens as part of the OAuth flow so in the event of an error, keep going.
	await registerTwitchUser(twitchTokenData, twitchUserID, obtainmentTimestamp)

	// To this point, we have acquired Twitch tokens for the given user. We need to add or update the Slither refresh token
	// in the user's browser cookies
	const signedRefreshToken = await registerOrLoginSlitherUser(twitchUserID)
	if(!signedRefreshToken) return res.sendStatus(500)
	const signedAccessToken = await signSlitherToken(twitchUserID, 'access')

	addSlitherTokenCookie(res, signedRefreshToken, 'refresh')
	addSlitherTokenCookie(res, signedAccessToken, 'access')

	return res.redirect(`/slither/home`)
})

// GET /slither/home with no tokenType parameter renders the slither/auth.ejs view instead.
// GET /slither/home with a tokenType parameter renders slither/home.ejs while passing along the tokenType parameter
router.get('/home', async (req, res) => {

	let navItems: { label: string, href: string }[] = []

	let userId = await verifySlitherToken(req.cookies?.access_token, 'access')
	if(!userId) {
		const refreshResult = await refreshSlitherAccessToken(req.cookies?.refresh_token)
		if(!refreshResult || !refreshResult.accessToken) return res.redirect(`/slither/auth`)

		addSlitherTokenCookie(res, refreshResult.accessToken, 'access')

		userId = refreshResult.userId
	}

	navItems.push({href: `/slither/logout`, label: 'Logout'})

	const alertsToken = await getAlertsTokenForUser(userId)
	const alertsUrl = (() => {
		if(!alertsToken) return ''
		return `https://${sslConfig.hostName}/slither/alerts/${alertsToken}`
	})()

	res.render(`slither/home`, {
		alertsUrl: alertsUrl,
		navItems: navItems
	})
	
})

router.get('/logout', (req, res) => {

	res.clearCookie('access_token')
	res.clearCookie('refresh_token')
	res.redirect('/slither/home')

})

// GET /slither simply redirects the user to /slither/home
router.get('/', (req, res) => {

	return res.redirect(`/slither/home`)

})

// TODO: Implement test functions for eventsub testing and use the /slither/event endpoint to filter out and handle test messages.

// GET /slither/:routeName that is not already handled redirects to /slither/home instead, with a tokenType of null
router.get('/:badroute', (req, res) => {

	console.log(`Got GET request to /slither/${req.params.badroute}. Redirecting to /slither/home`)
	res.redirect(`/slither/home`)

})


export default { router }
export { router }