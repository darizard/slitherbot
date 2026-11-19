import bodyParser from 'body-parser'
import express from 'express'
import fs from 'fs'
import mime from 'mime/lite'

// .env configuration imports
import { appConfig, sslConfig } from '../config.js'

// Types
import type { AlertPostReqBody, AlertUpdateData } from '../types/alerttypes.js'
import type { SlitherAuthenticatedRequest } from '../types/authtypes.js'

// Express Middleware
import { authenticateSlitherUser } from '../middleware/slitherauth.js'
import { alertsTokenToTwitchId, uploadAlertMedia } from '../middleware/eventalerts.js'

// Services
import { getAlertMediaUrl } from '../services/eventalertsclient.js'
import { signSlitherToken } from '../services/slitherauth.js'

// DB Queries
import { getSubById } from '../db/queries/eventsub.js'
import { getAlert, updateAlert } from '../db/queries/eventalerts.js'

const jsonParser = bodyParser.json()
const alertsRouter = express.Router()

// Serves a page that displays alerts for the user related to the provided alertsToken (a semi-public credential)
alertsRouter.get('/:alertsToken', alertsTokenToTwitchId, async (req: SlitherAuthenticatedRequest, res) => {

    const alertsJWT = await signSlitherToken(req.twitchId as string, 'alerts')

    res.render("slither/alerts", { hostName: sslConfig.hostName,
                                    connectionToken: alertsJWT })

})

// Sends a file to the browser according to alertsToken and fileName
alertsRouter.get('/media/:alertsToken/:fileName', alertsTokenToTwitchId, async (req: SlitherAuthenticatedRequest, res) => {

    // fileName is the unique hex string representation of the file stored on the server
    const mediaUrl = await getAlertMediaUrl(req.twitchId as string, req.params['fileName'] as string)
    
    return res.status(200).sendFile(mediaUrl as string, (err: NodeJS.ErrnoException | null) => {
        if(err) {
            if(err.code === 'ENOENT') {
                return res.status(404).send('File not found for given alerts token')
            }
            return res.status(500).send('Error sending file')
        }
    })

})

// Primarily for serving media files to the home page for the alerts customization dashboard
alertsRouter.post('/media', jsonParser, authenticateSlitherUser, async (req: SlitherAuthenticatedRequest, res) => {

    const alert = await getAlert(req.body.subId)
    if(!alert) return res.sendStatus(404)

    const subType = await getSubById(alert.sub_id)
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
        imageBase64: imageFileBuffer?.toString('base64'),
        imageFileName,
        imageFileMime,
        audioBase64: audioFileBuffer?.toString('base64'), 
        audioFileName,
        audioFileMime
    })

})

alertsRouter.post('/', authenticateSlitherUser, uploadAlertMedia, async (req: SlitherAuthenticatedRequest, res) => {

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

export default alertsRouter