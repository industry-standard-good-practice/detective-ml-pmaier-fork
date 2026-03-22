import { http } from '@google-cloud/functions-framework';
import { app } from './index.js';

// Register the Express app as the Cloud Function HTTP handler.
// Deploy with --entry-point=api
http('api', app);
