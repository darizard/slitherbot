// External modules
import express from 'express'

// .env configuration imports
import { sslConfig } from '../config.js'

// Internal TS types and runtime type guards
import alerttypes from '../types/alerttypes.js'
import authtypes from '../types/authtypes.js'
import eventsubtypes from '../types/eventsubtypes.js'

// Express Middleware
import { authenticateSlitherUser } from '../middleware/slitherauth.js'

// Direct DB queries
import eventalertssql from '../db/queries/eventalerts.js'
import slithersql from '../db/queries/slitherauth.js'

const slitherRouter = express.Router()

// Protected route. Redirect to /slither/auth if the browser cookies do not contain a valid authentication token.
slitherRouter.get('/home', authenticateSlitherUser, async (req: authtypes.SlitherAuthenticatedRequest, res) => {

	const navItems: { label: string, href: string }[] = [
		{href: `/slither/demo`, label: 'Demo'},
		{href: `/slither/logout`, label: 'Logout'}
	]
	const alertsToken = await slithersql.getAlertsTokenForUser(req.twitchId)
	const alertsUrl = alertsToken ? `https://${sslConfig.hostName}/slither/alerts/${alertsToken}` : ''

	const alertsArr = await eventalertssql.getUserAlerts(req.twitchId)

	// Build the data to send to the browser upon page load. This will be a nested Map. 
	// First level: <EventAlertCategory, Map>
	// Second level: <SubscriptionType, EventAlertDetails>
	const alertsMap = (() => {
		// Instantiate the first level of the map
		const rtnMap: Map<alerttypes.EventAlertCategory, Map<string, Omit<alerttypes.EventAlertDetails, 'imageFile' | 'audioFile' | 'category' | 'subscriptionType'>>> = new Map()
		// Iterate through all of the current user's alerts and assign each a place in the data structure
		alertsArr.forEach((alert) => {
			// Establish the category if necessary
			if(!rtnMap.has(alert.category)) { rtnMap.set(alert.category, new Map()) }
			
			// Get the Subscription Type and establish its details in the second level map under the current category
			// This regex removes all '.' and ':' characters from subscriptionType before passing to the frontend
			const alertTypePretty = alert.subscriptionType.replace(/[\.:]/g, '').toLowerCase()
			const alertsForCategory = rtnMap.get(alert.category)
			if(!alertsForCategory?.has(alertTypePretty)) { alertsForCategory?.set(alertTypePretty, {

				// Set up the alert details from the database inside the second level map
				subscriptionId: alert.subscriptionId,
				imageFileName: alert.imageFileName,
				audioFileName: alert.audioFileName,
				alertText: alert.alertText,
				alertDuration: alert.alertDuration,
				audioVolume: alert.audioVolume,
				alertDescription: alert.alertDescription

				})
			}
		})
		return rtnMap
	})()

	const defaultCategory: alerttypes.EventAlertCategory = 'Follows'
	const defaultAlertType: eventsubtypes.SubscriptionType = 'channel.follow'

	res.render(`slither/home`, { 
		data: {
			alertsUrl: alertsUrl,
			navItems: JSON.stringify(navItems),
			alerts: alertsMap,
			defaultCategory: defaultCategory,
			defaultAlertType: defaultAlertType.replace(/[.:]/, '').toLowerCase()
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

// GET /slither/:routeName that is not already handled redirects to /slither/home instead, with a tokenType of null
slitherRouter.get('/:badroute', (req, res) => {

	console.log(`Got GET request to /slither/${req.params.badroute}. Redirecting to /slither/home`)
	res.redirect(`/slither/home`)

})

export default slitherRouter