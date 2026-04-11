import { RequestHandler } from 'express';

export const authenticate: RequestHandler = async (req, res, next) => {



    next();

}