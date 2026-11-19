import { RequestHandler } from 'express'
import multer from 'multer'
import { FileFilterCallback } from 'multer'
import path from 'path'

import { appConfig } from '../config.js'

import { MatchedAlertRequest } from '../types/alerttypes.js'
import { SlitherAuthenticatedRequest } from '../types/authtypes.js'

import { getUserIDForAlertsToken } from '../db/queries/eventalerts.js'
import { signSlitherToken } from '../services/slitherauth.js'

const REPLACE_CHARS_BASE = /[^\w\-]/g
const ALLOWED_EXT = /^\.(?i:apng|avif|gif|jpg|jpeg|jfif|pjpeg|pjp|png|svg|webp|mp3|wav|m4a)$/

const storage = multer.diskStorage({
    destination: function (req: SlitherAuthenticatedRequest, _file, cb) {
        cb(null, `${appConfig.appPath}/resources/alertmedia/${req.twitchId}`)
    }
})

const fileFilter = (req: SlitherAuthenticatedRequest, file: Express.Multer.File, cb: FileFilterCallback) => {
    let err: Error | null = null

    const ext = path.extname(file.originalname)
    if(!ALLOWED_EXT.test(ext)) err = new Error(`Invalid extension ${ext}`)

    const base = file.originalname.substring(0, file.originalname.length - ext.length)
    const cleanedBase = base.replace(REPLACE_CHARS_BASE, '')
    if(cleanedBase.length === 0) {
        if(!err) err = new Error(`A valid base file name could not be extracted.`)
        else err.message += ` A valid base file name could not be extracted.`
    }

    if(err) {
        req.fileValidationError = 'Invalid file'
        cb(null, false)
    } else {
        cb(null, true)
    }
    
}

export const uploadAlertMedia = multer({ 
        storage: storage,
        limits: { fileSize: 5e+6 },
        fileFilter: fileFilter })
    .fields([
        { name: 'imageBlob', maxCount: 1 },
        { name: 'audioBlob', maxCount: 1 }
])

// If user found for the provided alerts token in the 'Token' URL query parameter, returns a signed JWT with payload
// {userId = SlitherIDs.twitch_id, tokenType = 'alerts'}
export const generateAlertsJWT: RequestHandler = async (req: MatchedAlertRequest, res, next) => {

    const user_id = await getUserIDForAlertsToken(req.params['alertsToken'] as string)
    if(!user_id) return res.sendStatus(403)

    req.alertsJWT = await signSlitherToken(user_id, 'alerts')
	next()

}

export * as default from './eventalerts.js'