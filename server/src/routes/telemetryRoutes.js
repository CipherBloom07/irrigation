import { Router } from 'express';
import { getTelemetry } from '../controllers/telemetryController.js';

const router = Router();

router.get('/', getTelemetry);

export default router;