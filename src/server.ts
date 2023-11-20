/**
 * Setup express server.
 */

import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'path';
import helmet from 'helmet';
import express, { Request, Response, NextFunction } from 'express';
import logger from 'jet-logger';
import bodyParser from 'body-parser';
import 'express-async-errors';

//setup enviornment variables
import dotenv from 'dotenv';
dotenv.config();

import EnvVars from '@src/constants/EnvVars';
import HttpStatusCodes from '@src/constants/HttpStatusCodes';

import { NodeEnvs } from '@src/constants/misc';
import { RouteError } from '@src/other/classes';
import apiRouter from '@src/routes/api';
import cors from 'cors';
import nodemailer from 'nodemailer';
import { isTestingModeEnabled } from './config/config';

// **** Variables **** //

export const app = express();


// **** Setup **** //

// Basic middleware
app.use(
  bodyParser.json({
      verify: function(req:any, res, buf) {
          req.rawBody = buf; //assign the rawBody so it can be used in stripe webhooks
      }
  })
);
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(cookieParser(EnvVars.CookieProps.Secret));

// Show routes called in console during development
if (EnvVars.NodeEnv === NodeEnvs.Dev.valueOf()) {
  app.use(morgan('dev'));
}

// Security
if (EnvVars.NodeEnv === NodeEnvs.Production.valueOf()) {
  app.use(helmet());
}

// Setup CORS, api security
const corsOptions = {
  origin: ['http://localhost:3000', 'https://nybagelsclub.com', 'https://www.nybagelsclub.com'], // Allowed client connections
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'], // Allowed methods
  allowedHeaders: ['Content-Type', 'Authorization', 'Cart-Token'], // Allowed headers
};

app.use(cors(corsOptions));

// Create and configure the transporter
export const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: 'noreply@nybagelsclub.com', // Google Workspace email address
    pass: process.env.NO_REPLY_EMAIL_PASSWORD, // email password from dotenv, app specific password needs 2fa enabled on account
  },
});

//setup mongoose, connecting to the database url in .env
const mongoose = require('mongoose');
// Check if testing mode is enabled
if (!isTestingModeEnabled) {
  // Connection is not open, so connect to the production database
  mongoose.connect(process.env.DATABASE_URL).then(() => {
    console.log('Successfully connected to the MongoDB production database.');
  });
} else {
  // Connection is already open (connected to testing database)
  console.log("Error: Can't connect to production because testing mode flag is enabled!");
};

// Add APIs, must be after middleware
app.use('/api',apiRouter);

// Add error handler
app.use((
  err: Error,
  _: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
) => {
  if (EnvVars.NodeEnv !== NodeEnvs.Test.valueOf()) {
    logger.err(err, true);
  }
  let status = HttpStatusCodes.BAD_REQUEST;
  if (err instanceof RouteError) {
    status = err.status;
  }
  return res.status(status).json({ error: err.message });
});


// ** Front-End Content ** //

// Set static directory (js and css).
const staticDir = path.join(__dirname, 'public');
app.use(express.static(staticDir));

// **** Export default **** //

export default app;
