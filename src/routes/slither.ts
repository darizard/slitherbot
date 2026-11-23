// External modules
import bodyParser from 'body-parser'
import express from 'express'
import fs from 'fs'

import { appConfig } from '../config.js'

// Internal TS types and runtime type guards
import type { SlitherAuthenticatedRequest } from '../types/authtypes.js'

// Express Middleware
import { uploadAlertMedia } from '../middleware/eventalerts.js'
import { authenticateSlitherUser } from '../middleware/slitherauth.js'

// Services
import { getHomePageData } from '../services/slither.js'
import { getAlertMedia } from '../services/eventalertsclient.js'

// Types
import { AlertPostReqBody, AlertUpdateData } from '../types/alerttypes.js'

// DB queries
import { getAlert, updateAlert } from '../db/queries/eventalerts.js'

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

// TODO: Refactor endpoint to follow better principles
// Serve the image and audio files (one each) related to the given subId for the authenticated user
// Requires access token authentication
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

// TODO: Refactor endpoint to follow better principles
slitherRouter.put('/media', authenticateSlitherUser, uploadAlertMedia, async (req: SlitherAuthenticatedRequest, res) => {

    if(req.fileValidationError) {
        return res.status(400).send('Invalid filename')
    }

    const alertPostReqBody = req.body as AlertPostReqBody

    const files = req.files as { [fieldname: string]: Express.Multer.File[] }
    let imageFile, imageFileName, audioFile, audioFileName = undefined
    if(files['imageBlob'] && files['imageBlob'][0]) {
        const img = files['imageBlob'][0]
        imageFile = img.filename
        imageFileName = img.originalname
    }
    if(files['audioBlob'] && files['audioBlob'][0]) {
        const audio = files['audioBlob'][0]
        audioFile = audio.filename
        audioFileName = audio.originalname
    }

    const subId = alertPostReqBody.subscriptionId
    const updateData: AlertUpdateData = { }
    const audioVolume = alertPostReqBody.audioVolume ? parseInt(alertPostReqBody.audioVolume) : undefined
    const duration = alertPostReqBody.alertDuration ? parseFloat(alertPostReqBody.alertDuration) : undefined
    if(audioVolume) updateData.audio_volume = audioVolume
    if(duration) updateData.duration = duration
    if(alertPostReqBody.alertText) updateData.alert_text = alertPostReqBody.alertText
    if(imageFile) updateData.image_file = imageFile
    if(imageFileName) updateData.image_file_name = imageFileName
    if(audioFile) updateData.audio_file = audioFile
    if(audioFileName) updateData.audio_file_name = audioFileName

    // Get pre-update image and audio data filenames from the DB
    const { image_file, audio_file } = (await getAlert(subId)) || { audio_file: undefined, image_file: undefined }

    await updateAlert(subId, updateData)

    // If both the new and old file names reference a file, we should delete the old one!
    if(imageFile && image_file) {
        try {
            await fs.promises.unlink(`${appConfig.appPath}/resources/alertmedia/${req.twitchId}/${image_file}`)
        } catch(err) { 
            console.error(`Could not delete old image file for subId ${subId}`)
        }
    }
    if(audioFile && audio_file) {
        try {
            await fs.promises.unlink(`${appConfig.appPath}/resources/alertmedia/${req.twitchId}/${audio_file}`)
        } catch(err) { 
            console.error(`Could not delete old audio file for subId ${subId}`)
        }
    }

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