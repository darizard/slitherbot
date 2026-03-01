import express from 'express'
import fs from 'fs'

const router = express.Router()

// Serve css files to views opaquely
router.get('/:filename', (req, res) => {

    // Restrict characters used in requested filenames to a-z, A-Z, 0-9, and the literals - and _, and extension must be .css
    const ALLOWED_FILENAMES_STRICT = /^[\w\-]+\.(?i:css)$/
    if(!ALLOWED_FILENAMES_STRICT.test(req.params.filename)) return res.sendStatus(400)

    // If the file doesn't exist, indicate Bad Request and don't provide any additional information
    const CSS_FILE = `/opt/slitherbot/public/css/${req.params.filename}`
    if(!fs.existsSync(CSS_FILE)) return res.sendStatus(400)
    
    return res.status(200).set('Content-Type', 'text/css').sendFile(CSS_FILE)
})

export default { router }