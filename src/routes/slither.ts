// External modules
import express from 'express'

// Internal TS types and runtime type guards
import type { SlitherAuthenticatedRequest } from '../types/authtypes.js'

// Express Middleware
import { authenticateSlitherUser } from '../middleware/slitherauth.js'

// Services
import { getHomePageData } from '../services/slither.js'

const slitherRouter = express.Router()

slitherRouter.get('/home', authenticateSlitherUser, async (req: SlitherAuthenticatedRequest, res) => {

	// Fetch and process home page data for the authenticated user
	const homePageData = await getHomePageData(req.twitchId ?? '')

	res.render(`slither/home`, { 
		data: {
			alertsUrl: homePageData.alertsUrl,
			navItems: JSON.stringify(homePageData.navItems),
			alerts: homePageData.alertsMap,
			defaultCategory: homePageData.defaultCategory,
			defaultAlertType: homePageData.defaultAlertType
		}
	})

})

slitherRouter.get('/demo', (_req, res) => {

	res.statusCode = 200
	res.render('slither/demo', {
		data: {
			alertsUrl: 'https://dari.monster/slither/alerts/yourURL',
			navItems: JSON.stringify([{
				href: '/slither/home', label: 'Exit Demo'
			}]),
			alerts: new Map(),
			defaultCategory: 'Follows',
			defaultAlertType: 'channel.follow'
		}
	})

})

slitherRouter.get('/logout', (_req, res) => {

	res.clearCookie('access_token')
	res.clearCookie('refresh_token')
	res.redirect('/slither/home')

})

// TODO: For the base route, if Slither can authenticate the user, redirect to home. Otherwise nudge them to authenticate
// with Twitch
// GET /slither simply redirects the user to /slither/home
slitherRouter.get('/', (_req, res) => {

	return res.redirect(`/slither/home`)

})

// Any invalid GET route redirects to GET /slither/home instead with a tokenType of null
slitherRouter.get('/:badroute', (req, res) => {

	console.log(`Got GET request to /slither/${req.params.badroute}. Redirecting to /slither/home`)
	res.redirect(`/slither/home`)

})

export default slitherRouter