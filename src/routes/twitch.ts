import express from 'express'
import bodyParser from 'body-parser'
import { WebSocket } from 'ws'
import { twitch as twitchConfig } from '../config.js' // Needed in auth

const jsonParser = bodyParser.json()
const urlencodedParser = bodyParser.urlencoded({ extended: false})
const router = express.Router()

//TODO: Move WebSocket client implementation to its own service file.
let twitchWS = new WebSocket('wss://dari.monster/twitch?clientType=controller');
twitchWS.onopen = function open() {

	let pingIntervalID = setInterval(() => {

        if (twitchWS.readyState === WebSocket.OPEN)
            twitchWS.send(JSON.stringify({ type: "ping" }))

    }, 60000) // Ping the WS server every 1 minute to keep the connection alive

    let reconnectIntervalID = setInterval(() => {
        if (twitchWS.readyState !== WebSocket.OPEN && twitchWS.readyState !== WebSocket.CONNECTING) {

            console.log('Reconnecting WebSocket for twitch controller...')
            clearInterval(pingIntervalID)
            clearInterval(reconnectIntervalID)
			twitchWS = new WebSocket('wss://dari.monster/twitch?clientType=controller')

        }
    }, 15000) // Check for non-open and non-connecting socket every 15 seconds

	console.log("Twitch controller WebSocket connected to local WebSocket server.")

}

/**
 * POST request received from Twitch when either:
 * 		- We create an EventSub subscription to a channel point reward and have to respond
 * 		  to the callback verification challenge to enable the EventSub subscription on Twitch's end
 * 		OR
 * 		- A user redeems a channel point reward that we already have an enabled EventSub
 * 		  subscription for
 * 
 * This method must call the appropriate channel point reward
 **/
router.post('/event/channel.channel_points_custom_reward_redemption.add.:channelid', jsonParser, (req, res) => {

	//TODO: Remove if statement when multiple channels are supported. For now, just make sure the post is for the correct channel before doing anything with it.
	if(req.params.channelid === "123657070") {
		let type: string = 'alert'
		let imageFile: string = 'RareCharTP-Trim.gif'
		let audioFile: string = 'DiscordMute.mp3'
		let alertText: string = 'Channel Points Reward Message'
		let duration: number = 8000

		if(req.body.challenge) {

			// we need to register the EventSub subscription
			res.send(req.body.challenge)

		}
		else if(req.body.subscription.status === "enabled") {
			console.log(`Reward redeemed. Event object: ${JSON.stringify(req.body.event)}`)

			// EventSub subscription is already registered. Proceed to handle the redemption.
			const wsmsgobj = { type: type, imageFile: imageFile, audioFile: audioFile, alertText: alertText, duration: duration };
			twitchWS.send(JSON.stringify(wsmsgobj)) // send the reward redemption info to the WebSocket server

			// placeholder reward code
			let rewardTitle = req.body.event.reward.title ?? "unknown reward";
			//console.log(rewardTitle + " redeemed")

			// respond with 200 OK
			res.writeHead(200, {
				'Content-Type': 'application/json'
			}).end()
			
		}
		else console.log(`Status ${req.body.subscription.status} encountered for subscription id ${req.body.subscription.id}`)

	}

	else console.log(`post received for channel id ${req.params.channelid}. Fail.`)

})

router.get('/alerts', (req, res) => {

	res.render("twitch/alerts")

})

router.get('/alerts/:channelname', (req, res) => {

	console.log(`alerts hit for channel ${req.params.channelname}`)
	res.render("twitch/alerts", { channelname: req.params.channelname })

})

router.get('/auth', (req, res) => {

	// Placeholder with non-functional button
	res.render('twitch/auth')

})

router.post('/auth', jsonParser, (req, res) => {

})

//TODO: Implement authentication functionality to manage user access tokens and scopes for Twitch API and EventSub access.
// This is the redirect URL for twitch to send OAuth requests
router.post('/token', jsonParser, (req, res) => {
	
})

export default { router };
export { router };