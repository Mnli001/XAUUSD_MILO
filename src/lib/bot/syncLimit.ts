import { memoryLimiter } from "../rateLimit";

/**
 * How often one robot (one token) may report: about two requests a second, with a short burst of four so a robot
 * catching up after a hiccup is not refused. Past it the sync route answers 429 with Retry-After; the robot retries.
 */
export const ROBOT_REQUESTS_PER_SECOND = 2;
export const ROBOT_BURST = 4;
export const robotLimiter = memoryLimiter({ perSecond: ROBOT_REQUESTS_PER_SECOND, burst: ROBOT_BURST });
