// External modules
import express from 'express'
import bodyParser from 'body-parser'
import crypto from 'crypto'

// .env configuration imports
import { sslConfig, twitchConfig } from '../config.js'

// Internal TS types and runtime type guards
import authtypes from '../types/authtypes.js'

// Internal logic modules
import slitherauth from '../services/slitherauth.js'
import twitchauth from '../services/twitchauth.js'
import { SlitherEventSub as EvtSub } from '../classes/eventsub.js'

// Direct DB queries
import slithersql from '../db/queries/slitherauth.js'

const AUTH_REDIRECT_URI = new URL(`https://${sslConfig.hostName}/slither/oauth`)
const AUTH_STATES = new Set<string>()

const jsonParser = bodyParser.json()
const authRouter = express.Router()

// Issues a refreshed Slither access token to the user via a secure browser cookie, or if the refresh token is invalid,
// clear it from the requester's browser
authRouter.post('/refresh', jsonParser, async (req, res) => {

	const refreshToken = req.cookies?.refresh_token
	if(!refreshToken) return res.status(401).json({error: `Refresh token not provided`})

	const userId = await slitherauth.verifySlitherToken(refreshToken, 'refresh')
	if(!userId) {

		res.clearCookie('refresh_token')
		return res.status(401).json({error: `Session expired`})

	}

	const accessToken = await slitherauth.signSlitherToken(userId, 'access')
	if(!accessToken) console.error(`attempt to sign access token using userId ${userId} failed in /auth/refresh`)

	slitherauth.addSlitherTokenCookie(res, accessToken, 'access')

	return res.sendStatus(204)

})

// User has opted to authorize Slither to use their data and now we need to create a State value
// and redirect the user to Twitch's OAuth system to complete the process
authRouter.get('/twitch', (_req, res) => {

	const state = crypto.randomBytes(32).toString('hex')
	AUTH_STATES.add(state)

	setTimeout(() => {

		if(AUTH_STATES.has(state)) {
			AUTH_STATES.delete(state)
		}
		
	}, 1000 * 60 * 10) // State is valid for 10 minutes. After that, remove it from the array so it cannot be used to authenticate.

	const scopes = EvtSub.getURIEncodedScopes()

	let twitchAuthParams: authtypes.TwitchAuthCodeRequest = {
		client_id: twitchConfig.clientId,
		redirect_uri: AUTH_REDIRECT_URI,
		response_type: "code",
		scope: scopes,
		state: state
	}

	res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${twitchAuthParams.client_id}&redirect_uri=${twitchAuthParams.redirect_uri}&response_type=${twitchAuthParams.response_type}&scope=${twitchAuthParams.scope}&state=${twitchAuthParams.state}`)

})

// OAuth endpoint. When the user logs into Twitch and authorizes slitherbot to access their Twitch account resources
// pursuant to using the link on auth.ejs (served by /slither/home), Twitch servers will hit /slither/oauth with an auth code.
// We should use the fetch() API to send this auth code to Twitch's OAuth system after which we will receive the
// User Access Token in the body of a response. Insert or update the token into the database to allow the user
// to use this app's features. Then we rediret the user to SlitherBot's home page.
authRouter.get('/oauth', async (req, res) => {

	if(typeof req.query['state'] !== 'string' || !AUTH_STATES.has(req.query['state'])) {
		// TODO: Elevate error as a security risk
		console.log(`Received an auth code with an invalid or already used state value: ${req.query['state']}. Rejecting request.`)
		return res.sendStatus(400)
	}
	AUTH_STATES.delete(req.query['state'])

	if(authtypes.isTwitchAuthError(req.query)) {
		console.log(`OAuth Error received from Twitch: ${JSON.stringify(req.query)}`)
		res.status(302)
		res.location(`/slither/home`)
		return res.end()
	}

	if(!authtypes.isTwitchAuthCode(req.query)) {
		console.log(`Received a call to GET /slither/oauth that was neither an error nor an auth code. Query: ${JSON.stringify(req.query)}`)
		return res.sendStatus(400)
	}

	// We have received an Authorization Code from Twitch that we can use to obtain a User Access Token for a user wanting to use
	// SlitherBot. We can send our response to Twitch. POST the auth code to https://id.twitch.tv/oauth2/token with query params:
	// { client_id, client_secret, code, grant_type, redirect_uri }
	const twitchTokenData = await twitchauth.fetchUserAccessToken(req.query.code as string)
    const obtainmentTimestamp = Date.now()

	// Immediately validate the access token to get the userID from Twitch
	const twitchUserID = await twitchauth.validateUserAccessToken(twitchTokenData.access_token)
	if(!twitchUserID) return res.sendStatus(500)

	// Store Twitch access tokens in the database. This function will print a log message to the console in case of a DB error.
	// Also if we already have an old user access token, be a good client and send a revocation request to Twitch
	// We have already received and validated the access tokens as part of the OAuth flow so in the event of an error, keep going.
	await twitchauth.registerTwitchUser(twitchTokenData, twitchUserID, obtainmentTimestamp)

	// Now register the user with Slither. If the user's twitch ID is already mapped to an alerts token, treat this as a simple login
	// and move on to issuing cookies
	if((await slitherauth.registerSlitherUser(twitchUserID)) === null) return res.sendStatus(500)

	// To this point, we have acquired Twitch tokens for the given user. Sign our Slither authentication tokens and issue cookies.
	const signedRefreshToken = await slitherauth.signSlitherToken(twitchUserID, 'refresh')
	const signedAccessToken = await slitherauth.signSlitherToken(twitchUserID, 'access')
	slitherauth.addSlitherTokenCookie(res, signedRefreshToken, 'refresh')
	slitherauth.addSlitherTokenCookie(res, signedAccessToken, 'access')

	// We have now sucessfully logged in the user. If we set the require_login flag in the DB, unset it now.
	await slithersql.setLoginRequiredValue(twitchUserID, false)

	return res.redirect(`/slither/home`)
})

// TODO: Bake this into the default route instead of having an /auth endpoint: If user logged in, redirect to home.
// 		 If user not logged in, do auth.
// Serves an auth page the asks the user to authorize Slither to access their Twitch data
authRouter.get('/', async (req, res) => {

	// If this returns a userID, the user is already logged in and should not be presented the auth view
	if(await slitherauth.verifySlitherToken(req.cookies?.access_token, 'access')) {
		return res.redirect('/slither/home')
	}

	const navItems: { label: string, href: string }[] = [{href: `/slither/logout`, label: 'Logout'}]

	res.render('slither/auth', {
		data: {
			navItems: JSON.stringify(navItems)
		}
	})

})

export default authRouter

