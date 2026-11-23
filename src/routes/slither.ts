// External modules
import bodyParser from 'body-parser'
import express from 'express'

// Internal TS types and runtime type guards
import type { SlitherAuthenticatedRequest } from '../types/authtypes.js'

// Express Middleware
import { alertMediaMulter } from '../middleware/eventalerts.js'
import { authenticateSlitherUser } from '../middleware/slitherauth.js'

// Services
import { getHomePageData, saveAlertMedia } from '../services/slither.js'
import { getAlertMedia } from '../services/eventalertsclient.js'

// Types
import { AlertPostReqBody } from '../types/alerttypes.js'

const jsonParser = bodyParser.json()
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

slitherRouter.get('/logout', (_req, res) => {

	res.clearCookie('access_token')
	res.clearCookie('refresh_token')
	res.redirect('/slither/home')

})

// Serve the media file related to the given Subscription Id and Media Type for the authenticated user
slitherRouter.get('/media/:subId/:mediaType', authenticateSlitherUser, jsonParser, async (req: SlitherAuthenticatedRequest, res) => {

    const userId = req.twitchId as string
    const subId = req.params['subId']
    const mediaType = req.params['mediaType']
    if(!subId 
        || typeof subId !== 'string' 
        || (mediaType !== `image` && mediaType !== `audio`)) 
    { 
        return res.sendStatus(400)
    }

    try {
        const alertMediaData = await getAlertMedia(userId, subId, mediaType)
        if(!alertMediaData) return res.status(200).send([])

        return res.status(200).json(alertMediaData)

    } catch(err) {
        console.error(err)
        return res.sendStatus(500)
    }
    
})

// Uploads media file(s) to be used in Twitch event alerts
slitherRouter.put('/media', authenticateSlitherUser, alertMediaMulter, async (req: SlitherAuthenticatedRequest, res) => {

    if(req.fileValidationError) {
        return res.status(400).send('Invalid filename')
    }

    const alertPostReqBody = req.body as AlertPostReqBody
    const files = req.files as { [fieldname: string]: Express.Multer.File[] }
    const twitchId = req.twitchId as string

    await saveAlertMedia(alertPostReqBody, files, twitchId)

    res.sendStatus(204)

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