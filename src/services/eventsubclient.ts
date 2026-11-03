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

import express from 'express'

// internal app imports
import { getValidatedSlitherAppToken } from './twitchauth.js'
import { twitchConfig } from '../config.js'
import eventsubtypes from '../types/eventsubtypes.js'

// DB imports
import eventsubsql from '../db/queries/eventsub.js'
import twitchauthsql from '../db/queries/twitchauth.js'
import eventalertssql from '../db/queries/eventalerts.js'

// internal classes
import { SlitherControllerClientWebSocket } from '../classes/slitherws.js'
import { SlitherEventSub } from '../classes/eventsub.js'

// types
import type slitherwstypes from '../types/slitherwstypes.js'

// removed imports - reminder to implement these more completely in other apps on the server
// import { setMic1Mute as setMuteOBS } from './obsclient.js'
// import { setDariMicMute as setMuteDiscord } from './discordclient.js'

export * as default from './eventsubclient.js'

// TODO: Look into using Slither's registered Twitch Client ID rather than an arbitrary '.' string literal in the database.
//		 Also brainstorm / research best practices for this kind of scenario.

/*************************************************************************
 * Establishes a Twitch App Access Token for SlitherBot and maintains EventSub
 * Subscriptions. The server must ensure all App and User Access Tokens are 
 * validated and updated in the database before calling this message.
 *************************************************************************/
export async function initialize(): Promise<void> {

	// Validates App Access Token in DB, then obtains and immediately validates a new one if necessary
	const appToken = await getValidatedSlitherAppToken()
	if(!appToken) {
		console.error(`Failed to obtain an app access token on initial connection. Unable to manage EventSub subscriptions.`)
		return
	}

	const activeUserIds = await twitchauthsql.getActiveChannels()

	// Query all Slither's Event Subscription details from the database and map each value 'id' to key '{ channel_id, type }'
	const dbSubsMap = await eventsubsql.getAllSubs()
		.then((allSubs) => {

			const dbSubMap = new Map<{ channel_id: string, type: eventsubtypes.SubscriptionType }, string | null>()
			allSubs.forEach((dbUserSub) => { 
				dbSubMap.set({ channel_id: dbUserSub.channel_id, type: dbUserSub.type }, dbUserSub.id)
			})
			return dbSubMap

		})
	
	if(!dbSubsMap) {
		console.error(`Internal error retrieving Subscription IDs to initizalize the Event Sub client. Unable to manage EventSub subscriptions.`)
		return
	}

	// Fetch all of Slither's EventSub Subscriptions from Twitch
	const twitchSubs = await fetchAllSubs()
	if(!twitchSubs) {
		console.error(`Error retrieving Event Subscription infromation from Twitch. Unable to manage EventSub subscriptions.`)
		return
	}

	// Compare subscription ids of all required event types received from Twitch to the information in the DB and update
	// every subscription in the DB with Twitch's sub id. Afterward, for all required subscriptions for active users
	// which still have an id of NULL, subscribe to the related events via the Twitch API and update the sub IDs in the DB
	
	
	// 1. Loop through all of the twitch subs and assign the subscription ID to each {user, subType} value via a map.
	// App-level sub types will map the subscription ID to the type only
	const dbSubsToUpsert = new Set<eventsubtypes.SlitherEventSubscription>()

	twitchSubs.forEach((twitchSub) => {
		let channelId = ''

		// If sub is disabled on Twitch's end, handle disabled sub and return
		if(twitchSub.status !== 'enabled') {
			handleDisabledSub(twitchSub)
			return
		} 
		// Set channel ID according to sub type
		else if(SlitherEventSub.isAppSubType(twitchSub.type)) { channelId = '.' } 
		else if(SlitherEventSub.isUserSubType(twitchSub.type)) { channelId = SlitherEventSub.broadcasterOf(twitchSub.condition, twitchSub.type) }
		// Handle [disabled/unsupported] sub and return if the sub type is unsupported
		else {

			// TODO: Elevate error, we have an unexpected event subscription with Twitch
			console.error(`Unexpected event subscription returned by Twitch API, id = ${twitchSub.id}. Investigate.`)
			handleDisabledSub(twitchSub)
			return

		}

		// TODO: Look into hashing object keys in order to prevent this from being O(twitchSubs * dbSubs) = O(n^2)
		// Pull sub ID Slither has in its database for the record matching the given values of [user, type]
		const subIdFromDb = dbSubsMap.entries().find((entry) => {
			return (entry[0].channel_id === channelId && entry[0].type === twitchSub.type)
		})?.[1]

		// If undefined or does not match what Twitch shows, add to Set to be upserted into the EventSubs table
		if(subIdFromDb !== twitchSub.id) {
			
			dbSubsToUpsert.add({
				channel_id: channelId,
				id: twitchSub.id,
				type: twitchSub.type,
				version: SlitherEventSub.versionOf(twitchSub.type)
			})
			
		}
	})

	if(dbSubsToUpsert.size > 0) await eventsubsql.upsertEventSub([...dbSubsToUpsert])

	// All database eventsubs have been synced to the subscription information received from the Twitch API
	// For any required subs for active users that are still missing from the database, subscribe to the event.
	// The database update will be handled by the /slither/event endpoint after a Twitch webhook callback 
	// verification request.
	const requiredSubs: Set<eventsubtypes.SlitherEventSubscription> = SlitherEventSub.getAllRequiredSubscriptions(activeUserIds)
	const registeredSubs: Set<eventsubtypes.SlitherEventSubscription> = await eventsubsql.getSubscriptionsForUsers(activeUserIds.concat(['.']))
	
	// Find the Set difference of Set<{ requiredSubs.channel_id, requiredSubs.type }> - Set<{ registeredSubs.channel_id, registeredSubs.type }>
	requiredSubs.forEach(async (requiredSub) => {
		if(!registeredSubs.values().find((registeredSub) => {
			return registeredSub.channel_id === requiredSub.channel_id && registeredSub.type === requiredSub.type
		})) {

			// If none of the registered subs matches the current required sub being checked, subscribe to it with Twitch
			await subToEvent(requiredSub.type, requiredSub.channel_id)

		}
	})

}

export async function handleChallenge(requestBody: any, res: express.Response): Promise<void> {

			res.set('Content-Type', 'text/plain')
			   .set('Content-Length', `${requestBody.challenge.length}`)
			   .status(200)
			   .send(requestBody.challenge)

			await registerNewEventSub(requestBody)

}

export async function handleEvent(req: express.Request, res: express.Response, ws: SlitherControllerClientWebSocket): Promise<void> {
		// respond right away with 204 No Content
		res.sendStatus(204)
		console.log("response sent")
			// If he event type is one that is tied to an alert...
			if(SlitherEventSub.alertSubscriptionTypes.has(req.body.subscription.type)) {
	
				const userId = SlitherEventSub.broadcasterOf(req.body.subscription.condition, req.body.subscription.type)
				const alertDetails = await eventalertssql.getAlert(req.body.subscription.id)
				if(!alertDetails) return
	
				// if the alert has at least one non-null displayable element, send the details to the websocket server
				if(alertDetails.alert_text !== null || alertDetails.audio_file !== null || alertDetails.image_file !== null) {
					
					const wsmsgobj: slitherwstypes.AlertMessage = {
											type: 'alert',
											userId: userId,
											data: { imageFile: alertDetails.image_file,
													audioFile: alertDetails.audio_file,
													alertText: alertDetails.alert_text,
													audioVolume: alertDetails.audio_volume,
													duration: alertDetails.duration }
											}
					console.log("sending message over websocket")
					ws.send(wsmsgobj)
	
				}
	
			}
}

export async function handleRevocation(req: express.Request, res: express.Response): Promise<void> {

		/***************************SUBSCRIPTION REVOKED BY TWITCH******************************************************
	* Subscriptions can be revoked by Twitch for the following reasons:
	*  	- 'user_removed': User no longer exists
	*		ACTION: Delete user's Twitch data from Slither entirely
	*   - 'authorization_revoked': User revoked auth token, OR just changed their password
	*   	ACTION: Verify the user access token
	*		- Successful (pw changed): Resubscribe to the event
	*		- Unsuccessful (user revoked token): Deactivate user on backend (TODO: Determine what needs to be done here)
	*   - 'notification_failures_exceeded': Callback failed to respond too many times
	* 		ACTION: Review the event's handler code to determine why our callback is not responding
	* 	- 'version_removed': The type and version of subscription is no longer valid.
	* 		ACTION: Review Twitch docs and figure out how to change the code for the event handler and/or subscription creation
	****************************************************************************************************************/
	res.sendStatus(204)

	console.log(`Subscription revoked by Twitch! Reason: ${req.body.subscription.status}`)
	console.log(`Full message body: ${JSON.stringify(req.body)}`)

	await handleDisabledSub(req.body.subscription as eventsubtypes.TwitchEventNotification)

}

export async function handleUnexpectedMessage(req: express.Request, res: express.Response, messageType: string): Promise<void> {

	res.sendStatus(204)
	// TODO: Elevate visibility. Do I need to support a new message type or did something go very wrong?
	console.log(`Unknown message type received from Twitch: ${req.headers[messageType]}`)

}

async function registerNewEventSub(requestBody: eventsubtypes.WebhookCallbackChallengeRequest): Promise<void> {
	
	if(SlitherEventSub.isAppSubType(requestBody.subscription.type)) {
		const dbSub = {
			channel_id: '.',
			id: requestBody.subscription.id,
			type: requestBody.subscription.type,
			version: SlitherEventSub.versionOf(requestBody.subscription.type)
		}

		await eventsubsql.upsertEventSub(dbSub)

	// All other events Slither currently subscribes to use a User Access Token
	} else if(SlitherEventSub.isUserSubType(requestBody.subscription.type)) {
		const twitchId = SlitherEventSub.broadcasterOf(requestBody.subscription.condition, requestBody.subscription.type)

		if(!twitchId) {
			console.error(`Error registering Event Subscription: Could not retrieve twitch ID from object condition.`)
			return
		}
		
		const dbSub = {
			id: requestBody.subscription.id,
			channel_id: twitchId,
			type: requestBody.subscription.type,
			version: SlitherEventSub.versionOf(requestBody.subscription.type)
		}

		await eventsubsql.upsertEventSub(dbSub)
	} else {

		console.error(`Error registering Event Subscription: Unsupported event type: ${requestBody.subscription.type}`)

	}
}

async function deregisterEventSub(subscription: eventsubtypes.TwitchEventNotification): Promise<void> {

		await eventsubsql.deleteEventSub(subscription.id)

}

async function handleDisabledSub(subscription: eventsubtypes.TwitchEventNotification): Promise<void> {

	await unsubFromEvent(subscription)
	await deregisterEventSub(subscription)

}

async function fetchAllSubs(): Promise<Set<eventsubtypes.TwitchEventNotification> | undefined> {

	const appToken = await getValidatedSlitherAppToken()

	// A set containing all of the Subscription data objects Twitch has for Slither's app token
	const subsFromTwitch = await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions`, { method: 'GET',
																		headers: {
																			Authorization: `Bearer ${appToken}`,
																			'Client-Id': twitchConfig.clientId
																		}
																	})
	.then(async (res) => {

		const resWasOk = res.ok
		const resData = (await res.json()).data as eventsubtypes.TwitchEventNotification[]
		if(resWasOk) return new Set(resData)
		return undefined

	})

	return subsFromTwitch
}

// Subscribe to User event if channelId is provided, otherwise subscribe to App event.
export async function subToEvent(eventType: eventsubtypes.SubscriptionType, channelId: string): Promise<string | undefined> {

	const appToken = await getValidatedSlitherAppToken()
	const reqHeaders = { 			
			'Authorization': `Bearer ${appToken}`,
			'Client-Id': twitchConfig.clientId,
			'Content-Type': 'application/json'
	}

	let reqBody: eventsubtypes.CreateSubscriptionRequestBody
	if(!SlitherEventSub.isAppSubType(eventType) &&
	   !SlitherEventSub.isUserSubType(eventType)) {

		console.error(`Cannot subscribe to unsupported event type: ${eventType}`)
		return undefined

	}

	reqBody = {

		type: eventType,
		version: SlitherEventSub.versionOf(eventType),
		condition: SlitherEventSub.conditionOf(eventType, channelId),
		transport: SlitherEventSub.subscriptionCreationTransport

	}

	return await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions`, {
		method: 'POST',
		headers: reqHeaders,
		body: JSON.stringify(reqBody)
	}).then(async (res) => {

		const subscribeResponse = await res.json()
		if(res.ok) return subscribeResponse.data.id
		if(res.status === 409) {
			// TODO: Hit the Twitch API to find the id of the related subscription and register the subscription in the database
			console.error(`Already subscribed to event type ${eventType} for channel id ${channelId}. 409 response received from Twitch.`)
			return undefined
		}
		// TODO: Elevate this error. We should never have a problem subscribing to an event
		console.error(`Subscribing to event of type ${eventType} failed. Response object: ${JSON.stringify(subscribeResponse)}`)
		return undefined

	})

}

async function unsubFromEvent(subscription: eventsubtypes.TwitchEventNotification): Promise<boolean> {

	const appToken = await getValidatedSlitherAppToken()

	return await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${subscription.id}`, { method: 'DELETE',
																									 headers: {
																										Authorization: `Bearer ${appToken}`,
																										'Client-Id': twitchConfig.clientId
																									 }
																							})
	.then(async (res) => {
		
		// TODO: Elevate error. Something is wrong if we have a subscription ID we can't delete
		if(!res.ok) {
			console.error(	`Unsuccessful deletion of subscription type ${subscription.type}, `,
						  	`authorizer object: ${JSON.stringify(subscription.condition)} `,
						  	`error code ${res.status}`)
		} else {
			console.log(`Successfully deleted subscription id ${subscription.id}`)
		}

		return res.ok

	})

}