// ***************************************************************************************************************
// ***************************************************************************************************************
// ***************************************************************************************************************
//
// Connects to Twitch's EventSub system to receive messages forwarded from the reverse proxy configured on the local server.
// EventSub will only send http requests directly to port 443, so the reverse proxy is necessary to forward them to 
// the correct port for this app. The middleware is configured with various event handlers for different Twitch events, 
// and logs subscription creation and deletion successes and failures. Future plans include expanding event handlers to trigger 
// actions in other apps on the server based on Twitch events.
//
// ***************************************************************************************************************
// ***************************************************************************************************************
// ***************************************************************************************************************

// TODO: Investigate middleware and Apache config conflict with respect to callback functions not firing on middleware events.
// Cross-notated in ./twitchauth.ts

// twurple library imports
import { ApiClient } from '@twurple/api'
import { EventSubMiddleware } from '@twurple/eventsub-http'
import type { IRouter } from '@twurple/eventsub-http/node_modules/@types/express-serve-static-core'

// internal app imports
import twitchroutes from '../routes/twitch.js'
import { createAuthProvider } from './twitchauth.js'
import { twitch as twitchBotConfig, ssl as sslConfig } from '../config.js'

// removed imports - reminder to implement these more completely in other apps on the server
// import { setMic1Mute as setMuteOBS } from './obsclient.js';
// import { setDariMicMute as setMuteDiscord } from './discordclient.js';

export * as default from './eventsubclient.js'

/*************************************************************************
 * Connects to Twitch's EventSub system using a RefreshingAuthProvider
 * 
 * Uses a ReverseProxyAdapter to receive messages on port 3000 fowarded
 * from the reverse proxy configured on the local server
 * 
 * EventSub will only send http requests directly to port 443
 *************************************************************************/
export async function connect() {

	// Create a refreshing auth provider and use it to create the api client. This auth provider already contains the tokens
	// for all Twitch users we want to support, and will handle refreshing them and updating the database with new token data as needed.
	const authProvider = await createAuthProvider()
	if(!authProvider) {
		console.error("Failed to create Twitch auth provider. EventSub client will not connect.")
		return
	}
	const apiclient = new ApiClient({
		"authProvider": authProvider
	})

	// TODO: This initial subscription retrieval is fully an artifact of the initial testing phase. We will want to do some
	// subscription management in the future, but I will need to determine the details once database retrieval is working.
	let subs = await apiclient.eventSub.getSubscriptions()
	for(let sub of subs.data) {
		//if(sub.status !== 'enabled') sub.unsubscribe()
		await sub.unsubscribe() // Unsubscribe from all existing EventSub subscriptions as a testing measure.
	}

	const middleware = new EventSubMiddleware({
		"hostName": sslConfig.hostName,
		"apiClient": apiclient,
		"secret": twitchBotConfig.eventsubSecret,
		"pathPrefix": "/twitch"
	})
	
	// SLIGHT HACK:
	// An express.js Router or app is meant to fit into the apply method of EventSubMiddleware according to the docs
	// but Typescript does not detect enough overlap based on definitions alone between it and the IRouter interface from
	// @twurple/eventsub-http/node_modules/@types/express-serve-static-core. Double asserting to force.
	const router = (twitchroutes.router as unknown) as IRouter
	middleware.apply(router)
	await middleware.markAsReady()

	// subscription = EventSubSubscription<unknown>
	// apiSubscription = HelixEventSubSubscription

	// ============="EVENTS" as defined by Twurple's EventSubMiddleware=============
	middleware.onRevoke(((subscription, status) => {
		console.log(`Subscription with id ${subscription.id} was revoked by Twitch with status ${status}.`)
	}))
	middleware.onSubscriptionCreateFailure((subscription, error) => { 
		console.log(`Failed to create subscription with error ${error.name}: ${error.message}`)
	})
	middleware.onSubscriptionCreateSuccess((subscription, apiSubscription) => {
		console.log(`Successfully created subscription with cost: ${JSON.stringify(apiSubscription.cost)}`)
	})
	middleware.onSubscriptionDeleteSuccess((subscription) => {
		console.log(`Successfully deleted subscription: ${JSON.stringify(subscription)}`)
	})
	middleware.onSubscriptionDeleteFailure((subscription, error) => {
		console.log(`Failed to delete subscription with error ${error.name}: ${error.message}`)
	})
	middleware.onVerify((success, subscription) => {
		console.log(`Verification ${success ? "succeeded" : "failed"} for ${JSON.stringify(subscription)}`)
	})

	// ============="METHODS" as defined by Twurple's EventSubMiddleware=============

	// TODO: Implement handlers intelligently based on the active channel point rewards and other Twitch events we want to respond to for each channel.
	// For now, just subscribe to the event that triggers whenever any channel point reward is redeemed on darizard's Twitch channel.
	// MYSTERY: The callback passed here never fires, though the middleware routes the request to the correct endpoint, allowing it to be handled
	// by the current application logic. Current working theory is that the middleware never receives the event and it is instead diverted to the
	// application's internal HTTP server's router before it can be processed by the middleware. 
	let dariID: string = "123657070"

	middleware.onChannelRedemptionAdd(dariID, (event) => {
		console.log(`onChannelRedemptionAdd fired for event: ${JSON.stringify(event)}`)
	})
}