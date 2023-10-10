/**
 * Setup express server.
 */

import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'path';
import helmet from 'helmet';
import express, { Request, Response, NextFunction } from 'express';
import logger from 'jet-logger';

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

// **** Variables **** //

const app = express();


// **** Setup **** //

// Basic middleware
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

//setup cors
const corsOptions = {
  origin: ['http://localhost:3000', 'https://nybagelsclub.com', 'https://www.nybagelsclub.com'],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: 'Content-Type,Authorization,Cart-Token',
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
mongoose.connect(process.env.DATABASE_URL).then(()=>{
  console.log('Successfully connected to the mongodb database.')
});

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
