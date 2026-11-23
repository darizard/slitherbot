import express from 'express'

// .env configuration imports
import { sslConfig } from '../config.js'

// Types
import type { SlitherAuthenticatedRequest } from '../types/authtypes.js'

// Express Middleware
import { alertsTokenToTwitchId } from '../middleware/eventalerts.js'

// Services
import { buildAlertMediaPath } from '../services/eventalertsclient.js'
import { signSlitherToken } from '../services/slitherauth.js'

const alertsRouter = express.Router()

// Serves a page that displays alerts for the user related to the provided alertsToken
// Requires soft authentication through semi-public token
alertsRouter.get('/:alertsToken', alertsTokenToTwitchId, async (req: SlitherAuthenticatedRequest, res) => {

    const alertsJWT = await signSlitherToken(req.twitchId as string, 'alerts')

    res.render("slither/alerts", { hostName: sslConfig.hostName,
                                    connectionToken: alertsJWT })

})

// Sends a file to the browser according to alertsToken and fileName
// Requires soft authentication through semi-public token
alertsRouter.get('/media/:alertsToken/:fileName', alertsTokenToTwitchId, async (req: SlitherAuthenticatedRequest, res) => {

    const fileName = req.params['fileName']
    if(typeof fileName !== 'string') return res.sendStatus(400)

    // fileName is the unique hex string representation of the file stored on the server
    const mediaUrl = buildAlertMediaPath(req.twitchId as string, fileName)
    if(!mediaUrl) return res.status(200).send([])
    
    return res.status(200).sendFile(mediaUrl, (err: NodeJS.ErrnoException | null) => {
        if(err) {
            if(err.code === 'ENOENT') {
                return res.status(200).send([])
            }
            return res.status(500).send('Error sending file')
        }
    })

})

export default alertsRouter