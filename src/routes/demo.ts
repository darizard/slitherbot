// External modules
import express from 'express'

const demoRouter = express.Router()

// TODO: Evaluate need for a demo page, or implement home with dummy info instead of dedicated demo code
demoRouter.get('/', (_req, res) => {

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

export default demoRouter