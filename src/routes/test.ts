import express from 'express'
import bodyParser from 'body-parser'

import { getLimitedUserByChannelId } from '../db/queries/dbqueries.js'

const jsonParser = bodyParser.json()
const urlencodedParser = bodyParser.urlencoded({ extended: false})
const router = express.Router()

router.get('/hello', (req, res) => {
	res.render("test/hello")
})

router.get('/db', (req, res) => {
	res.send("db test reached")
})

// darizard's Twitch channel ID is 123657070, so example request would be /test/db/123657070
router.get('/db/:channelId', (req, res) => {
    const channelId = req.params.channelId
    getLimitedUserByChannelId(channelId).then(limitedUser => {
        if (limitedUser) {
            res.json(limitedUser)
        } else {
            res.status(404).json({ error: 'User not found' })
        }
    })
})

export default { router }