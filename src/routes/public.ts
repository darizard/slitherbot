import express from 'express'

// .env configuration imports
import { appConfig } from '../config.js'

const mediaRouter = express.Router()

mediaRouter.get('/favicon', async (_req, res) => {

    try {
        return res.status(200).sendFile(`${appConfig.appPath}/public/media/favicon.ico`)
    } catch (e) {
        return res.sendStatus(404)
    }

})

mediaRouter.get('/media/:filename', async (req, res) => {

    try {
        return res.status(200).header('Content-Type', 'image/x-icon').sendFile(`${appConfig.appPath}/public/media/${req.params['filename']}`)
    } catch (e) {
        console.error(`Error handling /public/media/:filename endpoint: ${e}`)
        return res.sendStatus(404)
    }

})

export default mediaRouter