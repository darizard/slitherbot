// External modules
import express from 'express'
import bodyParser from 'body-parser'
import crypto from 'crypto'

// .env configuration imports
import { hostConfig, twitchConfig } from '../config.js'

// Middleware
import { verifyTwitchOAuth } from '../middleware/twitchauth.js'

// Internal logic modules
import { setupNewSlitherUser } from '../services/slitherauth.js'
import { addSlitherTokenCookie, signSlitherToken, verifySlitherToken } from '../services/slitherauth.js'
import { addAuthState, deleteAuthState } from '../services/twitchauth.js'
import { SlitherEventSub as EvtSub } from '../classes/eventsub.js'

// Twitch OAuth redirect URI
const AUTH_REDIRECT_URI = new URL(`https://${hostConfig.hostName}/slither/auth/oauth`)

// JSON parsing Express middleware
const jsonParser = bodyParser.json()

// Router to export
const authRouter = express.Router()

// Issues a refreshed Slither access token to the user via a secure browser cookie, or if the refresh token is invalid,
// clears the auth token pair from the requester's browser
authRouter.post('/refresh', jsonParser, async (req, res) => {

	const refreshToken = req.cookies?.refresh_token
	if(!refreshToken) return res.status(401).json({error: `Refresh token not provided`})

	const userId = await verifySlitherToken(refreshToken, 'refresh')
	if(!userId) {

		res.clearCookie('access_token')
		res.clearCookie('refresh_token')
		return res.status(401).json({error: `Session expired`})

	}

	const accessToken = await signSlitherToken(userId, 'access')
	const newRefreshToken = await signSlitherToken(userId, 'refresh')
	if(!accessToken || !newRefreshToken) console.error(`attempt to sign access token using userId ${userId} failed in /auth/refresh`)

	addSlitherTokenCookie(res, accessToken, 'access')
	addSlitherTokenCookie(res, newRefreshToken, 'refresh')

	return res.sendStatus(204)

})

// User has opted to authorize Slither to use their data and now we need to create a State value
// and redirect the user to Twitch's OAuth system to complete the process
authRouter.get('/twitch', (_req, res) => {

	const state = crypto.randomBytes(32).toString('hex')
	addAuthState(state)
	
	setTimeout(() => { deleteAuthState(state) }, 1000 * 60 * 10) // State is valid for 10 minutes. After that, remove it from the array so it cannot be used to authenticate.

	const scopes = EvtSub.getURIEncodedScopes()

	res.redirect(`https://id.twitch.tv/oauth2/authorize`
				+ `?client_id=${twitchConfig.clientId}` 
				+ `&redirect_uri=${AUTH_REDIRECT_URI}`
				+ `&response_type=code`
				+ `&scope=${scopes}`
				+ `&state=${state}`)

})

// OAuth redirect endpoint. When the user logs into Twitch and authorizes slitherbot to access their Twitch account resources
// pursuant to using the link on auth.ejs (served by /slither/home), Twitch servers will hit /slither/oauth with an auth code.
// We should use the fetch() API to send this auth code to Twitch's OAuth system after which we will receive the
// User Access Token in the body of a response. Insert or update the token into the database to allow the user
// to use this app's features. Then we rediret the user to SlitherBot's home page.
authRouter.get('/oauth', verifyTwitchOAuth,  async (req, res) => {

	const twitchId = await setupNewSlitherUser(req.query[`code`] as string)
	if(!twitchId) return res.sendStatus(204)

	// To this point, we have acquired Twitch tokens for the given user. Sign our Slither authentication tokens and issue cookies.
	const signedRefreshToken = await signSlitherToken(twitchId, 'refresh')
	const signedAccessToken = await signSlitherToken(twitchId, 'access')
	addSlitherTokenCookie(res, signedRefreshToken, 'refresh')
	addSlitherTokenCookie(res, signedAccessToken, 'access')

	return res.redirect(`/slither/home`)
})

// TODO: Bake this into the default route instead of having an /auth endpoint: If user logged in, redirect to home.
// 		 If user not logged in, do auth.
// Serves an auth page the asks the user to authorize Slither to access their Twitch data
authRouter.get('/', async (req, res) => {

	// If this returns a userID, the user is already logged in and should not be presented the auth view
	if(await verifySlitherToken(req.cookies?.access_token, 'access')) {
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

