/**
 * Chat Routes - Chat and streaming endpoints
 */
import { type Request, type Response } from "express";
declare const router: import("express-serve-static-core").Router;
declare function authenticate(req: Request, res: Response, next: Function): Response<any, Record<string, any>> | undefined;
export { authenticate };
export default router;
//# sourceMappingURL=chat.d.ts.map