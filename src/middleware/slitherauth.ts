import { RequestHandler } from "express";
import { requiresLogin } from "../db/queries/slitherauth.js";
import { verifySlitherToken, refreshSlitherAccessToken, addSlitherTokenCookie } from "../services/slitherauth.js";
import { SlitherAuthenticatedRequest } from '../types/authtypes.js';

export const authenticateSlitherUser: RequestHandler = async (req: SlitherAuthenticatedRequest, res, next) => {

    let twitchId = await verifySlitherToken(req.cookies['access_token'], 'access');

	if(await requiresLogin(twitchId)) {

		res.clearCookie('access_token');
		res.clearCookie('refresh_token');
		return res.redirect(`/slither/auth`);

	}

	if(!twitchId) {
		const refreshResult = await refreshSlitherAccessToken(req.cookies['refresh_token']);
		if(!refreshResult || !refreshResult.accessToken) return res.redirect(`/slither/auth`);

		addSlitherTokenCookie(res, refreshResult.accessToken, 'access');

		twitchId = refreshResult.userId;

	}

    req.twitchId = twitchId;
    next();

}