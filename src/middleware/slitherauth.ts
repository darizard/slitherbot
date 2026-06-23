import { RequestHandler } from "express";
import slitherauth from '../services/slitherauth.js';
import slitherauthsql from '../db/queries/slitherauth.js';
import { SlitherAuthenticatedRequest } from '../types/authtypes.js';

export const authenticateSlitherUser: RequestHandler = async (req: SlitherAuthenticatedRequest, res, next) => {

    let twitchId = await slitherauth.verifySlitherToken(req.cookies['access_token'], 'access');

	if(await slitherauthsql.requiresLogin(twitchId)) {

		res.clearCookie('access_token');
		res.clearCookie('refresh_token');
		return res.redirect(`/slither/auth`);

	}

	if(!twitchId) {
		const refreshResult = await slitherauth.refreshSlitherAccessToken(req.cookies['refresh_token']);
		if(!refreshResult || !refreshResult.accessToken) return res.redirect(`/slither/auth`);

		slitherauth.addSlitherTokenCookie(res, refreshResult.accessToken, 'access');

		twitchId = refreshResult.userId;

	}

    req.twitchId = twitchId;
    next();

}