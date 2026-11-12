import bodyParser from 'body-parser'
import express from 'express'
import fs from 'fs'
import mime from 'mime/lite'

// .env configuration imports
import { appConfig, sslConfig } from '../config.js'

// Types
import alerttypes from '../types/alerttypes.js'
import authtypes from '../types/authtypes.js'

// Express Middleware
import { authenticateSlitherUser } from '../middleware/slitherauth.js'
import { uploadAlertMedia } from '../middleware/eventalerts.js'

// DB Queries
import eventsubsql from '../db/queries/eventsub.js'
import slithersql from '../db/queries/slitherauth.js'
import eventalertssql from '../db/queries/eventalerts.js'

// Business logic
import slitherauth from '../services/slitherauth.js'

const jsonParser = bodyParser.json()
const alertsRouter = express.Router()

// Serves a page that displays alerts for the user authenticated by alertsToken. alertsToken is a semi-public credential
// which serves no purpose other than to serve the user-configured alerts and cannot be used externally to identify the user
alertsRouter.get('/:alertsToken', async (req, res) => {

    const token = await slitherauth.verifyAlertsConnectionToken(req.params.alertsToken)

    res.render("slither/alerts", { hostName: sslConfig.hostName,
                                    connectionToken: token })

})

// Obtain the alerts token for the given user intended for use in an OBS browser source URL. This token is semi-public data.
alertsRouter.post('/token', jsonParser, async (req, res) => {

    const userId = await slitherauth.verifySlitherToken(req.cookies?.access_token, 'access')
    if(!userId) {
        // TODO: Big logging/error visibility pass
        console.error(`Request made to POST /slither/alerts/token with an invalid access token: ${req.cookies?.access_token}`)
        return res.status(401)
    }

    const alertsToken = await slithersql.getAlertsTokenForUser(userId) 
    if(!alertsToken) return res.status(500).json({error: `Could not obtain alerts token for given user at POST /slither/alerts/token`})
    
    return res.status(200).json({ alerts_token: alertsToken })

})

alertsRouter.get('/media/:alertstoken/:filename', async (req, res) => {

    // Incoming filename references the hex charset filename stored in the user-specific media folder
    const fileName: string = req.params['filename'] as string
    const userId = await slithersql.getUserIDForAlertsToken(req.params['alertstoken'] as string)
    const friendlyFileName = await eventalertssql.getFriendlyFileName(fileName)

    if(!friendlyFileName) {
        return res.status(500).send('Oops. Could not find filename for requested media. Things are probably broken. :(')
    }
    
    res.status(200).download(`${appConfig.appPath}/resources/alertmedia/${userId}/${fileName}`, 
                              friendlyFileName,
                              (err) => {
        if(err) {
            console.error(`Error sending media file ${fileName} in response to request at /media/:filename endpoint. Error: ${err}`)
            res.status(404).end()
        }
    })

})

// Primarily for serving media files to the home page for the alerts customization dashboard
alertsRouter.post('/media', jsonParser, authenticateSlitherUser, async (req: authtypes.SlitherAuthenticatedRequest, res) => {

    const alert = await eventalertssql.getAlert(req.body.subId)
    if(!alert) return res.sendStatus(404)

    const subType = await eventsubsql.getSubById(alert.sub_id)
    if(!subType) {
        console.error('Sub exists with invalid type. Investigate.')
        return res.sendStatus(500)
    }

    let imageFileBuffer = null
    let imageFileName = null
    let imageFileMime = null
    let audioFileBuffer = null
    let audioFileName = null
    let audioFileMime = null

    try {
        if(req.body.getImage && alert.image_file) {
            imageFileBuffer = await fs.promises.readFile(`${appConfig.appPath}/resources/alertmedia/${req.twitchId}/${alert.image_file}`)
            imageFileName = alert.image_file_name ?? ''
            imageFileMime = mime.getType(imageFileName)
        }
        if(req.body.getAudio && alert.audio_file) {
            audioFileBuffer = await fs.promises.readFile(`${appConfig.appPath}/resources/alertmedia/${req.twitchId}/${alert.audio_file}`)
            audioFileName = alert.audio_file_name ?? ''
            audioFileMime = mime.getType(audioFileName)
        }
    } catch(e) {
        console.error(`Probably asked for a file we don't have`)
        console.log(`Alert returned from db: ${JSON.stringify(alert)}`)
        return res.sendStatus(500)
    }

    return res.status(200).json({
        imageBase64: imageFileBuffer?.toString('base64'), imageFileName: imageFileName, imageFileMime: imageFileMime,
        audioBase64: audioFileBuffer?.toString('base64'), audioFileName: audioFileName, audioFileMime: audioFileMime
    })

})

alertsRouter.post('/', authenticateSlitherUser, uploadAlertMedia, async (req: authtypes.SlitherAuthenticatedRequest, res) => {

    if(req.fileValidationError) {
        return res.status(400).send('Invalid filename')
    }

    const alertPostReqBody = req.body as alerttypes.AlertPostReqBody

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
    const updateData: alerttypes.AlertUpdateData = { }
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
    const { image_file, audio_file } = (await eventalertssql.getAlert(subId)) || { audio_file: undefined, image_file: undefined }

    await eventalertssql.updateAlert(subId, updateData)

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

export default alertsRouter