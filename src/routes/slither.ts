// External modules
import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';

// .env configuration imports
import { ssl as sslConfig, twitch as twitchConfig, ws as wsConfig } from '../config.js';

// Internal abstraction classes
import { SlitherControllerClientWebSocket } from '../classes/slitherws.js';

// Internal TS types and runtime type guards
import type { TwitchAuthCodeRequest } from '../types/authtypes.js';
import { isTwitchAuthError, isTwitchAuthCode } from '../types/authtypes.js';
import type { AlertMessage } from '../types/slitherwstypes.js';
import { TwitchEventNotification, WebhookCallbackChallengeRequest } from '../types/eventsubtypes.js';

// Internal logic modules
import { registerSlitherUser, signSlitherToken, verifySlitherToken, refreshSlitherAccessToken, addSlitherTokenCookie, verifyAlertsConnectionToken } from '../services/slitherauth.js';
import { registerTwitchUser, fetchUserAccessToken, validateUserAccessToken, verifyEventMessage } from '../services/twitchauth.js';
import { handleDisabledSubscription, registerNewEventSubscription } from '../services/eventsubclient.js';
import { SlitherEventSub } from '../classes/eventsub.js';

// Direct DB queries
import { getAlertsTokenForUser, requiresLogin, setLoginRequiredValue } from '../db/queries/slitherauth.js';

const AUTH_REDIRECT_URI = new URL(`https://${sslConfig.hostName}/slither/oauth`);
const AUTH_STATES = new Set<string>();

const rawParser = bodyParser.raw({ type: 'application/json' });
const jsonParser = bodyParser.json();
const router = express.Router();

const ws = new SlitherControllerClientWebSocket();
void ws.connect(wsConfig.controllerSecret);

/**
 * POST request received from Twitch when either:
 * 		- We create an EventSub subscription to a channel point reward and have to respond
 * 		  to the callback verification challenge to enable the EventSub subscription on Twitch's end
 * 		OR
 * 		- A user redeems a channel point reward that we already have an enabled EventSub
 * 		  subscription for
 * 		OR
 * 		- An existing subscription has been revoked
 * 
 * This method must call the appropriate channel point reward
 **/
router.post('/event', rawParser, async (req, res) => {

	if(!verifyEventMessage(req)) {
		// TODO: Elevate log. Who is hitting /event if they are not Twitch?
		console.log(`Received unverified event message with request URL: ${req.url}`);
		return res.sendStatus(401);
	}

	const messageId = req.headers['twitch-eventsub-message-id']?.toString();
	if(!messageId) {
		// TODO: Elevate log. Why are we receiving requests verified as being from Twitch that do not have the required header?
		console.log(`/event request received without message id header.`);
		return res.sendStatus(400);
	}
	const recentMessages = new Set<string>();

	const messageTimestamp = req.headers['twitch-eventsub-message-timestamp'] as string;
	if(Date.parse(messageTimestamp ?? '') < Date.now() - 1000 * 60 * 10) {
		// TODO: Elevate logging for both of these cases as a security issue
		console.log(`Received Twitch message more than 10 minutes old. Investigate.`);
		return res.sendStatus(204);
	}
	if(recentMessages.has(messageId)) {
		console.log(`Received Twitch message with an id that has been seen before. Investigate.`);
		return res.sendStatus(204);
	}
	// keep recent message ids for 11 minutes to check against. After 10 minutes, any message will automatically not be processed anyway
	recentMessages.add(messageId);
	setTimeout(() => {
		recentMessages.delete(messageId);
	}, 1000 * 60 * 11);

	// Make sure body is parseable json
	try { req.body = JSON.parse(req.body); }
	catch(e) { 
		// TODO: Elevate log as Twitch has changed or added something I need to know about
		console.error('Error parsing req.body as JSON: ', e);
		res.sendStatus(204);
	}

	// We trust twitch to give us the message type as a string
	const messageType: string = req.headers['twitch-eventsub-message-type'] as string;

	if(messageType === 'webhook_callback_verification') {

		const challengeReq: WebhookCallbackChallengeRequest = req.body;
		
		// We need to register the EventSub subscription. First, respond to Twitch's auth challenge
		res.set('Content-Type', 'text/plain')
		   .set('Content-Length', `${req.body.challenge.length}`)
		   .status(200)
		   .send(challengeReq.challenge);

		// Once challenge has been sent, assume the subscription has been enabled. This is an extremely
		// simple request that we are sending back so there should be no issue
		await registerNewEventSubscription(challengeReq);

		return;
	}

	else if(messageType === 'notification') {

		// Handle event notifications based on type!
		if(SlitherEventSub.alertSubscriptionTypes.has(req.body.subscription.type)) {

		if(req.body.subscription.type !== 'channel.channel_points_custom_reward_redemption.add') {
			return res.sendStatus(204); // temporary return statement until more alert event types are supported
		}

		// respond right away with 204 No Content
		res.sendStatus(204);

		const userId = SlitherEventSub.broadcasterOf(req.body.subscription.condition, req.body.subscription.type);

		// TODO: Build alert message based on DB information!
		// send the reward redemption info to the WebSocket server
		const wsmsgobj: AlertMessage = { type: 'alert', 
										 userId: userId,
										 data: { imageFile: 'RareCharTP-Trim.gif', 
												audioFile: 'DiscordMute.mp3', 
												alertText: 'Reward Text!', 
												duration: 8000 } };
		ws.send(wsmsgobj);


		}

		return;
	}
	
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
	else if(messageType === 'revocation') {
		res.sendStatus(204);

		console.log(`Subscription revoked by Twitch! Reason: ${req.body.subscription.status}`);
		console.log(`Full message body: ${JSON.stringify(req.body)}`);

		handleDisabledSubscription(req.body.subscription as TwitchEventNotification);

		return;
	}

	else {
		res.sendStatus(204);
		console.log(`Unknown message type received from Twitch: ${req.headers[messageType]}`);

		return;
	}

});

// Serves a page that displays alerts for the user authenticated by paramToken. paramToken is a semi-public credential
// which serves no other purpose than to serve these alerts and cannot be used externally to identify the user
router.get('/alerts/:paramToken', async (req, res) => {

	const alertsJwt = await verifyAlertsConnectionToken(req.params.paramToken);

	res.render("slither/alerts", { hostName: sslConfig.hostName,
									connectionToken: alertsJwt });

});


router.get('/alerts', async (req, res) => {

	

});

// Obtain the alerts token for the given user intended for use in an OBS browser source URL. This token is semi-public data.
router.post('/alerts/token', jsonParser, async (req, res) => {

	const userId = await verifySlitherToken(req.cookies?.access_token, 'access');
	if(!userId) return res.status(401).json({error: `Invalid access token when requesting alerts token at POST /slither/alerts/token`});

	const alertsToken = await getAlertsTokenForUser(userId);
	if(!alertsToken) return res.status(500).json({error: `Could not obtain alerts token for given user at POT /slither/alerts/token`});
	
	return res.status(200).json({ alerts_token: alertsToken });

});

// TODO: Validate that the requested file has been uploaded by the same user who is making the request. Requests to 
// this endpoint should only come from the alerts.ejs view after the server sends it a secure message over the websocket.
router.get('/media/:filename', (req, res) => {

	// Allow only a-z, A-Z, 0-9, and the literals - and _ in file names. Files supported are only:
	// { .gif, .png, .jpg, .mp3, .wav, .ico }
	const ALLOWED_MEDIA_STRICT = /^[\w\-\_]+\.(?i:gif|png|jpg|mp3|wav|ico)$/;
	const fileName: string = req.params.filename;
	if(!ALLOWED_MEDIA_STRICT.test(fileName)) {
		return res.status(404).end();
	}

	res.status(200).sendFile(`/opt/slitherbot/public/media/${fileName}`, (err) => {
		if(err) {
			console.error(`Error sending media file ${fileName} in response to request at /media/:filename endpoint. Error: ${err}`);
			res.status(404).end();
		}
	});

});

// Issues a refreshed Slither access token to the user via a secure browser cookie, or if the refresh token is invalid,
// clear it from the requester's browser
router.post('/auth/refresh', jsonParser, async (req, res) => {

	const refreshToken = req.cookies?.refresh_token;
	if(!refreshToken) return res.status(401).json({error: `Refresh token not provided`});

	const userId = await verifySlitherToken(refreshToken, 'refresh');
	if(!userId) {

		res.clearCookie('refresh_token');
		return res.status(401).json({error: `Session expired`});

	}

	const accessToken = await signSlitherToken(userId, 'access');
	if(!accessToken) console.error(`undefined value detected for access token cookie being issued in /auth/refresh`);

	addSlitherTokenCookie(res, accessToken, 'access');

	return res.sendStatus(204);

});

// User has opted to authorize Slither to use their data and now we need to create a State value
// and redirect the user to Twitch's OAuth system to complete the process
router.get('/auth/twitch', (_req, res) => {

	const state = crypto.randomBytes(32).toString('hex');
	AUTH_STATES.add(state);

	setTimeout(() => {

		const stateExists = AUTH_STATES.has(state);
		if(stateExists) {
			AUTH_STATES.delete(state);
		}
		
	}, 1000 * 60 * 10); // State is valid for 10 minutes. After that, remove it from the array so it cannot be used to authenticate.

	let scopes = '';
	for(let scope of SlitherEventSub.scopes) scopes += `${encodeURIComponent(scope)}+`;
	scopes = scopes.substring(0, scopes.length-1);

	let twitchAuthParams: TwitchAuthCodeRequest = {
		client_id: twitchConfig.clientId,
		redirect_uri: AUTH_REDIRECT_URI,
		response_type: "code",
		scope: scopes,
		state: state
	};

	res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${twitchAuthParams.client_id}&redirect_uri=${twitchAuthParams.redirect_uri}&response_type=${twitchAuthParams.response_type}&scope=${twitchAuthParams.scope}&state=${twitchAuthParams.state}`);

});

// TODO: Bake this into the default route instead of having an /auth endpoint: If user logged in, redirect to home.
// 		 If user not logged in, do auth.
// Serves an auth page the asks the user to authorize Slither to access their Twitch data
router.get('/auth', async (req, res) => {

	// If this returns a userID, the user is already logged in and should not be presented the auth view
	if(await verifySlitherToken(req.cookies?.access_token, 'access')) {
		return res.redirect('/slither/home');
	}

	res.render('slither/auth');

});

// OAuth endpoint. When the user logs into Twitch and authorizes slitherbot to access their Twitch account resources
// pursuant to using the link on auth.ejs (served by /slither/home), Twitch servers will hit /slither/oauth with an auth code.
// We should use the fetch() API to send this auth code to Twitch's OAuth system after which we will receive the
// User Access Token in the body of a response. Insert or update the token into the database to allow the user
// to use this app's features. Then we rediret the user to SlitherBot's home page.
router.get('/oauth', async (req, res) => {

	if(typeof req.query['state'] !== 'string' || !AUTH_STATES.has(req.query['state'])) {
		// TODO: Elevate error as a security risk
		console.log(`Received an auth code with an invalid or already used state value: ${req.query['state']}. Rejecting request.`);
		return res.sendStatus(400);
	}
	AUTH_STATES.delete(req.query['state']);

	if(isTwitchAuthError(req.query)) {
		console.log(`OAuth Error received from Twitch: ${JSON.stringify(req.query)}`);
		res.status(302);
		res.location(`/slither/home`);
		return res.end();
	}

	if(!isTwitchAuthCode(req.query)) {
		console.log(`Received a call to GET /slither/oauth that was neither an error nor an auth code. Query: ${JSON.stringify(req.query)}`);
		return res.sendStatus(400);
	}

	// We have received an Authorization Code from Twitch that we can use to obtain a User Access Token for a user wanting to use
	// SlitherBot. We can send our response to Twitch. POST the auth code to https://id.twitch.tv/oauth2/token with query params:
	// { client_id, client_secret, code, grant_type, redirect_uri }
	const twitchTokenData = await fetchUserAccessToken(req.query.code as string);
    const obtainmentTimestamp = Date.now();

	// Immediately validate the access token to get the userID from Twitch
	const twitchUserID = await validateUserAccessToken(twitchTokenData.access_token);
	if(!twitchUserID) return res.sendStatus(500);

	// Store Twitch access tokens in the database. This function will print a log message to the console in case of a DB error.
	// Also if we already have an old user access token, be a good client and send a revocation request to Twitch
	// We have already received and validated the access tokens as part of the OAuth flow so in the event of an error, keep going.
	await registerTwitchUser(twitchTokenData, twitchUserID, obtainmentTimestamp);

	// Now register the user with Slither. If the user's twitch ID is already mapped to an alerts token, treat this as a simple login
	// and move on to issuing cookies
	if((await registerSlitherUser(twitchUserID)) === null) return res.sendStatus(500);

	// To this point, we have acquired Twitch tokens for the given user. Sign our Slither authentication tokens and issue cookies.
	const signedRefreshToken = await signSlitherToken(twitchUserID, 'refresh');
	const signedAccessToken = await signSlitherToken(twitchUserID, 'access');
	addSlitherTokenCookie(res, signedRefreshToken, 'refresh');
	addSlitherTokenCookie(res, signedAccessToken, 'access');

	// We have now sucessfully logged in the user. If we set the require_login flag in the DB, unset it now.
	await setLoginRequiredValue(twitchUserID, false);

	return res.redirect(`/slither/home`);
});

// Protected route. Redirect to /slither/auth if the browser cookies do not contain a valid authentication token.
router.get('/home', async (req, res) => {

	let navItems: { label: string, href: string }[] = [];

	let twitchId = await verifySlitherToken(req.cookies?.access_token, 'access');

	if(await requiresLogin(twitchId)) {

		res.clearCookie('access_token');
		res.clearCookie('refresh_token');
		return res.redirect(`/slither/auth`);

	}

	if(!twitchId) {
		const refreshResult = await refreshSlitherAccessToken(req.cookies?.refresh_token);
		if(!refreshResult || !refreshResult.accessToken) return res.redirect(`/slither/auth`);

		addSlitherTokenCookie(res, refreshResult.accessToken, 'access');

		twitchId = refreshResult.userId;

	}

	navItems.push({href: `/slither/logout`, label: 'Logout'});

	const alertsToken = await getAlertsTokenForUser(twitchId);
	const alertsUrl = alertsToken ? `https://${sslConfig.hostName}/slither/alerts/${alertsToken}` : '';

	res.render(`slither/home`, {
		alertsUrl: alertsUrl,
		navItems: navItems
	});
	
});

router.get('/logout', (_req, res) => {

	res.clearCookie('access_token');
	res.clearCookie('refresh_token');
	res.redirect('/slither/home');

});

// TODO: For the base route, if Slither can authenticate the user, redirect to home. Otherwise nudge them to authenticate
// with Twitch
// GET /slither simply redirects the user to /slither/home
router.get('/', (_req, res) => {

	return res.redirect(`/slither/home`);

});

// TODO: Implement test functions for eventsub testing and use the /slither/event endpoint to filter out and handle test messages.

// GET /slither/:routeName that is not already handled redirects to /slither/home instead, with a tokenType of null
router.get('/:badroute', (req, res) => {

	console.log(`Got GET request to /slither/${req.params.badroute}. Redirecting to /slither/home`);
	res.redirect(`/slither/home`);

});


export default { router };
export { router };